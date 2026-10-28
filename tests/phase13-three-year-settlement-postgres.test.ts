
import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {recordCompletedShow} from "../src/db/completed-show-results.js";
import {settleCompletedShowEconomics} from "../src/db/show-economics.js";
import {settleWeekLocalMarkets} from "../src/db/market-response.js";
import {settleRecurringWorldFinances} from "../src/db/weekly-recurring-finances.js";
import {settleCommercialWorldWeek} from "../src/db/weekly-commercial-settlement.js";
import {settleWeeklyPromotionHealth} from "../src/db/weekly-finance-health.js";
import {settleLivingPromotionSurvival,settleAnnualPromotionScale,
 recruitStrategicAiRosters,recruitDistressedAiRosters} from "../src/db/living-world-promotions.js";
import {originalExpectedDemand,originalTicketYield,
 type TicketStrategy} from "../src/domain/legacy-show-economics.js";
import {chooseAiWorldCard,type AiRosterCandidate}
 from "../src/domain/ai-world-card.js";
import {aiPromotionStrategy} from "../src/domain/ai-promotion-strategy.js";
import type {CompletedShowReceipt} from "../src/domain/completed-show-receipt.js";
const url=process.env.PPW_NEON_TEST_URL;

// Three-year fixture executes the actual production SQL posting pathway and
// persisted, validated completed show receipts. Scores and show resolutions
// are controlled scenarios, not a full World Lock simulator. All data is
// confined to a disposable CI PostgreSQL World.
test("156 weeks of verified show receipts, recurring payroll and evolving AI rivals with two human owners",{
 skip:!url?"Disposable PostgreSQL required":false,timeout:240000,
},async()=>{
 const world="phase13-certified-finance-"+randomUUID(),db=postgresPool(url!,3);
 const owners=["human-a-"+randomUUID(),"human-b-"+randomUUID()];
 const profiles=[
  {id:"smart",mode:"HUMAN",cash:180000,wage:1700,fee:400,overhead:11000,
   media:9000,sponsor:4000,venue:3000,hire:3500,ticket:"STANDARD",cadence:2,
   day:1,quality:3.9,crowd:81,risk:40,craft:85,star:60},
  {id:"reckless",mode:"HUMAN",cash:280000,wage:16000,fee:3500,overhead:30000,
   media:17000,sponsor:6000,venue:9000,hire:25000,ticket:"PRESTIGE",cadence:2,
   day:2,quality:2.15,crowd:43,risk:80,craft:45,star:95},
  {id:"workrate-ai",mode:"AI",cash:180000,wage:850,fee:300,overhead:6000,
   media:14000,sponsor:3000,venue:2100,hire:2500,ticket:"ACCESSIBLE",cadence:3,
   day:4,quality:3.4,crowd:69,risk:35,craft:95,star:42},
  {id:"star-ai",mode:"AI",cash:160000,wage:2450,fee:700,overhead:15000,
   media:15000,sponsor:4000,venue:4200,hire:6500,ticket:"STANDARD",cadence:3,
   day:5,quality:3.65,crowd:76,risk:48,craft:53,star:96},
  {id:"recovery-ai",mode:"AI",cash:95000,wage:1950,fee:500,overhead:18000,
   media:8500,sponsor:3000,venue:4400,hire:8500,ticket:"STANDARD",cadence:3,
   day:6,quality:3.4,crowd:72,risk:92,craft:69,star:50},
 ] as const;
 const snapshots:Array<{year:number;id:string;cash:number;tier:string;
  distress:string;roster:number;wage:number;strength:number;media:number;
  shows:number;weeklyNet:number}>=[];
 const appearances=new Map(profiles.map(p=>[p.id,new Set<string>()]));
 const headlineHistory=new Map(profiles.map(p=>[p.id,[] as string[]]));
 const showCounts=new Map<string,number>(profiles.map(p=>[p.id,0]));
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:world,name:"Phase13 isolated economic World",
    seed:734,rulesetVersion:"test"});
   await tx.query("UPDATE ppw_worlds SET show_economics_enabled=true WHERE world_id=$1",[world]);
   await tx.query("INSERT INTO ppw_markets(world_id,market_id,name,audience_potential,wrestling_interest,spending_index) VALUES($1,'metro','Shared Metro',76,70,92)",[world]);
   const people:Array<{id:string;promotion:string|null;division:string;quality:number;
    wage:number;fee:number;stage:string}>=[];
   for(const profile of profiles){
    await addPromotion(tx,world,{id:profile.id,name:profile.id,tier:"LOCAL"});
    await tx.query(["UPDATE ppw_promotions SET management_mode=$3,cash=$4,weekly_fixed_overhead=$5,",
     "weekly_media_income=$6,weekly_sponsor_income=$7,financial_distress='HEALTHY',last_weekly_net=0,",
     "home_market_id='metro',media_reach=$8,event_cadence_weeks=$9,",
     "ai_risk_tolerance=$10,ai_match_quality_preference=$11,ai_star_preference=$12",
     "WHERE world_id=$1 AND promotion_id=$2"].join(" "),
     [world,profile.id,profile.mode,profile.cash,profile.overhead,profile.media,
      profile.sponsor,profile.id==="reckless"?76:54,
      profile.cadence,profile.risk,profile.craft,profile.star]);
    await tx.query("INSERT INTO ppw_promotion_market_states(world_id,promotion_id,market_id,awareness,live_strength,loyalty) VALUES($1,$2,'metro',45,42,50)",[world,profile.id]);
    await tx.query("INSERT INTO ppw_venues(world_id,venue_id,name,market_id,capacity,weekly_hire_cost,status) VALUES($1,$2,$2,'metro',$3,$4,'ACTIVE')",
     [world,"venue-"+profile.id,profile.venue,profile.hire]);
    for(let i=0;i<(profile.mode==="AI"?10:12);i++)people.push({id:profile.id+"-"+i,promotion:profile.id,
     division:i%4===0?"WOMEN":"MEN",quality:78-i*3,
     wage:profile.wage,fee:profile.fee,stage:"PRIME"});
   }
   for(let i=0;i<35;i++)people.push({id:"prospect-"+i,promotion:null,
    division:i%4===0?"WOMEN":"MEN",quality:30+i%18,
    wage:0,fee:0,stage:"PROSPECT"});
   await tx.query(["INSERT INTO ppw_people(world_id,person_id,name,status,",
    "career_stage,booking_division,weekly_service_capacity,biological_age,",
    "recognition,popularity,momentum,in_ring_quality,match_craft,presentation,",
    "contract_priorities)",
    "SELECT $1,x.id,x.id,'ACTIVE',x.stage,x.division,4,28,",
    "x.quality,x.quality,65,x.quality,x.quality,x.quality,",
    "'{\"money\":10,\"role\":80,\"prestige\":40,\"schedule\":50,\"loyalty\":50,\"exposure\":90}'::jsonb",
    "FROM jsonb_to_recordset($2::jsonb) x(id text,stage text,division text,quality double precision)"].join(" "),
    [world,JSON.stringify(people)]);
   await tx.query(["INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,",
    "family,status,start_week_index,expires_week_index,weekly_guarantee,",
    "appearance_fee,remaining_dates,role_expectation)",
    "SELECT $1,'contract-'||x.id,x.id,x.promotion,'EXCLUSIVE','SIGNED',0,260,",
    "x.wage,x.fee,NULL,'REGULAR' FROM jsonb_to_recordset($2::jsonb)",
    "x(id text,promotion text,wage bigint,fee bigint) WHERE x.promotion IS NOT NULL"].join(" "),
    [world,JSON.stringify(people)]);
   for(const owner of owners){
    await tx.query("INSERT INTO ppw_players(player_id) VALUES($1)",[owner]);
    await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status) VALUES($1,$2,'ACTIVE')",[world,owner]);
   }
   await tx.query("INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id) VALUES($1,$2,'smart'),($1,$3,'reckless')",[world,...owners]);
  });
  for(let index=0;index<156;index++){
   const year=Math.floor(index/52)+1,week=index%52+1;
   await withWorldTransaction(db.pool,tx=>tx.query(
    "UPDATE ppw_worlds SET year=$2,week=$3,phase='RESOLVING' WHERE world_id=$1",[world,year,week]));
   const roster=await withWorldTransaction(db.pool,tx=>tx.query<{
    promotion_id:string;person_id:string;contract_id:string;
    booking_division:"MEN"|"WOMEN";momentum:number;popularity:number;
    recognition:number;presentation:number;match_craft:number;
    appearance_fee:string;weekly_service_capacity:number
   }>(["SELECT c.promotion_id,c.person_id,c.contract_id,p.booking_division,",
    "p.momentum,p.popularity,p.recognition,p.presentation,p.match_craft,",
    "c.appearance_fee::text,p.weekly_service_capacity",
    "FROM ppw_contracts c JOIN ppw_people p ON p.world_id=c.world_id",
    "AND p.person_id=c.person_id WHERE c.world_id=$1 AND c.status='SIGNED'",
    "AND p.status='ACTIVE' AND c.start_week_index<=$2 AND c.expires_week_index>=$2",
    "AND p.booking_division IS NOT NULL ORDER BY c.promotion_id,c.person_id"].join(" "),
    [world,index]));
   // AI companies honour their real World cadence as tier changes and
   // financial restructuring adjust the frequency of their shows.
   const currentCadence=await withWorldTransaction(db.pool,tx=>tx.query<{
    promotion_id:string;event_cadence_weeks:number
   }>("SELECT promotion_id,event_cadence_weeks FROM ppw_promotions WHERE world_id=$1",
    [world]));
   const cadenceById=new Map(currentCadence.map(x=>[x.promotion_id,x.event_cadence_weeks]));
   const due=profiles.filter(p=>index%(p.mode==="AI"?
    cadenceById.get(p.id)??p.cadence:p.cadence)===0);
   for(const p of due){
    const owned=roster.filter(x=>x.promotion_id===p.id);
    const candidates:AiRosterCandidate[]=owned.map(x=>({
     personId:x.person_id,contractId:x.contract_id,bookingDivision:x.booking_division,
     weeklyCapacity:x.weekly_service_capacity??4,momentum:x.momentum,
     popularity:x.popularity,recognition:x.recognition,presentation:x.presentation,
     matchCraft:x.match_craft
    }));
    const showId="phase13-"+p.id+"-"+index;
    let participants:{personId:string;contractId:string}[];
    let scriptedWinner:string;
    if(p.mode==="AI"){
     const card=chooseAiWorldCard({
      worldId:world,worldSeed:"734",year,week,promotionId:p.id,showId,
      roster:candidates,bookedShows:[],activeVenues:["venue-"+p.id],
      eventType:week%13===0?"MAJOR":"REGULAR",
      riskTolerance:p.risk,matchQualityPreference:p.craft,starPreference:p.star,
      strategy:aiPromotionStrategy({worldSeed:"734",promotionId:p.id,year,week,
       riskTolerance:p.risk,matchQualityPreference:p.craft,starPreference:p.star}),
      recentPairs:headlineHistory.get(p.id)!.slice(-18)
     });
     assert.equal(card.status,"READY",p.id+" week "+index);
     if(card.status!=="READY")continue;
     const head=card.matches.at(-1)!;
     participants=head.participants;scriptedWinner=head.scriptedWinner;
    }else{
     const men=candidates.filter(x=>x.bookingDivision==="MEN");
     assert.ok(men.length>=2);
     const i=index%men.length;
     participants=[men[i]!,men[(i+1)%men.length]!].map(x=>({
      personId:x.personId,contractId:x.contractId
     }));
     scriptedWinner=participants[0]!.personId;
    }
    // A legal singles appearance gives the same authoritative scripted
    // winner and receipts that production economics consumes.
    if(participants.length!==2)continue;
    const ids=participants.map(x=>x.personId);
    ids.forEach(id=>appearances.get(p.id)!.add(id));
    headlineHistory.get(p.id)!.push([...ids].sort().join(":"));
    const slip=p.id==="recovery-ai"&&year===2;
    const quality=slip?2.1:p.quality,crowd=slip?42:p.crowd;
    const local=await withWorldTransaction(db.pool,tx=>tx.query<{
     awareness:number;live_strength:number;loyalty:number;media_reach:number
    }>(["SELECT s.awareness,s.live_strength,s.loyalty,p.media_reach",
     "FROM ppw_promotion_market_states s JOIN ppw_promotions p",
     "ON p.world_id=s.world_id AND p.promotion_id=s.promotion_id",
     "WHERE s.world_id=$1 AND s.promotion_id=$2 AND s.market_id='metro'"].join(" "),
     [world,p.id]));
    assert.equal(local.length,1);
    const stars=ids.map(id=>{
     const x=candidates.find(c=>c.personId===id)!;
     return {popularity:x.popularity,recognition:x.recognition,
      presentation:x.presentation};
    });
    const eventType=week%13===0?"MAJOR":"REGULAR";
    const expected=originalExpectedDemand({promotionId:p.id,marketId:"metro",
     day:p.day,eventType,ticketStrategy:p.ticket,
     mediaReach:local[0]!.media_reach,
     local:{awareness:local[0]!.awareness,liveStrength:local[0]!.live_strength,
      loyalty:local[0]!.loyalty},
     market:{audiencePotential:76,wrestlingInterest:70,spendingIndex:92},
     people:stars});
    const fee=owned.filter(x=>ids.includes(x.person_id)).reduce((s,x)=>
     s+Number(x.appearance_fee),0);
    await withWorldTransaction(db.pool,async tx=>{
     await tx.query(["INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,",
      "year,week,status,show_day,venue_id,market_id,event_type,ticket_strategy,",
      "booking_expected_demand,booking_ticket_yield,booking_snapshot_fingerprint)",
      "VALUES($1,$2,$3,$4,$5,'SUBMITTED',$6,$7,'metro',$8,$9,$10,$11,repeat('a',64))"].join(" "),
      [world,showId,p.id,year,week,p.day,"venue-"+p.id,eventType,p.ticket,
       expected,originalTicketYield(p.ticket,92)]);
     await tx.query(["INSERT INTO ppw_card_slots(world_id,draft_id,slot_id,position,kind,payload)",
      "VALUES($1,$2,'main',0,'MATCH',$3::jsonb)"].join(" "),
      [world,showId,JSON.stringify({matchType:"SINGLES",participants,
       scriptedWinner,plannedFinish:"CLEAN_PIN"})]);
     await tx.query(["INSERT INTO ppw_show_resolutions(world_id,show_id,promotion_id,",
      "resolved_week_index,command_request_id,performers_count,dates_charged)",
      "VALUES($1,$2,$3,$4,$5,2,2)"].join(" "),
      [world,showId,p.id,index,"resolution-"+showId]);
     await tx.query("UPDATE ppw_promotions SET cash=cash-$3 WHERE world_id=$1 AND promotion_id=$2",[world,p.id,fee]);
     await tx.query(["INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)",
      "VALUES($1,$2,$3,'CONTRACT_APPEARANCE_FEES',",
      "jsonb_build_object('promotionId',$4::text,'showId',$5::text,'amount',$6::bigint))"].join(" "),
      [world,year,week,p.id,showId,fee]);
    });
    const receipt:CompletedShowReceipt={worldId:world,promotionId:p.id,
     showId,year,week,resolutionId:"verified-"+showId,crowdResponse:crowd,
     matches:[{matchId:"main",position:0,crowdResponse:crowd,
      actualFinish:"CLEAN_PIN",
      actualWinnerSide:ids[0]===scriptedWinner?"A":"B"}],segments:[]};
    assert.equal(await recordCompletedShow(db.pool,receipt),"RECORDED");
    const money=await withWorldTransaction(db.pool,tx=>settleCompletedShowEconomics(
     tx,{worldId:world,promotionId:p.id,showId,year,week,averageMatchRating:quality}));
    assert.ok(Number.isSafeInteger(money.incrementalCash));
    assert.ok(money.attendance>=0&&money.attendance<=p.venue);
    showCounts.set(p.id,showCounts.get(p.id)!+1);
   }
   await withWorldTransaction(db.pool,async tx=>{
    await settleWeekLocalMarkets(tx,world,year,week);
    await settleRecurringWorldFinances(tx,world,year,week);
    await settleCommercialWorldWeek(tx,world,year,week);
    await settleWeeklyPromotionHealth(tx,world,year,week);
    await settleLivingPromotionSurvival(tx,world,year,week);
    await recruitDistressedAiRosters(tx,world,year,week);
    await recruitStrategicAiRosters(tx,world,year,week);
    if(week===52)await settleAnnualPromotionScale(tx,world,year,week);
   });
   if(week===52){
    const state=await withWorldTransaction(db.pool,tx=>tx.query<{
     promotion_id:string;cash:string;last_weekly_net:string;tier:string;
     financial_distress:string;live_strength:number;media:string;
     roster:number;wage:string
    }>(["SELECT p.promotion_id,p.cash::text,p.last_weekly_net::text,p.tier,",
     "p.financial_distress,s.live_strength,p.weekly_media_income::text AS media,",
     "(SELECT count(DISTINCT c.person_id)::integer FROM ppw_contracts c",
     "WHERE c.world_id=p.world_id AND c.promotion_id=p.promotion_id",
     "AND c.status='SIGNED' AND c.start_week_index<=$2",
     "AND c.expires_week_index>=$2) AS roster,",
     "(SELECT coalesce(sum(c.weekly_guarantee),0)::text FROM ppw_contracts c",
     "WHERE c.world_id=p.world_id AND c.promotion_id=p.promotion_id",
     "AND c.status='SIGNED' AND c.start_week_index<=$2",
     "AND c.expires_week_index>=$2) AS wage",
     "FROM ppw_promotions p JOIN ppw_promotion_market_states s ON",
     "s.world_id=p.world_id AND s.promotion_id=p.promotion_id",
     "WHERE p.world_id=$1 ORDER BY p.promotion_id"].join(" "),[world,index]));
    for(const x of state)snapshots.push({year,id:x.promotion_id,
     cash:Number(x.cash),tier:x.tier,distress:x.financial_distress,
     roster:x.roster,wage:Number(x.wage),strength:x.live_strength,
     media:Number(x.media),shows:showCounts.get(x.promotion_id)!,
     weeklyNet:Number(x.last_weekly_net)});
    const controls=await withWorldTransaction(db.pool,tx=>tx.query<{
     promotion_id:string;player_id:string
    }>(["SELECT promotion_id,player_id FROM ppw_promotion_controls",
     "WHERE world_id=$1 AND active ORDER BY promotion_id"].join(" "),[world]));
    assert.deepEqual(controls.map(x=>x.promotion_id),["reckless","smart"]);
    assert.deepEqual(controls.map(x=>x.player_id),[owners[1],owners[0]]);
   }
  }
  const row=(id:string,year:number)=>snapshots.find(x=>x.id===id&&x.year===year)!;
  assert.equal(snapshots.length,15);
  for(const year of [1,2,3]){
   assert.equal(row("reckless",year).distress,"CRISIS");
   assert.equal(row("reckless",year).tier,"LOCAL",
    "A company in sustained financial crisis cannot scale despite its market reach");
  }
  assert.notEqual(row("smart",3).tier,"LOCAL",
   "Healthy sustainable growth retains access to higher promotion tiers");
  assert.ok(row("smart",3).cash>row("reckless",3).cash,
   "Excessive guaranteed wages must have consequences");
  assert.ok(row("workrate-ai",3).cash>0,
   "Cautious AI must remain viable over three years");
  assert.ok(row("star-ai",3).shows>=40,
   "Rivals must book and settle multiple years of actual shows");
  assert.ok(appearances.get("star-ai")!.size>=4,"AI must rotate real contracted talent");
  const signings=await withWorldTransaction(db.pool,tx=>tx.query<{
   promotion_id:string;count:number
  }>(["SELECT promotion_id,count(*)::integer AS count FROM ppw_contracts",
   "WHERE world_id=$1 AND contract_id LIKE 'strategic:%'",
   "GROUP BY promotion_id ORDER BY promotion_id"].join(" "),[world]));
  assert.ok(signings.some(x=>x.count>0),"Solvent undersized AI should actually recruit talent");
  assert.ok(signings.every(x=>x.promotion_id.endsWith("-ai")),
   "Automated signings must never touch human-owned companies");
  console.log("Phase 13 three-year production SQL/recorded-show diagnostics:",
   JSON.stringify({snapshots,signings,
    rosterUsage:Object.fromEntries([...appearances].map(([id,ids])=>[id,ids.size]))}));
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const name of ["ppw_commercial_bonus_receipts","ppw_commercial_deals",
    "ppw_ledger_events","ppw_promotion_talent_trust","ppw_promotion_survival",
    "ppw_show_economics","ppw_completed_match_evidence",
    "ppw_completed_show_matches","ppw_completed_shows","ppw_show_resolutions",
    "ppw_card_slots","ppw_booking_drafts","ppw_staff_employments",
    "ppw_contracts","ppw_promotion_controls","ppw_memberships","ppw_people",
    "ppw_venues","ppw_promotion_market_states","ppw_promotions","ppw_markets"])
    await tx.query("DELETE FROM "+name+" WHERE world_id=$1",[world]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=ANY($1::text[])",[owners]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>db.close());
 }
});


test("healthy, high-reach company cannot scale without certified shows",{
 skip:!url?"Disposable PostgreSQL required":false,
},async()=>{
 const world="phase13-idle-scale-"+randomUUID(),db=postgresPool(url!,2);
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:world,name:"Annual zero-show evidence",seed:304,
    rulesetVersion:"test"});
   await addPromotion(tx,world,{id:"inactive-booking",name:"Idle",tier:"LOCAL"});
   await tx.query(["INSERT INTO ppw_markets(world_id,market_id,name,",
    "audience_potential,wrestling_interest,spending_index)",
    "VALUES($1,'home','Home',90,80,100)"].join(" "),[world]);
   await tx.query(["INSERT INTO ppw_promotion_market_states(",
    "world_id,promotion_id,market_id,awareness,live_strength,loyalty)",
    "VALUES($1,'inactive-booking','home',96,98,97)"].join(" "),[world]);
   await tx.query(["UPDATE ppw_promotions SET financial_distress='HEALTHY',",
    "media_reach=95,home_market_id='home'",
    "WHERE world_id=$1 AND promotion_id='inactive-booking'"].join(" "),[world]);
   const result=await settleAnnualPromotionScale(tx,world,1,52);
   assert.deepEqual(result,{evaluated:1,changed:0});
   const rows=await tx.query<{tier:string}>(
    "SELECT tier FROM ppw_promotions WHERE world_id=$1 AND promotion_id='inactive-booking'",
    [world]);
   assert.equal(rows[0]?.tier,"LOCAL");
  });
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_ledger_events","ppw_promotion_survival",
    "ppw_promotion_market_states","ppw_promotions","ppw_markets"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[world]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>db.close());
 }
});
