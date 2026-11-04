import test from "node:test";
import assert from "node:assert/strict";
import {newEditorMatch} from "../src/ui/card-editor-model.js";
import {newEditorSegment} from "../src/ui/card-segment-model.js";
import {matchStaffNotes,angleStaffNotes,showWorkloadNotes,matchPartnershipNotes,contractStaffNotes}
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

test("physical angle briefing gives genuine Medical and Referee feedback without asserting a real injury",()=>{
 const scene=newEditorSegment("attack","ATTACK");
 const attack={...scene,
  actors:[{personId:"a",contractId:"contract-a"}],
  targets:[{personId:"b",contractId:"contract-b"}],
  scene:{...scene.scene!,intensity:"BRUTAL" as const,visual:"BLOODIED" as const}};
 const professional=angleStaffNotes(attack,[opponentA,opponentB],crew);
 assert.ok(professional.some(n=>n.role==="MEDICAL"&&n.level==="WATCH"&&
  n.message.includes("Samoa Joe")));
 assert.ok(professional.some(n=>n.role==="REFEREE"&&
  n.title==="Coordinate the staged violence"));
 assert.ok(!professional.some(n=>/confirmed injury|medical absence created/i.test(n.message)));
 const noHires=angleStaffNotes(attack,[opponentA,opponentB],new Set<StaffRole>());
 assert.ok(noHires.some(n=>n.role==="HOUSE"&&n.level==="WATCH"),
  "Condition warning remains available even without a hired specialist");
 assert.equal(attack.scene.visual,"BLOODIED",
  "The advisory must not rewrite an authored on-screen scene");
});

test("same-show match plus physical angle is flagged for the booked performer without double-booking restrictions",()=>{
 const match={...newEditorMatch("bout","SINGLES"),
  teams:[[{personId:"a",contractId:"contract-a"}],
   [{personId:"b",contractId:"contract-b"}]]};
 const physical={...newEditorSegment("scene","ATTACK"),
  actors:[{personId:"a",contractId:"contract-a"}],
  targets:[{personId:"b",contractId:"contract-b"}]};
 const onAngle=showWorkloadNotes("scene",physical,[match],[physical],
  [opponentA,opponentB],crew);
 assert.equal(onAngle.length,1);
 assert.equal(onAngle[0]!.role,"MEDICAL");
 assert.equal(onAngle[0]!.level,"WATCH");
 assert.match(onAngle[0]!.message,/Samoa Joe/);
 assert.match(onAngle[0]!.message,/also have a match/);
 assert.match(onAngle[0]!.message,/current fatigue or wear/);
 assert.doesNotMatch(onAngle[0]!.message,/confirmed injury|will be injured/i);
 const onMatch=showWorkloadNotes("bout",match,[match],[physical],
  [opponentA,opponentB],crew);
 assert.equal(onMatch.length,1);
 assert.match(onMatch[0]!.message,/physical angle/);
 assert.equal(showWorkloadNotes("scene",physical,[match],[physical],
  [opponentA,opponentB],new Set<StaffRole>())[0]!.role,"HOUSE");
 assert.deepEqual(showWorkloadNotes("scene",physical,[],[physical],
  [opponentA,opponentB],crew),[],
  "An angle is not assumed to be a second physical appearance without another slot");
});

test("promos, pre-recorded packages and unrelated scenes do not inflate physical workload",()=>{
 const match={...newEditorMatch("bout","SINGLES"),
  teams:[[{personId:"a",contractId:"contract-a"}],
   [{personId:"b",contractId:"contract-b"}]]};
 const promo={...newEditorSegment("promo","CELEBRATION"),
  actors:[{personId:"a",contractId:"contract-a"}]};
 const video={...newEditorSegment("video","VIDEO_PACKAGE"),
  actors:[{personId:"a",contractId:"contract-a"}]};
 const unrelated={...newEditorSegment("unrelated","ATTACK"),
  actors:[{personId:"c",contractId:"contract-c"}],
  targets:[{personId:"d",contractId:"contract-d"}]};
 assert.deepEqual(showWorkloadNotes("bout",match,[match],[promo,video,unrelated],
  [opponentA,opponentB],crew),[]);
 assert.deepEqual(showWorkloadNotes("promo",promo,[match],[promo],
  [opponentA,opponentB],crew),[]);
 const alsoPhysical={...newEditorSegment("physical","ATTACK"),
  actors:[{personId:"a",contractId:"contract-a"}]};
 assert.equal(showWorkloadNotes("physical",alsoPhysical,[match],[promo,alsoPhysical],
  [opponentA,opponentB],crew).length,1,
  "A physical scene is still recognised alongside nonphysical scenes");
});

test("Road Agent flags verified tag partnership strain and improvement without inventing animosity",()=>{
 const match={...newEditorMatch("tag","TAG"),teams:[
  [{personId:"a",contractId:"ca"},{personId:"b",contractId:"cb"}],
  [{personId:"c",contractId:"cc"},{personId:"d",contractId:"cd"}]]};
 const people=[
  {...opponentA,workingConnections:[{personId:"b",professionalTrust:37,
   familiarity:22,lastChangeType:"STRAIN" as const}]},
  {...opponentB,workingConnections:[]},
  {personId:"c",name:"Shelley",workingConnections:[{personId:"d",
   professionalTrust:65,familiarity:28,lastChangeType:"IMPROVEMENT" as const}]},
  {personId:"d",name:"Sabin",workingConnections:[]}
 ];
 const notes=matchPartnershipNotes(match,people,crew);
 assert.equal(notes.length,2);
 assert.equal(notes[0]!.role,"ROAD_AGENT");
 assert.equal(notes[0]!.level,"WATCH");
 assert.match(notes[0]!.message,/Samoa Joe and Mistico/);
 assert.match(notes[0]!.message,/not evidence of personal animosity/i);
 assert.equal(notes[1]!.level,"INFO");
 assert.match(notes[1]!.message,/professional partnership has improved/);
 assert.deepEqual(matchPartnershipNotes(match,people,new Set<StaffRole>()),[]);
 assert.deepEqual(matchPartnershipNotes({...match,format:"SINGLES"},people,crew),[]);
});
test("opponent relationships and in-ring skills never imply teammate chemistry",()=>{
 const match={...newEditorMatch("tag","TAG"),teams:[
  [{personId:"a",contractId:"ca"},{personId:"b",contractId:"cb"}],
  [{personId:"c",contractId:"cc"},{personId:"d",contractId:"cd"}]]};
 const people=[
  {personId:"a",name:"A",workingConnections:[{personId:"c",professionalTrust:20,
   familiarity:40,lastChangeType:"STRAIN" as const}]},
  {personId:"b",name:"B"},{personId:"c",name:"C"},{personId:"d",name:"D"}];
 assert.deepEqual(matchPartnershipNotes(match,people,crew),[]);
 assert.deepEqual(matchPartnershipNotes(match,[{personId:"a",name:"A",inRingQuality:99},
  {personId:"b",name:"B",inRingQuality:100}],crew),[]);
});

test("a 30-minute interview prompts a creative review even with a strong speaker",()=>{
 const interview={...newEditorSegment("long-interview","INTERVIEW"),
  durationMinutes:30,actors:[{personId:"b",contractId:"contract-b"}]};
 const notes=angleStaffNotes(interview,[opponentB],crew);
 assert.ok(notes.some(n=>n.role==="CREATIVE"&&n.level==="WATCH"&&
  n.title==="Long talking segment"&&n.message.includes("30 minutes")));
 assert.ok(!notes.some(n=>n.message.includes("limited presentation strength")),
  "Do not invent weak presentation for a strong speaker");
 assert.ok(!angleStaffNotes({...interview,durationMinutes:10},[opponentB],crew)
  .some(n=>n.title==="Long talking segment"));
});

test("Talent Manager flags cash-only shortfall for oversized annual deals even below wage cap",()=>{
 const small=contractStaffNotes({
  weeklyGuarantee:100,weeks:12,appearanceFee:100,dates:9,signingBonus:0,
  cash:5_000_000,cashReserve:250_000,weeklyGuarantees:2_000,
  wageLimit:50_000,recurringMargin:null,
  existingRosterExposure:1_000_000,pendingOfferExposure:0
 },crew);
 assert.ok(!small.some(n=>n.title.includes("cash")));
 const large=contractStaffNotes({
  weeklyGuarantee:1000,weeks:52,appearanceFee:900_000,dates:40,signingBonus:0,
  cash:5_000_000,cashReserve:250_000,weeklyGuarantees:2_000,
  wageLimit:50_000,recurringMargin:null,
  existingRosterExposure:1_000_000,pendingOfferExposure:200_000
 },crew);
 assert.ok(large.some(n=>n.level==="WATCH"&&
  n.title==="Unsustainable on current cash"&&n.message.includes("shortfall")));
 assert.ok(!large.some(n=>n.title==="Offer fits the current plan"));
});

test("a lengthy interview still gets a truthful house warning when Creative is not hired",()=>{
 const interview={...newEditorSegment("long-house-interview","INTERVIEW"),
  durationMinutes:30,actors:[{personId:"b",contractId:"contract-b"}]};
 const result=angleStaffNotes(interview,[opponentB],new Set<StaffRole>());
 assert.ok(result.some(n=>n.role==="HOUSE"&&n.level==="WATCH"&&
  n.title==="Long talking segment"));
 assert.ok(!angleStaffNotes({...interview,durationMinutes:10},[opponentB],
  new Set<StaffRole>()).some(n=>n.title==="Long talking segment"));
});

test("an unsafe wrestler gets finish-specific guidance even without a hired referee",()=>{
 const match={...newEditorMatch("risky","SINGLES"),
  plannedFinish:"FOREIGN_OBJECT",plannedLengthMinutes:18,
  teams:[[{personId:"a",contractId:"ca"}],[{personId:"b",contractId:"cb"}]]};
 const withoutReferee=matchStaffNotes(match,[opponentA,opponentB],
  new Set<StaffRole>(["ROAD_AGENT"]));
 assert.ok(withoutReferee.some(n=>n.role==="HOUSE"&&n.level==="WATCH"&&
  n.title==="Risky finish and safety concerns"&&n.message.includes("Samoa Joe")));
 const withReferee=matchStaffNotes(match,[opponentA,opponentB],crew);
 assert.ok(withReferee.some(n=>n.role==="REFEREE"&&n.level==="WATCH"&&
  n.title==="Risky finish and safety concerns"));
 const safeFinish=matchStaffNotes({...match,plannedFinish:"CLEAN_PIN"},
  [opponentA,opponentB],new Set<StaffRole>(["ROAD_AGENT"]));
 assert.ok(!safeFinish.some(n=>n.title==="Risky finish and safety concerns"));
 assert.equal(match.plannedFinish,"FOREIGN_OBJECT",
  "A staff assessment must not rewrite the player's scripted outcome");
});
