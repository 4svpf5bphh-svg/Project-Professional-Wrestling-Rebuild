
import {withSqlClient} from "./postgres.js";
import {EditorialClaimLost,type EditorialDispatchFence} from "./editorial-dispatch-fence.js";
import type {TransactionPool} from "./transaction.js";
import {requestGroqEditorial} from "./groq-ai-director.js";
import {requestOpenAiEditorialPreview} from "./openai-editorial-preview.js";
import {estimatedGroqTokens,groqResponseUsage} from "../domain/ai-director.js";
import {weeklyEditorialAnchors,weeklyEditorialMessages,weeklyEditorialResponseFormat,validateWeeklyEditorialDetailed,weeklyRatingsStory,type WeeklyStory,type WeeklyStoryCopy} from "../domain/weekly-world-editorial.js";
import {estimateTerraStandardUsd} from "../domain/paid-editorial-cost.js";
import {weeklyNewsPrioritySql} from "./weekly-news-priority.js";
import type {VerifiedHotTagAward} from "../domain/hot-tag-wrestler-voice.js";
type WeeklyInspection={
 model:string;promptBytes:number;instructions:string;context:unknown;
};
export function serializeWeeklyInspection(value:unknown):string|null{
 // PostgreSQL adds spaces between JSONB members. Indented JSON is a
 // conservative upper bound for the same public snapshot.
 if(value==null||Buffer.byteLength(JSON.stringify(value,null,1))>12000)return null;
 return JSON.stringify(value);
}
type Scope={worldId:string;year:number;week:number};
type StoryRow={story_key:string;desk:"OFFICIAL"|"DIRT";certainty:"CONFIRMED"|"SPECULATION";promotion_id:string;promotion_name:string;title:string;summary:string;source_kind:string;show_id:string|null;show_name:string|null;priority:number};
export async function publishWeeklyWorldEditorial(pool:TransactionPool,scope:Scope,key:string,transport:typeof fetch=fetch,terraKey?:string,updateToken?:string){
 const {worldId,year,week}=scope,params=[worldId,year,week];
 if(!worldId||worldId.length>200||!Number.isSafeInteger(year)||year<1||!Number.isSafeInteger(week)||week<1||week>52||(!key&&!terraKey))
  throw Error("Invalid weekly public editorial scope");
 // One durable claim per completed edition, including dark weeks and AI-only shows.
 const claims=await withSqlClient(pool,db=>db.query<{world_id:string}>(`
  INSERT INTO ppw_weekly_world_editorial(world_id,year,week,state)
  SELECT n.world_id,n.year,n.week,'PENDING' FROM ppw_world_news_weeks n
  JOIN ppw_worlds w ON w.world_id=n.world_id AND (w.year,w.week)>(n.year,n.week)
  WHERE n.world_id=$1 AND n.year=$2 AND n.week=$3
   AND ($4::text IS NULL OR EXISTS(
    SELECT 1 FROM ppw_world_update_runs r WHERE r.world_id=$1 AND r.year=$2 AND r.week=$3
     AND r.state='ACTIVE' AND r.public_state='PROCESSING' AND r.public_claim_token=$4 FOR UPDATE))
  ON CONFLICT DO NOTHING RETURNING world_id`,[...params,updateToken??null]));
 if(claims.length!==1)return {state:"SKIPPED",providerCalls:0,accepted:0};
 const fence:EditorialDispatchFence|undefined=updateToken?async(db,lock)=>{
  const active=await db.query(`
   SELECT 1 FROM ppw_world_update_runs r JOIN ppw_weekly_world_editorial e USING(world_id,year,week)
   WHERE r.world_id=$1 AND r.year=$2 AND r.week=$3 AND r.state='ACTIVE'
    AND r.public_state='PROCESSING' AND r.public_claim_token=$4
    AND r.public_claim_until>clock_timestamp() AND e.state='PENDING'
   ${lock?"FOR UPDATE OF r":""}`,[...params,updateToken]);
  return active.length===1;
 }:undefined;
 let provider="GROQ",calls=0,state="FAILED",diagnostic="ERROR",estimate=0,inputTokens=0,outputTokens=0,copy:Record<string,WeeklyStoryCopy>={};
 let inspection:WeeklyInspection|null=null;
 let ratingStory:WeeklyStory|null=null;
 try{
  const index=(year-1)*52+week-1;
  const cutoff=Math.max(0,index-3);
  const earliest={year:Math.floor(cutoff/52)+1,week:cutoff%52+1};
  const [rows,awards,ratings,history]=await withSqlClient(pool,async db=>Promise.all([
   db.query<StoryRow>(`
   WITH ranked AS (
    SELECT i.story_key,i.desk,i.certainty,i.promotion_id,i.promotion_name,i.title,i.summary,i.source_kind,i.show_id,d.show_name,
     (${weeklyNewsPrioritySql}) AS priority
    FROM ppw_world_news_items i
    LEFT JOIN ppw_booking_drafts d ON d.world_id=i.world_id AND d.draft_id=i.show_id
     AND d.promotion_id=i.promotion_id AND d.status='SUBMITTED'
    WHERE i.world_id=$1 AND i.year=$2 AND i.week=$3
   )
   (SELECT * FROM ranked WHERE desk='OFFICIAL' AND certainty='CONFIRMED'
    ORDER BY priority DESC,story_key COLLATE "C" LIMIT 40)
   UNION ALL
   (SELECT * FROM ranked WHERE desk='DIRT' AND certainty='SPECULATION'
    ORDER BY priority DESC,story_key COLLATE "C" LIMIT 8)`,params),
   db.query<{kind:"MATCH"|"ANGLE";promotion_id:string;show_id:string;slot_id:string;person_ids:string[];people_names:string[]}>(`
    SELECT kind,promotion_id,show_id,slot_id,person_ids,people_names
    FROM ppw_world_news_awards WHERE world_id=$1 AND year=$2 AND week=$3 ORDER BY kind LIMIT 2`,params),
   db.query<{promotion_id:string;promotion_name:string;rating:number;human_managed:boolean}>(`
    SELECT latest.*,EXISTS(SELECT 1 FROM ppw_promotion_controls p
     WHERE p.world_id=$1 AND p.promotion_id=latest.promotion_id AND p.active) AS human_managed
    FROM (SELECT DISTINCT ON(e.promotion_id) e.promotion_id,p.name AS promotion_name,
      e.tv_household_rating::double precision AS rating
     FROM ppw_show_economics e
     JOIN ppw_completed_shows c ON c.world_id=e.world_id AND c.show_id=e.show_id AND c.promotion_id=e.promotion_id
      AND c.year=e.year AND c.week=e.week
     JOIN ppw_booking_drafts d ON d.world_id=e.world_id AND d.draft_id=e.show_id AND d.promotion_id=e.promotion_id
      AND d.status='SUBMITTED' AND d.booking_class='REGULAR'
     JOIN ppw_promotions p ON p.world_id=e.world_id AND p.promotion_id=e.promotion_id
     WHERE e.world_id=$1 AND e.year=$2 AND e.week=$3 AND e.audience_format='TV' AND e.tv_household_rating IS NOT NULL
     ORDER BY e.promotion_id,e.tv_household_rating DESC,e.show_id LIMIT 40) latest
    ORDER BY human_managed DESC,rating DESC,promotion_id LIMIT 3`,params),
   index===0?Promise.resolve([]):db.query<{year:number;week:number;promotion_id:string;title:string;fans:unknown;desk:string}>(`
    SELECT n.year,n.week,n.promotion_id,n.title,n.desk,b.copy_json->n.story_key->'fans' AS fans
    FROM ppw_world_news_items n LEFT JOIN ppw_weekly_world_editorial b
     ON b.world_id=n.world_id AND b.year=n.year AND b.week=n.week AND b.state='READY'
    WHERE n.world_id=$1 AND (n.year,n.week)>=($2::integer,$3::integer)
     AND (n.year,n.week)<($4::integer,$5::integer)
    ORDER BY (b.copy_json->n.story_key->'fans' IS NOT NULL) DESC,n.year DESC,n.week DESC,n.desk,n.story_key
    LIMIT 18`,[worldId,earliest.year,earliest.week,year,week])
  ]));
  const stories:WeeklyStory[]=rows.map(s=>({id:s.story_key,year,week,desk:s.desk,certainty:s.certainty,
   promotionId:s.promotion_id,promotionName:s.promotion_name,title:s.title,summary:s.summary,sourceKind:s.source_kind,priority:s.priority,showId:s.show_id??undefined,showName:s.show_name}));
  const publicAwards:VerifiedHotTagAward[]=awards.map(a=>({year,week,kind:a.kind,promotionId:a.promotion_id,
   showId:a.show_id,slotId:a.slot_id,personIds:a.person_ids,peopleNames:a.people_names}));
  ratingStory=weeklyRatingsStory(year,week,ratings.map(r=>({promotionId:r.promotion_id,promotionName:r.promotion_name,rating:r.rating,humanManaged:r.human_managed})));
  let anchors=weeklyEditorialAnchors(ratingStory?[ratingStory,...stories]:stories,publicAwards,
   history.filter(h=>h.desk==="OFFICIAL").map(h=>({year:h.year,week:h.week,promotionId:h.promotion_id,title:h.title})),
   history.flatMap(h=>Array.isArray(h.fans)?h.fans.filter((v):v is string=>typeof v==="string"):[]));
  if(!anchors.length){state="EMPTY";diagnostic="NO_PUBLIC_STORIES";}
  else{
   const build=()=>({model:"openai/gpt-oss-20b",temperature:0.7,reasoning_effort:"low",
    max_completion_tokens:anchors.length===1?1600:2200,
    response_format:weeklyEditorialResponseFormat(anchors),messages:weeklyEditorialMessages(anchors)});
   let body=build();
   estimate=estimatedGroqTokens(JSON.stringify(body),body.max_completion_tokens);
   // Pack the largest safe edition into ONE free call. Never split into a
   // second immediately rate-limited request or extend the World lock.
   if(estimate>7000&&anchors[0]?.recentFanCopy?.length){
    anchors=anchors.map(a=>({...a,recentFanCopy:a.recentFanCopy?.slice(0,4)}));
    body=build();estimate=estimatedGroqTokens(JSON.stringify(body),body.max_completion_tokens);
   }
   while(anchors.length>1&&estimate>7000){
    const drop=anchors.map((a,i)=>({a,i})).filter(x=>x.i>0&&x.a.story.desk==="OFFICIAL").at(-1)?.i??anchors.length-1;
    anchors=anchors.filter((_,i)=>i!==drop);body=build();
    estimate=estimatedGroqTokens(JSON.stringify(body),body.max_completion_tokens);
   }
   if(estimate>7000){diagnostic="TOKEN_ENVELOPE";throw Error("Weekly editorial envelope too large");}
   const measured:typeof fetch=async(url,init)=>{
    calls++;
    const sent=String(init?.body??"");
    const payload=JSON.parse(sent);
    // Capture only the editorial instructions and allowlisted public records.
    // Headers, response drafts and provider credentials never enter this row.
    inspection={model:payload.model,promptBytes:Buffer.byteLength(sent),
     instructions:body.messages[0]!.content,context:JSON.parse(body.messages[1]!.content)};
    return transport(url,init);
   };
   let response:Response|null=null;
   if(key)try{response=await requestGroqEditorial({task:"SHORT_NEWS",key,pool,body,signal:AbortSignal.timeout(25000),
    pace:true,transport:measured,fence});}catch(error){
    if(error instanceof EditorialClaimLost||calls||!terraKey)throw error;
   }
   // Keep the existing one-dispatch guarantee: Terra can support the public
   // desk only if Groq was not actually called. Both use existing budgets.
   if(!calls&&terraKey&&(!response||!response.ok)){
    // Dirt enhancement uses Groq's existing allowance. A paced or
    // unavailable Groq dispatch must not expand the shared Terra workload.
    if(anchors.some(anchor=>anchor.story.desk==="DIRT")){
     anchors=anchors.filter(anchor=>anchor.story.desk==="OFFICIAL");
     body=build();
     estimate=estimatedGroqTokens(JSON.stringify(body),body.max_completion_tokens);
    }
    provider="TERRA";
    response=await requestOpenAiEditorialPreview({key:terraKey,enabled:true,pool,body,
     signal:AbortSignal.timeout(25000),transport:measured,feature:"WEEKLY_MEDIA",fence});
   }
   if(!response)throw Error("No public editorial provider available");
   diagnostic=response.headers.get("x-ppw-paced")==="true"?"PACING":
    response.headers.get("x-ppw-budget-exhausted")==="true"?"BUDGET":
    response.status===429?"RATE_LIMITED":response.ok?"INVALID_RESPONSE":"HTTP_REJECTED";
   if(response.ok){
    let rejectionSummary="",truncated=false;
    const raw=await response.text();
    if(raw.length<=32000){
     try{
      const envelope=JSON.parse(raw);
      const usage=groqResponseUsage(envelope);
      inputTokens=usage?.inputTokens??0;outputTokens=usage?.outputTokens??0;
      const reply=envelope?.choices?.[0];
      truncated=reply?.finish_reason==="length";
      if(typeof reply?.message?.content==="string"&&reply.message.content.length<=16000){
       const decoded=JSON.parse(reply.message.content.trim().replace(/^\s*```(?:json)?\s*|\s*```\s*$/gi,""));
       const validated=validateWeeklyEditorialDetailed(anchors,decoded);
       copy=validated.copy;
       rejectionSummary=Object.entries({...validated.issues,...validated.fields}).sort(([a],[b])=>a.localeCompare(b))
        .map(([reason,n])=>reason+":"+n).join(",").slice(0,350);
      }else diagnostic="MISSING_CONTENT";
     }catch{diagnostic=truncated?"TRUNCATED":"INVALID_JSON";}
    }
    if(Object.keys(copy).length){
     state="READY";
     diagnostic=anchors.every(a=>{
      const c=copy[a.story.id];
      return c?.headline&&c.commentary&&c.fans?.length===(a.key==="s0"?5:3)&&c.fans.every(Boolean)&&(!a.wrestler||c.wrestler);
     })?"ACCEPTED":"PARTIAL";
    }else if(diagnostic==="INVALID_RESPONSE")diagnostic="NO_VALID_CONTENT";
    if(rejectionSummary)diagnostic+=" / "+rejectionSummary;
   }
  }
 }catch(error){
  if(error instanceof EditorialClaimLost)return {state:"SKIPPED",providerCalls:calls,accepted:0};
  if(error instanceof Error&&["AbortError","TimeoutError"].includes(error.name))diagnostic="TIMEOUT";
  /* Certified simulation and deterministic news remain available; no automatic retry. */
 }
 const saved=await withSqlClient(pool,db=>db.query(`
  UPDATE ppw_weekly_world_editorial SET state=$4,copy_json=$5::jsonb,provider_calls=$6,
   diagnostic=$7,estimated_tokens=$8,input_tokens=$9,output_tokens=$10,rating_story=$11::jsonb,inspection_json=CASE WHEN octet_length(($12::jsonb)::text)<=12000 THEN $12::jsonb END,completed_at=clock_timestamp()
  WHERE world_id=$1 AND year=$2 AND week=$3 AND state='PENDING' RETURNING state`,
  [...params,state,state==="READY"?JSON.stringify(copy):null,calls,provider==="TERRA"?"TERRA / "+diagnostic:diagnostic,estimate,inputTokens,outputTokens,ratingStory?JSON.stringify(ratingStory):null,serializeWeeklyInspection(inspection)]));
 return saved.length?{state,providerCalls:calls,accepted:Object.keys(copy).length}:
  {state:"SKIPPED",providerCalls:calls,accepted:0};
}


/** Owner-only AI Lab metadata. No rejected prose, private drafts or new provider calls. */
export async function readWeeklyWorldEditorialRuns(pool:TransactionPool,worldId:string){
 const rows=await withSqlClient(pool,db=>db.query<{year:number;week:number;state:string;diagnostic:string;
  provider_calls:number;estimated_tokens:number;input_tokens:number;output_tokens:number;
  accepted_stories:number;fan_threads:number;editorials:number;wrestler_posts:number;
  inspection:WeeklyInspection|null;accepted:Record<string,WeeklyStoryCopy>|null}>(`
  WITH recent AS (
   SELECT world_id,year,week,state,diagnostic,provider_calls,estimated_tokens,input_tokens,output_tokens,
    inspection_json,copy_json
   FROM ppw_weekly_world_editorial WHERE world_id=$1 ORDER BY year DESC,week DESC LIMIT 8
  )
  SELECT b.year,b.week,b.state,b.diagnostic,b.provider_calls,b.estimated_tokens,b.input_tokens,b.output_tokens,
   CASE WHEN (b.year,b.week)=(latest.year,latest.week) THEN b.inspection_json END AS inspection,
   CASE WHEN (b.year,b.week)=(latest.year,latest.week) THEN b.copy_json END AS accepted,
   (SELECT count(*)::integer FROM jsonb_each(b.copy_json)) AS accepted_stories,
   (SELECT count(*)::integer FROM jsonb_each(b.copy_json) e WHERE e.value ? 'fans') AS fan_threads,
   (SELECT count(*)::integer FROM jsonb_each(b.copy_json) e WHERE e.value ? 'commentary') AS editorials,
   (SELECT count(*)::integer FROM jsonb_each(b.copy_json) e WHERE e.value ? 'wrestler') AS wrestler_posts
  FROM recent b LEFT JOIN (
   SELECT year,week FROM recent
   WHERE inspection_json IS NOT NULL ORDER BY year DESC,week DESC LIMIT 1
  ) latest ON true
  WHERE b.world_id=$1 ORDER BY b.year DESC,b.week DESC LIMIT 8`,[worldId]));
 return rows.map(row=>({...row,estimatedTerraUsd:row.diagnostic.startsWith("TERRA / ")&&
  row.input_tokens+row.output_tokens>0?estimateTerraStandardUsd(row.input_tokens,row.output_tokens):null}));
}
