import test from "node:test";
import assert from "node:assert/strict";
import {staffAlertVoice} from "../src/domain/staff-mail-voice.js";
import type {WorldStaffMember} from "../src/domain/world-staff.js";

test("real pending Backstage staff alerts offer temperament-specific next decisions",()=>{
 for(const [role,subject] of [
  ["TALENT_MANAGER","Contract renewals need a look"],
  ["MEDICAL","The roster needs a breather"],
  ["CREATIVE","Creative · Alix Vale / Eli Crown"]
 ] as const){
  const evidence="The recorded weekly position is under review.";
  const voices=["FRANK","PATIENT","AMBITIOUS","LOYAL","ECCENTRIC"] as const;
  const versions=voices.map(personality=>
   staffAlertVoice({role,personality},subject,evidence));
  assert.equal(new Set(versions).size,5,role+" must sound like five colleagues");
  assert.ok(versions.every(s=>s.includes(evidence)));
  assert.ok(versions.every(s=>s.length>evidence.length+20));
  assert.ok(versions.every(s=>!s.includes("contract(s)")&&!s.includes("wrestler(s)")));
 }
});
test("settled staff messages and unrelated mail remain verbatim, not rewritten off screen",()=>{
 const body="The review ended with the verified result.";
 for(const role of ["MEDICAL","CREATIVE","TALENT_MANAGER","ROAD_AGENT"] as
  WorldStaffMember["role"][]){
  const member={role,personality:"FRANK" as const};
  assert.equal(staffAlertVoice(member,"The review window has ended",body),body);
  assert.equal(staffAlertVoice(member,"Medical and Creative disagree",body),body);
 }
 assert.equal(staffAlertVoice({role:"MEDICAL",personality:"PATIENT"},
  "The roster needs a breather","One wrestler's fatigue is high.")
  .includes("lighter show"),true);
});
