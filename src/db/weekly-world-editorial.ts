
import {withSqlClient} from "./postgres.js";
import type {TransactionPool} from "./transaction.js";
import {requestGroqEditorial} from "./groq-ai-director.js";
import {estimatedGroqTokens,groqResponseUsage} from "../domain/ai-director.js";
import {weeklyEditorialAnchors,weeklyEditorialMessages,validateWeeklyEditorial,weeklyRatingsStory,type WeeklyStory,type WeeklyStoryCopy} from "../domain/weekly-world-editorial.js";
import type {VerifiedHotTagAward} from "../domain/hot-tag-wrestler-voice.js";
type Scope={worldId:string;year:number;week:number};
type StoryRow={story_key:string;desk:"OFFICIAL"|"DIRT";certainty:"CONFIRMED"|"SPECULATION";promotion_id:string;promotion_name:string;title:string;summary:string;source_kind:string};
export async function publishWeeklyWorldEditorial(pool:TransactionPool,scope:Scope,key:string,transport:typeof fetch=fetch){
 const {worldId,year,week}=scope,params=[worldId,year,week];
 if(!worldId||worldId.length>200||!Number.isSafeInteger(year)||year<1||!Number.isSafeInteger(week)||week<1||week>52||!key)
  throw Error("Invalid weekly public editorial scope");
 // One durable claim per completed edition, including dark weeks and AI-only shows.
 const claims=await withSqlClient(pool,db=>db.query<{world_id:string}>(`
  INSERT INTO ppw_weekly_world_editorial(world_id,year,week,state)
  SELECT n.world_id,n.year,n.week,'PENDING' FROM ppw_world_news_weeks n
  JOIN ppw_worlds w ON w.world_id=n.world_id AND (w.year,w.week)>(n.year,n.week)
  WHERE n.world_id=$1 AND n.year=$2 AND n.week=$3
  ON CONFLICT DO NOTHING RETURNING world_id`,params));
 if(claims.length!==1)return {state:"SKIPPED",providerCalls:0,accepted:0};
 let calls=0,state="FAILED",diagnostic="ERROR",estimate=0,inputTokens=0,outputTokens=0,copy:Record<string,WeeklyStoryCopy>={};
 let ratingStory:WeeklyStory|null=null;
 try{
  const previous=week===1?{year:year-1,week:52}:{year,week:week-1};
  const [rows,awards,ratings,history]=await withSqlClient(pool,async db=>Promise.all([
   db.query<StoryRow>(`
   SELECT story_key,desk,certainty,promotion_id,promotion_name,title,summary,source_kind
   FROM ppw_world_news_items WHERE world_id=$1 AND year=$2 AND week=$3
   ORDER BY CASE WHEN story_key LIKE 'broadcast:%' THEN 0
    WHEN source_kind IN ('TITLE','EVENT') THEN 1 ELSE 2 END,desk,story_key LIMIT 40`,params),
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
   previous.year<1?Promise.resolve([]):db.query<{promotion_id:string;title:string}>(`
    SELECT promotion_id,title FROM ppw_world_news_items WHERE world_id=$1 AND year=$2 AND week=$3
     AND desk='OFFICIAL' AND certainty='CONFIRMED'
    ORDER BY story_key LIMIT 12`,[worldId,previous.year,previous.week])
  ]));
  const stories:WeeklyStory[]=rows.map(s=>({id:s.story_key,year,week,desk:s.desk,certainty:s.certainty,
   promotionId:s.promotion_id,promotionName:s.promotion_name,title:s.title,summary:s.summary,sourceKind:s.source_kind}));
  const publicAwards:VerifiedHotTagAward[]=awards.map(a=>({year,week,kind:a.kind,promotionId:a.promotion_id,
   showId:a.show_id,slotId:a.slot_id,personIds:a.person_ids,peopleNames:a.people_names}));
  ratingStory=weeklyRatingsStory(year,week,ratings.map(r=>({promotionId:r.promotion_id,promotionName:r.promotion_name,rating:r.rating,humanManaged:r.human_managed})));
  const anchors=weeklyEditorialAnchors(ratingStory?[ratingStory,...stories]:stories,publicAwards,
   history.map(h=>({year:previous.year,week:previous.week,promotionId:h.promotion_id,title:h.title})));
  if(!anchors.length){state="EMPTY";diagnostic="NO_PUBLIC_STORIES";}
  else{
   const body={model:"openai/gpt-oss-20b",temperature:0.7,reasoning_effort:"low",reasoning_format:"hidden",
    max_completion_tokens:1600,response_format:{type:"json_object"},messages:weeklyEditorialMessages(anchors)};
   // Hard request envelope below the observed 8k TPM, including reasoning/completion reserve.
   estimate=estimatedGroqTokens(JSON.stringify(body),body.max_completion_tokens);
   if(estimate>4200){diagnostic="TOKEN_ENVELOPE";throw Error("Weekly editorial envelope too large");}
   const response=await requestGroqEditorial({task:"SHORT_NEWS",key,pool,body,signal:AbortSignal.timeout(16000),
    pace:true,transport:async(url,init)=>{calls++;return transport(url,init);}});
   diagnostic=response.headers.get("x-ppw-paced")==="true"?"PACING":
    response.headers.get("x-ppw-budget-exhausted")==="true"?"BUDGET":
    response.status===429?"RATE_LIMITED":response.ok?"INVALID_RESPONSE":"HTTP_REJECTED";
   if(response.ok){
    const raw=await response.text();
    if(raw.length<=16000){
     const envelope=JSON.parse(raw);
     const usage=groqResponseUsage(envelope);
     inputTokens=usage?.inputTokens??0;outputTokens=usage?.outputTokens??0;
     const reply=envelope?.choices?.[0];
     if(reply?.finish_reason!=="length"&&typeof reply?.message?.content==="string"&&reply.message.content.length<=6500)
      copy=validateWeeklyEditorial(anchors,JSON.parse(reply.message.content));
    }
    if(Object.keys(copy).length){
     state="READY";
     diagnostic=anchors.every(a=>{
      const c=copy[a.story.id];
      return c?.headline&&c.commentary&&c.fans&&(!a.wrestler||c.wrestler);
     })?"ACCEPTED":"PARTIAL";
    }else if(diagnostic==="INVALID_RESPONSE")diagnostic="NO_VALID_CONTENT";
   }
  }
 }catch(error){
  if(error instanceof Error&&["AbortError","TimeoutError"].includes(error.name))diagnostic="TIMEOUT";
  /* Certified simulation and deterministic news remain available; no automatic retry. */
 }
 await withSqlClient(pool,db=>db.query(`
  UPDATE ppw_weekly_world_editorial SET state=$4,copy_json=$5::jsonb,provider_calls=$6,
   diagnostic=$7,estimated_tokens=$8,input_tokens=$9,output_tokens=$10,rating_story=$11::jsonb,completed_at=clock_timestamp()
  WHERE world_id=$1 AND year=$2 AND week=$3 AND state='PENDING'`,
  [...params,state,state==="READY"?JSON.stringify(copy):null,calls,diagnostic,estimate,inputTokens,outputTokens,ratingStory?JSON.stringify(ratingStory):null]));
 return {state,providerCalls:calls,accepted:Object.keys(copy).length};
}


/** Owner-only AI Lab metadata. No rejected prose, private drafts or new provider calls. */
export async function readWeeklyWorldEditorialRuns(pool:TransactionPool,worldId:string){
 return withSqlClient(pool,db=>db.query<{year:number;week:number;state:string;diagnostic:string;
  provider_calls:number;estimated_tokens:number;input_tokens:number;output_tokens:number;
  accepted_stories:number;fan_threads:number;editorials:number;wrestler_posts:number}>(`
  SELECT b.year,b.week,b.state,b.diagnostic,b.provider_calls,b.estimated_tokens,b.input_tokens,b.output_tokens,
   (SELECT count(*)::integer FROM jsonb_each(b.copy_json)) AS accepted_stories,
   (SELECT count(*)::integer FROM jsonb_each(b.copy_json) e WHERE e.value ? 'fans') AS fan_threads,
   (SELECT count(*)::integer FROM jsonb_each(b.copy_json) e WHERE e.value ? 'commentary') AS editorials,
   (SELECT count(*)::integer FROM jsonb_each(b.copy_json) e WHERE e.value ? 'wrestler') AS wrestler_posts
  FROM ppw_weekly_world_editorial b WHERE b.world_id=$1 ORDER BY b.year DESC,b.week DESC LIMIT 8`,[worldId]));
}
