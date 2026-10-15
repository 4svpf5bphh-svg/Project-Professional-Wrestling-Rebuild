import assert from "node:assert/strict";
import test from "node:test";
import {planResourceArbitration,type ResourceClaim} from "../src/domain/resource-arbitration.js";

const base={worldId:"fairness-world",worldSeed:"123",year:3,week:27};
const wrestler=(promotionId:string,showId:string,day:number,weeklyCapacity=2):ResourceClaim=>({
  kind:"WRESTLER",resourceId:"shared-star",promotionId,showId,day,weeklyCapacity,
});
const venue=(promotionId:string,showId:string,day=3):ResourceClaim=>({
  kind:"VENUE",resourceId:"one-arena",promotionId,showId,day,
});
test("resource draws use server seed, not submission order or mutable show ID",()=>{
  const claims=[venue("A","a"),venue("B","b"),venue("C","c"),
    wrestler("A","a",3),wrestler("B","b",3),wrestler("C","c",4)];
  const a=planResourceArbitration(base,claims);
  assert.equal(a.outcomes.filter(x=>x.kind==="VENUE").length,2);
  assert.equal(a.outcomes.filter(x=>x.kind==="WRESTLER").length,1);
  assert.deepEqual(a,planResourceArbitration(base,[...claims].reverse()));
  assert.deepEqual(a,planResourceArbitration(base,[claims[3]!,claims[5]!,claims[1]!,
    claims[0]!,claims[4]!,claims[2]!]));
  const changedIds=claims.map(c=>({...c,showId:"different-"+c.showId}));
  const changed=planResourceArbitration(base,changedIds);
  assert.deepEqual(changed.outcomes.map(x=>x.denied.promotionId),a.outcomes.map(x=>x.denied.promotionId));
  assert.notEqual(changed.fingerprint,a.fingerprint);
});
test("different-day engagements are allowed until weekly capacity is exhausted",()=>{
  const three=[wrestler("A","a",2,3),wrestler("B","b",3,3),wrestler("C","c",4,3)];
  assert.equal(planResourceArbitration(base,three).outcomes.length,0);
  const limited=three.map(c=>({...c,weeklyCapacity:2}));
  const plan=planResourceArbitration(base,limited);
  assert.equal(plan.outcomes.length,1);
  assert.equal(plan.outcomes[0]!.reason,"WEEKLY_CAPACITY");
  assert.equal(plan.outcomes[0]!.protected.length,2);
  assert.deepEqual(plan,planResourceArbitration(base,limited.slice().reverse()));
});
test("same-day collisions are distinct from weekly capacity",()=>{
  const candidates=[wrestler("A","a",2,1),wrestler("B","b",2,1),
    wrestler("C","c",5,1)];
  const plan=planResourceArbitration(base,candidates);
  assert.equal(plan.outcomes.length,2);
  assert.ok(plan.outcomes.some(x=>x.reason==="SAME_DAY"||x.reason==="WEEKLY_CAPACITY"));
  assert.deepEqual(plan,planResourceArbitration(base,candidates.slice().reverse()));
});
test("ties rotate across World week/seed, rather than permanently favour a promotion",()=>{
  const candidates=[venue("A","a"),venue("B","b")];
  const winners=new Set<string>();
  for(let week=1;week<=52;week++){
    const loss=planResourceArbitration({...base,week},candidates).outcomes[0]!;
    winners.add(loss.protected[0]!.promotionId);
  }
  assert.deepEqual([...winners].sort(),["A","B"]);
});
test("invalid, duplicate or inconsistent claims fail closed",()=>{
  assert.throws(()=>planResourceArbitration(base,[wrestler("A","a",3,1),wrestler("A","b",4,1)]),/Duplicate/);
  assert.throws(()=>planResourceArbitration(base,[wrestler("A","a",3,1),wrestler("B","b",4,2)]),/Inconsistent/);
  assert.throws(()=>planResourceArbitration(base,[venue("A","a",8)]),/Invalid/);
});
