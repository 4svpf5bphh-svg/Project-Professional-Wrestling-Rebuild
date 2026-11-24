
import {withSqlClient} from "./postgres.js";
import type {TransactionPool} from "./transaction.js";
import {requestGroqEditorial} from "./groq-ai-director.js";
import {estimatedGroqTokens} from "../domain/ai-director.js";
import {weeklyEditorialAnchors,weeklyEditorialMessages,validateWeeklyEditorial,type WeeklyStory} from "../domain/weekly-world-editorial.js";
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
 let calls=0,state="FAILED",copy:Record<string,unknown>={};
 try{
  const rows=await withSqlClient(pool,db=>db.query<StoryRow>(`
   SELECT story_key,desk,certainty,promotion_id,promotion_name,title,summary,source_kind
   FROM ppw_world_news_items WHERE world_id=$1 AND year=$2 AND week=$3
   ORDER BY CASE WHEN story_key LIKE 'broadcast:%' THEN 0
    WHEN source_kind IN ('TITLE','EVENT') THEN 1 ELSE 2 END,desk,story_key LIMIT 40`,params));
  const stories:WeeklyStory[]=rows.map(s=>({id:s.story_key,year,week,desk:s.desk,certainty:s.certainty,
   promotionId:s.promotion_id,promotionName:s.promotion_name,title:s.title,summary:s.summary,sourceKind:s.source_kind}));
  const anchors=weeklyEditorialAnchors(stories);
  if(!anchors.length)state="EMPTY";
  else{
   const body={model:"openai/gpt-oss-20b",temperature:0.7,reasoning_effort:"low",reasoning_format:"hidden",
    max_completion_tokens:1300,response_format:{type:"json_object"},messages:weeklyEditorialMessages(anchors)};
   // Hard request envelope below the observed 8k TPM, including reasoning/completion reserve.
   if(estimatedGroqTokens(JSON.stringify(body),body.max_completion_tokens)>4200)throw Error("Weekly editorial envelope too large");
   const response=await requestGroqEditorial({task:"SHORT_NEWS",key,pool,body,signal:AbortSignal.timeout(16000),
    pace:true,transport:async(url,init)=>{calls++;return transport(url,init);}});
   if(response.ok){
    const raw=await response.text();
    if(raw.length<=16000){
     const reply=JSON.parse(raw)?.choices?.[0];
     if(reply?.finish_reason!=="length"&&typeof reply?.message?.content==="string"&&reply.message.content.length<=6500)
      copy=validateWeeklyEditorial(anchors,JSON.parse(reply.message.content));
    }
    if(Object.keys(copy).length)state="READY";
   }
  }
 }catch{/* Certified simulation and deterministic news remain available; no automatic retry. */}
 await withSqlClient(pool,db=>db.query(`
  UPDATE ppw_weekly_world_editorial SET state=$4,copy_json=$5::jsonb,provider_calls=$6,completed_at=clock_timestamp()
  WHERE world_id=$1 AND year=$2 AND week=$3 AND state='PENDING'`,
  [...params,state,state==="READY"?JSON.stringify(copy):null,calls]));
 return {state,providerCalls:calls,accepted:Object.keys(copy).length};
}
