import test from "node:test";
import assert from "node:assert/strict";
import {newEditorMatch} from "../src/ui/card-editor-model.js";
import {newEditorSegment} from "../src/ui/card-segment-model.js";
import {matchStaffNotes,angleStaffNotes,contractStaffNotes}
 from "../src/domain/staff-context-advice.js";
import type {StaffRole} from "../src/domain/world-staff.js";

const crew=new Set<StaffRole>(["ROAD_AGENT","MEDICAL","CREATIVE","REFEREE","TALENT_MANAGER"]);
const opponentA={personId:"a",name:"Samoa Joe",inRingQuality:73,matchCraft:48,
 presentation:82,stamina:34,safety:42,fatigue:78,wear:82};
const opponentB={personId:"b",name:"Mistico",inRingQuality:91,matchCraft:84,
 presentation:88,stamina:83,safety:85,fatigue:12,wear:17};

test("staff warn about a tough match using actual scheduled length and condition",()=>{
 const original=newEditorMatch("main","SINGLES");
 const match={...original,teams:[[{personId:"a",contractId:"contract-a"}],
  [{personId:"b",contractId:"contract-b"}]],
  plannedLengthMinutes:35,stipulation:"TLC" as const};
 const result=matchStaffNotes(match,[opponentA,opponentB],crew);
 assert.ok(result.some(x=>x.role==="ROAD_AGENT"&&x.level==="WATCH"&&
  x.message.includes("Samoa Joe")&&x.message.includes("35")));
 assert.ok(result.some(x=>x.role==="MEDICAL"&&x.message.includes("Samoa Joe")));
 assert.ok(result.some(x=>x.role==="REFEREE"));
 assert.deepEqual(result,matchStaffNotes(match,[opponentA,opponentB],crew),
  "Reopening booking must never change professional warnings");
 assert.equal(match.plannedLengthMinutes,35,"Notes must not edit the booked match");
});

test("do not invent chemistry, injuries or hired advisers from missing data",()=>{
 const match={...newEditorMatch("bout","SINGLES"),
  teams:[[{personId:"a",contractId:"c"}],[{personId:"b",contractId:"d"}]],
  plannedLengthMinutes:15};
 const noCrew=matchStaffNotes(match,[{personId:"a",name:"One"},
  {personId:"b",name:"Two"}],new Set<StaffRole>());
 assert.deepEqual(noCrew,[]);
 const hired=matchStaffNotes(match,[{personId:"a",name:"One"},
  {personId:"b",name:"Two"}],new Set<StaffRole>(["ROAD_AGENT"]));
 assert.deepEqual(hired,[],
  "Without trustworthy evidence, a road agent does not manufacture chemistry commentary");
});

test("creative checks that a chapter involves at least one actual storyline wrestler",()=>{
 const segment={...newEditorSegment("scene"),kind:"CONFRONTATION" as const,
  programmeId:"feud",actors:[{personId:"outsider",contractId:"c"}],
  targets:[{personId:"another",contractId:"d"}],durationMinutes:18};
 const notes=angleStaffNotes(segment,[{personId:"outsider",name:"Outsider",presentation:40}],
  crew,["joe","mistico"]);
 assert.ok(notes.some(x=>x.role==="CREATIVE"&&x.level==="WATCH"&&
  x.title==="Storyline cast does not appear"));
 const repaired=angleStaffNotes({...segment,actors:[{personId:"joe",contractId:"q"}]},
  [],crew,["joe","mistico"]);
 assert.ok(!repaired.some(x=>x.title==="Storyline cast does not appear"));
 assert.deepEqual(angleStaffNotes(segment,[],new Set<StaffRole>(),["joe"]),[]);
});

test("talent manager advice responds to actual financial terms, not predicted acceptance",()=>{
 const risky=contractStaffNotes({weeklyGuarantee:7000,weeks:8,appearanceFee:1000,
  dates:10,signingBonus:15000,cash:30000,cashReserve:20000,
  weeklyGuarantees:25000,wageLimit:30000,recurringMargin:2000},crew);
 assert.ok(risky.some(x=>x.title.includes("wage plan")));
 assert.ok(risky.some(x=>x.title.includes("reserve")));
 assert.ok(risky.some(x=>x.title.includes("recurring income")));
 assert.equal(contractStaffNotes({weeklyGuarantee:7000,weeks:8,appearanceFee:1000,
  dates:10,signingBonus:15000,cash:30000,cashReserve:20000,
  weeklyGuarantees:25000,wageLimit:30000,recurringMargin:2000},
  new Set<StaffRole>()).length,0);
});
