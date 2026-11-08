import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {showCardEditorAsActor,cardTalentAsActor,saveCardEditorAsActor,
 markPreparedShowReadyAsActor} from "../src/api/world-service.js";
import {readChampionshipDirectory,readChampionshipHistory} from "../src/db/championship-history.js";
import {readCompletedShowView} from "../src/db/show-results-view.js";
import {lockWorldWeek} from "../src/db/world-lock.js";
import {driveWorldResolution} from "../src/db/world-resolution-pipeline.js";

const url=process.env.PPW_NEON_TEST_URL;
/** Two certified human shows using the production authority, never a synthetic
 * settlement shortcut: 2v2v2 -> inaugural team -> defended title next week.
 * This operates ONLY on a disposable PostgreSQL World, with manual test locks.
 */
test("manager's 2v2v2 inaugural tag title survives World Lock, next-week defence and replay",{
 skip:!url?"Disposable PostgreSQL required":false
},async()=>{
 const id=randomUUID(),world="phase46-tag-world-"+id,promotion="cwa",
  owner="owner-"+id,rival="rival-"+id;
 const teamIds=["alpha","bravo","charlie"],people=[
  ["a","Alpha"],["b","Bravo"],["c","Charlie"],["d","Delta"],
  ["e","Echo"],["f","Foxtrot"]] as const;
 const contracts=Object.fromEntries(people.map(([personId])=>[
  personId,{personId,contractId:"deal-"+personId}
 ])) as Record<string,{personId:string;contractId:string}>;
 const db=postgresPool(url!,4),scope={worldId:world,promotionId:promotion};
 const context={pool:db.pool,actor:{playerId:owner}};
 const read=<T extends Record<string,unknown>>(sql:string,args:readonly unknown[]=[])=>
  withWorldTransaction(db.pool,tx=>tx.query<T>(sql,args));
 const revision=async()=>Number((await read<{revision:number|string}>(
  "SELECT revision FROM ppw_worlds WHERE world_id=$1",[world]))[0]!.revision);
 const makeMatch=(lineup:readonly (readonly string[])[],winner:"A"|"B"|"C")=>{
  const sides=lineup.map((side,index)=>({
   sideId:(["A","B","C"] as const)[index]!,
   participants:side.map(p=>contracts[p]!)
  }));
  return {matchType:"TAG",family:"TEAMS",
   participants:sides.flatMap(side=>side.participants),sides,
   championshipId:"tag-belt",scriptedWinnerSide:winner,
   plannedFinish:"CLEAN_PIN",intent:"COMPETITIVE",
   plannedLengthMinutes:lineup.length===3?27:20};
 };
 const book=async(showId:string,lineup:readonly (readonly string[])[],
  winner:"A"|"B"|"C",requestId:string)=>{
  const selected=await showCardEditorAsActor(context,world,promotion,showId);
  assert.equal(selected.canEdit,true);
  assert.equal(selected.championships.some(t=>t.championshipId==="tag-belt"),true);
  const result=await saveCardEditorAsActor(context,{...scope,showId,requestId,
   expectedRevision:selected.worldRevision,
   matches:[{slotId:"main",payload:makeMatch(lineup,winner)}],
   runningOrder:["main"]});
  assert.equal(result.status,"APPLIED");
  const persisted=await showCardEditorAsActor(context,world,promotion,showId);
  assert.equal(persisted.slots.length,1);
  const authored=persisted.slots[0]!.payload as {scriptedWinnerSide:string;
   sides:{participants:{personId:string}[]}[];championshipId:string};
  assert.equal(authored.scriptedWinnerSide,winner);
  assert.equal(authored.sides.length,lineup.length);
  assert.equal(authored.championshipId,"tag-belt");
  return persisted;
 };
 const resolve=async(week:1|2)=>{
  await withWorldTransaction(db.pool,tx=>tx.query(
   "UPDATE ppw_worlds SET next_lock_at=clock_timestamp()-interval '1 second'"+
   " WHERE world_id=$1",[world]));
  const locked=await lockWorldWeek(db.pool,{worldId:world,
   requestId:"tag-lock-"+week,expectedRevision:await revision()});
  assert.equal(locked.status,"APPLIED");
  const done=await driveWorldResolution(db.pool,{
   worldId:world,resolutionId:"tag-resolution-"+week+"-"+id,maxStages:16
  });
  assert.equal(done.status,"PUBLISHED",JSON.stringify(done));
  const state=await read<{year:number;week:number;phase:string}>(
   "SELECT year,week,phase FROM ppw_worlds WHERE world_id=$1",[world]);
  assert.deepEqual(state,[{year:1,week:week+1,phase:"OPEN"}]);
 };
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:world,name:"Phase 46 Tag Title Journey",seed:4622,rulesetVersion:"test"});
   await addPromotion(tx,world,{id:promotion,name:"Chaotic Wrestling Alliance",tier:"LOCAL"});
   await tx.query("UPDATE ppw_promotions SET media_reach=70"+
    " WHERE world_id=$1 AND promotion_id=$2",[world,promotion]);
   await tx.query("INSERT INTO ppw_players(player_id) VALUES($1),($2)",[owner,rival]);
   await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status)"+
    " VALUES($1,$2,'ACTIVE'),($1,$3,'ACTIVE')",[world,owner,rival]);
   await tx.query("INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id)"+
    " VALUES($1,$2,$3)",[world,owner,promotion]);
   await tx.query("UPDATE ppw_worlds SET injury_rate_multiplier=0 WHERE world_id=$1",[world]);
   await tx.query("INSERT INTO ppw_markets("+
    "world_id,market_id,name,audience_potential,wrestling_interest,spending_index)"+
    " VALUES($1,'home','Home',70,72,100)",[world]);
   await tx.query("INSERT INTO ppw_venues(world_id,venue_id,name,market_id)"+
    " VALUES($1,'arena','CWA Arena','home')",[world]);
   for(const [personId,name] of people){
    await tx.query("INSERT INTO ppw_people("+
     "world_id,person_id,name,booking_division,in_ring_quality,match_craft,"+
     "presentation,stamina,safety,fatigue,wear,popularity,recognition,momentum)"+
     " VALUES($1,$2,$3,'MEN',80,78,77,85,95,0,0,65,65,65)",
     [world,personId,name]);
    await tx.query("INSERT INTO ppw_contracts("+
     "world_id,contract_id,person_id,promotion_id,family,status,"+
     "remaining_dates,expires_week_index,appearance_fee)"+
     " VALUES($1,$2,$3,$4,'LIMITED_NON_EXCLUSIVE','SIGNED',5,52,200)",
     [world,"deal-"+personId,personId,promotion]);
   }
   for(const [index,team] of teamIds.entries()){
    await tx.query("INSERT INTO ppw_tag_teams(world_id,team_id,name,status)"+
     " VALUES($1,$2,$3,'ACTIVE')",[world,team,"Team "+team]);
    for(const personId of people.slice(index*2,index*2+2).map(x=>x[0]))
     await tx.query("INSERT INTO ppw_tag_team_members(world_id,team_id,person_id)"+
      " VALUES($1,$2,$3)",[world,team,personId]);
   }
   await tx.query("INSERT INTO ppw_championships("+
    "world_id,promotion_id,championship_id,name,division,status,prestige,booking_division)"+
    " VALUES($1,$2,'tag-belt','CWA World Tag','TAG','ACTIVE',65,'MEN')",
    [world,promotion]);
   for(const week of [1,2])
    await tx.query("INSERT INTO ppw_booking_drafts("+
     "world_id,draft_id,promotion_id,year,week,status,show_day,venue_id,market_id,"+
     "show_name,booking_class,event_importance)"+
     " VALUES($1,$2,$3,1,$4,'DRAFT',4,'arena','home',$5,'REGULAR',65)",
     [world,"show-"+week,promotion,week,"CWA Ascension "+week]);
  });
  const first=await book("show-1",[["a","b"],["c","d"],["e","f"]],"C","inaugural");
  assert.equal(first.championships.find(t=>t.championshipId==="tag-belt")?.vacant,true);
  const notCrowned=await read<{current_reign_id:string|null}>(
   "SELECT current_reign_id FROM ppw_championships WHERE world_id=$1",[world]);
  assert.equal(notCrowned[0]!.current_reign_id,null,
   "Booking and confirming never invent a completed title win");
  await assert.rejects(showCardEditorAsActor({
   pool:db.pool,actor:{playerId:rival}},world,promotion,"show-1"),/access|controller|promotion/i);
  assert.equal((await markPreparedShowReadyAsActor(context,{...scope,showId:"show-1",
   requestId:"ready-1",expectedRevision:await revision(),
   confirmReadyToRun:true})).status,"APPLIED");
  await resolve(1);
  const resultOne=await readCompletedShowView(db.pool,{...scope,playerId:owner,showId:"show-1"});
  assert.equal(resultOne.matchCount,1);
  const directoryOne=await readChampionshipDirectory(db.pool,world,owner,promotion);
  assert.equal(directoryOne.titles.find(t=>t.championshipId==="tag-belt")?.holderName,
   "Team charlie","A certified third side must become the actual inaugural champion");
  const inaugural=await read<{winner_team_id:string;title_changed:boolean}>(
   "SELECT winner_team_id,title_changed FROM ppw_championship_contests"+
   " WHERE world_id=$1 AND show_id='show-1'",[world]);
  assert.deepEqual(inaugural,[{winner_team_id:"charlie",title_changed:true}]);
  const afterFirst=await cardTalentAsActor(context,world,promotion,"show-2","",null,20);
  assert.equal(afterFirst.talent.filter(p=>p.available).length,6,
   "All six members must remain legally bookable next week on their signed rights");
  assert.ok(afterFirst.talent.every(p=>p.contractId==="deal-"+p.personId));
  const second=await book("show-2",[["e","f"],["a","b"]],"A","first-defense");
  assert.equal(second.championships.find(t=>t.championshipId==="tag-belt")?.vacant,false);
  assert.equal((await markPreparedShowReadyAsActor(context,{...scope,showId:"show-2",
   requestId:"ready-2",expectedRevision:await revision(),
   confirmReadyToRun:true})).status,"APPLIED");
  await resolve(2);
  const directoryTwo=await readChampionshipDirectory(db.pool,world,owner,promotion);
  assert.equal(directoryTwo.titles.find(t=>t.championshipId==="tag-belt")?.holderName,"Team charlie",
   "A clean first defence keeps the same champions");
  const title=await read<{title_changed:boolean;winner_team_id:string}>(
   "SELECT title_changed,winner_team_id FROM ppw_championship_contests"+
   " WHERE world_id=$1 ORDER BY show_id",[world]);
  assert.deepEqual(title.map(x=>x.title_changed),[true,false],
   "One inauguration, one defence; no phantom second coronation");
  const dates=await read<{person_id:string;remaining_dates:number}>(
   "SELECT person_id,remaining_dates FROM ppw_contracts WHERE world_id=$1 ORDER BY person_id",[world]);
  assert.deepEqual(dates.map(x=>[x.person_id,x.remaining_dates]),[
   ["a",3],["b",3],["c",4],["d",4],["e",3],["f",3]
  ],"Only actual appearances reduce contracted dates, once per certified show");
  assert.equal((await driveWorldResolution(db.pool,{
   worldId:world,resolutionId:"tag-resolution-2-"+id,maxStages:2
  })).status,"BLOCKED");
  assert.equal((await read<{n:number}>(
   "SELECT count(*)::integer AS n FROM ppw_championship_contests WHERE world_id=$1",
   [world]))[0]!.n,2,"Retry cannot create a duplicate title result");
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of [
    "ppw_tag_match_career_effects","ppw_championship_contests",
    "ppw_championship_reigns","ppw_tag_working_pair_appearances",
    "ppw_working_chemistry","ppw_wrestler_relationship_changes",
    "ppw_wrestler_relationships","ppw_medical_absences",
    "ppw_completed_match_evidence","ppw_completed_show_segments",
    "ppw_completed_show_matches","ppw_show_economics","ppw_completed_shows",
    "ppw_show_resolutions","ppw_week_resolution_seals","ppw_week_resource_clearances",
    "ppw_week_prepared_finalizations","ppw_week_logistics_authorizations",
    "ppw_week_continuity_assessments","ppw_ledger_events",
    "ppw_command_receipts","ppw_promotion_alignment_changes",
    "ppw_card_slots","ppw_booking_drafts","ppw_championships",
    "ppw_tag_team_members","ppw_tag_teams","ppw_contracts","ppw_people","ppw_venues",
    "ppw_promotion_controls","ppw_memberships","ppw_promotions","ppw_markets"
   ])await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[world]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=ANY($1::text[])",[[owner,rival]]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>db.close());
 }
});
