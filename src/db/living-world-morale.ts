/** Original weekly morale and annual wrestler/promotion trust.
 * Only verified appearances, actual contractual roles, health and finances
 * contribute. No predicted outcomes or player-authored finish modifications. */
import type {SqlRows} from "./world-operations.js";
import {originalWeeklyMorale,originalTrustYear} from "../domain/living-career.js";
const valid=(x:unknown)=>typeof x==="number"&&Number.isFinite(x);
type ContractRow={
 person_id:string;morale:number|null;momentum:number|null;fatigue:number|null;
 person_status:string;promotion_id:string|null;role_expectation:string|null;
 financial_distress:string|null;lifecycle:string|null;
 had_show:boolean|null;used:boolean|null;
};
const roles=new Set(["DEVELOPMENTAL","REGULAR","FEATURED","UPPER_CARD",
 "MAIN_EVENT","SPECIAL_ATTRACTION"]);
const states=new Set(["HEALTHY","WATCH","DISTRESSED","CRISIS"]);
// Foundational pre-restoration contracts used MIDCARD. Treat that original
// slot as REGULAR rather than silently ignoring booking expectations.
const recognizedRole=(role:string|null):Role|null=>role==="MIDCARD"?"REGULAR":
 roles.has(role??"")?role as Role:null;
type Role="DEVELOPMENTAL"|"REGULAR"|"FEATURED"|"UPPER_CARD"|"MAIN_EVENT"|"SPECIAL_ATTRACTION";
type Distress="HEALTHY"|"WATCH"|"DISTRESSED"|"CRISIS";
export async function settleLivingMorale(tx:SqlRows,worldId:string,year:number,week:number){
 const index=(year-1)*52+week-1;
 if(!worldId||worldId.length>200||!Number.isSafeInteger(index)||index<0||
  week<1||week>52)throw new Error("Invalid weekly morale settlement");
 const rows=await tx.query<ContractRow>(`
 WITH verified AS (
  SELECT r.promotion_id,r.appearance_person_ids
  FROM ppw_show_resolutions r JOIN ppw_completed_shows show
   ON show.world_id=r.world_id AND show.show_id=r.show_id
   AND show.promotion_id=r.promotion_id AND show.year=$2 AND show.week=$3
  WHERE r.world_id=$1 AND r.resolved_week_index=$4
   AND r.appearance_person_ids IS NOT NULL
 )
 SELECT p.person_id,p.morale,p.momentum,p.fatigue,p.status AS person_status,
  c.promotion_id,c.role_expectation,pr.financial_distress,pr.lifecycle,
  EXISTS(SELECT 1 FROM verified v WHERE v.promotion_id=c.promotion_id) AS had_show,
  EXISTS(SELECT 1 FROM verified v WHERE v.promotion_id=c.promotion_id
   AND v.appearance_person_ids ? p.person_id) AS used
 FROM ppw_people p LEFT JOIN ppw_contracts c ON c.world_id=p.world_id
  AND c.person_id=p.person_id AND c.status='SIGNED'
  AND c.start_week_index<=$4 AND c.expires_week_index>=$4
 LEFT JOIN ppw_promotions pr ON pr.world_id=c.world_id
  AND pr.promotion_id=c.promotion_id
 WHERE p.world_id=$1 AND p.status<>'RETIRED'
 ORDER BY p.person_id,c.promotion_id LIMIT 12001`,[worldId,year,week,index]);
 if(rows.length>12000)throw new Error("Wrestler moral evidence exceeds bounded World");
 const byPerson=new Map<string,ContractRow[]>();
 for(const r of rows)byPerson.set(r.person_id,[...(byPerson.get(r.person_id)??[]),r]);
 const updates:{person_id:string;before:number;next:number}[]=[];
 for(const [person,contracts] of byPerson){
  const p=contracts[0]!;
  if(!valid(p.morale)||!valid(p.momentum)||!valid(p.fatigue))continue;
  const relevant=contracts.flatMap(r=>{
   const role=recognizedRole(r.role_expectation);
   if(r.promotion_id===null||role===null||
    !states.has(r.financial_distress??""))return [];
   return [{role,hadVerifiedShow:r.had_show===true,
    used:r.used===true,distress:r.financial_distress as Distress,
    inactive:r.lifecycle==="DORMANT"||r.lifecycle==="CLOSED"}];
  });
  const next=originalWeeklyMorale({morale:p.morale!,momentum:p.momentum!,
   fatigue:p.fatigue!,injured:p.person_status==="INJURED",contracts:relevant});
  if(next!==p.morale)updates.push({person_id:person,before:p.morale!,next});
 }
 if(updates.length){
  const saved=await tx.query<{person_id:string}>(`
   UPDATE ppw_people p SET morale=x.next
   FROM jsonb_to_recordset($2::jsonb) x(person_id text,
    before double precision,next double precision)
   WHERE p.world_id=$1 AND p.person_id=x.person_id
    AND p.morale=x.before AND p.status<>'RETIRED'
   RETURNING p.person_id`,[worldId,JSON.stringify(updates)]);
  if(saved.length!==updates.length)throw new Error("Weekly wrestler morale baseline moved");
 }
 return {evaluated:byPerson.size,changed:updates.length};
}
type TrustRow={promotion_id:string;person_id:string;trust:number;
 appearances:number;terminated:number;broken:number;dormant:boolean};
export async function settleAnnualLivingTalentTrust(
 tx:SqlRows,worldId:string,year:number,week:number){
 if(week!==52)return {evaluated:0};
 if(!worldId||!Number.isSafeInteger(year)||year<1)
  throw new Error("Invalid annual promotion trust evidence");
 const start=(year-1)*52,end=start+51;
 // Original trust pair records survive contract expiry. Never fabricate
 // a historic contract for someone with no signed agreement.
 await tx.query(`
 INSERT INTO ppw_promotion_talent_trust(world_id,promotion_id,person_id)
 SELECT DISTINCT world_id,promotion_id,person_id
 FROM ppw_contracts WHERE world_id=$1
  AND start_week_index<=$2 AND expires_week_index>=$3
 ON CONFLICT DO NOTHING`,[worldId,end,start]);
 const rows=await tx.query<TrustRow>(`
 WITH verified AS (
  SELECT r.promotion_id,r.appearance_person_ids
  FROM ppw_show_resolutions r
  JOIN ppw_completed_shows show ON show.world_id=r.world_id
   AND show.show_id=r.show_id AND show.promotion_id=r.promotion_id
  WHERE r.world_id=$1 AND r.resolved_week_index BETWEEN $3 AND $4
   AND r.appearance_person_ids IS NOT NULL
 ), appeared AS (
  SELECT v.promotion_id,a.person_id,count(*)::integer AS appearances
  FROM verified v CROSS JOIN LATERAL jsonb_array_elements_text(
   v.appearance_person_ids) AS a(person_id)
  GROUP BY v.promotion_id,a.person_id
 ), harms AS (
  SELECT e.payload->>'promotionId' AS promotion_id,
   e.payload->>'personId' AS person_id,
   count(*) FILTER (WHERE e.event_type='CONTRACT_TERMINATED_DURING_RESTRUCTURING')::integer
    AS terminated,
   count(*) FILTER (WHERE e.event_type='BACKSTAGE_PROMISE_BROKEN')::integer AS broken
  FROM ppw_ledger_events e WHERE e.world_id=$1 AND e.year=$2
   AND e.event_type IN ('CONTRACT_TERMINATED_DURING_RESTRUCTURING',
    'BACKSTAGE_PROMISE_BROKEN')
  GROUP BY e.payload->>'promotionId',e.payload->>'personId'
 )
 SELECT t.promotion_id,t.person_id,t.trust,
  coalesce(a.appearances,0) AS appearances,
  coalesce(h.terminated,0) AS terminated,coalesce(h.broken,0) AS broken,
  (p.lifecycle IN ('DORMANT','CLOSED')) AS dormant
 FROM ppw_promotion_talent_trust t
 JOIN ppw_promotions p ON p.world_id=t.world_id
  AND p.promotion_id=t.promotion_id
 LEFT JOIN appeared a ON a.promotion_id=t.promotion_id
  AND a.person_id=t.person_id
 LEFT JOIN harms h ON h.promotion_id=t.promotion_id
  AND h.person_id=t.person_id
 WHERE t.world_id=$1 AND t.last_evaluated_year<$2
 ORDER BY t.promotion_id,t.person_id LIMIT 10001`,[worldId,year,start,end]);
 if(rows.length>10000)throw new Error("Annual trust pair limit exceeded");
 const changes=rows.map(r=>({
  promotion_id:r.promotion_id,person_id:r.person_id,
  next:originalTrustYear({current:r.trust,appearances:r.appearances,
   terminations:r.terminated+r.broken,dormant:r.dormant})}));
 if(changes.length){
  const changed=await tx.query<{promotion_id:string}>(`
   UPDATE ppw_promotion_talent_trust t
   SET trust=x.next,last_evaluated_year=$3
   FROM jsonb_to_recordset($2::jsonb) x(
    promotion_id text,person_id text,next double precision)
   WHERE t.world_id=$1 AND t.promotion_id=x.promotion_id
    AND t.person_id=x.person_id AND t.last_evaluated_year<$3
   RETURNING t.promotion_id`,[worldId,JSON.stringify(changes),year]);
  if(changed.length!==changes.length)throw new Error("Annual talent trust not fully resolved");
 }
 return {evaluated:changes.length};
}
