import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFileSync} from "node:fs";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {getOwnerDisplayName,saveOwnerDisplayName,renameOwnedPromotion,
 normaliseOwnerName,normalisePromotionName,fictionalPromotionOwner}
 from "../src/db/owner-identities.js";
const url=process.env.PPW_NEON_TEST_URL;
test("two signed promotion owners can name themselves and rebrand only their own company without losing IDs or history",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const suffix=randomUUID(),worldId="owners-"+suffix,
  a="owner-a-"+suffix,b="owner-b-"+suffix,db=postgresPool(url!,3);
 try{
  assert.equal(normaliseOwnerName("  Josh   Robinson  "),"Josh Robinson");
  assert.throws(()=>normaliseOwnerName("!"),/3–48/);
  assert.equal(normalisePromotionName("Crown Wrestling"),"Crown Wrestling");
  assert.throws(()=>normalisePromotionName("<script>"),/3–56/);
  assert.equal(fictionalPromotionOwner("promotion-123"),fictionalPromotionOwner("promotion-123"));
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:worldId,name:"Owners",seed:27,rulesetVersion:"test"});
   await addPromotion(tx,worldId,{id:"crown",name:"Crown Wrestling",tier:"LOCAL"});
   await addPromotion(tx,worldId,{id:"rival",name:"Rival Wrestling",tier:"LOCAL"});
   await tx.query(`
    INSERT INTO ppw_championships(world_id,promotion_id,championship_id,name,
     division,status,prestige)
    VALUES
     ($1,'crown','founding:singles','Crown Wrestling World Championship','SINGLES','ACTIVE',50),
     ($1,'crown','founding:tag','Crown Wrestling Tag Team Championship','TAG','ACTIVE',40),
     ($1,'crown','special','The Heritage Championship','SINGLES','ACTIVE',30),
     ($1,'rival','founding:singles','Rival Wrestling World Championship','SINGLES','ACTIVE',50)`,[worldId]);
   await tx.query("INSERT INTO ppw_people(world_id,person_id,name) VALUES($1,'champ','Champion')",[worldId]);
   await tx.query(`
    INSERT INTO ppw_championship_reigns(world_id,promotion_id,championship_id,
     reign_id,holder_type,person_id,status,start_week_index,defenses)
    VALUES($1,'crown','founding:singles','reign-1','PERSON','champ','ACTIVE',1,4)`,[worldId]);
   await tx.query(`
    UPDATE ppw_championships SET current_reign_id='reign-1'
    WHERE world_id=$1 AND promotion_id='crown' AND championship_id='founding:singles'`,[worldId]);
   await tx.query("INSERT INTO ppw_players(player_id) VALUES($1),($2)",[a,b]);
   await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status) VALUES($1,$2,'ACTIVE'),($1,$3,'ACTIVE')",
    [worldId,a,b]);
   await tx.query("INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id) VALUES($1,$2,'crown'),($1,$3,'rival')",
    [worldId,a,b]);
  });
  assert.equal(await getOwnerDisplayName(db.pool,a),null);
  assert.deepEqual(await saveOwnerDisplayName(db.pool,a,"Josh Robinson"),
   {displayName:"Josh Robinson"});
  assert.equal(await getOwnerDisplayName(db.pool,a),"Josh Robinson");
  assert.equal(await getOwnerDisplayName(db.pool,b),null);
  await assert.rejects(renameOwnedPromotion(db.pool,{
   worldId,playerId:a,promotionId:"rival",name:"Stolen Company"}),/current owner/);
  await assert.rejects(renameOwnedPromotion(db.pool,{
   worldId,playerId:b,promotionId:"rival",name:"Crown Wrestling"}),/already uses/);
  const before=await withWorldTransaction(db.pool,tx=>tx.query<{revision:number}>(`
   SELECT revision FROM ppw_worlds WHERE world_id=$1`,[worldId]));
  const renamed=await renameOwnedPromotion(db.pool,{
   worldId,playerId:a,promotionId:"crown",name:"Kingdom Pro"});
  assert.deepEqual(renamed,{
   name:"Kingdom Pro",previousName:"Crown Wrestling",changed:true});
  assert.deepEqual(await renameOwnedPromotion(db.pool,{
   worldId,playerId:a,promotionId:"crown",name:"Kingdom Pro"}),{
   name:"Kingdom Pro",previousName:"Kingdom Pro",changed:false});
  const after=await withWorldTransaction(db.pool,tx=>tx.query<{
   name:string;promotion_id:string;revision:number;previous_name:string|null;new_name:string|null}>(`
   SELECT p.name,p.promotion_id,w.revision,
    h.previous_name,h.new_name
   FROM ppw_promotions p JOIN ppw_worlds w ON w.world_id=p.world_id
   LEFT JOIN ppw_promotion_name_history h
    ON h.world_id=p.world_id AND h.promotion_id=p.promotion_id
   WHERE p.world_id=$1 AND p.promotion_id='crown'`,[worldId]));
  assert.equal(after[0]?.name,"Kingdom Pro");
  assert.equal(after[0]?.promotion_id,"crown");
  assert.equal(after[0]?.revision,before[0]?.revision);
  assert.equal(after[0]?.previous_name,"Crown Wrestling");
  assert.equal(after[0]?.new_name,"Kingdom Pro");
  assert.equal(after.length,1,"repeated identical rename cannot add duplicate history");
  const titles=await withWorldTransaction(db.pool,tx=>tx.query<{
   promotion_id:string;championship_id:string;name:string;
   current_reign_id:string|null;defenses:number|null}>(`
   SELECT c.promotion_id,c.championship_id,c.name,c.current_reign_id,r.defenses
   FROM ppw_championships c
   LEFT JOIN ppw_championship_reigns r ON r.world_id=c.world_id
    AND r.promotion_id=c.promotion_id AND r.championship_id=c.championship_id
    AND r.reign_id=c.current_reign_id
   WHERE c.world_id=$1 ORDER BY c.promotion_id,c.championship_id`,[worldId]));
  assert.deepEqual(titles.map(t=>t.name),[
   "Kingdom Pro World Championship","Kingdom Pro Tag Team Championship",
   "The Heritage Championship","Rival Wrestling World Championship"
  ]);
  assert.deepEqual(Object.fromEntries(titles.map(t=>[t.promotion_id+":"+t.championship_id,t.name])),{
   "crown:founding:singles":"Kingdom Pro World Championship",
   "crown:founding:tag":"Kingdom Pro Tag Team Championship",
   "crown:special":"The Heritage Championship",
   "rival:founding:singles":"Rival Wrestling World Championship"
  });
  assert.equal(titles.find(t=>t.championship_id==="founding:singles"&&
   t.promotion_id==="crown")?.current_reign_id,"reign-1");
  assert.equal(titles.find(t=>t.championship_id==="founding:singles"&&
   t.promotion_id==="crown")?.defenses,4);
  // Simulate a title left behind by an earlier rebrand and verify that the
  // one-time 0110 migration repairs the label without touching World history.
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query(`INSERT INTO ppw_championships(
    world_id,promotion_id,championship_id,name,division,status,prestige)
    VALUES($1,'crown','legacy',$2,'SINGLES','ACTIVE',20)`,
    [worldId,"Crown Wrestling Women's Championship"]);
   const migration=readFileSync("db/migrations/0110_rebrand_championship_labels.sql","utf8");
   await tx.query(migration,[]);
   await tx.query(migration,[]); // idempotent
  });
  const repaired=await withWorldTransaction(db.pool,tx=>tx.query<{name:string}>(`
   SELECT name FROM ppw_championships
   WHERE world_id=$1 AND promotion_id='crown' AND championship_id='legacy'`,[worldId]));
  assert.equal(repaired[0]?.name,"Kingdom Pro Women's Championship");
  // Same World, separate authorised owners: no duplicate display names even
  // when both write on distinct promotion rows simultaneously.
  const race=await Promise.allSettled([
   renameOwnedPromotion(db.pool,{worldId,playerId:a,promotionId:"crown",name:"Premier Wrestling"}),
   renameOwnedPromotion(db.pool,{worldId,playerId:b,promotionId:"rival",name:"Premier Wrestling"})
  ]);
  assert.equal(race.filter(x=>x.status==="fulfilled").length,1);
  assert.equal(race.filter(x=>x.status==="rejected").length,1);
  const duplicateCheck=await withWorldTransaction(db.pool,tx=>tx.query<{n:string}>(`
   SELECT name AS n FROM ppw_promotions WHERE world_id=$1
    AND lower(name)=lower('Premier Wrestling')`,[worldId]));
  assert.equal(duplicateCheck.length,1);
  const finalWorld=await withWorldTransaction(db.pool,tx=>tx.query<{revision:number}>(`
   SELECT revision FROM ppw_worlds WHERE world_id=$1`,[worldId]));
  assert.equal(finalWorld[0]?.revision,before[0]?.revision,
   "rebrands cannot accidentally advance or invalidate the World week");

 }finally{await db.close();}
});
