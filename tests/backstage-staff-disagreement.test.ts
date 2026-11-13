import assert from "node:assert/strict";
import test from "node:test";
import {WORLD_MAIL_SQL} from "../src/db/backstage-world-mail.js";
import {STAFF_DISAGREEMENT_LATERAL_SQL,settleStaffDisagreements}
 from "../src/db/backstage-staff-disagreements.js";
import type {SqlRows} from "../src/db/world-operations.js";
test("staff conflict requires real employed Medical and Creative, high fatigue and a stale current PERSON programme",()=>{
 assert.match(STAFF_DISAGREEMENT_LATERAL_SQL,/creative.role='CREATIVE' AND creative.status='ACTIVE'/);
 assert.match(STAFF_DISAGREEMENT_LATERAL_SQL,/med.role='MEDICAL' AND med.status='ACTIVE'/);
 assert.match(STAFF_DISAGREEMENT_LATERAL_SQL,/side.ref_kind='PERSON'/);
 assert.match(STAFF_DISAGREEMENT_LATERAL_SQL,/programme.repetition>=3/);
 assert.match(STAFF_DISAGREEMENT_LATERAL_SQL,/person.fatigue>=70/);
 assert.match(STAFF_DISAGREEMENT_LATERAL_SQL,/deal.status='SIGNED'/);
 assert.match(STAFF_DISAGREEMENT_LATERAL_SQL,/ppw_backstage_staff_disagreements answered/);
 assert.match(WORLD_MAIL_SQL,/staff_disagreement AS/);
 assert.match(WORLD_MAIL_SQL,/staff_dispute_followup AS/);
 assert.match(WORLD_MAIL_SQL,/debate.decision AS disagreement_decision/);
 assert.match(WORLD_MAIL_SQL,/LIMIT 20/);
 assert.doesNotMatch(WORLD_MAIL_SQL,/random\(\)|groq/i);
});
test("one certified staff disagreement settlement checks actual world data and adjusts only once",async()=>{
 let calls=0;
 const tx={query:async(sql:string,params:readonly unknown[])=>{
  calls++;
  assert.match(sql,/UPDATE ppw_backstage_staff_disagreements r/);
  assert.match(sql,/UPDATE ppw_staff_employments staff/);
  assert.match(sql,/person.fatigue<70/);
  assert.match(sql,/programme.repetition<3/);
  assert.match(sql,/r.responded_week_index<\$2/);
  assert.match(sql,/WHEN status='BROKEN' THEN -2/);
  assert.match(sql,/FROM outcomes GROUP BY 1/);
  assert.match(sql,/staff.morale\+impacts.delta/);
  assert.match(sql,/impacts.delta<>0/);
  assert.deepEqual(params,["world",5]);
  return [{settled:2}];
 }} as unknown as SqlRows;
 assert.deepEqual(await settleStaffDisagreements(tx,"world",5),{settled:2});
 assert.equal(calls,1);
 await assert.rejects(settleStaffDisagreements(tx,"",5),/Invalid staff disagreement settlement/);
});
