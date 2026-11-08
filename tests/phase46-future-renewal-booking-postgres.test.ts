import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {showCardEditorAsActor,cardTalentAsActor,saveCardEditorAsActor} from "../src/api/world-service.js";
import {MeasuredQuerySession} from "../src/db/query-meter.js";
import type {TransactionPool} from "../src/db/transaction.js";

const url=process.env.PPW_NEON_TEST_URL;
test("Week 3 Gunn renewals: roster picker, team shortcuts and saved future card use one current signed agreement",{
 skip:!url?"Disposable PostgreSQL required":false
},async()=>{
 const db=postgresPool(url!,4),world="phase46-renewal-"+randomUUID();
 const promotion="cwa",show="week-three",owner="manager-"+randomUUID();
 const other="rival-manager-"+randomUUID();
 const ids=["austin","colten","joe","mistico"];
 const people=[
  {personId:"austin",name:"Austin Gunn"},{personId:"colten",name:"Colten Gunn"},
  {personId:"joe",name:"Samoa Joe"},{personId:"mistico",name:"Mistico"},
  {personId:"mox",name:"Jon Moxley"},{personId:"danielson",name:"Bryan Danielson"}];
 const original=[
  {personId:"austin",contractId:"old-austin"},
  {personId:"colten",contractId:"old-colten"},
  {personId:"joe",contractId:"deal-joe"},
  {personId:"mistico",contractId:"deal-mistico"}];
 const latest=[
  {personId:"austin",contractId:"renew-austin"},
  {personId:"colten",contractId:"renew-colten"},
  original[2]!,original[3]!];
 const card=(cast:typeof original)=>({
  matchType:"TAG",family:"TEAMS",participants:cast,
  sides:[{sideId:"A",participants:cast.slice(0,2)},
   {sideId:"B",participants:cast.slice(2,4)}],
  scriptedWinnerSide:"A",plannedFinish:"CLEAN_PIN",
  intent:"COMPETITIVE",plannedLengthMinutes:18
 });
 const scope={worldId:world,promotionId:promotion,showId:show};
 const context={pool:db.pool,actor:{playerId:owner}};
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:world,name:"Phase 46 Future Renewal",seed:4601,rulesetVersion:"test"});
   await addPromotion(tx,world,{id:promotion,name:"Chaotic Wrestling Alliance",tier:"LOCAL"});
   await addPromotion(tx,world,{id:"rival",name:"Another Promotion",tier:"LOCAL"});
   await tx.query("INSERT INTO ppw_players(player_id) VALUES($1),($2)",[owner,other]);
   await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status) VALUES($1,$2,'ACTIVE'),($1,$3,'ACTIVE')",
    [world,owner,other]);
   await tx.query("INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id) VALUES($1,$2,$3),($1,$4,'rival')",
    [world,owner,promotion,other]);
   await tx.query("INSERT INTO ppw_markets(world_id,market_id,name,audience_potential,wrestling_interest,spending_index) VALUES($1,'home','Home',65,70,100)",[world]);
   await tx.query("INSERT INTO ppw_venues(world_id,venue_id,name,market_id) VALUES($1,'arena','Arena','home')",[world]);
   for(const person of people){
    await tx.query("INSERT INTO ppw_people(world_id,person_id,name,booking_division) VALUES($1,$2,$3,'MEN')",
     [world,person.personId,person.name]);
   }
   await tx.query("INSERT INTO ppw_people(world_id,person_id,name,booking_division) VALUES($1,'private','Private Rival Talent','MEN')",[world]);
   for(const c of [
    ["old-austin","austin",0,4], // Overlap with the new deal.
    ["old-colten","colten",0,1], // Expired before the future Week 3 show.
    ["renew-austin","austin",2,25],
    ["renew-colten","colten",2,25],
    ["deal-joe","joe",0,25],["deal-mistico","mistico",0,25],
    ["deal-mox","mox",0,25],["deal-danielson","danielson",0,25]
   ] as const)
    await tx.query("INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,family,status,remaining_dates,start_week_index,expires_week_index) VALUES($1,$2,$3,$4,'LIMITED_NON_EXCLUSIVE','SIGNED',10,$5,$6)",
     [world,c[0],c[1],promotion,c[2],c[3]]);
   await tx.query("INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,family,status,remaining_dates,start_week_index,expires_week_index) VALUES($1,'private-deal','private','rival','LIMITED_NON_EXCLUSIVE','SIGNED',10,0,25)",[world]);
   await tx.query("INSERT INTO ppw_tag_teams(world_id,team_id,name,status) VALUES($1,'gunns','The Gunns','ACTIVE')",[world]);
   await tx.query("INSERT INTO ppw_tag_team_members(world_id,team_id,person_id) VALUES($1,'gunns','austin'),($1,'gunns','colten')",[world]);
   await tx.query("INSERT INTO ppw_championships(world_id,promotion_id,championship_id,name,division,status,prestige,booking_division) VALUES($1,$2,'tag-belt','CWA World Tag','TAG','ACTIVE',65,'MEN')",
    [world,promotion]);
   await tx.query("INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week,status,show_day,venue_id,market_id,show_name,booking_class) VALUES($1,$2,$3,1,3,'DRAFT',4,'arena','home','Ascension','REGULAR')",
    [world,show,promotion]);
   // Historical future draft still references old contracts; do not rewrite it
   // merely because a signed renewal activates. The booker chooses the fix.
   await tx.query("INSERT INTO ppw_card_slots(world_id,draft_id,slot_id,position,kind,payload) VALUES($1,$2,'main',0,'MATCH',$3::jsonb)",
    [world,show,JSON.stringify(card(original))]);
  });
  const selected=await showCardEditorAsActor(context,world,promotion,show);
  assert.equal(selected.canEdit,true);
  assert.equal(selected.week,3);
  assert.equal(selected.selectedPeople.find(x=>x.personId==="austin")?.contractId,"renew-austin");
  assert.equal(selected.selectedPeople.find(x=>x.personId==="colten")?.contractId,"renew-colten");
  const team=selected.bookableTeams.find(x=>x.teamId==="gunns");
  assert.deepEqual(team?.members.map(x=>[x.personId,x.contractId]),[
   ["austin","renew-austin"],["colten","renew-colten"]]);
  const meter=new MeasuredQuerySession("phase46-recent-renewals-picker");
  const metered:TransactionPool={async connect(){
   const client=await db.pool.connect();
   return {release(){client.release();},async query<T extends Record<string,unknown>>(
    sql:string,params:readonly unknown[]){return meter.execute(()=>client.query<T>(sql,params));}};
  }};
  const page=await cardTalentAsActor({...context,pool:metered},world,promotion,show,"Gunn",null,40);
  meter.assertBudget({maxQueries:2,maxResultBytes:12000});
  assert.deepEqual(page.talent.map(x=>[x.personId,x.contractId]),[
   ["austin","renew-austin"],["colten","renew-colten"]]);
  assert.ok(page.talent.every(x=>x.available));
  assert.equal(page.cursor,null,"Overlapping agreements must not repeat wrestlers across pages");
  await assert.rejects(saveCardEditorAsActor(context,{...scope,requestId:"expired-old",
   expectedRevision:selected.worldRevision,
   matches:[{slotId:"main",payload:card(original)}],runningOrder:["main"]}),
   /contract rights|current signed agreement/);
  const unchanged=await showCardEditorAsActor(context,world,promotion,show);
  assert.equal((unchanged.slots[0]?.payload as typeof original[number] & {
   participants:{contractId:string}[]}).participants[1]?.contractId,"old-colten");
  assert.equal(unchanged.worldRevision,selected.worldRevision,"Rejected save must roll back");
  const saved=await saveCardEditorAsActor(context,{...scope,requestId:"reconciled",
   expectedRevision:unchanged.worldRevision,
   matches:[{slotId:"main",payload:card(latest)}],runningOrder:["main"]});
  assert.equal(saved.status,"APPLIED");
  const ready=await showCardEditorAsActor(context,world,promotion,show);
  const actual=ready.slots[0]?.payload as ReturnType<typeof card>;
  assert.deepEqual(actual.participants.map(x=>x.contractId),latest.map(x=>x.contractId));
  assert.equal(actual.scriptedWinnerSide,"A","Reconciliation never changes the booker's winner");
  assert.equal(actual.plannedFinish,"CLEAN_PIN");
  assert.equal(ready.slots.length,1);
  // Original reported 2v2v2 bug: a real promotion-owned, vacant tag title
  // can be assigned to three eligible full teams, without automatically
  // crowning a champion before the canonical result is certified.
  const six=[...latest,{personId:"mox",contractId:"deal-mox"},
   {personId:"danielson",contractId:"deal-danielson"}];
  const tagTitle={
   ...card(six),championshipId:"tag-belt",plannedLengthMinutes:25,
   sides:[{sideId:"A",participants:six.slice(0,2)},
    {sideId:"B",participants:six.slice(2,4)},
    {sideId:"C",participants:six.slice(4,6)}]
  };
  const threeWay=await saveCardEditorAsActor(context,{...scope,
   requestId:"tag-three-way",expectedRevision:ready.worldRevision,
   matches:[{slotId:"main",payload:tagTitle}],runningOrder:["main"]});
  assert.equal(threeWay.status,"APPLIED");
  const withTitle=await showCardEditorAsActor(context,world,promotion,show);
  assert.equal(withTitle.championships.find(x=>x.championshipId==="tag-belt")?.vacant,true);
  const booked=withTitle.slots[0]?.payload as typeof tagTitle;
  assert.equal(booked.sides.length,3);
  assert.equal(booked.championshipId,"tag-belt");
  assert.equal(booked.scriptedWinnerSide,"A");
  const rival={pool:db.pool,actor:{playerId:other}};
  await assert.rejects(showCardEditorAsActor(rival,world,promotion,show),/not accessible/);
  await assert.rejects(cardTalentAsActor(rival,world,promotion,show,"Gunn",null,10),/not accessible/);
  assert.ok(ids.every(x=>actual.participants.some(p=>p.personId===x)));
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_command_receipts","ppw_card_slots","ppw_booking_drafts",
    "ppw_tag_team_members","ppw_tag_teams","ppw_championships","ppw_contracts","ppw_people",
    "ppw_venues","ppw_promotion_controls","ppw_memberships","ppw_promotions","ppw_markets"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[world]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=ANY($1::text[])",[[owner,other]]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>db.close());
 }
});
