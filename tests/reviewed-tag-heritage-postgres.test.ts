import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";

const url=process.env.PPW_NEON_TEST_URL;
test("original reviewed tag teams seed once with real familiarity but zero fabricated World matches",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const id=randomUUID(),worldId="tag-heritage-"+id;
 const names=["Matthew Jackson","Nicholas Jackson","Cash Wheeler","Dax Harwood",
  "Austin Gunn","Colten Gunn"];
 const db=postgresPool(url!,3);
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:worldId,name:"Reviewed Teams",seed:40,rulesetVersion:"test"});
   await addPromotion(tx,worldId,{id:"aew",name:"AEW",tier:"NATIONAL"});
   for(let i=0;i<names.length;i++)await tx.query(
    "INSERT INTO ppw_people(world_id,person_id,name,booking_division) VALUES($1,$2,$3,'MEN')",
    [worldId,"member-"+i,names[i]]);
  });
  const migration=readFileSync("db/migrations/0111_reviewed_world_tag_heritage.sql","utf8");
  await db.pool.query(migration);
  await db.pool.query(migration); // A deployment retry must not re-form a pair.
  await withWorldTransaction(db.pool,async tx=>{
   const formed=await tx.query<{name:string;members:string[]}>([
    "SELECT t.name,array_agg(p.name ORDER BY p.name) AS members",
    "FROM ppw_tag_teams t JOIN ppw_tag_team_members m",
    "ON m.world_id=t.world_id AND m.team_id=t.team_id AND m.active",
    "JOIN ppw_people p ON p.world_id=m.world_id AND p.person_id=m.person_id",
    "WHERE t.world_id=$1 GROUP BY t.team_id,t.name ORDER BY t.name"
   ].join(" "),[worldId]);
   assert.deepEqual(formed.map(x=>x.name),["FTR","The Gunns","The Young Bucks"]);
   assert.deepEqual(formed.find(x=>x.name==="The Young Bucks")?.members,
    ["Matthew Jackson","Nicholas Jackson"]);
   const relations=await tx.query<{professional_trust:number;familiarity:number;tags:string[]}>([
    "SELECT professional_trust,familiarity,tags",
    "FROM ppw_wrestler_relationships WHERE world_id=$1 ORDER BY person_a_id"
   ].join(" "),[worldId]);
   assert.equal(relations.length,3);
   assert.ok(relations.every(x=>Number(x.professional_trust)===76&&
    Number(x.familiarity)===86));
   assert.ok(relations.every(x=>x.tags.includes("TAG_PARTNERS")));
   const chemistry=await tx.query<{matches_together:number;familiarity:number}>([
    "SELECT matches_together,familiarity",
    "FROM ppw_working_chemistry WHERE world_id=$1 AND context='TAG'"
   ].join(" "),[worldId]);
   assert.equal(chemistry.length,3);
   assert.ok(chemistry.every(x=>Number(x.matches_together)===0&&
    Number(x.familiarity)===86));
   assert.equal((await tx.query<{n:number}>(
    "SELECT count(*)::integer AS n FROM ppw_tag_working_pair_appearances WHERE world_id=$1",
    [worldId]))[0]?.n,0);
  });
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_working_chemistry","ppw_wrestler_relationships",
    "ppw_tag_team_members","ppw_tag_teams","ppw_people","ppw_promotions"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
  }).finally(()=>db.close());
 }
});