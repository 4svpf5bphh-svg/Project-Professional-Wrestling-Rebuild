import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {readProgrammeWorkspace,startProgramme,endProgramme,chooseProgrammeDirection}
 from "../src/db/programme-workspace.js";
import {saveCardEditorAsActor,showCardEditorAsActor}
 from "../src/api/world-service.js";
import {MeasuredQuerySession} from "../src/db/query-meter.js";
import type {TransactionPool} from "../src/db/transaction.js";
const url=process.env.PPW_NEON_TEST_URL;
test("a player creates, inspects and ends original two-sided wrestler and tag programmes with bounded PostgreSQL",
 {skip:!url?"No disposable PostgreSQL":false},async()=>{
 const db=postgresPool(url!,4),id=randomUUID(),worldId="programme-"+id;
 const promotionId="p-"+id,other="other-"+id,playerId="player-"+id;
 const people=["a","b","c","d"].map(x=>x+"-"+id);
 const scope={worldId,promotionId,playerId};
 const alice={kind:"PERSON" as const,refId:people[0]!};
 const bob={kind:"PERSON" as const,refId:people[1]!};
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:worldId,name:"Programme lifecycle",seed:91,rulesetVersion:"test"});
   await addPromotion(tx,worldId,{id:promotionId,name:"Controlled",tier:"LOCAL"});
   await addPromotion(tx,worldId,{id:other,name:"Other",tier:"LOCAL"});
   await tx.query("INSERT INTO ppw_players(player_id) VALUES($1)",[playerId]);
   await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status) VALUES($1,$2,'ACTIVE')",
    [worldId,playerId]);
   await tx.query("INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id) VALUES($1,$2,$3)",
    [worldId,playerId,promotionId]);
   for(let i=0;i<people.length;i++){
    await tx.query("INSERT INTO ppw_people(world_id,person_id,name,booking_division) VALUES($1,$2,$3,'MEN')",
     [worldId,people[i]!,"Wrestler "+i]);
    await tx.query("INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,family,status,remaining_dates,expires_week_index) VALUES($1,$2,$3,$4,'EXCLUSIVE','SIGNED',NULL,52)",
     [worldId,"contract-"+i+"-"+id,people[i]!,promotionId]);
   }
   await tx.query("INSERT INTO ppw_tag_teams(world_id,team_id,name,status) VALUES($1,'duo','The Unit','ACTIVE')",[worldId]);
   for(const x of people.slice(2))await tx.query(
    "INSERT INTO ppw_tag_team_members(world_id,team_id,person_id,active) VALUES($1,'duo',$2,true)",
    [worldId,x]);
   await tx.query("INSERT INTO ppw_championships(world_id,promotion_id,championship_id,name,division,status,prestige) VALUES($1,$2,'belt','Main Title','SINGLES','ACTIVE',65)",
    [worldId,promotionId]);
  });
  let view=await readProgrammeWorkspace(db.pool,scope);
  assert.equal(view.people.length,4);
  assert.equal(view.teams.length,1);
  assert.equal(view.championships[0]!.name,"Main Title");
  assert.equal(view.programmes.length,0);
  const one=await startProgramme(db.pool,{...scope,requestId:"start",expectedRevision:0,
   sideA:[alice],sideB:[bob],championshipId:"belt"});
  assert.equal(one.status,"APPLIED");
  if(one.status!=="APPLIED")throw Error("Must have applied");
  const replay=await startProgramme(db.pool,{...scope,requestId:"start",expectedRevision:0,
   sideA:[alice],sideB:[bob],championshipId:"belt"});
  assert.equal(replay.status,"REPLAYED");
  assert.equal(replay.result.programmeId,one.result.programmeId);
  view=await readProgrammeWorkspace(db.pool,scope);
  assert.equal(view.programmes.length,1);
  assert.equal(view.programmes[0]!.sideA[0]!.name,"Wrestler 0");
  assert.equal(view.programmes[0]!.championshipId,"belt");
  await assert.rejects(startProgramme(db.pool,{...scope,requestId:"duplicate",
   expectedRevision:1,sideA:[bob],sideB:[alice]}),/already exists/);
  const team=await startProgramme(db.pool,{...scope,requestId:"team",expectedRevision:1,
   sideA:[alice],sideB:[{kind:"TEAM",refId:"duo"}]});
  assert.equal(team.status,"APPLIED");
  view=await readProgrammeWorkspace(db.pool,scope);
  assert.equal(view.programmes.length,2);
  assert.equal(view.programmes.find(p=>p.programmeId===
   (team.status==="APPLIED"?team.result.programmeId:""))?.sideB[0]?.name,"The Unit");
  await assert.rejects(startProgramme(db.pool,{...scope,requestId:"overlap",
   expectedRevision:2,sideA:[{kind:"TEAM",refId:"duo"}],
   sideB:[{kind:"PERSON",refId:people[2]!}]}),/through two participants/);
  await assert.rejects(startProgramme(db.pool,{...scope,requestId:"foreign",
   expectedRevision:2,sideA:[alice],sideB:[{kind:"PERSON",refId:"missing"}]}),
   /current roster/);
  const intruder={...scope,playerId:"not-controller"};
  await assert.rejects(readProgrammeWorkspace(db.pool,intruder),/not accessible/);
  await assert.rejects(startProgramme(db.pool,{...intruder,requestId:"intruder",
   expectedRevision:2,sideA:[alice],sideB:[bob]}),/not accessible/);
  const finish=await endProgramme(db.pool,{...scope,requestId:"end",
   expectedRevision:2,programmeId:one.result.programmeId});
  assert.equal(finish.status,"APPLIED");
  assert.equal((await endProgramme(db.pool,{...scope,requestId:"end",
   expectedRevision:2,programmeId:one.result.programmeId})).status,"REPLAYED");
  view=await readProgrammeWorkspace(db.pool,scope);
  assert.equal(view.programmes.find(p=>p.programmeId===one.result.programmeId)?.status,"COMPLETED");
  assert.equal(view.programmes.find(p=>p.programmeId===one.result.programmeId)?.endedWeekIndex,0);
  const meter=new MeasuredQuerySession("feud-desk-active-and-concluded");
  const scoped:TransactionPool={async connect(){
   const connection=await db.pool.connect();
   return {release(){connection.release();},
    async query<T extends Record<string,unknown>>(sql:string,args:readonly unknown[]=[]){
     return meter.execute(()=>connection.query<T>(sql,args));
    }};
  }};
  const bounded=await readProgrammeWorkspace(scoped,scope);
  assert.equal(bounded.programmes.length,2);
  const usage=meter.assertBudget({maxQueries:7,maxResultBytes:80_000});
  console.log("PPW rivalry desk budget:",JSON.stringify(usage));
  // The original PPW automatically binds a booked bout to a feud only when
  // its sides unambiguously fit that feud, including portable tag-team members.
  await withWorldTransaction(db.pool,tx=>tx.query(
   "INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week,status)"+
   " VALUES($1,'weekly',$2,1,1,'DRAFT')",[worldId,promotionId]));
  const context={pool:db.pool,actor:{playerId}};
  const makeMatch=(opponent:number)=>({
   matchType:"SINGLES",participants:[
    {personId:people[0]!,contractId:"contract-0-"+id},
    {personId:people[opponent]!,contractId:"contract-"+opponent+"-"+id}],
   scriptedWinner:people[0]!,plannedFinish:"CLEAN_PIN",
   plannedLengthMinutes:15,intent:"COMPETITIVE"});
  const save=async(revision:number,opponent:number,requestId:string)=>
   saveCardEditorAsActor(context,{worldId,promotionId,showId:"weekly",
    requestId,expectedRevision:revision,
    matches:[{slotId:"main",payload:makeMatch(opponent)}],
    segments:[],runningOrder:["main"]});
  assert.equal((await save(3,2,"feud-match")).status,"APPLIED");
  const linkedMatch=await withWorldTransaction(db.pool,tx=>tx.query<{programme_id:string}>(
   "SELECT programme_id FROM ppw_programme_match_activities"+
   " WHERE world_id=$1 AND draft_id='weekly' AND kind='MATCH'",[worldId]));
  assert.deepEqual(linkedMatch,[{programme_id:
   team.status==="APPLIED"?team.result.programmeId:""}]);
  const pending=await readProgrammeWorkspace(db.pool,scope);
  const currentProgrammeId=team.status==="APPLIED"?team.result.programmeId:"";
  assert.deepEqual(pending.programmes.find(p=>p.programmeId===currentProgrammeId)?.plannedActivity,
   [{showId:"weekly",slotId:"main",kind:"MATCH",segmentKind:null,
    titleMatch:false,stipulationMatch:false,year:1,week:1,
    showName:"Scheduled show",status:"DRAFT"}],
   "An actual linked drafted match must show as planned, not as certified history");
  const linkedCard=await showCardEditorAsActor(context,worldId,promotionId,"weekly");
  assert.ok(linkedCard.programmes.some(x=>x.label.includes("The Unit")));
  assert.equal((await save(4,1,"different-opponent")).status,"APPLIED");
  const noLongerPlanned=await readProgrammeWorkspace(db.pool,scope);
  assert.deepEqual(noLongerPlanned.programmes.find(p=>p.programmeId===currentProgrammeId)?.plannedActivity,
   [],"Removing the feud's actual booked match must remove the planned chapter");
  const unlinked=await withWorldTransaction(db.pool,tx=>tx.query<{n:string}>(
   "SELECT count(*)::text AS n FROM ppw_programme_match_activities"+
   " WHERE world_id=$1 AND draft_id='weekly' AND kind='MATCH'",[worldId]));
  assert.equal(unlinked[0]!.n,"0");
  assert.equal((await withWorldTransaction(db.pool,tx=>tx.query<{n:string}>(
   "SELECT count(*)::text AS n FROM ppw_ledger_events WHERE world_id=$1 AND event_type LIKE 'PROGRAMME_%'",
   [worldId])))[0]!.n,"3");
  // The original after-show rematch/retaliation/stand decision belongs to a
  // completed rivalry match, never a saved draft or invented outcome.
  const activeProgramme=team.status==="APPLIED"?team.result.programmeId:"";
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query(
    "INSERT INTO ppw_completed_shows(world_id,promotion_id,show_id,year,week,"+
    "resolution_id,crowd_response,receipt_json,receipt_digest)"+
    " VALUES($1,$2,'postshow-one',1,1,'resolution-followup',82,'{}'::jsonb,$3)",
    [worldId,promotionId,"f".repeat(64)]);
   await tx.query(
    "INSERT INTO ppw_programme_resolved_activities("+
    "world_id,promotion_id,programme_id,show_id,slot_id,week_index,"+
    "kind,signature,crowd_response,impact)"+
    " VALUES($1,$2,$3,'postshow-one','main-event',0,'MATCH','test rivalry',88,81)",
    [worldId,promotionId,activeProgramme]);
  });
  const choice={...scope,programmeId:activeProgramme,
   showId:"postshow-one",slotId:"main-event",choice:"PURSUE_REMATCH" as const};
  await assert.rejects(chooseProgrammeDirection(db.pool,{...choice,
   playerId:"intruder",requestId:"intruder-direction",expectedRevision:5}),
   /not accessible|denied|not owned/i);
  await assert.rejects(chooseProgrammeDirection(db.pool,{...choice,
   requestId:"draft-direction",expectedRevision:5,showId:"weekly"}),
   /latest completed rivalry match/);
  const chosen=await chooseProgrammeDirection(db.pool,{...choice,
   requestId:"direction-one",expectedRevision:5});
  assert.equal(chosen.status,"APPLIED");
  assert.equal((await chooseProgrammeDirection(db.pool,{...choice,
   requestId:"direction-one",expectedRevision:5})).status,"REPLAYED");
  const firstDirection=(await readProgrammeWorkspace(db.pool,scope)).programmes
   .find(x=>x.programmeId===activeProgramme)?.latestFollowUp;
  assert.deepEqual(firstDirection,{choice:"PURSUE_REMATCH",
   showId:"postshow-one",slotId:"main-event",weekIndex:0,
   nextMatchWeekIndex:null,nextAngleWeekIndex:null});
  const changed=await chooseProgrammeDirection(db.pool,{...choice,
   choice:"LET_STAND",requestId:"direction-change",expectedRevision:6});
  assert.equal(changed.status,"APPLIED");
  const finished=await readProgrammeWorkspace(db.pool,scope);
  assert.equal(finished.programmes.find(x=>x.programmeId===activeProgramme)?.latestFollowUp?.choice,
   "LET_STAND");
  const count=await withWorldTransaction(db.pool,tx=>tx.query<{n:string}>(
   "SELECT count(*)::text AS n FROM ppw_programme_postshow_directions"+
   " WHERE world_id=$1 AND programme_id=$2",[worldId,activeProgramme]));
  assert.equal(count[0]!.n,"1","One match has one revisable direction, not an append-only blob");
  const links=await withWorldTransaction(db.pool,tx=>tx.query<{n:string}>(
   "SELECT count(*)::text AS n FROM ppw_booking_drafts WHERE world_id=$1",[worldId]));
  assert.equal(links[0]!.n,"1","Post-show direction does not generate an unsolicited booking");
  // Only a *later certified chapter* can count as follow-through. The same
  // selected match and a planned draft cannot do it. The winning side in
  // this new chapter is reported from World history, not inferred from heat.
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query("UPDATE ppw_worlds SET week=2 WHERE world_id=$1",[worldId]);
   await tx.query(
    "INSERT INTO ppw_completed_shows(world_id,promotion_id,show_id,year,week,"+
    "resolution_id,crowd_response,receipt_json,receipt_digest)"+
    " VALUES($1,$2,'postshow-two',1,2,'resolution-chapter',80,'{}'::jsonb,$3)",
    [worldId,promotionId,"b".repeat(64)]);
   await tx.query(
    "INSERT INTO ppw_programme_resolved_activities("+
    "world_id,promotion_id,programme_id,show_id,slot_id,week_index,"+
    "kind,signature,crowd_response,impact,winner_side)"+
    " VALUES($1,$2,$3,'postshow-two','main-event-two',1,"+
    "'MATCH','second chapter',80,77,'B')",
    [worldId,promotionId,activeProgramme]);
  });
  const chapter=await readProgrammeWorkspace(db.pool,scope);
  const observed=chapter.programmes.find(x=>x.programmeId===activeProgramme)!;
  assert.equal(observed.latestFollowUp?.choice,"LET_STAND");
  assert.equal(observed.latestFollowUp?.nextMatchWeekIndex,1);
  assert.equal(observed.latestFollowUp?.nextAngleWeekIndex,null);
  assert.equal(observed.recentActivity[0]?.winnerSide,"B");
  assert.equal(observed.recentActivity[0]?.weekIndex,1);
  assert.equal(observed.recentActivity[1]?.winnerSide,null);
  // The player-facing BOOKING editor must see the same facts as Programmes.
  // A later match does not fulfil a promised on-screen retaliation angle.
  await withWorldTransaction(db.pool,tx=>tx.query(
   "INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week,status)"+
   " VALUES($1,'weekly-two',$2,1,2,'DRAFT')",[worldId,promotionId]));
  const cardAfterMatch=await showCardEditorAsActor(context,worldId,promotionId,"weekly-two");
  const reminder=cardAfterMatch.programmes.find(x=>x.programmeId===activeProgramme)!;
  assert.equal(reminder.latestFollowUp?.laterMatchRecorded,true);
  assert.equal(reminder.latestFollowUp?.laterAngleRecorded,false);
  assert.equal(reminder.latestFollowUp?.laterBeatRecorded,true);
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query("UPDATE ppw_worlds SET week=3 WHERE world_id=$1",[worldId]);
   await tx.query(
    "INSERT INTO ppw_completed_shows(world_id,promotion_id,show_id,year,week,"+
    "resolution_id,crowd_response,receipt_json,receipt_digest)"+
    " VALUES($1,$2,'postshow-three',1,3,'resolution-third-chapter',75,'{}'::jsonb,$3)",
    [worldId,promotionId,"c".repeat(64)]);
   await tx.query(
    "INSERT INTO ppw_programme_resolved_activities("+
    "world_id,promotion_id,programme_id,show_id,slot_id,week_index,"+
    "kind,signature,crowd_response,impact)"+
    " VALUES($1,$2,$3,'postshow-three','third-angle',2,"+
    "'SEGMENT','retaliation angle',75,71)",
    [worldId,promotionId,activeProgramme]);
  });
  const afterAngle=await readProgrammeWorkspace(db.pool,scope);
  const third=afterAngle.programmes.find(x=>x.programmeId===activeProgramme)!;
  assert.equal(third.latestFollowUp?.nextMatchWeekIndex,1);
  assert.equal(third.latestFollowUp?.nextAngleWeekIndex,2);
  const cardAfterAngle=await showCardEditorAsActor(context,worldId,promotionId,"weekly-two");
  const next=cardAfterAngle.programmes.find(x=>x.programmeId===activeProgramme)!;
  assert.equal(next.latestFollowUp?.laterMatchRecorded,true);
  assert.equal(next.latestFollowUp?.laterAngleRecorded,true);

 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_programme_postshow_directions",
    "ppw_programme_finales","ppw_programme_resolved_activities",
    "ppw_completed_shows","ppw_ledger_events","ppw_command_receipts",
    "ppw_programme_match_activities","ppw_card_slots","ppw_booking_drafts",
    "ppw_programme_side_refs","ppw_programme_participants","ppw_programmes",
    "ppw_championship_contests","ppw_championship_reigns","ppw_championships",
    "ppw_tag_team_members","ppw_tag_teams","ppw_contracts","ppw_people",
    "ppw_promotion_controls","ppw_memberships","ppw_promotions"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[playerId]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
  }).finally(()=>db.close());
 }
});
