import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction,type TransactionPool} from "../src/db/transaction.js";
import {MeasuredQuerySession} from "../src/db/query-meter.js";
import {importOriginalGenesis} from "../src/db/import-original-genesis.js";
import {originalGenesisFixture} from "./fixtures/original-genesis.js";
import {joinWorld} from "../src/db/membership-operations.js";
import {submitPromotionClaim} from "../src/db/promotion-commands.js";
import {readWrestlerCareer} from "../src/db/wrestler-career.js";
import {dispatchCardRpc} from "../src/web/card-rpc.js";
const url=process.env.PPW_NEON_TEST_URL;

test("wrestler career is scoped, three-query and reproduces only verified completed outcomes",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const world="career-"+randomUUID(),player="career-controller-"+randomUUID();
 const db=postgresPool(url!,4),promotionId="promotion-0",personId="person-0";
 try{
  await importOriginalGenesis(db.pool,originalGenesisFixture(world,96));
  await joinWorld(db.pool,{worldId:world,playerId:player,requestId:"join",expectedRevision:0});
  await submitPromotionClaim(db.pool,{worldId:world,playerId:player,
   promotionId,requestId:"claim",expectedRevision:1});
  const scope={worldId:world,playerId:player,promotionId,personId};
  const zero=await readWrestlerCareer(db.pool,scope);
  assert.deepEqual(zero.summary,{matches:0,wins:0,losses:0,singles:0,tag:0,
   ratedMatches:0,averageStars:null,bestStars:null,injuries:0});
  assert.equal(zero.liveAppearances[0]?.status,"DEBUT_ELIGIBLE");
  assert.equal(zero.liveAppearances[0]?.recordedShows,0);
  await withWorldTransaction(db.pool,async tx=>{
   // Show-resolution records may only reference a truly submitted draft.
   await tx.query(`
    INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week,status)
    VALUES ($1,'career-show',$2,1,1,'SUBMITTED'),
     ($1,'live-show',$2,1,6,'SUBMITTED'),
     ($1,'video-show',$2,1,8,'SUBMITTED'),
     ($1,'other-live','promotion-1',1,2,'SUBMITTED')
   `,[world,promotionId]);
   await tx.query(`
    INSERT INTO ppw_card_slots(world_id,draft_id,slot_id,position,kind,payload)
    VALUES($1,'career-show','match-1',0,'MATCH',
     '{"sides":[{"sideId":"A","participants":[{"personId":"person-0","contractId":"contract-0"}]},{"sideId":"B","participants":[{"personId":"person-1","contractId":"contract-1"}]}]}'::jsonb)
   `,[world]);
   await tx.query(
    "INSERT INTO ppw_completed_shows(world_id,promotion_id,show_id,year,week,"+
    "resolution_id,crowd_response,receipt_json,receipt_digest)"+
    " VALUES($1,$2,'career-show',1,1,'career-resolution',75,'{}'::jsonb,$3)",
    [world,promotionId,"a".repeat(64)]);
   await tx.query(
    "INSERT INTO ppw_completed_show_matches(world_id,show_id,match_id,position,"+
    "crowd_response,actual_finish,actual_winner_side)"+
    " VALUES($1,'career-show','match-1',0,85,'CLEAN_PIN','A')",[world]);
   await tx.query(
    "INSERT INTO ppw_individual_field_career_effects("+
    "world_id,show_id,match_id,person_id,actual_winner_side,performer_side,"+
    "won,before_stats,after_stats,injury_severity,injury_weeks_out)"+
    " VALUES($1,'career-show','match-1',$2,'A','A',true,'{}'::jsonb,'{}'::jsonb,"+
    "'MINOR',2)",[world,personId]);
   // The same wrestler appears twice in one live show, and later in an
   // in-person angle. The video/declined booking must NOT count.
   await tx.query("UPDATE ppw_worlds SET week=10 WHERE world_id=$1",[world]);
   await tx.query(`
    INSERT INTO ppw_completed_shows(world_id,promotion_id,show_id,year,week,
     resolution_id,crowd_response,receipt_json,receipt_digest)
    VALUES($1,$2,'live-show',1,6,'live-result',70,'{}'::jsonb,repeat('b',64)),
     ($1,$2,'video-show',1,8,'video-result',75,'{}'::jsonb,repeat('c',64)),
     ($1,'promotion-1','other-live',1,2,'other-result',80,'{}'::jsonb,repeat('d',64))
   `,[world,promotionId]);
   await tx.query(`
    INSERT INTO ppw_show_resolutions(world_id,promotion_id,show_id,resolved_week_index,
      command_request_id,performers_count,dates_charged,appearance_person_ids)
    VALUES($1,$2,'career-show',0,'career-appeared',1,0,'["person-0"]'::jsonb),
     ($1,$2,'live-show',5,'live-appeared',1,0,'["person-0"]'::jsonb),
     ($1,$2,'video-show',7,'video-appeared',1,0,'["person-0"]'::jsonb),
     ($1,'promotion-1','other-live',1,'other-appeared',1,0,'["person-0"]'::jsonb)
   `,[world,promotionId]);
   await tx.query(`
    INSERT INTO ppw_completed_show_segments(world_id,show_id,slot_id,position,
     kind,authored_outcome,crowd_response,story_json) VALUES
     ($1,'live-show','promo-one',0,'PROMO','HAPPENS',76,
       '{"actorIds":["person-0"],"targetIds":[]}'::jsonb),
     ($1,'live-show','promo-two',1,'CELEBRATION','HAPPENS',72,
       '{"actorIds":["person-0"],"targetIds":[]}'::jsonb),
     ($1,'video-show','video',0,'VIDEO_PACKAGE','HAPPENS',65,
       '{"actorIds":["person-0"],"targetIds":[]}'::jsonb),
     ($1,'video-show','declined',1,'CHALLENGE','REFUSED',70,
       '{"actorIds":["person-0"],"targetIds":["person-1"]}'::jsonb),
     ($1,'other-live','interrupted',0,'INTERVIEW','INTERRUPTED',65,
       '{"actorIds":["person-0"],"targetIds":[]}'::jsonb)
   `,[world]);
   await tx.query(
    "INSERT INTO ppw_completed_match_report_facts("+
    "world_id,show_id,match_id,rating_stars,execution_quality,"+
    "chemistry_modifier,actual_minutes)"+
    " VALUES($1,'career-show','match-1',4.25,85,0,18)",[world]);
  });
  // Original-current-title parity: one owned singles reign and one active
  // World tag team held by this wrestler, verified from current title pointers.
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query(`
    INSERT INTO ppw_tag_teams(world_id,team_id,name,status)
    VALUES($1,'career-team','The Team','ACTIVE')
   `,[world]);
   await tx.query(`
    INSERT INTO ppw_tag_team_members(world_id,team_id,person_id,active)
    VALUES($1,'career-team','person-0',true),
     ($1,'career-team','person-2',true)
   `,[world]);
   await tx.query(`
    INSERT INTO ppw_championships(world_id,promotion_id,championship_id,
     name,division,status,prestige)
    VALUES($1,$2,'career-single','World Title','SINGLES','ACTIVE',80),
     ($1,$2,'career-tag','Tag Titles','TAG','ACTIVE',65)
   `,[world,promotionId]);
   await tx.query(`
    INSERT INTO ppw_championship_reigns(world_id,promotion_id,championship_id,
     reign_id,holder_type,person_id,team_id,status,start_week_index,defenses)
    VALUES($1,$2,'career-single','career-single-reign','PERSON',
     'person-0',NULL,'ACTIVE',0,3),
     ($1,$2,'career-tag','career-tag-reign','TEAM',NULL,
     'career-team','ACTIVE',5,2)
   `,[world,promotionId]);
   await tx.query(`
    UPDATE ppw_championships SET current_reign_id=CASE championship_id
     WHEN 'career-single' THEN 'career-single-reign' ELSE 'career-tag-reign' END
    WHERE world_id=$1 AND promotion_id=$2 AND championship_id IN
     ('career-single','career-tag')
   `,[world,promotionId]);
  });
  const meter=new MeasuredQuerySession("wrestler-career-on-demand");
  const measured:TransactionPool={async connect(){
   const client=await db.pool.connect();
   return {release(){client.release();},
    async query<T extends Record<string,unknown>>(sql:string,params:readonly unknown[]){
     return meter.execute(()=>client.query<T>(sql,params));
    }};
  }};
  const view=await readWrestlerCareer(measured,scope);
  assert.equal(meter.assertBudget({maxQueries:4,maxResultBytes:7500}).queryCount,4);
  assert.deepEqual(view.summary,{matches:1,wins:1,losses:0,singles:1,tag:0,
   ratedMatches:1,averageStars:4.25,bestStars:4.25,injuries:1});
  assert.equal(view.recent[0]?.showId,"career-show");
  assert.equal(view.recent[0]?.finish,"CLEAN_PIN");
  assert.equal(view.recent[0]?.weeksOut,2);
  assert.equal(view.recent[0]?.stars,4.25);
  assert.deepEqual(view.currentChampionships,[
   {name:"Tag Titles",promotion:"Promotion 0",holderType:"TEAM",
    teamName:"The Team",startWeekIndex:5,defenses:2},
   {name:"World Title",promotion:"Promotion 0",holderType:"PERSON",
    teamName:null,startWeekIndex:0,defenses:3}
  ]);
  assert.deepEqual(view.singlesTitles,[{name:"World Title",promotion:"Promotion 0",
   startWeekIndex:0,endedWeekIndex:null,defenses:3}]);
  assert.equal(view.recent[0]?.format,"SINGLES");
  assert.deepEqual(view.recent[0]?.partners,[]);
  assert.deepEqual(view.recent[0]?.opponents,["Wrestler 1"]);
  assert.deepEqual(view.liveAppearances.map(x=>({
   company:x.promotionId,status:x.status,shows:x.recordedShows,
   first:x.firstWeekIndex,last:x.lastWeekIndex,weeksSince:x.weeksSinceLast
  })),[
   {company:promotionId,status:"RETURN_ELIGIBLE",shows:2,first:0,last:5,weeksSince:4},
   {company:"promotion-1",status:"RETURN_ELIGIBLE",shows:1,first:1,last:1,weeksSince:8}
  ],"One visit per completed physical show; video clips and refused angles do not count");
  // Losing team membership ends entitlement to a CURRENT team title claim,
  // without mutating either the belt or the individual's verified singles reign.
  await withWorldTransaction(db.pool,tx=>tx.query(
   "UPDATE ppw_tag_team_members SET active=false"+
   " WHERE world_id=$1 AND team_id='career-team' AND person_id=$2",
   [world,personId]));
  const withdrawn=await readWrestlerCareer(db.pool,scope);
  assert.deepEqual(withdrawn.currentChampionships.map(t=>t.name),["World Title"]);
  assert.equal(withdrawn.singlesTitles.length,1);
  const videoOnly=await readWrestlerCareer(db.pool,{...scope,personId:"person-1"});
  assert.equal(videoOnly.liveAppearances[0]?.status,"DEBUT_ELIGIBLE");
  assert.equal(videoOnly.liveAppearances[0]?.recordedShows,0);
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query(`
    INSERT INTO ppw_completed_shows(world_id,promotion_id,show_id,year,week,
     resolution_id,crowd_response,receipt_json,receipt_digest)
    VALUES($1,$2,'legacy-show',1,9,'legacy-result',66,'{}'::jsonb,repeat('e',64))
   `,[world,promotionId]);
   // No original appearance proof exists for this older completed show.
   // A debut or return is now UNKNOWN, never inferred from an absent receipt.
  });
  const incomplete=await readWrestlerCareer(db.pool,scope);
  assert.equal(incomplete.liveAppearances[0]?.status,"UNKNOWN");
  assert.equal(incomplete.liveAppearances[0]?.recordedShows,2);
  await withWorldTransaction(db.pool,tx=>tx.query(
   "DELETE FROM ppw_completed_shows WHERE world_id=$1 AND show_id='legacy-show'",[world]));
  const rpc=await dispatchCardRpc({pool:db.pool,actor:{playerId:player}},
   "wrestlerCareer",{worldId:world,promotionId,personId});
  assert.equal((rpc as typeof view).summary.wins,1);
  // Losing an older saved card must never invent opponents from outcomes.
  await withWorldTransaction(db.pool,tx=>tx.query(
   "DELETE FROM ppw_card_slots WHERE world_id=$1 AND draft_id='career-show'",[world]));
  const withoutCard=await readWrestlerCareer(db.pool,scope);
  assert.equal(withoutCard.recent[0]?.partners,null);
  assert.equal(withoutCard.recent[0]?.opponents,null);
  await assert.rejects(readWrestlerCareer(db.pool,{...scope,playerId:"outsider"}),
   /access denied/i);
  await assert.rejects(readWrestlerCareer(db.pool,{...scope,personId:"not-known"}),
   /access denied/i);
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of [
    "ppw_completed_match_report_facts","ppw_individual_field_career_effects",
    "ppw_completed_show_matches","ppw_completed_show_segments",
    "ppw_completed_shows","ppw_show_resolutions","ppw_booking_drafts",
    "ppw_championship_reigns","ppw_tag_team_members","ppw_tag_teams",
    "ppw_contract_offers","ppw_contract_renewal_proposals",
    "ppw_contract_date_requests","ppw_ledger_events","ppw_command_receipts",
    "ppw_promotion_controls","ppw_memberships","ppw_contracts",
    "ppw_championships","ppw_people","ppw_venues",
    "ppw_promotion_market_states","ppw_promotions","ppw_markets"
   ])await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[world]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[player]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>db.close());
 }
});
