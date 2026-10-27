import test from "node:test";
import assert from "node:assert/strict";
import {tournamentHeritage,tournamentSeason,tournamentSeriesKey,
 type TournamentHistoryRow} from "../src/domain/tournament-heritage.js";
const record=(i:number,season:number,champion:string|null,overrides:Partial<TournamentHistoryRow>={}):TournamentHistoryRow=>({
 tournamentId:"t-"+i,name:"King's Crown",division:"MEN",
 status:champion?"COMPLETE":"CANCELLED",entrantsCount:8,
 createdWeekIndex:(season-1)*52+5,
 winnerPersonId:champion,winnerName:champion,
 finalResolvedWeekIndex:champion?(season-1)*52+7:null,
 finalRatingStars:champion?4.2:null,...overrides
});
test("tournament heritage counts distinct seasons, certified winners and repeat winners only",()=>{
 const past=[
  record(1,1,"Orton",{finalRatingStars:3.2}),
  record(2,1,"Bryan",{name:"  KING'S   CROWN  ",finalRatingStars:5}),
  record(3,2,"Orton",{finalRatingStars:4}),
  record(4,3,"Orton",{finalRatingStars:null}),
  record(5,4,null),
  record(6,4,"Bryan",{finalRatingStars:4.8}),
  record(7,5,"Orton",{finalRatingStars:4.2}),
  record(8,6,"Orton",{finalRatingStars:3.5}),
  record(9,6,"Solo",{name:"Queens Cup",division:"WOMEN",entrantsCount:4})
 ];
 const groups=tournamentHeritage(past);
 const main=groups.find(g=>g.division==="MEN")!;
 assert.equal(main.completedEditions,7);
 assert.equal(main.seasons,6);
 assert.equal(main.firstSeason,1);
 assert.equal(main.lastSeason,6);
 assert.equal(main.legacy,"LONG-RUNNING CLASSIC");
 assert.deepEqual(main.latestChampion,{personId:"Orton",name:"Orton"});
 assert.equal(main.latestCompletedTournamentId,"t-8");
 assert.deepEqual(main.leaders.slice(0,2).map(x=>[x.personId,x.wins]),
  [["Orton",5],["Bryan",2]]);
 assert.equal(main.mostWins,5);
 assert.equal(main.lastFinalRatingStars,3.5);
 assert.equal(main.averageFinalRatingStars,4.12);
 assert.equal(groups.find(g=>g.division==="WOMEN")?.legacy,"FIRST EDITION");
 assert.equal(tournamentSeriesKey("  KING'S   CROWN  ","MEN"),
  tournamentSeriesKey("King's Crown","MEN"));
});
test("no unearned annual tradition from repeated same-season or cancelled brackets",()=>{
 const group=tournamentHeritage([
  record(1,1,"A"),record(2,1,"B"),record(3,1,"C"),
  record(4,5,null),record(5,6,null)
 ])[0]!;
 assert.equal(group.completedEditions,3);
 assert.equal(group.seasons,1);
 assert.equal(group.legacy,"FIRST EDITION");
 assert.equal(group.latestChampion?.name,"C");
 assert.equal(tournamentSeason(52),2);
 assert.throws(()=>tournamentSeason(-1));
 const separate=tournamentHeritage([
  record(1,1,"A"),record(2,3,"B"),record(3,5,"C")])[0]!;
 assert.equal(separate.legacy,"ESTABLISHED TRADITION");
 assert.equal(tournamentHeritage([
  record(1,1,"A"),record(2,2,"B"),record(3,3,"C")])[0]?.legacy,
  "ANNUAL FIXTURE");
});
test("history handles no championships, sparse ratings and independent divisions",()=>{
 const data=tournamentHeritage([record(1,1,null,{
  status:"ACTIVE",entrantsCount:4,finalRatingStars:null})]);
 assert.equal(data[0]?.completedEditions,0);
 assert.equal(data[0]?.latestChampion,null);
 assert.equal(data[0]?.lastFinalRatingStars,null);
 assert.equal(data[0]?.averageFinalRatingStars,null);
 assert.equal(data[0]?.mostWins,0);
 assert.deepEqual(tournamentHeritage([]),[]);
});
