import assert from "node:assert/strict";
import test from "node:test";
import {suggestProgrammeAdvice} from "../src/ui/programme-staff-advice.js";
const base={heat:60,repetition:12,activityCount:3,matchCount:2,segmentCount:1,
 sideAWins:1,sideBWins:1,championshipId:null,recentKind:"MATCH" as const};
test("creative advice is contextual and cannot select a booked winner",()=>{
 const opener=suggestProgrammeAdvice({...base,heat:null,activityCount:0,matchCount:0,
  segmentCount:0,recentKind:null});
 assert.match(opener.headline,/reason to clash/);
 const repeated=suggestProgrammeAdvice({...base,repetition:80});
 assert.match(repeated.suggestion,/another bout/);
 const missingAngle=suggestProgrammeAdvice({...base,segmentCount:0});
 assert.match(missingAngle.suggestion,/confrontation/);
 const trailing=suggestProgrammeAdvice({...base,sideAWins:3,sideBWins:0});
 assert.match(trailing.observation,/side A/);
 const title=suggestProgrammeAdvice({...base,heat:85,championshipId:"world"});
 assert.match(title.suggestion,/title confrontation/);
 const scene=suggestProgrammeAdvice({...base,recentKind:"SEGMENT"});
 assert.match(scene.observation,/angle/);
 for(const note of [opener,repeated,missingAngle,trailing,title,scene]){
  assert.ok(note.headline&&note.observation&&note.suggestion);
  assert.doesNotMatch(JSON.stringify(note),/\b(?:100|grade|booked winner|auto-book)\b/i);
 }
});
