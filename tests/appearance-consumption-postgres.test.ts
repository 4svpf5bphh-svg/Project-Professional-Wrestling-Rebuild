import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { postgresPool } from "../src/db/postgres.js";
import { withWorldTransaction } from "../src/db/transaction.js";
import { createWorld,addPromotion } from "../src/db/world-operations.js";
import { consumeShowAppearances } from "../src/db/appearance-consumption.js";
import { beginWorldResolution } from "../src/db/world-lock.js";
import { clearWorldWeekResources } from "../src/db/week-clearance.js";

const url=process.env.PPW_NEON_TEST_URL;
test("show date charges are atomic and idempotent, including failed mixed cards",{skip:!url?"No disposable PostgreSQL":false},async()=>{
  const db=postgresPool(url!,3),id=randomUUID(),worldId="dates-"+id;
  const promotionId="promotion-"+id,p1="finite-"+id,p2="unlimited-"+id,c1="contract-f-"+id,c2="contract-u-"+id,
  p3="runin-"+id,c3="contract-runin-"+id;
  const extras=Array.from({length:16},(_,n)=>({personId:"extra-"+n+"-"+id,contractId:"extra-contract-"+n+"-"+id}));

  const read=async(contractId=c1)=>withWorldTransaction(db.pool,async tx=>{
    const r=await tx.query<{remaining_dates:number|null}>("SELECT remaining_dates FROM ppw_contracts WHERE world_id=$1 AND contract_id=$2",[worldId,contractId]);
    return r[0]!.remaining_dates;
  });
  try {
    await withWorldTransaction(db.pool,async tx=>{
      await createWorld(tx,{id:worldId,name:"Date Fixture",seed:4,rulesetVersion:"test"});
      await tx.query("UPDATE ppw_worlds SET week=11 WHERE world_id=$1",[worldId]);
      await addPromotion(tx,worldId,{id:promotionId,name:"Date Promotion",tier:"LOCAL"});
      await tx.query("INSERT INTO ppw_venues(world_id,venue_id,name) VALUES($1,'date-arena','Date Arena')",[worldId]);
      await tx.query("INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week,status,show_day,venue_id) VALUES($1,$2,$3,1,11,'SUBMITTED',3,'date-arena'),($1,$4,$3,1,12,'SUBMITTED',3,'date-arena')",[worldId,"show-"+id,promotionId,"bad-show-"+id]);
      await tx.query("INSERT INTO ppw_card_slots(world_id,draft_id,slot_id,position,kind,payload) VALUES($1,$2,$3,0,'MATCH',$4::jsonb),($1,$5,$6,0,'MATCH',$7::jsonb)",[worldId,"show-"+id,"slot-"+id,JSON.stringify({participants:[{personId:p1,contractId:c1},{personId:p1,contractId:c1},{personId:p2,contractId:c2},...extras],interference:{personId:p3,contractId:c3,aidedSide:"A",plannedOutcome:"SUCCESS"}}),"bad-show-"+id,"bad-slot-"+id,JSON.stringify({participants:[{personId:p1,contractId:c1},{personId:"missing",contractId:"missing"}]})]);
      await tx.query("INSERT INTO ppw_people(world_id,person_id,name) VALUES($1,$2,'Finite'),($1,$3,'Unlimited'),($1,$4,'Run-in')",[worldId,p1,p2,p3]);
      await tx.query("INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,family,status,remaining_dates,expires_week_index) VALUES($1,$2,$3,$4,'LIMITED_NON_EXCLUSIVE','SIGNED',2,20),($1,$5,$6,$4,'EXCLUSIVE','SIGNED',NULL,20)",[worldId,c1,p1,promotionId,c2,p2]);
      await tx.query("INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,family,status,remaining_dates,expires_week_index) VALUES($1,$2,$3,$4,'LIMITED_NON_EXCLUSIVE','SIGNED',2,20)",[worldId,c3,p3,promotionId]);
      await tx.query("INSERT INTO ppw_people(world_id,person_id,name) SELECT $1,person_id,person_id FROM unnest($2::text[]) AS person(person_id)",[worldId,extras.map(x=>x.personId)]);
      await tx.query(`INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,family,status,remaining_dates,expires_week_index)
        SELECT $1,joined.contract_id,joined.person_id,$2,'LIMITED_NON_EXCLUSIVE','SIGNED',1,20
        FROM unnest($3::text[],$4::text[]) AS joined(contract_id,person_id)`,
        [worldId,promotionId,extras.map(x=>x.contractId),extras.map(x=>x.personId)]);

    });
    const baseInput={worldId,playerId:"system",promotionId,showId:"show-"+id,requestId:"resolve-"+id};
    await assert.rejects(consumeShowAppearances(db.pool,{...baseInput,expectedRevision:0}),/World is not resolving/);
    assert.equal(await read(),2);
    const start={worldId,requestId:"begin-"+id,expectedRevision:0};
    await assert.rejects(beginWorldResolution(db.pool,start),/World must be locked/);
    await withWorldTransaction(db.pool,tx=>tx.query("UPDATE ppw_worlds SET phase='LOCKED' WHERE world_id=$1",[worldId]));
    const begun=await beginWorldResolution(db.pool,start);
    assert.equal(begun.status,"APPLIED");
    assert.deepEqual(begun.result,{year:1,week:11,weekIndex:10});
    assert.equal((await beginWorldResolution(db.pool,start)).status,"REPLAYED");
    await assert.rejects(beginWorldResolution(db.pool,{...start,requestId:"second-begin-"+id,expectedRevision:1}),/World must be locked/);
    await assert.rejects(consumeShowAppearances(db.pool,{...baseInput,expectedRevision:1}),/resource clearance required/);
    const cleared=await clearWorldWeekResources(db.pool,{worldId,requestId:"clear-"+id,expectedRevision:1});
    assert.equal(cleared.status,"APPLIED");
    assert.deepEqual(cleared.result,{year:1,week:11,eligiblePromotions:1,inspectedSlots:1});
    const input={...baseInput,expectedRevision:2};
    const queries:string[]=[];
    const meteredPool={
      async connect(){
        const connection=await db.pool.connect();
        return {
          async query<T extends Record<string,unknown>>(sql:string,params:readonly unknown[]){
            queries.push(sql);
            return connection.query<T>(sql,params);
          },
          release(){connection.release();},
        };
      },
    };
    const result=await consumeShowAppearances(meteredPool,input);
    assert.equal(result.status,"APPLIED");
    assert.deepEqual(result.result,{performers:19,datesCharged:18});
    // 19 including run-in: constant 12 SQL statements including BEGIN/COMMIT.
    assert.ok(queries.length<=12,"too many queries: "+queries.length);
    assert.equal(queries.filter(sql=>sql.includes("FROM unnest(")).length,1);
    assert.equal(queries.filter(sql=>sql.startsWith("UPDATE ppw_contracts")).length,1);
    const fullyCharged=await withWorldTransaction(db.pool,tx=>tx.query<{count:string}>(
      "SELECT count(*)::text AS count FROM ppw_contracts WHERE world_id=$1 AND person_id=ANY($2::text[]) AND remaining_dates=0",
      [worldId,extras.map(x=>x.personId)],
    ));
    assert.equal(Number(fullyCharged[0]!.count),extras.length);
    assert.equal(await read(),1);
    assert.equal(await read(c3),1,"Run-in costs one date");
    assert.equal((await consumeShowAppearances(db.pool,input)).status,"REPLAYED");
    assert.equal(await read(),1);
    assert.equal(await read(c3),1,"Retry does not double-charge the run-in");
    await assert.rejects(consumeShowAppearances(db.pool,{...input,requestId:"duplicate-show-"+id,expectedRevision:3}),/Show already resolved/);
    assert.equal(await read(),1);
    await assert.rejects(consumeShowAppearances(db.pool,{...input,showId:"bad-show-"+id,requestId:"wrong-week-"+id,expectedRevision:3}),/World week/);
    await withWorldTransaction(db.pool,tx=>tx.query("UPDATE ppw_worlds SET week=12 WHERE world_id=$1",[worldId]));
    await assert.rejects(consumeShowAppearances(db.pool,{...input,showId:"bad-show-"+id,requestId:"bad-"+id,expectedRevision:3}),/resource clearance required/);
    assert.equal(await read(),1);
  } finally {
    await withWorldTransaction(db.pool,async tx=>{
      await tx.query("DELETE FROM ppw_show_resolutions WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_week_resource_clearances WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_command_receipts WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_booking_drafts WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_contracts WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_people WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_venues WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_promotions WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
    }).finally(()=>db.close());
  }
});
