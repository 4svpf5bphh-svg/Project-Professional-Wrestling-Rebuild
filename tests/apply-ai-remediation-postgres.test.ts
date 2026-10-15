import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {previewWorldWeekArbitration} from "../src/db/week-arbitration.js";
import {previewWorldWeekRemediations} from "../src/db/week-remediation.js";
import {recordWorldWeekArbitration,readRecordedWeekArbitration} from "../src/db/recorded-week-arbitration.js";
import {applyAiWeekRemediation} from "../src/db/apply-ai-remediation.js";

const url=process.env.PPW_NEON_TEST_URL;
test("AI-only remedies serialize two losers, protect human claims, preserve authored cards and never charge dates",
  {skip:!url?"No disposable PostgreSQL":false},async()=>{
    const db=postgresPool(url!,4),suffix=randomUUID(),worldId="ai-remedies-"+suffix;
    const promos=[0,1,2].map(i=>"promo-"+i+"-"+suffix);
    const shows=[0,1,2].map(i=>"show-"+i+"-"+suffix);
    const playerId="player-"+suffix;
    const make=(requestId:string,expectedRevision:number,showId:string,choice:{kind:"CHANGE_VENUE"|"CHANGE_DAY";day:number;venueId:string},expectedStateFingerprint:string)=>
      applyAiWeekRemediation(db.pool,{worldId,requestId,expectedRevision,showId,choice,expectedStateFingerprint});
    try{
      await withWorldTransaction(db.pool,async tx=>{
        await createWorld(tx,{id:worldId,name:"AI Remedies",seed:42,rulesetVersion:"test"});
        for(let i=0;i<3;i++){
          await addPromotion(tx,worldId,{id:promos[i]!,name:"Promotion "+i,tier:"LOCAL"});
        }
        await tx.query("UPDATE ppw_promotions SET management_mode='AI' WHERE world_id=$1",[worldId]);
        await tx.query("INSERT INTO ppw_venues(world_id,venue_id,name) VALUES($1,'main','Main'),($1,'spare','Spare')",[worldId]);
        for(let i=0;i<3;i++){
          await tx.query(
            "INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week,status,show_day,venue_id) VALUES($1,$2,$3,1,1,'SUBMITTED',3,'main')",
            [worldId,shows[i]!,promos[i]!],
          );
          await tx.query(
            "INSERT INTO ppw_card_slots(world_id,draft_id,slot_id,position,kind,payload) VALUES($1,$2,$3,0,'SEGMENT',$4::jsonb)",
            [worldId,shows[i]!,"slot-"+i,JSON.stringify({participants:[],scriptedOutcome:"never rewritten "+i})],
          );
        }
        await tx.query("UPDATE ppw_worlds SET phase='RESOLVING' WHERE world_id=$1",[worldId]);
      });
      const preview=await previewWorldWeekArbitration(db.pool,worldId);
      assert.equal(preview.outcomes.length,2);
      const recorded=await recordWorldWeekArbitration(db.pool,{
        worldId,requestId:"record-"+suffix,expectedRevision:0,
        expectedStateFingerprint:preview.stateFingerprint,
      });
      assert.equal(recorded.status,"APPLIED");
      let proposals=await previewWorldWeekRemediations(db.pool,worldId);
      assert.equal(proposals.status,"CURRENT");
      if(proposals.status!=="CURRENT") throw new Error("Expected remediation choices");
      assert.equal(proposals.shows.length,2);
      const first=proposals.shows[0]!,firstChoice=first.choices[0]!;
      const second=proposals.shows[1]!;
      assert.equal(firstChoice.kind,"CHANGE_VENUE");

      // A dormant promotion is NOT automatically staff-authorised.
      await withWorldTransaction(db.pool,tx=>tx.query(
        "UPDATE ppw_promotions SET management_mode='UNASSIGNED' WHERE world_id=$1 AND promotion_id=$2",
        [worldId,first.promotionId],
      ));
      await assert.rejects(make("dormant",1,first.showId,firstChoice,proposals.sourceFingerprint),/Human or unassigned/);
      await withWorldTransaction(db.pool,tx=>tx.query(
        "UPDATE ppw_promotions SET management_mode='AI' WHERE world_id=$1 AND promotion_id=$2",
        [worldId,first.promotionId],
      ));
      // A human controller always blocks AI changes, even if the AI flag
      // has not yet been synchronised by the claim service.
      await withWorldTransaction(db.pool,async tx=>{
        await tx.query("INSERT INTO ppw_players(player_id) VALUES($1)",[playerId]);
        await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status) VALUES($1,$2,'ACTIVE')",[worldId,playerId]);
        await tx.query("INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id) VALUES($1,$2,$3)",[worldId,playerId,first.promotionId]);
      });
      await assert.rejects(make("human",1,first.showId,firstChoice,proposals.sourceFingerprint),/Human or unassigned/);
      await withWorldTransaction(db.pool,tx=>tx.query(
        "DELETE FROM ppw_promotion_controls WHERE world_id=$1",[worldId],
      ));
      // Once certified resolution starts, even AI cannot edit the schedule.
      await withWorldTransaction(db.pool,tx=>tx.query(
        "INSERT INTO ppw_week_resource_clearances(world_id,year,week,eligible_promotions,inspected_slots,command_request_id) VALUES($1,1,1,3,3,'fixture')",[worldId],
      ));
      await assert.rejects(make("too-late",1,first.showId,firstChoice,proposals.sourceFingerprint),/after World resolution begins/);
      await withWorldTransaction(db.pool,tx=>tx.query(
        "DELETE FROM ppw_week_resource_clearances WHERE world_id=$1",[worldId],
      ));
      await assert.rejects(make("forged",1,first.showId,
        {kind:"CHANGE_VENUE",day:3,venueId:"non-existent"},proposals.sourceFingerprint),/Alternative no longer available/);
      await assert.rejects(make("old-fingerprint",1,first.showId,firstChoice,"0".repeat(64)),/proposal changed/);
      const stats:string[]=[];
      const meter={
        async connect(){
          const connection=await db.pool.connect();
          return {
            async query<T extends Record<string,unknown>>(sql:string,params:readonly unknown[]){
              stats.push(sql);
              return connection.query<T>(sql,params);
            },
            release(){connection.release()},
          };
        },
      };
      const fromMeter=applyAiWeekRemediation(meter,{
        worldId,requestId:"metered-"+suffix,expectedRevision:1,
        showId:first.showId,choice:firstChoice,expectedStateFingerprint:proposals.sourceFingerprint,
      });
      const concurrent=make("concurrent-"+suffix,1,first.showId,firstChoice,proposals.sourceFingerprint);
      const racing=await Promise.all([fromMeter,concurrent]);
      assert.equal(racing.filter(r=>r.status==="APPLIED").length,1);
      assert.equal(racing.filter(r=>r.status==="STALE").length,1);
      assert.ok(stats.length<=24,"Too many SQL statements: "+stats.length);
      const winning=racing[0]!.status==="APPLIED"?"metered-"+suffix:"concurrent-"+suffix;
      assert.equal((await make(winning,1,first.showId,firstChoice,proposals.sourceFingerprint)).status,"REPLAYED");
      assert.equal((await readRecordedWeekArbitration(db.pool,worldId)).status,"CURRENT");
      await assert.rejects(make("stale-second",2,second.showId,second.choices[0]!,proposals.sourceFingerprint),
        /proposal changed/);
      const revised=await previewWorldWeekRemediations(db.pool,worldId);
      assert.equal(revised.status,"CURRENT");
      if(revised.status!=="CURRENT")throw new Error("Missing continuation");
      assert.equal(revised.shows.length,1);
      const last=revised.shows[0]!;
      // spare venue was taken by the previous approved AI show, therefore
      // its next suggestion must not double-book that venue.
      assert.equal(last.choices[0]!.kind,"CHANGE_DAY");
      const finished=await make("second-"+suffix,2,last.showId,last.choices[0]!,revised.sourceFingerprint);
      assert.equal(finished.status,"APPLIED");
      if(finished.status==="APPLIED")assert.equal(finished.result.remainingDisputes,0);
      assert.equal((await readRecordedWeekArbitration(db.pool,worldId)).status,"NONE");
      const ledger=await withWorldTransaction(db.pool,tx=>tx.query<{payload:{
        choice:{kind:string};showId:string;author:string
      }}> ("SELECT payload FROM ppw_ledger_events WHERE world_id=$1 ORDER BY event_id",[worldId]));
      assert.equal(ledger.length,2);
      assert.ok(ledger.every(l=>l.payload.author==="AI_WORLD_RESOLVER"));
      assert.deepEqual(new Set(ledger.map(x=>x.payload.showId)),
        new Set([first.showId,last.showId]));
      const cardSlots=await withWorldTransaction(db.pool,tx=>tx.query<{payload:{scriptedOutcome:string}}>(
        "SELECT payload FROM ppw_card_slots WHERE world_id=$1 ORDER BY slot_id",[worldId],
      ));
      assert.deepEqual(cardSlots.map(x=>x.payload.scriptedOutcome),
        ["never rewritten 0","never rewritten 1","never rewritten 2"]);
      const receipts=await withWorldTransaction(db.pool,tx=>tx.query<{total:string}>(
        "SELECT count(*)::text AS total FROM ppw_show_resolutions WHERE world_id=$1",[worldId],
      ));
      assert.equal(receipts[0]!.total,"0");
    }finally{
      await withWorldTransaction(db.pool,async tx=>{
        await tx.query("DELETE FROM ppw_ledger_events WHERE world_id=$1",[worldId]);
        await tx.query("DELETE FROM ppw_week_arbitration_proposals WHERE world_id=$1",[worldId]);
        await tx.query("DELETE FROM ppw_week_resource_clearances WHERE world_id=$1",[worldId]);
        await tx.query("DELETE FROM ppw_command_receipts WHERE world_id=$1",[worldId]);
        await tx.query("DELETE FROM ppw_booking_drafts WHERE world_id=$1",[worldId]);
        await tx.query("DELETE FROM ppw_promotion_controls WHERE world_id=$1",[worldId]);
        await tx.query("DELETE FROM ppw_memberships WHERE world_id=$1",[worldId]);
        await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[playerId]);
        await tx.query("DELETE FROM ppw_venues WHERE world_id=$1",[worldId]);
        await tx.query("DELETE FROM ppw_promotions WHERE world_id=$1",[worldId]);
        await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
      }).finally(()=>db.close());
    }
});
