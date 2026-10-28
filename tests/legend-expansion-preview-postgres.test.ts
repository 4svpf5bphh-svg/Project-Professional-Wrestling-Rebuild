import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {settleCertifiedWorldLegends} from "../src/db/legends-settlement.js";
import {reviewedLegendExpansion} from "../src/domain/reviewed-legend-expansion.js";
import {LEGENDS_EXPANSION_RELEASED,LIVE_LEGENDS}
 from "../src/domain/legends-catalogue.js";

const url=process.env.PPW_NEON_TEST_URL;
test("draft-only three-person Freebirds Legend arrives once as a free-agent team after certified achievement",{
 skip:!url?"Disposable PostgreSQL required":false,
},async()=>{
 assert.equal(LEGENDS_EXPANSION_RELEASED,true,
  "Release candidate tests require the expanded catalogue");
 const id=randomUUID(),world="legends-preview-"+id,db=postgresPool(url!,3);
 const team=reviewedLegendExpansion().find(x=>x.name==="The Fabulous Freebirds");
 assert.ok(team);
 assert.equal(team.roster.length,3);
 assert.equal(team.metric,"TAG_MASTERPIECES");
 assert.equal(team.tier,"ICON");
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:world,name:"Verified Legends preview",seed:21,rulesetVersion:"test"});
   await addPromotion(tx,world,{id:"alpha",name:"Alpha Wrestling",tier:"LOCAL"});
   await addPromotion(tx,world,{id:"beta",name:"Beta Wrestling",tier:"LOCAL"});
   await tx.query("UPDATE ppw_worlds SET year=2,week=1 WHERE world_id=$1",[world]);
   // Simulate historical certification counters already recorded by the
   // existing World Lock across Year 1. Never generate fake Production events.
   await tx.query(`INSERT INTO ppw_legend_metrics(world_id,metric,value)
    VALUES($1,'TAG_MASTERPIECES',$2)`,[world,team.target]);
   await tx.query(`INSERT INTO ppw_week_resolution_seals(
    world_id,year,week,certified_promotions) VALUES($1,2,1,2)`,[world]);
   await tx.query(`INSERT INTO ppw_world_news_weeks(world_id,year,week)
    VALUES($1,2,1)`,[world]);
  });
  const first=await withWorldTransaction(db.pool,tx=>
   settleCertifiedWorldLegends(tx,world,2,1,[team]));
  assert.deepEqual(first,{processed:true,unlocked:["the-fabulous-freebirds"]});
  assert.deepEqual(await withWorldTransaction(db.pool,tx=>
   settleCertifiedWorldLegends(tx,world,2,1,[team])),
   {processed:false,unlocked:[]});
  const result=await withWorldTransaction(db.pool,tx=>tx.query<{
   legend_id:string;person_ids:string[];ai_eligible_from_week_index:number
  }>(`SELECT legend_id,person_ids,ai_eligible_from_week_index
   FROM ppw_world_legend_unlocks WHERE world_id=$1`,[world]));
  assert.equal(result.length,1);
  assert.deepEqual(result[0]!.person_ids,[
   "legend:the-fabulous-freebirds:0",
   "legend:the-fabulous-freebirds:1",
   "legend:the-fabulous-freebirds:2"
  ]);
  assert.equal(result[0]!.ai_eligible_from_week_index,53);
  const people=await withWorldTransaction(db.pool,tx=>tx.query<{
   person_id:string;name:string;booking_division:string
  }>(`SELECT person_id,name,booking_division FROM ppw_people
   WHERE world_id=$1 AND person_id=ANY($2::text[]) ORDER BY person_id`,
   [world,result[0]!.person_ids]));
  assert.deepEqual(people.map(x=>x.name),["Michael Hayes","Terry Gordy","Buddy Roberts"]);
  assert.ok(people.every(x=>x.booking_division==="MEN"));
  const tags=await withWorldTransaction(db.pool,tx=>tx.query<{team_id:string;name:string;members:number}>(`
   SELECT t.team_id,t.name,count(m.person_id)::integer AS members
   FROM ppw_tag_teams t LEFT JOIN ppw_tag_team_members m
    ON m.world_id=t.world_id AND m.team_id=t.team_id
   WHERE t.world_id=$1 GROUP BY t.team_id,t.name`,[world]));
  assert.deepEqual(tags,[{team_id:"legend-team:the-fabulous-freebirds",
   name:"The Fabulous Freebirds",members:3}]);
  const contracts=await withWorldTransaction(db.pool,tx=>tx.query<{count:number}>(`
   SELECT count(*)::integer AS count FROM ppw_contracts
   WHERE world_id=$1 AND person_id=ANY($2::text[])`,
   [world,result[0]!.person_ids]));
  assert.equal(contracts[0]?.count,0,
   "A Legend must enter the common free-agent market, never auto-sign");
  assert.equal(LIVE_LEGENDS.length,129,
   "The expansion is enabled without auto-granting any contracts");
 }finally{await db.close();}
});
