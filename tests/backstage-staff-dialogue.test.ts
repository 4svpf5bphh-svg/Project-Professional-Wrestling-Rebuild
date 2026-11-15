import assert from "node:assert/strict";
import test from "node:test";
import {worldStaff} from "../src/domain/world-staff.js";
import {staffDebateVoices,staffDebateReaction}
 from "../src/domain/backstage-staff-dialogue.js";
test("only authentic staff identities produce deterministic, role-distinct conflict dialogue",()=>{
 const staff=worldStaff("123");
 const doctor=staff.find(s=>s.role==="MEDICAL")!;
 const writer=staff.find(s=>s.role==="CREATIVE")!;
 const first=staffDebateVoices(doctor,writer);
 assert.equal(first.medical.name,doctor.name);
 assert.equal(first.creative.name,writer.name);
 assert.equal(first.medical.personality,doctor.personality);
 assert.equal(first.creative.personality,writer.personality);
 assert.notEqual(first.medical.position,first.creative.position);
 assert.deepEqual(staffDebateVoices(doctor,writer),first);
 assert.throws(()=>staffDebateVoices(writer,doctor),/real Medical and Creative/);
 const alternate=staff.find(s=>s.role==="MEDICAL"&&s.personality!==doctor.personality)!;
 assert.notEqual(staffDebateVoices(alternate,writer).medical.position,first.medical.position);
});
test("both employees respond to the chosen path without claiming an unearned result",()=>{
 const staff=worldStaff("123");
 const med=staff.find(s=>s.role==="MEDICAL")!;
 const creative=staff.find(s=>s.role==="CREATIVE")!;
 const health=staffDebateReaction("MEDICAL",med.personality,"PRIORITISE_HEALTH");
 const creativeWait=staffDebateReaction("CREATIVE",creative.personality,"PRIORITISE_HEALTH");
 const newStory=staffDebateReaction("CREATIVE",creative.personality,"REFRESH_PROGRAMME");
 const medWarning=staffDebateReaction("MEDICAL",med.personality,"REFRESH_PROGRAMME");
 assert.match(health,/actual fatigue level/);
 assert.match(creativeWait,/room to recover/);
 assert.match(newStory,/genuinely change or finish/);
 assert.match(medWarning,/doesn't lower fatigue/);
 assert.match(staffDebateReaction("MEDICAL",med.personality,"DEFER"),/No commitment/);
 assert.notEqual(health,medWarning);
 for(const role of ["MEDICAL","CREATIVE"] as const)
  for(const mood of ["FRANK","PATIENT","AMBITIOUS","LOYAL","ECCENTRIC"] as const)
   for(const decision of ["PRIORITISE_HEALTH","REFRESH_PROGRAMME","DEFER"] as const)
    assert.ok(staffDebateReaction(role,mood,decision).length>60);
});
