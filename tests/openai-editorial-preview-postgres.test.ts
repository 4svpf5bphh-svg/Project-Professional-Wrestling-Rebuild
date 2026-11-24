import test from "node:test";
import assert from "node:assert/strict";
import {postgresPool,withSqlClient} from "../src/db/postgres.js";
import {claimOpenAiPreview,settleOpenAiPreview,requestOpenAiEditorialPreview,
 estimateTerraPreviewMicropounds,claimOpenAiMonthlyPreview,OPENAI_MONTHLY_CAP_MICROPOUNDS}
 from "../src/db/openai-editorial-preview.js";
const url=process.env.PPW_NEON_TEST_URL;
test("Paid OpenAI comparisons are off unless separately opted in",async()=>{
 const {paidPreviewEnabled}=await import("../src/db/openai-editorial-preview.js");
 assert.equal(paidPreviewEnabled({OPENAI_API_KEY:"fixture"}),false);
 assert.equal(paidPreviewEnabled({PPW_ALLOW_PAID_AI_PREVIEW:"YES"}),false);
 assert.equal(paidPreviewEnabled({PPW_ALLOW_PAID_AI_PREVIEW:"YES",OPENAI_API_KEY:"fixture"}),true);
 let queried=false,called=false;
 const pool={connect:async()=>{queried=true;throw Error("No SQL allowed");}};
 const result=await requestOpenAiEditorialPreview({
  key:"fixture",enabled:false,pool:pool as never,
  body:{max_completion_tokens:400,messages:[]},
  transport:async()=>{called=true;throw Error("No paid API allowed");}
 });
 assert.equal(result.status,403);assert.equal(queried,false);assert.equal(called,false);
});
test("Paid preview caps simultaneous multiplayer calls and never touches Groq usage",{
 skip:!url?"Disposable PostgreSQL not configured":false
},async()=>{
 const db=postgresPool(url!,4);
 try{
  await withSqlClient(db.pool,sql=>sql.query(
   "DELETE FROM ppw_openai_preview_daily_usage WHERE usage_day=timezone('UTC',now())::date",[]));
  const claims=await Promise.all(Array.from({length:8},
   ()=>claimOpenAiPreview(db.pool,10000)));
  assert.equal(claims.filter(Boolean).length,4,"four paid previews per UTC day");
  await settleOpenAiPreview(db.pool,claims.find(Boolean)!,{
   ok:true,usage:{inputTokens:500,outputTokens:350}});
  const stats=await withSqlClient(db.pool,sql=>sql.query<{
   call_count:number;reserved_tokens:number;input:string;output:string}>(
   "SELECT call_count,reserved_tokens,reported_input_tokens::text AS input,"+
   "reported_output_tokens::text AS output FROM ppw_openai_preview_daily_usage "+
   "WHERE usage_day=timezone('UTC',now())::date",[]));
  assert.deepEqual(stats[0],{
   call_count:4,reserved_tokens:30850,input:"500",output:"350"});
  let invoked=false;
  const blocked=await requestOpenAiEditorialPreview({
   key:"fixture",enabled:true,pool:db.pool,
   body:{max_completion_tokens:500,messages:[]},
   transport:async()=>{invoked=true;return new Response("Unexpected");}});
  assert.equal(blocked.status,429);assert.equal(invoked,false);
 }finally{
  await withSqlClient(db.pool,sql=>sql.query(
   "DELETE FROM ppw_openai_preview_daily_usage WHERE usage_day=timezone('UTC',now())::date",[]))
   .finally(()=>db.close());
 }
});

test("Terra request reserves conservative money and strips unsupported temperature",()=>{
 const body=JSON.stringify({messages:[{role:"user",content:"Nine-card Ascension"}],
  max_completion_tokens:3600});
 const reserved=estimateTerraPreviewMicropounds(body,3600);
 assert.ok(reserved>18000&&reserved<50000);
 assert.ok(reserved<OPENAI_MONTHLY_CAP_MICROPOUNDS);
 assert.throws(()=>estimateTerraPreviewMicropounds(body,9000),/budget/);
});
test("Monthly preview budget is shared and blocks before the paid request",{
 skip:!url?"Disposable PostgreSQL not configured":false
},async()=>{
 const db=postgresPool(url!,4);
 try{
  await withSqlClient(db.pool,sql=>sql.query(
   "DELETE FROM ppw_openai_preview_monthly_usage WHERE usage_month=date_trunc('month',timezone('UTC',now()))::date",[]));
  const claims=await Promise.all(Array.from({length:12},
   ()=>claimOpenAiMonthlyPreview(db.pool,300000)));
  assert.equal(claims.filter(Boolean).length,10,"£3 aggregate budget is atomic");
  let invoked=false;
  const blocked=await requestOpenAiEditorialPreview({
   key:"fixture",enabled:true,pool:db.pool,
   body:{max_completion_tokens:500,messages:[]},
   transport:async()=>{invoked=true;return new Response("Unexpected");}
  });
  assert.equal(blocked.status,429);assert.equal(invoked,false);
 }finally{
  await withSqlClient(db.pool,sql=>sql.query(
   "DELETE FROM ppw_openai_preview_monthly_usage WHERE usage_month=date_trunc('month',timezone('UTC',now()))::date",[])).finally(()=>db.close());
 }
});

test("Successful Terra request settles a measured charge; failed request retains a safe reserve",{
 skip:!url?"Disposable PostgreSQL not configured":false
},async()=>{
 const db=postgresPool(url!,4);
 const day="timezone('UTC',now())::date";
 const month="date_trunc('month',timezone('UTC',now()))::date";
 try{
  await withSqlClient(db.pool,sql=>sql.query(
   "DELETE FROM ppw_openai_preview_daily_usage WHERE usage_day="+day,[]));
  await withSqlClient(db.pool,sql=>sql.query(
   "DELETE FROM ppw_openai_preview_monthly_usage WHERE usage_month="+month,[]));
  let calls=0;
  const successful=await requestOpenAiEditorialPreview({
   key:"test-only",enabled:true,pool:db.pool,
   body:{max_completion_tokens:750,temperature:1.05,messages:[{role:"user",content:"fixture"}]},
   transport:async(_url,init)=>{
    calls++;
    const body=JSON.parse(String(init?.body)) as Record<string,unknown>;
    assert.equal(body.model,"gpt-6.1-terra");
    assert.equal(body.reasoning_effort,"low");
    assert.equal(body.temperature,undefined);
    assert.equal(body.store,false);
    return new Response(JSON.stringify({
     usage:{prompt_tokens:500,completion_tokens:800},
     choices:[{message:{content:"valid fixture"}}]
    }),{status:200});
   }
  });
  assert.equal(successful.status,200);
  const first=await withSqlClient(db.pool,sql=>sql.query<{
   spent:string;reserved:string;calls:number;inp:string;out:string
  }>(
   "SELECT spent_micropounds::text AS spent,reserved_micropounds::text AS reserved,"+
   "call_count AS calls,reported_input_tokens::text AS inp,"+
   "reported_output_tokens::text AS out "+
   "FROM ppw_openai_preview_monthly_usage WHERE usage_month="+month,[]));
  assert.deepEqual(first[0],{
   spent:"9000",reserved:"0",calls:1,inp:"500",out:"800"
  });
  const rejected=await requestOpenAiEditorialPreview({
   key:"test-only",enabled:true,pool:db.pool,
   body:{max_completion_tokens:750,messages:[{role:"user",content:"second fixture"}]},
   transport:async()=>{calls++;return new Response("Temporary provider failure",{status:502});}
  });
  assert.equal(rejected.status,502);
  assert.equal(calls,2);
  const last=await withSqlClient(db.pool,sql=>sql.query<{
   spent:string;reserved:string;calls:number
  }>(
   "SELECT spent_micropounds::text AS spent,reserved_micropounds::text AS reserved,"+
   "call_count AS calls FROM ppw_openai_preview_monthly_usage WHERE usage_month="+month,[]));
  assert.equal(last[0]?.reserved,"0");
  assert.equal(last[0]?.calls,2);
  assert.ok(Number(last[0]?.spent)>Number(first[0]?.spent),
   "Unknown billable failure conservatively consumes the reserved allowance");
 }finally{
  await withSqlClient(db.pool,sql=>sql.query(
   "DELETE FROM ppw_openai_preview_daily_usage WHERE usage_day="+day,[]));
  await withSqlClient(db.pool,sql=>sql.query(
   "DELETE FROM ppw_openai_preview_monthly_usage WHERE usage_month="+month,[]))
   .finally(()=>db.close());
 }
});

test("Known OpenAI 429 billing refusal releases only the monthly MONEY reservation",{
 skip:!url?"Disposable PostgreSQL not configured":false
},async()=>{
 const db=postgresPool(url!,4);
 const day="timezone('UTC',now())::date";
 const month="date_trunc('month',timezone('UTC',now()))::date";
 try{
  await withSqlClient(db.pool,sql=>sql.query(
   "DELETE FROM ppw_openai_preview_daily_usage WHERE usage_day="+day,[]));
  await withSqlClient(db.pool,sql=>sql.query(
   "DELETE FROM ppw_openai_preview_monthly_usage WHERE usage_month="+month,[]));
  let calls=0;
  const denied=await requestOpenAiEditorialPreview({
   key:"fixture",enabled:true,pool:db.pool,
   body:{max_completion_tokens:750,messages:[{role:"user",content:"fixture"}]},
   transport:async()=>{
    calls++;
    return new Response(JSON.stringify({error:{type:"insufficient_quota",
     code:"credit_balance_exhausted",message:"Do not expose any private key"}}),
     {status:429});
   }
  });
  assert.equal(denied.status,429);
  assert.equal(denied.headers.get("x-ppw-openai-error-kind"),"CREDITS");
  assert.equal(denied.headers.get("x-ppw-openai-error-code"),
   "credit_balance_exhausted");
  assert.equal(calls,1,"Never automatically retry a credit error");
  const monthly=await withSqlClient(db.pool,sql=>sql.query<{
   spent:string;reserved:string;calls:number
  }>(
   "SELECT spent_micropounds::text AS spent,reserved_micropounds::text AS reserved,"+
   "call_count AS calls FROM ppw_openai_preview_monthly_usage WHERE usage_month="+month,[]));
  assert.deepEqual(monthly[0],{spent:"0",reserved:"0",calls:1});
  const daily=await withSqlClient(db.pool,sql=>sql.query<{
   call_count:number;failed_calls:number
  }>("SELECT call_count,failed_calls FROM ppw_openai_preview_daily_usage "+
   "WHERE usage_day="+day,[]));
  assert.deepEqual(daily[0],{call_count:1,failed_calls:1},
   "Keep daily attempt limit to stop unlimited credit-rejection retries");
 }finally{
  await withSqlClient(db.pool,sql=>sql.query(
   "DELETE FROM ppw_openai_preview_daily_usage WHERE usage_day="+day,[]));
  await withSqlClient(db.pool,sql=>sql.query(
   "DELETE FROM ppw_openai_preview_monthly_usage WHERE usage_month="+month,[]))
   .finally(()=>db.close());
 }
});
test("Unclassified 429 retains the conservative reserve to avoid undercounting",{
 skip:!url?"Disposable PostgreSQL not configured":false
},async()=>{
 const db=postgresPool(url!,4);
 const month="date_trunc('month',timezone('UTC',now()))::date";
 const day="timezone('UTC',now())::date";
 try{
  await withSqlClient(db.pool,sql=>sql.query(
   "DELETE FROM ppw_openai_preview_daily_usage WHERE usage_day="+day,[]));
  await withSqlClient(db.pool,sql=>sql.query(
   "DELETE FROM ppw_openai_preview_monthly_usage WHERE usage_month="+month,[]));
  const resp=await requestOpenAiEditorialPreview({
   key:"fixture",enabled:true,pool:db.pool,
   body:{max_completion_tokens:750,messages:[]},
   transport:async()=>new Response(JSON.stringify({error:{message:"Not enough"}}),
    {status:429})
  });
  assert.equal(resp.headers.get("x-ppw-openai-error-kind"),"UNKNOWN_429");
  const usage=await withSqlClient(db.pool,sql=>sql.query<{spent:string}>(
   "SELECT spent_micropounds::text AS spent FROM ppw_openai_preview_monthly_usage "+
   "WHERE usage_month="+month,[]));
  assert.ok(Number(usage[0]!.spent)>0,
   "Do not silently refund an error whose billing status cannot be classified");
 }finally{
  await withSqlClient(db.pool,sql=>sql.query(
   "DELETE FROM ppw_openai_preview_daily_usage WHERE usage_day="+day,[]));
  await withSqlClient(db.pool,sql=>sql.query(
   "DELETE FROM ppw_openai_preview_monthly_usage WHERE usage_month="+month,[]))
   .finally(()=>db.close());
 }
});

test("Daily token cap independently limits Terra even below four attempts",{
 skip:!url?"Disposable PostgreSQL not configured":false
},async()=>{
 const db=postgresPool(url!,4);
 const day="timezone('UTC',now())::date";
 try{
  await withSqlClient(db.pool,sql=>sql.query(
   "DELETE FROM ppw_openai_preview_daily_usage WHERE usage_day="+day,[]));
  const claims=await Promise.all(Array.from({length:4},
   ()=>claimOpenAiPreview(db.pool,25000)));
  assert.equal(claims.filter(Boolean).length,2,
   "50k daily token budget is independent of the four-attempt cap");
 }finally{
  await withSqlClient(db.pool,sql=>sql.query(
   "DELETE FROM ppw_openai_preview_daily_usage WHERE usage_day="+day,[]))
   .finally(()=>db.close());
 }
});
test("An already-expired deadline never calls OpenAI or consumes monthly money",{
 skip:!url?"Disposable PostgreSQL not configured":false
},async()=>{
 const db=postgresPool(url!,4);
 const day="timezone('UTC',now())::date";
 const month="date_trunc('month',timezone('UTC',now()))::date";
 try{
  await withSqlClient(db.pool,sql=>sql.query(
   "DELETE FROM ppw_openai_preview_daily_usage WHERE usage_day="+day,[]));
  await withSqlClient(db.pool,sql=>sql.query(
   "DELETE FROM ppw_openai_preview_monthly_usage WHERE usage_month="+month,[]));
  const controller=new AbortController();controller.abort();
  let calls=0;
  await assert.rejects(()=>requestOpenAiEditorialPreview({
   key:"fixture",enabled:true,pool:db.pool,signal:controller.signal,
   body:{max_completion_tokens:750,messages:[]},
   transport:async()=>{calls++;return new Response("Not called");}
  }));
  assert.equal(calls,0);
  const ledger=await withSqlClient(db.pool,sql=>sql.query<{
   spent:string;reserved:string
  }>("SELECT spent_micropounds::text AS spent,reserved_micropounds::text AS reserved "+
   "FROM ppw_openai_preview_monthly_usage WHERE usage_month="+month,[]));
  assert.deepEqual(ledger[0],{spent:"0",reserved:"0"});
 }finally{
  await withSqlClient(db.pool,sql=>sql.query(
   "DELETE FROM ppw_openai_preview_daily_usage WHERE usage_day="+day,[]));
  await withSqlClient(db.pool,sql=>sql.query(
   "DELETE FROM ppw_openai_preview_monthly_usage WHERE usage_month="+month,[]))
   .finally(()=>db.close());
 }
});
