import assert from "node:assert/strict";
import test from "node:test";
import {readWorldMail,WORLD_MAIL_SQL} from "../src/db/backstage-world-mail.js";
import {COMMERCIAL_COMPANIES} from "../src/domain/commercial-offers.js";
import {worldStaff} from "../src/domain/world-staff.js";
import type {SqlRows} from "../src/db/world-operations.js";

const id=(s:string)=>"backstage-world:"+s.repeat(32);
test("World mail projection contains only genuine controlled certified sources",async()=>{
 assert.match(WORLD_MAIL_SQL,/JOIN ppw_promotion_controls c/);
 assert.match(WORLD_MAIL_SQL,/m.status='ACTIVE'/);
 assert.match(WORLD_MAIL_SQL,/p.lifecycle='ACTIVE'/);
 assert.match(WORLD_MAIL_SQL,/n.desk='OFFICIAL'/);
 assert.match(WORLD_MAIL_SQL,/n.certainty='CONFIRMED'/);
 assert.match(WORLD_MAIL_SQL,/n.story_key LIKE 'broadcast:network:%'/);
 assert.match(WORLD_MAIL_SQL,/ppw_staff_employments e/);
 assert.match(WORLD_MAIL_SQL,/ppw_programme_resolved_activities a/);
 assert.match(WORLD_MAIL_SQL,/p.creative_intent->'followUp'/);
 assert.match(WORLD_MAIL_SQL,/story.programme_id AS story_programme_id/);
 assert.match(WORLD_MAIL_SQL,/story.status='ACTIVE'/);
 assert.match(WORLD_MAIL_SQL,/story.show_id/);
 assert.match(WORLD_MAIL_SQL,/finished.authored_outcome='HAPPENS'/);
 assert.match(WORLD_MAIL_SQL,/a.kind='SEGMENT'/);
 assert.match(WORLD_MAIL_SQL,/slot.payload->'participants' @>/);
 assert.match(WORLD_MAIL_SQL,/slot.payload->'actorIds'/);
 assert.match(WORLD_MAIL_SQL,/targetPresence'='ON_SCREEN'/);
 assert.match(WORLD_MAIL_SQL,/programme_format IN \('SOLO','RELATIONSHIP','FACTION'\)/);
 assert.match(WORLD_MAIL_SQL,/e.status='ACTIVE'/);
 assert.match(WORLD_MAIL_SQL,/NOT EXISTS\(/);
 assert.match(WORLD_MAIL_SQL,/ppw_player_attention_dismissals/);
 assert.match(WORLD_MAIL_SQL,/ppw_completed_shows completed JOIN ppw_world_news_weeks news/);
 assert.match(WORLD_MAIL_SQL,/p.popularity BETWEEN 25 AND 70/);
 assert.match(WORLD_MAIL_SQL,/ORDER BY c.created_week_index DESC,c.id DESC LIMIT 20/);
 assert.match(WORLD_MAIL_SQL,/JOIN ppw_completed_shows done/);
 assert.match(WORLD_MAIL_SQL,/draft.status='SUBMITTED' AND draft.booking_class='REGULAR'/);
 assert.doesNotMatch(WORLD_MAIL_SQL,/groq|random\(\)/i);
 const staff=worldStaff("123");
 const doctor=staff.find(s=>s.role==="MEDICAL")!;
 const messages=[
  {id:id("a"),kind:"NETWORK",sender_key:"BROADCAST_GROWTH",
   subject:"Network has issued a formal warning",body:"Certified on-air issues",action:"COMMERCIALS",
   created_week_index:20,read:false,seed:"123"},
  {id:id("b"),kind:"STAFF",sender_key:doctor.staffId,
   subject:"Condition is a concern",body:"Two wrestlers are fatigued",
   action:"STAFF",created_week_index:18,read:true,seed:"123"},
  {id:id("c"),kind:"FREE_AGENT",sender_key:"p-1",sender_name:"Available Prospect",
   target_person_id:"p-1",subject:"Could we talk?",body:"I saw your show",
   action:"MARKET",created_week_index:18,read:false,seed:"123"},
  {id:id("d"),kind:"LOCKER_ROOM",sender_key:"p-2",sender_name:"Character Name",
   target_person_id:"p-2",subject:"About that chapter",body:"On-screen story",
   action:"PROGRAMMES",created_week_index:18,read:false,seed:"123",
   story_chapter:true,story_programme_id:"story-1",story_show_id:"show-1",
   story_slot_id:"scene-1",story_week_index:18,story_crowd_response:71,
   story_format:"SOLO",can_story_follow_up:true}
 ];
 let queries=0;
 const tx={query:async(sql:string,params:readonly unknown[])=>{
  queries++;
  assert.equal(sql,WORLD_MAIL_SQL);
  assert.deepEqual(params,["world","mine","owner"]);
  return messages;
 }} as unknown as SqlRows;
 const inbox=await readWorldMail(tx,{worldId:"world",promotionId:"mine",playerId:"owner"});
 assert.equal(queries,1,"One fixed bounded query, regardless of roster size");
 assert.equal(inbox[0]?.sender,COMMERCIAL_COMPANIES.BROADCAST_GROWTH.name);
 assert.equal(inbox[1]?.sender,doctor.name);
 assert.equal(inbox[0]?.read,false);
 assert.equal(inbox[1]?.read,true);
 assert.equal(inbox[1]?.action,"STAFF");
 assert.equal(inbox[2]?.sender,"Available Prospect");
 assert.equal(inbox[2]?.targetPersonId,"p-1");
 assert.equal(inbox[3]?.sender,"Character Name");
 assert.equal(inbox[3]?.storyChapter,true);
 assert.equal(inbox[3]?.action,"PROGRAMMES");
 assert.equal(inbox[3]?.storyProgrammeId,"story-1");
 assert.equal(inbox[3]?.storySource?.sourceSlotId,"scene-1");
 assert.equal(inbox[3]?.storySource?.crowdResponse,71);
 assert.equal(inbox[3]?.canChooseStoryFollowUp,true);
 assert.equal(inbox[3]?.storyFollowUp,undefined);
});
test("World mail rejects invalid source IDs and oversized results",async()=>{
 const query=async()=>[{id:"fake",kind:"NETWORK",sender_key:"BROADCAST_GROWTH",
  subject:"Fake",body:"Fake",action:"COMMERCIALS",created_week_index:2,read:false,seed:"1"}];
 await assert.rejects(readWorldMail({query} as unknown as SqlRows,"world" as never),/Invalid Backstage World inbox scope/);
 await assert.rejects(readWorldMail({query} as unknown as SqlRows,{
  worldId:"world",promotionId:"mine",playerId:"owner"}),/Invalid certified/);
 const tooMany=Array.from({length:21},()=>({id:id("a"),kind:"NETWORK",
  sender_key:"BROADCAST_GROWTH",subject:"Test",body:"Test",
  action:"COMMERCIALS",created_week_index:1,read:false,seed:"1"}));
 await assert.rejects(readWorldMail({query:async()=>tooMany} as unknown as SqlRows,
  {worldId:"world",promotionId:"mine",playerId:"owner"}),/exceeded bound/);
});
