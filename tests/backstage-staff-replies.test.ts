import test from "node:test";
import assert from "node:assert/strict";
import {WORLD_MAIL_SQL} from "../src/db/backstage-world-mail.js";
import {settleBackstageStaffPromises} from "../src/db/backstage-staff-replies.js";
import type {SqlRows} from "../src/db/world-operations.js";

test("only real active staff concerns are actionable; follow-ups never require generated text",()=>{
 assert.match(WORLD_MAIL_SQL,/staff_followup AS/);
 assert.match(WORLD_MAIL_SQL,/ppw_backstage_staff_replies staff_reply/);
 assert.match(WORLD_MAIL_SQL,/c.kind='STAFF' AND c.action IN \('STAFF','PROGRAMMES'\)/);
 assert.match(WORLD_MAIL_SQL,/pending.status='PENDING'/);
 assert.match(WORLD_MAIL_SQL,/r.status IN \('KEPT','BROKEN','EXCUSED'\)/);
 assert.match(WORLD_MAIL_SQL,/LIMIT 20/);
 assert.doesNotMatch(WORLD_MAIL_SQL,/random\(\)|groq/i);
});
test("staff promise settlement uses one atomic, bounded statement and retains the original morale range",async()=>{
 let calls=0;
 const tx={query:async(sql:string,parameters:readonly unknown[])=>{
  calls++;
  assert.match(sql,/UPDATE ppw_backstage_staff_replies r/);
  assert.match(sql,/ppw_staff_employments e/);
  assert.match(sql,/ppw_programmes programme/);
  assert.match(sql,/person.fatigue>=70/);
  assert.match(sql,/e.morale\+/);
  assert.match(sql,/r.responded_week_index<\$2/);
  assert.deepEqual(parameters,["world",7]);
  return [{settled:2}];
 }} as unknown as SqlRows;
 assert.deepEqual(await settleBackstageStaffPromises(tx,"world",7),{settled:2});
 assert.equal(calls,1);
 await assert.rejects(settleBackstageStaffPromises(tx,"",7),/Invalid staff review week/);
});
