import {mkdir} from "node:fs/promises";
import {join,resolve} from "node:path";
import {test,expect} from "@playwright/test";
import {postgresPool} from "../../src/db/postgres.js";
import {withWorldTransaction} from "../../src/db/transaction.js";
import {applyKayfabeAction} from "../../src/db/kayfabe-points.js";
import {startMilestone8Host} from "../fixtures/milestone8-local-host.js";
import {accessCode,disposableDatabaseUrl,managerId,promotionId} from "../fixtures/milestone8-local-world.js";

const worldId=process.env.PPW_M8_EXISTING_WORLD;
const evidence=process.env.PPW_M8_EVIDENCE;
const commercial=process.env.PPW_M8_COMMERCIAL==="1";
test.skip(!worldId||!evidence||!process.env.PPW_M8_DATABASE_URL,
 "Use the existing disposable World from the completed authenticated journey.");

test("certified PPV reopens with the purchased skin and its animated event poster",async({page})=>{
 const url=disposableDatabaseUrl(process.env.PPW_M8_DATABASE_URL).href;
 const db=postgresPool(url);
 const scope={worldId:worldId!,promotionId,playerId:managerId};
 const wallet=()=>withWorldTransaction(db.pool,tx=>tx.query<{balance:string}>(
  "SELECT balance::text FROM ppw_kp_wallets WHERE player_id=$1",[managerId]));
 try{
  const [result]=await withWorldTransaction(db.pool,tx=>tx.query<{digest:string}>(
   "SELECT receipt_digest AS digest FROM ppw_completed_shows WHERE world_id=$1 AND show_id='the-lottery'",
   [worldId!]));
  expect(result?.digest).toMatch(/^[a-f0-9]{64}$/);
  if(commercial){
   const economics=await withWorldTransaction(db.pool,tx=>tx.query<{
    audience_format:string;ppv_buys:number|null;tv_household_rating:number|null;
   }>(`SELECT audience_format, ppv_buys::integer, tv_household_rating::double precision
    FROM ppw_show_economics WHERE world_id=$1 AND promotion_id=$2 AND week=2 ORDER BY audience_format`,
    [worldId!,promotionId]));
   expect(economics).toEqual([
    {audience_format:"PPV",ppv_buys:expect.any(Number),tv_household_rating:null},
    {audience_format:"TV",ppv_buys:null,tv_household_rating:expect.any(Number)},
   ]);
  }
  // Local evidence wallet credit supplies starting cosmetic points once. The
  // actual purchase and application still use the released game commands.
  await withWorldTransaction(db.pool,tx=>tx.query(`INSERT INTO ppw_kp_wallets(player_id,balance,lifetime_earned)
   VALUES($1,4000,4000) ON CONFLICT(player_id) DO UPDATE SET balance=GREATEST(4000,ppw_kp_wallets.balance)`,
  [managerId]));
  const [poster]=await withWorldTransaction(db.pool,tx=>tx.query<{purchased:boolean}>(
   "SELECT EXISTS (SELECT 1 FROM ppw_kp_entitlements WHERE player_id=$1 AND sku='POSTER_INFERNO') AS purchased",
   [managerId]));
  if(!poster?.purchased)await applyKayfabeAction(db.pool,scope,
   {kind:"BUY",sku:"POSTER_INFERNO",requestId:"milestone8-evidence-poster"});
  await applyKayfabeAction(db.pool,scope,
   {kind:"SET_SERIES_EVENT_POSTER",seriesId:"lottery-series",sku:"POSTER_INFERNO",requestId:"milestone8-evidence-series-poster"});
  const host=await startMilestone8Host(resolve(process.env.PPW_M8_APP_ROOT??"."),url,worldId!);
  try{
   await mkdir(evidence!,{recursive:true});
   await page.goto(host.origin+"/#/home");
   await page.getByRole("textbox",{name:"Player ID"}).fill(managerId);
   await page.getByRole("textbox",{name:"Private access code"}).fill(accessCode);
   await page.getByRole("button",{name:"Sign in",exact:true}).tap();
   await expect(page.getByRole("heading",{name:"Promoter’s Office"})).toBeVisible();
   await page.setViewportSize({width:1280,height:900});
   await page.screenshot({path:join(evidence!,"desktop-office.png"),animations:"disabled"});
   await page.setViewportSize({width:390,height:844});
   const archive=()=>page.goto(host.origin+"/#/results");
   const openPpv=()=>page.locator(".ppw-archive-show").filter({hasText:"The Lottery"}).tap();
   await archive();
   await openPpv();
   await expect(page.locator(".ppw-results")).toBeVisible();
   await expect(page.locator(".ppw-results-event-poster [data-poster='inferno']")).toBeVisible();
   if(commercial){
    const week=page.getByRole("navigation",{name:"Certified shows this week"});
    await expect(week).toContainText("PPV");
    await week.getByRole("button",{name:/TV.*Ascension/i}).tap();
    await expect(week.locator("[aria-current='page']")).toContainText("Ascension");
    await page.screenshot({path:join(evidence!,"certified-tv.png"),animations:"disabled"});
    await week.getByRole("button",{name:/PPV.*The Lottery/i}).tap();
    await expect(week.locator("[aria-current='page']")).toContainText("The Lottery");
   }
   await page.screenshot({path:join(evidence!,"certified-ppv.png"),animations:"disabled"});
   const after=page.getByRole("button",{name:"After the Bell",exact:true});
   await after.tap();
   await page.screenshot({path:join(evidence!,"after-the-bell.png"),animations:"disabled"});
   await page.getByRole("button",{name:"Open your KP wallet"}).tap();
   const retro=page.locator(".ppw-kp-results-skin-row").filter({hasText:"Retro Booker"});
   await expect(retro).toBeVisible();
   const purchase=retro.getByRole("button",{name:/Unlock|Apply/});
   if(await purchase.count())await purchase.tap();
   await expect(retro.getByRole("button",{name:"Applied",exact:true})).toBeVisible();
   const before=await wallet();
   await archive();
   await openPpv();
   const report=page.locator(".ppw-results[data-results-skin='retro-booker-02']");
   await expect(report).toBeVisible();
   await expect(report.locator(".ppw-results-event-poster [data-poster='inferno']")).toBeVisible();
   await page.screenshot({path:join(evidence!,"cosmetic-skin.png"),animations:"disabled"});
   await page.reload();
   await expect(report).toBeVisible();
   expect(await wallet()).toEqual(before);
   expect(host.providerRequests).toBe(0);
  }finally{await host.close();}
 }finally{await db.close();}
});
