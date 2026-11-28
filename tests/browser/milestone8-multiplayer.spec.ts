import {randomUUID} from "node:crypto";
import {resolve} from "node:path";
import {expect,test,type Page} from "@playwright/test";
import {postgresPool} from "../../src/db/postgres.js";
import {withWorldTransaction} from "../../src/db/transaction.js";
import {startMilestone8Host} from "../fixtures/milestone8-local-host.js";
import {accessCode,disposableDatabaseUrl,managerId,promotionId,rivalManagerId,
 rivalPromotionId,seedMilestone8World} from "../fixtures/milestone8-local-world.js";

test.skip(!process.env.PPW_M8_DATABASE_URL,"Use a migrated disposable PostgreSQL instance.");

test("two signed managers retain private cards through World readiness and venue arbitration",async({page,browser})=>{
 const worldId="m8-two-managers-"+randomUUID();
 const database=disposableDatabaseUrl(process.env.PPW_M8_DATABASE_URL).href;
 const db=postgresPool(database);
 try{
  await seedMilestone8World(db.pool,worldId,{secondManager:true});
  // Both broadcasts request Wednesday at the same arena. Each manager
  // explicitly authorises the same-day alternative before World Lock.
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query(`UPDATE ppw_commercial_deals SET airing_day=3
    WHERE world_id=$1 AND promotion_id=$2 AND kind='BROADCAST'`,[worldId,rivalPromotionId]);
   await tx.query(`UPDATE ppw_booking_drafts SET show_day=3,venue_id='arena-0'
    WHERE world_id=$1 AND draft_id='atlas-1'`,[worldId]);
  });
  const host=await startMilestone8Host(resolve(process.env.PPW_M8_APP_ROOT??"."),database,worldId);
  const rivalContext=await browser.newContext({ignoreHTTPSErrors:true,isMobile:true,
   hasTouch:true,viewport:{width:390,height:844}});
  try{
   const rival=await rivalContext.newPage();
   async function signIn(manager:Page,id:string,brand:string){
    await manager.goto(host.origin+"/#/home");
    await manager.getByRole("textbox",{name:"Player ID"}).fill(id);
    await manager.getByRole("textbox",{name:"Private access code"}).fill(accessCode);
    await manager.getByRole("button",{name:"Sign in",exact:true}).tap();
    await expect(manager.locator(".ppw-shell-brand strong")).toHaveText(brand);
   }
   await signIn(page,managerId,"Crown Wrestling");
   await signIn(rival,rivalManagerId,"Atlas Wrestling");
   await expect(rival.getByText("Match still to book",{exact:false})).toHaveCount(0);
   await expect(rival.getByRole("button",{name:"Showtime controls"})).toHaveCount(0);

   async function saveAndConfirm(manager:Page,scope:string,showId:string,people:string[]){
    const session=await (await manager.request.get(host.origin+"/api/session")).json();
    const headers={origin:host.origin,"x-ppw-csrf":session.csrfToken};
    const call=(method:string,fields:Record<string,unknown>={})=>manager.request.post(
     host.origin+"/api/card",{headers,data:{method,worldId,promotionId:scope,showId,...fields}});
    const edit=await (await call("load")).json();
    expect(edit.showId).toBe(showId);
    const casting=people.map(personId=>({personId,contractId:"deal-"+personId}));
    const save=await call("save",{requestId:"save-"+showId,expectedRevision:edit.worldRevision,
     matches:[{slotId:"opener",payload:{matchType:"SINGLES",family:"INDIVIDUAL",
      participants:casting,sides:[{sideId:"A",participants:[casting[0]]},
       {sideId:"B",participants:[casting[1]]}],scriptedWinnerSide:"B",
      plannedFinish:"CLEAN_PIN",intent:"COMPETITIVE",plannedLengthMinutes:14}}],
     segments:[],runningOrder:["opener"]});
    const saved=await save.json();
    expect(saved,saved.error).toMatchObject({status:"APPLIED"});
    const delegation=await (await call("setStaffContinuity",{
     requestId:"delegate-"+showId,expectedRevision:saved.revision,allowUnfinishedFallback:false,
     allowLogisticsFallback:true,permittedDays:[3],permittedVenueIds:["arena-0","arena-1"],
    })).json();
    expect(delegation,delegation.error).toMatchObject({status:"APPLIED"});
    const ready=await (await call("ready",{requestId:"ready-"+showId,
     expectedRevision:delegation.revision,confirmReadyToRun:true})).json();
    expect(ready,ready.error).toMatchObject({status:"APPLIED"});
    return headers;
   }

   const crown=await saveAndConfirm(page,promotionId,"tv-1",["alex-shelley","chris-sabin"]);
   await page.goto(host.origin+"/#/showtime");
   await expect(page.getByRole("heading",{name:"World readiness"})).toBeVisible();
   const advance=async()=>{
    page.once("dialog",dialog=>dialog.accept());
    await page.getByRole("button",{name:"Advance Week",exact:true}).tap();
   };
   await advance();
   await expect(page.getByText("A manager has an unfinished current-week show",{exact:false})).toBeVisible();
   const [open]=await withWorldTransaction(db.pool,tx=>tx.query(
    "SELECT week,phase FROM ppw_worlds WHERE world_id=$1",[worldId]));
   expect(open).toEqual({week:1,phase:"OPEN"});

   await saveAndConfirm(rival,rivalPromotionId,"atlas-1",["talent-1-0","talent-1-1"]);
   const denied=await rival.request.post(host.origin+"/api/card",{headers:{
    origin:host.origin,"x-ppw-csrf":(await (await rival.request.get(host.origin+"/api/session")).json()).csrfToken,
   },data:{method:"load",worldId,promotionId,showId:"tv-1"}});
   expect(denied.ok()).toBe(false);
   const phase=async()=>(await withWorldTransaction(db.pool,tx=>tx.query<{week:number;phase:string}>(
    "SELECT week,phase FROM ppw_worlds WHERE world_id=$1",[worldId])))[0];
   // Stop between settlement and publication. Arbitration can take more
   // than one bounded request before it reaches the editorial handoff.
   for(let batch=0;batch<8;batch++){
    const begin=await page.request.post(host.origin+"/api/playtest-week",{headers:crown,
     data:{confirm:"ADVANCE_SHARED_WORLD",year:1,week:1}});
    expect(await begin.json()).toMatchObject({status:"LIMIT_REACHED"});
    if((await phase())?.phase==="UPDATING")break;
   }
   expect(await phase()).toEqual({week:2,phase:"UPDATING"});
   const own={worldId,promotionId,showId:"tv-1"};
   const read=(method:string,extra:Record<string,unknown>={})=>page.request.post(
    host.origin+"/api/card",{headers:crown,data:{...own,method,...extra}});
   expect((await read("results")).ok()).toBe(false);
   expect((await read("publicResults",{
    targetPromotionId:rivalPromotionId,targetShowId:"atlas-1"})).ok()).toBe(false);
   expect(await (await read("resultsArchive")).json()).toMatchObject({items:[]});
   const commentary=await page.request.post(host.origin+"/api/results-commentary",{headers:crown,data:own});
   expect(commentary.status()).toBe(202);
   expect(await commentary.json()).toEqual({status:"pending"});
   const inspect=()=>page.request.post(host.origin+"/api/admin-preview",{headers:crown,
    data:{action:"INSPECT_PROMPT",showId:"tv-1"}});
   expect((await inspect()).status()).toBe(422);

   await advance();
   await expect(page.getByRole("button",{name:"See certified results"})).toBeVisible({timeout:45_000});
   expect((await inspect()).ok()).toBe(true);
   const receipts=()=>withWorldTransaction(db.pool,tx=>tx.query(`SELECT d.draft_id,d.venue_id,
    c.receipt_digest,c.receipt_json #>> '{matches,0,actualWinnerSide}' AS winner,
    (SELECT count(*) FROM ppw_ledger_events WHERE world_id=$1) AS ledger_entries,
    (SELECT sum(remaining_dates) FROM ppw_contracts WHERE world_id=$1) AS remaining_dates
    FROM ppw_booking_drafts d JOIN ppw_completed_shows c
     ON c.world_id=d.world_id AND c.show_id=d.draft_id
    WHERE d.world_id=$1 AND d.week=1 ORDER BY d.draft_id`,[worldId]));
   const evidence=await receipts();
   expect(evidence).toHaveLength(2);
   expect(evidence.map(row=>row.venue_id).sort()).toEqual(["arena-0","arena-1"]);
   expect(evidence.map(row=>row.winner)).toEqual(["B","B"]);
   const repeat=await page.request.post(host.origin+"/api/playtest-week",{headers:crown,
    data:{confirm:"ADVANCE_SHARED_WORLD",year:1,week:1}});
   expect(await repeat.json()).toMatchObject({status:"PUBLISHED"});
   expect(await receipts()).toEqual(evidence);

   await page.getByRole("button",{name:"See certified results"}).tap();
   await expect(page.getByRole("button",{name:/Ascension.*Read ringside report/})).toBeVisible();
   await expect(page.getByRole("button",{name:/Atlas Live.*Read ringside report/})).toHaveCount(0);
   await rival.goto(host.origin+"/#/results");
   await expect(rival.getByRole("button",{name:/Atlas Live.*Read ringside report/})).toBeVisible();
   await expect(rival.getByRole("button",{name:/Ascension.*Read ringside report/})).toHaveCount(0);
   expect(host.providerRequests).toBe(0);
  }finally{await rivalContext.close();await host.close();}
 }finally{await db.close();}
});
