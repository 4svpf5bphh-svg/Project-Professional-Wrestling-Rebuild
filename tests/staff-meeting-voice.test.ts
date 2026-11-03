import test from "node:test";
import assert from "node:assert/strict";
import {staffMeetingDialogue} from "../src/ui/staff-meeting-voice.js";
test("staff speak with distinct personalities while retaining exact evidence",()=>{
 const message="Two signed talent deals are coming due, including Samoa Joe.";
 const staff=(personality:"FRANK"|"PATIENT")=>staffMeetingDialogue({
  role:"TALENT_MANAGER" as const,staffName:"Morgan Stone",personality,message});
 assert.notEqual(staff("FRANK"),staff("PATIENT"));
 assert.ok(staff("FRANK").endsWith(message));
 assert.ok(staff("PATIENT").endsWith(message));
 assert.match(staff("FRANK"),/Straight answer/);
 const quiet=staffMeetingDialogue({role:"MEDICAL",staffName:"Dr Hart",
  personality:"ECCENTRIC",message:"No contracted wrestlers are unavailable."});
 assert.match(quiet,/No contracted wrestlers/);
 const vacant=staffMeetingDialogue({role:"SCOUT",staffName:null,
  personality:null,message:"Hire a scout for recommendations."});
 assert.match(vacant,/House office note/);
});

test("ambitious staff make distinctive role-specific observations rather than copy-paste openings",()=>{
 const base={staffName:"Aria",personality:"AMBITIOUS" as const,
  message:"Místico faces Samoa Joe next week."};
 const creative=staffMeetingDialogue({...base,role:"CREATIVE"});
 const commentator=staffMeetingDialogue({...base,role:"COMMENTATOR"});
 assert.match(creative,/creative opportunity/);
 assert.match(commentator,/broadcast/);
 assert.ok(!creative.includes("There's something we can improve here"));
 assert.ok(!commentator.includes("There's something we can improve here"));
 assert.notEqual(creative,commentator);
});
