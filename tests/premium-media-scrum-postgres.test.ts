import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {readPremiumScrum,answerPremiumScrum,dismissPremiumScrum} from "../src/db/premium-media-scrum.js";

const url=process.env.PPW_NEON_TEST_URL;
test("certified PPV scrum records first owner response once, preserves outcomes and rejects rival access",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const db=postgresPool(url!,3),suffix=randomUUID(),worldId="scrum-"+suffix;
 const owner="scrum-a-"+suffix,rival="scrum-b-"+suffix;
 const scope={worldId,promotionId:"crown",playerId:owner,showId:"ppv-one"};
 const sides=[
  {sideId:"A",participants:[{personId:"joe",contractId:"joe-deal"}]},
  {sideId:"B",participants:[{personId:"riddle",contractId:"riddle-deal"}]}
 ];
 const card={matchType:"SINGLES",family:"INDIVIDUAL",
  participants:sides.flatMap(s=>s.participants),sides,
  scriptedWinnerSide:"A",plannedFinish:"CLEAN_PIN",
  intent:"COMPETITIVE",plannedLengthMinutes:18};
 const receipt={worldId,promotionId:"crown",showId:"ppv-one",
  year:1,week:1,resolutionId:"ppv-result",crowdResponse:87,
  matches:[{matchId:"main",position:0,crowdResponse:92,
   actualFinish:"CLEAN_PIN",actualWinnerSide:"A"}],segments:[]};
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:worldId,name:"Scrum Fixture",seed:17,rulesetVersion:"test"});
   await addPromotion(tx,worldId,{id:"crown",name:"Crown Wrestling",tier:"LOCAL"});
   await addPromotion(tx,worldId,{id:"rival",name:"Rival Company",tier:"LOCAL"});
   await tx.query("INSERT INTO ppw_players(player_id) VALUES($1),($2)",[owner,rival]);
   await tx.query("INSERT INTO ppw_player_profiles(player_id,display_name) VALUES($1,'Josh Robinson')",[owner]);
   await tx.query("INSERT INTO ppw_world_news_weeks(world_id,year,week) VALUES($1,1,1)",[worldId]);
   await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status) VALUES($1,$2,'ACTIVE'),($1,$3,'ACTIVE')",
    [worldId,owner,rival]);
   await tx.query("INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id) VALUES($1,$2,'crown'),($1,$3,'rival')",
    [worldId,owner,rival]);
   for(const name of ["Joe","Riddle"])await tx.query(
    "INSERT INTO ppw_people(world_id,person_id,name,booking_division) VALUES($1,$2,$3,'MEN')",
    [worldId,name.toLowerCase(),name]);
   await tx.query("INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week,status,booking_class,show_name) VALUES($1,'ppv-one','crown',1,1,'SUBMITTED','PREMIUM','Starlight PPV')",
    [worldId]);
   await tx.query("INSERT INTO ppw_card_slots(world_id,draft_id,slot_id,position,kind,payload) VALUES($1,'ppv-one','main',0,'MATCH',$2::jsonb)",
    [worldId,JSON.stringify(card)]);
   await tx.query("INSERT INTO ppw_completed_shows(world_id,promotion_id,show_id,year,week,resolution_id,crowd_response,receipt_json,receipt_digest) VALUES($1,'crown','ppv-one',1,1,'ppv-result',87,$2::jsonb,repeat('a',64))",
    [worldId,JSON.stringify(receipt)]);
   await tx.query("INSERT INTO ppw_completed_show_matches(world_id,show_id,match_id,position,crowd_response,actual_finish,actual_winner_side) VALUES($1,'ppv-one','main',0,92,'CLEAN_PIN','A')",
    [worldId]);
  });
  const initial=await readPremiumScrum(db.pool,scope);
  assert.equal(initial.dismissed,false);
  assert.equal(initial.showName,"Starlight PPV");
  assert.deepEqual(initial.questions.map(q=>q.id),
   ["MAIN_EVENT","BIG_PICTURE","NEXT_CHAPTER"]);
  assert.ok(initial.questions.every(q=>q.answerIndex===null));
  assert.match(initial.questions[0]!.question,/Starlight PPV/);
  assert.equal((await answerPremiumScrum(db.pool,scope,"MAIN_EVENT",1)).saved,true);
  assert.equal((await answerPremiumScrum(db.pool,scope,"MAIN_EVENT",1)).saved,false,
   "repeated submission cannot duplicate an answer");
  await assert.rejects(answerPremiumScrum(db.pool,scope,"MAIN_EVENT",2),
   /already on the record/);
  await assert.rejects(answerPremiumScrum(db.pool,scope,"MAIN_EVENT",-1),
   /Choose a published/);
  const next=await readPremiumScrum(db.pool,scope);
  assert.equal(next.questions[0]?.answerIndex,1);
  assert.equal(next.questions[1]?.answerIndex,null);
  await assert.rejects(readPremiumScrum(db.pool,{...scope,playerId:rival}),
   /unavailable|controller/);
  await assert.rejects(answerPremiumScrum(db.pool,{...scope,playerId:rival},
   "BIG_PICTURE",0),/unavailable|controller/);
  const recorded=await withWorldTransaction(db.pool,tx=>tx.query<{
   count:string;answer_index:number}>(`
   SELECT count(*)::text AS count,max(answer_index)::int AS answer_index
   FROM ppw_premium_media_scrum_answers
   WHERE world_id=$1 AND show_id=$2 AND player_id=$3`,
   [worldId,scope.showId,owner]));
  assert.deepEqual(recorded,[{count:"1",answer_index:1}]);
  // Skipping is private, idempotent and preserves the published answer.
  await assert.rejects(dismissPremiumScrum(db.pool,{...scope,playerId:rival}),
   /unavailable|controller|permission/i);
  assert.deepEqual(await dismissPremiumScrum(db.pool,scope),{dismissed:true,saved:true});
  assert.deepEqual(await dismissPremiumScrum(db.pool,scope),{dismissed:true,saved:false});
  const stories=await withWorldTransaction(db.pool,tx=>tx.query<{
   story_key:string;title:string;summary:string;certainty:string}>(`
    SELECT story_key,title,summary,certainty FROM ppw_world_news_items
    WHERE world_id=$1 AND show_id='ppv-one' ORDER BY story_key`,[worldId]));
  assert.equal(stories.length,2);
  assert.ok(stories.every(a=>a.title.includes("Josh Robinson")));
  assert.ok(stories.some(a=>a.certainty==="CONFIRMED"&&
   a.summary.includes("behind closed doors")));
  assert.ok(stories.some(a=>a.certainty==="SPECULATION"));
  assert.ok(stories.every(a=>!a.title.includes("declines")));
  const ended=await readPremiumScrum(db.pool,scope);
  assert.equal(ended.dismissed,true);
  assert.equal(ended.questions[0]?.answerIndex,1);
  assert.equal(ended.questions[1]?.answerIndex,null);
  await assert.rejects(answerPremiumScrum(db.pool,scope,"NEXT_CHAPTER",0),
   /press conference has ended/,
   "A stale browser may not publish fresh manager words after closing");
  await assert.rejects(answerPremiumScrum(db.pool,scope,"MAIN_EVENT",1),
   /press conference has ended/,
   "Even a replay must not alter the now-published transcript");
  const marker=await withWorldTransaction(db.pool,tx=>tx.query<{
   question_id:string;answer_index:number}>(`
   SELECT question_id,answer_index FROM ppw_premium_media_scrum_answers
   WHERE world_id=$1 AND show_id=$2 AND player_id=$3
   ORDER BY question_id`,[worldId,scope.showId,owner]));
  assert.deepEqual(marker,[
   {question_id:"DISMISSED",answer_index:0},
   {question_id:"MAIN_EVENT",answer_index:1}
  ]);

  // A second genuine certified PPV: no press answers were given. The
  // explicit closure publishes public silence; merely having a show does not.
  const silentScope={...scope,showId:"ppv-two"};
  const silentReceipt={...receipt,showId:"ppv-two",week:2,
   resolutionId:"ppv-two-result"};
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query("INSERT INTO ppw_world_news_weeks(world_id,year,week) VALUES($1,1,2)",[worldId]);
   await tx.query("INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week,status,booking_class,show_name) VALUES($1,'ppv-two','crown',1,2,'SUBMITTED','PREMIUM','Second PPV')",[worldId]);
   await tx.query("INSERT INTO ppw_card_slots(world_id,draft_id,slot_id,position,kind,payload) VALUES($1,'ppv-two','main',0,'MATCH',$2::jsonb)",[worldId,JSON.stringify(card)]);
   await tx.query("INSERT INTO ppw_completed_shows(world_id,promotion_id,show_id,year,week,resolution_id,crowd_response,receipt_json,receipt_digest) VALUES($1,'crown','ppv-two',1,2,'ppv-two-result',87,$2::jsonb,repeat('b',64))",
    [worldId,JSON.stringify(silentReceipt)]);
   await tx.query("INSERT INTO ppw_completed_show_matches(world_id,show_id,match_id,position,crowd_response,actual_finish,actual_winner_side) VALUES($1,'ppv-two','main',0,92,'CLEAN_PIN','A')",[worldId]);
  });
  const beforeSilent=await withWorldTransaction(db.pool,tx=>tx.query<{
   story_key:string}>(`
   SELECT story_key FROM ppw_world_news_items
   WHERE world_id=$1 AND show_id='ppv-two'`,[worldId]));
  assert.equal(beforeSilent.length,0,"Absence is never a refusal or reported quotation");
  await assert.rejects(dismissPremiumScrum(db.pool,{...silentScope,playerId:rival}),
   /unavailable|controller|permission/i);
  assert.deepEqual(await dismissPremiumScrum(db.pool,silentScope),
   {dismissed:true,saved:true});
  assert.deepEqual(await dismissPremiumScrum(db.pool,silentScope),
   {dismissed:true,saved:false});
  const silentNews=await withWorldTransaction(db.pool,tx=>tx.query<{
   story_key:string;title:string;summary:string;certainty:string}>(`
    SELECT story_key,title,summary,certainty FROM ppw_world_news_items
    WHERE world_id=$1 AND show_id='ppv-two' ORDER BY story_key`,[worldId]));
  assert.equal(silentNews.length,2,"One official story and one speculative Dirt Sheet");
  assert.ok(silentNews.some(x=>x.certainty==="CONFIRMED"&&
   x.title.includes("without taking questions")));
  assert.ok(silentNews.some(x=>x.certainty==="SPECULATION"));
  assert.doesNotMatch(JSON.stringify(silentNews),
   /said "No comment"|refused to answer/i);
  await assert.rejects(answerPremiumScrum(db.pool,silentScope,"MAIN_EVENT",2),
   /press conference has ended/);

  // Race a third session's explicit end against a legitimate answer. The
  // owner control row must serialise the winner: either a saved answer AND
  // published accurate quote, or no answer AND press silence, never a lie.
  const racedScope={...scope,showId:"ppv-three"};
  const racedReceipt={...receipt,showId:"ppv-three",week:3,
   resolutionId:"ppv-three-result"};
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query("INSERT INTO ppw_world_news_weeks(world_id,year,week) VALUES($1,1,3)",[worldId]);
   await tx.query("INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week,status,booking_class,show_name) VALUES($1,'ppv-three','crown',1,3,'SUBMITTED','PREMIUM','Third PPV')",[worldId]);
   await tx.query("INSERT INTO ppw_card_slots(world_id,draft_id,slot_id,position,kind,payload) VALUES($1,'ppv-three','main',0,'MATCH',$2::jsonb)",[worldId,JSON.stringify(card)]);
   await tx.query("INSERT INTO ppw_completed_shows(world_id,promotion_id,show_id,year,week,resolution_id,crowd_response,receipt_json,receipt_digest) VALUES($1,'crown','ppv-three',1,3,'ppv-three-result',87,$2::jsonb,repeat('c',64))",
    [worldId,JSON.stringify(racedReceipt)]);
   await tx.query("INSERT INTO ppw_completed_show_matches(world_id,show_id,match_id,position,crowd_response,actual_finish,actual_winner_side) VALUES($1,'ppv-three','main',0,92,'CLEAN_PIN','A')",[worldId]);
  });
  const [racedAnswer,racedClose]=await Promise.allSettled([
   answerPremiumScrum(db.pool,racedScope,"MAIN_EVENT",0),
   dismissPremiumScrum(db.pool,racedScope)
  ]);
  assert.equal(racedClose.status,"fulfilled");
  const raced=await readPremiumScrum(db.pool,racedScope);
  assert.equal(raced.dismissed,true);
  const answerWasSaved=racedAnswer.status==="fulfilled";
  assert.equal(raced.questions[0]?.answerIndex,answerWasSaved?0:null);
  if(!answerWasSaved)assert.match(String(racedAnswer.reason),/press conference has ended/);
  const racedNews=await withWorldTransaction(db.pool,tx=>tx.query<{
   title:string;summary:string;certainty:string}>(`
   SELECT title,summary,certainty FROM ppw_world_news_items
   WHERE world_id=$1 AND show_id='ppv-three' ORDER BY story_key`,[worldId]));
  assert.equal(racedNews.length,2);
  const official=racedNews.find(x=>x.certainty==="CONFIRMED")!;
  assert.ok(official);
  if(answerWasSaved){
   assert.match(official.summary,/What happened in that ring speaks for itself/);
   assert.match(official.summary,/2 remaining questions were left unanswered/);
  }else{
   assert.match(official.title,/without taking questions/);
   assert.doesNotMatch(official.summary,/speaks for itself/);
  }
  const immutable=await withWorldTransaction(db.pool,tx=>tx.query<{
   crowd_response:number;actual_finish:string}>(`
   SELECT c.crowd_response::double precision AS crowd_response,m.actual_finish FROM ppw_completed_shows c
   JOIN ppw_completed_show_matches m ON m.world_id=c.world_id AND m.show_id=c.show_id
   WHERE c.world_id=$1 AND c.show_id='ppv-one'`,[worldId]));
  assert.deepEqual(immutable,[{crowd_response:87,actual_finish:"CLEAN_PIN"}]);
 }finally{await db.close();}
});
