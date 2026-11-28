import {randomUUID} from "node:crypto";
import {resolve} from "node:path";
import {expect,test,type Locator,type Page} from "@playwright/test";
import {postgresPool} from "../../src/db/postgres.js";
import {withWorldTransaction} from "../../src/db/transaction.js";
import {startMilestone8Host} from "../fixtures/milestone8-local-host.js";
import {accessCode,disposableDatabaseUrl,managerId,seedMilestone8World} from "../fixtures/milestone8-local-world.js";

const baselineRoot=process.env.PPW_M8_BASELINE_APP_ROOT;
const candidateRoot=process.env.PPW_M8_APP_ROOT??".";
test.skip(!baselineRoot||!process.env.PPW_M8_DATABASE_URL,
 "Build both application revisions and point PPW_M8_BASELINE_APP_ROOT and PPW_M8_DATABASE_URL at the local comparison fixtures.");

const cardPlan=[
 {label:"Build a weekly card",names:["Alex Shelley","Chris Sabin"],winner:1,minutes:12},
 {label:"Book feature match",names:["AJ Styles","Kurt Angle"],winner:1,minutes:16},
 {label:"Book main event",names:["Samoa Joe","Will Ospreay"],winner:1,minutes:22},
] as const;

const control=(page:Page|Locator,name:string|RegExp)=>
 page.getByRole("button",{name,exact:typeof name==="string"});

async function prepareShow(page:Page,variant:"baseline"|"candidate"){
 const update=variant==="candidate";
 let taps=0,durationEntries=0;
 const tap=async(locator:Locator)=>{await locator.tap();taps++;};
 const started=performance.now();
 await tap(control(page,"Edit card").first());
 for(const match of cardPlan){
  await tap(control(page,update?match.label:"+ Add match"));
  const editor=page.getByRole("dialog",{name:"Edit match"});
  if(!update){
   await tap(control(editor,"Continue · Select wrestlers"));
   await tap(control(editor,"Choose wrestler").first());
  }
  const picker=page.getByRole("dialog",{name:"Choose wrestler"});
  for(const name of match.names)await tap(picker.locator(".ppw-wrestler-card").filter({hasText:name}));
  if(!update)await tap(control(editor,"Next · Script outcome"));
  await tap(editor.locator(".ppw-winner-choice").nth(match.winner));
  if(!update){
   const minutes=editor.getByLabel("Minutes",{exact:true});
   await minutes.fill(String(match.minutes));
   await minutes.press("Tab");
   durationEntries++;
   await tap(control(editor,"Next · Staff briefing"));
  }
  await tap(control(editor,update?"Add match to card":"Complete match"));
 }
 await tap(control(page,"Save changes"));
 await expect(page.getByText("Show card saved",{exact:true})).toBeVisible();
 await tap(control(page,"Confirm show"));
 await expect(control(page,"Confirmed")).toBeDisabled();
 return {taps,durationEntries,milliseconds:Math.round(performance.now()-started)};
}

test("identical three-match weekly cards through authenticated baseline and Milestone 8",async({browser},testInfo)=>{
 test.setTimeout(180_000);
 const url=disposableDatabaseUrl(process.env.PPW_M8_DATABASE_URL).href;
 const db=postgresPool(url);
 const observations=[];
 try{
  // Each revision caches its hosted configuration per process. Run repeated
  // pairs with Playwright --repeat-each so each sample gets fresh API modules.
  const order=testInfo.repeatEachIndex%2===0?["baseline","candidate"] as const:
   ["candidate","baseline"] as const;
  for(const variant of order){
   const worldId="m8-booking-comparison-"+randomUUID();
   await seedMilestone8World(db.pool,worldId);
   const host=await startMilestone8Host(resolve(variant==="baseline"?baselineRoot!:candidateRoot),url,worldId);
   const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:390,height:844},
    isMobile:true,hasTouch:true,reducedMotion:"reduce"});
   try{
    const page=await context.newPage();
    await page.goto(host.origin+"/#/planner");
    await page.getByRole("textbox",{name:"Player ID"}).fill(managerId);
    await page.getByRole("textbox",{name:"Private access code"}).fill(accessCode);
    await control(page,"Sign in").tap();
    await expect(page.locator(".ppw-shell-brand strong")).toHaveText("Crown Wrestling");
    await page.goto(host.origin+"/#/planner");
    await expect(control(page,"Edit card").first()).toBeVisible();
    const start=host.samples.length;
    const flow=await prepareShow(page,variant);
    const requests=host.samples.slice(start);
    const saved=await withWorldTransaction(db.pool,tx=>tx.query<{
     position:number;minutes:number;winner:string;finish:string;person_a:string;person_b:string;
    }>(`SELECT position,(payload->>'plannedLengthMinutes')::integer AS minutes,
     payload->>'scriptedWinnerSide' AS winner,payload->>'plannedFinish' AS finish,
     payload #>> '{sides,0,participants,0,personId}' AS person_a,
     payload #>> '{sides,1,participants,0,personId}' AS person_b
     FROM ppw_card_slots WHERE world_id=$1 AND draft_id='tv-1' ORDER BY position`,[worldId]));
    expect(saved.map(slot=>[slot.minutes,slot.winner,slot.finish,slot.person_a,slot.person_b])).toEqual([
     [12,"B","CLEAN_PIN","alex-shelley","chris-sabin"],
     [16,"B","CLEAN_PIN","aj-styles","kurt-angle"],
     [22,"B","CLEAN_PIN","samoa-joe","will-ospreay"],
    ]);
    observations.push({variant,...flow,requests:requests.length,
     sqlStatements:requests.reduce((total,request)=>total+request.sqlStatements,0),
     apiBytes:requests.reduce((total,request)=>total+request.bytes,0)});
    expect(host.providerRequests).toBe(0);
   }finally{await context.close();await host.close();}
  }
 }finally{await db.close();}
 const baseline=observations.find(sample=>sample.variant==="baseline")!;
 const candidate=observations.find(sample=>sample.variant==="candidate")!;
 expect(candidate.taps).toBeLessThanOrEqual(baseline.taps*.7);
 console.log("Milestone 8 booking comparison",JSON.stringify(observations));
 await testInfo.attach("Booking comparison",{body:JSON.stringify(observations,null,2),contentType:"application/json"});
});
