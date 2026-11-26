import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {originalGenesisFixture} from "./fixtures/original-genesis.js";
import {importOriginalGenesis} from "../src/db/import-original-genesis.js";
import {joinWorld} from "../src/db/membership-operations.js";
import {submitPromotionClaim} from "../src/db/promotion-commands.js";
import {publishCertifiedWorldNews} from "../src/db/world-news.js";
import {publishLateAiSigningNews} from "../src/db/late-world-signing-news.js";
import {readIndustryWorldNews} from "../src/db/industry-news.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {readBusinessWorkspace} from "../src/db/business-workspace.js";
import {requestGroqEditorial} from "../src/db/groq-ai-director.js";
import {publishWeeklyWorldEditorial,readWeeklyWorldEditorialRuns} from "../src/db/weekly-world-editorial.js";
import {dispatchCardRpc} from "../src/web/card-rpc.js";
const url=process.env.PPW_NEON_TEST_URL;
test("certified human and AI shows publish public awards, kept replay-safe and inaccessible to outsiders",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const world="news-"+randomUUID(),owner="owner-"+randomUUID(),
  db=postgresPool(url!,3);
 try{
  await importOriginalGenesis(db.pool,originalGenesisFixture(world,96));
  assert.equal((await joinWorld(db.pool,{worldId:world,playerId:owner,
   requestId:"news-join",expectedRevision:0})).status,"APPLIED");
  assert.equal((await submitPromotionClaim(db.pool,{worldId:world,playerId:owner,
   promotionId:"promotion-0",requestId:"news-claim",expectedRevision:1})).status,"APPLIED");
  const roster=await withWorldTransaction(db.pool,tx=>tx.query<{
   person_id:string;name:string}>(`
   SELECT person_id,name FROM ppw_people WHERE world_id=$1
   ORDER BY person_id LIMIT 4`,[world]));
  assert.equal(roster.length,4);
  const [a,b,c,d]=roster.map(p=>p.person_id);
  const payload=(one:string,two:string)=>JSON.stringify({
   matchType:"SINGLES",scriptedWinner:one,
   participants:[{personId:one,contractId:"c1"},
    {personId:two,contractId:"c2"}],
   secretBookingNote:"PRIVATE FUTURE PLANS"
  });
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query(`
    INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week,
     status,show_name,event_type,show_day)
    VALUES($1,'hshow','promotion-0',1,1,'SUBMITTED','Human Fight Night','REGULAR',2),
     ($1,'aishow','promotion-1',1,1,'SUBMITTED','AI Crown Night','MAJOR',4),
     ($1,'future','promotion-1',1,2,'DRAFT','PRIVATE FUTURE PLANS','MAJOR',4)`,[world]);
   for(const [show,match,one,two] of [
    ["hshow","hmatch",a!,b!],["aishow","aimatch",c!,d!]
   ]){
    await tx.query(`INSERT INTO ppw_card_slots(world_id,draft_id,slot_id,position,kind,payload)
     VALUES($1,$2,$3,1,'MATCH',$4::jsonb)`,
     [world,show,match,payload(one,two)]);
   }
   await tx.query(`INSERT INTO ppw_card_slots(world_id,draft_id,slot_id,position,kind,payload)
    VALUES($1,'aishow','angle',2,'SEGMENT',$2::jsonb)`,
    [world,JSON.stringify({kind:"TURN",actorIds:[c],targetIds:[d],
     hiddenCreativeDisagreement:"DO NOT PUBLISH THIS"})]);
   await tx.query(`INSERT INTO ppw_completed_shows(
    world_id,promotion_id,show_id,year,week,resolution_id,
    crowd_response,receipt_json,receipt_digest)
    VALUES($1,'promotion-0','hshow',1,1,'h-res',42,'{}',repeat('a',64)),
     ($1,'promotion-1','aishow',1,1,'ai-res',91,'{}',repeat('b',64))`,[world]);
   await tx.query(`INSERT INTO ppw_completed_show_matches(
    world_id,show_id,match_id,position,crowd_response,actual_finish,actual_winner_side)
    VALUES($1,'hshow','hmatch',1,83,'CLEAN_PIN','A'),
     ($1,'aishow','aimatch',1,96,'CLEAN_PIN','A')`,[world]);
   await tx.query(`INSERT INTO ppw_completed_match_report_facts(
    world_id,show_id,match_id,rating_stars,execution_quality,
    chemistry_modifier,actual_minutes)
    VALUES($1,'hshow','hmatch',4.00,80,0,15),
     ($1,'aishow','aimatch',4.75,93,1,18)`,[world]);
   await tx.query(`INSERT INTO ppw_completed_show_segments(
    world_id,show_id,slot_id,position,kind,authored_outcome,
    crowd_response,story_json)
    VALUES($1,'aishow','angle',2,'TURN','HAPPENS',92,$2::jsonb)`,
    [world,JSON.stringify({kind:"TURN",outcome:"HAPPENS",position:2,
     headline:"A change of allegiance",actorIds:[c],targetIds:[d],
     privateRumour:"HIDDEN CONTRACT TALKS"})]);
   // An immutable settled title contest, not a drafted booking, identifies
   // a new singles champion. The World history story reuses this proof.
   await tx.query(`INSERT INTO ppw_championships(
    world_id,promotion_id,championship_id,name,division,status,prestige,current_reign_id)
    VALUES($1,'promotion-0','news-title','World Crown','SINGLES','ACTIVE',65,'news-reign')`,[world]);
   await tx.query(`INSERT INTO ppw_championship_reigns(
    world_id,promotion_id,championship_id,reign_id,holder_type,person_id,status,start_week_index)
    VALUES($1,'promotion-0','news-title','news-reign','PERSON',$2,'ACTIVE',0)`,[world,a]);
   await tx.query(`INSERT INTO ppw_championship_contests(
    world_id,promotion_id,championship_id,show_id,slot_id,
    prior_reign_id,winner_person_id,title_changed)
    VALUES($1,'promotion-0','news-title','hshow','hmatch',NULL,$2,true)`,[world,a]);
   // Only the already certified human final can generate a tournament story;
   // the AI draft and an unfinished cup remain private.
   await tx.query(`INSERT INTO ppw_tournaments(world_id,promotion_id,
    tournament_id,name,division,status,entrants_count,created_week_index,
    winner_person_id)
    VALUES($1,'promotion-0','cup-final','King''s Crown','MEN','COMPLETE',4,0,$2),
     ($1,'promotion-1','future-cup','Private Future Cup','MEN','ACTIVE',4,0,NULL)`,
     [world,a]);
   await tx.query(`INSERT INTO ppw_tournament_bouts(world_id,promotion_id,
    tournament_id,bout_no,person_a,person_b,show_id,slot_id,
    winner_person_id,resolved_week_index)
    VALUES($1,'promotion-0','cup-final',3,$2,$3,'hshow','hmatch',$2,0),
     ($1,'promotion-1','future-cup',1,$4,$5,NULL,NULL,NULL,NULL)`,
     [world,a,b,c,d]);
   // Only actually signed contracts count as public World contract news.
   // Pending/private negotiation terms are absent from the event payload.
   await tx.query(`INSERT INTO ppw_ledger_events
     (world_id,year,week,event_type,payload)
     VALUES ($1,1,1,'CONTRACT_SIGNED',$2::jsonb),
      ($1,1,1,'AI_STRATEGIC_TALENT_SIGNED',$3::jsonb)`,
     [world,JSON.stringify({personId:a,promotionId:"promotion-0",offerId:"accepted-public"}),
      JSON.stringify({personId:c,promotionId:"promotion-1",contractId:"ai-public"})]);
   await tx.query(`UPDATE ppw_worlds SET phase='RESOLVING' WHERE world_id=$1`,[world]);
  });
  await assert.rejects(withWorldTransaction(db.pool,tx=>
   publishCertifiedWorldNews(tx,world,1,1)),/certification/);
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query(`INSERT INTO ppw_week_resolution_seals(
    world_id,year,week,certified_promotions) VALUES($1,1,1,8)`,[world]);
  });
  const first=await withWorldTransaction(db.pool,tx=>publishCertifiedWorldNews(tx,world,1,1));
  assert.equal(first.published,true);
  assert.equal(first.awards,2);
  assert.ok(first.stories>=1);
  const replay=await withWorldTransaction(db.pool,tx=>publishCertifiedWorldNews(tx,world,1,1));
  assert.equal(replay.published,false);
  const result=await readIndustryWorldNews(db.pool,{
   worldId:world,promotionId:"promotion-0",playerId:owner});
  assert.deepEqual(result.latestEdition,{year:1,week:1},
   "This Week must cite a sealed edition, not the current open booking week");
  assert.equal(result.awards[0]!.kind,"MATCH");
  assert.deepEqual(result.annualAwards,[],"Year-end honours need a complete 52-week ledger");
  assert.equal(result.awards[0]!.promotionName,"Promotion 1");
  assert.equal(result.awards[0]!.rating,4.75);
  assert.ok(result.awards.some(x=>x.kind==="ANGLE"&&x.rating===92));
  assert.ok(result.stories.some(x=>x.desk==="DIRT"&&x.certainty==="SPECULATION"));
  const signed=result.stories.filter(x=>x.id.startsWith("signing:"));
  assert.equal(signed.length,2);
  assert.ok(signed.some(x=>x.title===roster[0]!.name+" signs with Promotion 0"));
  assert.ok(signed.some(x=>x.title===roster[2]!.name+" signs with Promotion 1"));
  assert.ok(signed.every(x=>x.desk==="OFFICIAL"&&x.certainty==="CONFIRMED"));
  assert.ok(signed.every(x=>!JSON.stringify(x).includes("accepted-public")),
   "Private offer references never become public news");
  assert.ok(signed.every(x=>x.showId===""),
   "Off-show signed deals must never pretend to belong to a completed card");
  const offShow=await withWorldTransaction(db.pool,tx=>
   tx.query<{story_key:string;show_id:string|null}>(`
    SELECT story_key,show_id FROM ppw_world_news_items
    WHERE world_id=$1 AND story_key LIKE 'signing:%'`,[world]));
  assert.equal(offShow.length,2);
  assert.ok(offShow.every(x=>x.show_id===null),
   "An official contract signing has no fabricated show foreign key");
  // Weekly recruitment happens after the main News snapshot in the actual
  // finance/World pipeline. Add a real AI signing after that seal, not before.
  await withWorldTransaction(db.pool,tx=>tx.query(`
   INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)
   VALUES($1,1,1,'AI_STRATEGIC_TALENT_SIGNED',$2::jsonb)`,
   [world,JSON.stringify({personId:d,promotionId:"promotion-1",
    contractId:"signed-after-news"})]));
  const late=await withWorldTransaction(db.pool,tx=>
   publishLateAiSigningNews(tx,world,1,1));
  assert.equal(late,1,"A late signed AI wrestler gets a real official story");
  assert.equal(await withWorldTransaction(db.pool,tx=>
   publishLateAiSigningNews(tx,world,1,1)),0,
   "The same World event must never publish twice on replay");
  const afterLate=await readIndustryWorldNews(db.pool,{
   worldId:world,promotionId:"promotion-0",playerId:owner});
  assert.ok(afterLate.stories.some(x=>x.title===roster[3]!.name+
   " signs with Promotion 1"&&x.showId===""));
  const falseMoments=await withWorldTransaction(db.pool,tx=>
   tx.query<{moment_key:string}>(`
    SELECT moment_key FROM ppw_world_moments
    WHERE world_id=$1 AND moment_key LIKE 'signing:%'`,[world]));
  assert.deepEqual(falseMoments,[],
   "An off-show signing cannot create an invented match-event heritage entry");
  const crown=result.stories.find(x=>x.id==="tournament:cup-final");
  assert.equal(crown?.desk,"OFFICIAL");
  assert.equal(crown?.certainty,"CONFIRMED");
  assert.equal(crown?.sourceKind,"EVENT");
  assert.match(crown?.title??"",/King's Crown/);
  assert.match(crown?.summary??"",/4\.00 verified stars/);
  const champion=result.stories.find(x=>x.sourceKind==="TITLE");
  assert.equal(champion?.title,roster[0]!.name+" captures World Crown at Human Fight Night");
  assert.match(champion?.summary??"",/title was vacant heading into the contest/);
  const moments=await withWorldTransaction(db.pool,tx=>
   tx.query<{headline:string}>(`SELECT headline FROM ppw_world_moments
    WHERE world_id=$1 AND year=1 AND week=1 AND kind='TITLE'`,[world]));
  assert.ok(moments.some(m=>m.headline===champion?.title),
   "Historical World Moment uses the same confirmed named champion");
  assert.ok(!JSON.stringify(result.stories).includes("Private Future Cup"),
   "An unfinished tournament and future draft must not leak into public news");
  const publicText=JSON.stringify(result);
  assert.ok(!publicText.includes("PRIVATE FUTURE PLANS"));
  assert.ok(!publicText.includes("HIDDEN CONTRACT TALKS"));
  assert.ok(!publicText.includes("DO NOT PUBLISH"));
  const viaRpc=await dispatchCardRpc({pool:db.pool,actor:{playerId:owner}},
   "industryNews",{worldId:world,promotionId:"promotion-0",playerId:"outsider"});
  assert.ok(JSON.stringify(viaRpc).includes("AI Crown Night"));
  await assert.rejects(readIndustryWorldNews(db.pool,{
   worldId:world,promotionId:"promotion-0",playerId:"outsider"}),/access denied/);
  // The PPV press answer belongs to the previous published week. After the
  // next week's actual certified broadcast, World News can revisit the
  // public statement without ever reading the private future booking.
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query(`INSERT INTO ppw_world_news_items(
    world_id,year,week,story_key,desk,certainty,promotion_id,promotion_name,
    show_id,title,summary,source_kind)
    VALUES($1,1,1,'press:official:hshow','OFFICIAL','CONFIRMED',
     'promotion-0','Promotion 0','hshow',
     'Josh Robinson says no comment after Human Fight Night',
     'Manager said No comment after the completed premium event.','EVENT')`,[world]);
   await tx.query(`INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week,status,show_name,event_type,show_day)
    VALUES($1,'nextshow','promotion-0',1,2,'SUBMITTED','Next Broadcast','REGULAR',2)`,[world]);
   await tx.query(`INSERT INTO ppw_card_slots(world_id,draft_id,slot_id,position,kind,payload)
    VALUES($1,'nextshow','nextmatch',1,'MATCH',$2::jsonb)`,
    [world,payload(a!,b!)]);
   await tx.query(`INSERT INTO ppw_completed_shows(
    world_id,promotion_id,show_id,year,week,resolution_id,crowd_response,
    receipt_json,receipt_digest)
    VALUES($1,'promotion-0','nextshow',1,2,'next-res',85,'{}',repeat('c',64))`,[world]);
   await tx.query(`INSERT INTO ppw_completed_show_matches(
    world_id,show_id,match_id,position,crowd_response,actual_finish,actual_winner_side)
    VALUES($1,'nextshow','nextmatch',1,90,'CLEAN_PIN','A')`,[world]);
   await tx.query(`INSERT INTO ppw_completed_match_report_facts(
    world_id,show_id,match_id,rating_stars,execution_quality,
    chemistry_modifier,actual_minutes)
    VALUES($1,'nextshow','nextmatch',4.5,82,1,17)`,[world]);
   await tx.query("UPDATE ppw_worlds SET week=2 WHERE world_id=$1",[world]);
   await tx.query(`INSERT INTO ppw_week_resolution_seals(
    world_id,year,week,certified_promotions) VALUES($1,1,2,1)`,[world]);
  });
  const nextIssue=await withWorldTransaction(db.pool,tx=>
   publishCertifiedWorldNews(tx,world,1,2));
  assert.equal(nextIssue.published,true);
  const followup=await withWorldTransaction(db.pool,tx=>tx.query<{
   story_key:string;title:string;summary:string;show_id:string}>(`
    SELECT story_key,title,summary,show_id FROM ppw_world_news_items
    WHERE world_id=$1 AND year=1 AND week=2 AND story_key LIKE 'press:followup:%'`,
    [world]));
  assert.equal(followup.length,1);
  assert.equal(followup[0]!.show_id,"nextshow");
  assert.match(followup[0]!.summary,/Next Broadcast/);
  assert.match(followup[0]!.summary,/no comment/i);
  assert.doesNotMatch(JSON.stringify(followup),/PRIVATE FUTURE PLANS/);
  assert.equal((await withWorldTransaction(db.pool,tx=>
   publishCertifiedWorldNews(tx,world,1,2))).published,false);
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query(`INSERT INTO ppw_world_news_weeks(world_id,year,week)
    SELECT $1,1,generate_series(2,52) ON CONFLICT DO NOTHING`,[world]);
   await tx.query(`UPDATE ppw_worlds SET year=2,week=1 WHERE world_id=$1`,[world]);
  });
  const annual=await readIndustryWorldNews(db.pool,{
   worldId:world,promotionId:"promotion-0",playerId:owner});
  assert.deepEqual(annual.latestEdition,{year:1,week:52},
   "At New Year, the final previous-year issue remains This Week until a new edition certifies");
  assert.equal(annual.annualAwards.length,2);
  assert.equal(annual.annualAwards.find(a=>a.kind==="MATCH")?.rating,4.75);
  assert.equal(annual.annualAwards.find(a=>a.kind==="ANGLE")?.rating,92);
  assert.equal(annual.awards.length,0,"Older weekly awards leave the 13-week feed");

 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_world_moments",
    "ppw_world_news_items","ppw_world_news_awards",
    "ppw_world_news_weeks","ppw_completed_match_report_facts",
    "ppw_tournament_bouts","ppw_tournaments",
    "ppw_completed_show_segments","ppw_championship_contests",
    "ppw_championship_reigns","ppw_completed_show_matches",
    "ppw_completed_shows","ppw_card_slots","ppw_booking_drafts",
    "ppw_week_resolution_seals","ppw_ledger_events","ppw_command_receipts",
    "ppw_promotion_controls","ppw_memberships","ppw_contracts",
    "ppw_championships","ppw_people","ppw_venues",
    "ppw_promotion_market_states","ppw_promotions","ppw_markets"])
     await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[world]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[owner]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>db.close());
 }
});


test("AI-only week: one shared paced public batch, ratings, both managers, replay and failures",{skip:!url?"No disposable PostgreSQL":false},async(t)=>{
 const world="weekly-editorial-"+randomUUID(),players=["editorial-a-"+randomUUID(),"editorial-b-"+randomUUID()],db=postgresPool(url!,4);
 const reset=()=>withWorldTransaction(db.pool,async tx=>{
  await tx.query("DELETE FROM ppw_groq_dispatch_gate WHERE id=1",[]);
  await tx.query("DELETE FROM ppw_groq_daily_usage WHERE usage_day=timezone('UTC',now())::date",[]);
  await tx.query("DELETE FROM ppw_openai_preview_daily_usage WHERE usage_day=timezone('UTC',now())::date",[]);
  await tx.query("DELETE FROM ppw_openai_preview_monthly_usage WHERE usage_month=date_trunc('month',timezone('UTC',now()))::date",[]);
 });
 try{
  await reset();
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:world,name:"Weekly editorial",seed:123,rulesetVersion:"test"});
   for(const [id,name] of [["human-a","Crown Wrestling"],["human-b","Rival Wrestling"],["ai","Titan Wrestling"]])
    await addPromotion(tx,world,{id:id!,name:name!,tier:"LOCAL"});
   await tx.query("UPDATE ppw_worlds SET phase='OPEN',next_lock_at=now()+interval '1 day' WHERE world_id=$1",[world]);
  });
  for(let i=0;i<players.length;i++){
   assert.equal((await joinWorld(db.pool,{worldId:world,playerId:players[i]!,requestId:"join-"+i,expectedRevision:i*2})).status,"APPLIED");
   assert.equal((await submitPromotionClaim(db.pool,{worldId:world,playerId:players[i]!,promotionId:i===0?"human-a":"human-b",requestId:"claim-"+i,expectedRevision:i*2+1})).status,"APPLIED");
  }
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query("INSERT INTO ppw_world_news_weeks(world_id,year,week) VALUES($1,1,1),($1,1,2),($1,1,3)",[world]);
   await tx.query(`INSERT INTO ppw_world_news_items(world_id,year,week,story_key,desk,certainty,promotion_id,promotion_name,title,summary,source_kind)
    VALUES($1,1,1,'event:ai','OFFICIAL','CONFIRMED','ai','Titan Wrestling','Titan Wrestling draws strong crowd','The AI promotion held a televised event.','EVENT'),
    ($1,1,1,'rumour:ai','DIRT','SPECULATION','ai','Titan Wrestling','Titan Wrestling faces questions','Unverified speculation about future direction.','EVENT'),
    ($1,1,2,'event:ai2','OFFICIAL','CONFIRMED','ai','Titan Wrestling','Titan Wrestling draws another crowd','The AI promotion held another public event.','EVENT')`,[world]);
   await tx.query(`INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week,status,booking_class,show_day,show_name,event_type)
    VALUES($1,'ai-tv','ai',1,1,'SUBMITTED','REGULAR',2,'Titan TV','REGULAR'),
    ($1,'private','human-a',1,4,'DRAFT','REGULAR',2,'PRIVATE FUTURE PLANS','REGULAR')`,[world]);
   await tx.query(`INSERT INTO ppw_completed_shows(world_id,promotion_id,show_id,year,week,resolution_id,crowd_response,receipt_json,receipt_digest)
    VALUES($1,'ai','ai-tv',1,1,'ai-receipt',88,'{}',repeat('c',64))`,[world]);
   await tx.query(`INSERT INTO ppw_show_economics(world_id,show_id,promotion_id,year,week,attendance,expected_demand,
    gate_revenue,venue_cost,production_cost,travel_cost,appearance_fees,total_cost,net_result,incremental_cash,
    audience_format,tv_household_rating,estimated_viewers)
    VALUES($1,'ai-tv','ai',1,1,1000,1000,100000,10000,10000,0,10000,30000,70000,70000,'TV',3.2,5392000)`,[world]);
   await tx.query("UPDATE ppw_worlds SET week=2 WHERE world_id=$1",[world]);
  });
  let calls=0;
  const transport:typeof fetch=async(_url,init)=>{
   calls++;
   const request=JSON.parse(String(init?.body));
   assert.equal(request.model,"openai/gpt-oss-20b");
   assert.doesNotMatch(JSON.stringify(request),/PRIVATE FUTURE PLANS/);
   const sources=JSON.parse(request.messages[1].content) as {key:string;promotion:string;title:string}[];
   assert.ok(sources.some(s=>s.title==="Titan Wrestling draws strong crowd"));
   assert.ok(!sources.some(s=>s.title.includes("TV watch")),"Routine ratings must not displace the main event.");
   const reply=Object.fromEntries(sources.map(s=>[s.key,s.title.includes("TV watch")?{
    headline:"Why "+s.promotion+" should chase the audience",
    commentary:"I think "+s.promotion+" should make television feel like a weekly occasion again.",
    fans:["I hope "+s.promotion+" gives me something worth watching on television.",
     "Why should "+s.promotion+" worry about loud opinions when ratings are what matter?",
     "Nah mate, I think you are being far too harsh."]
   }:s.title.includes("faces questions")?{
    headline:"Could "+s.promotion+" surprise the sceptics?",
    commentary:"I think "+s.promotion+" could make the discussion more interesting without giving everything away.",
    fans:["I think "+s.promotion+" could have a much better story to tell.",
     "Maybe "+s.promotion+" should ignore the noise and focus on wrestling.",
     "I would rather wait for something to actually happen."]
   }:{
    headline:"Why "+s.promotion+" should make crowds care",
    commentary:"I hope "+s.promotion+" treats the audience as more than background noise.",
    fans:["I love how "+s.promotion+" made the crowd more than background noise.",
     "I think "+s.promotion+" still has plenty to prove.",
     "Background noise? That Titan Wrestling crowd made the whole event.",
     "Titan Wrestling needs to make the next event even more entertaining.",
     "I would rather see Titan Wrestling concentrate on its own audience."]
   }]));
   return new Response(JSON.stringify({choices:[{finish_reason:"stop",message:{content:JSON.stringify(reply)}}],usage:{prompt_tokens:900,completion_tokens:350}}));
  };
  const scope={worldId:world,year:1,week:1};
  assert.equal((await publishWeeklyWorldEditorial(db.pool,{...scope,week:2},"dummy",transport)).state,"SKIPPED");
  const batches=await Promise.all([publishWeeklyWorldEditorial(db.pool,scope,"dummy",transport),publishWeeklyWorldEditorial(db.pool,scope,"dummy",transport)]);
  assert.equal(calls,1);assert.ok(batches.some(b=>b.state==="READY"));
  assert.equal((await publishWeeklyWorldEditorial(db.pool,scope,"dummy",transport)).state,"SKIPPED");
  const metrics={queries:0,rows:0,bytes:0};
  const measuredPool={async connect(){
   const connection=await db.pool.connect();
   return {release:()=>connection.release(),
    async query<T extends Record<string,unknown>>(sql:string,params:readonly unknown[]){
     metrics.queries++;
     const result=await connection.query<T>(sql,params);
     metrics.rows+=result.length;
     metrics.bytes+=Buffer.byteLength(JSON.stringify(result));
     return result;
    }};
  }};
  const a=await readIndustryWorldNews(measuredPool,{worldId:world,promotionId:"human-a",playerId:players[0]!});
  assert.equal(metrics.queries,5);
  t.diagnostic("Two-manager public News read: "+JSON.stringify({...metrics,responseBytes:Buffer.byteLength(JSON.stringify(a))}));
  const lab=await readWeeklyWorldEditorialRuns(db.pool,world);
  assert.equal(lab[0]?.inspection?.model,"openai/gpt-oss-20b");
  assert.match(JSON.stringify(lab[0]?.inspection?.context),/Titan Wrestling draws strong crowd/);
  assert.doesNotMatch(JSON.stringify(lab),/PRIVATE FUTURE PLANS|dummy/);
  assert.equal(lab[0]?.provider_calls,1);
  assert.match(lab[0]?.diagnostic??"",/^ACCEPTED/);
  t.diagnostic("Synthetic weekly dispatch: "+JSON.stringify({
   bytes:lab[0]?.inspection?.promptBytes,inputTokens:lab[0]?.input_tokens,
   outputTokens:lab[0]?.output_tokens,diagnostic:lab[0]?.diagnostic
  }));
  const b=await readIndustryWorldNews(db.pool,{worldId:world,promotionId:"human-b",playerId:players[1]!});
  assert.deepEqual(a.stories,b.stories);
  assert.ok(a.stories.some(s=>s.sourceKind==="RATINGS"&&!s.editorial&&s.summary.includes("3.20")));
  assert.equal(a.stories.find(s=>s.id==="event:ai")?.editorial?.fans?.filter(Boolean).length,5);
  assert.ok(a.stories.some(s=>s.desk==="DIRT"&&!s.editorial));
  const business=await readBusinessWorkspace(db.pool,{worldId:world,promotionId:"human-a",playerId:players[0]!});
  assert.equal(business.ratingsEditorial?.headline,a.stories.find(s=>s.sourceKind==="RATINGS")?.editorial?.headline);
  assert.equal(calls,1);
  const paced=await requestGroqEditorial({task:"SHORT_NEWS",key:"dummy",pool:db.pool,pace:true,body:{max_completion_tokens:200,messages:[]},transport});
  assert.equal(paced.status,429);assert.equal(calls,1);
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query("UPDATE ppw_worlds SET week=3 WHERE world_id=$1",[world]);
   await tx.query("UPDATE ppw_groq_dispatch_gate SET next_allowed_at=clock_timestamp()-interval '1 second' WHERE id=1",[]);
  });
  const failed=await publishWeeklyWorldEditorial(db.pool,{...scope,week:2},"dummy",async(url)=>{
   assert.match(String(url),/api\.groq\.com/);
   calls++;return new Response("limit",{status:429,headers:{"retry-after":"180"}});
  },"terra-fixture");
  assert.equal(failed.state,"FAILED");assert.equal(failed.providerCalls,1);assert.equal(calls,2);
  const diagnostics=await withWorldTransaction(db.pool,tx=>tx.query<{state:string;diagnostic:string;provider_calls:number;input_tokens:number}>(`
   SELECT state,diagnostic,provider_calls,input_tokens FROM ppw_weekly_world_editorial WHERE world_id=$1 ORDER BY week`,[world]));
  assert.equal(diagnostics[0]?.input_tokens,900);assert.equal(diagnostics[1]?.diagnostic,"RATE_LIMITED");
  const gate=await withWorldTransaction(db.pool,tx=>tx.query<{seconds:number}>(`
   SELECT extract(epoch from next_allowed_at-clock_timestamp())::integer AS seconds FROM ppw_groq_dispatch_gate WHERE id=1`,[]));
  assert.ok((gate[0]?.seconds??0)>120);
  const after=await readIndustryWorldNews(db.pool,{worldId:world,promotionId:"human-a",playerId:players[0]!});
  assert.ok(after.stories.some(s=>s.id==="event:ai2"&&!s.editorial));
  await withWorldTransaction(db.pool,tx=>tx.query("UPDATE ppw_worlds SET week=4 WHERE world_id=$1",[world]));
  assert.equal((await publishWeeklyWorldEditorial(db.pool,{...scope,week:3},"dummy",transport)).state,"EMPTY");
  assert.equal(calls,2);
  // Groq is still cooling down after the actual 429. Terra may fill the next
  // edition only if no Groq transport has been invoked for that edition.
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query("INSERT INTO ppw_world_news_weeks(world_id,year,week) VALUES($1,1,4)",[world]);
   await tx.query(`INSERT INTO ppw_world_news_items(world_id,year,week,story_key,desk,certainty,promotion_id,promotion_name,title,summary,source_kind)
    VALUES($1,1,4,'event:terra','OFFICIAL','CONFIRMED','ai','Titan Wrestling','Titan Wrestling draws a crowd','A completed Titan Wrestling event.','EVENT')`,[world]);
   await tx.query("UPDATE ppw_worlds SET week=5 WHERE world_id=$1",[world]);
   await tx.query("UPDATE ppw_groq_dispatch_gate SET next_allowed_at=clock_timestamp()+interval '5 minutes' WHERE id=1",[]);
  });
  let paidCalls=0;
  const paid:typeof fetch=async(url,init)=>{
   paidCalls++;assert.match(String(url),/api\.openai\.com/);
   const body=JSON.parse(String(init?.body));assert.equal(body.model,"gpt-6.1-terra");assert.equal(body.store,false);
   assert.doesNotMatch(JSON.stringify(body),/PRIVATE FUTURE PLANS/);
   return new Response(JSON.stringify({usage:{prompt_tokens:900,completion_tokens:350},choices:[{finish_reason:"stop",message:{content:JSON.stringify({s0:{headline:"Titan Wrestling gives fans a reason",commentary:"Titan Wrestling should keep the audience interested with a compelling follow-up to the event.",fan1:"Titan Wrestling has plenty of potential.",fan2:"I think Titan Wrestling can offer better wrestling.",reply:"Give them a chance to build on it.",fan3:"Titan Wrestling needs a compelling next chapter.",fan4:"I hope Titan Wrestling makes each show feel special.",wrestler:null}})}}]}));
  };
  const paidScope={...scope,week:4};
  const paidResult=await publishWeeklyWorldEditorial(db.pool,paidScope,"dummy",paid,"terra-fixture");
  assert.equal(paidResult.state,"READY");assert.equal(paidResult.providerCalls,1);assert.equal(paidCalls,1);
  assert.equal((await publishWeeklyWorldEditorial(db.pool,paidScope,"dummy",paid,"terra-fixture")).state,"SKIPPED");
  assert.equal(paidCalls,1);
  const paidRows=await withWorldTransaction(db.pool,tx=>tx.query<{diagnostic:string;provider_calls:number}>(
   "SELECT diagnostic,provider_calls FROM ppw_weekly_world_editorial WHERE world_id=$1 AND week=4",[world]));
  assert.match(paidRows[0]!.diagnostic,/^TERRA /);assert.equal(paidRows[0]!.provider_calls,1);
  const monthly=await withWorldTransaction(db.pool,tx=>tx.query<{calls:number;spent:string}>(
   "SELECT call_count AS calls,spent_micropounds::text AS spent FROM ppw_openai_preview_monthly_usage WHERE usage_month=date_trunc('month',timezone('UTC',now()))::date",[]));
  assert.deepEqual(monthly,[{calls:1,spent:"5300"}]);
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query("INSERT INTO ppw_world_news_weeks(world_id,year,week) VALUES($1,1,5)",[world]);
   await tx.query(`INSERT INTO ppw_world_news_items(world_id,year,week,story_key,desk,certainty,promotion_id,promotion_name,title,summary,source_kind)
    VALUES($1,1,5,'event:timeout','OFFICIAL','CONFIRMED','ai','Titan Wrestling','Titan Wrestling draws another crowd','A completed Titan Wrestling event.','EVENT')`,[world]);
   await tx.query("UPDATE ppw_worlds SET week=6 WHERE world_id=$1",[world]);
   await tx.query("UPDATE ppw_groq_dispatch_gate SET next_allowed_at=clock_timestamp()-interval '1 second' WHERE id=1",[]);
  });
  const timedScope={...scope,week:5};
  const timedTransport:typeof fetch=async(_url,init)=>{
   assert.ok(init?.signal);
   calls++;
   throw new DOMException("Simulated elapsed provider deadline","TimeoutError");
  };
  assert.deepEqual(await publishWeeklyWorldEditorial(db.pool,timedScope,"dummy",timedTransport,"terra-fixture"),
   {state:"FAILED",providerCalls:1,accepted:0});
  assert.equal((await publishWeeklyWorldEditorial(db.pool,timedScope,"dummy",timedTransport)).state,"SKIPPED");
  assert.equal(calls,3);
  const timeout=await withWorldTransaction(db.pool,tx=>tx.query(
   "SELECT diagnostic,provider_calls FROM ppw_weekly_world_editorial WHERE world_id=$1 AND week=5",[world]));
  assert.deepEqual(timeout,[{diagnostic:"TIMEOUT",provider_calls:1}]);
  const afterTimeout=await readWeeklyWorldEditorialRuns(db.pool,world);
  assert.equal(afterTimeout.find(run=>run.week===4)?.estimatedTerraUsd,0.00265);
  assert.equal(afterTimeout[0]?.inspection?.model,"openai/gpt-oss-20b");
  assert.equal(afterTimeout[0]?.accepted,null);
  assert.match(paidRows[0]!.diagnostic,/PARTIAL.*reply.REPLY_CONTEXT/);

 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_world_news_items","ppw_world_news_weeks","ppw_show_economics","ppw_completed_shows","ppw_booking_drafts",
    "ppw_ledger_events","ppw_command_receipts","ppw_promotion_controls","ppw_memberships","ppw_promotions"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[world]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=ANY($1::text[])",[players]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>reset().finally(()=>db.close()));
 }
});
