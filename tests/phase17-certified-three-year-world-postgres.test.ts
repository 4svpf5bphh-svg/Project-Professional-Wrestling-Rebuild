import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {importOriginalGenesis} from "../src/db/import-original-genesis.js";
import {originalGenesisFixture} from "./fixtures/original-genesis.js";
import {lockWorldWeek} from "../src/db/world-lock.js";
import {driveWorldResolution} from "../src/db/world-resolution-pipeline.js";
const url=process.env.PPW_NEON_TEST_URL;

// An authentic multi-week World Lock replay, unlike separate financial
// scenarios: real AI books every card, original result simulation scores
// every match, and certification and rollover settle each company. No
// fabricated result, receipt, direct payroll fixture or live scheduler.
test("eight AI promotions sustain a genuine three-year certified World Lock and career market",{
 skip:!url?"Disposable PostgreSQL required":false,timeout:1200000,
},async()=>{
 const world="phase17-three-year-"+randomUUID(),db=postgresPool(url!,4);
 const weeks=156,started=Date.now();
 // stderr is streamed even if node:test aborts without flushing console.log.
 const diagnostic=(event:string,detail:Record<string,number|string>={})=>
  process.stderr.write("[three-year world] "+JSON.stringify({
   event,elapsedSeconds:Math.round((Date.now()-started)/1000),...detail
  })+"\n");
 const snapshots:Array<{week:number;shows:number;completed:number;
  certified:number;matches:number;cash:string;weeklyLedger:number}>=[];
 try{
  diagnostic("seeding genesis");
  await importOriginalGenesis(db.pool,originalGenesisFixture(world));
  diagnostic("genesis seeded");
  const population=await withWorldTransaction(db.pool,tx=>tx.query<{
   talent:number;free_agents:number
  }>(["SELECT count(*)::integer AS talent,",
     "count(*) FILTER(WHERE NOT EXISTS(SELECT 1 FROM ppw_contracts c",
     "WHERE c.world_id=p.world_id AND c.person_id=p.person_id",
     "AND c.status='SIGNED'))::integer AS free_agents",
     "FROM ppw_people p WHERE p.world_id=$1"].join(" "),[world]));
  assert.deepEqual(population,[{talent:643,free_agents:243}],
   "Real Genesis depth matters; an all-contracted synthetic market cannot recruit");
  // Use the real company identities; the named quarterly premium calendar
  // belongs to WWE and AEW, not to anonymous Genesis fixture labels.
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query(["UPDATE ppw_promotions SET name=CASE",
    "WHEN promotion_id='promotion-0' THEN 'WWE'",
    "WHEN promotion_id='promotion-1' THEN 'AEW' ELSE name END",
    "WHERE world_id=$1"].join(" "),[world]);
   await tx.query("UPDATE ppw_worlds SET injury_rate_multiplier=0 WHERE world_id=$1",
    [world]);
  });
  for(let week=1;week<=weeks;week++){
   const calendarYear=Math.floor((week-1)/52)+1;
   const calendarWeek=(week-1)%52+1;
   const weekStart=Date.now();
   if(week===1||week%8===0)diagnostic("week started",{week});
   const state=await withWorldTransaction(db.pool,tx=>tx.query<{
    year:number;week:number;phase:string;revision:string
   }>("SELECT year,week,phase,revision::text FROM ppw_worlds WHERE world_id=$1",[world]));
   assert.equal(state[0]?.year,calendarYear);
   assert.equal(state[0]?.week,calendarWeek);
   assert.equal(state[0]?.phase,"OPEN");
   await withWorldTransaction(db.pool,tx=>tx.query(
    "UPDATE ppw_worlds SET next_lock_at=clock_timestamp()-interval '1 second' WHERE world_id=$1",
    [world]));
   const locked=await lockWorldWeek(db.pool,{
    worldId:world,requestId:"phase13-lock-"+week,
    expectedRevision:Number(state[0]!.revision)});
   assert.equal(locked.status,"APPLIED","Week "+week+" must lock authoritatively");
   const trace:string[]=[];
   let published=false;
   for(let attempt=0;attempt<4;attempt++){
    const run=await driveWorldResolution(db.pool,{
     worldId:world,resolutionId:"phase13-resolution",maxStages:16,
     manualRecovery:true,
    });
    trace.push(...run.steps.map(s=>s.action));
    if(run.status==="PUBLISHED"){published=true;break;}
    assert.equal(run.status,"LIMIT_REACHED",
     "Unexpected blocker in real Week "+week+": "+JSON.stringify(run));
   }
   assert.equal(published,true,"World did not publish Week "+week+": "+trace.join(", "));
   for(const step of ["ASSESS_CONTINUITY","FINALIZE_PREPARED_SHOWS","BEGIN_RESOLUTION",
    "GENERATE_STAFF_AND_AI_CARDS","PREPARE_AI_AND_STAFF_COMMERCE",
    "CLEAR_RESOURCES","RESOLVE_LEGACY_SHOWS","RESOLVE_DETAILED_SHOWS",
    "CERTIFY_WEEK","PUBLISH_WEEK"])
    assert.ok(trace.includes(step),"Week "+week+" skipped "+step);
   const facts=await withWorldTransaction(db.pool,tx=>tx.query<{
    shows:number;completed:number;certified:number;booked:number;
    matches:number;cash:string;weekly_ledger:number;payroll:number
   }>([
    "SELECT",
    "(SELECT count(*)::integer FROM ppw_booking_drafts d",
    "WHERE d.world_id=$1 AND d.year=$3 AND d.week=$2 AND d.status='SUBMITTED') AS shows,",
    "(SELECT count(*)::integer FROM ppw_completed_shows s",
    "WHERE s.world_id=$1 AND s.year=$3 AND s.week=$2) AS completed,",
    "(SELECT certified_promotions FROM ppw_week_resolution_seals s",
    "WHERE s.world_id=$1 AND s.year=$3 AND s.week=$2) AS certified,",
    "(SELECT count(DISTINCT d.promotion_id)::integer FROM ppw_booking_drafts d",
    "WHERE d.world_id=$1 AND d.year=$3 AND d.week=$2 AND d.status='SUBMITTED') AS booked,",
    "(SELECT count(*)::integer FROM ppw_completed_show_matches m",
    "JOIN ppw_completed_shows s ON s.world_id=m.world_id AND s.show_id=m.show_id",
    "WHERE s.world_id=$1 AND s.year=$3 AND s.week=$2) AS matches,",
    "(SELECT sum(cash)::text FROM ppw_promotions WHERE world_id=$1) AS cash,",
    "(SELECT count(*)::integer FROM ppw_ledger_events e",
    "WHERE e.world_id=$1 AND e.year=$3 AND e.week=$2",
    "AND e.event_type='WORLD_WEEK_COMPLETED') AS weekly_ledger,",
    "(SELECT count(*)::integer FROM ppw_ledger_events e",
    "WHERE e.world_id=$1 AND e.year=$3 AND e.week=$2",
    "AND e.event_type='CONTRACT_GUARANTEE_PAID') AS payroll"
   ].join(" "),[world,calendarWeek,calendarYear]));
   assert.equal(facts.length,1);
   const f=facts[0]!;
   assert.equal(f.booked,8,"All autonomous companies need real submitted cards");
   assert.equal(f.certified,8,"All eight companies must be certified once");
   assert.equal(f.completed,f.shows,"Every submitted card must have real results");
   assert.ok(f.matches>=30,
    "The authentic free-agent market should preserve credible AI card depth in Week "+week);
   assert.equal(f.weekly_ledger,1,"World should publish only once per week");
   assert.equal(f.payroll,8,"Every company pays its actual weekly contracts");
   if(week===1||week%8===0)diagnostic("week certified",{
    week,matches:f.matches,completed:f.completed,certified:f.certified
   });
   snapshots.push({week,shows:f.shows,completed:f.completed,
    certified:f.certified,matches:f.matches,cash:f.cash,
    weeklyLedger:f.weekly_ledger});
   if(week===1||week%4===0||week===weeks)
    console.log("World-year verification progress",JSON.stringify({
     week,of:weeks,elapsedSeconds:Math.round((Date.now()-started)/1000),
     lastWeekSeconds:Math.round((Date.now()-weekStart)/1000),
     bookedShows:f.shows,certifiedPromotions:f.certified,matches:f.matches
    }));
   const retry=await driveWorldResolution(db.pool,{
    worldId:world,resolutionId:"phase13-resolution",maxStages:2,
    manualRecovery:true,
   });
   assert.equal(retry.status,"BLOCKED","Publishing cannot replay");
   const clock=await withWorldTransaction(db.pool,tx=>tx.query<{
    year:number;week:number;phase:string
   }>("SELECT year,week,phase FROM ppw_worlds WHERE world_id=$1",[world]));
   assert.deepEqual(clock,[{
    year:Math.floor(week/52)+1,week:week%52+1,phase:"OPEN"
   }]);
  }
  diagnostic("all weeks certified",{weeks});
  assert.equal(snapshots.length,weeks);
  assert.notEqual(snapshots[weeks-1]!.cash,snapshots[0]!.cash);
  const ppvs=await withWorldTransaction(db.pool,tx=>tx.query<{
   promotion_id:string;name:string|null
  }>(["SELECT promotion_id,show_name AS name FROM ppw_booking_drafts",
     "WHERE world_id=$1 AND year=1 AND week<=52",
     "AND booking_class='PREMIUM' AND status='SUBMITTED'",
     "ORDER BY promotion_id,week"].join(" "),[world]));
  for(const expected of ["Royal Rumble","Elimination Chamber","Revolution","WrestleMania","Backlash","Double or Nothing","Night of Champions","Forbidden Door","SummerSlam","Money in the Bank","Survivor Series","All In","All Out","Full Gear","Worlds End"])
   assert.ok(ppvs.some(p=>p.name===expected),
    "Actual WWE/AEW named premium event missing from its scheduled week: "+expected);
  const usage=await withWorldTransaction(db.pool,tx=>tx.query<{
   promotion_id:string;unique_talent:number
  }>(["SELECT d.promotion_id,count(DISTINCT x.person->>'personId')::integer AS unique_talent",
     "FROM ppw_card_slots slot JOIN ppw_booking_drafts d",
     "ON d.world_id=slot.world_id AND d.draft_id=slot.draft_id",
     "CROSS JOIN LATERAL jsonb_array_elements(slot.payload->'participants') x(person)",
     "WHERE slot.world_id=$1 AND slot.kind='MATCH'",
     "AND d.year=1 AND d.week<=52",
     "GROUP BY d.promotion_id ORDER BY d.promotion_id"].join(" "),[world]));
  assert.equal(usage.length,8);
  assert.ok(usage.every(x=>x.unique_talent>=10),
   "Every AI company must involve real roster depth across the quarter");
  const companies=await withWorldTransaction(db.pool,tx=>tx.query<{
   promotion_id:string;name:string;tier:string;lifecycle:string;
   cash:string;debt:string;financial_distress:string|null;
   active_contracts:number;total_contracts:number;completed_shows:number
  }>([
   "SELECT p.promotion_id,p.name,p.tier,p.lifecycle,",
   "p.cash::text,p.debt::text,p.financial_distress,",
   "(SELECT count(*)::integer FROM ppw_contracts c WHERE c.world_id=p.world_id",
   "AND c.promotion_id=p.promotion_id AND c.status='SIGNED'",
   "AND c.expires_week_index>=155) AS active_contracts,",
   "(SELECT count(*)::integer FROM ppw_contracts c WHERE c.world_id=p.world_id",
   "AND c.promotion_id=p.promotion_id) AS total_contracts,",
   "(SELECT count(*)::integer FROM ppw_completed_shows x",
   "WHERE x.world_id=p.world_id AND x.promotion_id=p.promotion_id)",
   "AS completed_shows",
   "FROM ppw_promotions p WHERE p.world_id=$1 ORDER BY p.promotion_id"
  ].join(" "),[world]));
  assert.equal(companies.length,8,"All AI companies must retain identity");
  assert.ok(companies.every(p=>p.completed_shows>=156),
   "Each rival must remain active for the full first World year");
  console.log("Phase 17 three-year company survival:",JSON.stringify(companies));
  console.log("Phase 17 three-year World Lock diagnostics:",
   JSON.stringify(snapshots));
 }finally{
  diagnostic("disposable cleanup started");
  // Topological world-scoped deletion keeps this disposable fixture isolated
  // from other test Worlds, even as new World-bound PPW tables are introduced.
  try{
   await withWorldTransaction(db.pool,async tx=>{
    const names=await tx.query<{name:string;parent:string|null}>([
     "SELECT child.relname AS name,parent.relname AS parent",
     "FROM pg_class child JOIN pg_namespace ns ON ns.oid=child.relnamespace",
     "JOIN pg_attribute a ON a.attrelid=child.oid AND a.attname='world_id'",
     "AND NOT a.attisdropped",
     "LEFT JOIN pg_constraint con ON con.conrelid=child.oid AND con.contype='f'",
     "LEFT JOIN pg_class parent ON parent.oid=con.confrelid",
     "WHERE ns.nspname=current_schema() AND child.relkind='r'",
     "AND child.relname LIKE 'ppw_%'"
    ].join(" "),[]);
    const parents=new Map<string,Set<string>>();
    for(const r of names){
     if(!parents.has(r.name))parents.set(r.name,new Set());
     if(r.parent&&r.parent!==r.name)parents.get(r.name)!.add(r.parent);
    }
    const order:string[]=[],seen=new Set<string>(),active=new Set<string>();
    const visit=(id:string)=>{
     if(seen.has(id))return;
     if(active.has(id))throw new Error("Cyclic PPW cleanup dependency "+id);
     active.add(id);
     for(const parent of parents.get(id)??[])if(parents.has(parent))visit(parent);
     active.delete(id);seen.add(id);order.push(id);
    };
    for(const name of parents.keys())visit(name);
    for(const name of order.reverse())await tx.query(
     "DELETE FROM "+name+" WHERE world_id=$1",[world]);
   });
  }finally{await db.close();diagnostic("disposable cleanup finished");}
 }
});

