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
