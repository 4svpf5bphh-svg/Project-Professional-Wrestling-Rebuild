/** Canonical programme lifecycle from the original PPW, adapted to row-scoped
 * Neon access. A programme belongs to one promotion, not the whole roster.
 */
import {randomUUID} from "node:crypto";
import {applyWorldCommand} from "./world-commands.js";
import {withSqlClient} from "./postgres.js";
import type {TransactionPool} from "./transaction.js";
import type {SqlRows} from "./world-operations.js";
import {programmeIdentity,validateProgrammeSides,type ProgrammeRef,type ProgrammeSides}
 from "../domain/programme-lifecycle.js";
type Scope={worldId:string;promotionId:string;playerId:string};
export type ProgrammeCommandInput=Scope&{requestId:string;expectedRevision:number};
export type StartProgrammeInput=ProgrammeCommandInput&ProgrammeSides&{championshipId?:string|null};
export type EndProgrammeInput=ProgrammeCommandInput&{programmeId:string};
export type ProgrammeDirectionChoice="PURSUE_REMATCH"|"PLAN_RETALIATION"|"LET_STAND";
export type ProgrammeDirectionInput=ProgrammeCommandInput&{
 programmeId:string;showId:string;slotId:string;choice:ProgrammeDirectionChoice;
};
type Auth={year:number;week:number;revision:string|number;phase:string;booking_open:boolean};
const valid=(v:unknown):v is string=>typeof v==="string"&&v.trim().length>0&&v.length<=200;
async function assertPromotion(tx:SqlRows,scope:Scope):Promise<Auth>{
 if(![scope.worldId,scope.playerId,scope.promotionId].every(valid))
  throw new Error("Invalid programme identity");
 const auth=await tx.query<Auth>([
  "SELECT w.year,w.week,w.revision,w.phase,",
  "(w.phase='OPEN' AND w.next_lock_at>clock_timestamp()) AS booking_open",
  "FROM ppw_worlds w JOIN ppw_promotion_controls c ON c.world_id=w.world_id",
  "JOIN ppw_memberships m ON m.world_id=c.world_id AND m.player_id=c.player_id",
  "JOIN ppw_promotions p ON p.world_id=c.world_id AND p.promotion_id=c.promotion_id",
  "WHERE w.world_id=$1 AND c.player_id=$2 AND c.promotion_id=$3",
  "AND c.active AND m.status='ACTIVE' AND p.lifecycle='ACTIVE'"
 ].join(" "),[scope.worldId,scope.playerId,scope.promotionId]);
 if(auth.length!==1)throw new Error("Promotion programmes are not accessible");
 return auth[0]!;
}
export async function readProgrammeWorkspace(pool:TransactionPool,scope:Scope){
 return withSqlClient(pool,async tx=>{
  const auth=await assertPromotion(tx,scope),currentWeek=(auth.year-1)*52+auth.week-1;
  const rows=await tx.query<{programme_id:string;status:string;heat:number|null;
   repetition:number;activity_count:number;match_count:number;segment_count:number;
   side_a_wins:number;side_b_wins:number;draws:number;
   championship_id:string|null;started_week_index:number|null;
   ended_week_index:number|null;direction_choice:ProgrammeDirectionChoice|null;
   direction_show_id:string|null;direction_slot_id:string|null;
   direction_week_index:number|null}>([
   "SELECT programme.programme_id,programme.status,programme.heat,programme.repetition,programme.championship_id,",
   "started_week_index,ended_week_index,activity_count,match_count,",
   "segment_count,side_a_wins,side_b_wins,draws,",
   "direction.choice AS direction_choice,direction.show_id AS direction_show_id,",
   "direction.slot_id AS direction_slot_id,direction.chosen_week_index AS direction_week_index",
   "FROM ppw_programmes programme",
   "LEFT JOIN LATERAL (SELECT d.choice,d.show_id,d.slot_id,d.chosen_week_index",
   "FROM ppw_programme_postshow_directions d",
   "WHERE d.world_id=programme.world_id AND d.promotion_id=programme.promotion_id",
   "AND d.programme_id=programme.programme_id",
   "ORDER BY d.chosen_week_index DESC,d.chosen_at DESC LIMIT 1) direction ON TRUE",
   "WHERE programme.world_id=$1 AND programme.promotion_id=$2",
   "ORDER BY CASE WHEN programme.status='ACTIVE' THEN 0 ELSE 1 END,",
   "programme.started_week_index DESC NULLS LAST,programme.programme_id LIMIT 101"
  ].join(" "),[scope.worldId,scope.promotionId]);
  if(rows.length>100)throw new Error("Programme capacity exceeded");
  const programmes=rows.map(p=>p.programme_id);
  const refs=programmes.length?await tx.query<{programme_id:string;side:"A"|"B";
   position:number;ref_kind:"PERSON"|"TEAM";ref_id:string}>([
   "SELECT programme_id,side,position,ref_kind,ref_id FROM ppw_programme_side_refs",
   "WHERE world_id=$1 AND promotion_id=$2 AND programme_id=ANY($3::text[])",
   "ORDER BY programme_id,side,position LIMIT 401"
  ].join(" "),[scope.worldId,scope.promotionId,programmes]):[];
  if(refs.length>400)throw new Error("Programme refs exceed bounded capacity");
  // Distinct signed roster: no per-wrestler queries, and zero date balances
  // still count as on-roster if the agreement itself remains in force.
  const roster=await tx.query<{person_id:string;name:string;full_approval:boolean}>([
   "SELECT p.person_id,p.name,",
   "bool_or(c.creative_control='FULL_APPROVAL') AS full_approval",
   "FROM ppw_people p JOIN ppw_contracts c",
   "ON c.world_id=p.world_id AND c.person_id=p.person_id",
   "WHERE p.world_id=$1 AND c.promotion_id=$2 AND p.status='ACTIVE'",
   "AND c.status='SIGNED' AND c.start_week_index<=$3",
   "AND c.expires_week_index>=$3",
   "GROUP BY p.person_id,p.name ORDER BY p.name,p.person_id LIMIT 501"
  ].join(" "),[scope.worldId,scope.promotionId,currentWeek]);
  if(roster.length>500)throw new Error("Roster too large for programme editor");
  const teams=await tx.query<{team_id:string;name:string;person_ids:string[]}>([
   "SELECT t.team_id,t.name,array_agg(m.person_id ORDER BY m.person_id) AS person_ids",
   "FROM ppw_tag_teams t JOIN ppw_tag_team_members m",
   "ON m.world_id=t.world_id AND m.team_id=t.team_id AND m.active",
   "WHERE t.world_id=$1 AND t.status='ACTIVE'",
   "AND m.person_id=ANY($2::text[])",
   "GROUP BY t.world_id,t.team_id,t.name HAVING count(*) BETWEEN 2 AND 5",
   "AND count(*)=(SELECT count(*) FROM ppw_tag_team_members whole",
   "WHERE whole.world_id=t.world_id AND whole.team_id=t.team_id",
   "AND whole.active)",
   "ORDER BY t.name,t.team_id LIMIT 151"
  ].join(" "),[scope.worldId,roster.map(x=>x.person_id)]);
  if(teams.length>150)throw new Error("Too many tag teams for programme editor");
  const championships=await tx.query<{championship_id:string;name:string;division:string}>([
   "SELECT championship_id,name,division FROM ppw_championships",
   "WHERE world_id=$1 AND promotion_id=$2 AND status='ACTIVE'",
   "ORDER BY name,championship_id LIMIT 101"
  ].join(" "),[scope.worldId,scope.promotionId]);
  if(championships.length>100)throw new Error("Too many championships");
  const names=new Map(roster.map(p=>[p.person_id,p.name]));
  const teamOptions=teams.filter(t=>t.person_ids.every(id=>names.has(id)));
  const teamNames=new Map(teamOptions.map(t=>[t.team_id,t.name]));
  const recent=programmes.length?await tx.query<{programme_id:string;show_id:string;
   slot_id:string;kind:string;week_index:number;crowd_response:number}>([
   "SELECT programme_id,show_id,slot_id,kind,week_index,crowd_response",
   "FROM ppw_programme_resolved_activities",
   "WHERE world_id=$1 AND promotion_id=$2 AND programme_id=ANY($3::text[])",
   "ORDER BY week_index DESC,show_id,slot_id LIMIT 151"
  ].join(" "),[scope.worldId,scope.promotionId,programmes]):[];
  if(recent.length>150)throw new Error("Programme history view limit exceeded");
  // The roster already knows whether signed talent holds full approval rights.
  // Read at most 300 recorded terms in one indexed statement, keeping the
  // original seven-statement Programme budget (even with active rivalries).
  const fullPeople=new Set(roster.filter(x=>x.full_approval).map(x=>x.person_id));
  const agreements=programmes.length?await tx.query<{
   programme_id:string;person_id:string;approved:boolean;score:number;
   decided_week_index:number;expires_week_index:number;
   match_type:string;permitted_outcome:string;
  }>([
   "SELECT programme_id,person_id,approved,score,decided_week_index,",
   "expires_week_index,match_type,permitted_outcome",
   "FROM ppw_programme_creative_agreements",
   "WHERE world_id=$1 AND promotion_id=$2 AND programme_id=ANY($3::text[])",
   "ORDER BY programme_id,person_id LIMIT 301"
  ].join(" "),[scope.worldId,scope.promotionId,programmes]):[];
  if(agreements.length>300)throw new Error("Too many rivalry agreements");
  const programmesView=rows.map(p=>{
   const own=refs.filter(x=>x.programme_id===p.programme_id);
   const side=(which:"A"|"B")=>own.filter(x=>x.side===which).map(x=>({
    kind:x.ref_kind,refId:x.ref_id,
    name:x.ref_kind==="PERSON"?names.get(x.ref_id)??x.ref_id:
     teamNames.get(x.ref_id)??x.ref_id,
   }));
   return {programmeId:p.programme_id,status:p.status,heat:p.heat,
    repetition:p.repetition,activityCount:p.activity_count,
    matchCount:p.match_count,segmentCount:p.segment_count,
    sideAWins:p.side_a_wins,sideBWins:p.side_b_wins,draws:p.draws,
    championshipId:p.championship_id,
    startedWeekIndex:p.started_week_index,endedWeekIndex:p.ended_week_index,
    latestFollowUp:p.direction_choice===null?null:{
     choice:p.direction_choice,showId:p.direction_show_id!,
     slotId:p.direction_slot_id!,weekIndex:p.direction_week_index!
    },
    recentActivity:recent.filter(x=>x.programme_id===p.programme_id)
     .slice(0,5).map(x=>({showId:x.show_id,slotId:x.slot_id,
      kind:x.kind,weekIndex:x.week_index,crowdResponse:x.crowd_response})),
    sideA:side("A"),sideB:side("B"),
    eligibleCreativePeople:[...new Set(own.flatMap(x=>
     x.ref_kind==="PERSON"?[x.ref_id]:
     teamOptions.find(t=>t.team_id===x.ref_id)?.person_ids??[]))]
     .filter(id=>fullPeople.has(id)).map(id=>({personId:id,name:names.get(id)??id})),
    creativeAgreements:agreements.filter(a=>a.programme_id===p.programme_id)
     .map(a=>({personId:a.person_id,approved:a.approved,score:a.score,
      decidedWeekIndex:a.decided_week_index,expiresWeekIndex:a.expires_week_index,
      matchType:a.match_type,permittedOutcome:a.permitted_outcome}))
   };
  });
  return {year:auth.year,week:auth.week,worldRevision:Number(auth.revision),
   canEdit:auth.booking_open,programmes:programmesView,
   championships:championships.map(c=>({
    championshipId:c.championship_id,name:c.name,division:c.division})),
   people:roster.map(p=>({kind:"PERSON" as const,refId:p.person_id,name:p.name})),
   teams:teamOptions.map(t=>({kind:"TEAM" as const,refId:t.team_id,name:t.name,
    memberIds:t.person_ids})),
  };
 });
}
export async function startProgramme(pool:TransactionPool,input:StartProgrammeInput){
 const sides=validateProgrammeSides(input);
 if(input.championshipId!==undefined&&input.championshipId!==null&&!valid(input.championshipId))
  throw new Error("Invalid programme championship");
 const identity=programmeIdentity(sides);
 return applyWorldCommand(pool,{
  worldId:input.worldId,playerId:input.playerId,requestId:input.requestId,
  expectedRevision:input.expectedRevision,commandType:"START_PROGRAMME",
  requiresOpenWeek:true,
  execute:async tx=>{
   const auth=await assertPromotion(tx,input);
   if(!auth.booking_open)throw new Error("Programme booking closed");
   const refs=[...sides.sideA.map((r,position)=>({...r,side:"A",position})),
    ...sides.sideB.map((r,position)=>({...r,side:"B",position}))];
   const teamIds=refs.filter(x=>x.kind==="TEAM").map(x=>x.refId);
   const members=teamIds.length?await tx.query<{team_id:string;person_id:string;status:string}>([
    "SELECT t.team_id,m.person_id,t.status FROM ppw_tag_teams t",
    "JOIN ppw_tag_team_members m ON m.world_id=t.world_id AND m.team_id=t.team_id",
    "WHERE t.world_id=$1 AND t.team_id=ANY($2::text[]) AND m.active LIMIT 31"
   ].join(" "),[input.worldId,teamIds]):[];
   if(members.length>30)throw new Error("Programme team size limit exceeded");
   const membersByTeam=new Map<string,string[]>();
   for(const m of members){
    const a=membersByTeam.get(m.team_id)??[];a.push(m.person_id);
    membersByTeam.set(m.team_id,a);
    if(m.status!=="ACTIVE")throw new Error("Disbanded tag team cannot feud");
   }
   for(const id of teamIds){
    const a=membersByTeam.get(id);
    if(!a||a.length<2||a.length>5)throw new Error("Programme team needs 2–5 active wrestlers");
   }
   const everyone=refs.flatMap(x=>x.kind==="PERSON"?[x.refId]:
    membersByTeam.get(x.refId)??[]);
   const unique=[...new Set(everyone)];
   if(everyone.length!==unique.length)
    throw new Error("Programme cannot select a wrestler through two participants");
   if(unique.length>20)throw new Error("Programme exceeds 20 wrestlers");
   const currentWeek=(auth.year-1)*52+auth.week-1;
   const roster=await tx.query<{person_id:string}>([
    "SELECT p.person_id FROM ppw_people p",
    "WHERE p.world_id=$1 AND p.person_id=ANY($3::text[]) AND p.status='ACTIVE'",
    "AND EXISTS(SELECT 1 FROM ppw_contracts c",
    "WHERE c.world_id=p.world_id AND c.person_id=p.person_id",
    "AND c.promotion_id=$2 AND c.status='SIGNED'",
    "AND c.start_week_index<=$4 AND c.expires_week_index>=$4)"
   ].join(" "),[input.worldId,input.promotionId,unique,currentWeek]);
   if(roster.length!==unique.length)
    throw new Error("Programme participants must be on the current roster");
   if(input.championshipId){
    const titles=await tx.query<{championship_id:string}>([
     "SELECT championship_id FROM ppw_championships",
     "WHERE world_id=$1 AND promotion_id=$2 AND championship_id=$3",
     "AND status='ACTIVE'"
    ].join(" "),[input.worldId,input.promotionId,input.championshipId]);
    if(titles.length!==1)throw new Error("Programme championship must be active and promotion-owned");
   }
   const duplicate=await tx.query<{programme_id:string}>([
    "SELECT programme_id FROM ppw_programmes",
    "WHERE world_id=$1 AND promotion_id=$2",
    "AND status='ACTIVE' AND programme_key=$3"
   ].join(" "),[input.worldId,input.promotionId,identity]);
   if(duplicate.length)throw new Error("This active rivalry already exists");
   const programmeId="programme-"+randomUUID();
   await tx.query([
    "INSERT INTO ppw_programmes(world_id,promotion_id,programme_id,status,",
    "heat,repetition,started_week_index,championship_id,programme_key)",
    "VALUES($1,$2,$3,'ACTIVE',NULL,0,$4,$5,$6)"
   ].join(" "),[input.worldId,input.promotionId,programmeId,currentWeek,
    input.championshipId??null,identity]);
   const inserted=await tx.query<{ref_id:string}>([
    "INSERT INTO ppw_programme_side_refs(world_id,promotion_id,programme_id,",
    "side,position,ref_kind,ref_id)",
    "SELECT $1,$2,$3,x.side,x.position,x.kind,x.ref_id",
    "FROM jsonb_to_recordset($4::jsonb) AS x(",
    "side text,position smallint,kind text,ref_id text) RETURNING ref_id"
   ].join(" "),[input.worldId,input.promotionId,programmeId,
    JSON.stringify(refs.map(x=>({side:x.side,position:x.position,kind:x.kind,ref_id:x.refId})))]);
   if(inserted.length!==refs.length)throw new Error("Incomplete programme participants");
   const represented=[...sides.sideA.flatMap(x=>x.kind==="PERSON"?[x.refId]:membersByTeam.get(x.refId)??[])
    .map(person_id=>({person_id,side:"A"})),
    ...sides.sideB.flatMap(x=>x.kind==="PERSON"?[x.refId]:membersByTeam.get(x.refId)??[])
    .map(person_id=>({person_id,side:"B"}))];
   const attached=await tx.query<{person_id:string}>([
    "INSERT INTO ppw_programme_participants(world_id,promotion_id,programme_id,person_id,side)",
    "SELECT $1,$2,$3,x.person_id,x.side FROM",
    "jsonb_to_recordset($4::jsonb) AS x(person_id text,side text) RETURNING person_id"
   ].join(" "),[input.worldId,input.promotionId,programmeId,JSON.stringify(represented)]);
   if(attached.length!==unique.length)throw new Error("Incomplete programme wrestler sides");
   await tx.query([
    "INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)",
    "VALUES($1,$2,$3,'PROGRAMME_STARTED',",
    "jsonb_build_object('promotionId',$4::text,'programmeId',$5::text,",
    "'participants',$6::int,'championshipId',$7::text))"
   ].join(" "),[input.worldId,auth.year,auth.week,input.promotionId,
    programmeId,unique.length,input.championshipId??null]);
   return {programmeId,status:"ACTIVE" as const,participants:unique.length};
  }
 });
}
export async function endProgramme(pool:TransactionPool,input:EndProgrammeInput){
 if(!valid(input.programmeId))throw new Error("Invalid programme ID");
 return applyWorldCommand(pool,{
  worldId:input.worldId,playerId:input.playerId,requestId:input.requestId,
  expectedRevision:input.expectedRevision,commandType:"END_PROGRAMME",
  requiresOpenWeek:true,
  execute:async tx=>{
   const auth=await assertPromotion(tx,input);
   if(!auth.booking_open)throw new Error("Programme booking closed");
   const week=(auth.year-1)*52+auth.week-1;
   const ended=await tx.query<{programme_id:string;heat:number|null;repetition:number}>([
    "UPDATE ppw_programmes SET status='COMPLETED',ended_week_index=$4",
    "WHERE world_id=$1 AND promotion_id=$2 AND programme_id=$3 AND status='ACTIVE'",
    "RETURNING programme_id,heat,repetition"
   ].join(" "),[input.worldId,input.promotionId,input.programmeId,week]);
   if(ended.length!==1)throw new Error("Only an active promotion rivalry may be ended");
   await tx.query([
    "INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)",
    "VALUES($1,$2,$3,'PROGRAMME_ENDED',",
    "jsonb_build_object('promotionId',$4::text,'programmeId',$5::text,",
    "'heat',$6::float8,'repetition',$7::float8))"
   ].join(" "),[input.worldId,auth.year,auth.week,input.promotionId,
    input.programmeId,ended[0]!.heat,ended[0]!.repetition]);
   return {programmeId:input.programmeId,status:"COMPLETED" as const};
  },
 });
}

/** A booker records a next-story intention against the latest completed match.
 * Editing this reminder neither books a show nor alters a resolved finish.
 * Revision, actor ownership, World Lock and retry receipts are all enforced.
 */
export async function chooseProgrammeDirection(pool:TransactionPool,input:ProgrammeDirectionInput){
 if(![input.programmeId,input.showId,input.slotId].every(valid)||
  !["PURSUE_REMATCH","PLAN_RETALIATION","LET_STAND"].includes(input.choice))
  throw new Error("Choose a valid completed match and direction");
 return applyWorldCommand(pool,{
  worldId:input.worldId,playerId:input.playerId,
  requestId:input.requestId,expectedRevision:input.expectedRevision,
  commandType:"PROGRAMME_POSTSHOW_DIRECTION",requiresOpenWeek:true,
  execute:async tx=>{
   const auth=await assertPromotion(tx,input);
   if(!auth.booking_open)throw new Error("Creative decisions reopen after the deadline");
   const active=await tx.query<{programme_id:string}>([
    "SELECT programme_id FROM ppw_programmes WHERE world_id=$1",
    "AND promotion_id=$2 AND programme_id=$3 AND status='ACTIVE' LIMIT 1"
   ].join(" "),[input.worldId,input.promotionId,input.programmeId]);
   if(active.length!==1)throw new Error("The rivalry is no longer active");
   const latest=await tx.query<{show_id:string;slot_id:string;week_index:number}>([
    "SELECT show_id,slot_id,week_index FROM ppw_programme_resolved_activities",
    "WHERE world_id=$1 AND promotion_id=$2 AND programme_id=$3 AND kind='MATCH'",
    "ORDER BY week_index DESC,show_id DESC,slot_id DESC LIMIT 1"
   ].join(" "),[input.worldId,input.promotionId,input.programmeId]);
   if(latest.length!==1||latest[0]!.show_id!==input.showId||
    latest[0]!.slot_id!==input.slotId)
    throw new Error("Choose the latest completed rivalry match");
   await tx.query([
    "INSERT INTO ppw_programme_postshow_directions(world_id,promotion_id,programme_id,",
    "show_id,slot_id,chosen_week_index,choice) VALUES($1,$2,$3,$4,$5,$6,$7)",
    "ON CONFLICT(world_id,promotion_id,programme_id,show_id,slot_id)",
    "DO UPDATE SET choice=excluded.choice,chosen_week_index=excluded.chosen_week_index,",
    "chosen_at=clock_timestamp()"
   ].join(" "),[input.worldId,input.promotionId,input.programmeId,
    input.showId,input.slotId,latest[0]!.week_index,input.choice]);
   await tx.query([
    "INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)",
    "VALUES($1,$2,$3,'PROGRAMME_DIRECTION_CHOSEN',",
    "jsonb_build_object('promotionId',$4::text,'programmeId',$5::text,",
    "'showId',$6::text,'slotId',$7::text,'choice',$8::text))"
   ].join(" "),[input.worldId,auth.year,auth.week,input.promotionId,
    input.programmeId,input.showId,input.slotId,input.choice]);
   return {programmeId:input.programmeId,showId:input.showId,
    slotId:input.slotId,choice:input.choice};
  }
 });
}
