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
 assert.match(WORLD_MAIL_SQL,/e.status='ACTIVE'/);
 assert.match(WORLD_MAIL_SQL,/NOT EXISTS\(/);
 assert.match(WORLD_MAIL_SQL,/ppw_player_attention_dismissals/);
 assert.match(WORLD_MAIL_SQL,/ORDER BY c.created_week_index DESC,c.id DESC LIMIT 20/);
 assert.doesNotMatch(WORLD_MAIL_SQL,/ppw_booking_drafts|groq|random\(\)/i);
 const staff=worldStaff("123");
 const doctor=staff.find(s=>s.role==="MEDICAL")!;
 const messages=[
  {id:id("a"),kind:"NETWORK",sender_key:"BROADCAST_GROWTH",
   subject:"Network has issued a formal warning",body:"Certified on-air issues",action:"COMMERCIALS",
   created_week_index:20,read:false,seed:"123"},
  {id:id("b"),kind:"STAFF",sender_key:doctor.staffId,
   subject:"Condition is a concern",body:"Two wrestlers are fatigued",
   action:"STAFF",created_week_index:18,read:true,seed:"123"}
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
