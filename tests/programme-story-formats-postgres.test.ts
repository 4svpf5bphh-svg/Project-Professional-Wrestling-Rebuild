import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {startProgramme,readProgrammeWorkspace,saveProgrammeCreativeIntent}
 from "../src/db/programme-workspace.js";

const url=process.env.PPW_NEON_TEST_URL;
test("one owner can create and reopen solo, relationship and five-person faction stories without fabricating an opponent",
 {skip:!url?"No disposable PostgreSQL":false},async()=>{
 const db=postgresPool(url!,4),suffix=randomUUID();
 const worldId="story-formats-"+suffix,promotionId="creative-"+suffix,
  playerId="manager-"+suffix,visitorId="visitor-"+suffix;
 const ids=Array.from({length:5},(_,i)=>"actor-"+i+"-"+suffix);
 const scope={worldId,promotionId,playerId};
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:worldId,name:"Real Story Cast",seed:431,rulesetVersion:"test"});
   await addPromotion(tx,worldId,{id:promotionId,name:"CWA",tier:"LOCAL"});
   for(const user of [playerId,visitorId])
    await tx.query("INSERT INTO ppw_players(player_id) VALUES($1)",[user]);
   await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status) "+
    "VALUES($1,$2,'ACTIVE')",[worldId,playerId]);
   await tx.query("INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id) "+
    "VALUES($1,$2,$3)",[worldId,playerId,promotionId]);
   for(const [i,id] of ids.entries()){
    await tx.query("INSERT INTO ppw_people(world_id,person_id,name,booking_division) "+
     "VALUES($1,$2,$3,'MEN')",[worldId,id,"Character "+(i+1)]);
    await tx.query("INSERT INTO ppw_contracts("+
     "world_id,contract_id,person_id,promotion_id,family,status,remaining_dates,expires_week_index)"+
     " VALUES($1,$2,$3,$4,'EXCLUSIVE','SIGNED',NULL,52)",
     [worldId,"contract-"+i+"-"+suffix,id,promotionId]);
   }
  });
  const person=(id:string)=>({kind:"PERSON" as const,refId:id});
  const solo=await startProgramme(db.pool,{...scope,requestId:"solo",
   expectedRevision:0,programmeFormat:"SOLO",
   sideA:[person(ids[0]!)],sideB:[]});
  assert.equal(solo.status,"APPLIED");
  if(solo.status!=="APPLIED")return;
  assert.equal(solo.result.participants,1);
  assert.equal((await startProgramme(db.pool,{...scope,requestId:"solo",
   expectedRevision:0,programmeFormat:"SOLO",
   sideA:[person(ids[0]!)],sideB:[]})).status,"REPLAYED");
  const relationship=await startProgramme(db.pool,{...scope,requestId:"mentor",
   expectedRevision:1,programmeFormat:"RELATIONSHIP",
   sideA:[person(ids[0]!),person(ids[1]!)],sideB:[]});
  assert.equal(relationship.status,"APPLIED");
  const faction=await startProgramme(db.pool,{...scope,requestId:"faction",
   expectedRevision:2,programmeFormat:"FACTION",
   sideA:ids.map(person),sideB:[]});
  assert.equal(faction.status,"APPLIED");
  assert.equal(faction.status==="APPLIED"?faction.result.participants:0,5);
  const original=await startProgramme(db.pool,{...scope,requestId:"rival",
   expectedRevision:3,sideA:[person(ids[0]!)],sideB:[person(ids[2]!)]});
  assert.equal(original.status,"APPLIED","Existing two-sided feuds retain the default");
  const view=await readProgrammeWorkspace(db.pool,scope);
  assert.equal(view.programmes.length,4);
  assert.deepEqual(view.programmes.map(p=>p.programmeFormat).sort(),
   ["FACTION","RELATIONSHIP","RIVALRY","SOLO"]);
  const soloView=view.programmes.find(p=>p.programmeId===solo.result.programmeId)!;
  assert.equal(soloView.sideA[0]?.name,"Character 1");
  assert.deepEqual(soloView.sideB,[]);
  assert.equal(view.programmes.find(p=>p.programmeFormat==="FACTION")?.sideA.length,5);
  assert.deepEqual(view.programmes.find(p=>p.programmeFormat==="RIVALRY")?.sideB
   .map(x=>x.name),["Character 3"]);
  await assert.rejects(startProgramme(db.pool,{...scope,requestId:"duplicate",
   expectedRevision:4,programmeFormat:"SOLO",
   sideA:[person(ids[0]!)],sideB:[]}),/already exists/);
  await assert.rejects(startProgramme(db.pool,{...scope,requestId:"foreign",
   expectedRevision:4,programmeFormat:"FACTION",
   sideA:[...ids.slice(0,4).map(person),person("foreign")],sideB:[]}),/current roster/);
  await assert.rejects(readProgrammeWorkspace(db.pool,{...scope,
   playerId:visitorId}),/not accessible/);
  const intent=await saveProgrammeCreativeIntent(db.pool,{...scope,
   requestId:"solo-story",expectedRevision:4,
   programmeId:solo.result.programmeId,
   creativeIntent:{blueprintId:"UNDERDOG",motivation:"Wants to earn respect",
    audienceGoal:"Sympathy",destination:"The Lottery"}});
  assert.equal(intent.status,"APPLIED");
  // An actual saved on-screen segment advances the original Programme
  // card association. It is never a second storyline or a fabricated result.
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query("INSERT INTO ppw_booking_drafts"+
    "(world_id,draft_id,promotion_id,year,week,status) "+
    "VALUES($1,$2,$3,1,1,'DRAFT')",
    [worldId,"show-"+suffix,promotionId]);
   await tx.query("INSERT INTO ppw_card_slots"+
    "(world_id,draft_id,slot_id,position,kind,payload) "+
    "VALUES($1,$2,'solo-interview',0,'SEGMENT',$3::jsonb)",
    [worldId,"show-"+suffix,JSON.stringify({kind:"INTERVIEW",
     scene:{purpose:"BUILD_CHARACTER",location:"INTERVIEW_AREA"}})]);
   await tx.query("INSERT INTO ppw_programme_match_activities"+
    "(world_id,promotion_id,programme_id,draft_id,slot_id,kind) "+
    "VALUES($1,$2,$3,$4,'solo-interview','SEGMENT')",
    [worldId,promotionId,solo.result.programmeId,"show-"+suffix]);
  });
  const saved=(await readProgrammeWorkspace(db.pool,scope)).programmes
   .find(p=>p.programmeId===solo.result.programmeId)!;
  assert.equal(saved.plannedActivity[0]?.kind,"SEGMENT");
  assert.equal(saved.plannedActivity[0]?.segmentKind,"INTERVIEW");
  assert.equal(saved.activityCount,0,
   "An editable chapter must not yet count as a certified result");
  assert.equal(saved.blueprintProgress?.played,0);
  assert.equal(saved.blueprintProgress?.booked,0,
   "A nonmatching story purpose is not an earned blueprint beat");
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_ledger_events","ppw_command_receipts",
    "ppw_programme_match_activities","ppw_card_slots","ppw_booking_drafts",
    "ppw_programme_finales","ppw_programme_creative_agreements",
    "ppw_programme_side_refs","ppw_programme_participants","ppw_programmes",
    "ppw_contracts","ppw_people","ppw_promotion_controls","ppw_memberships",
    "ppw_promotions"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[worldId]);
   for(const user of [playerId,visitorId])
    await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[user]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
  });

 }
});
