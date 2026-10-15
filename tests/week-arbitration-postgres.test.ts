import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {previewWorldWeekArbitration} from "../src/db/week-arbitration.js";

const url=process.env.PPW_NEON_TEST_URL;
test("arbitration shares indexed World inspection and leaves bookings, dates untouched",
  {skip:!url?"No disposable PostgreSQL":false},async()=>{
  const db=postgresPool(url!,3),id=randomUUID(),worldId="arbitrate-"+id;
  const promos=["promotion-a-"+id,"promotion-b-"+id],personId="person-"+id;
  const contracts=["contract-a-"+id,"contract-b-"+id];
  const shows=["show-a-"+id,"show-b-"+id];
  try{
    await withWorldTransaction(db.pool,async tx=>{
      await createWorld(tx,{id:worldId,name:"Fair Resource Draw",seed:401,rulesetVersion:"test"});
      for(const [i,p] of promos.entries())await addPromotion(tx,worldId,{id:p,name:"Promotion "+i,tier:"LOCAL"});
      await tx.query("INSERT INTO ppw_venues(world_id,venue_id,name) VALUES($1,'central','Central')",[worldId]);
      await tx.query("INSERT INTO ppw_people(world_id,person_id,name,weekly_service_capacity) VALUES($1,$2,'Star',2)",[worldId,personId]);
      await tx.query(`INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,family,status,remaining_dates,expires_week_index)
        VALUES($1,$2,$4,$5,'LIMITED_NON_EXCLUSIVE','SIGNED',2,20),($1,$3,$4,$6,'LIMITED_NON_EXCLUSIVE','SIGNED',2,20)`,
        [worldId,contracts[0],contracts[1],personId,promos[0],promos[1]]);
      await tx.query(`INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week,status,show_day,venue_id)
        VALUES($1,$2,$4,1,1,'SUBMITTED',3,'central'),($1,$3,$5,1,1,'SUBMITTED',3,'central')`,
        [worldId,shows[0],shows[1],promos[0],promos[1]]);
      await tx.query(`INSERT INTO ppw_card_slots(world_id,draft_id,slot_id,position,kind,payload)
        VALUES($1,$2,'s1',0,'MATCH',$4::jsonb),($1,$3,'s2',0,'MATCH',$5::jsonb)`,
        [worldId,shows[0],shows[1],
          JSON.stringify({participants:[{personId,contractId:contracts[0]}],scriptedWinner:"fixed"}),
          JSON.stringify({participants:[{personId,contractId:contracts[1]}],scriptedWinner:"fixed"})]);
      await tx.query("UPDATE ppw_worlds SET phase='RESOLVING' WHERE world_id=$1",[worldId]);
    });
    const queries:string[]=[];
    const meter={async connect(){
      const client=await db.pool.connect();
      return {query:async<T extends Record<string,unknown>>(sql:string,params:readonly unknown[])=>{
        queries.push(sql);return client.query<T>(sql,params);
      },release(){client.release()}};
    }};
    const a=await previewWorldWeekArbitration(meter,worldId);
    const b=await previewWorldWeekArbitration(db.pool,worldId);
    assert.deepEqual(a,b);
    assert.equal(a.outcomes.filter(x=>x.kind==="VENUE").length,1);
    assert.equal(a.outcomes.filter(x=>x.kind==="WRESTLER").length,1);
    assert.equal(a.canClearWithoutRemediation,false);
    assert.ok(queries.length<=7,"inspector should not do per-wrestler SQL: "+queries.length);
    const persisted=await withWorldTransaction(db.pool,tx=>tx.query<{remaining_dates:number}>(
      "SELECT remaining_dates FROM ppw_contracts WHERE world_id=$1 ORDER BY contract_id",[worldId]));
    assert.deepEqual(persisted.map(c=>c.remaining_dates),[2,2]);
    const cards=await withWorldTransaction(db.pool,tx=>tx.query<{payload:unknown}>(
      "SELECT payload FROM ppw_card_slots WHERE world_id=$1 ORDER BY slot_id",[worldId]));
    assert.ok(cards.every(c=>(c.payload as {scriptedWinner:string}).scriptedWinner==="fixed"));
  } finally{
    await withWorldTransaction(db.pool,async tx=>{
      await tx.query("DELETE FROM ppw_booking_drafts WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_contracts WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_people WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_venues WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_promotions WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
    }).finally(()=>db.close());
  }
});
