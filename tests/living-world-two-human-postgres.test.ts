import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {advanceResolvedWorldWeek} from "../src/db/week-advancement.js";
const url=process.env.PPW_NEON_TEST_URL;
/** 26 consecutive certified World publications with two competing humans,
 * genuine submitted and immutable completed singles matches. Results and
 * winners are player-authored, while careers, morale and cash advance once.
 * This complements separate canonical resolver/World Lock replay tests.
 */
test("26 certified weeks: two human bookers retain ownership, authored winners and evolving talent",{
 skip:!url?"No disposable PostgreSQL":false,
},async()=>{
 const db=postgresPool(url!,3),world="living-two-"+randomUUID();
 const players=["human-a-"+randomUUID(),"human-b-"+randomUUID()];
 const promotions=["human-a","human-b"] as const;
 const ids=(promo:string)=>[promo+"-lead",promo+"-opponent",promo+"-benched"];
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:world,name:"26-week Living World",seed:372,rulesetVersion:"test"});
   for(const promotion of promotions){
    await addPromotion(tx,world,{id:promotion,name:promotion,tier:"LOCAL"});
   }
   await tx.query(`UPDATE ppw_promotions SET
    cash=5000000,weekly_media_income=10000,weekly_sponsor_income=0,
    weekly_fixed_overhead=1000,financial_distress='HEALTHY',
    event_cadence_weeks=1,media_reach=40
    WHERE world_id=$1`,[world]);
   for(let i=0;i<players.length;i++){
    await tx.query(`INSERT INTO ppw_players(player_id) VALUES($1)`,[players[i]]);
    await tx.query(`INSERT INTO ppw_memberships(world_id,player_id,status)
     VALUES($1,$2,'ACTIVE')`,[world,players[i]]);
    await tx.query(`INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id)
     VALUES($1,$2,$3)`,[world,players[i],promotions[i]]);
   }
   await tx.query(`INSERT INTO ppw_venues(world_id,venue_id,name)
    VALUES($1,'arena-a','A'),($1,'arena-b','B')`,[world]);
   const people=promotions.flatMap(p=>ids(p).map((id,j)=>({
    id,promo:p,role:j===2?"MAIN_EVENT":"REGULAR"})));
   await tx.query(`
    INSERT INTO ppw_people(world_id,person_id,name,status,career_stage,
     biological_age,career_experience,development_aptitude,wear,
     recognition,popularity,momentum,fatigue,morale,
     in_ring_quality,match_craft,presentation,stamina,safety,
     contract_priorities,booking_division)
    SELECT $1,x.id,x.id,'ACTIVE','PRIME',29,35,88,0,30,30,50,0,75,
     55,55,55,72,68,'{"money":50,"role":60,"prestige":50,
      "schedule":50,"loyalty":50,"exposure":50}'::jsonb,'MEN'
    FROM jsonb_to_recordset($2::jsonb) x(id text)`,
    [world,JSON.stringify(people)]);
   await tx.query(`
    INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,
     status,family,start_week_index,expires_week_index,remaining_dates,
     date_entitlement,weekly_guarantee,role_expectation)
    SELECT $1,'deal-'||x.id,x.id,x.promo,'SIGNED','EXCLUSIVE',
     0,100,NULL,80,100,x.role
    FROM jsonb_to_recordset($2::jsonb) x(id text,promo text,role text)`,
    [world,JSON.stringify(people)]);
  });
  // One owner's Week 7 card is saved six weeks ahead, retaining an authored finish.
  // The actual certified World publications must never delete or rewrite it.
  const futureShow="human-a-show-7",futureMatch="human-a-match-7";
  const futureCast=ids("human-a").slice(0,2).map(personId=>({
   personId,contractId:"deal-"+personId
  }));
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query(`
    INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,
     year,week,status,show_day,venue_id)
    VALUES($1,$2,'human-a',1,7,'DRAFT',1,'arena-a')`,
    [world,futureShow]);
   await tx.query(`
    INSERT INTO ppw_card_slots(world_id,draft_id,slot_id,
     position,kind,payload)
    VALUES($1,$2,$3,0,'MATCH',$4::jsonb)`,
    [world,futureShow,futureMatch,JSON.stringify({
     matchType:"SINGLES",participants:futureCast,
     scriptedWinner:"human-a-lead",plannedFinish:"PIN_FALL"
    })]);
  });
  const before=await withWorldTransaction(db.pool,tx=>tx.query<{
   person_id:string;in_ring_quality:number;morale:number
  }>(`SELECT person_id,in_ring_quality,morale FROM ppw_people
   WHERE world_id=$1 ORDER BY person_id`,[world]));
  const original=new Map(before.map(p=>[p.person_id,p]));
  for(let i=0;i<26;i++){
   const week=i+1;
   await withWorldTransaction(db.pool,async tx=>{
    await tx.query(`UPDATE ppw_worlds SET phase='RESOLVING',year=1,week=$2,
     day=7,next_lock_at=clock_timestamp()-interval '1 minute'
     WHERE world_id=$1`,[world,week]);
    const shows=promotions.map((promo,j)=>({
     id:promo+"-show-"+week,promo,
     venue:j===0?"arena-a":"arena-b",day:j+1,
     match:promo+"-match-"+week,participants:ids(promo).slice(0,2),
     winner:ids(promo)[j]!
    }));
    for(const show of shows){
     const fromAdvancePlanner=week===7&&show.promo==="human-a";
     if(fromAdvancePlanner){
      const preserved=await tx.query<{draft_id:string}>(`
       UPDATE ppw_booking_drafts SET status='SUBMITTED'
        WHERE world_id=$1 AND draft_id=$2 AND status='DRAFT'
        RETURNING draft_id`,[world,futureShow]);
      assert.equal(preserved.length,1,
       "Week 7 must use the pre-authored draft after six certified publications");
      const booked=await tx.query<{payload:{scriptedWinner:string}}>(`
       SELECT payload FROM ppw_card_slots
        WHERE world_id=$1 AND draft_id=$2 AND slot_id=$3`,
       [world,futureShow,futureMatch]);
      assert.equal(booked[0]?.payload.scriptedWinner,show.winner,
       "Pre-booked winner survives weekly progression unchanged");
     }else{
      await tx.query(`
       INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,
        year,week,status,show_day,venue_id)
       VALUES($1,$2,$3,1,$4,'SUBMITTED',$5,$6)`,
       [world,show.id,show.promo,week,show.day,show.venue]);
      const participants=show.participants.map(id=>({
       personId:id,contractId:"deal-"+id}));
      await tx.query(`
       INSERT INTO ppw_card_slots(world_id,draft_id,slot_id,
        position,kind,payload)
       VALUES($1,$2,$3,0,'MATCH',$4::jsonb)`,
       [world,show.id,show.match,JSON.stringify({
        matchType:"SINGLES",participants,
        scriptedWinner:show.winner,plannedFinish:"PIN_FALL"
       })]);
     }
     await tx.query(`
      INSERT INTO ppw_show_resolutions(world_id,show_id,promotion_id,
       resolved_week_index,command_request_id,performers_count,dates_charged,
       appearance_person_ids)
      VALUES($1,$2,$3,$4,$5,2,2,$6::jsonb)`,
      [world,show.id,show.promo,i,"resolved:"+show.id,
       JSON.stringify(show.participants)]);
     await tx.query(`
      INSERT INTO ppw_completed_shows(world_id,promotion_id,show_id,
       year,week,resolution_id,crowd_response,receipt_json,receipt_digest)
      VALUES($1,$2,$3,1,$4,$5,76,'{}'::jsonb,repeat('a',64))`,
      [world,show.promo,show.id,week,"receipt:"+show.id]);
     await tx.query(`
      INSERT INTO ppw_completed_show_matches(world_id,show_id,match_id,
       position,crowd_response,actual_finish,actual_winner_side)
      VALUES($1,$2,$3,0,75,'PIN_FALL',$4)`,
      [world,show.id,show.match,show.winner===show.participants[0]?"A":"B"]);
     await tx.query(`
      INSERT INTO ppw_completed_match_report_facts(world_id,show_id,match_id,
       rating_stars,execution_quality,chemistry_modifier,actual_minutes)
      VALUES($1,$2,$3,4.25,76,0,16)`,[world,show.id,show.match]);
    }
    await tx.query(`
     INSERT INTO ppw_week_resource_clearances(world_id,year,week,
      eligible_promotions,inspected_slots,command_request_id)
     VALUES($1,1,$2,2,2,$3)`,
     [world,week,"clear-"+week]);
    await tx.query(`
     INSERT INTO ppw_week_resolution_seals(world_id,year,week,certified_promotions)
     VALUES($1,1,$2,2)`,[world,week]);
   });
   const input={worldId:world,requestId:"publish-"+week,expectedRevision:i};
   if(i===25){
    const concurrent=await Promise.all([
     advanceResolvedWorldWeek(db.pool,input),
     advanceResolvedWorldWeek(db.pool,{...input,requestId:"opponent-publish-"+week})]);
    assert.equal(concurrent.filter(r=>r.status==="APPLIED").length,1);
    assert.equal(concurrent.filter(r=>r.status==="STALE").length,1);
   }else{
    const result=await advanceResolvedWorldWeek(db.pool,input);
    assert.equal(result.status,"APPLIED","Verified week "+week+" must publish once");
    if(i===0)assert.equal((await advanceResolvedWorldWeek(db.pool,input)).status,
     "REPLAYED","An existing receipt cannot publish the same week twice");
   }
   if(i===0||i===5){
    const preserved=await withWorldTransaction(db.pool,tx=>tx.query<{
     status:string;scripted_winner:string}>(`
      SELECT d.status,s.payload->>'scriptedWinner' AS scripted_winner
       FROM ppw_booking_drafts d JOIN ppw_card_slots s
       ON s.world_id=d.world_id AND s.draft_id=d.draft_id
       WHERE d.world_id=$1 AND d.draft_id=$2`,
      [world,futureShow]));
    assert.deepEqual(preserved,[{status:"DRAFT",scripted_winner:"human-a-lead"}],
     "Week 7 retains its authored winner and card across certified World publications");
   }
  }
  const state=await withWorldTransaction(db.pool,async tx=>{
   const clock=await tx.query<{year:number;week:number;phase:string;revision:string}>(`
    SELECT year,week,phase,revision FROM ppw_worlds WHERE world_id=$1`,[world]);
   const people=await tx.query<{person_id:string;in_ring_quality:number;
    career_experience:number;biological_age:number;morale:number}>(`
    SELECT person_id,in_ring_quality,career_experience,biological_age,morale
    FROM ppw_people WHERE world_id=$1 ORDER BY person_id`,[world]);
   const matches=await tx.query<{show_id:string;actual_winner_side:string;
    actual_finish:string}>(`SELECT show_id,actual_winner_side,actual_finish
    FROM ppw_completed_show_matches WHERE world_id=$1`,[world]);
   const controls=await tx.query<{promotion_id:string;player_id:string}>(`
    SELECT promotion_id,player_id FROM ppw_promotion_controls
    WHERE world_id=$1 AND active ORDER BY promotion_id`,[world]);
   return {clock:clock[0]!,people,matches,controls};
  });
  assert.equal(state.clock.year,1);
  assert.equal(state.clock.week,27);
  assert.equal(state.clock.phase,"OPEN");
  assert.equal(Number(state.clock.revision),26);
  assert.equal(state.controls.length,2);
  assert.equal(new Set(state.controls.map(x=>x.player_id)).size,2);
  assert.equal(state.matches.length,52);
  for(const p of promotions){
   const workers=ids(p);
   assert.ok(state.people.find(x=>x.person_id===workers[0])!.in_ring_quality>
    original.get(workers[0]!)!.in_ring_quality,"Verified singles experience develops skill");
   assert.ok(state.people.find(x=>x.person_id===workers[0])!.career_experience>35);
   assert.ok(state.people.find(x=>x.person_id===workers[0])!.biological_age>29);
   assert.ok(state.people.find(x=>x.person_id===workers[2])!.morale<
    original.get(workers[2]!)!.morale,"Unused main-event talent loses morale");
   for(let w=1;w<=26;w++){
    const match=state.matches.find(x=>x.show_id===p+"-show-"+w);
    assert.equal(match?.actual_winner_side,p==="human-a"?"A":"B");
    assert.equal(match?.actual_finish,"PIN_FALL");
   }
  }
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   // Only this disposable World, ordered by foreign-key dependencies.
   for(const table of [
    "ppw_ledger_events","ppw_promotion_talent_trust",
    "ppw_promotion_survival","ppw_completed_match_report_facts",
    "ppw_completed_match_evidence","ppw_completed_show_matches",
    "ppw_completed_show_segments","ppw_completed_shows",
    "ppw_week_resolution_seals","ppw_week_resource_clearances",
    "ppw_show_resolutions","ppw_command_receipts",
    "ppw_backstage_requests","ppw_booking_drafts",
    "ppw_contract_renewal_proposals","ppw_contract_offers",
    "ppw_contracts","ppw_promotion_controls","ppw_memberships",
    "ppw_people","ppw_venues","ppw_promotions"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[world]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=ANY($1::text[])",[players]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>db.close());
 }
});
