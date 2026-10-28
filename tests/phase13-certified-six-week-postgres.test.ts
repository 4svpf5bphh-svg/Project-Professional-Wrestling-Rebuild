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
test("eight AI promotions complete six genuine certified World Lock weeks",{
 skip:!url?"Disposable PostgreSQL required":false,timeout:240000,
},async()=>{
 const world="phase13-real-world-"+randomUUID(),db=postgresPool(url!,4);
 const weeks=6;
 const snapshots:Array<{week:number;shows:number;completed:number;
  certified:number;matches:number;cash:string;weeklyLedger:number}>=[];
 try{
  await importOriginalGenesis(db.pool,originalGenesisFixture(world,160));
  await withWorldTransaction(db.pool,tx=>tx.query(
   "UPDATE ppw_worlds SET injury_rate_multiplier=0 WHERE world_id=$1",[world]));
  for(let week=1;week<=weeks;week++){
   const state=await withWorldTransaction(db.pool,tx=>tx.query<{
    year:number;week:number;phase:string;revision:string
   }>("SELECT year,week,phase,revision::text FROM ppw_worlds WHERE world_id=$1",[world]));
   assert.equal(state[0]?.year,1);
   assert.equal(state[0]?.week,week);
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
    "WHERE d.world_id=$1 AND d.year=1 AND d.week=$2 AND d.status='SUBMITTED') AS shows,",
    "(SELECT count(*)::integer FROM ppw_completed_shows s",
    "WHERE s.world_id=$1 AND s.year=1 AND s.week=$2) AS completed,",
    "(SELECT certified_promotions FROM ppw_week_resolution_seals s",
    "WHERE s.world_id=$1 AND s.year=1 AND s.week=$2) AS certified,",
    "(SELECT count(DISTINCT d.promotion_id)::integer FROM ppw_booking_drafts d",
    "WHERE d.world_id=$1 AND d.year=1 AND d.week=$2 AND d.status='SUBMITTED') AS booked,",
    "(SELECT count(*)::integer FROM ppw_completed_show_matches m",
    "JOIN ppw_completed_shows s ON s.world_id=m.world_id AND s.show_id=m.show_id",
    "WHERE s.world_id=$1 AND s.year=1 AND s.week=$2) AS matches,",
    "(SELECT sum(cash)::text FROM ppw_promotions WHERE world_id=$1) AS cash,",
    "(SELECT count(*)::integer FROM ppw_ledger_events e",
    "WHERE e.world_id=$1 AND e.year=1 AND e.week=$2",
    "AND e.event_type='WORLD_WEEK_COMPLETED') AS weekly_ledger,",
    "(SELECT count(*)::integer FROM ppw_ledger_events e",
    "WHERE e.world_id=$1 AND e.year=1 AND e.week=$2",
    "AND e.event_type='CONTRACT_GUARANTEE_PAID') AS payroll"
   ].join(" "),[world,week]));
   assert.equal(facts.length,1);
   const f=facts[0]!;
   assert.equal(f.booked,8,"All autonomous companies need real submitted cards");
   assert.equal(f.certified,8,"All eight companies must be certified once");
   assert.equal(f.completed,f.shows,"Every submitted card must have real results");
   assert.ok(f.matches>=8,"Genuine matches were simulated and persisted");
   assert.equal(f.weekly_ledger,1,"World should publish only once per week");
   assert.equal(f.payroll,8,"Every company pays its actual weekly contracts");
   snapshots.push({week,shows:f.shows,completed:f.completed,
    certified:f.certified,matches:f.matches,cash:f.cash,
    weeklyLedger:f.weekly_ledger});
   const retry=await driveWorldResolution(db.pool,{
    worldId:world,resolutionId:"phase13-resolution",maxStages:2,
    manualRecovery:true,
   });
   assert.equal(retry.status,"BLOCKED","Publishing cannot replay");
   const clock=await withWorldTransaction(db.pool,tx=>tx.query<{
    year:number;week:number;phase:string
   }>("SELECT year,week,phase FROM ppw_worlds WHERE world_id=$1",[world]));
   assert.deepEqual(clock,[{year:1,week:week+1,phase:"OPEN"}]);
  }
  assert.equal(snapshots.length,weeks);
  assert.notEqual(snapshots[weeks-1]!.cash,snapshots[0]!.cash);
  console.log("Phase 13 authentic six-week World Lock diagnostics:",
   JSON.stringify(snapshots));
 }finally{
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
  }finally{await db.close();}
 }
});

