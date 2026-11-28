import {randomUUID} from "node:crypto";
import {mkdir,writeFile} from "node:fs/promises";
import {join,resolve} from "node:path";
import {expect,test,type Locator,type Page} from "@playwright/test";
import {postgresPool} from "../../src/db/postgres.js";
import {withWorldTransaction} from "../../src/db/transaction.js";
import {startMilestone8Host} from "../fixtures/milestone8-local-host.js";
import {accessCode,disposableDatabaseUrl,managerId,promotionId,seedMilestone8Programme,
 seedMilestone8World} from "../fixtures/milestone8-local-world.js";

test.skip(!process.env.PPW_M8_DATABASE_URL,"Use a migrated disposable PostgreSQL instance.");

const root=resolve(process.env.PPW_M8_APP_ROOT??".");
const baseline=process.env.PPW_M8_BASELINE==="1";
const coldStart=process.env.PPW_M8_COLD_START==="1";
const evidence=process.env.PPW_M8_EVIDENCE;
const fullJourney=process.env.PPW_M8_FULL_JOURNEY==="1";
const chooseChallenger=process.env.PPW_M8_TITLE_WINNER!=="champion";
const commercial=process.env.PPW_M8_COMMERCIAL==="1";
const resumeWeekTwo=process.env.PPW_M8_RESUME_WEEK_TWO==="1";
const tap=async(locator:Locator)=>{
 if(process.env.PPW_M8_KEYBOARD==="1"){await locator.focus();await locator.press("Enter");}
 else await locator.tap();
};
const control=(page:Page|Locator,name:string|RegExp)=>page.getByRole("button",{name,exact:typeof name==="string"});
const game= (page:Page)=>page.locator("#game");
const addMatch=(page:Page)=>control(page,/^\+? ?Add match$/);
const homeCard=(page:Page,name="Ascension")=>page.locator(".ppw-home-recent-show")
 .filter({hasText:name}).filter({hasNotText:/crowd/}).first();
async function enterHome(page:Page,origin:string){
 await page.goto(origin+"/#/home");
 await expect(page.locator(".ppw-shell-brand strong")).toHaveText("Crown Wrestling");
 await expect(page.getByText("Ascension",{exact:true}).first()).toBeVisible();
}
async function screenshot(page:Page,name:string,fullPage=false){
 if(!evidence)return;
 await mkdir(evidence,{recursive:true});
 await page.screenshot({path:join(evidence,name+".png"),fullPage,animations:"disabled"});
}
async function signIn(page:Page,origin:string){
 await page.goto(origin+"/#/home");
 await page.getByRole("textbox",{name:"Player ID"}).fill(managerId);
 await page.getByRole("textbox",{name:"Private access code"}).fill(accessCode);
 await tap(control(page,"Sign in"));
 if(coldStart){
  await page.getByRole("textbox",{name:"Your manager name"}).fill("Jamie Mercer");
  await tap(control(page,"Enter the wrestling world"));
  await tap(control(page,"Join World"));
  await tap(page.locator(".ppw-access-promotion").filter({hasText:"Crown Wrestling"})
   .getByRole("button",{name:"Run this promotion"}));
  await expect(page.getByRole("heading",{name:"Make it yours"})).toBeVisible();
  const skip=control(page,/^Keep /).first();
  if(await skip.count())await tap(skip);
  else await tap(control(page,"Save promotion name"));
 }
}
async function bookMatch(page:Page,options:{
 first:string;second:string;winner:number;stipulation?:string;title?:boolean;capture?:boolean;ordinary?:boolean;
}){
 let interactions=0;
 const act=async(locator:Locator)=>{await tap(locator);interactions++;};
 if(options.ordinary&&!baseline&&await control(page,/Quick (?:book|singles)/i).first().count())
  await act(control(page,/Quick (?:book|singles)/i).first());
 else await act(addMatch(page));
 const dialog=page.getByRole("dialog",{name:"Edit match"});
 if(options.stipulation)await act(control(dialog,options.stipulation));
 const step=control(dialog,"Continue · Select wrestlers");
 if(await step.isVisible())await act(step);
 if(options.capture)await screenshot(page,"advanced-editing");
 const picker=page.getByRole("dialog",{name:"Choose wrestler"});
 if(!await picker.isVisible())await act(control(dialog,/^Choose (?:a )?wrestler$/).first());
 for(const name of [options.first,options.second]){
  if(!await picker.isVisible())await act(control(dialog,/^Choose (?:a )?wrestler$/).last());
  await act(picker.locator(".ppw-wrestler-card").filter({hasText:name}).first());
 }
 const outcome=control(dialog,"Next · Script outcome");
 if(await outcome.isVisible())await act(outcome);
 if(options.title){
  await act(control(dialog,/Championship/).first());
  await act(control(page,/Crown World Championship/).last());
 }
 const winner=dialog.locator(".ppw-winner-choice").nth(options.winner);
 if(await winner.count()&&await winner.getAttribute("aria-pressed")!=="true")await act(winner);
 const briefing=control(dialog,"Next · Staff briefing");
 if(await briefing.isVisible())await act(briefing);
 if(options.ordinary)await screenshot(page,"quick-booking");
 await act(control(dialog,/^Complete match$|^Add match to (?:card|run sheet)$/i));
 return interactions;
}

async function saveAndConfirm(page:Page){
 await tap(control(page,/^Save (?:card|changes)$/));
 await expect(page.getByText("Show card saved",{exact:true})).toBeVisible();
 await tap(control(page,"Confirm show"));
 const confirmation=page.getByRole("dialog",{name:/Confirm/});
 if(await confirmation.count())await tap(control(confirmation,/Confirm/).last());
 await expect(control(page,"Confirmed")).toBeDisabled();
}

async function advance(page:Page,origin:string,week:number){
 await page.goto(origin+(baseline?"/#/admin":"/#/showtime"));
 await expect(page.getByRole("heading",{name:baseline?"Control Room":"Showtime"})).toBeVisible();
 await screenshot(page,"week-"+week+"-readiness");
 page.once("dialog",dialog=>dialog.accept());
 await tap(control(page,"Advance Week"));
 await expect(page.getByText(/next playable week is ready|Week advanced/i).first()).toBeVisible({timeout:60_000});
}
async function assetMetrics(page:Page){
 return page.evaluate(()=>({
  navigationMs:Math.round(performance.now()),
  resources:performance.getEntriesByType("resource").filter(r=>/\.(?:js|css)(?:\?|$)/.test(r.name))
   .map(r=>{const entry=r as PerformanceResourceTiming;return {
    name:new URL(r.name).pathname,encodedBytes:entry.encodedBodySize,transferBytes:entry.transferSize};})
 }));
}

test("signed manager books, advances and reads actual certified weeks",async({page,browser},testInfo)=>{
 const url=disposableDatabaseUrl(process.env.PPW_M8_DATABASE_URL).href;
 const worldId=process.env.PPW_M8_BROWSER_WORLD??"m8-browser-"+randomUUID();
 const db=postgresPool(url);
 const read=<T extends Record<string,unknown>>(sql:string,params:readonly unknown[]=[worldId])=>
  withWorldTransaction(db.pool,tx=>tx.query<T>(sql,params));
 try{
  if(resumeWeekTwo){
   const [state]=await read<{week:number;phase:string}>("SELECT week,phase FROM ppw_worlds WHERE world_id=$1");
   expect(state).toEqual({week:2,phase:"OPEN"});
   expect(fullJourney).toBe(true);
  }else await seedMilestone8World(db.pool,worldId,{coldStart,commercial});
  const host=await startMilestone8Host(root,url,worldId);
  try{
   await signIn(page,host.origin);
   await expect(page.locator(".ppw-shell-brand strong")).toHaveText("Crown Wrestling");
   if(coldStart){
    await expect(page.getByRole("heading",{name:"Your first show"})).toBeVisible();
    await screenshot(page,"first-show-guide");
    await seedMilestone8Programme(db.pool,worldId);
    await enterHome(page,host.origin);
   }
   await expect(game(page).getByText("Ascension",{exact:true}).first()).toBeVisible();
   let measurements:Record<string,unknown>={resumeWeekTwo};
   if(!resumeWeekTwo){
    await screenshot(page,"promoters-office");
    if(!baseline&&fullJourney){
     const decision=page.getByRole("region",{name:"At your desk"});
     await expect(decision).toBeVisible();
     await decision.scrollIntoViewIfNeeded();
     await screenshot(page,"contextual-decision");
    }
    expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
    const signed=await page.context().storageState();
    const clean=await browser.newContext({storageState:signed,ignoreHTTPSErrors:true,
     isMobile:true,hasTouch:true,viewport:page.viewportSize()??undefined});
    let cold,warm,home,openingCard;
    try{
     const loading=await clean.newPage();
     const startHome=host.samples.length;
     await enterHome(loading,host.origin);
     cold=await assetMetrics(loading);
     home=host.samples.slice(startHome);
     await loading.reload();
     await expect(game(loading).getByText("Ascension",{exact:true}).first()).toBeVisible();
     warm=await assetMetrics(loading);
     const startCard=host.samples.length;
     await tap(homeCard(loading));
     await expect(addMatch(loading)).toBeVisible();
     openingCard=host.samples.slice(startCard);
    }finally{await clean.close();}
    const started=performance.now();
    await tap(homeCard(page));
    await expect(addMatch(page)).toBeVisible();
    await screenshot(page,"booking-room");
    const interactions=1+await bookMatch(page,{first:"Alex Shelley",second:"Chris Sabin",winner:1,ordinary:true})+2;
    await saveAndConfirm(page);
    const preparationMs=Math.round(performance.now()-started);
    console.log("Confirmed Week 1 booking",JSON.stringify({interactions,preparationMs}));
    await screenshot(page,"run-sheet");
    await advance(page,host.origin,1);
    await enterHome(page,host.origin);
    await screenshot(page,"next-week-home");
    const weekOneResult=control(page,/Read Ascension/).first();
    if(await weekOneResult.count())await tap(weekOneResult);
    else await page.goto(host.origin+"/#/results");
    await expect(game(page).getByText(/Ascension/).first()).toBeVisible();
    if(!baseline&&fullJourney){
     await page.goto(host.origin+"/#/roster");
     await tap(page.locator(".ppw-directory-list .ppw-wrestler-card").filter({hasText:"Samoa Joe"}).first());
     await expect(page.getByRole("dialog",{name:"Wrestler dossier"})).toBeVisible();
     await screenshot(page,"wrestler-dossier");
     await page.keyboard.press("Escape");
    }
    const facts=await read<{week:number;shows:number;seals:number}>(`SELECT week,
     (SELECT count(*)::integer FROM ppw_completed_shows s WHERE s.world_id=w.world_id) AS shows,
     (SELECT count(*)::integer FROM ppw_week_resolution_seals s WHERE s.world_id=w.world_id) AS seals
     FROM ppw_worlds w WHERE world_id=$1`);
    expect(facts[0]).toEqual({week:2,shows:2,seals:1});
    console.log("Certified Week 1",JSON.stringify(facts[0]));
    const [promise]=await read<{status:string}>(`
     SELECT status FROM ppw_backstage_requests
     WHERE world_id=$1 AND request_id='shelley-wants-a-match'`);
    expect(promise).toMatchObject({status:"FULFILLED"});
    measurements={cold,warm,home,openingCard,interactions,preparationMs};
   }
   if(fullJourney){
    // Week 2: advanced title match plus PPV, then a truly dark Week 3.
    await enterHome(page,host.origin);
    await tap(homeCard(page));
    await bookMatch(page,{first:"Samoa Joe",second:"Will Ospreay",
     winner:chooseChallenger?1:0,title:true,stipulation:"Steel Cage",capture:true});
    await saveAndConfirm(page);
    await enterHome(page,host.origin);
    await tap(homeCard(page,"The Lottery"));
    await bookMatch(page,{first:"AJ Styles",second:"Kurt Angle",winner:0});
    await saveAndConfirm(page);
    await advance(page,host.origin,2);
    if(commercial){
     const formats=await read<{audience_format:string;ppv_buys:number|null;tv_household_rating:number|null;net_result:string}>(`
      SELECT audience_format,ppv_buys::integer,tv_household_rating::double precision,net_result::text
      FROM ppw_show_economics WHERE world_id=$1 AND promotion_id=$2 AND week=2
      ORDER BY audience_format`,[worldId,promotionId]);
     expect(formats).toMatchObject([
      {audience_format:"PPV",ppv_buys:expect.any(Number),tv_household_rating:null},
      {audience_format:"TV",ppv_buys:null,tv_household_rating:expect.any(Number)},
     ]);
     measurements={...measurements,formats};
    }
    await enterHome(page,host.origin);
    await tap(control(page,/Read The Lottery/).first());
    await expect(game(page).getByText("The Lottery",{exact:true}).first()).toBeVisible();
    await screenshot(page,"certified-premium-result");
    const afterBell=control(page,"After the Bell");
    if(await afterBell.count()){
     await tap(afterBell);
     await screenshot(page,"after-the-bell");
    }
    await page.reload();
    await expect(game(page).getByText("The Lottery",{exact:true}).first()).toBeVisible();
    await advance(page,host.origin,3);
    await enterHome(page,host.origin);
    await tap(homeCard(page));
    await bookMatch(page,{first:"Samoa Joe",second:"Will Ospreay",winner:chooseChallenger?1:0,title:true});
    await saveAndConfirm(page);
    await advance(page,host.origin,4);
    const continuity=await read<{week:number;seals:number;show_weeks:number[];holder:string;defences:number}>(`
     SELECT w.week,
      (SELECT count(*)::integer FROM ppw_week_resolution_seals s WHERE s.world_id=w.world_id) AS seals,
      (SELECT array_agg(sh.week ORDER BY sh.week) FROM ppw_completed_shows sh
       WHERE sh.world_id=w.world_id AND sh.promotion_id=$2) AS show_weeks,
      r.person_id AS holder,r.defenses AS defences
     FROM ppw_worlds w JOIN ppw_championships c ON c.world_id=w.world_id AND c.promotion_id=$2
     JOIN ppw_championship_reigns r ON r.world_id=c.world_id AND r.reign_id=c.current_reign_id
     WHERE w.world_id=$1`,[worldId,promotionId]);
    expect(continuity[0]).toMatchObject({week:5,seals:4,show_weeks:[1,2,2,4],
     holder:chooseChallenger?"will-ospreay":"samoa-joe",defences:chooseChallenger?1:2});
    measurements={...measurements,continuity:continuity[0]};
   }
   expect(host.providerRequests).toBe(0);
   const data={baseline,viewport:page.viewportSize(),...measurements,providerRequests:host.providerRequests};
   console.log("Milestone 8 browser measurements",JSON.stringify(data));
   await testInfo.attach("Browser measurements",{body:JSON.stringify(data,null,2),contentType:"application/json"});
   if(evidence)await writeFile(join(evidence,"browser-measurements.json"),JSON.stringify(data,null,2)+"\n");
  }finally{await host.close();}
 }finally{await db.close();}
});
