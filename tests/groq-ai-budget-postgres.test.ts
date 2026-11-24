import test from "node:test";
import assert from "node:assert/strict";
import {postgresPool,withSqlClient} from "../src/db/postgres.js";
import {claimAiAllowance,recordAiAllowance,requestGroqEditorial} from "../src/db/groq-ai-director.js";
import {randomUUID} from "node:crypto";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {joinWorld} from "../src/db/membership-operations.js";
import {submitPromotionClaim} from "../src/db/promotion-commands.js";
import {worldStaff} from "../src/domain/world-staff.js";
import {readStaffConsultation} from "../src/db/staff-consultation.js";
import {readWorldMail} from "../src/db/backstage-world-mail.js";
const url=process.env.PPW_NEON_TEST_URL;
test("Groq daily allowance atomically caps concurrent multiplayer calls",{
 skip:!url?"Disposable PostgreSQL unavailable":false
},async()=>{
 const db=postgresPool(url!,4);
 try{
  await withSqlClient(db.pool,sql=>sql.query(
   "DELETE FROM ppw_groq_daily_usage WHERE usage_day=timezone('UTC',now())::date",[]));
  const accepted=await Promise.all(Array.from({length:24},
   ()=>claimAiAllowance(db.pool,8000)));
  assert.equal(accepted.filter(Boolean).length,20);
  const claim=accepted.find(Boolean)!;
  await recordAiAllowance(db.pool,claim,{ok:true,
   usage:{inputTokens:1000,outputTokens:200},
   model:"openai/gpt-oss-120b",
   limits:{dailyRequestLimit:1000,dailyRequestRemaining:977,
    minuteTokenLimit:8000,minuteTokenRemaining:4600}});
  const totals=await withSqlClient(db.pool,sql=>sql.query<{
   call_count:number;reserved_tokens:number;input:string;output:string;
   rpd_limit:number;rpd_remaining:number;tpm_limit:number;tpm_remaining:number;
   model:string}>(
   "SELECT call_count,reserved_tokens,reported_input_tokens::text AS input,"+
   "reported_output_tokens::text AS output,"+
   "provider_rpd_limit AS rpd_limit,provider_rpd_remaining AS rpd_remaining,"+
   "provider_tpm_limit AS tpm_limit,provider_tpm_remaining AS tpm_remaining,"+
   "provider_last_model AS model FROM ppw_groq_daily_usage "+
   "WHERE usage_day=timezone('UTC',now())::date",[]));
  assert.deepEqual(totals[0],{call_count:20,reserved_tokens:153200,
   input:"1000",output:"200",
   rpd_limit:1000,rpd_remaining:977,tpm_limit:8000,tpm_remaining:4600,
   model:"openai/gpt-oss-120b"});
  let invoked=false;
  const response=await requestGroqEditorial({task:"RINGSIDE",key:"unused",
   pool:db.pool,body:{max_completion_tokens:8000,messages:[]},
   transport:async()=>{invoked=true;return new Response("Not called");}});
  assert.equal(response.status,429);
  assert.equal(response.headers.get("x-ppw-budget-exhausted"),"true");
  assert.equal(invoked,false);
 }finally{
  await withSqlClient(db.pool,sql=>sql.query(
   "DELETE FROM ppw_groq_daily_usage WHERE usage_day=timezone('UTC',now())::date",[]))
   .finally(()=>db.close());
 }
});

test("Ringside previews leave atomic headroom for eight shortform requests",{
 skip:!url?"Disposable PostgreSQL unavailable":false
},async()=>{
 const db=postgresPool(url!,4);
 const reset=()=>withSqlClient(db.pool,sql=>sql.query(
  "DELETE FROM ppw_groq_daily_usage WHERE usage_day=timezone('UTC',now())::date",[]));
 try{
  await reset();
  const ringside=await Promise.all(Array.from({length:40},()=>claimAiAllowance(db.pool,1000,"RINGSIDE")));
  assert.equal(ringside.filter(Boolean).length,32);
  const short=await Promise.all(Array.from({length:12},()=>claimAiAllowance(db.pool,1000,"SHORT_NEWS")));
  assert.equal(short.filter(Boolean).length,8);
  await reset();
  const tokenLimited=await Promise.all(Array.from({length:20},()=>claimAiAllowance(db.pool,8000,"RINGSIDE")));
  assert.equal(tokenLimited.filter(Boolean).length,16);
  const tokenShort=await Promise.all(Array.from({length:8},()=>claimAiAllowance(db.pool,8000,"SHORT_NEWS")));
  assert.equal(tokenShort.filter(Boolean).length,4);
 }finally{await reset().finally(()=>db.close());}
});

test("One private Groq staff consultation serves Staff Office and Backstage, never mutating the World",{
 skip:!url?"Disposable PostgreSQL unavailable":false
},async()=>{
 const db=postgresPool(url!,4),tag=randomUUID(),worldId="consult-"+tag,
  promotionId="promotion-"+tag,playerId="owner-"+tag,personId="worker-"+tag,programmeId="programme-"+tag;
 const scope={worldId,promotionId,playerId};
 const reset=()=>withSqlClient(db.pool,sql=>sql.query(
  "DELETE FROM ppw_groq_daily_usage WHERE usage_day=timezone('UTC',now())::date",[]));
 try{
  await reset();
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:worldId,name:"Staff consultation",seed:123,rulesetVersion:"test"});
   await addPromotion(tx,worldId,{id:promotionId,name:"Consult Wrestling",tier:"LOCAL"});
   await tx.query("UPDATE ppw_worlds SET phase='OPEN',next_lock_at=now()+interval '1 day' WHERE world_id=$1",[worldId]);
   await tx.query("INSERT INTO ppw_people(world_id,person_id,name,status,fatigue) VALUES($1,$2,'Stressed Wrestler','ACTIVE',84)",[worldId,personId]);
   await tx.query("INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,family,status,remaining_dates,start_week_index,expires_week_index) VALUES($1,$2,$3,$4,'LIMITED_NON_EXCLUSIVE','SIGNED',10,0,25)",
    [worldId,"deal-"+tag,personId,promotionId]);
   await tx.query("INSERT INTO ppw_programmes(world_id,promotion_id,programme_id,status,repetition) VALUES($1,$2,$3,'ACTIVE',5)",
    [worldId,promotionId,programmeId]);
   await tx.query("INSERT INTO ppw_programme_side_refs(world_id,promotion_id,programme_id,side,position,ref_kind,ref_id) VALUES($1,$2,$3,'A',0,'PERSON',$4)",
    [worldId,promotionId,programmeId,personId]);
   for(const role of ["MEDICAL","CREATIVE"] as const){
    const employee=worldStaff("123").find(x=>x.role===role)!;
    await tx.query("INSERT INTO ppw_staff_employments(world_id,employment_id,staff_id,promotion_id,role,status,weekly_salary,start_week_index,expires_week_index,term_weeks,morale) VALUES($1,$2,$3,$4,$5,'ACTIVE',500,0,51,52,70)",
     [worldId,role+"-"+tag,employee.staffId,promotionId,role]);
   }
  });
  assert.equal((await joinWorld(db.pool,{worldId,playerId,requestId:"join-"+tag,expectedRevision:0})).status,"APPLIED");
  const claimed=await submitPromotionClaim(db.pool,{worldId,playerId,promotionId,requestId:"claim-"+tag,expectedRevision:1});
  assert.equal(claimed.status,"APPLIED");
  const before=await withSqlClient(db.pool,tx=>readWorldMail(tx,scope));
  const debate=before.find(x=>x.canDisagree)!;assert.ok(debate);
  let calls=0;
  const transport:typeof fetch=async(url,init)=>{
   calls++;assert.match(String(url),/api\.groq\.com/);
   const body=JSON.parse(String(init?.body));assert.equal(body.model,"openai/gpt-oss-20b");
   assert.equal(body.max_completion_tokens,650);
   const sources=JSON.parse(body.messages[1].content) as {key:string;role:string}[];
   assert.ok(sources.length<=5);assert.ok(sources.some(s=>s.key==="debate-MEDICAL"));
   const opinions:Record<string,string>={
    "staff-MEDICAL":"I would put sustainable workload ahead of a dramatic moment every time.",
    "staff-CREATIVE":"I'd rather give the audience a new question than recycle an old answer.",
    "debate-MEDICAL":"My priority is protecting the people who make the whole show possible.",
    "debate-CREATIVE":"I think a different motive could make this rivalry feel worth following again."
   };
   return new Response(JSON.stringify({choices:[{finish_reason:"stop",message:{content:JSON.stringify(
    Object.fromEntries(sources.map(s=>[s.key,{choice:0,opinion:opinions[s.key]}]))
   )}}],usage:{prompt_tokens:900,completion_tokens:220}}));
  };
  const opts={enabled:true,key:"dummy",transport};
  const disabled=await readStaffConsultation(db.pool,scope,{...opts,enabled:false});
  assert.equal(disabled.status,"UNAVAILABLE");assert.equal(calls,0);
  const concurrent=await Promise.all([readStaffConsultation(db.pool,scope,opts),readStaffConsultation(db.pool,scope,opts)]);
  assert.equal(calls,1);assert.ok(concurrent.some(r=>r.status==="READY"));
  const cached=await readStaffConsultation(db.pool,scope,opts);
  assert.equal(cached.status,"READY");assert.equal(calls,1);
  assert.equal(cached.items.filter(x=>x.mailId===debate.id).length,2);
  assert.ok(cached.items.some(x=>!x.mailId));
  assert.equal(cached.revision,claimed.revision);
  assert.deepEqual(await withSqlClient(db.pool,tx=>readWorldMail(tx,scope)),before);
  await assert.rejects(readStaffConsultation(db.pool,{...scope,playerId:"outsider"},opts),/access denied/);
  assert.equal(calls,1);
  await withSqlClient(db.pool,tx=>tx.query("UPDATE ppw_people SET fatigue=30 WHERE world_id=$1 AND person_id=$2",[worldId,personId]));
  const stale=await readStaffConsultation(db.pool,scope,opts);
  assert.equal(stale.status,"FALLBACK");assert.equal(stale.items.length,0);assert.equal(calls,1);
  const world=await withSqlClient(db.pool,tx=>tx.query<{revision:string}>("SELECT revision::text FROM ppw_worlds WHERE world_id=$1",[worldId]));
  assert.equal(Number(world[0]?.revision),claimed.revision);
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_staff_consultations","ppw_player_attention_dismissals",
    "ppw_programme_side_refs","ppw_staff_continuity_settings","ppw_staff_employments","ppw_programmes",
    "ppw_ledger_events","ppw_command_receipts","ppw_promotion_controls","ppw_memberships","ppw_contracts","ppw_people","ppw_promotions"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[playerId]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
  }).finally(()=>reset().finally(()=>db.close()));
 }
});
