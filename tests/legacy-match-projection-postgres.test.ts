import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {previewLegacyShowMatchStyles} from "../src/db/legacy-match-projection.js";
import {evaluateMatchStyleExecution,defaultMatchStyleForIntent}
  from "../src/simulation/legacy/match-style.js";

const url=process.env.PPW_NEON_TEST_URL;
test("archived PPW style formulas run on bounded current-World wrestler rows without charging dates",
 {skip:!url?"No disposable PostgreSQL":false},async()=>{
  const db=postgresPool(url!,3),id=randomUUID(),worldId="legacy-skills-"+id;
  const promotionId="promotion-"+id,showId="show-"+id,ids=["alpha-"+id,"bravo-"+id];
  const input={worldId,promotionId,showId};
  try{
    await withWorldTransaction(db.pool,async tx=>{
      await createWorld(tx,{id:worldId,name:"Legacy Match Projection",seed:300,rulesetVersion:"test"});
      await addPromotion(tx,worldId,{id:promotionId,name:"Promotion",tier:"LOCAL"});
      for(const personId of ids)await tx.query(
        `INSERT INTO ppw_people(world_id,person_id,name,booking_division,
           in_ring_quality,match_craft,presentation,stamina,safety,fatigue,wear)
         VALUES($1,$2,'Wrestler','MEN',85,80,70,75,90,5,10)`,
        [worldId,personId],
      );
      for(let i=0;i<2;i++)await tx.query(
        `INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,
             family,status,remaining_dates,expires_week_index)
           VALUES($1,$2,$3,$4,'LIMITED_NON_EXCLUSIVE','SIGNED',4,52)`,
        [worldId,"contract-"+i+"-"+id,ids[i]!,promotionId],
      );
      await tx.query("INSERT INTO ppw_venues(world_id,venue_id,name) VALUES($1,'venue','Venue')",[worldId]);
      await tx.query(
        `INSERT INTO ppw_booking_drafts
           (world_id,draft_id,promotion_id,year,week,status,show_day,venue_id)
          VALUES($1,$2,$3,1,1,'SUBMITTED',3,'venue')`,
        [worldId,showId,promotionId],
      );
      await tx.query(
        `INSERT INTO ppw_card_slots(world_id,draft_id,slot_id,position,kind,payload)
         VALUES($1,$2,'match',0,'MATCH',$3::jsonb),
               ($1,$2,'interview',1,'SEGMENT',$4::jsonb)`,
        [worldId,showId,JSON.stringify({participants:[
          {personId:ids[0],contractId:"contract-0-"+id},
          {personId:ids[1],contractId:"contract-1-"+id},
        ],scriptedWinner:ids[1],intent:"TECHNICAL",plannedFinish:"SUBMISSION",
          plannedLengthMinutes:20,matchType:"SINGLES"}),
          JSON.stringify({participants:[],scriptedOutcome:"no rewrite"})],
      );
      await tx.query("UPDATE ppw_worlds SET phase='RESOLVING' WHERE world_id=$1",[worldId]);
    });
    await assert.rejects(previewLegacyShowMatchStyles(db.pool,input),/cleared and submitted/);
    await withWorldTransaction(db.pool,tx=>tx.query(
      `INSERT INTO ppw_week_resource_clearances
       (world_id,year,week,eligible_promotions,inspected_slots,command_request_id)
       VALUES($1,1,1,1,2,'test-only-clearance')`,[worldId],
    ));
    const statements:string[]=[];
    const measured={async connect(){
      const client=await db.pool.connect();
      return {query:async<T extends Record<string,unknown>>(sql:string,params:readonly unknown[])=>{
        statements.push(sql);return client.query<T>(sql,params);
      },release(){client.release()}};
    }};
    const result=await previewLegacyShowMatchStyles(measured,input);
    assert.ok(statements.length<=6,"Unexpected SQL cost: "+statements.length);
    assert.equal(result.matchCount,1);
    const singles=result.projections[0]!;
    if(!("winnerId" in singles))throw new Error("Expected a singles projection");
    assert.equal(singles.winnerId,ids[1]);
    assert.equal(singles.plannedFinish,"SUBMISSION");
    assert.equal(result.projections[0]!.status,"READY");
    assert.equal(singles.style.technical,92);
    const original=evaluateMatchStyleExecution(defaultMatchStyleForIntent("TECHNICAL"),{
      inRingQuality:85,matchCraft:80,presentation:70,stamina:75,safety:90},20);
    assert.deepEqual(singles.styleEvaluations,[original,original]);

    // Actual skill data, not guessed averages, determine who needs review.
    await withWorldTransaction(db.pool,tx=>tx.query(
      "UPDATE ppw_people SET fatigue=95 WHERE world_id=$1 AND person_id=$2",
      [worldId,ids[1]!],
    ));
    const fatigued=await previewLegacyShowMatchStyles(db.pool,input);
    assert.equal(fatigued.projections[0]!.status,"NEEDS_STYLE_REVIEW");
    if(!("winnerId" in fatigued.projections[0]!))
      throw new Error("Expected a singles projection");
    assert.equal(fatigued.projections[0]!.winnerId,ids[1]);

    await withWorldTransaction(db.pool,tx=>tx.query(
      "UPDATE ppw_people SET safety=NULL WHERE world_id=$1 AND person_id=$2",
      [worldId,ids[1]!],
    ));
    await assert.rejects(previewLegacyShowMatchStyles(db.pool,input),
      /Missing or invalid original PPW wrestler skills/);
    await withWorldTransaction(db.pool,tx=>tx.query(
      "UPDATE ppw_people SET safety=90,booking_division='WOMEN' WHERE world_id=$1 AND person_id=$2",
      [worldId,ids[1]!],
    ));
    await assert.rejects(previewLegacyShowMatchStyles(db.pool,input),/Mixed booking divisions/);
    await withWorldTransaction(db.pool,tx=>tx.query(
      "UPDATE ppw_people SET booking_division='MEN' WHERE world_id=$1 AND person_id=$2",
      [worldId,ids[1]!],
    ));
    await assert.rejects(previewLegacyShowMatchStyles(db.pool,{
      worldId,promotionId:"other",showId,
    }),/cleared and submitted/);
    const status=await withWorldTransaction(db.pool,tx=>tx.query<{remaining_dates:number}>(
      "SELECT remaining_dates FROM ppw_contracts WHERE world_id=$1 ORDER BY contract_id",[worldId],
    ));
    assert.deepEqual(status.map(x=>x.remaining_dates),[4,4]);
    const slots=await withWorldTransaction(db.pool,tx=>tx.query<{payload:{scriptedWinner:string}}> (
      "SELECT payload FROM ppw_card_slots WHERE world_id=$1 AND slot_id='match'",[worldId],
    ));
    assert.equal(slots[0]!.payload.scriptedWinner,ids[1]);
    const resolutions=await withWorldTransaction(db.pool,tx=>tx.query<{n:string}>(
      "SELECT count(*)::text AS n FROM ppw_show_resolutions WHERE world_id=$1",[worldId],
    ));
    assert.equal(resolutions[0]!.n,"0");
  }finally{
    await withWorldTransaction(db.pool,async tx=>{
      await tx.query("DELETE FROM ppw_week_resource_clearances WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_booking_drafts WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_contracts WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_people WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_venues WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_promotions WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
    }).finally(()=>db.close());
  }
});
