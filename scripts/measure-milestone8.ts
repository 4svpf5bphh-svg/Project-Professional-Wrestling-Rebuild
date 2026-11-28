import assert from "node:assert/strict";
import {resolve} from "node:path";
import {request} from "@playwright/test";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {startMilestone8Host} from "../tests/fixtures/milestone8-local-host.js";
import {accessCode,disposableDatabaseUrl,managerId,promotionId,seedMilestone8World}
 from "../tests/fixtures/milestone8-local-world.js";

const [root=".",size="2",replicate="1"]=process.argv.slice(2);
assert.ok(["2","8","13"].includes(size));
assert.match(replicate,/^[a-z0-9]{1,12}$/);
const companies=Number(size);
const url=disposableDatabaseUrl(process.env.PPW_M8_DATABASE_URL).href;
const worldId="m8-benchmark-"+size+"-"+replicate;
const db=postgresPool(url);
try{
 await seedMilestone8World(db.pool,worldId,{companies,benchmark:true});
 const host=await startMilestone8Host(resolve(root),url,worldId);
 const browser=await request.newContext({baseURL:host.origin,ignoreHTTPSErrors:true,
  extraHTTPHeaders:{origin:host.origin}});
 try{
  assert.equal((await browser.post("/api/auth",{data:{playerId:managerId,accessCode}})).status(),200);
  async function body(response:Awaited<ReturnType<typeof browser.get>>){
   const text=await response.text();
   assert.ok(response.ok(),response.status()+": "+text);
   return JSON.parse(text);
  }
  const session=await body(await browser.get("/api/session"));
  const home=host.samples.at(-1);
  const headers={"x-ppw-csrf":session.csrfToken};
  const card=(method:string,options:Record<string,unknown>={})=>
   browser.post("/api/card",{headers,data:{method,worldId,promotionId,showId:"tv-1",...options}});
  const edit=await body(await card("load"));
  const booking=host.samples.at(-1);
  const participant=(personId:string)=>({personId,contractId:"deal-"+personId});
  const pair=[participant("samoa-joe"),participant("will-ospreay")];
  const match={matchType:"SINGLES",family:"INDIVIDUAL",participants:pair,
   sides:[{sideId:"A",participants:[pair[0]]},{sideId:"B",participants:[pair[1]]}],
   scriptedWinnerSide:"B",plannedFinish:"CLEAN_PIN",intent:"COMPETITIVE",plannedLengthMinutes:18};
  const saved=await body(await card("save",{requestId:"measure-save",expectedRevision:edit.worldRevision,
   matches:[{slotId:"main",payload:match}],segments:[],runningOrder:["main"]}));
  assert.equal(saved.status,"APPLIED");
  const ready=await body(await card("ready",{requestId:"measure-ready",expectedRevision:saved.revision,
   confirmReadyToRun:true}));
  assert.equal(ready.status,"APPLIED");
  const preparation=host.samples.slice(-2);
  let published=false;
  const from=host.samples.length,started=performance.now();
  for(let batch=0;batch<18;batch++){
   const result=await body(await browser.post("/api/playtest-week",{headers,data:{
    confirm:"ADVANCE_SHARED_WORLD",year:1,week:1}}));
   if(result.status==="PUBLISHED"){published=true;break;}
   assert.equal(result.status,"LIMIT_REACHED",JSON.stringify(result));
  }
  assert.ok(published,"Exact production operator route must publish a real week");
  const milliseconds=Number((performance.now()-started).toFixed(2));
  const weekly=host.samples.slice(from).reduce((total,row)=>({
   requests:total.requests+1,bytes:total.bytes+row.bytes,
   sqlStatements:total.sqlStatements+row.sqlStatements,sqlResultRows:total.sqlResultRows+row.sqlResultRows,
   sqlChangedRows:total.sqlChangedRows+row.sqlChangedRows,sqlResultBytes:total.sqlResultBytes+row.sqlResultBytes,
  }),{requests:0,bytes:0,sqlStatements:0,sqlResultRows:0,sqlChangedRows:0,sqlResultBytes:0});
  const [facts]=await withWorldTransaction(db.pool,tx=>tx.query<{certified:number;shows:number;week:number}>(`
   SELECT certified_promotions AS certified,w.week,
    (SELECT count(*)::integer FROM ppw_completed_shows c WHERE c.world_id=w.world_id AND c.week=1) AS shows
   FROM ppw_worlds w JOIN ppw_week_resolution_seals s ON s.world_id=w.world_id
   WHERE w.world_id=$1 AND s.year=1 AND s.week=1`,[worldId]));
  assert.equal(facts?.certified,companies);
  assert.equal(facts?.week,2);
  assert.equal(host.providerRequests,0);
  console.log(JSON.stringify({companies,replicate,home,booking,preparation,
   weekly:{...weekly,milliseconds},facts,providerRequests:host.providerRequests}));
 }finally{
  await browser.dispose();
  await host.close();
 }
}finally{await db.close();}
