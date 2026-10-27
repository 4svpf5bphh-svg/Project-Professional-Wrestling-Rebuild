import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {readTournamentWorkspace,createTournament,cancelTournament} from "../src/db/tournament-workspace.js";
import {settleCertifiedTournamentBouts} from "../src/db/tournament-booking.js";
import {showCardEditorAsActor,saveCardEditorAsActor} from "../src/api/world-service.js";
import type {CompletedShowReceipt} from "../src/domain/completed-show-receipt.js";
const url=process.env.PPW_NEON_TEST_URL;
test("promotion-only 4-person bracket books two semis, advances from certified winners, then completes its final",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const id=randomUUID(),world="bracket-"+id,promotion="home-"+id;
 const player="owner-"+id,outsider="impostor-"+id;
 const show1="semi-show-"+id,show2="final-show-"+id;
 const db=postgresPool(url!,3),scope={worldId:world,promotionId:promotion,playerId:player};
 const people=["a","b","c","d"].map(x=>x+"-"+id);
 const actor={pool:db.pool,actor:{playerId:player}};
 const makeMatch=(a:string,z:string,tournamentId:string,n:number,
   championshipId?:string)=>({
  matchType:"SINGLES",family:"INDIVIDUAL",
  sides:[{sideId:"A",participants:[{personId:a,contractId:"deal-"+a}]},
   {sideId:"B",participants:[{personId:z,contractId:"deal-"+z}]}],
  participants:[{personId:a,contractId:"deal-"+a},{personId:z,contractId:"deal-"+z}],
  scriptedWinnerSide:"A",intent:"COMPETITIVE",plannedFinish:"CLEAN_PIN",
  plannedLengthMinutes:15,tournamentId,tournamentBoutNo:n,
  ...(championshipId?{championshipId}:{})
 });
 const receipt=(showId:string,week:number,matches:{
  matchId:string;actualWinnerSide:string}[]):CompletedShowReceipt=>({
  worldId:world,promotionId:promotion,showId,year:1,week,
  resolutionId:"cert-"+showId,crowdResponse:75,
  matches:matches.map((m,i)=>({...m,position:i,crowdResponse:75,
   actualFinish:"CLEAN_PIN"})),segments:[]
 });
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:world,name:"Tournament regression",seed:54,rulesetVersion:"test"});
   await addPromotion(tx,world,{id:promotion,name:"Crown",tier:"LOCAL"});
   await tx.query("INSERT INTO ppw_players(player_id) VALUES($1),($2)",[player,outsider]);
   await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status) VALUES($1,$2,'ACTIVE')",[world,player]);
   await tx.query("INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id) VALUES($1,$2,$3)",[world,player,promotion]);
   await tx.query(`INSERT INTO ppw_championships(world_id,promotion_id,championship_id,
    name,division,status,prestige)
    VALUES($1,$2,'vacant','Grand Championship','SINGLES','ACTIVE',55)`,
    [world,promotion]);
   await tx.query("INSERT INTO ppw_markets(world_id,market_id,name) VALUES($1,'market','Market')",[world]);
   await tx.query("INSERT INTO ppw_venues(world_id,venue_id,name,market_id) VALUES($1,'hall','Arena','market')",[world]);
   for(let i=0;i<4;i++){
    await tx.query("INSERT INTO ppw_people(world_id,person_id,name,booking_division) VALUES($1,$2,$3,'MEN')",
     [world,people[i],"Wrestler "+i]);
    await tx.query(`INSERT INTO ppw_contracts(world_id,contract_id,person_id,
     promotion_id,family,status,remaining_dates,expires_week_index)
     VALUES($1,$2,$3,$4,'EXCLUSIVE','SIGNED',NULL,52)`,
     [world,"deal-"+people[i],people[i],promotion]);
   }
   for(const [show,week] of [[show1,1],[show2,2]] as const)
    await tx.query(`INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,
     year,week,status,show_day,venue_id,market_id,show_name,booking_class)
     VALUES($1,$2,$3,1,$4,'DRAFT',3,'hall','market','Tournament Show','REGULAR')`,
     [world,show,promotion,week]);
  });
  const start=await readTournamentWorkspace(db.pool,scope);
  assert.equal(start.roster.length,4);
  assert.deepEqual(start.vacantTitles.map(x=>x.championshipId),["vacant"]);
  await assert.rejects(readTournamentWorkspace(db.pool,{...scope,playerId:outsider}),/access denied/);
  await assert.rejects(createTournament(db.pool,{...scope,
   requestId:"bad-division",expectedRevision:start.worldRevision,
   name:"Grand Slam",division:"WOMEN",entrants:people}),/signed active rights/);
  const created=await createTournament(db.pool,{...scope,
   requestId:"create",expectedRevision:start.worldRevision,
   name:"Grand Slam",division:"MEN",entrants:people,championshipId:"vacant"});
  assert.equal(created.status,"APPLIED");
  if(created.status!=="APPLIED")throw new Error("Tournament creation failed");
  const tournamentId=created.result.tournamentId;
  const first=await showCardEditorAsActor(actor,world,promotion,show1);
  assert.equal(first.tournamentBouts.length,2);
  assert.deepEqual(first.tournamentBouts.map(x=>x.boutNo),[1,2]);
  const semifinal=[
   {slotId:"sf-one",payload:makeMatch(people[0]!,people[3]!,tournamentId,1)},
   {slotId:"sf-two",payload:makeMatch(people[1]!,people[2]!,tournamentId,2)}
  ];
  await assert.rejects(saveCardEditorAsActor(actor,{
   worldId:world,promotionId:promotion,showId:show1,
   requestId:"wrong-pair",expectedRevision:first.worldRevision,
   matches:[{slotId:"wrong",payload:makeMatch(people[0]!,people[1]!,tournamentId,1)}],
   runningOrder:["wrong"]}),/actual available pair/);
  const save=await saveCardEditorAsActor(actor,{
   worldId:world,promotionId:promotion,showId:show1,
   requestId:"semifinals",expectedRevision:first.worldRevision,
   matches:semifinal,runningOrder:["sf-one","sf-two"]});
  assert.equal(save.status,"APPLIED");
  const active=await readTournamentWorkspace(db.pool,scope);
  await assert.rejects(cancelTournament(db.pool,{...scope,
   requestId:"cancel-while-booked",expectedRevision:active.worldRevision,
   tournamentId}),/Remove remaining tournament bouts/);
  const second=await showCardEditorAsActor(actor,world,promotion,show2);
  assert.equal(second.tournamentBouts.length,0,
   "Final cannot be booked before both certified semifinals");
  await withWorldTransaction(db.pool,tx=>settleCertifiedTournamentBouts(tx,
   receipt(show1,1,[{matchId:"sf-one",actualWinnerSide:"B"},
    {matchId:"sf-two",actualWinnerSide:"A"}])));
  const bracket=await readTournamentWorkspace(db.pool,scope);
  const rounds=bracket.tournaments[0]!.bouts;
  assert.equal(rounds[0]!.winnerPersonId,people[3],
   "Canonical result, not the scripted side in a draft, wins the first semifinal");
  assert.equal(rounds[1]!.winnerPersonId,people[1]);
  assert.deepEqual([rounds[2]!.personA,rounds[2]!.personB],[people[3],people[1]]);
  const finalView=await showCardEditorAsActor(actor,world,promotion,show2);
  assert.equal(finalView.tournamentBouts.length,1);
  assert.equal(finalView.tournamentBouts[0]!.championshipId,"vacant");
  const final=await saveCardEditorAsActor(actor,{
   worldId:world,promotionId:promotion,showId:show2,
   requestId:"final",expectedRevision:finalView.worldRevision,
   matches:[{slotId:"final",payload:makeMatch(people[3]!,people[1]!,
    tournamentId,3,"vacant")}],runningOrder:["final"]});
  assert.equal(final.status,"APPLIED");
  await withWorldTransaction(db.pool,tx=>settleCertifiedTournamentBouts(tx,
   receipt(show2,2,[{matchId:"final",actualWinnerSide:"B"}])));
  const completed=await readTournamentWorkspace(db.pool,scope);
  assert.equal(completed.tournaments[0]?.status,"COMPLETE");
  assert.equal(completed.tournaments[0]?.winnerPersonId,people[1]);
  assert.equal(completed.tournaments[0]?.bouts[2]?.winnerPersonId,people[1]);
  assert.equal(completed.tournaments[0]?.bouts[2]?.resolvedWeekIndex,1);
  const nextCup=await createTournament(db.pool,{...scope,
   requestId:"second",expectedRevision:completed.worldRevision,
   name:"Another Trophy",division:"MEN",entrants:people});
  assert.equal(nextCup.status,"APPLIED");
  if(nextCup.status!=="APPLIED")throw new Error("Could not start next tournament");
  const toCancel=await readTournamentWorkspace(db.pool,scope);
  const cancelled=await cancelTournament(db.pool,{...scope,
   requestId:"cancel-second",expectedRevision:toCancel.worldRevision,
   tournamentId:nextCup.result.tournamentId});
  assert.equal(cancelled.status,"APPLIED");
  assert.equal((await readTournamentWorkspace(db.pool,scope)).tournaments[0]?.status,"CANCELLED");
  assert.equal(completed.vacantTitles.length,1,
   "Bracket settlement itself must not secretly award the belt; canonical title settlement owns that");
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_tournament_bouts","ppw_tournaments",
    "ppw_card_slots","ppw_booking_drafts","ppw_ledger_events",
    "ppw_command_receipts","ppw_championship_reigns","ppw_championships",
    "ppw_promotion_talent_trust","ppw_contracts","ppw_promotion_controls",
    "ppw_memberships","ppw_people","ppw_venues","ppw_promotions","ppw_markets"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[world]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=ANY($1::text[])",[[player,outsider]]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>db.close());
 }
});
