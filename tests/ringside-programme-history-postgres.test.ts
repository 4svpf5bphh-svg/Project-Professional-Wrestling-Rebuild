import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool,withSqlClient} from "../src/db/postgres.js";
import {loadRingsideCommentary} from "../src/db/ringside-commentary.js";
import {buildVerifiedRingsideFallback,validateRingsideCopy} from "../src/domain/ringside-editorial.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {readCompletedShowView} from "../src/db/show-results-view.js";
import {readRingsideMemory} from "../src/db/ringside-continuity.js";
import {processWorldUpdate,startWorldUpdating} from "../src/db/world-updating.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {MeasuredQuerySession} from "../src/db/query-meter.js";
import type {TransactionPool} from "../src/db/transaction.js";

const url=process.env.PPW_NEON_TEST_URL;
test("historic Ringside joins exactly its own settled rivalry chapters and prior twelve-week facts",
 {skip:!url?"No disposable PostgreSQL":false},async()=>{
 const db=postgresPool(url!,3);
 const salt=randomUUID(),worldId="ringside-history-"+salt;
 const promotionId="promotion-"+salt,playerId="player-"+salt;
 const people=["a-"+salt,"b-"+salt];
 const scope={worldId,promotionId,playerId,showId:"current"};
 const receipt={worldId,promotionId,showId:"current",year:2,week:3,
  resolutionId:"resolution-current",crowdResponse:79,
  matches:[{matchId:"main",position:0,crowdResponse:81,
   actualFinish:"CLEAN_PIN",actualWinnerSide:"A"}],
  segments:[{slotId:"promo",position:1,kind:"CHALLENGE",
   outcome:"HAPPENS" as const,crowdResponse:73}]};
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:worldId,name:"Ringside history",seed:99,rulesetVersion:"test"});
   await addPromotion(tx,worldId,{id:promotionId,name:"CWA",tier:"LOCAL"});
   await tx.query("INSERT INTO ppw_players(player_id) VALUES($1)",[playerId]);
   await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status) VALUES($1,$2,'ACTIVE')",
    [worldId,playerId]);
   await tx.query("INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id) VALUES($1,$2,$3)",
    [worldId,playerId,promotionId]);
   for(const [i,id] of people.entries())await tx.query(
    "INSERT INTO ppw_people(world_id,person_id,name,booking_division)"+
    " VALUES($1,$2,$3,'MEN')",[worldId,id,i===0?"Samoa Joe":"Matt Riddle"]);
   await tx.query("INSERT INTO ppw_programmes(world_id,promotion_id,programme_id,status,heat,repetition)"+
    " VALUES($1,$2,'story','ACTIVE',66,4)",[worldId,promotionId]);
   await tx.query("INSERT INTO ppw_programme_side_refs(world_id,promotion_id,programme_id,side,"+
    "position,ref_kind,ref_id) VALUES($1,$2,'story','A',0,'PERSON',$3),"+
    "($1,$2,'story','B',0,'PERSON',$4)",[worldId,promotionId,...people]);
   for(const [showId,year,week] of [["older",2,1],["current",2,3],["future",2,4]] as const){
    await tx.query("INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week,status)"+
     " VALUES($1,$2,$3,$4,$5,'DRAFT')",[worldId,showId,promotionId,year,week]);
    await tx.query("INSERT INTO ppw_completed_shows(world_id,promotion_id,show_id,"+
     "year,week,resolution_id,crowd_response,receipt_json,receipt_digest)"+
     " VALUES($1,$2,$3,$4,$5,$6,79,$7::jsonb,$8)",
     [worldId,promotionId,showId,year,week,"resolve-"+showId,
      JSON.stringify(showId==="current"?receipt:{}),"a".repeat(64)]);
   }
   await tx.query("INSERT INTO ppw_card_slots(world_id,draft_id,slot_id,position,kind,payload)"+
    " VALUES($1,'current','main',0,'MATCH',$2::jsonb),"+
    "($1,'current','promo',1,'SEGMENT',$3::jsonb)",[worldId,
    JSON.stringify({matchType:"SINGLES",participants:people.map(personId=>({
     personId,contractId:"contract-"+personId})),
     plannedFinish:"CLEAN_PIN"}),
    JSON.stringify({kind:"CHALLENGE",participants:[
     {personId:people[0],contractId:"contract-"+people[0]}]})]);
   // Earlier certified match from the same owner promotion. This is the
   // ONLY additional historic read needed for a new Groq article.
   await tx.query("INSERT INTO ppw_card_slots(world_id,draft_id,slot_id,position,kind,payload)"+
    " VALUES($1,'older','historic',0,'MATCH',$2::jsonb)",
    [worldId,JSON.stringify({matchType:"SINGLES",participants:people.map(personId=>({
     personId,contractId:"contract-"+personId})),scriptedWinner:people[1],
     plannedFinish:"CLEAN_PIN"})]);
   await tx.query("INSERT INTO ppw_completed_show_matches(world_id,show_id,match_id,position,"+
    "crowd_response,actual_finish,actual_winner_side)"+
    " VALUES($1,'older','historic',0,75,'CLEAN_PIN','B')",[worldId]);
   await tx.query("INSERT INTO ppw_completed_show_matches(world_id,show_id,match_id,position,"+
    "crowd_response,actual_finish,actual_winner_side)"+
    " VALUES($1,'current','main',0,81,'CLEAN_PIN','A')",[worldId]);
   await tx.query("INSERT INTO ppw_completed_show_segments(world_id,show_id,slot_id,position,"+
    "kind,authored_outcome,crowd_response)"+
    " VALUES($1,'current','promo',1,'CHALLENGE','HAPPENS',73)",[worldId]);
   const events=[
    ["older","historic",52,"MATCH","B"],
    ["current","main",54,"MATCH","A"],
    ["current","promo",54,"SEGMENT",null],
    ["future","future",55,"MATCH","A"]
   ] as const;
   for(const [showId,slotId,index,kind,winner] of events)await tx.query(
    "INSERT INTO ppw_programme_resolved_activities(world_id,promotion_id,programme_id,"+
    "show_id,slot_id,week_index,kind,signature,crowd_response,impact,winner_side)"+
    " VALUES($1,$2,'story',$3,$4,$5,$6,$7,80,78,$8)",
    [worldId,promotionId,showId,slotId,index,kind,kind+"-"+slotId,winner]);
  });
  const meter=new MeasuredQuerySession("historical-ringside-programme");
  const pool:TransactionPool={async connect(){
   const c=await db.pool.connect();
   return {release(){c.release();},
    async query<T extends Record<string,unknown>>(sql:string,args:readonly unknown[]=[]){
     return meter.execute(()=>c.query<T>(sql,args));
    }};
  }};
  const view=await readCompletedShowView(pool,scope);
  const budget=meter.assertBudget({maxQueries:5,maxResultBytes:120_000});
  assert.equal(budget.queryCount,5);
  const match=view.entries.find(x=>x.slotId==="main")!;
  const chapter=match.programmeChapters?.[0]!;
  assert.equal(chapter.sideA,"Samoa Joe");
  assert.equal(chapter.sideB,"Matt Riddle");
  assert.equal(chapter.precedingMatches,1);
  assert.equal(chapter.precedingAngles,0);
  assert.equal(chapter.previousWinner,"B");
  assert.equal(chapter.previousMatchWeek,52);
  assert.equal(chapter.currentWinner,"A");
  const promo=view.entries.find(x=>x.slotId==="promo")!;
  assert.equal(promo.programmeChapters?.[0]?.currentWinner,null);
  assert.equal(promo.programmeChapters?.[0]?.previousWinner,"B");
  const memory=await readRingsideMemory(pool,scope,view);
  assert.equal(memory.programmes.length,0,
   "Exact programme context is already in the five-query completed show");
  assert.deepEqual(memory.priorMatches.map(x=>x.winners),[["Matt Riddle"]]);
  assert.deepEqual(memory.priorMatches[0]?.sides,[["Samoa Joe"],["Matt Riddle"]],
   "The original canonical match sides must survive the bounded history projection");
  assert.equal(meter.assertBudget({maxQueries:7,maxResultBytes:160_000}).queryCount,7,
   "Five verified-show reads plus two previous-match reads, not the former eight");
  await assert.rejects(readCompletedShowView(db.pool,{...scope,playerId:"intruder"}),
   /unavailable to this controller/);

  // A certified show traverses the real owner-scoped cache, claim and
  // publication SQL. Mock provider transport and the global allowance rows
  // only, because the concurrent budget suite independently verifies them.
  let monthlyClaims=0,dailyClaims=0,providerCalls=0;
  const meteredPool:TransactionPool={async connect(){
   const c=await db.pool.connect();
   return {release(){c.release();},async query<T extends Record<string,unknown>>(sql:string,args:readonly unknown[]=[]){
    if(sql.includes("ppw_openai_preview_monthly_usage")){
     if(sql.includes("INSERT INTO")){monthlyClaims++;return [{month:"2026-11-01"}] as unknown as T[];}
     return [] as T[];
    }
    if(sql.includes("ppw_openai_preview_daily_usage")){
     if(sql.includes("INSERT INTO")){dailyClaims++;return [{day:"2026-11-24"}] as unknown as T[];}
     return [] as T[];
    }
    return c.query<T>(sql,args);
   }};
  }};
  const draft=buildVerifiedRingsideFallback(view);
  let entered!:()=>void,unblock!:()=>void;
  const started=new Promise<void>(resolve=>{entered=resolve;});
  const held=new Promise<void>(resolve=>{unblock=resolve;});
  const transport:typeof fetch=async(url,init)=>{
   providerCalls++;entered();
   assert.equal(String(url),"https://api.openai.com/v1/chat/completions");
   const body=JSON.parse(String(init?.body));
   assert.equal(body.model,"gpt-6.1-terra");
   assert.equal(body.store,false);
   await held;
   return new Response(JSON.stringify({
    usage:{prompt_tokens:1500,completion_tokens:250},
    choices:[{message:{content:JSON.stringify({
     showHeadline:draft.showHeadline,opening:draft.opening,closing:draft.closing,
     slots:Object.fromEntries(draft.slots.map((s,i)=>["card_"+i,{headline:s.headline,recap:s.recap}]))
    })}}]
   }),{status:200});
  };
  const updateScope={worldId,year:receipt.year,week:receipt.week};
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query("UPDATE ppw_worlds SET year=2,week=4 WHERE world_id=$1",[worldId]);
   await startWorldUpdating(tx,updateScope);
   await tx.query(`UPDATE ppw_world_update_jobs SET state='PROCESSING',claim_token='valid',
    claim_until=clock_timestamp()+interval '210 seconds' WHERE world_id=$1 AND show_id=$2`,
   [worldId,scope.showId]);
  });
  assert.deepEqual(await loadRingsideCommentary(meteredPool,scope,"fixture",transport,"OPENAI","UPDATE","stale"),
   {status:"pending"});
  assert.equal(providerCalls,0);assert.equal(monthlyClaims,0);assert.equal(dailyClaims,0);
  const first=loadRingsideCommentary(meteredPool,scope,"fixture",transport,"OPENAI","UPDATE","valid");
  try{
   await Promise.race([started,first.then(()=>{throw Error("Terra transport was not reached");})]);
   const claim=await withSqlClient(db.pool,tx=>tx.query<{model:string;state:string;attempts:number;lease:number}>(`
    SELECT model,state,attempts,EXTRACT(EPOCH FROM claim_until-now())::int AS lease
    FROM ppw_ringside_reports WHERE world_id=$1 AND show_id=$2`,[worldId,scope.showId]));
   assert.equal(claim[0]?.model,"gpt-6.1-terra");
   assert.equal(claim[0]?.attempts,1);assert.equal(claim[0]?.state,"PENDING");
   assert.ok((claim[0]?.lease??0)>150,"Paid lease must outlast provider timeout");
   assert.deepEqual(await loadRingsideCommentary(meteredPool,scope,"fixture",transport,"OPENAI"),
    {status:"pending"});
   assert.equal(providerCalls,1,"Concurrent report read must not duplicate the paid request");
  }finally{unblock();}
  const published=await first;
  assert.equal(published.status,"ready");
  if(published.status==="ready")assert.deepEqual(validateRingsideCopy(published.review,view,
   {styleWarningOnly:true}),published.review);
  assert.deepEqual(await loadRingsideCommentary(meteredPool,scope,"fixture",transport,"OPENAI"),published);
  await withSqlClient(db.pool,tx=>tx.query(`UPDATE ppw_world_update_jobs
   SET claim_until=clock_timestamp()-interval '1 second' WHERE world_id=$1 AND show_id=$2`,
  [worldId,scope.showId]));
  assert.equal((await processWorldUpdate(meteredPool,updateScope,{terraKey:"fixture",transport}))?.editorial?.state,"RECOVERED");
  assert.equal((await processWorldUpdate(meteredPool,updateScope,{}))?.status,"PUBLISHED");
  assert.equal(providerCalls,1);assert.equal(monthlyClaims,1);assert.equal(dailyClaims,1);
  const certified=await readCompletedShowView(db.pool,scope);
  assert.deepEqual(certified,view,"Editorial publication cannot change the certified results");
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_ringside_reports","ppw_programme_resolved_activities",
    "ppw_completed_show_matches","ppw_completed_show_segments","ppw_card_slots",
    "ppw_completed_shows","ppw_booking_drafts","ppw_programme_side_refs",
    "ppw_programmes","ppw_people","ppw_promotion_controls","ppw_memberships",
    "ppw_promotions"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[playerId]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
  }).finally(()=>db.close());
 }
});
