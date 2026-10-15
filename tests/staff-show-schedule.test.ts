import assert from "node:assert/strict";
import test from "node:test";
import {chooseStaffFallbackSchedule} from "../src/domain/staff-show-schedule.js";

const input={
  worldId:"fair-world",worldSeed:"42",year:1,week:9,
  promotionId:"human",showId:"show-human",
  preferredDay:3,preferredVenueId:null,
  personIds:["shared","other"],availableVenueIds:["main","spare"],
  bookedShows:[{showId:"existing",day:3,venueId:"main",personIds:["third"]}],
};
test("staff fills missing venue without changing the player's chosen day",()=>{
  assert.deepEqual(chooseStaffFallbackSchedule(input),{day:3,venueId:"spare"});
  assert.deepEqual(chooseStaffFallbackSchedule({...input,
    availableVenueIds:["spare","main"],bookedShows:[...input.bookedShows].reverse()}),
    {day:3,venueId:"spare"});
});
test("staff never double-books the same wrestler or known venue",()=>{
  const occupied=[...input.bookedShows,
    {showId:"same-talent",day:3,venueId:"different",personIds:["shared"]}];
  assert.equal(chooseStaffFallbackSchedule({...input,bookedShows:occupied}),null);
  assert.equal(chooseStaffFallbackSchedule({...input,
    preferredVenueId:"main",preferredDay:3}),null);
  const alternative=chooseStaffFallbackSchedule({...input,
    preferredVenueId:"main",preferredDay:null,bookedShows:occupied});
  assert.ok(alternative!==null);
  assert.notEqual(alternative!.day,3);
  assert.equal(alternative!.venueId,"main");
});
test("no listed venue or invalid day fails closed",()=>{
  assert.equal(chooseStaffFallbackSchedule({...input,availableVenueIds:[]}),null);
  assert.throws(()=>chooseStaffFallbackSchedule({...input,preferredDay:8}),/Invalid requested day/);
});
