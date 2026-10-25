/** Private Staff Office: two bounded reads, preserving original permissions.
 * Available World staff identities are seeded from the original World seed.
 */
import type {TransactionPool} from "./transaction.js";
import {withSqlClient} from "./postgres.js";
import {STAFF_ROLES,worldTalentManagers,staffBuyout,type StaffRole} from "../domain/world-staff.js";
import {STAFF_ALUMNI_JSON_SQL,worldStaffWithAlumni} from "../domain/alumni-staff-catalog.js";
import type {GorillaPolicy} from "../domain/gorilla-position.js";

export async function readStaffWorkspace(pool:TransactionPool,input:{
 worldId:string;promotionId:string;playerId:string
}){
 const {worldId,promotionId,playerId}=input;
 if(![worldId,promotionId,playerId].every(s=>typeof s==="string"&&s.length>0&&s.length<=200))
  throw new Error("Invalid Staff desk request");
 return withSqlClient(pool,async tx=>{
  const owners=await tx.query<{
   year:number;week:number;revision:string|number;can_edit:boolean;
   allow_unfinished_fallback:boolean|null;allow_logistics_fallback:boolean|null;
   permitted_days:number[]|null;permitted_venue_ids:string[]|null;
   frozen_logistics:boolean|null;auto_renew_same_terms:boolean|null;
   gorilla_policy:GorillaPolicy|null;
   world_seed:string;promotion_cash:string;employments:unknown;
   contracts_due:unknown;repeated_programmes:number;medical_risks:number;medical_example:string|null;employment_history:unknown;
   recent_shows:number;recent_matches:number;recent_disqualifications:number;
   fatigue_concerns:number;active_programmes:number;owner_rankings:unknown;
   employed_staff_id:string|null;employment_id:string|null;
   manager_salary:string|null;occupied_staff_ids:string[];legacy_staff_ids:string[];alumni_staff:unknown;
  }>(`
   SELECT w.year,w.week,w.revision,w.seed::text AS world_seed,
    p.cash::text AS promotion_cash,
    COALESCE(medical.risks,0) AS medical_risks,
    medical.wrestler AS medical_example,
    COALESCE((SELECT jsonb_agg(to_jsonb(history)) FROM
     (SELECT e.staff_id AS "staffId",e.role,
       old.name AS "promotionName",e.start_week_index AS "startedWeekIndex",
       e.ended_week_index AS "endedWeekIndex"
      FROM ppw_staff_employments e JOIN ppw_promotions old
       ON old.world_id=e.world_id AND old.promotion_id=e.promotion_id
      WHERE e.world_id=w.world_id AND e.status='ENDED'
      ORDER BY e.ended_week_index DESC,e.employment_id LIMIT 16
     ) history),'[]'::jsonb) AS employment_history,
    COALESCE((SELECT jsonb_agg(jsonb_build_object(
     'staffId',e.staff_id,'employmentId',e.employment_id,
     'role',e.role,'weeklySalary',e.weekly_salary,'morale',e.morale,
     'startWeekIndex',e.start_week_index,'expiresWeekIndex',e.expires_week_index,
     'termWeeks',e.term_weeks))
     FROM ppw_staff_employments e WHERE e.world_id=w.world_id
      AND e.promotion_id=$3 AND e.status='ACTIVE'),'[]'::jsonb) AS employments,
    COALESCE((SELECT jsonb_agg(to_jsonb(due)) FROM
     (SELECT c.contract_id AS "contractId",person.name AS "personName",
      c.expires_week_index-((w.year-1)*52+w.week-1) AS "weeksRemaining"
      FROM ppw_contracts c JOIN ppw_people person
       ON person.world_id=c.world_id AND person.person_id=c.person_id
      WHERE c.world_id=w.world_id AND c.promotion_id=$3
       AND c.status='SIGNED'
       AND c.expires_week_index BETWEEN (w.year-1)*52+w.week-1
        AND (w.year-1)*52+w.week+11
      ORDER BY c.expires_week_index,c.contract_id LIMIT 5
     ) due),'[]'::jsonb) AS contracts_due,
    (SELECT count(*)::integer FROM ppw_programmes programme
     WHERE programme.world_id=w.world_id AND programme.promotion_id=$3
     AND programme.status='ACTIVE' AND programme.repetition>=3) AS repeated_programmes,
    (SELECT count(*)::integer FROM ppw_completed_shows done
      WHERE done.world_id=w.world_id AND done.promotion_id=$3
       AND (done.year-1)*52+done.week-1
        BETWEEN greatest(0,(w.year-1)*52+w.week-9)
         AND (w.year-1)*52+w.week-1) AS recent_shows,
    (SELECT count(*)::integer FROM ppw_completed_show_matches match
      JOIN ppw_completed_shows done ON done.world_id=match.world_id
       AND done.show_id=match.show_id
      WHERE done.world_id=w.world_id AND done.promotion_id=$3
       AND (done.year-1)*52+done.week-1
        BETWEEN greatest(0,(w.year-1)*52+w.week-9)
         AND (w.year-1)*52+w.week-1) AS recent_matches,
    (SELECT count(*)::integer FROM ppw_completed_show_matches match
      JOIN ppw_completed_shows done ON done.world_id=match.world_id
       AND done.show_id=match.show_id
      WHERE done.world_id=w.world_id AND done.promotion_id=$3
       AND match.actual_finish IN ('DQ','DISQUALIFICATION')
       AND (done.year-1)*52+done.week-1
        BETWEEN greatest(0,(w.year-1)*52+w.week-9)
         AND (w.year-1)*52+w.week-1) AS recent_disqualifications,
    (SELECT count(DISTINCT c.person_id)::integer
      FROM ppw_contracts c JOIN ppw_people p
       ON p.world_id=c.world_id AND p.person_id=c.person_id
      WHERE c.world_id=w.world_id AND c.promotion_id=$3
       AND c.status='SIGNED' AND c.start_week_index<=(w.year-1)*52+w.week-1
       AND c.expires_week_index>=(w.year-1)*52+w.week-1
       AND p.status='ACTIVE' AND p.fatigue>=65) AS fatigue_concerns,
    (SELECT count(*)::integer FROM ppw_programmes programme
      WHERE programme.world_id=w.world_id AND programme.promotion_id=$3
       AND programme.status='ACTIVE') AS active_programmes,
    COALESCE((SELECT jsonb_agg(to_jsonb(ranked)) FROM (
      SELECT person.person_id AS "personId",person.name,
       count(bout.match_id)::integer AS "matches",
       count(*) FILTER(WHERE bout.won)::integer AS "wins",
       round(avg(bout.stars)::numeric,2)::double precision AS "averageStars"
      FROM (
       SELECT DISTINCT c.person_id FROM ppw_contracts c
       WHERE c.world_id=w.world_id AND c.promotion_id=$3
        AND c.status='SIGNED' AND c.start_week_index<=(w.year-1)*52+w.week-1
        AND c.expires_week_index>=(w.year-1)*52+w.week-1
      ) roster JOIN ppw_people person ON person.world_id=w.world_id
       AND person.person_id=roster.person_id AND person.status='ACTIVE'
      LEFT JOIN LATERAL (
       SELECT e.match_id,e.won,f.rating_stars::double precision AS stars
       FROM ppw_individual_field_career_effects e
       JOIN ppw_completed_shows done ON done.world_id=e.world_id
        AND done.show_id=e.show_id AND done.promotion_id=$3
       LEFT JOIN ppw_completed_match_report_facts f ON f.world_id=e.world_id
        AND f.show_id=e.show_id AND f.match_id=e.match_id
       WHERE e.world_id=w.world_id AND e.person_id=roster.person_id
       UNION ALL
       SELECT e.match_id,e.won,f.rating_stars::double precision AS stars
       FROM ppw_tag_match_career_effects e
       JOIN ppw_completed_shows done ON done.world_id=e.world_id
        AND done.show_id=e.show_id AND done.promotion_id=$3
       LEFT JOIN ppw_completed_match_report_facts f ON f.world_id=e.world_id
        AND f.show_id=e.show_id AND f.match_id=e.match_id
       WHERE e.world_id=w.world_id AND e.person_id=roster.person_id
      ) bout ON TRUE
      GROUP BY person.person_id,person.name
      HAVING count(bout.match_id)>0
      ORDER BY count(*) FILTER(WHERE bout.won) DESC,
       count(bout.match_id) DESC,person.name,person.person_id
      LIMIT 8
    ) ranked),'[]'::jsonb) AS owner_rankings,
    employed.staff_id AS employed_staff_id,
    employed.employment_id,employed.weekly_salary::text AS manager_salary,
    ARRAY(SELECT e.staff_id FROM ppw_staff_employments e
     WHERE e.world_id=w.world_id AND e.status='ACTIVE') AS occupied_staff_ids,
     ARRAY(SELECT legacy.staff_id FROM ppw_staff_legacy_identities legacy
      WHERE legacy.world_id=w.world_id) AS legacy_staff_ids,
    ${STAFF_ALUMNI_JSON_SQL},
    (w.phase='OPEN' AND w.next_lock_at>clock_timestamp()) AS can_edit,
    (SELECT gp.policy FROM ppw_gorilla_policies gp WHERE gp.world_id=w.world_id
     AND gp.promotion_id=$3 AND gp.owner_player_id=$2) AS gorilla_policy,
    s.allow_unfinished_fallback,s.allow_logistics_fallback,
    s.permitted_days,s.permitted_venue_ids,s.auto_renew_same_terms,
    l.allow_logistics_fallback AS frozen_logistics
   FROM ppw_worlds w JOIN ppw_promotion_controls c
    ON c.world_id=w.world_id AND c.player_id=$2 AND c.promotion_id=$3 AND c.active
   JOIN ppw_memberships m ON m.world_id=c.world_id AND m.player_id=c.player_id
    AND m.status='ACTIVE'
   JOIN ppw_promotions p ON p.world_id=c.world_id AND p.promotion_id=c.promotion_id
    AND p.lifecycle='ACTIVE'
   LEFT JOIN ppw_staff_continuity_settings s ON s.world_id=w.world_id
    AND s.promotion_id=$3 AND s.owner_player_id=$2
   LEFT JOIN ppw_week_logistics_authorizations l
    ON l.world_id=w.world_id AND l.year=w.year AND l.week=w.week
    AND l.promotion_id=$3 AND l.controller_player_id=$2
   LEFT JOIN LATERAL (
    SELECT count(DISTINCT injury.person_id)::integer AS risks,
       min(person.name) AS wrestler
    FROM ppw_medical_absences injury
    JOIN ppw_contracts contract ON contract.world_id=injury.world_id
     AND contract.person_id=injury.person_id AND contract.promotion_id=$3
     AND contract.status='SIGNED' AND contract.start_week_index<=(w.year-1)*52+w.week-1
     AND contract.expires_week_index>=(w.year-1)*52+w.week-1
    JOIN ppw_people person ON person.world_id=injury.world_id
     AND person.person_id=injury.person_id
    WHERE injury.world_id=w.world_id AND injury.status='ACTIVE'
      AND injury.injured_week_index<(w.year-1)*52+w.week-1
      AND injury.cleared_week_index>(w.year-1)*52+w.week-1
   ) medical ON TRUE
   LEFT JOIN LATERAL (SELECT e.staff_id,e.employment_id,e.weekly_salary
    FROM ppw_staff_employments e WHERE e.world_id=w.world_id
     AND e.promotion_id=$3 AND e.role='TALENT_MANAGER'
     AND e.status='ACTIVE' LIMIT 1) employed ON TRUE
   WHERE w.world_id=$1`,[worldId,playerId,promotionId]);
  if(owners.length!==1)throw new Error("Staff desk access denied");
  const current=owners[0]!,catalog=worldStaffWithAlumni(current.world_seed,
   current.legacy_staff_ids,current.alumni_staff);
  const managers=worldTalentManagers(current.world_seed);
  const busy=new Set(current.occupied_staff_ids);
  const employed=managers.find(p=>p.staffId===current.employed_staff_id);
  if(current.employed_staff_id&&!employed)throw new Error("Unknown employed World manager");
  type Row={staffId:string;employmentId:string;role:StaffRole;
   weeklySalary:number;morale:number;startWeekIndex:number;expiresWeekIndex:number;termWeeks:52|104};
  const rows=current.employments as Row[];
  const weekIndex=(current.year-1)*52+current.week-1;
  const employees=rows.map(e=>{
   const member=catalog.find(s=>s.staffId===e.staffId);
   if(!member||member.role!==e.role)throw new Error("Unknown employed World staff member");
   const salary=Number(e.weeklySalary);
   return {...member,...e,weeklySalary:salary,
    weeksRemaining:Math.max(0,e.expiresWeekIndex-weekIndex+1),
    buyoutCost:staffBuyout(salary,e.expiresWeekIndex,weekIndex)};
  });
  const notices:{department:string;message:string;target:"contracts"|"programmes"|"staff"|"roster"}[]=[];
  const officeRole=(role:StaffRole)=>employees.find(e=>e.role===role);
  const voice=(role:StaffRole,fallback:string)=>{
   const member=officeRole(role);
   return member?member.name+" · "+fallback:fallback;
  };
  const renewals=current.contracts_due as {contractId:string;personName:string;weeksRemaining:number}[];
  if(renewals.length)notices.push({department:voice("TALENT_MANAGER","Talent office"),target:"contracts",
   message:renewals.length+" wrestler contract"+(renewals.length===1?"":"s")+
    " nearing expiry, including "+renewals[0]!.personName+"."});
  if(current.repeated_programmes>0)notices.push({department:voice("CREATIVE","Creative desk"),target:"programmes",
   message:current.repeated_programmes+" active programme"+
    (current.repeated_programmes===1?" has":"s have")+
    " repeated recent beats. Review the direction."});
  if(current.medical_risks>0)notices.push({
   department:voice("MEDICAL","Medical desk"),target:"roster",
   message:current.medical_risks+" contracted wrestler"+
    (current.medical_risks===1?" is":"s are")+
    " medically unavailable, including "+(current.medical_example??"one member of the roster")+
    ". Review availability before booking the next card."
  });
  for(const e of employees.filter(e=>e.morale<35))
   notices.push({department:e.name+" · Staff relations",target:"staff",
    message:e.name+" is frustrated with conditions. Fair renewals and stable finances can help."});
  for(const e of employees.filter(e=>e.weeksRemaining<=12))
   notices.push({department:e.role.replaceAll("_"," "),target:"staff",
    message:e.name+"'s contract expires in "+e.weeksRemaining+" week"+
     (e.weeksRemaining===1?"":"s")+"."});
  const squad=(current.owner_rankings as {
   personId:string;name:string;matches:number;wins:number;averageStars:number|null
  }[]).slice(0,8);
  const meetingContent:Record<StaffRole,{message:string;target:"staff"|"roster"|"contracts"|"programmes"|"gorilla"}>={
   TALENT_MANAGER:{target:"contracts",message:renewals.length?
    renewals.length+" signed talent deal"+(renewals.length===1?"":"s")+
     " coming due; "+renewals[0]!.personName+" is first on my list.":
    "No signed wrestler contracts are due within the next twelve weeks."},
   ROAD_AGENT:{target:"gorilla",message:current.recent_matches?
    "We certified "+current.recent_matches+" matches over the last nine World weeks. "+
     "The standing Gorilla instructions still govern any authorised on-show adjustment.":
    "No completed matches in the last nine World weeks. Review Gorilla instructions before the next card."},
   MEDICAL:{target:"roster",message:current.medical_risks?
    current.medical_risks+" contracted wrestlers are unavailable. "+
     "Check their clearance dates rather than assuming they can work.":
    "No contracted wrestlers currently have an active medical restriction on record."},
   CREATIVE:{target:"programmes",message:current.repeated_programmes?
    current.repeated_programmes+" ongoing programme"+(current.repeated_programmes===1?" is":"s are")+
     " repeating beats. Review the direction before your next show.":
    current.active_programmes+" active programmes on the books. No repetition warning is currently triggered."},
   COMMENTATOR:{target:"programmes",message:current.active_programmes?
    current.active_programmes+" current programmes give us real storylines to call. "+
     "Keep the commentary tied to what actually happened.":
    "No active programmes to follow on commentary right now; new match history will build the story."},
   REFEREE:{target:"staff",message:current.recent_disqualifications?
    current.recent_disqualifications+" certified disqualification finishes in the last nine weeks. "+
     "Make the next scripted finish unmistakable to the referee.":
    "No certified disqualification finishes in the last nine weeks. "+
     "Our referees will stick to the authorised card."},
   PRODUCTION:{target:"staff",message:current.recent_shows?
    current.recent_shows+" shows completed in the last nine weeks. "+
     "Each has a recorded result; future venue plans remain yours to approve.":
    "No completed shows in the last nine weeks. The planner and venue approvals remain under your control."},
   TRAINER:{target:"roster",message:current.fatigue_concerns?
    current.fatigue_concerns+" roster members have high recorded fatigue. "+
     "A trainer's limited recovery support never bypasses medical clearance.":
    "No active contracted wrestlers currently exceed the high-fatigue watch threshold."}
  };
  const meetings=STAFF_ROLES.map(role=>{
   const member=officeRole(role);
   return {role,staffName:member?.name??null,
    personality:member?.personality??null,...meetingContent[role]};
  });
  const venues=await tx.query<{venue_id:string;name:string;
   capacity:number|null;weekly_hire_cost:string|null}>(`
   SELECT venue_id,name,capacity,weekly_hire_cost::text
   FROM ppw_venues WHERE world_id=$1 AND status='ACTIVE'
   ORDER BY name,venue_id LIMIT 129`,[worldId]);
  if(venues.length>128)throw new Error("Venue catalogue exceeds staff configuration limit");
  return {year:current.year,week:current.week,
   gorillaPolicy:current.gorilla_policy??"STICK_TO_CARD",
   worldRevision:Number(current.revision),canEdit:current.can_edit,
   allowUnfinishedFallback:current.allow_unfinished_fallback===true,
   autoRenewSameTerms:current.auto_renew_same_terms===true,
   talentManager:employed?{...employed,employmentId:current.employment_id!,
    weeklySalary:Number(current.manager_salary)}:null,
   availableManagers:employed?[]:managers.filter(m=>!busy.has(m.staffId)),
   employees,market:catalog.filter(m=>!busy.has(m.staffId)),
   promotionCash:Number(current.promotion_cash),
   weeklyPayroll:employees.reduce((sum,e)=>sum+e.weeklySalary,0),
   notices:notices.slice(0,8),
   meetings,ownerRankings:squad,
   employmentHistory:current.employment_history as {staffId:string;role:StaffRole;promotionName:string;startedWeekIndex:number;endedWeekIndex:number}[],
   allowLogisticsFallback:current.allow_logistics_fallback===true,
   permittedDays:current.permitted_days??[],
   permittedVenueIds:current.permitted_venue_ids??[],
   lockedLogisticsDelegated:current.frozen_logistics===true,
   venues:venues.map(v=>({venueId:v.venue_id,name:v.name,
    capacity:v.capacity,weeklyHireCost:v.weekly_hire_cost===null?
     null:Number(v.weekly_hire_cost)}))};
 });
}
