import test from "node:test";
import assert from "node:assert/strict";
import {HOST_SECTIONS,hostSectionHash,readHostSection}
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
