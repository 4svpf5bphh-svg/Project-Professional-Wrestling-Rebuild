/** A promotion may propose, but only the wrestler can consent to changing
 * their one World-wide persona. Successful responses preserve repertoire.
 * Decisions are replay-safe, auditable, and subject to a 12-week cooldown.
 */
import {applyWorldCommand} from "./world-commands.js";
import type {TransactionPool} from "./transaction.js";
import {originalPersonaBaseline,validatePortablePersona}
 from "../domain/portable-persona.js";
import {evaluatePersonaConsent} from "../domain/portable-persona-consent.js";
import {GIMMICK_CATALOG,gimmickUsableBy}
 from "../content/gimmick-catalog.js";
import type {PortablePersona} from "../domain/portable-identity-types.js";
export interface PersonaChangeInput{
 worldId:string;promotionId:string;playerId:string;personId:string;
 gimmickId:string;requestId:string;expectedRevision:number;
}
const valid=(x:unknown)=>typeof x==="string"&&!!x.trim()&&x.length<=200;
export async function requestPortablePersonaChange(
 pool:TransactionPool,input:PersonaChangeInput){
 if(![input.worldId,input.promotionId,input.playerId,input.personId,
  input.gimmickId].every(valid)||
  !GIMMICK_CATALOG.some(x=>x.id===input.gimmickId))
  throw new Error("Choose an original PPW gimmick archetype");
 return applyWorldCommand(pool,{
  worldId:input.worldId,playerId:input.playerId,requestId:input.requestId,
  expectedRevision:input.expectedRevision,
  commandType:"REQUEST_PORTABLE_PERSONA",requiresOpenWeek:true,
  execute:async tx=>{
   const permission=await tx.query<{
    person_id:string;name:string;portable_gimmick_id:string|null;
    popularity:number|null;recognition:number|null;morale:number|null;
    creative_control:string;year:number;week:number;seed:string|number}>([
    "SELECT p.person_id,p.name,p.portable_gimmick_id,p.popularity,",
    "p.recognition,p.morale,c.creative_control,w.year,w.week,w.seed",
    "FROM ppw_people p JOIN ppw_worlds w ON w.world_id=p.world_id",
    "JOIN ppw_contracts c ON c.world_id=p.world_id AND c.person_id=p.person_id",
    "JOIN ppw_promotion_controls owner ON owner.world_id=p.world_id",
    "AND owner.promotion_id=c.promotion_id",
    "JOIN ppw_memberships member ON member.world_id=owner.world_id",
    "AND member.player_id=owner.player_id",
    "JOIN ppw_promotions promo ON promo.world_id=c.world_id",
    "AND promo.promotion_id=c.promotion_id",
    "WHERE p.world_id=$1 AND p.person_id=$2 AND p.status='ACTIVE'",
    "AND c.promotion_id=$3 AND owner.player_id=$4 AND owner.active",
    "AND member.status='ACTIVE' AND promo.lifecycle='ACTIVE'",
    "AND c.status='SIGNED' AND c.start_week_index<=(w.year-1)*52+w.week-1",
    "AND c.expires_week_index>=(w.year-1)*52+w.week-1",
    "ORDER BY CASE c.creative_control WHEN 'FULL_APPROVAL' THEN 3",
    "WHEN 'PROTECTED_FINISHES' THEN 2",
    "WHEN 'CONSULTATION' THEN 1 ELSE 0 END DESC LIMIT 1"
   ].join(" "),[input.worldId,input.personId,input.promotionId,input.playerId]);
   if(permission.length!==1)
    throw new Error("Only a current wrestler's controlling promotion may negotiate");
   const person=permission[0]!,week=(person.year-1)*52+person.week-1;
   if(!gimmickUsableBy(input.gimmickId,person.name))
    throw new Error("Iconic characters are reserved for their wrestler");
   // Other human controllers must consent separately; one booker cannot
   // unilaterally reshape a shared performer in somebody else's fed.
   const otherHuman=await tx.query<{promotion_id:string}>([
    "SELECT c.promotion_id FROM ppw_contracts c",
    "JOIN ppw_promotion_controls owner ON owner.world_id=c.world_id",
    "AND owner.promotion_id=c.promotion_id AND owner.active",
    "WHERE c.world_id=$1 AND c.person_id=$2 AND c.promotion_id<>$3",
    "AND c.status='SIGNED' AND c.start_week_index<=$4",
    "AND c.expires_week_index>=$4 LIMIT 1"
   ].join(" "),[input.worldId,input.personId,input.promotionId,week]);
   if(otherHuman.length)
    throw new Error("A shared wrestler needs agreement from the other human promotion");
   const last=await tx.query<{submitted_week_index:number}>([
    "SELECT submitted_week_index FROM ppw_persona_change_requests",
    "WHERE world_id=$1 AND person_id=$2",
    "ORDER BY submitted_week_index DESC LIMIT 1"
   ].join(" "),[input.worldId,input.personId]);
   if(last.length&&week<last[0]!.submitted_week_index+12)
    throw new Error("The wrestler won't discuss repackaging again for 12 weeks");
   const current=await tx.query<{revision:number;persona:unknown;
    introduced_week_index:number}>([
    "SELECT revision,persona,introduced_week_index FROM ppw_portable_personas",
    "WHERE world_id=$1 AND person_id=$2 FOR UPDATE"
   ].join(" "),[input.worldId,input.personId]);
   const previous=current.length?validatePortablePersona(
    current[0]!.persona,person.name):originalPersonaBaseline(
    person.name,person.portable_gimmick_id);
   const reviewed=evaluatePersonaConsent({
    worldSeed:String(person.seed),personId:input.personId,realName:person.name,
    currentGimmickId:previous.gimmickId,requestedGimmickId:input.gimmickId,
    popularity:person.popularity!,recognition:person.recognition!,
    morale:person.morale!,creativeControl:person.creative_control as
     "NONE"|"CONSULTATION"|"PROTECTED_FINISHES"|"FULL_APPROVAL",
    weeksSinceChange:week-(current[0]?.introduced_week_index??0),
    weekIndex:week,
   });
   const oldRevision=current[0]?.revision??1;
   const nextRevision=reviewed.accepted?oldRevision+1:null;
   if(reviewed.accepted){
    const next:PortablePersona={...previous,gimmickId:input.gimmickId,
     source:"NEGOTIATED"};
    await tx.query([
     "INSERT INTO ppw_portable_personas(world_id,person_id,revision,",
     "persona,provenance,introduced_week_index,changed_by_promotion_id)",
     "VALUES($1,$2,$3,$4::jsonb,'NEGOTIATED',$5,$6)",
     "ON CONFLICT(world_id,person_id) DO UPDATE SET",
     "revision=EXCLUDED.revision,persona=EXCLUDED.persona,",
     "provenance=EXCLUDED.provenance,",
     "introduced_week_index=EXCLUDED.introduced_week_index,",
     "changed_by_promotion_id=EXCLUDED.changed_by_promotion_id"
    ].join(" "),[input.worldId,input.personId,nextRevision,
     JSON.stringify(next),week,input.promotionId]);
    await tx.query([
     "INSERT INTO ppw_portable_persona_history(world_id,person_id,revision,",
     "previous_persona,started_week_index,ended_week_index,",
     "changed_by_promotion_id) VALUES($1,$2,$3,$4::jsonb,$5,$6,$7)"
    ].join(" "),[input.worldId,input.personId,oldRevision,
     JSON.stringify(previous),current[0]?.introduced_week_index??0,
     week,input.promotionId]);
    const altered=await tx.query<{person_id:string}>([
     "UPDATE ppw_people SET portable_gimmick_id=$3",
     "WHERE world_id=$1 AND person_id=$2 RETURNING person_id"
    ].join(" "),[input.worldId,input.personId,input.gimmickId]);
    if(altered.length!==1)throw new Error("Wrestler persona changed during review");
   }
   await tx.query([
    "INSERT INTO ppw_persona_change_requests(world_id,request_id,",
    "person_id,promotion_id,requested_gimmick_id,submitted_week_index,",
    "status,reason,assessed_resistance,prior_revision,resulting_revision)",
    "VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)"
   ].join(" "),[input.worldId,input.requestId,input.personId,
    input.promotionId,input.gimmickId,week,
    reviewed.accepted?"ACCEPTED":"DECLINED",reviewed.reason,
    reviewed.assessedResistance,oldRevision,nextRevision]);
   await tx.query([
    "INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)",
    "VALUES($1,$2,$3,$4,jsonb_build_object('personId',$5::text,",
    "'promotionId',$6::text,'gimmickId',$7::text,'reason',$8::text))"
   ].join(" "),[input.worldId,person.year,person.week,
    "WRESTLER_PERSONA_"+(reviewed.accepted?"ACCEPTED":"DECLINED"),
    input.personId,input.promotionId,input.gimmickId,reviewed.reason]);
   return {personId:input.personId,gimmickId:input.gimmickId,
    accepted:reviewed.accepted,reason:reviewed.reason,
    revision:nextRevision,assessedResistance:reviewed.assessedResistance};
  }
 });
}
