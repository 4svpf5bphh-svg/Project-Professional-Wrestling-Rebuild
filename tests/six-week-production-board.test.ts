import test from "node:test";
import assert from "node:assert/strict";
import {buildSixWeekProduction} from "../src/domain/six-week-production-board.js";
import type {PlannerWeek} from "../src/db/planner-workspace.js";

const series=(seriesId:string,eventType:"REGULAR"|"MAJOR",name:string)=>({
 seriesId,name,eventType,role:eventType==="MAJOR"?"PREMIUM":"FLAGSHIP",
 cadenceWeeks:1,anchorWeek:0,importance:70,active:true
}) as PlannerWeek["scheduled"][number];
const draft=(status:string,ready:boolean,premium=false,showName="Weekly")=>({
 draftId:"draft-"+status+showName,year:1,week:51,status,
 bookingClass:premium?"PREMIUM":"REGULAR",eventType:premium?"MAJOR":"REGULAR",
 showSeriesId:premium?"ppv":"tv",showName,day:6,marketId:"home",venueId:"hall",
 marketName:"Home",venueName:"Hall",ticketStrategy:"STANDARD",ready,slots:3
}) as PlannerWeek["shows"][number];
const week=(year:number,w:number,offset:number,shows:PlannerWeek["shows"],
 scheduled:PlannerWeek["scheduled"]=[series("tv","REGULAR","CWA Weekly")]):PlannerWeek=>({
 year,week:w,offset,required:true,major:scheduled.some(x=>x.eventType==="MAJOR"),
 canEdit:true,shows,scheduled
});

test("a ready draft is not falsely advertised as submitted or certified",()=>{
 const board=buildSixWeekProduction([
  week(1,24,0,[draft("DRAFT",false)]),
  week(1,25,1,[draft("DRAFT",true)]),
  week(1,26,2,[draft("SUBMITTED",true)])]);
 assert.deepEqual(board.weeks.map(x=>x.state),[
  "CARD_IN_PROGRESS","READY_FOR_LOCK","SUBMITTED"]);
 assert.equal(board.submittedShows,1);
 assert.equal(board.preparedShows,1);
 assert.equal(board.needsActionWeeks,1);
 assert.equal(board.unsubmittedWeeks,2);
});

test("the six-week PPV build uses an actual named event without inventing a booked card",()=>{
 const board=buildSixWeekProduction([
  week(1,49,0,[draft("SUBMITTED",true)]),
  week(1,50,1,[]),
  week(1,51,2,[],[
   series("tv","REGULAR","CWA Weekly"),
   series("ppv","MAJOR","CWA Final Stand")])]);
 assert.deepEqual(board.nextPremium,{
  year:1,week:51,offset:2,name:"CWA Final Stand"});
 assert.equal(board.weeks[2]!.state,"UNBOOKED");
 assert.equal(board.weeks[2]!.missingShows,2);
 assert.equal(board.weeks[2]!.submittedCount,0);
});

test("the board preserves a mixed show week and current-year rollover",()=>{
 const board=buildSixWeekProduction([
  week(2,1,1,[draft("SUBMITTED",true),draft("DRAFT",false,true,"New Dawn")],[
   series("tv","REGULAR","Weekly"),
   series("ppv","MAJOR","New Dawn")]),
  week(1,52,0,[draft("SUBMITTED",true)])]);
 assert.deepEqual(board.weeks.map(x=>x.key),["1-52","2-1"]);
 assert.equal(board.weeks[1]!.state,"PARTIALLY_BOOKED");
 assert.equal(board.nextPremium?.year,2);
 assert.equal(board.nextPremium?.name,"New Dawn");
 assert.equal(board.submittedShows,2);
});

test("an unscheduled week is not promoted to a fictional PPV",()=>{
 const board=buildSixWeekProduction([week(3,12,0,[],[])]);
 assert.equal(board.nextPremium,null);
 assert.equal(board.weeks[0]!.premiumName,null);
 assert.equal(board.weeks[0]!.submittedCount,0);
});


test("booked Programme chapters show the same story building over several weeks",()=>{
 const first={...draft("DRAFT",false),programmeChapters:[
  {programmeId:"feud",name:"Joe vs Místico",matches:0,segments:1}]};
 const second={...draft("SUBMITTED",true),programmeChapters:[
  {programmeId:"feud",name:"Joe vs Místico",matches:1,segments:1,
   finalePayoff:"DECISIVE_MATCH"}]};
 const board=buildSixWeekProduction([
  week(1,24,0,[first]),week(1,25,1,[second])]);
 assert.equal(board.programmeCount,1);
 assert.equal(board.programmes[0]?.name,"Joe vs Místico");
 assert.deepEqual(board.programmes[0]?.chapters,[
  {year:1,week:24,matches:0,segments:1,submitted:false,
   editableDraftId:"draft-DRAFTWeekly",finalePayoff:null},
  {year:1,week:25,matches:1,segments:1,submitted:true,
   editableDraftId:null,finalePayoff:"DECISIVE_MATCH"}]);
});

test("mixed PPV/TV week retains a real editable draft and only one planned payoff",()=>{
 const submitted={...draft("SUBMITTED",true),programmeChapters:[{
  programmeId:"feud",name:"Joe vs Místico",matches:0,segments:1}]};
 const premium={...draft("DRAFT",false,true,"Spring Riot"),programmeChapters:[{
  programmeId:"feud",name:"Joe vs Místico",matches:1,segments:0,
  finalePayoff:"DECISIVE_MATCH"}]};
 const build=buildSixWeekProduction([week(1,6,0,[submitted,premium],[
  series("tv","REGULAR","CWA Weekly"),series("ppv","MAJOR","Spring Riot")])]);
 assert.equal(build.weeks[0]?.state,"PARTIALLY_BOOKED");
 assert.deepEqual(build.programmes[0]?.chapters,[{
  year:1,week:6,matches:1,segments:1,submitted:false,
  editableDraftId:premium.draftId,finalePayoff:"DECISIVE_MATCH"
 }]);
});


test("an active, genuinely unbooked Programme stays visible without invented story beats",()=>{
 const current=week(1,4,0,[]);
 const active=[{programmeId:"unbooked",name:"Joe vs Místico"}];
 const summary=buildSixWeekProduction([current],active);
 assert.equal(summary.programmeCount,1);
 assert.deepEqual(summary.programmes,[{
  programmeId:"unbooked",name:"Joe vs Místico",chapters:[]
 }]);
 assert.equal(summary.weeks[0]?.state,"UNBOOKED");
 assert.equal(summary.submittedShows,0);
});

test("a Programme with real future chapters is not duplicated by the active list",()=>{
 const show={...draft("DRAFT",true),programmeChapters:[{
  programmeId:"feud",name:"Booked feud",matches:0,segments:1}]};
 const summary=buildSixWeekProduction([week(1,5,0,[show])],[
  {programmeId:"feud",name:"Active feud"}]);
 assert.equal(summary.programmeCount,1);
 assert.equal(summary.programmes[0]?.name,"Booked feud");
 assert.equal(summary.programmes[0]?.chapters.length,1);
});
