
/** One explicit shared weekly consultation. No page-load calls or World mutations. */
import {createHash} from "node:crypto";
import type {TransactionPool} from "./transaction.js";
import {withSqlClient} from "./postgres.js";
import {readStaffWorkspace} from "./staff-workspace.js";
import {readWorldMail,type WorldMail} from "./backstage-world-mail.js";
import {postShowVoiceEnabled} from "./postshow-voice-batches.js";
import {requestGroqEditorial} from "./groq-ai-director.js";
import {consultationMessages,validateConsultation,consultationCacheCopy,
 type ConsultationAnchor,type StaffConsultation} from "../domain/staff-consultation.js";
type Scope={worldId:string;promotionId:string;playerId:string};
type Office=Awaited<ReturnType<typeof readStaffWorkspace>>;
type Cached={week_index:number;digest:string;state:string;copy_json:unknown;expired:boolean};
const rank={ACTION:0,WATCH:1,CLEAR:2} as const;
export function consultationAnchors(office:Office,mails:readonly WorldMail[]):ConsultationAnchor[]{
 const staff=office.meetings.filter(m=>m.staffName&&m.personality&&m.urgency!=="CLEAR")
  .sort((a,b)=>rank[a.urgency]-rank[b.urgency]||a.role.localeCompare(b.role)).slice(0,3);
 const anchors:ConsultationAnchor[]=staff.map(m=>({
  key:"staff-"+m.role,role:m.role,staffName:m.staffName!,personality:m.personality!,
  specialism:m.specialism,observation:m.message.slice(0,340),nextStep:m.nextStep.slice(0,340),
  options:m.consultationOptions,target:m.target
 }));
 const debate=mails.find(m=>m.kind==="STAFF"&&m.canDisagree&&!m.disagreementResponse&&m.staffDebate);
 if(debate?.staffDebate)for(const [role,member] of [
  ["MEDICAL",debate.staffDebate.medical],["CREATIVE",debate.staffDebate.creative]] as const){
  anchors.push({key:"debate-"+role,role,staffName:member.name,personality:member.personality,
   specialism:null,observation:member.position.slice(0,340),nextStep:debate.body.slice(0,340),
   mailId:debate.id,target:role==="MEDICAL"?"roster":"programmes",
   options:role==="MEDICAL"?[
    "Review the actual fatigue warning and all existing clearance restrictions before physical booking.",
    "Consider a lighter schedule and non-physical presentation; reassess actual fatigue rather than assuming recovery."
   ]:[
    "Write a different, non-physical chapter for the existing programme that respects the Medical concern.",
    "Consider a meaningful ending or a fresh motive, without requiring another demanding match."
   ]});
 }
 return anchors;
}
export async function readStaffConsultation(pool:TransactionPool,scope:Scope,
 config:{enabled?:boolean;key?:string;transport?:typeof fetch}={}):Promise<StaffConsultation>{
 const office=await readStaffWorkspace(pool,scope);
 const result=(status:StaffConsultation["status"],items:StaffConsultation["items"]=[])=>({
  status,year:office.year,week:office.week,revision:office.worldRevision,items});
 if(!office.canEdit||!(config.enabled??postShowVoiceEnabled(process.env,scope.worldId)))
  return result("UNAVAILABLE");
 const key=config.key??process.env.GROQ_API_KEY;
 if(!key)return result("UNAVAILABLE");
 const mail=await withSqlClient(pool,tx=>readWorldMail(tx,scope));
 const anchors=consultationAnchors(office,mail);
 if(!anchors.length)return result("FALLBACK");
 const week=(office.year-1)*52+office.week-1;
 const digest=createHash("sha256").update(JSON.stringify({
  anchors,employees:office.employees.map(e=>e.employmentId).sort()
 })).digest("hex");
 const params=[scope.worldId,scope.promotionId,scope.playerId,week,digest,office.worldRevision];
 const cached=await withSqlClient(pool,tx=>tx.query<Cached&Record<string,unknown>>(`
  SELECT s.week_index,s.digest,s.state,s.copy_json,
   s.claimed_at < clock_timestamp()-interval '45 seconds' AS expired
  FROM ppw_staff_consultations s JOIN ppw_worlds w ON w.world_id=s.world_id
  JOIN ppw_promotion_controls c ON c.world_id=s.world_id AND c.promotion_id=s.promotion_id
   AND c.player_id=s.player_id AND c.active
  JOIN ppw_memberships m ON m.world_id=s.world_id AND m.player_id=s.player_id AND m.status='ACTIVE'
  WHERE s.world_id=$1 AND s.promotion_id=$2 AND s.player_id=$3
   AND w.revision=$4 AND w.phase='OPEN' AND w.next_lock_at>clock_timestamp()`,
  [...params.slice(0,3),office.worldRevision]));
 const existing=cached[0];
 if(existing&&existing.week_index>=week){
  if(existing.week_index!==week||existing.digest!==digest)return result("FALLBACK");
  if(existing.state==="PENDING")return result(existing.expired?"FALLBACK":"PENDING");
  const items=validateConsultation(anchors,existing.copy_json);
  return result(existing.state==="READY"&&items.length?"READY":"FALLBACK",items);
 }
 // Atomic claim, once per game week across both screens and devices.
 const claims=await withSqlClient(pool,tx=>tx.query<{week_index:number}>(`
  INSERT INTO ppw_staff_consultations(world_id,promotion_id,player_id,week_index,digest,state)
  SELECT w.world_id,c.promotion_id,c.player_id,$4,$5,'PENDING'
  FROM ppw_worlds w JOIN ppw_promotion_controls c ON c.world_id=w.world_id
   AND c.promotion_id=$2 AND c.player_id=$3 AND c.active
  JOIN ppw_memberships m ON m.world_id=w.world_id AND m.player_id=c.player_id AND m.status='ACTIVE'
  WHERE w.world_id=$1 AND w.phase='OPEN' AND w.next_lock_at>clock_timestamp()
   AND (w.year-1)*52+w.week-1=$4 AND w.revision=$6
  ON CONFLICT(world_id,promotion_id,player_id) DO UPDATE
   SET week_index=EXCLUDED.week_index,digest=EXCLUDED.digest,state='PENDING',copy_json=NULL,
    claimed_at=clock_timestamp()
   WHERE ppw_staff_consultations.week_index<EXCLUDED.week_index
  RETURNING week_index`,params));
 if(claims.length!==1)return result("PENDING");
 let items:StaffConsultation["items"]=[];
 try{
  const response=await requestGroqEditorial({task:"STAFF_ADVICE",key,pool,
   transport:config.transport??fetch,signal:AbortSignal.timeout(12000),
   body:{temperature:0.55,reasoning_effort:"low",reasoning_format:"hidden",
    max_completion_tokens:650,response_format:{type:"json_object"},
    messages:consultationMessages(anchors)}});
  if(response.ok){
   const raw=await response.text();
   if(raw.length<=12000){
    const message=JSON.parse(raw)?.choices?.[0];
    if(message?.finish_reason!=="length"&&typeof message?.message?.content==="string"&&
     message.message.content.length<=3600)
     items=validateConsultation(anchors,JSON.parse(message.message.content));
   }
  }
 }catch{/* Existing deterministic advice stays available. No retry. */}
 const copy=items.length?JSON.stringify(consultationCacheCopy(anchors,items)):null;
 try{
  const settled=await withSqlClient(pool,tx=>tx.query<{week_index:number}>(`
   UPDATE ppw_staff_consultations s SET state=$6,copy_json=$7::jsonb
   WHERE s.world_id=$1 AND s.promotion_id=$2 AND s.player_id=$3
    AND s.week_index=$4 AND s.digest=$5 AND s.state='PENDING'
    AND EXISTS(SELECT 1 FROM ppw_worlds w JOIN ppw_promotion_controls c ON c.world_id=w.world_id
     AND c.promotion_id=s.promotion_id AND c.player_id=s.player_id AND c.active
     JOIN ppw_memberships m ON m.world_id=w.world_id AND m.player_id=c.player_id AND m.status='ACTIVE'
     WHERE w.world_id=s.world_id AND w.revision=$8 AND w.phase='OPEN'
      AND w.next_lock_at>clock_timestamp())
   RETURNING week_index`,[...params.slice(0,5),copy?"READY":"FAILED",copy,office.worldRevision]));
  return settled.length===1?result(items.length?"READY":"FALLBACK",items):result("FALLBACK");
 }catch{return result("FALLBACK");}
}
