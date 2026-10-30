import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction,type TransactionPool} from "../src/db/transaction.js";
import {MeasuredQuerySession} from "../src/db/query-meter.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {readStaffWorkspace} from "../src/db/staff-workspace.js";
import {readPortablePersonaWorkspace} from "../src/db/portable-persona-workspace.js";
import {describeWrestlerRivalryMemory} from "../src/domain/verified-wrestler-rivalry-memory.js";

const url=process.env.PPW_NEON_TEST_URL;
test("staff and Backstage recall private certified rivalries without extra Neon reads or future spoilers",
 {skip:!url?"No disposable PostgreSQL":false},async()=>{
 const db=postgresPool(url!,3),id=randomUUID(),worldId="staff-story-"+id,
  promotionId="human-"+id,otherId="other-"+id,
  playerId="booker-"+id,otherPlayer="other-booker-"+id;
 const wrestlers=["joe-"+id,"riddle-"+id];
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:worldId,name:"Connected locker room",seed:85,rulesetVersion:"test"});
   await addPromotion(tx,worldId,{id:promotionId,name:"CWA",tier:"LOCAL"});
   await addPromotion(tx,worldId,{id:otherId,name:"Other Promotion",tier:"LOCAL"});
   await tx.query("INSERT INTO ppw_players(player_id) VALUES($1),($2)",[playerId,otherPlayer]);
   await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status)"+
    " VALUES($1,$2,'ACTIVE'),($1,$3,'ACTIVE')",[worldId,playerId,otherPlayer]);
   await tx.query("INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id)"+
    " VALUES($1,$2,$3),($1,$4,$5)",[worldId,playerId,promotionId,otherPlayer,otherId]);
   for(const [i,person] of wrestlers.entries()){
    await tx.query("INSERT INTO ppw_people(world_id,person_id,name,booking_division)"+
     " VALUES($1,$2,$3,'MEN')",[worldId,person,i===0?"Samoa Joe":"Matt Riddle"]);
    for(const [j,promotion] of [promotionId,otherId].entries())
     await tx.query("INSERT INTO ppw_contracts(world_id,contract_id,person_id,"+
      "promotion_id,family,status,remaining_dates,expires_week_index)"+
      " VALUES($1,$2,$3,$4,'LIMITED_NON_EXCLUSIVE','SIGNED',10,52)",
      [worldId,"contract-"+i+"-"+j+"-"+id,person,promotion]);
   }
   await tx.query("INSERT INTO ppw_programmes(world_id,promotion_id,programme_id,"+
    "status,heat,repetition,started_week_index)"+
    " VALUES($1,$2,'feud','ACTIVE',79,2,1)",[worldId,promotionId]);
   await tx.query("INSERT INTO ppw_programme_participants(world_id,promotion_id,programme_id,"+
    "person_id,side) VALUES($1,$2,'feud',$3,'A'),($1,$2,'feud',$4,'B')",
    [worldId,promotionId,...wrestlers]);
   await tx.query("INSERT INTO ppw_programme_side_refs(world_id,promotion_id,programme_id,"+
    "side,position,ref_kind,ref_id) VALUES($1,$2,'feud','A',0,'PERSON',$3),"+
    "($1,$2,'feud','B',0,'PERSON',$4)",[worldId,promotionId,...wrestlers]);
   for(const [showId,week] of [["old-show",3],["angle-show",4],["future-show",7]] as const)
    await tx.query("INSERT INTO ppw_completed_shows(world_id,promotion_id,show_id,year,"+
     "week,resolution_id,crowd_response,receipt_json,receipt_digest)"+
     " VALUES($1,$2,$3,1,$4,$5,80,'{}'::jsonb,$6)",
     [worldId,promotionId,showId,week,"resolution-"+showId+"-"+id,"a".repeat(64)]);
   for(const [showId,slotId,weekIndex,kind,winner] of [
    ["old-show","main",2,"MATCH","B"],
    ["angle-show","challenge",3,"SEGMENT",null],
    ["future-show","rematch",6,"MATCH","A"]
   ] as const)
    await tx.query("INSERT INTO ppw_programme_resolved_activities(world_id,promotion_id,"+
     "programme_id,show_id,slot_id,week_index,kind,signature,crowd_response,impact,"+
     "winner_side) VALUES($1,$2,'feud',$3,$4,$5,$6,$7,80,70,$8)",
     [worldId,promotionId,showId,slotId,weekIndex,kind,kind+"-"+slotId,winner]);
   await tx.query("INSERT INTO ppw_programme_postshow_directions(world_id,promotion_id,"+
    "programme_id,show_id,slot_id,chosen_week_index,choice)"+
    " VALUES($1,$2,'feud','old-show','main',2,'PURSUE_REMATCH')",
    [worldId,promotionId]);
   await tx.query("UPDATE ppw_worlds SET week=6 WHERE world_id=$1",[worldId]);
  });
  const meter=new MeasuredQuerySession("connected-staff-and-private-thread");
  const scoped:TransactionPool={async connect(){
   const c=await db.pool.connect();
   return {release(){c.release();},
    async query<T extends Record<string,unknown>>(sql:string,params:readonly unknown[]=[]){
     return meter.execute(()=>c.query<T>(sql,params));
    }};
  }};
  const staff=await readStaffWorkspace(scoped,{worldId,promotionId,playerId});
  assert.equal(meter.assertBudget({maxQueries:2,maxResultBytes:25000}).queryCount,2);
  const creative=staff.meetings.find(x=>x.role==="CREATIVE")!;
  const commentator=staff.meetings.find(x=>x.role==="COMMENTATOR")!;
  const agent=staff.meetings.find(x=>x.role==="ROAD_AGENT")!;
  assert.match(creative.message,/Samoa Joe and Matt Riddle/);
  assert.match(creative.message,/previous recorded match went to Matt Riddle/);
  assert.match(creative.message,/return bout was requested but has not been completed/);
  assert.match(commentator.message,/on-screen angle/);
  assert.match(agent.message,/Samoa Joe and Matt Riddle/);
  assert.ok(staff.notices.some(x=>x.target==="programmes"&&x.message.includes("Samoa Joe")));
  const count=meter.assertBudget({maxQueries:2,maxResultBytes:25000}).queryCount;
  const backstage=await readPortablePersonaWorkspace(scoped,{
   worldId,promotionId,playerId,personId:wrestlers[0]});
  assert.equal(meter.assertBudget({maxQueries:11,maxResultBytes:95000}).queryCount-count,9);
  const chapters=backstage.memories.filter(x=>x.kind.startsWith("RIVALRY_"));
  assert.equal(chapters.length,2,"only certified preceding events, not the future match");
  assert.equal(chapters[0]?.relatedName,"Matt Riddle");
  const match=chapters.find(x=>x.kind==="RIVALRY_MATCH")!;
  assert.equal(match.ownSide,"A");
  assert.equal(match.winnerSide,"B");
  assert.match(describeWrestlerRivalryMemory({
   kind:"RIVALRY_MATCH",ownSide:match.ownSide!,winnerSide:match.winnerSide!,
   relatedName:match.relatedName!,weekIndex:match.weekIndex
  }),/They lost.*Matt Riddle/);
  const other=await readPortablePersonaWorkspace(db.pool,{
   worldId,promotionId:otherId,playerId:otherPlayer,personId:wrestlers[0]});
  assert.equal(other.memories.filter(x=>x.kind.startsWith("RIVALRY_")).length,0,
   "one human employer cannot inspect another's private programme");
  const otherOffice=await readStaffWorkspace(db.pool,{worldId,promotionId:otherId,
   playerId:otherPlayer});
  assert.doesNotMatch(otherOffice.meetings.find(x=>x.role==="CREATIVE")!.message,
   /Samoa Joe and Matt Riddle/);
  await assert.rejects(readPortablePersonaWorkspace(db.pool,{
   worldId,promotionId,playerId:otherPlayer,personId:wrestlers[0]}),/access denied/);
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_programme_postshow_directions",
    "ppw_programme_resolved_activities","ppw_programme_side_refs",
    "ppw_programme_participants","ppw_programmes","ppw_completed_shows",
    "ppw_contracts","ppw_people","ppw_promotion_controls",
    "ppw_memberships","ppw_promotions"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=ANY($1::text[])",
    [[playerId,otherPlayer]]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
  }).finally(()=>db.close());
 }
});
