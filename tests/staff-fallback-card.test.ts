import assert from "node:assert/strict";
import test from "node:test";
import {chooseEmergencyStaffCard,orderStaffPromotions,type StaffWrestlerCandidate}
  from "../src/domain/staff-fallback-card.js";
const men=(personId:string,weeklyCapacity=7):StaffWrestlerCandidate=>({
  personId,contractId:"contract-"+personId,bookingDivision:"MEN",weeklyCapacity,
});
const women=(personId:string):StaffWrestlerCandidate=>({
  personId,contractId:"contract-"+personId,bookingDivision:"WOMEN",weeklyCapacity:7,
});
const fixture={
  worldId:"world",worldSeed:"439",year:1,week:5,promotionId:"promo",showId:"staff",
  roster:[men("a"),men("b"),women("c")],
  bookedShows:[{showId:"already",day:3,venueId:"main",personIds:["external"]}],
  activeVenues:["main","spare"],
};
test("staff pairing and finish are deterministic and division-safe",()=>{
  const a=chooseEmergencyStaffCard(fixture);
  assert.equal(a.status,"READY");
  if(a.status!=="READY")return;
  assert.deepEqual(a.performers.map(x=>x.bookingDivision),["MEN","MEN"]);
  assert.ok(a.performers.some(x=>x.personId===a.scriptedWinner));
  assert.deepEqual(a,chooseEmergencyStaffCard({...fixture,
    roster:[...fixture.roster].reverse(),
    activeVenues:[...fixture.activeVenues].reverse(),
    bookedShows:[...fixture.bookedShows].reverse(),
  }));
});
test("staff refuses a pairing if no compatible same-division personnel",()=>{
  assert.deepEqual(chooseEmergencyStaffCard({...fixture,roster:[men("a"),women("c")]}),
    {status:"UNFILLED",reason:"NO_ELIGIBLE_PAIR"});
  assert.deepEqual(chooseEmergencyStaffCard({...fixture,roster:[]}),
    {status:"UNFILLED",reason:"NO_ELIGIBLE_PAIR"});
});
test("weekly capacity and conflicting bookings cannot be evaded",()=>{
  assert.deepEqual(chooseEmergencyStaffCard({...fixture,roster:[men("a",1),men("b",1)],
    bookedShows:[{showId:"busy",day:2,venueId:"main",personIds:["a"]}]}),
    {status:"UNFILLED",reason:"NO_ELIGIBLE_PAIR"});
  assert.deepEqual(chooseEmergencyStaffCard({...fixture,activeVenues:[]}),
    {status:"UNFILLED",reason:"NO_VENUE_OR_DAY"});
  const days=Array.from({length:7},(_,index)=>({
    showId:"occupied-"+index,day:index+1,venueId:"main",personIds:[],
  }));
  assert.deepEqual(chooseEmergencyStaffCard({...fixture,
    activeVenues:["main"],bookedShows:days}),
    {status:"UNFILLED",reason:"NO_VENUE_OR_DAY"});
});
test("staff action order is independent of submission/worker arrival",()=>{
  const a=orderStaffPromotions("world","439",1,5,["A","B","C"]);
  const b=orderStaffPromotions("world","439",1,5,["C","B","A"]);
  assert.deepEqual(a,b);
  assert.equal(new Set(a).size,3);
});
