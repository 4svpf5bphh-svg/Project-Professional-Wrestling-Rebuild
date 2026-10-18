import test from "node:test";
import assert from "node:assert/strict";
import {venuePressureCount,freeVenueDays} from "../src/ui/planner-venue-pressure.js";
import type {PlannerView} from "../src/db/planner-workspace.js";

test("venue interest stays day, building and week specific, including year rollover",()=>{
 const view={venuePressure:[
  {year:1,week:52,day:6,venueId:"arena",otherPromotions:2},
  {year:2,week:1,day:1,venueId:"arena",otherPromotions:1},
  {year:2,week:1,day:6,venueId:"hall",otherPromotions:3}
 ]} as PlannerView;
 assert.equal(venuePressureCount(view,1,52,6,"arena"),2);
 assert.equal(venuePressureCount(view,2,1,1,"arena"),1);
 assert.equal(venuePressureCount(view,2,1,6,"arena"),0);
 assert.equal(venuePressureCount(view,2,1,6,"hall"),3);
 assert.deepEqual(freeVenueDays(view,2,1,"arena"),[2,3,4,5,6,7]);
});
