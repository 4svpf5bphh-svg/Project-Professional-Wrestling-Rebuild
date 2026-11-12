/** Apply the original singles match career consequences after an authoritative
 * completed show has been inserted. The precomputed preview is deterministic
 * and never mutates wrestler records until this one bounded World transaction.
 *
 * Tag and multi-person formats settle separately. No independent timer, random
 * reroll or second receipt can cause duplicate momentum awards.
 */
import type {SqlRows} from "./world-operations.js";
import type {previewArchivedShowMatchScoresInTransaction}
 from "./legacy-match-scoring.js";
type Projection=Awaited<ReturnType<typeof previewArchivedShowMatchScoresInTransaction>>;

export async function settleCanonicalSinglesCareerConsequences(
 tx:SqlRows,projection:Projection,
):Promise<{performers:number;matches:number}>{
 // Older/partially imported Worlds can certify a singles result before
 // media-reach and injury ruleset attributes are available. They were never
 // given speculative career updates; retain that compatibility instead of
 // blocking an unrelated premium or AI show. A scored match still settles.
 const singles=projection.projections.filter(p=>p.tag===null&&p.multi===null);
 const scored=singles.filter(p=>p.consequencesPreview!==null);
 if(!scored.length)return {performers:0,matches:0};
 if(scored.length>50||scored.some(p=>p.consequencesPreview!.performers.length!==2))
  throw new Error("Incomplete certified singles career consequences");
 const effects=scored.flatMap(p=>p.consequencesPreview!.performers);
 if(effects.length!==scored.length*2||effects.length>100||
   new Set(effects.map(p=>p.personId)).size!==effects.length||
   effects.some(p=>Object.values(p.before).some(n=>!Number.isFinite(n))||
    Object.values(p.after).some(n=>!Number.isFinite(n))||
    Object.values(p.before).some(n=>n<0||n>100)||
    Object.values(p.after).some(n=>n<0||n>100)))
  throw new Error("Singles career settlement requires unique valid wrestlers");
 const values=effects.map(p=>({
  person_id:p.personId,
  before_fatigue:p.before.fatigue,after_fatigue:p.after.fatigue,
  before_wear:p.before.wear,after_wear:p.after.wear,
  before_momentum:p.before.momentum,after_momentum:p.after.momentum,
  before_recognition:p.before.recognition,after_recognition:p.after.recognition,
  before_popularity:p.before.popularity,after_popularity:p.after.popularity
 }));
 const written=await tx.query<{person_id:string}>(`
  UPDATE ppw_people p SET
   fatigue=x.after_fatigue,wear=x.after_wear,
   momentum=x.after_momentum,recognition=x.after_recognition,
   popularity=x.after_popularity
  FROM jsonb_to_recordset($2::jsonb) AS x(
   person_id text,before_fatigue double precision,after_fatigue double precision,
   before_wear double precision,after_wear double precision,
   before_momentum double precision,after_momentum double precision,
   before_recognition double precision,after_recognition double precision,
   before_popularity double precision,after_popularity double precision)
  WHERE p.world_id=$1 AND p.person_id=x.person_id
   AND (p.status='ACTIVE' OR (p.status='INJURED' AND EXISTS (
    SELECT 1 FROM ppw_medical_absences a
    WHERE a.world_id=p.world_id AND a.person_id=p.person_id
     AND a.status='ACTIVE' AND a.injured_week_index=$3)))
   AND p.fatigue=x.before_fatigue AND p.wear=x.before_wear
   AND p.momentum=x.before_momentum
   AND p.recognition=x.before_recognition AND p.popularity=x.before_popularity
  RETURNING p.person_id
 `,[projection.worldId,JSON.stringify(values),(projection.year-1)*52+projection.week-1]);
 if(written.length!==effects.length)
  throw new Error("Singles wrestler baseline moved; entire show must roll back");
 // A singles winner's original PPW form must remain verifiable in the same
 // certified ledger as multi-person and tag results. Without this receipt,
 // historic win/loss records and contenders never see the actual singles bout.
 const history=scored.flatMap(p=>p.consequencesPreview!.performers.map(member=>({
  show_id:projection.showId,match_id:p.slotId,person_id:member.personId,
  actual_winner_side:p.personIds[0]===p.consequencesPreview!.actualWinnerId?"A":"B",
  performer_side:p.personIds[0]===member.personId?"A":"B",
  won:member.won,before_stats:member.before,after_stats:member.after,
  injury_severity:member.injury?.severity??null,
  injury_weeks_out:member.injury?.weeksOut??null,
 })));
 const recorded=await tx.query<{person_id:string}>(`
  INSERT INTO ppw_individual_field_career_effects(
   world_id,show_id,match_id,person_id,actual_winner_side,
   performer_side,won,before_stats,after_stats,injury_severity,injury_weeks_out)
  SELECT $1,x.show_id,x.match_id,x.person_id,x.actual_winner_side,
   x.performer_side,x.won,x.before_stats,x.after_stats,
   x.injury_severity,x.injury_weeks_out
  FROM jsonb_to_recordset($2::jsonb) AS x(
   show_id text,match_id text,person_id text,
   actual_winner_side text,performer_side text,won boolean,
   before_stats jsonb,after_stats jsonb,
   injury_severity text,injury_weeks_out integer)
  RETURNING person_id`,[projection.worldId,JSON.stringify(history)]);
 if(recorded.length!==history.length)
  throw new Error("Incomplete certified singles career history");
 return {performers:written.length,matches:scored.length};
}
