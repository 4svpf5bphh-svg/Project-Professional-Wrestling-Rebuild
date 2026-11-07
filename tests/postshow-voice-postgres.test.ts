import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {originalGenesisFixture} from "./fixtures/original-genesis.js";
import {importOriginalGenesis} from "../src/db/import-original-genesis.js";
import {joinWorld} from "../src/db/membership-operations.js";
import {submitPromotionClaim} from "../src/db/promotion-commands.js";
import {readIndustryWorldNews} from "../src/db/industry-news.js";
import {publishPostShowVoiceBatches} from "../src/db/postshow-voice-batches.js";
import {saveShortformVoiceLabRun,readShortformVoiceLabRuns}
 from "../src/db/postshow-voice-lab.js";
import {getPostShowVoiceBenchmark} from "../src/domain/postshow-voice-lab.js";

const url=process.env.PPW_NEON_TEST_URL;
test("postshow cache stays owner-scoped and a published receipt gets only one Groq claim",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const world="voice-"+randomUUID(),owner="owner-"+randomUUID();
 const db=postgresPool(url!,3);
 const promotion="promotion-0",showId="voice-show";
 try{
  await importOriginalGenesis(db.pool,originalGenesisFixture(world,96));
  assert.equal((await joinWorld(db.pool,{worldId:world,playerId:owner,
   requestId:"voice-join",expectedRevision:0})).status,"APPLIED");
  assert.equal((await submitPromotionClaim(db.pool,{worldId:world,playerId:owner,
   promotionId:promotion,requestId:"voice-claim",expectedRevision:1})).status,"APPLIED");
  const labFixture=getPostShowVoiceBenchmark("i-quit")!;
  const labCopy={
   version:1 as const,
   news:{slotId:"benchmark-main-event",headline:"Mercer gets the final answer",
    summary:"Jett Mercer defeated Ronan Wolfe by a verbal I Quit surrender at the completed show. The official result records Wolfe's spoken concession, not a pinfall or tap-out."},
   wrestler:{slotId:"benchmark-main-event",personId:"fixture-0",
    text:"I demanded the answer inside that ring. You heard the same words I did and you know who earned the result tonight."},
   roadAgent:{slotId:"benchmark-main-event",
    note:"Next show, resist repeating a punishing stipulation immediately. Protect the payoff by booking a distinctive development rather than trying to reproduce the exact finish."}
  };
  assert.ok(labFixture.brief.roadAgent);
  const savedLab=await saveShortformVoiceLabRun(db.pool,{
   worldId:world,playerId:owner,scenarioId:"i-quit",durationMs:1020,
   providerCalls:1,inputTokens:780,outputTokens:268,copy:labCopy,
   diagnostic:{category:"ACCEPTED",news:"ACCEPTED",
    wrestler:"ACCEPTED",roadAgent:"ACCEPTED"}
  });
  assert.equal(savedLab.status,"READY");
  const ownerSamples=await readShortformVoiceLabRuns(db.pool,world,owner);
  assert.equal(ownerSamples.length,1);
  assert.deepEqual(ownerSamples[0]?.copy,labCopy);
  assert.deepEqual(ownerSamples[0]?.diagnostic,{
   category:"ACCEPTED",news:"ACCEPTED",wrestler:"ACCEPTED",
   roadAgent:"ACCEPTED"
  });
  // The private Lab persists only the approved categorical reason, never
  // discarded model prose; historical accepted records remain intact.
  const partialCopy={...labCopy,wrestler:null};
  const savedPartial=await saveShortformVoiceLabRun(db.pool,{
   worldId:world,playerId:owner,scenarioId:"i-quit",durationMs:776,
   providerCalls:1,inputTokens:947,outputTokens:181,copy:partialCopy,
   diagnostic:{category:"PARTIAL",news:"ACCEPTED",
    wrestler:"FACT_OR_VOICE_REJECTED",roadAgent:"ACCEPTED",
    wrestlerReason:"NO_VERIFIED_EVENT"}
  });
  assert.equal(savedPartial.status,"READY");
  const allSamples=await readShortformVoiceLabRuns(db.pool,world,owner);
  assert.equal(allSamples.length,2);
  assert.deepEqual(allSamples[0]?.copy,partialCopy);
  assert.deepEqual(allSamples[0]?.diagnostic,{
   category:"PARTIAL",news:"ACCEPTED",
   wrestler:"FACT_OR_VOICE_REJECTED",roadAgent:"ACCEPTED",
   wrestlerReason:"NO_VERIFIED_EVENT"});
  assert.deepEqual(allSamples[1]?.copy,labCopy);
  assert.deepEqual(await readShortformVoiceLabRuns(db.pool,world,"outsider"),[]);

  await withWorldTransaction(db.pool,async tx=>{
   await tx.query(`
    INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,
     year,week,status,show_name,event_type,show_day)
    VALUES($1,$2,$3,1,1,'SUBMITTED','Certified Showcase','REGULAR',2)`,
   [world,showId,promotion]);
   await tx.query(`
    INSERT INTO ppw_completed_shows(world_id,promotion_id,show_id,
     year,week,resolution_id,crowd_response,receipt_json,receipt_digest)
    VALUES($1,$2,$3,1,1,'published',85,'{}'::jsonb,repeat('a',64))`,
    [world,promotion,showId]);
   await tx.query(`
    INSERT INTO ppw_world_news_weeks(world_id,year,week)
    VALUES($1,1,1)`,[world]);
   await tx.query("UPDATE ppw_worlds SET week=2,phase='OPEN' WHERE world_id=$1",[world]);
   await tx.query(`
    INSERT INTO ppw_postshow_voice_batches(world_id,promotion_id,show_id,
     player_id,receipt_digest,state,copy_json,provider_calls,completed_at)
    VALUES($1,$2,$3,$4,repeat('a',64),'READY',$5::jsonb,1,now())`,
    [world,promotion,showId,owner,JSON.stringify({
     version:1,news:{slotId:"match-main",
      headline:"A completed showcase earns its place",
      summary:"The promotion published a certified show result after its weekly card, and the official news dispatch now reflects only the recorded evidence from that completed event."},
     wrestler:null,roadAgent:null
    })]);
  });
  let calls=0;
  const second=await publishPostShowVoiceBatches(db.pool,{
   worldId:world,year:1,week:1},"dummy",async()=>{
    calls++;throw new Error("A published receipt was charged twice");
   });
  assert.deepEqual(second,{eligible:1,generated:0,failed:0,skipped:1});
  assert.equal(calls,0);
  const ownerNews=await readIndustryWorldNews(db.pool,{
   worldId:world,promotionId:promotion,playerId:owner});
  assert.equal(ownerNews.voices.length,1);
  assert.equal(ownerNews.voices[0]?.showId,showId);
  assert.match(ownerNews.voices[0]?.headline??"",/completed showcase/);
  await assert.rejects(readIndustryWorldNews(db.pool,{
   worldId:world,promotionId:promotion,playerId:"outsider"}),/access denied/);
  const rows=await withWorldTransaction(db.pool,tx=>tx.query<{
   state:string;count:string;calls:number}>(`
   SELECT min(state) AS state,count(*)::text AS count,
    max(provider_calls)::integer AS calls
   FROM ppw_postshow_voice_batches WHERE world_id=$1`,[world]));
  assert.deepEqual(rows[0],{state:"READY",count:"1",calls:1});
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of [
    "ppw_shortform_ai_lab_runs","ppw_postshow_voice_batches","ppw_world_news_items","ppw_world_news_awards",
    "ppw_world_news_weeks","ppw_completed_match_report_facts",
    "ppw_tournament_bouts","ppw_tournaments","ppw_completed_show_segments",
    "ppw_championship_contests","ppw_championship_reigns",
    "ppw_completed_show_matches","ppw_completed_shows","ppw_card_slots",
    "ppw_booking_drafts","ppw_week_resolution_seals","ppw_ledger_events",
    "ppw_command_receipts","ppw_promotion_controls","ppw_memberships",
    "ppw_contracts","ppw_championships","ppw_people","ppw_venues",
    "ppw_promotion_market_states","ppw_promotions","ppw_markets"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[world]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[owner]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>db.close());
 }
});
