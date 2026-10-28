import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {settleWeeklyPromotionHealth} from "../src/db/weekly-finance-health.js";
import {recruitStrategicAiRosters,recruitDistressedAiRosters,
 settleLivingPromotionSurvival} from "../src/db/living-world-promotions.js";
import {balancedMarketAfterEvent} from "../src/domain/legacy-market-drift.js";
import {MeasuredQuerySession} from "../src/db/query-meter.js";

const url=process.env.PPW_NEON_TEST_URL;

/** Deterministic 156-week financial/roster stress scenario on DISPOSABLE
 * PostgreSQL. Financial and show-quality inputs are intentionally constructed
 * scenarios, not claims about live players or forecasts. Full show resolution,
 * playable two-human flow and organic career progression are tested elsewhere.
 * All mutations stay in the certified-week settlement functions under test.
 */
test("3 years: financially disciplined AI develops talent without poaching or taking human promotions",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const world="balance-3y-"+randomUUID(),db=postgresPool(url!,3);
 const humanA="manager-a-"+randomUUID(),humanB="manager-b-"+randomUUID();
 const promotions=["ai-workrate","ai-star","ai-crisis","human-a","human-b"];
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:world,name:"Three-year balance stress",seed:614,rulesetVersion:"test"});
   for(const id of promotions)await addPromotion(tx,world,{id,name:id,tier:"LOCAL"});
   await tx.query(`UPDATE ppw_promotions SET
    management_mode=CASE WHEN promotion_id LIKE 'ai-%' THEN 'AI' ELSE 'HUMAN' END,
    cash=CASE WHEN promotion_id='ai-crisis' THEN 8000 ELSE 100000 END,
    weekly_fixed_overhead=2000,
    weekly_media_income=CASE WHEN promotion_id='ai-crisis' THEN 0 ELSE 18000 END,
    weekly_sponsor_income=CASE WHEN promotion_id='ai-crisis' THEN 0 ELSE 3000 END,
    financial_distress='HEALTHY',last_weekly_net=0,
    event_cadence_weeks=2,
    ai_risk_tolerance=45,ai_match_quality_preference=
      CASE WHEN promotion_id='ai-workrate' THEN 92 ELSE 40 END,
    ai_star_preference=CASE WHEN promotion_id='ai-star' THEN 95 ELSE 35 END
    WHERE world_id=$1`,[world]);
   await tx.query("INSERT INTO ppw_players(player_id) VALUES($1),($2)",[humanA,humanB]);
   await tx.query(`INSERT INTO ppw_memberships(world_id,player_id,status)
    VALUES($1,$2,'ACTIVE'),($1,$3,'ACTIVE')`,[world,humanA,humanB]);
   await tx.query(`INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id)
    VALUES($1,$2,'human-a'),($1,$3,'human-b')`,[world,humanA,humanB]);
   const prospects=Array.from({length:80},(_,i)=>({
    id:"prospect-"+String(i).padStart(3,"0"),
    ring:i%2===0?92:37,craft:i%2===0?90:45,
    presentation:i%2===0?38:94,recognition:i%2===0?18:75,
    popularity:i%2===0?16:69
   }));
   await tx.query(`INSERT INTO ppw_people(world_id,person_id,name,status,
    career_stage,recognition,popularity,in_ring_quality,match_craft,
    presentation,contract_priorities)
    SELECT $1,x.id,x.id,'ACTIVE','PROSPECT',x.recognition,x.popularity,
     x.ring,x.craft,x.presentation,
     '{"money":8,"role":90,"prestige":30,"schedule":50,"loyalty":50,"exposure":100}'::jsonb
    FROM jsonb_to_recordset($2::jsonb)
     x(id text,ring integer,craft integer,presentation integer,
      recognition integer,popularity integer)`,
    [world,JSON.stringify(prospects)]);
  });
  const signingIds=new Set<string>();
  const countByPromotion=new Map<string,number>();
  const snapshots:{year:number;humanOwned:number;aiSigned:number;
   crisisStatus:string;incomeHealthy:boolean}[]=[];
  const meter=new MeasuredQuerySession("quarterly-ai-three-year-stress");
  let lastQuarter=0;
  for(let i=0;i<156;i++){
   const year=Math.floor(i/52)+1,week=i%52+1;
   const result=await withWorldTransaction(db.pool,async tx=>{
    // Each financial path has a known, repeatable cash-flow scenario; the
    // production finance classifier uses the actual current-week ledger.
    await tx.query(`WITH finance AS (
      SELECT promotion_id,
       CASE promotion_id
        WHEN 'ai-workrate' THEN 4000
        -- A mid-game 27-week advertising slump stops solvent AI expansion
        -- without arbitrarily confiscating cash, contracts or titles.
        WHEN 'ai-star' THEN CASE
         WHEN (($2-1)*52+$3-1) BETWEEN 52 AND 78 THEN -2200
         ELSE 2500 END
        WHEN 'ai-crisis' THEN -2300
        WHEN 'human-a' THEN -1900
        ELSE 500 END AS net
      FROM ppw_promotions WHERE world_id=$1
     ), bank AS (
      UPDATE ppw_promotions p SET cash=p.cash+f.net
      FROM finance f WHERE p.world_id=$1 AND p.promotion_id=f.promotion_id
      RETURNING p.promotion_id
     )
     INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)
     SELECT $1,$2,$3,'PROMOTION_RECURRING_FINANCES',
      jsonb_build_object('promotionId',f.promotion_id,'net',f.net)
     FROM finance f`,[world,year,week]);
    await settleWeeklyPromotionHealth(tx,world,year,week);
    await settleLivingPromotionSurvival(tx,world,year,week);
    await recruitDistressedAiRosters(tx,world,year,week);
    // At one quarter, measure all query payload and result bytes from the
    // new recruitment function itself, rather than counting unrelated writes.
    const recruiter=i===13?{query:<T extends Record<string,unknown>>(
     sql:string,args:readonly unknown[])=>meter.execute(()=>tx.query<T>(sql,args))
    }:tx;
    const hiring=await recruitStrategicAiRosters(recruiter,world,year,week);
    return hiring;
   });
   assert.ok(result.signed<=2,"Each solvent rival hires at most once this quarter");
   if(i%13===0&&i>0){
    const q=Math.floor(i/13);
    assert.ok(q>lastQuarter);lastQuarter=q;
   }
   if(week===52){
    const state=await withWorldTransaction(db.pool,tx=>tx.query<{
     promotion_id:string;cash:string;financial_distress:string;
     lifecycle:string;last_weekly_net:string
    }>(`SELECT promotion_id,cash::text,financial_distress,
       lifecycle,last_weekly_net::text FROM ppw_promotions
      WHERE world_id=$1 ORDER BY promotion_id`,[world]));
    const owners=await withWorldTransaction(db.pool,tx=>tx.query<{
     promotion_id:string;player_id:string
    }>(`SELECT promotion_id,player_id FROM ppw_promotion_controls
      WHERE world_id=$1 AND active ORDER BY promotion_id`,[world]));
    assert.deepEqual(owners.map(x=>x.promotion_id),["human-a","human-b"]);
    assert.deepEqual(owners.map(x=>x.player_id),[humanA,humanB]);
    const a=state.find(x=>x.promotion_id==="human-a")!;
    const b=state.find(x=>x.promotion_id==="human-b")!;
    assert.equal(a.lifecycle,"ACTIVE");
    assert.equal(b.lifecycle,"ACTIVE");
    assert.equal(state.find(x=>x.promotion_id==="ai-workrate")!.lifecycle,"ACTIVE");
    assert.equal(state.find(x=>x.promotion_id==="ai-star")!.lifecycle,"ACTIVE");
    assert.ok(["WATCH","DISTRESSED","CRISIS"].includes(a.financial_distress),
     "Persistent negative cash flow must materially affect manager finances");
    const signed=await withWorldTransaction(db.pool,tx=>tx.query<{
     contract_id:string;person_id:string;promotion_id:string;weekly_guarantee:string;
     role_expectation:string;
    }>(`SELECT contract_id,person_id,promotion_id,weekly_guarantee::text,
      role_expectation
      FROM ppw_contracts WHERE world_id=$1
       AND contract_id LIKE 'strategic:%' ORDER BY contract_id`,[world]));
    for(const x of signed){
     assert.ok(x.promotion_id==="ai-workrate"||x.promotion_id==="ai-star");
     if(signingIds.has(x.contract_id))continue; // prior-year signing
     signingIds.add(x.contract_id);
     countByPromotion.set(x.promotion_id,(countByPromotion.get(x.promotion_id)??0)+1);
     assert.ok(Number(x.weekly_guarantee)>0);
     assert.equal(x.role_expectation,"DEVELOPMENTAL",
      "AI talent-building deals introduce genuine young workers, not fictional star scores");
    }
    snapshots.push({year,humanOwned:owners.length,aiSigned:signingIds.size,
     crisisStatus:state.find(x=>x.promotion_id==="ai-crisis")!.financial_distress,
     incomeHealthy:["ai-workrate","ai-star"].every(p=>
      state.find(x=>x.promotion_id===p)?.financial_distress==="HEALTHY")});
   }
  }
  const measure=meter.assertBudget({maxQueries:6,maxResultBytes:90000});
  assert.ok(measure.queryCount>=4,"Real quarterly hire requires bounded SQL work");
  assert.ok(signingIds.size>=5,"The World should develop fresh contracted stars over years");
  for(const i of [52,65,78])assert.ok(![...signingIds].some(id=>
   id.startsWith("strategic:"+i+":ai-star:")),
   "A rival with actual weekly losses must pause automatic free-agent recruitment");
  assert.ok([...signingIds].some(id=>id.startsWith("strategic:91:ai-star:")),
   "Profitable weeks can restore strategic recruitment without a separate recovery job");
  assert.ok(signingIds.size<=22,"Two AI rivals cannot sign more than one per quarter");
  assert.ok(countByPromotion.has("ai-workrate")&&countByPromotion.has("ai-star"));
  assert.equal(snapshots.length,3);
  assert.ok(snapshots.every(s=>s.humanOwned===2&&s.incomeHealthy));
  assert.ok(snapshots[0]!.aiSigned<snapshots[2]!.aiSigned);
  console.log("PPW synthetic three-year AI/economy balance:",
   JSON.stringify({snapshots,signingsByPromotion:Object.fromEntries(countByPromotion),
    quarterlyNeonBudget:measure}));
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_ledger_events","ppw_promotion_talent_trust",
    "ppw_promotion_survival","ppw_contracts","ppw_promotion_controls",
    "ppw_memberships","ppw_people","ppw_promotions"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[world]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=ANY($1::text[])",
    [[humanA,humanB]]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>db.close());
 }
});

test("three-year rivalry markets change in opposite directions from actual quality and ticket demand",()=>{
 const start={awareness:35,liveStrength:45,loyalty:52};
 let crowdLeader={...start},struggling={...start};
 const checkpoints:{week:number;leader:number;struggling:number}[]=[];
 for(let i=0;i<156;i++){
  const quarterMajor=i%13===12;
  crowdLeader=balancedMarketAfterEvent(crowdLeader,{
   eventType:quarterMajor?"MAJOR":"REGULAR",isHomeMarket:true,
   expectedDemand:1000,attendance:1050,capacity:1100,
   averageMatchRating:4.2,crowdResponse:85});
  struggling=balancedMarketAfterEvent(struggling,{
   eventType:quarterMajor?"MAJOR":"REGULAR",isHomeMarket:true,
   expectedDemand:1000,attendance:270,capacity:1100,
   averageMatchRating:1.8,crowdResponse:35});
  if((i+1)%52===0)checkpoints.push({week:i+1,leader:crowdLeader.liveStrength,
   struggling:struggling.liveStrength});
 }
 assert.equal(checkpoints.length,3);
 assert.ok(checkpoints[0]!.leader>checkpoints[0]!.struggling);
 assert.ok(checkpoints[2]!.leader>checkpoints[2]!.struggling);
 assert.ok(crowdLeader.loyalty>struggling.loyalty);
 assert.ok(crowdLeader.awareness>start.awareness);
 console.log("PPW synthetic three-year territorial-rivalry evidence:",
  JSON.stringify(checkpoints));
});
