import {test} from "node:test";
import assert from "node:assert/strict";
import {programmeOverlaps,availableProgrammeOption} from "../src/domain/programme-selector.js";
const teams=new Map<string,readonly string[]>([["duo",["alice","bob"]],["other",["celia","david"]]]);
const solo=(refId:string)=>({kind:"PERSON" as const,refId});
const team=(refId:string)=>({kind:"TEAM" as const,refId});
test("programme composer blocks duplicate wrestlers, including team overlap",()=>{
 assert.equal(programmeOverlaps([solo("alice"),team("duo")],teams),true);
 assert.equal(programmeOverlaps([team("duo"),solo("david")],teams),false);
 assert.equal(programmeOverlaps([solo("alice"),solo("alice")],teams),true);
 assert.equal(availableProgrammeOption(team("duo"),[solo("bob")],teams),false);
 assert.equal(availableProgrammeOption(team("other"),[team("duo")],teams),true);
 assert.equal(availableProgrammeOption(solo("alice"),[solo("alice")],teams),false);
});
