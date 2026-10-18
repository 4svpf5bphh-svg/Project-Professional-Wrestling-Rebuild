import test from "node:test";
import assert from "node:assert/strict";
import {visibleIndustryPromotions} from "../src/ui/industry-world-hub.js";
const promotions=[
 {name:"Global Wrestling",tier:"GLOBAL",mediaReach:90,recentAverageCrowd:50,rank:1},
 {name:"Independent League",tier:"INDEPENDENT",mediaReach:25,recentAverageCrowd:95,rank:2},
 {name:"Pro Wrestling South",tier:"LOCAL",mediaReach:null,recentAverageCrowd:null,rank:3}
];
test("original-main Industry tier and name filters are purely local",()=>{
 assert.deepEqual(visibleIndustryPromotions(promotions,"wrestling","ALL","REACH")
  .map(x=>x.name),["Global Wrestling","Pro Wrestling South"]);
 assert.deepEqual(visibleIndustryPromotions(promotions,"","INDEPENDENT","REACH")
  .map(x=>x.name),["Independent League"]);
 assert.deepEqual(visibleIndustryPromotions(promotions,"none","ALL","NAME"),[]);
});
test("Industry sorting never mislabels media reach ranking",()=>{
 const form=visibleIndustryPromotions(promotions,"","ALL","FORM");
 assert.equal(form[0]?.name,"Independent League");
 assert.deepEqual(form.map(p=>p.rank),[2,1,3]);
 assert.deepEqual(visibleIndustryPromotions(promotions,"","ALL","REACH").map(p=>p.rank),[1,2,3]);
});