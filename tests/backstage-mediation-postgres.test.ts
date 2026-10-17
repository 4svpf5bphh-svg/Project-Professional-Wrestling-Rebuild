import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {settleBackstageMediations} from "../src/db/backstage-mediation.js";
import {readPortablePersonaWorkspace} from "../src/db/portable-persona-workspace.js";
import {dispatchCardRpc} from "../src/web/card-rpc.js";
const url=process.env.PPW_NEON_TEST_URL;

test("Backstage mediation: no free trust, only completed high-quality tag evidence",
 {skip:!url?"No disposable PostgreSQL":false},async()=>{
 const id=randomUUID(),db=postgresPool(url!,3);
 const worldId="mediation-"+id,promotionId="fed-"+id,playerId="booker-"+id;
 const a="a-"+id,b="b-"+id,requestId="mediation-request-"+id;
 const run=<T>(fn:(tx:import("../src/db/world-operations.js").SqlRows)=>Promise<T>)=>
  withWorldTransaction(db.pool,fn);
 const read=<T extends Record<string,unknown>>(sql:string,params:unknown[]=[]) =>
  run(tx=>tx.query<T>(sql,params));
 try{
  await run(async tx=>{
   await createWorld(tx,{id:worldId,name:"Mediation fixture",seed:105,rulesetVersion:"test"});
   await addPromotion(tx,worldId,{id:promotionId,name:"My company",tier:"LOCAL"});
   await tx.query("INSERT INTO ppw_players(player_id) VALUES($1)",[playerId]);
   await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status) VALUES($1,$2,'ACTIVE')",
    [worldId,playerId]);
   await tx.query("INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id) VALUES($1,$2,$3)",
    [worldId,playerId,promotionId]);
   await tx.query("INSERT INTO ppw_people(world_id,person_id,name,booking_division,morale,momentum) VALUES($1,$2,'Person A','MEN',70,60),($1,$3,'Person B','MEN',70,60)",[worldId,a,b]);
   await tx.query("INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,family,status,remaining_dates,expires_week_index) VALUES($1,$2,$3,$4,'EXCLUSIVE','SIGNED',NULL,52),($1,$5,$6,$4,'EXCLUSIVE','SIGNED',NULL,52)",
    [worldId,"dealA-"+id,a,promotionId,"dealB-"+id,b]);
   await tx.query("INSERT INTO ppw_wrestler_relationships(world_id,person_a_id,person_b_id,professional_trust,familiarity) VALUES($1,$2,$3,12,40)",[worldId,a,b]);
   await tx.query("INSERT INTO ppw_backstage_requests(world_id,request_id,promotion_id,person_id,related_person_id,kind,created_week_index) VALUES($1,$2,$3,$4,$5,'PARTNERSHIP',3)",
    [worldId,requestId,promotionId,a,b]);
   await tx.query("UPDATE ppw_worlds SET week=5 WHERE world_id=$1",[worldId]);
  });
  const scope={worldId,promotionId,playerId,personId:a};
  const intro=(await readPortablePersonaWorkspace(db.pool,scope)).conversations[0]!;
  assert.equal(intro.kind,"PARTNERSHIP");
  assert.equal(intro.relatedPersonId,b);
  const context={pool:db.pool,actor:{playerId}};
  const reply=await dispatchCardRpc(context,"backstageDecision",{
   worldId,promotionId,showId:"unused",requestId:"accept-"+id,
   expectedRevision:0,conversationId:requestId,decision:"MEDIATE"
  }) as {status:string;result:{status:string;moraleDelta:number}};
  assert.equal(reply.status,"APPLIED");
  assert.equal(reply.result.status,"ANSWERED");
  assert.equal(reply.result.moraleDelta,0);
  assert.equal((await read<{professional_trust:number}>(
   "SELECT professional_trust FROM ppw_wrestler_relationships WHERE world_id=$1",
   [worldId]))[0]!.professional_trust,12,
   "Chat alone cannot alter wrestler-owned relationship trust");
  assert.equal((await run(tx=>settleBackstageMediations(tx,worldId,4))).mediated,0);
  const completed=async(week:number,executionQuality:number)=>{
   const show="med-show-"+week+"-"+id,match="med-match-"+week+"-"+id;
   await run(async tx=>{
    await tx.query("INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week) VALUES($1,$2,$3,1,$4)",
     [worldId,show,promotionId,week]);
    await tx.query("INSERT INTO ppw_card_slots(world_id,draft_id,slot_id,position,kind,payload) VALUES($1,$2,$3,1,'MATCH',$4::jsonb)",
     [worldId,show,match,JSON.stringify({matchType:"TAG",family:"TEAMS",
      participants:[{personId:a,contractId:"dealA-"+id},
       {personId:b,contractId:"dealB-"+id}]})]);
    await tx.query("INSERT INTO ppw_completed_shows(world_id,promotion_id,show_id,year,week,resolution_id,crowd_response,receipt_json,receipt_digest) VALUES($1,$2,$3,1,$4,$5,70,'{}'::jsonb,$6)",
     [worldId,promotionId,show,week,"med-res-"+week+"-"+id,"d".repeat(64)]);
    await tx.query("INSERT INTO ppw_completed_show_matches(world_id,show_id,match_id,position,crowd_response,actual_finish,actual_winner_side) VALUES($1,$2,$3,1,70,'PIN','A')",[worldId,show,match]);
    await tx.query("INSERT INTO ppw_tag_working_pair_appearances(world_id,show_id,match_id,person_a_id,person_b_id,week_index,execution_quality) VALUES($1,$2,$3,$4,$5,$6,$7)",
     [worldId,show,match,a,b,week-1,executionQuality]);
   });
  };
  await completed(6,40);
  assert.equal((await run(tx=>settleBackstageMediations(tx,worldId,5))).mediated,0,
   "Poor subsequent execution is not positive reconciliation");
  await completed(7,83);
  assert.equal((await run(tx=>settleBackstageMediations(tx,worldId,6))).mediated,1);
  assert.equal((await run(tx=>settleBackstageMediations(tx,worldId,6))).mediated,0,
   "World replay must not duplicate mediation");
  const after=(await readPortablePersonaWorkspace(db.pool,scope)).conversations[0]!;
  assert.equal(after.followThroughKind,"MEDIATION_MATCH_COMPLETED");
  assert.equal(after.followThroughWeekIndex,6);
  assert.equal((await read<{professional_trust:number}>(
   "SELECT professional_trust FROM ppw_wrestler_relationships WHERE world_id=$1",
   [worldId]))[0]!.professional_trust,12,
   "Only existing match engine, not mediation receipt, may change trust");
 }finally{
  await run(async tx=>{
   for(const table of ["ppw_backstage_thread_archives","ppw_backstage_promotion_trust",
    "ppw_backstage_requests","ppw_tag_working_pair_appearances",
    "ppw_wrestler_relationship_changes","ppw_wrestler_relationships",
    "ppw_completed_show_matches","ppw_completed_show_segments","ppw_completed_shows",
    "ppw_card_slots","ppw_booking_drafts","ppw_ledger_events","ppw_command_receipts",
    "ppw_contracts","ppw_people","ppw_promotion_controls","ppw_memberships",
    "ppw_promotions"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[playerId]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
  }).finally(()=>db.close());
 }
});
