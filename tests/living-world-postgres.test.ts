import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {settleLivingWrestlerCareers} from "../src/db/living-world-career-settlement.js";
import {settleLivingMorale,settleAnnualLivingTalentTrust}
 from "../src/db/living-world-morale.js";
import {settleLivingPromotionSurvival,settleAnnualPromotionScale}
 from "../src/db/living-world-promotions.js";
import {validatePortablePersona} from "../src/domain/portable-persona.js";
import {MeasuredQuerySession} from "../src/db/query-meter.js";
const url=process.env.PPW_NEON_TEST_URL;
/** This is a disposable 156-week relational lifecycle replay, not a mock
 * player session. Existing certified-card and World Lock suites independently
 * cover match authorship, simultaneous managers, finish and replay guarantees.
 */
test("two independently owned promotions survive 26/52 weeks and 3 years of evolving talent",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const db=postgresPool(url!,3),world="living-"+randomUUID();
 const players=["human-1-"+randomUUID(),"human-2-"+randomUUID()];
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:world,name:"Disposable Living World",seed:67,rulesetVersion:"test"});
   await tx.query(`INSERT INTO ppw_markets(world_id,market_id,name,
    audience_potential,wrestling_interest,spending_index)
    VALUES($1,'territory','Territory',65,70,100)`,[world]);
   for(const [id,tier] of [["human-one","LOCAL"],["human-two","INDEPENDENT"],
    ["computer","LOCAL"]] as const)await addPromotion(tx,world,{
     id,name:id,tier});
   await tx.query(`UPDATE ppw_promotions SET
    home_market_id='territory',management_mode=CASE WHEN promotion_id='computer'
     THEN 'AI' ELSE 'HUMAN' END,
    event_cadence_weeks=2,weekly_fixed_overhead=12000,
    weekly_media_income=0,weekly_sponsor_income=0,
    financial_distress='CRISIS',cash=0,media_reach=20
    WHERE world_id=$1`,[world]);
   await tx.query(`UPDATE ppw_worlds SET talent_population_target=24
    WHERE world_id=$1`,[world]);
   for(const player of players){
    await tx.query("INSERT INTO ppw_players(player_id) VALUES($1)",[player]);
    await tx.query(`INSERT INTO ppw_memberships(world_id,player_id,status)
     VALUES($1,$2,'ACTIVE')`,[world,player]);
   }
   await tx.query(`INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id)
    VALUES($1,$2,'human-one'),($1,$3,'human-two')`,[world,...players]);
   await tx.query(`INSERT INTO ppw_promotion_market_states(world_id,promotion_id,market_id,
    awareness,live_strength,loyalty)
    SELECT world_id,promotion_id,'territory',40,35,30 FROM ppw_promotions
    WHERE world_id=$1`,[world]);
   const people=Array.from({length:24},(_,i)=>({id:"living-person-"+i,
    name:"Veteran "+i,age:i<20?74:25,experience:i<20?80:25,
    wear:i<20?98:8,popularity:i<20?25:18,recognition:i<20?30:15,
    stage:i<20?"VETERAN":"PRIME",
    promotion:i<12?"human-one":i<22?"human-two":"computer"}));
   await tx.query(`
    INSERT INTO ppw_people(world_id,person_id,name,career_stage,
     biological_age,career_experience,development_aptitude,
     popularity,recognition,wear,fatigue,morale,momentum,
     in_ring_quality,match_craft,presentation,stamina,safety,
     contract_priorities,status)
    SELECT $1,x.id,x.name,x.stage,x.age,x.experience,70,
     x.popularity,x.recognition,x.wear,0,62,45,65,65,65,70,70,
     '{"money":50,"role":50,"prestige":50,"schedule":50,"loyalty":50,"exposure":50}'::jsonb,
     'ACTIVE'
    FROM jsonb_to_recordset($2::jsonb) x(
     id text,name text,stage text,age double precision,experience double precision,
     popularity double precision,recognition double precision,wear double precision)`,
    [world,JSON.stringify(people)]);
   await tx.query(`
    INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,
     status,family,start_week_index,expires_week_index,weekly_guarantee,
     remaining_dates,role_expectation)
    SELECT $1,'contract-'||x.id,x.id,x.promotion,'SIGNED','EXCLUSIVE',0,255,
     1000,NULL,'REGULAR'
    FROM jsonb_to_recordset($2::jsonb) x(id text,promotion text)`,
    [world,JSON.stringify(people)]);
  });
  let generated=0,retired=0;
  const measured=new MeasuredQuerySession("certified-living-world-week");
  for(let index=0;index<156;index++){
   const year=Math.floor(index/52)+1,week=index%52+1;
   const output=await withWorldTransaction(db.pool,async tx=>{
    const measuredTx=index===1?{
     query:<T extends Record<string,unknown>>(sql:string,args:readonly unknown[])=>
      measured.execute(()=>tx.query<T>(sql,args))
    }:tx;
    const survival=await settleLivingPromotionSurvival(measuredTx,world,year,week);
    const careers=await settleLivingWrestlerCareers(measuredTx,world,year,week);
    await settleLivingMorale(measuredTx,world,year,week);
    if(week===52){
     await settleAnnualLivingTalentTrust(measuredTx,world,year,week);
     await settleAnnualPromotionScale(measuredTx,world,year,week);
    }
    return {survival,careers};
   });
   retired+=output.careers.retired;generated+=output.careers.generated;
   if(index===25||index===51||index===155){
    const progress=await withWorldTransaction(db.pool,tx=>tx.query<{
     active:number;generated:number;retired:number;owned:number;dormant:number
    }>(`
     SELECT
      (SELECT count(*)::integer FROM ppw_people
       WHERE world_id=$1 AND status<>'RETIRED') AS active,
      (SELECT count(*)::integer FROM ppw_people
       WHERE world_id=$1 AND generated_talent) AS generated,
      (SELECT count(*)::integer FROM ppw_people
       WHERE world_id=$1 AND status='RETIRED') AS retired,
      (SELECT count(*)::integer FROM ppw_promotion_controls
       WHERE world_id=$1 AND active) AS owned,
      (SELECT count(*)::integer FROM ppw_promotions
       WHERE world_id=$1 AND lifecycle='DORMANT') AS dormant`,[world]));
    assert.equal(progress[0]!.owned,2,"Neither human manager can be deposed");
    assert.ok(progress[0]!.active>=23,"Two prospects restore original 96% floor");
    if(index===155){
     assert.ok(progress[0]!.retired>0,"Old and worn careers change over multiple years");
     assert.ok(progress[0]!.generated>0,"Fictional next generation replaces veterans");
     assert.equal(progress[0]!.dormant,1,"AI insolvency can suspend operations");
    }
   }
  }
  const metrics=measured.assertBudget({maxQueries:12,maxResultBytes:24000});
  console.log("PPW 24-person certified career/morale SQL measurement: "+JSON.stringify(metrics));
  assert.ok(metrics.queryCount>=4,"One measured World week does actual relational work");
  assert.ok(generated>=1&&retired>=1);
  const status=await withWorldTransaction(db.pool,tx=>tx.query<{
   person_id:string;name:string;persona:unknown;gimmick:string;
  }>(`SELECT p.person_id,p.name,persona.persona,p.portable_gimmick_id AS gimmick
    FROM ppw_people p JOIN ppw_portable_personas persona
     ON persona.world_id=p.world_id AND persona.person_id=p.person_id
    WHERE p.world_id=$1 AND p.generated_talent ORDER BY p.person_id`,[world]));
  assert.equal(status.length,generated);
  for(const row of status){
   const identity=validatePortablePersona(row.persona,row.name);
   assert.equal(identity.gimmickId,row.gimmick);
   assert.ok(identity.signatureMoves.length>0&&identity.finishingMoves.length>0);
   assert.ok(identity.primaryStyle);
  }
  const publicEvents=await withWorldTransaction(db.pool,tx=>tx.query<{
   event_type:string;n:number
  }>(`SELECT event_type,count(*)::integer AS n FROM ppw_ledger_events
   WHERE world_id=$1 GROUP BY event_type`,[world]));
  const news=new Map(publicEvents.map(x=>[x.event_type,x.n]));
  assert.ok((news.get("WRESTLER_RETIRED")??0)>=1);
  assert.ok((news.get("WRESTLER_DEBUTED")??0)>=1);
  assert.ok((news.get("PROMOTION_ENTERED_DORMANCY")??0)>=1);
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const name of [
    "ppw_promotion_talent_trust","ppw_promotion_survival","ppw_ledger_events",
    "ppw_portable_persona_history","ppw_portable_personas",
    "ppw_contract_renewal_proposals","ppw_contract_offers","ppw_contracts",
    "ppw_medical_absences","ppw_tag_team_members","ppw_people",
    "ppw_promotion_controls","ppw_memberships",
    "ppw_promotion_market_states","ppw_promotions","ppw_markets"])
    await tx.query("DELETE FROM "+name+" WHERE world_id=$1",[world]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=ANY($1::text[])",[players]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>db.close());
 }
});
