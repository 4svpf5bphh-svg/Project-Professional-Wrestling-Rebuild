import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {settleCanonicalTagTitleContests} from "../src/db/tag-championship-settlement.js";
import type {CompletedShowReceipt} from "../src/domain/completed-show-receipt.js";
const url=process.env.PPW_NEON_TEST_URL;
test("vacant tag title crowns booked winner even when neither pair existed as a team",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const db=postgresPool(url!,3),worldId="unformed-tag-"+randomUUID();
 const promotionId="crown",showId="crown-week2",slotId="main",championshipId="founding:tag";
 const booking=[{slotId,championshipId,sides:[
  {sideId:"A" as const,personIds:["p1","p2"]},
  {sideId:"B" as const,personIds:["p3","p4"]}
 ]}] as const;
 const receipt:CompletedShowReceipt={worldId,promotionId,showId,year:1,week:2,
  resolutionId:"final",crowdResponse:75,matches:[{matchId:slotId,position:0,
   crowdResponse:75,actualFinish:"FLASH_PIN",actualWinnerSide:"A"}],segments:[]};
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:worldId,name:"Vacant title regression",seed:7,rulesetVersion:"test"});
   await addPromotion(tx,worldId,{id:promotionId,name:"Crown",tier:"LOCAL"});
   await tx.query("INSERT INTO ppw_people(world_id,person_id,name) VALUES ($1,'p1','One'),($1,'p2','Two'),($1,'p3','Three'),($1,'p4','Four')",[worldId]);
   await tx.query("INSERT INTO ppw_championships(world_id,promotion_id,championship_id,name,division,status,prestige) VALUES($1,$2,$3,'Tag World','TAG','ACTIVE',60)",[worldId,promotionId,championshipId]);
  });
  assert.deepEqual(await withWorldTransaction(db.pool,tx=>
   settleCanonicalTagTitleContests(tx,receipt,booking)),{contests:1,transfers:1});
  const teams=await withWorldTransaction(db.pool,tx=>tx.query<{team_id:string;members:string[]}>(`
   SELECT t.team_id,array_agg(m.person_id ORDER BY m.person_id) AS members
   FROM ppw_tag_teams t JOIN ppw_tag_team_members m ON
    m.world_id=t.world_id AND m.team_id=t.team_id AND m.active
   WHERE t.world_id=$1 AND t.status='ACTIVE'
   GROUP BY t.team_id`,[worldId]));
  assert.equal(teams.length,1);
  assert.deepEqual(teams[0]?.members,["p1","p2"]);
  const reign=await withWorldTransaction(db.pool,tx=>tx.query<{team_id:string;holder_type:string}>(`
   SELECT team_id,holder_type FROM ppw_championship_reigns
   WHERE world_id=$1 AND championship_id=$2`,[worldId,championshipId]));
  assert.equal(reign[0]?.team_id,teams[0]?.team_id);
  assert.equal(reign[0]?.holder_type,"TEAM");
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_championship_contests","ppw_championship_reigns",
    "ppw_championships","ppw_ledger_events","ppw_tag_team_members",
    "ppw_tag_teams","ppw_people","ppw_promotions"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
  }).finally(()=>db.close());
 }
});
