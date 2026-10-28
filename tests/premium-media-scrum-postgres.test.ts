import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {readPremiumScrum,answerPremiumScrum} from "../src/db/premium-media-scrum.js";

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
  const immutable=await withWorldTransaction(db.pool,tx=>tx.query<{
   crowd_response:number;actual_finish:string}>(`
   SELECT c.crowd_response,m.actual_finish FROM ppw_completed_shows c
   JOIN ppw_completed_show_matches m ON m.world_id=c.world_id AND m.show_id=c.show_id
   WHERE c.world_id=$1 AND c.show_id='ppv-one'`,[worldId]));
  assert.deepEqual(immutable,[{crowd_response:87,actual_finish:"CLEAN_PIN"}]);
 }finally{await db.close();}
});
