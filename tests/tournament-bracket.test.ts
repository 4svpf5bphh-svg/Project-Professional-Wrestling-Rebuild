import assert from "node:assert/strict";
import test from "node:test";
import {seededSemifinals,verifiedTournamentWinner,isTournamentBoutNo}
 from "../src/domain/tournament-bracket.js";
test("seeded four-person tournament produces stable genuine semifinal pairings",()=>{
 assert.deepEqual(seededSemifinals(["a","b","c","d"]),[["a","d"],["b","c"]]);
 assert.throws(()=>seededSemifinals(["a","a","c","d"]),/four distinct/);
 assert.ok(isTournamentBoutNo(3));
 assert.equal(isTournamentBoutNo(4),false);
});
test("only a certified bracket-side winner advances, never guessed from a script",()=>{
 const side=[{sideId:"A",personIds:["d"]},{sideId:"B",personIds:["a"]}];
 assert.deepEqual(verifiedTournamentWinner("a","d",side,"A"),{winner:"d",loser:"a"});
 assert.deepEqual(verifiedTournamentWinner("a","d",side,"B"),{winner:"a",loser:"d"});
 assert.throws(()=>verifiedTournamentWinner("a","d",side,null),/Certified/);
 assert.throws(()=>verifiedTournamentWinner("a","d",
  [{sideId:"A",personIds:["a"]},{sideId:"B",personIds:["c"]}],"A"),/Certified/);
});
