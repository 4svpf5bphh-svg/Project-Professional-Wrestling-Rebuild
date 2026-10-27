import assert from "node:assert/strict";
import test from "node:test";
import {seededSemifinals,verifiedTournamentWinner,isTournamentBoutNo,
 tournamentOpeningPairings,tournamentInitialBouts,tournamentBoutLabel,
 tournamentAdvancement,tournamentFinalBoutNo}
 from "../src/domain/tournament-bracket.js";
test("seeded four-person tournament produces stable genuine semifinal pairings",()=>{
 assert.deepEqual(seededSemifinals(["a","b","c","d"]),[["a","d"],["b","c"]]);
 assert.throws(()=>seededSemifinals(["a","a","c","d"]),/four distinct/);
 assert.ok(isTournamentBoutNo(3));
 assert.equal(isTournamentBoutNo(0),false);
 assert.equal(isTournamentBoutNo(8),false);
});
test("only a certified bracket-side winner advances, never guessed from a script",()=>{
 const side=[{sideId:"A",personIds:["d"]},{sideId:"B",personIds:["a"]}];
 assert.deepEqual(verifiedTournamentWinner("a","d",side,"A"),{winner:"d",loser:"a"});
 assert.deepEqual(verifiedTournamentWinner("a","d",side,"B"),{winner:"a",loser:"d"});
 assert.throws(()=>verifiedTournamentWinner("a","d",side,null),/Certified/);
 assert.throws(()=>verifiedTournamentWinner("a","d",
  [{sideId:"A",personIds:["a"]},{sideId:"B",personIds:["c"]}],"A"),/Certified/);
});

test("eight entrants preserve seeded halves and unlock 5,6 then 7 without byes",()=>{
 const people=["a","b","c","d","e","f","g","h"];
 assert.deepEqual(tournamentOpeningPairings(people),
  [["a","h"],["d","e"],["b","g"],["c","f"]]);
 assert.deepEqual(tournamentInitialBouts(people),[
  {n:1,a:"a",b:"h"},{n:2,a:"d",b:"e"},
  {n:3,a:"b",b:"g"},{n:4,a:"c",b:"f"},
  {n:5,a:null,b:null},{n:6,a:null,b:null},{n:7,a:null,b:null}
 ]);
 assert.deepEqual(tournamentAdvancement(8),[[1,2,5],[3,4,6],[5,6,7]]);
 assert.deepEqual(tournamentAdvancement(4),[[1,2,3]]);
 assert.deepEqual(tournamentInitialBouts(people.slice(0,4)),[
  {n:1,a:"a",b:"d"},{n:2,a:"b",b:"c"},{n:3,a:null,b:null}
 ]);
 assert.equal(tournamentFinalBoutNo(8),7);
 assert.equal(tournamentFinalBoutNo(4),3);
 assert.equal(tournamentBoutLabel(8,4),"Quarterfinal 4");
 assert.equal(tournamentBoutLabel(8,5),"Semifinal 1");
 assert.equal(tournamentBoutLabel(8,7),"Final");
 assert.ok(isTournamentBoutNo(7));
 assert.equal(isTournamentBoutNo(8),false);
 assert.throws(()=>tournamentInitialBouts(["a","b","c","d","a","f","g","h"]),
  /four or eight distinct/);
});
