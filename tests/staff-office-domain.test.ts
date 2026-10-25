import test from "node:test";
import assert from "node:assert/strict";
import {worldStaff,worldTalentManagers,evaluateStaffOffer,staffBuyout,STAFF_ROLES}
 from "../src/domain/world-staff.js";
import {deriveRoadAgentReport} from "../src/domain/road-agent-report.js";
import {staffedProductionCost} from "../src/domain/staff-production.js";
import {trainerFatigueBonus} from "../src/domain/staff-training.js";
import {staffShowPresentationBonus} from "../src/domain/staff-show-presentation.js";
test("Original Talent Managers survive world expansion without replacement",()=>{
 const old=worldTalentManagers(58),staff=worldStaff(58);
 assert.equal(staff.length,120);
 assert.deepEqual(STAFF_ROLES.map(role=>staff.filter(s=>s.role===role).length),
  [8,16,16,16,16,16,16,16]);
 for(const m of old)assert.deepEqual(
  (({staffId,name,insight,weeklySalary})=>({staffId,name,insight,weeklySalary}))(
   staff.find(s=>s.staffId===m.staffId)!),m);
 assert.equal(new Set(staff.map(s=>s.staffId)).size,120);
 assert.equal(new Set(staff.map(s=>s.name)).size,120);
 assert.deepEqual(staff,worldStaff("58"));
});
test("Diverse staff have stable identities and keep original employee names",()=>{
 for(const seed of [0,58,72,123456789]){
  const staff=worldStaff(seed);
  const market=staff.filter(s=>s.role!=="TALENT_MANAGER");
  assert.equal(new Set(market.map(s=>s.name.split(" ")[0])).size,112);
  assert.equal(new Set(staff.map(s=>s.name)).size,120);
  const retained=worldStaff(seed,["staff-road-agent-001","staff-trainer-016"]);
  for(const [id,serial] of [["staff-road-agent-001",0],["staff-trainer-016",111]] as const){
   const old=retained.find(s=>s.staffId===id)!;
   const offset=Number(BigInt(seed)%16n);
   const given=["Alex","Billie","Cameron","Devon","Ellis","Frankie","Gray","Harper",
    "Indigo","Jules","Kit","Lane","Marlow","Nico","Oakley","Parker"];
   const surnames=["Maddox","Hawthorne","Knox","Sterling","Quinn","Calloway","Brooks",
    "Voss","Winters","Pike","Hale","Monroe","Reed","Sterling-Jones","Fox","Stone"];
   assert.equal(old.name,given[(serial+offset)%16]+" "+
    surnames[(Math.floor(serial/16)+serial+offset)%16]);
   assert.deepEqual({...old,name:null},{...staff.find(s=>s.staffId===id)!,name:null});
  }
  assert.deepEqual(worldStaff(seed),staff);
 }
});
test("Offers and staff buyouts are bounded and deterministic",()=>{
 const member=worldStaff(72).find(s=>s.role==="ROAD_AGENT")!;
 assert.equal(evaluateStaffOffer(member,member.weeklySalary,52).accepted,true);
 assert.equal(evaluateStaffOffer(member,1,104).accepted,false);
 assert.equal(staffBuyout(300,60,8),15900);
 assert.equal(staffBuyout(300,8,8),300);
 assert.equal(staffBuyout(300,8,9),0);
 assert.throws(()=>staffBuyout(-1,9,8));
});
test("Road Agent reports use only certified match details and keep recorded slot identities",()=>{
 const receipt={worldId:"w",promotionId:"p",showId:"s",year:1,week:1,
  resolutionId:"r",crowdResponse:72,matches:[
  {matchId:"match-1",position:0,crowdResponse:82,actualFinish:"CLEAN_PIN",actualWinnerSide:"A"},
  {matchId:"match-2",position:2,crowdResponse:50,actualFinish:"FLASH_PIN",actualWinnerSide:"B"}],
  segments:[]};
 const facts=[
  {matchId:"match-1",ratingStars:4.2,executionQuality:90,actualMinutes:12,
   chemistryModifier:5,finishCheaterPersonId:null,linkedProgrammes:2,
   programmeSignal:null,injuries:[]},
  {matchId:"match-2",ratingStars:2,executionQuality:40,actualMinutes:8,
   chemistryModifier:-5,finishCheaterPersonId:null,linkedProgrammes:0,
   programmeSignal:null,injuries:[]}
 ];
 const agent=worldStaff(72).find(s=>s.role==="ROAD_AGENT")!;
 const report=deriveRoadAgentReport(receipt,facts,agent);
 assert.equal(report.reporter,agent.name);
 assert.equal(report.strongestMatchId,"match-1");
 assert.match(report.concern,/weakest bout|simplify the layout/i);
 assert.doesNotMatch(JSON.stringify(report),/execution score|chemistry modifier|Card [0-9]/i);
 assert.match(report.recommendation,/chemistry|pairing/);
 assert.deepEqual(report,deriveRoadAgentReport(receipt,facts,agent));
 const voices=["FRANK","PATIENT","AMBITIOUS","LOYAL","ECCENTRIC"] as const;
 const reports=voices.map(personality=>deriveRoadAgentReport(receipt,facts,
  {...agent,personality}));
 assert.equal(new Set(reports.map(r=>r.headline)).size,5);
 assert.equal(new Set(reports.map(r=>r.recommendation)).size,5);
 assert.ok(reports.every(r=>r.strongestMatchId==="match-1"&&
  !/execution score|chemistry modifier|Card [0-9]/i.test(JSON.stringify(r))));
 assert.throws(()=>deriveRoadAgentReport(receipt,facts.slice(1),agent),
  /complete verified/);
 assert.equal(deriveRoadAgentReport(receipt,facts,null).reporter,"PPW House Road Agent");
});

test("Production department gives a capped, traceable venue-broadcast efficiency",()=>{
 const staff=worldStaff(72).filter(s=>s.role==="PRODUCTION");
 assert.equal(staffedProductionCost(10000,null).cost,10000);
 for(const employee of staff){
  const result=staffedProductionCost(10000,employee);
  assert.ok(result.saving>=0&&result.saving<=600);
  assert.equal(result.cost+result.saving,10000);
 }
 assert.throws(()=>staffedProductionCost(10000,worldStaff(72)[0]!),
  /Only production/);
});

test("Trainers grant only bounded physical recovery; original uncoached recovery is untouched",()=>{
 assert.equal(trainerFatigueBonus(40),1);
 assert.equal(trainerFatigueBonus(80),2);
 assert.ok(worldStaff(72).filter(s=>s.role==="TRAINER")
  .every(s=>trainerFatigueBonus(s.craft)>=.5&&trainerFatigueBonus(s.craft)<=2.5));
 assert.throws(()=>trainerFatigueBonus(-5));
});

test("Good live staff modestly improve show presentation without changing match outcomes",()=>{
 const catalog=worldStaff(35),read=(role:string)=>catalog.find(p=>p.role===role)!;
 assert.equal(staffShowPresentationBonus([],3),0);
 assert.ok(staffShowPresentationBonus([read("ROAD_AGENT")],0)>=0);
 assert.ok(staffShowPresentationBonus([read("COMMENTATOR"),read("REFEREE")],2)>=0);
 assert.ok(staffShowPresentationBonus([read("COMMENTATOR"),read("REFEREE"),read("ROAD_AGENT")],2)<=2.5);
 assert.equal(staffShowPresentationBonus([read("REFEREE")],0),0);
 assert.throws(()=>staffShowPresentationBonus([],101));
});

test("Staff market size and payroll recovery caps stay compatible",()=>{
 const coaches=worldStaff(76).filter(s=>s.role==="TRAINER");
 assert.equal(coaches.length,16);
 assert.equal(new Set(coaches.map(s=>s.staffId)).size,16);
 assert.ok(coaches.every(c=>trainerFatigueBonus(c.craft)<=2.5));
});
