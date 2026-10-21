import {test} from "node:test";import assert from "node:assert/strict";
import {currentWrestlerTitlesJoin,normaliseCurrentTitles} from "../src/db/current-wrestler-titles.js";
test("champion metadata is derived only from a current, active actual holder",()=>{
 assert.match(currentWrestlerTitlesJoin,/c\.current_reign_id/);
 assert.match(currentWrestlerTitlesJoin,/r\.status='ACTIVE'/);
 assert.match(currentWrestlerTitlesJoin,/r\.person_id=p\.person_id/);
 assert.match(currentWrestlerTitlesJoin,/tm\.person_id=p\.person_id AND tm\.active/);
 assert.match(currentWrestlerTitlesJoin,/LIMIT 6/);
});
test("vacant or unrecognised title metadata never fabricates champion status",()=>{
 assert.deepEqual(normaliseCurrentTitles(null),[]);
 assert.deepEqual(normaliseCurrentTitles([]),[]);
 assert.deepEqual(normaliseCurrentTitles(["World Championship"]),["World Championship"]);
 assert.equal(normaliseCurrentTitles(Array(20).fill("Title")).length,6);
});
