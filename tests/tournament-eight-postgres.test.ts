import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {createTournament,readTournamentWorkspace} from "../src/db/tournament-workspace.js";
import {settleCertifiedTournamentBouts} from "../src/db/tournament-booking.js";
import {showCardEditorAsActor,saveCardEditorAsActor} from "../src/api/world-service.js";
import type {CompletedShowReceipt} from "../src/domain/completed-show-receipt.js";
const url=process.env.PPW_NEON_TEST_URL;
test("real eight-person singles elimination advances 4 quarters to 2 semis to certified non-title final",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const id=randomUUID(),world="eight-cup-"+id,promotion="cup-"+id;
 const player="owner-"+id,other="other-"+id;
 const ids=Array.from({length:8},(_,i)=>"t"+i+"-"+id);
 const shows=["quarter-"+id,"semi-"+id,"final-"+id];
 const db=postgresPool(url!,3),scope={worldId:world,promotionId:promotion,playerId:player};
 const actor={pool:db.pool,actor:{playerId:player}};
 const booked=(p:string,q:string,tournamentId:string,n:number)=>({
  matchType:"SINGLES",family:"INDIVIDUAL",
  sides:[{sideId:"A",participants:[{personId:p,contractId:"deal-"+p}]},
   {sideId:"B",participants:[{personId:q,contractId:"deal-"+q}]}],
  participants:[{personId:p,contractId:"deal-"+p},{personId:q,contractId:"deal-"+q}],
  scriptedWinnerSide:"A",plannedFinish:"CLEAN_PIN",plannedLengthMinutes:14,
  intent:"COMPETITIVE",tournamentId,tournamentBoutNo:n
 });
 const receipt=(show:string,week:number,winners:readonly ("A"|"B")[]):CompletedShowReceipt=>({
  worldId:world,promotionId:promotion,showId:show,year:1,week,
  resolutionId:"cert-"+show,crowdResponse:80,
  matches:winners.map((actualWinnerSide,i)=>({
   matchId:(week===1?"quarter-":week===2?"semi-":"final-")+(i+1),
   position:i,crowdResponse:76,actualFinish:"CLEAN_PIN",actualWinnerSide
  })),segments:[]
 });
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:world,name:"Eight-person certified test",seed:78,rulesetVersion:"test"});
   await addPromotion(tx,world,{id:promotion,name:"Crown",tier:"LOCAL"});
   await tx.query("INSERT INTO ppw_players(player_id) VALUES($1),($2)",[player,other]);
   await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status) VALUES($1,$2,'ACTIVE')",
    [world,player]);
   await tx.query("INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id) VALUES($1,$2,$3)",
    [world,player,promotion]);
   await tx.query(`INSERT INTO ppw_markets(world_id,market_id,name,audience_potential,
    wrestling_interest,spending_index) VALUES($1,'m','Tournament City',70,75,90)`,[world]);
   await tx.query("INSERT INTO ppw_venues(world_id,venue_id,name,market_id) VALUES($1,'hall','Arena','m')",[world]);
   for(let i=0;i<8;i++){
    await tx.query(`INSERT INTO ppw_people(world_id,person_id,name,booking_division)
     VALUES($1,$2,$3,'MEN')`,[world,ids[i],"Talent "+i]);
    await tx.query(`INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,
     family,status,remaining_dates,expires_week_index)
     VALUES($1,$2,$3,$4,'EXCLUSIVE','SIGNED',NULL,52)`,
     [world,"deal-"+ids[i],ids[i],promotion]);
   }
   for(let i=0;i<shows.length;i++)
    await tx.query(`INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,
     year,week,status,show_day,venue_id,market_id,show_name,booking_class)
     VALUES($1,$2,$3,1,$4,'DRAFT',3,'hall','m','Tournament Night','REGULAR')`,
     [world,shows[i],promotion,i+1]);
  });
  const initial=await readTournamentWorkspace(db.pool,scope);
  assert.equal(initial.roster.length,8);
  await assert.rejects(createTournament(db.pool,{...scope,requestId:"invalid-seeds",
   expectedRevision:initial.worldRevision,name:"Eight Cup",division:"MEN",
   entrants:[...ids.slice(0,7),ids[0]!]}),/four or eight distinct/);
  const created=await createTournament(db.pool,{...scope,requestId:"create-eight",
   expectedRevision:initial.worldRevision,name:"Eight Cup",
   division:"MEN",entrants:ids});
  assert.equal(created.status,"APPLIED");
  if(created.status!=="APPLIED")throw new Error("Eight-person creation not applied");
  const tournamentId=created.result.tournamentId;
  const start=await readTournamentWorkspace(db.pool,scope);
  assert.equal(start.tournaments[0]?.entrantsCount,8);
  assert.deepEqual(start.tournaments[0]?.bouts.map(x=>x.boutNo),[1,2,3,4,5,6,7]);
  const quarters=[[0,7],[3,4],[1,6],[2,5]] as const;
  const first=await showCardEditorAsActor(actor,world,promotion,shows[0]!);
  assert.deepEqual(first.tournamentBouts.map(x=>x.boutNo),[1,2,3,4]);
  await assert.rejects(saveCardEditorAsActor(actor,{
   worldId:world,promotionId:promotion,showId:shows[0]!,requestId:"premature-semi",
   expectedRevision:first.worldRevision,
   matches:[{slotId:"unready",payload:booked(ids[0]!,ids[3]!,tournamentId,5)}],
   runningOrder:["unready"]
  }),/actual available pair/);
  const quarterMatches=quarters.map(([a,z],i)=>({
   slotId:"quarter-"+(i+1),payload:booked(ids[a]!,ids[z]!,tournamentId,i+1)
  }));
  const quarterSaved=await saveCardEditorAsActor(actor,{
   worldId:world,promotionId:promotion,showId:shows[0]!,
   requestId:"quarter-book",expectedRevision:first.worldRevision,
   matches:quarterMatches,runningOrder:quarterMatches.map(x=>x.slotId)
  });
  assert.equal(quarterSaved.status,"APPLIED");
  const future=await showCardEditorAsActor(actor,world,promotion,shows[1]!);
  assert.equal(future.tournamentBouts.length,0,
   "No semifinal is visible before quarterfinal results certify");
  const outcome1=await withWorldTransaction(db.pool,tx=>
   settleCertifiedTournamentBouts(tx,receipt(shows[0]!,1,["A","B","B","A"])));
  assert.equal(outcome1.settled,4);
  const afterQuarter=await readTournamentWorkspace(db.pool,scope);
  const q=afterQuarter.tournaments[0]!.bouts;
  assert.deepEqual(q.slice(0,4).map(x=>x.winnerPersonId),
   [ids[0],ids[4],ids[6],ids[2]]);
  assert.deepEqual([[q[4]!.personA,q[4]!.personB],
   [q[5]!.personA,q[5]!.personB]],[[ids[0],ids[4]],[ids[6],ids[2]]]);
  assert.equal(q[6]!.personA,null);
  const second=await showCardEditorAsActor(actor,world,promotion,shows[1]!);
  assert.deepEqual(second.tournamentBouts.map(x=>x.boutNo),[5,6]);
  const semiMatches=[
   {slotId:"semi-1",payload:booked(ids[0]!,ids[4]!,tournamentId,5)},
   {slotId:"semi-2",payload:booked(ids[6]!,ids[2]!,tournamentId,6)}
  ];
  const semis=await saveCardEditorAsActor(actor,{
   worldId:world,promotionId:promotion,showId:shows[1]!,requestId:"semi-book",
   expectedRevision:second.worldRevision,matches:semiMatches,
   runningOrder:semiMatches.map(x=>x.slotId)
  });
  assert.equal(semis.status,"APPLIED");
  assert.equal((await withWorldTransaction(db.pool,tx=>
   settleCertifiedTournamentBouts(tx,receipt(shows[1]!,2,["B","A"])))).settled,2);
  const finalBefore=await readTournamentWorkspace(db.pool,scope);
  const finalBout=finalBefore.tournaments[0]!.bouts[6]!;
  assert.deepEqual([finalBout.personA,finalBout.personB],[ids[4],ids[6]]);
  const third=await showCardEditorAsActor(actor,world,promotion,shows[2]!);
  assert.equal(third.tournamentBouts[0]!.boutNo,7);
  assert.equal(third.tournamentBouts[0]!.championshipId,null);
  const finalSaved=await saveCardEditorAsActor(actor,{
   worldId:world,promotionId:promotion,showId:shows[2]!,requestId:"final-book",
   expectedRevision:third.worldRevision,
   matches:[{slotId:"final-1",payload:booked(ids[4]!,ids[6]!,tournamentId,7)}],
   runningOrder:["final-1"]
  });
  assert.equal(finalSaved.status,"APPLIED",
   "Non-title finals must not be rejected by null championship references");
  assert.equal((await withWorldTransaction(db.pool,tx=>
   settleCertifiedTournamentBouts(tx,receipt(shows[2]!,3,["B"])))).settled,1);
  const completed=await readTournamentWorkspace(db.pool,scope);
  assert.equal(completed.tournaments[0]!.status,"COMPLETE");
  assert.equal(completed.tournaments[0]!.winnerPersonId,ids[6]);
  assert.equal(completed.tournaments[0]!.bouts[6]!.resolvedWeekIndex,2);
  assert.equal((await withWorldTransaction(db.pool,tx=>
   settleCertifiedTournamentBouts(tx,receipt(shows[2]!,3,["B"])))).settled,0,
   "An already certified tournament result cannot re-award a win");
  await assert.rejects(readTournamentWorkspace(db.pool,{...scope,playerId:other}),
   /access denied/);
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_tournament_bouts","ppw_tournaments","ppw_card_slots",
    "ppw_booking_drafts","ppw_ledger_events","ppw_command_receipts",
    "ppw_championship_reigns","ppw_championships",
    "ppw_promotion_talent_trust","ppw_contracts","ppw_promotion_controls",
    "ppw_memberships","ppw_people","ppw_venues","ppw_promotions","ppw_markets"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[world]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=ANY($1::text[])",[[player,other]]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>db.close());
 }
});
