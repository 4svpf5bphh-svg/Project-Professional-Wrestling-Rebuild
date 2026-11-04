import {test} from "node:test";
import assert from "node:assert/strict";
import {isQuickBookField} from "../src/ui/quick-book.js";

test("Quick Book keeps scripted match essentials visible without duplicating the model",()=>{
 for(const field of ["Winner","Stipulation","Finish","Championship","Minutes"])
  assert.equal(isQuickBookField("MATCH",field),true,field);
 for(const field of ["Intent","Who uses the foreign object?","Technical wrestling"])
  assert.equal(isQuickBookField("MATCH",field),false,field);
});

test("Quick angles include Who/What/Where/Why decisions and retain optional depth",()=>{
 for(const field of ["Creative direction","Angle type","Angle duration (minutes)",
  "Area","Exact location","Attack intensity","Visible aftermath",
  "Storytelling purpose","New alignment","Faction","After which match?"])
  assert.equal(isQuickBookField("ANGLE",field),true,field);
 assert.equal(isQuickBookField("ANGLE","The message"),true);
 assert.equal(isQuickBookField("ANGLE","How the turn is shown"),true);
 assert.equal(isQuickBookField("ANGLE","Attack style"),true);
 assert.equal(isQuickBookField("ANGLE","Winner"),false);
});
