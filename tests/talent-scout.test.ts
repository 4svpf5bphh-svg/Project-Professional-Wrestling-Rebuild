import test from "node:test";
import assert from "node:assert/strict";
import {worldStaff} from "../src/domain/world-staff.js";
import {selectScoutRecommendations} from "../src/domain/talent-scout.js";
const p=(id:string,ring:number,craft:number,presentation:number,popularity=30)=>({
 personId:id,name:"Wrestler "+id,division:"MEN",aptitude:80,
 ring,craft,presentation,popularity
});
test("a stable World gets sixteen unique Scout identities without replacing old staff",()=>{
 const staff=worldStaff(58),scouts=staff.filter(s=>s.role==="SCOUT");
 assert.equal(staff.length,136);assert.equal(scouts.length,16);
 assert.equal(new Set(staff.map(s=>s.name)).size,136);
 assert.ok(scouts.every(s=>s.staffId.startsWith("staff-scout-")));
});
test("scouting differentiates specialisms without claiming future results",()=>{
 const prospects=[p("a",90,93,35),p("b",40,50,92),p("c",65,62,66),p("d",50,50,60)];
 const technical=selectScoutRecommendations(prospects,{insight:85,specialism:"technical upside"});
 const character=selectScoutRecommendations(prospects,{insight:55,specialism:"character potential"});
 assert.equal(technical.length,3);assert.equal(character.length,2);
 assert.equal(technical[0]?.personId,"a");assert.equal(character[0]?.personId,"b");
 assert.ok(technical.every(x=>/not a guaranteed/.test(x.observation)));
 assert.equal(prospects.length,4);
});

test("Scout voices give metric-specific, actionable notes and vary by week without changing talent ranking",()=>{
 const sample=[p("technical",91,93,34,12),p("character",35,41,93,17)];
 const voice={insight:85,specialism:"technical upside",weekIndex:24};
 const weekOne=selectScoutRecommendations(sample,voice);
 const repeated=selectScoutRecommendations(sample,voice);
 const nextWeek=selectScoutRecommendations(sample,{...voice,weekIndex:25});
 assert.deepEqual(weekOne,repeated,"Refreshing a Staff Office must not generate new claims");
 assert.deepEqual(weekOne.map(x=>x.personId),nextWeek.map(x=>x.personId));
 const technician=weekOne.find(x=>x.personId==="technical")!;
 const character=weekOne.find(x=>x.personId==="character")!;
 assert.match(technician.observation,/presentation 34|in-ring ability 91|match craft 93/);
 assert.match(technician.observation,/long promos|Character work trails/);
 assert.match(character.observation,/presentation 93/);
 assert.match(character.observation,/Match craft|In-ring work/);
 assert.ok(weekOne.some((x,i)=>x.observation!==nextWeek[i]?.observation));
 assert.ok(weekOne.every(x=>x.observation.includes("short-term offer")));
});
