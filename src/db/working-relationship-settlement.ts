/** Audited, World-authoritative professional partnership evolution.
 * Called only after canonical match results have been frozen. No relationship
 * changes on view, preview, booking, losing, scripted turns or personal feud.
 */
import type {SqlRows} from "./world-operations.js";
import {evolveWorkingPartnership} from "../domain/working-relationship-evolution.js";
export interface SettledWorkingTag{
 matchId:string;executionQuality:number;sideA:readonly string[];sideB:readonly string[];
}
export interface WorkingPartnershipScope{
 worldId:string;showId:string;year:number;week:number;
 matches:readonly SettledWorkingTag[];
}
const pair=(a:string,b:string)=>a<b?{person_a_id:a,person_b_id:b}:
 {person_a_id:b,person_b_id:a};
export async function settleWorkingPartnerships(tx:SqlRows,input:WorkingPartnershipScope):
 Promise<{appearances:number;developments:number}>{
 const weekIndex=(input.year-1)*52+input.week-1;
 if(!input.worldId||!input.showId||input.matches.length>100||
  !Number.isSafeInteger(weekIndex)||weekIndex<0||input.week<1||input.week>52)
  throw new Error("Invalid settled team show");
 const appearances=input.matches.flatMap(m=>{
  const members=[...m.sideA,...m.sideB];
  if(!m.matchId||!Number.isFinite(m.executionQuality)||
   m.executionQuality<0||m.executionQuality>100||
   ![2,3].includes(m.sideA.length)||m.sideB.length!==m.sideA.length||
   new Set(members).size!==members.length||
   members.some(p=>typeof p!=="string"||!p||p.length>200))
   throw new Error("Only verified 2v2 or 3v3 completed matches develop working trust");
  // A certified trios bout establishes evidence for each of the three
  // teammate pairs. It does NOT fabricate previous weeks or reward a
  // trio simply because its name was entered in the management screen.
  return [m.sideA,m.sideB].flatMap(ids=>ids.flatMap((left,i)=>
   ids.slice(i+1).map(right=>({
    ...pair(left,right),show_id:input.showId,match_id:m.matchId,
    week_index:weekIndex,execution_quality:m.executionQuality,
   }))));
 });
 if(appearances.length>100||new Set(appearances.map(a=>
  a.person_a_id+"|"+a.person_b_id)).size!==appearances.length)
  throw new Error("Team working evidence must be one pair per completed show");
 if(!appearances.length)return {appearances:0,developments:0};
 const inserted=await tx.query<{person_a_id:string}>([
  "INSERT INTO ppw_tag_working_pair_appearances(world_id,show_id,match_id,",
  "person_a_id,person_b_id,week_index,execution_quality)",
  "SELECT $1,x.show_id,x.match_id,x.person_a_id,x.person_b_id,",
  "x.week_index,x.execution_quality FROM jsonb_to_recordset($2::jsonb) AS x(",
  "show_id text,match_id text,person_a_id text,person_b_id text,",
  "week_index integer,execution_quality double precision) RETURNING person_a_id"
 ].join(" "),[input.worldId,JSON.stringify(appearances)]);
 if(inserted.length!==appearances.length)
  throw new Error("Failed to retain real completed tag appearances");
 const pairs=appearances.map(a=>({person_a_id:a.person_a_id,person_b_id:a.person_b_id}));
 const evidence=await tx.query<{person_a_id:string;person_b_id:string;
  good_shows:string|number;poor_shows:string|number;has_good:boolean}>([
  "SELECT e.person_a_id,e.person_b_id,",
  "count(DISTINCT e.show_id) FILTER(WHERE e.execution_quality>=68) AS good_shows,",
  "count(DISTINCT e.show_id) FILTER(WHERE e.execution_quality<=40",
  "AND e.week_index >=$3) AS poor_shows,",
  "coalesce(bool_or(e.execution_quality>=68),false) AS has_good",
  "FROM ppw_tag_working_pair_appearances e",
  "JOIN jsonb_to_recordset($2::jsonb) AS x(",
  "person_a_id text,person_b_id text)",
  "ON x.person_a_id=e.person_a_id AND x.person_b_id=e.person_b_id",
  "WHERE e.world_id=$1 AND e.week_index BETWEEN $4 AND $5",
  "GROUP BY e.person_a_id,e.person_b_id"
 ].join(" "),[input.worldId,JSON.stringify(pairs),Math.max(0,weekIndex-9),
  Math.max(0,weekIndex-11),weekIndex]);
 if(evidence.length!==pairs.length)
  throw new Error("Missing accepted partner match evidence");
 const existing=await tx.query<{person_a_id:string;person_b_id:string;
  professional_trust:number;familiarity:number;
  last_improved_week_index:number|null;last_strained_week_index:number|null}>([
  "SELECT r.person_a_id,r.person_b_id,r.professional_trust,r.familiarity,",
  "r.last_improved_week_index,r.last_strained_week_index",
  "FROM ppw_wrestler_relationships r JOIN jsonb_to_recordset($2::jsonb) AS x(",
  "person_a_id text,person_b_id text) ON x.person_a_id=r.person_a_id",
  "AND x.person_b_id=r.person_b_id WHERE r.world_id=$1"
 ].join(" "),[input.worldId,JSON.stringify(pairs)]);
 const key=(a:string,b:string)=>JSON.stringify([a,b]);
 const previous=new Map(existing.map(x=>[key(x.person_a_id,x.person_b_id),x]));
 const byEvidence=new Map(evidence.map(x=>[key(x.person_a_id,x.person_b_id),x]));
 const developments=appearances.flatMap(a=>{
  const k=key(a.person_a_id,a.person_b_id);
  const e=byEvidence.get(k);
  if(!e)throw new Error("Partner scoring evidence unavailable");
  const prior=previous.get(k);
  const d=evolveWorkingPartnership({
   goodShows12:Number(e.good_shows),poorShows10:Number(e.poor_shows),
   hasGood12:e.has_good,currentExecution:a.execution_quality,
   currentWeekIndex:weekIndex,
  },prior?{
   professionalTrust:prior.professional_trust,familiarity:prior.familiarity,
   lastImprovedWeekIndex:prior.last_improved_week_index,
   lastStrainedWeekIndex:prior.last_strained_week_index,
  }:null);
  return d?[{...a,kind:d.kind,trust:d.professionalTrust,
   familiarity:d.familiarity,trust_delta:d.trustDelta,
   familiarity_delta:d.familiarityDelta,verified_shows:d.verifiedShows}]:[];
 });
 if(developments.length){
  const saved=await tx.query<{person_a_id:string}>([
   "INSERT INTO ppw_wrestler_relationships(world_id,person_a_id,person_b_id,",
   "professional_trust,familiarity,last_improved_week_index,",
   "last_strained_week_index,last_change_week_index,last_change_type)",
   "SELECT $1,x.person_a_id,x.person_b_id,x.trust,x.familiarity,",
   "CASE WHEN x.kind='IMPROVEMENT' THEN $3::integer ELSE NULL END,",
   "CASE WHEN x.kind='STRAIN' THEN $3::integer ELSE NULL END,$3,x.kind",
   "FROM jsonb_to_recordset($2::jsonb) AS x(",
   "person_a_id text,person_b_id text,trust double precision,",
   "familiarity double precision,kind text)",
   "ON CONFLICT(world_id,person_a_id,person_b_id) DO UPDATE SET",
   "professional_trust=EXCLUDED.professional_trust,",
   "familiarity=EXCLUDED.familiarity,",
   "last_change_week_index=EXCLUDED.last_change_week_index,",
   "last_change_type=EXCLUDED.last_change_type,",
   "last_improved_week_index=coalesce(EXCLUDED.last_improved_week_index,",
   "ppw_wrestler_relationships.last_improved_week_index),",
   "last_strained_week_index=coalesce(EXCLUDED.last_strained_week_index,",
   "ppw_wrestler_relationships.last_strained_week_index)",
   "RETURNING person_a_id"
  ].join(" "),[input.worldId,JSON.stringify(developments),weekIndex]);
  if(saved.length!==developments.length)throw new Error("Relationship row changed");
  const changes=await tx.query<{person_a_id:string}>([
   "INSERT INTO ppw_wrestler_relationship_changes(world_id,person_a_id,",
   "person_b_id,week_index,show_id,match_id,change_type,trust_delta,",
   "familiarity_delta,verified_shows)",
   "SELECT $1,x.person_a_id,x.person_b_id,$3,x.show_id,x.match_id,",
   "x.kind,x.trust_delta,x.familiarity_delta,x.verified_shows",
   "FROM jsonb_to_recordset($2::jsonb) AS x(",
   "person_a_id text,person_b_id text,show_id text,match_id text,",
   "kind text,trust_delta double precision,familiarity_delta double precision,",
   "verified_shows integer) RETURNING person_a_id"
  ].join(" "),[input.worldId,JSON.stringify(developments),weekIndex]);
  if(changes.length!==developments.length)
   throw new Error("Relationship career history missing");
  // One batched, factual ledger write; never publish a fabricated personal dispute.
  await tx.query([
   "INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)",
   "SELECT $1,$3,$4,CASE WHEN x.kind='IMPROVEMENT'",
   "THEN 'WRESTLER_WORKING_PARTNERSHIP_DEVELOPED'",
   "ELSE 'WRESTLER_WORKING_PARTNERSHIP_STRAINED' END,",
   "jsonb_build_object('personAId',x.person_a_id,",
   "'personBId',x.person_b_id,'sourceShowId',x.show_id,",
   "'sourceMatchId',x.match_id,'trustDelta',x.trust_delta,",
   "'familiarityDelta',x.familiarity_delta,'verifiedShows',x.verified_shows)",
   "FROM jsonb_to_recordset($2::jsonb) AS x(",
   "person_a_id text,person_b_id text,show_id text,match_id text,",
   "kind text,trust_delta double precision,familiarity_delta double precision,",
   "verified_shows integer)"
  ].join(" "),[input.worldId,JSON.stringify(developments),input.year,input.week]);
 }
 return {appearances:inserted.length,developments:developments.length};
}
