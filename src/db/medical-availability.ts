/** Verified injury receipt -> current medical availability, in the World
 * transaction, never from generated prose or a browser request.
 */
import type {SqlRows} from "./world-operations.js";
import {medicalClearanceWeek,type MedicalSeverity} from "../domain/medical-recovery.js";
export interface VerifiedMedicalFact{
 matchId:string;injuries:{personId:string;severity:string;weeksOut:number}[];
}
export async function recordVerifiedMedicalAbsencesInTransaction(tx:SqlRows,input:{
 worldId:string;showId:string;year:number;week:number;facts:readonly VerifiedMedicalFact[]
}):Promise<void>{
 if(!Number.isSafeInteger(input.year)||input.year<1||
  !Number.isSafeInteger(input.week)||input.week<1||input.week>52||
  input.facts.length>100)throw new Error("Invalid medical resolution scope");
 const injuredWeekIndex=(input.year-1)*52+input.week-1;
 const ordered=new Map<string,{person_id:string;match_id:string;
  weeks_out:number;severity:MedicalSeverity;cleared_week_index:number}>();
 for(const fact of input.facts)for(const injury of fact.injuries){
  if(!injury.personId||injury.personId.length>200||
   !fact.matchId||fact.matchId.length>200)throw new Error("Invalid medical identity");
  const condition={personId:injury.personId,incidentWeekIndex:injuredWeekIndex,
   weeksOut:injury.weeksOut,severity:injury.severity as MedicalSeverity};
  const cleared_week_index=medicalClearanceWeek(condition);
  if(!ordered.has(injury.personId))ordered.set(injury.personId,{
   person_id:injury.personId,match_id:fact.matchId,weeks_out:injury.weeksOut,
   severity:condition.severity,cleared_week_index
  });
 }
 if(!ordered.size)return;
 if(ordered.size>100)throw new Error("Too many medical incidents in one show");
 const written=await tx.query<{person_id:string;severity:string;
  weeks_out:number;cleared_week_index:number}>(`
 INSERT INTO ppw_medical_absences
 (world_id,person_id,show_id,match_id,injured_week_index,
  cleared_week_index,weeks_out,severity,status)
 SELECT $1,x.person_id,$2,x.match_id,$3,x.cleared_week_index,
  x.weeks_out,x.severity,'ACTIVE'
 FROM jsonb_to_recordset($4::jsonb) x(person_id text,match_id text,
   cleared_week_index integer,weeks_out integer,severity text)
 ON CONFLICT(world_id,person_id) DO UPDATE SET
  show_id=excluded.show_id,match_id=excluded.match_id,
  injured_week_index=excluded.injured_week_index,
  cleared_week_index=excluded.cleared_week_index,
  weeks_out=excluded.weeks_out,severity=excluded.severity,
  status='ACTIVE',recorded_at=now()
 WHERE ppw_medical_absences.status='RECOVERED'
   OR ppw_medical_absences.cleared_week_index<=excluded.injured_week_index
 RETURNING person_id,severity,weeks_out,cleared_week_index`,[
  input.worldId,input.showId,injuredWeekIndex,JSON.stringify([...ordered.values()])
 ]);
 if(written.length>ordered.size)throw new Error("Unexpected medical write count");
 if(!written.length)return;
 await tx.query(`INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)
  VALUES($1,$2,$3,'WRESTLER_INJURED',$4::jsonb)`,[
   input.worldId,input.year,input.week,JSON.stringify({
    showId:input.showId,injuries:written.map(x=>({personId:x.person_id,
     severity:x.severity,weeksOut:x.weeks_out,
     clearedWeekIndex:x.cleared_week_index}))
   })
 ]);
}
/** One original-main countdown and set-based status settlement per authorised
 * World rollover. Repeated commands never duplicate clearance notices.
 */
export async function settleMedicalAvailabilityForNewWeek(tx:SqlRows,worldId:string,
 nextWeekIndex:number,year:number,week:number):Promise<void>{
 if(!worldId||!Number.isSafeInteger(nextWeekIndex)||nextWeekIndex<1||
  !Number.isSafeInteger(year)||year<1||!Number.isSafeInteger(week)||
  week<1||week>52)throw new Error("Invalid medical weekly rollover");
 const cleared=await tx.query<{person_id:string;severity:string;weeks_out:number}>(`
  UPDATE ppw_medical_absences SET status='RECOVERED'
  WHERE world_id=$1 AND status='ACTIVE' AND cleared_week_index<=$2
  RETURNING person_id,severity,weeks_out`,[worldId,nextWeekIndex]);
 if(cleared.length){
  await tx.query(`UPDATE ppw_people SET status='ACTIVE'
   WHERE world_id=$1 AND status='INJURED' AND person_id=ANY($2::text[])`,[
    worldId,cleared.map(x=>x.person_id)
   ]);
  await tx.query(`INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)
   VALUES($1,$2,$3,'WRESTLER_CLEARED_TO_RETURN',$4::jsonb)`,[
   worldId,year,week,JSON.stringify({people:cleared.map(x=>({
    personId:x.person_id,severity:x.severity,weeksOut:x.weeks_out
   }))})
  ]);
 }
 await tx.query(`UPDATE ppw_people p SET status='INJURED'
  FROM ppw_medical_absences a WHERE p.world_id=$1 AND a.world_id=p.world_id
   AND p.person_id=a.person_id AND p.status='ACTIVE'
   AND a.status='ACTIVE' AND a.injured_week_index<$2
   AND a.cleared_week_index>$2`,[worldId,nextWeekIndex]);
}

/** Original-main recoverWrestlersForNewWeek: recoveryBase (14) +
 * stamina / 12, rounded to tenths. One bounded set-based write, zero result
 * rows transferred. Called exactly once inside certified World rollover.
 */
export async function settleWeeklyFatigueRecovery(
 tx:SqlRows,worldId:string):Promise<void>{
 if(!worldId||worldId.length>200)throw new Error("Invalid fatigue recovery World");
 await tx.query(`UPDATE ppw_people
  SET fatigue=round(greatest(0::numeric,
   fatigue::numeric-(14::numeric+stamina::numeric/12)),1)::double precision
  WHERE world_id=$1 AND status<>'RETIRED'
   AND fatigue IS NOT NULL AND stamina IS NOT NULL AND fatigue>0`,[worldId]);
}
