import test from "node:test";
import assert from "node:assert/strict";
import {HOST_SECTIONS,hostSectionHash,readHostSection,
 contractAttentionHash,readContractFocus,plannerCardHash,backstageUnreadHash,
 bookingHistoryState,readBookingHistory}
 from "../src/web/host-navigation.js";
test("every workspace is addressable and all routes avoid private credentials",()=>{
 for(const item of HOST_SECTIONS){
  assert.equal(readHostSection(hostSectionHash(item.id)),item.id);
  assert.equal(hostSectionHash(item.id).includes("token"),false);
 }
 assert.equal(HOST_SECTIONS.filter(s=>"primary" in s&&s.primary).length,5);
});
test("malformed section deep links resolve to the safe default",()=>{
 for(const bad of ["","#/admin","#/roster?player=x","#/../secret",
  "#/roster/secret","#/ROSTER","#/contracts%00"])
  assert.equal(readHostSection(bad),"home");
});

test("original five-root drawer maps gameplay desks without extra routes",async()=>{
 const {HOST_DRAWER_ROOTS,drawerRootForSection}=await import("../src/web/host-navigation.js");
 assert.deepEqual(HOST_DRAWER_ROOTS.map(x=>x.label),
  ["World","Talent","Plan","Business","Results"]);
 const allDestinations=HOST_DRAWER_ROOTS.flatMap(x=>x.destinations.map(y=>y[0]));
 assert.equal(allDestinations.length,new Set(allDestinations).size);
 for(const dest of allDestinations){
  assert.equal(readHostSection(hostSectionHash(dest)),dest);
  assert.equal(HOST_DRAWER_ROOTS.find(x=>x.key===drawerRootForSection(dest))?.destinations.some(x=>x[0]===dest),true);
 }
});

test("Home alerts deep-link to the right contract queue without revealing wrestler IDs",()=>{
 assert.equal(contractAttentionHash("EXPIRING"),"#/contracts/expiring");
 assert.equal(contractAttentionHash("PENDING"),"#/contracts/pending");
 for(const focus of ["EXPIRING","PENDING"] as const){
  const url=contractAttentionHash(focus);
  assert.equal(readHostSection(url),"contracts");
  assert.equal(readContractFocus(url),focus);
 }
 assert.equal(readContractFocus("#/contracts"),"ATTENTION");
 for(const bad of ["#/contracts/other","#/contracts/expiring?person=123",
  "#/contracts/pending/secret","#/contracts/%2e%2e"]){
  assert.equal(readHostSection(bad),"home");
  assert.equal(readContractFocus(bad),"ATTENTION");
 }
});

test("Home alerts open the unfinished card or unread inbox without exposing identities",()=>{
 assert.equal(plannerCardHash,"#/planner/card");
 assert.equal(backstageUnreadHash,"#/backstage/unread");
 assert.equal(readHostSection(plannerCardHash),"planner");
 assert.equal(readHostSection(backstageUnreadHash),"backstage");
 for(const bad of ["#/planner/card/person-3","#/backstage/unread?name=John",
  "#/backstage/unread/secret","#/planner/card#token"])
  assert.equal(readHostSection(bad),"home");
});

test("private selected-card history survives a reload but never crosses promotion or World",()=>{
 const state=bookingHistoryState("w1","mine","ppv-night");
 assert.equal(readHostSection("#/card"),"card");
 assert.equal(readBookingHistory(state,"w1","mine"),"ppv-night");
 assert.equal(readBookingHistory(state,"w1","rival"),null);
 assert.equal(readBookingHistory(state,"w2","mine"),null);
 assert.equal(readBookingHistory(null,"w1","mine"),null);
 assert.equal(readBookingHistory({ppwBooking:{worldId:"w1",promotionId:"mine",
  showId:""}}, "w1","mine"),null);
 assert.equal(readBookingHistory({ppwBooking:{worldId:"w1",promotionId:"mine",
  showId:"x".repeat(201)}}, "w1","mine"),null);
 assert.throws(()=>bookingHistoryState("w1","mine",""));
 assert.equal("#/card".includes("ppv-night"),false);
});
