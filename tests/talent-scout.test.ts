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
