import test from "node:test";
import assert from "node:assert/strict";
import {STAFF_ROLES} from "../src/domain/world-staff.js";
import {STAFF_PURPOSE,staffMeetingBrief,type StaffMeetingFacts}
 from "../src/domain/staff-meeting-brief.js";
import {staffRecommendationVoice} from "../src/ui/staff-meeting-voice.js";

const empty:StaffMeetingFacts={
 renewals:[],activeProgrammes:0,repeatedProgrammes:0,featuredProgramme:null,
 medicalRisks:0,medicalExample:null,fatigueConcerns:0,
 recentMatches:0,recentShows:0,recentDisqualifications:0,scoutLeads:[]
};

test("nine staff roles have honest, specific effects and boundaries",()=>{
 const messages=STAFF_ROLES.map(role=>({
  role,...staffMeetingBrief(role,empty)
 }));
 assert.equal(messages.length,9);
 assert.equal(new Set(messages.map(x=>x.message)).size,9,
  "Each professional must have their own real observation");
 assert.ok(messages.every(x=>STAFF_PURPOSE[x.role].effect.length>30&&
  STAFF_PURPOSE[x.role].boundary.length>25));
 assert.ok(messages.every(x=>x.urgency==="CLEAR"),
  "A quiet week should never manufacture a problem");
 assert.match(STAFF_PURPOSE.PRODUCTION.effect,/up to 6%/);
 assert.match(STAFF_PURPOSE.TRAINER.boundary,/medical clearance/);
 assert.match(STAFF_PURPOSE.ROAD_AGENT.boundary,/scripted winner/);
 assert.match(STAFF_PURPOSE.SCOUT.boundary,/never signs/);
 assert.deepEqual(messages.map(x=>x.target),[
  "contracts","gorilla","roster","programmes","programmes",
  "gorilla","staff","roster","market"
 ]);
});

test("staff decisions are anchored in named contracts, injury, fatigue, and events",()=>{
 const facts:StaffMeetingFacts={...empty,
  renewals:[{personName:"Konosuke Takeshita",weeksRemaining:2}],
  medicalRisks:1,medicalExample:"Samoa Joe",fatigueConcerns:2,
  repeatedProgrammes:1,activeProgrammes:2,
  recentDisqualifications:3,recentShows:4,recentMatches:10,
  scoutLeads:[{name:"Rising Technician"}]};
 const contract=staffMeetingBrief("TALENT_MANAGER",facts);
 assert.equal(contract.urgency,"ACTION");
 assert.match(contract.message,/Konosuke Takeshita/);
 assert.match(contract.nextStep,/actually commit|contract/);
 const doctor=staffMeetingBrief("MEDICAL",facts);
 assert.equal(doctor.urgency,"ACTION");
 assert.match(doctor.message,/Samoa Joe/);
 assert.match(doctor.nextStep,/clearance/);
 assert.match(staffMeetingBrief("CREATIVE",facts).nextStep,/fresh motivation/);
 assert.match(staffMeetingBrief("REFEREE",facts).message,/3 disqualification/);
 assert.match(staffMeetingBrief("SCOUT",facts).message,/Rising Technician/);
 assert.match(staffMeetingBrief("TRAINER",facts).nextStep,/recovery/);
 assert.match(staffMeetingBrief("PRODUCTION",facts).nextStep,/production efficiencies/);
});

test("solo/faction staff advice never fabricates a ghost rival or winner",()=>{
 for(const format of ["SOLO","RELATIONSHIP","FACTION"] as const){
  const story:StaffMeetingFacts={...empty,
   featuredProgramme:{sideA:format==="SOLO"?"The Undertaker":"The Gunns",
    sideB:"",programmeFormat:format,heat:80,lastKind:"SEGMENT",
    lastWeekIndex:22,lastWinnerSide:null,lastMatchWinnerSide:null,
    lastMatchWeekIndex:null,directionChoice:null,directionWeekIndex:null,
    laterMatch:false,laterAngle:true}};
  for(const role of ["CREATIVE","COMMENTATOR","ROAD_AGENT"] as const){
   const advice=staffMeetingBrief(role,story);
   assert.doesNotMatch(advice.message+" "+advice.nextStep,
    /Side B|versus side|vs Side|recorded rivalry match|was pinned by/i);
   assert.match(advice.message,/The Undertaker|The Gunns/);
  }
 }
});

test("the same evidence yields different, accountable staff positions",()=>{
 const recommendation="Check the signed dates before offering exclusivity.";
 const out=new Set(["FRANK","PATIENT","AMBITIOUS","LOYAL","ECCENTRIC"].map(personality=>
  staffRecommendationVoice({role:"TALENT_MANAGER",personality:personality as
   "FRANK"|"PATIENT"|"AMBITIOUS"|"LOYAL"|"ECCENTRIC",
   urgency:"ACTION",nextStep:recommendation})));
 assert.equal(out.size,5);
 assert.ok([...out].every(s=>s.endsWith(recommendation)));
 assert.match([...out].find(s=>s.includes("ambition"))??"",/impossible offer/);
});
