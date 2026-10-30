import test from "node:test";
import assert from "node:assert/strict";
import {PROMOTER_ACHIEVEMENT_DEFINITIONS,PROMOTER_ACHIEVEMENT_CATEGORIES,
 EMPTY_PROMOTER_COUNTERS,derivePromoterAchievements}
 from "../src/domain/promoter-achievements.js";

test("Trophy Room has 47 distinct certified achievements across six categories",()=>{
 const defs=PROMOTER_ACHIEVEMENT_DEFINITIONS;
 assert.equal(defs.length,47);
 assert.equal(new Set(defs.map(a=>a.key)).size,defs.length);
 assert.equal(new Set(defs.map(a=>a.category)).size,6);
 assert.equal(Object.keys(PROMOTER_ACHIEVEMENT_CATEGORIES).length,6);
 for(const d of defs){
  assert.ok(d.description.length>14&&d.target>0&&d.unit.length>0);
  assert.ok(d.key===d.key.toUpperCase());
 }
});
test("Promoter prestige is earned from facts; purchases never affect it",()=>{
 const empty=derivePromoterAchievements(EMPTY_PROMOTER_COUNTERS);
 assert.equal(empty.earnedCount,0);
 assert.equal(empty.rank,"ROOKIE BOOKER");
 assert.ok(empty.achievements.every(a=>!a.earned&&a.percent===0));
 const progressed=derivePromoterAchievements({
  ...EMPTY_PROMOTER_COUNTERS,shows:7,premiumShows:1,liveSegments:3,
  greatMatches:2,profitableShows:2,totalAttendance:1020
 });
 assert.equal(progressed.achievements.find(a=>a.key==="FIRST_BELL")?.earned,true);
 assert.equal(progressed.achievements.find(a=>a.key==="TEN_SHOWS")?.percent,70);
 assert.equal(progressed.achievements.find(a=>a.key==="FIRST_CLASSIC")?.earned,true);
 assert.equal(progressed.achievements.find(a=>a.key==="PREMIUM_PROFIT")?.earned,false);
 assert.ok(progressed.prestigeScore>0&&progressed.earnedCount>0);
 const later=derivePromoterAchievements({...EMPTY_PROMOTER_COUNTERS,shows:1000,
  premiumShows:100,liveSegments:100,hotSegments:100,
  greatMatches:100,excellentMatches:100,fiveStarMatches:50,
  profitableShows:200,profitablePremiumShows:50,hotShows:100,
  totalAttendance:1000000,rivalriesStarted:100,rivalriesConcluded:100,
  titleDefences:100,completedTitleReigns:100});
 assert.equal(later.earnedCount,later.total);
 assert.equal(later.rank,"HALL OF FAME");
 assert.ok(later.achievements.every(a=>a.progress===a.target&&a.percent===100));
});
