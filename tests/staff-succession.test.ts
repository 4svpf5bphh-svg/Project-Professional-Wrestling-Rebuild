
import test from "node:test";
import assert from "node:assert/strict";
import {retiredStaffCandidate} from "../src/domain/staff-succession.js";
const veteran={personId:"career-joe",name:"Career Joe",status:"RETIRED",
 inRingQuality:85,matchCraft:83,presentation:77,safety:80,careerExperience:70,
 matches:36,wins:24,tagMatches:20};
test("staff succession keeps person identity and no celebrity shortcut",()=>{
 const member=retiredStaffCandidate(veteran,156);
 assert.ok(member);
 assert.equal(member.name,"Career Joe");
 assert.equal(member.formerWrestlerId,veteran.personId);
 assert.equal(member.qualifiedWeekIndex,156);
 assert.ok(["ROAD_AGENT","TRAINER","COMMENTATOR","CREATIVE"].includes(member.role));
 assert.equal(member.staffId,retiredStaffCandidate(veteran,156)?.staffId);
 assert.equal(retiredStaffCandidate({...veteran,status:"ACTIVE"},156),null);
 assert.equal(retiredStaffCandidate({...veteran,matches:0},156),null);
 assert.equal(retiredStaffCandidate({...veteran,careerExperience:null},156),null);
 assert.ok(member.careerNote.includes("36 certified matches"));
});
test("trainer competence comes from verified ring background, not fame",()=>{
 const trainee=retiredStaffCandidate({...veteran,personId:"trainer",matchCraft:47,
  presentation:42,safety:96,inRingQuality:67,matches:12},104);
 assert.equal(trainee?.role,"TRAINER");
 assert.equal(retiredStaffCandidate({...veteran,matchCraft:40,safety:40,
  presentation:40},52),null);
});
