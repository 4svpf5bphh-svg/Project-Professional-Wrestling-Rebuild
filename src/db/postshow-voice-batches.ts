/** A single 20B request per completed human show, triggered only AFTER a
 * trusted, explicit World publication. No call in a transaction, GET, cron or
 * results page. One claim per immutable receipt; fallback is always free.
 */
import {withSqlClient} from "./postgres.js";
import {requestGroqEditorial} from "./groq-ai-director.js";
import {readCompletedShowView,type CompletedShowView} from "./show-results-view.js";
import {postShowVoiceBrief,postShowVoicePrompt,validatePostShowVoiceCopy}
 from "../domain/postshow-voice-batch.js";
import type {TransactionPool} from "./transaction.js";

const MODEL="openai/gpt-oss-20b" as const;
type Scope={worldId:string;year:number;week:number};
type Published={promotion_id:string;show_id:string;player_id:string;receipt_digest:string};
export function postShowVoiceEnabled(env:Record<string,string|undefined>,worldId:string):boolean{
 // Deliberately opt-in. A branch-specific AI Lab preview must not enable the
 // post-publication route, even if it has a Groq key and cloned World.
 return !!worldId&&env.PPW_POSTSHOW_AI_ENABLED==="YES"&&
  (env.VERCEL_ENV==="preview"||env.VERCEL_ENV==="production")&&
  env.VERCEL_GIT_COMMIT_REF==="main"&&
  env.PPW_MAIN_WORLD_APPROVED==="YES"&&
  env.PPW_MAIN_WORLD_ID===worldId&&
  !!env.GROQ_API_KEY;
}
const wellScoped=(s:Scope)=>!!s.worldId&&s.worldId.length<=200&&
 Number.isSafeInteger(s.year)&&s.year>=1&&
 Number.isSafeInteger(s.week)&&s.week>=1&&s.week<=52;
function publishedWeek(rows:readonly Published[]):boolean{
 return rows.length>0&&rows.length<=8&&rows.every(s=>
  !!s.show_id&&!!s.promotion_id&&!!s.player_id&&
  /^[a-f0-9]{64}$/i.test(s.receipt_digest));
}
async function claim(pool:TransactionPool,scope:Scope,row:Published){
 const r=await withSqlClient(pool,db=>db.query<{show_id:string}>(`
  INSERT INTO ppw_postshow_voice_batches(
   world_id,promotion_id,show_id,player_id,receipt_digest,state)
  SELECT c.world_id,c.promotion_id,c.show_id,p.player_id,
   c.receipt_digest,'PENDING'
  FROM ppw_completed_shows c
  JOIN ppw_promotion_controls p ON p.world_id=c.world_id
   AND p.promotion_id=c.promotion_id AND p.active
   AND p.player_id=$4
  JOIN ppw_memberships m ON m.world_id=p.world_id
   AND m.player_id=p.player_id AND m.status='ACTIVE'
  JOIN ppw_world_news_weeks published ON published.world_id=c.world_id
   AND published.year=c.year AND published.week=c.week
  JOIN ppw_worlds w ON w.world_id=c.world_id
   AND (w.year>c.year OR (w.year=c.year AND w.week>c.week))
  WHERE c.world_id=$1 AND c.promotion_id=$2 AND c.show_id=$3
   AND c.receipt_digest=$5
  ON CONFLICT(world_id,promotion_id,show_id,player_id) DO NOTHING
  RETURNING show_id`,[scope.worldId,row.promotion_id,row.show_id,
  row.player_id,row.receipt_digest]));
 return r.length===1;
}
async function settle(pool:TransactionPool,scope:Scope,row:Published,
 copy:unknown,calls:0|1){
 // Fencing by the certified receipt: an accidental re-import cannot reuse
 // another game's editorial. The immutable record can only be settled once.
 const valid=copy&&typeof copy==="object"?JSON.stringify(copy):null;
 await withSqlClient(pool,db=>db.query(`
  UPDATE ppw_postshow_voice_batches SET state=$6,
   copy_json=$7::jsonb,provider_calls=$8,completed_at=now()
  WHERE world_id=$1 AND promotion_id=$2 AND show_id=$3
   AND player_id=$4 AND receipt_digest=$5 AND state='PENDING'`,
  [scope.worldId,row.promotion_id,row.show_id,row.player_id,row.receipt_digest,
   valid?"READY":"FAILED",valid,calls]));
}
/** An injected transport is used by tests; production always supplies fetch.
 * All response text is transient and never saved if it fails verification.
 */
/** Diagnostic codes contain only fixed enums. Never store or send
 * rejected Groq prose, provider error bodies or private show instructions.
 */
export type ShortformVoicePartStatus=
 "ACCEPTED"|"MISSING"|"FORMAT_REJECTED"|"LENGTH_REJECTED"|
 "FACT_OR_VOICE_REJECTED";
export type ShortformVoiceDiagnostic={
 category:"ACCEPTED"|"PARTIAL"|"ALL_REJECTED"|"WRONG_SHAPE"|
  "HTTP_REJECTED"|"INVALID_ENVELOPE"|"EMPTY_CONTENT"|
  "INVALID_JSON"|"TRUNCATED"|"OVERSIZED"|"PROVIDER_ERROR";
 news:ShortformVoicePartStatus;
 wrestler:ShortformVoicePartStatus;
 roadAgent:ShortformVoicePartStatus;
};
const emptyDiagnostic=(category:ShortformVoiceDiagnostic["category"]):
 ShortformVoiceDiagnostic=>({category,news:"MISSING",wrestler:"MISSING",
 roadAgent:"MISSING"});
const isRecord=(value:unknown):value is Record<string,unknown>=>
 !!value&&typeof value==="object"&&!Array.isArray(value);
/** Non-generative rejection explanation: no model prose is logged or saved. */
function partStatus(field:"news"|"wrestler"|"roadAgent",
 source:ReturnType<typeof postShowVoiceBrief>,
 candidate:Record<string,unknown>,accepted:boolean):ShortformVoicePartStatus{
 const allowed=field==="news"?!!source.mainEvent:
  field==="wrestler"?!!source.wrestler:!!source.roadAgent;
 const original=candidate[field];
 if(!allowed||original===undefined||original===null)return "MISSING";
 if(accepted)return "ACCEPTED";
 if(!isRecord(original))return "FORMAT_REJECTED";
 const values=field==="news"?
  [[original.headline,4,19,145],[original.summary,18,80,480]]:
  field==="wrestler"?[[original.text,8,65,350]]:
  [[original.note,10,85,470]];
 if(values.some(([value])=>typeof value!=="string"))
  return "FORMAT_REJECTED";
 if(values.some(([value,min,max,limit])=>{
  const text=value as string;
  const words=text.trim().split(/\s+/).filter(Boolean).length;
  return text.length>(limit as number)||words<(min as number)||
   words>(max as number);
 }))return "LENGTH_REJECTED";
 return "FACT_OR_VOICE_REJECTED";
}

export async function generatePostShowVoiceCopy(show:CompletedShowView,key:string,
 transport:typeof fetch=fetch,pool?:TransactionPool,
 diagnostic?:(result:ShortformVoiceDiagnostic)=>void){
 const source=postShowVoiceBrief(show);
 if(!source.mainEvent&&!source.wrestler&&!source.roadAgent)return null;
 const messages=postShowVoicePrompt(source);
 const body={model:MODEL,temperature:0.55,reasoning_effort:"low",
  reasoning_format:"hidden",max_completion_tokens:650,
  response_format:{type:"json_object"},messages};
 const request=await requestGroqEditorial({
  task:"SHORT_NEWS",key,transport,pool,body,
  signal:AbortSignal.timeout(16000)
 });
 if(!request.ok){
  diagnostic?.(emptyDiagnostic("HTTP_REJECTED"));
  return null;
 }
 const raw=await request.text();
 if(raw.length>12000){
  diagnostic?.(emptyDiagnostic("OVERSIZED"));
  return null;
 }
 let decoded:unknown;
 try{decoded=JSON.parse(raw);}catch{
  diagnostic?.(emptyDiagnostic("INVALID_ENVELOPE"));
  return null;
 }
 const envelope=isRecord(decoded)?decoded:{};
 const choices=Array.isArray(envelope.choices)?envelope.choices:[];
 const reply=isRecord(choices[0])?choices[0]:{};
 if(reply.finish_reason==="length"){
  diagnostic?.(emptyDiagnostic("TRUNCATED"));
  return null;
 }
 const message=isRecord(reply.message)?reply.message:{};
 if(typeof message.content!=="string"||!message.content.trim()){
  diagnostic?.(emptyDiagnostic("EMPTY_CONTENT"));
  return null;
 }
 if(message.content.length>4000){
  diagnostic?.(emptyDiagnostic("OVERSIZED"));
  return null;
 }
 let text:unknown;
 try{text=JSON.parse(message.content);}catch{
  diagnostic?.(emptyDiagnostic("INVALID_JSON"));
  return null;
 }
 if(!isRecord(text)){
  diagnostic?.(emptyDiagnostic("WRONG_SHAPE"));
  return null;
 }
 const copy=validatePostShowVoiceCopy(source,text);
 const fields=["news","wrestler","roadAgent"] as const;
 const statuses=Object.fromEntries(fields.map(field=>[
  field,partStatus(field,source,text,!!copy?.[field])
 ])) as Pick<ShortformVoiceDiagnostic,"news"|"wrestler"|"roadAgent">;
 const anyPresent=fields.some(field=>text[field]!==undefined&&text[field]!==null);
 const structured=fields.some(field=>isRecord(text[field])||text[field]===null);
 const expected={news:!!source.mainEvent,wrestler:!!source.wrestler,
  roadAgent:!!source.roadAgent};
 const category:ShortformVoiceDiagnostic["category"]=!anyPresent||!structured?
  "WRONG_SHAPE":!copy?"ALL_REJECTED":
  fields.some(field=>expected[field]&&statuses[field]!=="ACCEPTED")?
   "PARTIAL":"ACCEPTED";
 diagnostic?.({category,...statuses});
 return copy;
}

/** Called only when the manual resolution driver reports PUBLISHED.
 * A failed provider or isolated player receipt does not block World progress.
 * Each eligible show has a durable one-shot claim, so an operator retry will
 * not double the Groq bill. Two concurrent requests per bounded batch.
 */
export async function publishPostShowVoiceBatches(pool:TransactionPool,scope:Scope,
 key:string,transport:typeof fetch=fetch){
 if(!wellScoped(scope)||!key)throw new Error("Invalid certified shortform scope");
 const rows=await withSqlClient(pool,db=>db.query<Published>(`
  SELECT c.promotion_id,c.show_id,p.player_id,c.receipt_digest
  FROM ppw_completed_shows c
  JOIN ppw_promotion_controls p ON p.world_id=c.world_id
   AND p.promotion_id=c.promotion_id AND p.active
  JOIN ppw_memberships m ON m.world_id=p.world_id
   AND m.player_id=p.player_id AND m.status='ACTIVE'
  JOIN ppw_world_news_weeks n ON n.world_id=c.world_id
   AND n.year=c.year AND n.week=c.week
  JOIN ppw_worlds w ON w.world_id=c.world_id
   AND (w.year>c.year OR (w.year=c.year AND w.week>c.week))
  WHERE c.world_id=$1 AND c.year=$2 AND c.week=$3
  ORDER BY c.promotion_id,c.show_id LIMIT 9`,
  [scope.worldId,scope.year,scope.week]));
 if(!rows.length)return {eligible:0,generated:0,failed:0,skipped:0};
 if(!publishedWeek(rows))throw new Error("Excess or invalid certified shortform recipients");
 let generated=0,failed=0,skipped=0;
 // Separate bounded waves avoid a burst against the Groq minute limits.
 for(let i=0;i<rows.length;i+=2){
  await Promise.all(rows.slice(i,i+2).map(async row=>{
   let owned=false,called=false;
   try{
    owned=await claim(pool,scope,row);
    if(!owned){skipped++;return;}
    const show=await readCompletedShowView(pool,{
     worldId:scope.worldId,promotionId:row.promotion_id,
     showId:row.show_id,playerId:row.player_id});
    // A budget-denied 429 may never reach the network. Report actual
    // outbound provider attempts, not simply "generator invoked".
    const measured:typeof fetch=async(url,init)=>{
     called=true;return transport(url,init);
    };
    const valid=await generatePostShowVoiceCopy(show,key,measured,pool);
    await settle(pool,scope,row,valid,called?1:0);
    if(valid)generated++;else failed++;
   }catch{
    if(owned){
     try{await settle(pool,scope,row,null,called?1:0);}catch{
      /* An incomplete claim never triggers a silent extra Groq request. */
     }
     failed++;
    }else skipped++;
   }
  }));
 }
 return {eligible:rows.length,generated,failed,skipped};
}
