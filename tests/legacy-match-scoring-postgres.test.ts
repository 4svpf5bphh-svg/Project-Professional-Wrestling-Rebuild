import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {previewArchivedShowMatchScores} from "../src/db/legacy-match-scoring.js";
import {scoreArchivedSinglesBeforeInjuries} from "../src/simulation/legacy/match-scoring.js";
import {DeterministicRng,deterministicSeedFromText}
  from "../src/simulation/legacy/rng.js";
const url=process.env.PPW_NEON_TEST_URL;
test("original match rating/crowd run from only current-week relational context",
  {skip:!url?"No disposable PostgreSQL":false},async()=>{
  const db=postgresPool(url!,3),id=randomUUID(),worldId="archived-score-"+id;
  const promotionId="promotion-"+id,showId="show-"+id,personIds=["a-"+id,"b-"+id];
  const input={worldId,promotionId,showId};
  try{
    await withWorldTransaction(db.pool,async tx=>{
      await createWorld(tx,{id:worldId,name:"Archived Match Ratings",seed:502,rulesetVersion:"test"});
      await addPromotion(tx,worldId,{id:promotionId,name:"Scores",tier:"LOCAL"});
      await tx.query("INSERT INTO ppw_venues(world_id,venue_id,name) VALUES($1,'venue','Venue')",[worldId]);
      for(let i=0;i<2;i++){
        await tx.query(
          `INSERT INTO ppw_people
            (world_id,person_id,name,booking_division,in_ring_quality,match_craft,
             presentation,stamina,safety,fatigue,wear,popularity,recognition,momentum)
            VALUES($1,$2,'Talent','MEN',85,82,77,80,92,15,10,60,65,72)`,
          [worldId,personIds[i]!],
        );
        await tx.query(
          `INSERT INTO ppw_contracts
            (world_id,contract_id,person_id,promotion_id,family,status,remaining_dates,expires_week_index)
            VALUES($1,$2,$3,$4,'LIMITED_NON_EXCLUSIVE','SIGNED',4,52)`,
          [worldId,"contract-"+i+"-"+id,personIds[i]!,promotionId],
        );
      }
      await tx.query(
        `INSERT INTO ppw_booking_drafts
          (world_id,draft_id,promotion_id,year,week,status,show_day,venue_id,event_importance)
          VALUES($1,$2,$3,1,1,'SUBMITTED',3,'venue',61)`,
        [worldId,showId,promotionId],
      );
      const match={participants:[
        {personId:personIds[0],contractId:"contract-0-"+id},
        {personId:personIds[1],contractId:"contract-1-"+id},
      ],scriptedWinner:personIds[1],matchType:"SINGLES",
        intent:"TECHNICAL",plannedLengthMinutes:20,plannedFinish:"SUBMISSION"};
      await tx.query(
        `INSERT INTO ppw_card_slots(world_id,draft_id,slot_id,position,kind,payload)
         VALUES($1,$2,'opening',0,'MATCH',$3::jsonb),
               ($1,$2,'interview',1,'SEGMENT',$4::jsonb)`,
        [worldId,showId,JSON.stringify(match),
          JSON.stringify({participants:[],scriptedBeat:"untouched"})],
      );
      await tx.query("UPDATE ppw_worlds SET phase='RESOLVING' WHERE world_id=$1",[worldId]);
    });
    await assert.rejects(previewArchivedShowMatchScores(db.pool,input),/cleared submitted/);
    await withWorldTransaction(db.pool,tx=>tx.query(
      `INSERT INTO ppw_week_resource_clearances
        (world_id,year,week,eligible_promotions,inspected_slots,command_request_id)
        VALUES($1,1,1,1,2,'fixture-only')`,
      [worldId],
    ));
    const count:string[]=[];
    const instrumented={async connect(){
      const conn=await db.pool.connect();
      return {query:async<T extends Record<string,unknown>>(sql:string,values:readonly unknown[])=>{
        count.push(sql);return conn.query<T>(sql,values);
      },release(){conn.release()}};
    }};
    const result=await previewArchivedShowMatchScores(instrumented,input);
    assert.equal(count.length,6,"Expected four batched reads plus transaction: "+count.length);
    assert.equal(result.projections.length,1);
    const first=result.projections[0]!;
    assert.equal(first.winnerId,personIds[1]);
    assert.equal(first.plannedFinish,"SUBMISSION");
    assert.equal(first.score.stage,"PRE_INJURY_PRE_INTERFERENCE_PRE_SHOW_FLOW");
    assert.equal(first.score.styleResolver,"INTENT");
    // Until legacy World rulesets are imported, never fabricate an injury rate.
    assert.equal(first.injuryPreview,null);
    await withWorldTransaction(db.pool,tx=>tx.query(
      "UPDATE ppw_worlds SET injury_rate_multiplier=10 WHERE world_id=$1",[worldId],
    ));
    const injuryScored=await previewArchivedShowMatchScores(db.pool,input);
    const originalInjury=injuryScored.projections[0]!.injuryPreview;
    assert.ok(originalInjury!==null);
    assert.equal(originalInjury!.plannedWinnerId,personIds[1]);
    assert.equal(originalInjury!.plannedFinish,"SUBMISSION");
    assert.deepEqual(
      (await previewArchivedShowMatchScores(db.pool,input)).projections[0]!.injuryPreview,
      originalInjury);
    assert.deepEqual(injuryScored.projections[0]!.score,first.score);
    assert.equal(originalInjury!.preInjury.stage,"PRE_INJURY_PRE_INTERFERENCE_PRE_SHOW_FLOW");
    const [a,b]=[...personIds].sort();
    const rng=new DeterministicRng(deterministicSeedFromText(
      `502:chemistry:SINGLES:${a}:${b}`));
    const compatibility=Math.round(rng.float(-12,13)*10)/10;
    const chemistryModifier=compatibility*0.45;
    const player={skills:{inRingQuality:85,matchCraft:82,presentation:77,
      stamina:80,safety:92},popularity:60,recognition:65,momentum:72,fatigue:15,wear:10};
    assert.deepEqual(first.score,scoreArchivedSinglesBeforeInjuries({
      worldSeed:"502",matchId:showId+":opening",order:1,eventImportance:61,
      intent:"TECHNICAL",style:null,plannedFinish:"SUBMISSION",
      plannedLengthMinutes:20,chemistryModifier,people:[player,player],
    }));
    // A historical chemistry row must override first-match generated values.
    await withWorldTransaction(db.pool,tx=>tx.query(
      `INSERT INTO ppw_working_chemistry
       (world_id,person_a_id,person_b_id,context,compatibility,familiarity,matches_together)
       VALUES($1,$2,$3,'SINGLES',9,30,8)`,[worldId,a,b],
    ));
    const returning=await previewArchivedShowMatchScores(db.pool,input);
    assert.notEqual(first.score.executionQuality,returning.projections[0]!.score.executionQuality);
    assert.equal(returning.projections[0]!.chemistryModifier,8.55);
    await withWorldTransaction(db.pool,tx=>tx.query(
      "UPDATE ppw_people SET popularity=NULL WHERE world_id=$1 AND person_id=$2",
      [worldId,personIds[0]!],
    ));
    await assert.rejects(previewArchivedShowMatchScores(db.pool,input),
      /missing a wrestler attribute/);
    await withWorldTransaction(db.pool,tx=>tx.query(
      "UPDATE ppw_people SET popularity=60 WHERE world_id=$1 AND person_id=$2",
      [worldId,personIds[0]!],
    ));
    await withWorldTransaction(db.pool,tx=>tx.query(
      "UPDATE ppw_booking_drafts SET event_importance=NULL WHERE world_id=$1 AND draft_id=$2",
      [worldId,showId],
    ));
    await assert.rejects(previewArchivedShowMatchScores(db.pool,input),
      /event importance has not been migrated/);
    const receipts=await withWorldTransaction(db.pool,tx=>tx.query<{n:string}>(
      "SELECT count(*)::text AS n FROM ppw_show_resolutions WHERE world_id=$1",[worldId],
    ));
    assert.equal(receipts[0]!.n,"0");
    const balances=await withWorldTransaction(db.pool,tx=>tx.query<{remaining_dates:number}>(
      "SELECT remaining_dates FROM ppw_contracts WHERE world_id=$1 ORDER BY contract_id",[worldId],
    ));
    assert.deepEqual(balances.map(b=>b.remaining_dates),[4,4]);
    const payload=await withWorldTransaction(db.pool,tx=>tx.query<{payload:{scriptedWinner:string}}>(
      "SELECT payload FROM ppw_card_slots WHERE world_id=$1 AND slot_id='opening'",[worldId],
    ));
    assert.equal(payload[0]!.payload.scriptedWinner,personIds[1]);
  }finally{
    await withWorldTransaction(db.pool,async tx=>{
      await tx.query("DELETE FROM ppw_working_chemistry WHERE world_id=$1",[worldId]);
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
