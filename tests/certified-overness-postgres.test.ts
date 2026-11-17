import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {deriveCertifiedOvernessChanges} from "../src/domain/certified-overness.js";
import {settleCertifiedTalentOvernessInTransaction}
 from "../src/db/certified-overness-settlement.js";
const url=process.env.PPW_NEON_TEST_URL;
test("certified match+promo changes two present wrestlers in one atomic SQL write, not an off-screen target",{
 skip:!url?"Disposable PostgreSQL required":false},async()=>{
 const id=randomUUID(),world="overness-"+id,db=postgresPool(url!,3);
 const promo="promotion";
 const changes=deriveCertifiedOvernessChanges([{
  slotId:"match",personIds:["a","b"],crowdResponse:85,
  ratingStars:4,winnerIds:["a"]
 }],[{slotId:"promo",actorIds:["a"],targetIds:["c"],
  targetPresence:"MENTIONED",crowdResponse:78,ratingStars:3.75}]);
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:world,name:"Overness integrity",seed:15,
    rulesetVersion:"test"});
   await addPromotion(tx,world,{id:promo,name:"CWA",tier:"LOCAL"});
   await tx.query(`
    INSERT INTO ppw_people(world_id,person_id,name,popularity,momentum)
    VALUES($1,'a','Alpha',40,60),($1,'b','Bravo',90,20),
     ($1,'c','Charlie',65,45)`,[world]);
  });
  const original=await withWorldTransaction(db.pool,tx=>tx.query<{
   person_id:string;overness:number|null;gimmick_reception:number|null}>(`
   SELECT person_id,overness,gimmick_reception FROM ppw_people
   WHERE world_id=$1 ORDER BY person_id`,[world]));
  assert.ok(original.every(x=>x.overness===null&&x.gimmick_reception===null),
   "Migration has no expensive genesis-wide overness backfill");
  const one=await withWorldTransaction(db.pool,tx=>
   settleCertifiedTalentOvernessInTransaction(tx,world,changes));
  assert.equal(one,2);
  const after=await withWorldTransaction(db.pool,tx=>tx.query<{
   person_id:string;overness:number|null;gimmick_reception:number|null}>(`
   SELECT person_id,overness,gimmick_reception FROM ppw_people
   WHERE world_id=$1 ORDER BY person_id`,[world]));
  assert.ok(after[0]!.overness!>49);
  assert.ok(after[1]!.overness!>58.5);
  assert.equal(after[2]!.overness,null);
  assert.ok(after[0]!.gimmick_reception!>50);
  assert.ok(after[1]!.gimmick_reception!>50);
  assert.equal(after[2]!.gimmick_reception,null);
  await assert.rejects(withWorldTransaction(db.pool,tx=>
   settleCertifiedTalentOvernessInTransaction(tx,world,[
    ...changes,{personId:"absent",overnessDelta:1,gimmickDelta:1}
   ])),/performer missing/);
  const check=await withWorldTransaction(db.pool,tx=>tx.query<{
   person_id:string;overness:number|null;gimmick_reception:number|null}>(`
   SELECT person_id,overness,gimmick_reception FROM ppw_people
   WHERE world_id=$1 ORDER BY person_id`,[world]));
  assert.deepEqual(check,after,"Missing wrestler must roll back every partial overness award");
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query("DELETE FROM ppw_people WHERE world_id=$1",[world]);
   await tx.query("DELETE FROM ppw_promotions WHERE world_id=$1",[world]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>db.close());
 }
});
