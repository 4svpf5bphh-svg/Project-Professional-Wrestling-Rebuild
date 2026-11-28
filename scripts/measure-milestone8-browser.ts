import assert from "node:assert/strict";
import {resolve} from "node:path";
import {chromium, type Page} from "@playwright/test";
import {postgresPool} from "../src/db/postgres.js";
import {startMilestone8Host} from "../tests/fixtures/milestone8-local-host.js";
import {accessCode, disposableDatabaseUrl, managerId, seedMilestone8World}
 from "../tests/fixtures/milestone8-local-world.js";

const [appRoot=".",sampleLabel="one"]=process.argv.slice(2);
if(!/^[a-z0-9]{1,16}$/.test(sampleLabel))throw new Error("Invalid sample label");
const database=disposableDatabaseUrl(process.env.PPW_M8_DATABASE_URL).href;
const worldId="m8-frontend-comparison-"+sampleLabel;
const db=postgresPool(database);

async function measure(page:Page,open:()=>Promise<unknown>){
 await open();
 await page.locator("#game .ppw-home-phase-tag").waitFor();
 return page.evaluate(()=>{
  const entries=performance.getEntriesByType("resource") as PerformanceResourceTiming[];
  const sizes={jsEncodedBytes:0,cssEncodedBytes:0,jsTransferredBytes:0,cssTransferredBytes:0};
  for(const entry of entries){
   const path=new URL(entry.name).pathname;
   if(path.endsWith(".js")){
    sizes.jsEncodedBytes+=entry.encodedBodySize;
    sizes.jsTransferredBytes+=entry.transferSize;
   }else if(path.endsWith(".css")){
    sizes.cssEncodedBytes+=entry.encodedBodySize;
    sizes.cssTransferredBytes+=entry.transferSize;
   }
  }
  return {milliseconds:Math.round(performance.now()),...sizes};
 });
}

try{
 await seedMilestone8World(db.pool,worldId);
 const host=await startMilestone8Host(resolve(appRoot),database,worldId);
 try{
  const browser=await chromium.launch({executablePath:process.env.PPW_M8_CHROMIUM});
  try{
   const entry=await browser.newContext({ignoreHTTPSErrors:true,
    extraHTTPHeaders:{origin:host.origin},serviceWorkers:"block"});
   const login=await entry.request.post(host.origin+"/api/auth",{data:{playerId:managerId,accessCode}});
   if(!login.ok())throw new Error("Disposable manager registration failed: "+login.status());
   const storageState=await entry.storageState();
   await entry.close();

   const samples=[];
   for(let repetition=1;repetition<=3;repetition++){
    const context=await browser.newContext({storageState,ignoreHTTPSErrors:true,
     viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:"block"});
    try{
     const page=await context.newPage();
     const start=host.samples.length;
     const cold=await measure(page,()=>page.goto(host.origin+"/#/home"));
     const warm=await measure(page,()=>page.reload());
     const measuredRequests=(from:number)=>host.samples.slice(from).map(({path,bytes,sqlStatements})=>({
      path,bytes,sqlStatements,
     }));
     const requests=measuredRequests(start);
     const titleStart=host.samples.length;
     const titleUrl=host.origin+"/#/championships";
     const titleDesk=page.getByRole("heading",{name:"My Champions",exact:true});
     await page.goto(titleUrl);
     await titleDesk.waitFor();
     await page.setViewportSize({width:320,height:844});
     await page.goto(titleUrl);
     await titleDesk.waitFor();
     const championshipRequests=measuredRequests(titleStart);
     assert.equal(championshipRequests.filter(sample=>sample.path==="/api/card").length,1);
     samples.push({repetition,cold,warm,requests,championshipRequests});
    }finally{await context.close();}
   }
   console.log(JSON.stringify({samples,providerRequests:host.providerRequests},null,2));
  }finally{await browser.close();}
 }finally{await host.close();}
}finally{await db.close();}
