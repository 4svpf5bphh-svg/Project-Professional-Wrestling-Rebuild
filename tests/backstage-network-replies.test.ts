import assert from "node:assert/strict";
import test from "node:test";
import {WORLD_MAIL_SQL} from "../src/db/backstage-world-mail.js";
import {settleNetworkReplies} from "../src/db/backstage-network-replies.js";
import type {SqlRows} from "../src/db/world-operations.js";
test("network reply projection is certified and reuses the bounded inbox read",()=>{
 assert.match(WORLD_MAIL_SQL,/ppw_backstage_network_replies reply/);
 assert.match(WORLD_MAIL_SQL,/network_followup AS/);
 assert.match(WORLD_MAIL_SQL,/r.status IN \('KEPT','BROKEN','EXCUSED'\)/);
 assert.match(WORLD_MAIL_SQL,/network-followup:/);
 assert.match(WORLD_MAIL_SQL,/n.certainty='CONFIRMED'/);
 assert.match(WORLD_MAIL_SQL,/n.story_key LIKE 'broadcast:network:%:warning:%'/);
 assert.match(WORLD_MAIL_SQL,/d.kind='BROADCAST'/);
 assert.match(WORLD_MAIL_SQL,/reply.mail_id IS NULL/);
 assert.match(WORLD_MAIL_SQL,/LIMIT 20/);
});
test("turnaround settlement uses the same certified audited broadcast facts",async()=>{
 const tx={query:async(sql:string,args:readonly unknown[])=>{
  assert.match(sql,/ppw_backstage_network_replies r/);
  assert.match(sql,/ON_TARGET/);
  assert.match(sql,/EXCUSED/);
  assert.equal(args[0],"world");
  assert.deepEqual(JSON.parse(String(args[2])),[{deal_id:"d1",week_index:12,status:"ON_TARGET"}]);
  return [{mail_id:"one"}];
 }} as unknown as SqlRows;
 const review={dealId:"d1",promotionId:"p",promotionName:"CWA",
  offerCode:"BROADCAST_GROWTH",airingDay:5,airingHour:20,
  review:{dealId:"d1",offerCode:"BROADCAST_GROWTH",reviewWeekIndex:12,
   target:.1,rating:.12,showId:"show",status:"ON_TARGET" as const,
   missedConsecutively:0,previousMisses:3,milestone:"RECOVERED" as const,
   bonusEligible:true}};
 assert.deepEqual(await settleNetworkReplies(tx,"world",12,[review]),{settled:1});
});
