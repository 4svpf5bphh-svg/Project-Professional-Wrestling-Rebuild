import test from "node:test";
import assert from "node:assert/strict";
import {STAFF_ROLES,type WorldStaffMember} from "../src/domain/world-staff.js";
import {staffMeetingAgenda,STAFF_DEPARTMENT_PURPOSES,
 type StaffMeetingEvidence} from "../src/domain/staff-meeting-agenda.js";

const facts:StaffMeetingEvidence={
 contractsDue:[{personName:"Samoa Joe",weeksRemaining:2}],
 activeProgrammes:3,repeatedProgrammes:1,
 medicalRisks:1,medicalExample:"Chris Sabin",
 recentShows:5,recentMatches:18,recentDisqualifications:2,
 fatigueConcerns:3,scoutProspects:[{name:"Jack Cartwheel"}],
 featured:{creative:"Joe and Riddle repeated their last scene.",
  commentary:"Joe won their last actual match.",
  roadAgent:"The last singles finish didn't give the audience a clear change of pace."}
};
const person=(personality:WorldStaffMember["personality"],
 specialism="character work")=>({personality,specialism});

test("each of the nine paid departments has an honest purpose, a boundary and an actual decision",()=>{
 const agendas=STAFF_ROLES.map(role=>({role,
  agenda:staffMeetingAgenda(role,facts,person("FRANK")),
  purpose:STAFF_DEPARTMENT_PURPOSES[role]}));
 assert.equal(agendas.length,9);
 assert.equal(new Set(agendas.map(p=>p.agenda.message)).size,9);
 for(const {role,agenda,purpose} of agendas){
  assert.ok(purpose.does.length>=55,role+" must contribute something specific");
  assert.ok(purpose.limit.length>=35,role+" must have an honest limit");
  assert.equal(agenda.target,purpose.target);
  assert.notEqual(agenda.priority,"VACANT");
  assert.doesNotMatch(agenda.message,/certified event|engine|simulation|the player/i);
 }
 assert.match(agendas.find(x=>x.role==="TALENT_MANAGER")!.agenda.message,/Samoa Joe.*2 weeks/);
 assert.match(agendas.find(x=>x.role==="MEDICAL")!.agenda.message,/Chris Sabin/);
 assert.match(agendas.find(x=>x.role==="SCOUT")!.agenda.message,/Jack Cartwheel/);
 assert.match(agendas.find(x=>x.role==="REFEREE")!.agenda.message,/2 disqualifications/);
 assert.match(agendas.find(x=>x.role==="PRODUCTION")!.agenda.message,/5 recent shows/);
 assert.match(agendas.find(x=>x.role==="TRAINER")!.agenda.message,/3 wrestlers/);
});

test("the same creative concern produces FIVE meaningfully different proposed decisions",()=>{
 const opinions=(["FRANK","PATIENT","AMBITIOUS","LOYAL","ECCENTRIC"] as const)
  .map(personality=>staffMeetingAgenda("CREATIVE",facts,person(personality)).message);
 assert.equal(new Set(opinions).size,5);
 for(const opinion of opinions){
  assert.match(opinion,/1 active story has repeated/);
  assert.doesNotMatch(opinion,/Side B|six-minute interview|we booked|will turn heel/i);
 }
 assert.match(opinions[0]!,/Stop repeating/);
 assert.match(opinions[1]!,/week to breathe/);
 assert.match(opinions[2]!,/major payoff/);
 assert.match(opinions[3]!,/explain what matters/);
 assert.match(opinions[4]!,/setting or point of view/);
});

test("vacant offices never impersonate a specialist while house safety and expiry alerts survive",()=>{
 const vacant=STAFF_ROLES.map(role=>staffMeetingAgenda(role,facts,null));
 assert.ok(vacant.every(x=>x.priority==="VACANT"));
 assert.ok(vacant.every(x=>x.message.startsWith("No hired ")));
 assert.ok(vacant.every(x=>!x.message.includes("My card plan")));
 assert.match(staffMeetingAgenda("MEDICAL",facts,null).message,/House warning: 1 wrestler is medically unavailable/);
 assert.match(staffMeetingAgenda("TALENT_MANAGER",facts,null).message,/Samoa Joe/);
 assert.match(staffMeetingAgenda("ROAD_AGENT",facts,null).message,/Recruit somebody/);
});

test("steady weeks don't fabricate emergencies, rival opponents or unbooked results",()=>{
 const quiet:StaffMeetingEvidence={...facts,contractsDue:[],activeProgrammes:0,
  repeatedProgrammes:0,medicalRisks:0,medicalExample:null,recentShows:0,
  recentMatches:0,recentDisqualifications:0,fatigueConcerns:0,
  scoutProspects:[],featured:null};
 for(const role of STAFF_ROLES){
  const a=staffMeetingAgenda(role,quiet,person("PATIENT"));
  assert.equal(a.priority,"CLEAR",role+" must not invent a problem");
  assert.doesNotMatch(a.message,/guaranteed|Side B|has signed|made a turn/i);
 }
 assert.match(staffMeetingAgenda("CREATIVE",quiet,person("PATIENT")).message,/motive or a genuine conflict/);
 assert.match(staffMeetingAgenda("ROAD_AGENT",quiet,person("FRANK")).message,/There isn't a recent completed match/);
 assert.match(staffMeetingAgenda("SCOUT",quiet,person("PATIENT")).message,/no eligible young prospects/);
});

test("a hired trainer or producer describes bounded real effects, not invented upgrades",()=>{
 const production=staffMeetingAgenda("PRODUCTION",facts,person("ECCENTRIC","small venues"));
 assert.match(production.message,/small venue/);
 assert.match(production.message,/capped share of actual show costs/);
 assert.doesNotMatch(production.message,/guaranteed|raise ratings|free television/i);
 const training=staffMeetingAgenda("TRAINER",facts,person("FRANK"));
 assert.match(training.message,/cannot clear medical restrictions/);
 assert.equal(training.priority,"WATCH");
 assert.match(STAFF_DEPARTMENT_PURPOSES.TRAINER.limit,/Cannot overwrite innate skills/);
 assert.match(STAFF_DEPARTMENT_PURPOSES.PRODUCTION.does,/reduce some verified production spending/);
});

test("creative protects a first-time solo chapter from bogus rematch or repetition advice",()=>{
 const solo:StaffMeetingEvidence={...facts,repeatedProgrammes:0,
  featured:{creative:"The Undertaker leads an active solo character story. No completed on-air chapter has been recorded yet.",
   commentary:null,roadAgent:null}};
 const suggestion=staffMeetingAgenda("CREATIVE",solo,person("FRANK"));
 assert.equal(suggestion.priority,"WATCH");
 assert.match(suggestion.message,/The Undertaker.*solo character story/);
 assert.match(suggestion.message,/one clear decision/);
 assert.doesNotMatch(suggestion.message,/Stop repeating|rematch|Side B|needs another rival/);
});
