import assert from "node:assert/strict";
import test from "node:test";
import {marketWeeklyValue,canAcceptTerms,canAddDates,offerUtility,
 type PersonEconomics,type OfferTerms} from "../src/domain/contract-economics.js";

const person:PersonEconomics={recognition:80,popularity:70,inRingQuality:80,matchCraft:80,
 presentation:90,stamina:80,fatigue:0,careerStage:"PRIME",morale:80,
 priorities:{money:60,role:10,prestige:10,schedule:10,loyalty:5,exposure:5}};
const limited:OfferTerms={family:"LIMITED_NON_EXCLUSIVE",roleExpectation:"MAIN_EVENT",creativeControl:"NONE",
 startWeekIndex:0,termWeeks:13,dateEntitlement:5,weeklyGuarantee:2000,appearanceFee:6000,signingBonus:2000};
test("original market formula and exclusive minimum guarantee",()=>{
 const avg=(person.inRingQuality+person.matchCraft+person.presentation)/3;
 assert.equal(marketWeeklyValue(person),Math.round(500+person.recognition*50+person.popularity*30+avg*25));
 assert.match(canAcceptTerms(person,{...limited,family:"EXCLUSIVE",dateEntitlement:13,weeklyGuarantee:1,appearanceFee:0},[],0)??"",/minimum/);
 assert.equal(canAcceptTerms(person,{...limited,family:"EXCLUSIVE",dateEntitlement:13,weeklyGuarantee:marketWeeklyValue(person),appearanceFee:0},[],0),null);
});
test("future non-exclusive service capacity accounts for unused dates not historical purchases",()=>{
 const contracts=[{contractId:"old",family:"LIMITED_NON_EXCLUSIVE" as const,status:"SIGNED",
  remainingDates:0,startWeekIndex:0,expiresWeekIndex:12}];
 assert.equal(canAcceptTerms(person,limited,contracts,0),null);
 const blocked=[{...contracts[0]!,family:"EXCLUSIVE" as const,remainingDates:null}];
 assert.match(canAcceptTerms(person,limited,blocked,0)??"",/exclusive/);
 assert.equal(canAddDates(person,contracts[0]!,3,[],0),null);
 assert.match(canAddDates(person,{...contracts[0]!,remainingDates:12},104,[],12)??"",/contract weeks/);
});
test("original deterministic wrestler utility and creative bargaining floor",()=>{
 const context={tier:"NATIONAL",mediaReach:60,hasPriorRelationship:false,trust:50,
  seed:"7",offerId:"contract-a"};
 const base=offerUtility(person,limited,context);
 assert.equal(offerUtility(person,limited,context),base);
 assert.ok(offerUtility(person,{...limited,creativeControl:"FULL_APPROVAL"},context)>base);
 assert.throws(()=>canAcceptTerms(person,{...limited,family:"ONE_OFF"},[],0),/One-off/);
});

test("date addenda price only the newly purchased dates, not a fresh term",async()=>{
 const {addendumUtility}=await import("../src/domain/contract-economics.js");
 const ctx={tier:"NATIONAL",mediaReach:60,trust:50,seed:"7",offerId:"addendum-a"};
 const low=addendumUtility(person,{roleExpectation:"REGULAR",appearanceFee:100},2,0,13,ctx);
 const higher=addendumUtility(person,{roleExpectation:"REGULAR",appearanceFee:10000},2,4000,13,ctx);
 assert.ok(higher>low);
 assert.equal(higher,addendumUtility(person,{roleExpectation:"REGULAR",appearanceFee:10000},2,4000,13,ctx));
});

test("limited deals and addenda never sell more dates than calendar weeks",()=>{
 assert.throws(()=>canAcceptTerms(person,{...limited,termWeeks:5,dateEntitlement:6},[],0),
  /cannot exceed contract weeks/);
 const contract={contractId:"existing",family:"LIMITED_NON_EXCLUSIVE" as const,
  status:"SIGNED",remainingDates:3,startWeekIndex:0,expiresWeekIndex:5};
 assert.equal(canAddDates(person,contract,1,[],2),null);
 assert.match(canAddDates(person,contract,2,[],2)??"",/contract weeks/);
});
