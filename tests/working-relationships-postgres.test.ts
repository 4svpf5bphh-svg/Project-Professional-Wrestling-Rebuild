import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {settleWorkingPartnerships} from "../src/db/working-relationship-settlement.js";
import {readWorkingConnections} from "../src/db/working-connections-workspace.js";
const url=process.env.PPW_NEON_TEST_URL;
test("PostgreSQL: original working chemistry develops across promotions, respects cooldown, and strains only established partners",
 {skip:!url?"No disposable PostgreSQL":false},async()=>{
 const db=postgresPool(url!,4),id=randomUUID(),worldId="chem-"+id;
 const promos=["first-"+id,"second-"+id];
 const people=["a","b","c","d"].map(x=>x+"-"+id);
 const [a,b,c,d]=people as [string,string,string,string];
 const playerId="controller-"+id;
 const read=<T extends Record<string,unknown>>(sql:string,params:unknown[]=[])=>withWorldTransaction(
  db.pool,tx=>tx.query<T>(sql,params));
 const addShow=async(n:number,quality:number)=>{
  const showId="tag-"+n+"-"+id,matchId="tag-match-"+n,prom=promos[n%2]!;
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query([
    "INSERT INTO ppw_completed_shows(world_id,promotion_id,show_id,year,week,",
    "resolution_id,crowd_response,receipt_json,receipt_digest)",
    "VALUES($1,$2,$3,1,$4,$5,70,$6::jsonb,$7)"
   ].join(" "),[worldId,prom,showId,n,"resolved-"+n+"-"+id,
    JSON.stringify({showId}),"a".repeat(64)]);
   await tx.query([
    "INSERT INTO ppw_completed_show_matches(world_id,show_id,match_id,position,",
    "crowd_response,actual_finish,actual_winner_side)",
    "VALUES($1,$2,$3,0,70,'CLEAN_PIN','A')"
   ].join(" "),[worldId,showId,matchId]);
  });
  let queries=0;
  const result=await withWorldTransaction(db.pool,tx=>settleWorkingPartnerships({
   query:async<T extends Record<string,unknown>>(sql:string,params?:readonly unknown[])=>{
    queries++;return tx.query<T>(sql,params??[]);
   },
  },{worldId,showId,year:1,week:n,
   matches:[{matchId,executionQuality:quality,sideA:[a,b],sideB:[c,d]}]}));
  assert.ok(queries<=6,"One show must use a bounded 3–6 SQL operations, not per wrestler");
  return result;
 };
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:worldId,name:"Partnership evidence",seed:10,rulesetVersion:"test"});
   for(const promo of promos)await addPromotion(tx,worldId,{
    id:promo,name:promo,tier:"LOCAL"});
   for(const personId of people)await tx.query(
    "INSERT INTO ppw_people(world_id,person_id,name) VALUES($1,$2,$3)",
    [worldId,personId,personId]);
   await tx.query("INSERT INTO ppw_players(player_id) VALUES($1)",[playerId]);
   await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status) VALUES($1,$2,'ACTIVE')",
    [worldId,playerId]);
   await tx.query("INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id) VALUES($1,$2,$3)",
    [worldId,playerId,promos[0]!]);
   for(const [i,personId] of [a,b].entries())await tx.query([
    "INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,",
    "family,status,remaining_dates,expires_week_index)",
    "VALUES($1,$2,$3,$4,'EXCLUSIVE','SIGNED',NULL,52)"
   ].join(" "),[worldId,"signed-"+i+"-"+id,personId,promos[0]!]);
  });
  assert.deepEqual(await addShow(1,84),{appearances:2,developments:0});
  assert.equal((await read<{n:string}>(
   "SELECT count(*)::text AS n FROM ppw_wrestler_relationships WHERE world_id=$1",[worldId]))[0]!.n,"0");
  assert.deepEqual(await addShow(2,85),{appearances:2,developments:2});
  const rel=await read<{professional_trust:number;familiarity:number;
   affinity:number;rivalry_heat:number}>([
   "SELECT professional_trust,familiarity,affinity,rivalry_heat",
   "FROM ppw_wrestler_relationships WHERE world_id=$1 ORDER BY person_a_id"
  ].join(" "),[worldId]);
  assert.deepEqual(rel,Array.from({length:2},()=>({
   professional_trust:50.8,familiarity:2,affinity:0,rivalry_heat:0})));
  const connections=await readWorkingConnections(db.pool,{
   worldId,promotionId:promos[0]!,playerId,personId:a});
  assert.equal(connections.roster.length,2);
  assert.equal(connections.connections[0]!.personId,b);
  assert.equal(connections.connections[0]!.recentTagMatches,2);
  assert.equal(connections.connections[0]!.familiarity,2);
  assert.equal(connections.connections[0]!.professionalTrust,50.8);
  assert.equal(connections.connections[0]!.lastDevelopment?.kind,"IMPROVEMENT");
  await assert.rejects(readWorkingConnections(db.pool,{
   worldId,promotionId:promos[0]!,playerId:"not-controller",personId:a}),
   /access denied/);
  await assert.rejects(readWorkingConnections(db.pool,{
   worldId,promotionId:promos[0]!,playerId,personId:c}),
   /current roster/);
  assert.deepEqual(await addShow(3,89),{appearances:2,developments:0});
  assert.equal((await read<{n:string}>(
   "SELECT count(*)::text AS n FROM ppw_wrestler_relationship_changes WHERE world_id=$1",[worldId]))[0]!.n,"2");
  // Establish realistic cooperation before poor subsequent shows. This is
  // explicit test seeding, NOT a fabricated result of the first tag bout.
  await withWorldTransaction(db.pool,tx=>tx.query(
   "UPDATE ppw_wrestler_relationships SET familiarity=16,professional_trust=62 WHERE world_id=$1",
   [worldId]));
  for(const n of [14,15])assert.deepEqual(await addShow(n,30),
   {appearances:2,developments:0});
  assert.deepEqual(await addShow(16,28),{appearances:2,developments:2});
  const strained=await read<{professional_trust:number;familiarity:number}>([
   "SELECT professional_trust,familiarity FROM ppw_wrestler_relationships",
   "WHERE world_id=$1 ORDER BY person_a_id"
  ].join(" "),[worldId]);
  assert.deepEqual(strained,[{professional_trust:61.4,familiarity:16},
   {professional_trust:61.4,familiarity:16}]);
  const changeTypes=await read<{change_type:string;n:string}>(
   "SELECT change_type,count(*)::text AS n FROM ppw_wrestler_relationship_changes"+
   " WHERE world_id=$1 GROUP BY change_type ORDER BY change_type",[worldId]);
  assert.deepEqual(changeTypes,[{change_type:"IMPROVEMENT",n:"2"},
   {change_type:"STRAIN",n:"2"}]);
  assert.equal((await read<{n:string}>(
   "SELECT count(*)::text AS n FROM ppw_tag_working_pair_appearances WHERE world_id=$1",
   [worldId]))[0]!.n,"12");
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_wrestler_relationship_changes",
    "ppw_tag_working_pair_appearances","ppw_wrestler_relationships",
    "ppw_completed_show_matches","ppw_completed_shows",
    "ppw_ledger_events","ppw_contracts","ppw_promotion_controls",
    "ppw_memberships","ppw_people","ppw_promotions"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[playerId]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
  }).finally(()=>db.close());
 }
});

test("certified 3v3 bouts develop all six authentic teammate pairs only after two shows",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const id=randomUUID(),worldId="trio-chem-"+id,promo="arena-"+id;
 const people=["a","b","c","d","e","f"].map(x=>x+"-"+id);
 const db=postgresPool(url!,3);
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:worldId,name:"Real Trio Chemistry",seed:17,rulesetVersion:"test"});
   await addPromotion(tx,worldId,{id:promo,name:"Arena",tier:"LOCAL"});
   for(const p of people)await tx.query(
    "INSERT INTO ppw_people(world_id,person_id,name) VALUES($1,$2,$3)",
    [worldId,p,p]);
  });
  for(const week of [1,2]){
   const showId="trio-show-"+week,matchId="trio-match-"+week;
   await withWorldTransaction(db.pool,async tx=>{
    await tx.query([
     "INSERT INTO ppw_completed_shows(world_id,promotion_id,show_id,year,week,",
     "resolution_id,crowd_response,receipt_json,receipt_digest)",
     "VALUES($1,$2,$3,1,$4,$5,88,'{}'::jsonb,repeat('b',64))"
    ].join(" "),[worldId,promo,showId,week,"resolve-"+id+"-"+week]);
    await tx.query([
     "INSERT INTO ppw_completed_show_matches(world_id,show_id,match_id,position,",
     "crowd_response,actual_finish,actual_winner_side)",
     "VALUES($1,$2,$3,0,88,'CLEAN_PIN','A')"
    ].join(" "),[worldId,showId,matchId]);
    const outcome=await settleWorkingPartnerships(tx,{worldId,showId,year:1,week,
     matches:[{matchId,executionQuality:82,
      sideA:people.slice(0,3),sideB:people.slice(3)}]});
    assert.deepEqual(outcome,{appearances:6,developments:week===1?0:6});
   });
  }
  await withWorldTransaction(db.pool,async tx=>{
   const pairs=await tx.query<{n:number}>([
    "SELECT count(*)::integer AS n FROM ppw_tag_working_pair_appearances",
    "WHERE world_id=$1"
   ].join(" "),[worldId]);
   const developments=await tx.query<{n:number}>([
    "SELECT count(*)::integer AS n FROM ppw_wrestler_relationship_changes",
    "WHERE world_id=$1"
   ].join(" "),[worldId]);
   assert.equal(pairs[0]!.n,12);
   assert.equal(developments[0]!.n,6);
  });
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_wrestler_relationship_changes",
    "ppw_tag_working_pair_appearances","ppw_wrestler_relationships",
    "ppw_completed_show_matches","ppw_completed_shows",
    "ppw_ledger_events","ppw_people","ppw_promotions"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
  }).finally(()=>db.close());
 }
});
