import {test,expect} from "@playwright/test";

const world={revision:6,name:"Genesis",year:1,week:1,phase:"OPEN",
 nextLockEpoch:Date.now()/1000+999999,serverEpoch:Date.now()/1000};
const promotion={id:"promotion-009",name:"Crown Wrestling",tier:"LOCAL",cash:6e6,
 debt:0,lastWeeklyNet:0};
const admin=(state:typeof world)=>({plan:{
 year:state.year,week:state.week,action:"WAIT_FOR_WORLD_LOCK",blockers:[],
 ready:{phase:state.phase,active:1,submitted:0,regularSubmitted:0,
 cleared:null,certified:null,legacyResolved:0,detailedResolved:0}},
 settings:{model:"openai/gpt-oss-120b",voice:"MARTY",detail:"BALANCED",
 creativity:0.92,reasoning:"low",additionalGuidance:"",version:0},
 groqConfigured:true,shows:[]});
test("only the designated operator can trigger the shared World week, after an explicit confirmation",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const requests:unknown[]=[];
 await page.route("**/api/session",route=>route.fulfill({json:{
  worldId:"world-20261017",playerId:"owner",csrfToken:"csrf",
  overview:{world,membership:"ACTIVE",promotion},availablePromotions:[],
  canManualAdvance:true
 }}));
 await page.route("**/api/card",route=>route.fulfill({json:{
  world,membership:"ACTIVE",promotion
 }}));
 await page.route("**/api/playtest-week",route=>{
  requests.push(route.request().postDataJSON());
  return route.fulfill({json:{status:"LIMIT_REACHED",blockers:[],steps:[]}});
 });
 await page.route("**/api/admin",route=>route.fulfill({json:admin(world)}));
 await page.goto("/#/admin");
 await expect(page.getByRole("button",{name:"Advance Week"})).toBeVisible();
 expect(requests).toHaveLength(0);
 page.once("dialog",dialog=>dialog.dismiss());
 await page.getByRole("button",{name:"Advance Week"}).click();
 expect(requests).toHaveLength(0);
 page.once("dialog",dialog=>dialog.accept());
 await page.getByRole("button",{name:"Advance Week"}).click();
 await expect(page.getByRole("heading",{name:"Control Room"})).toBeVisible();
 expect(requests).toEqual([{confirm:"ADVANCE_SHARED_WORLD",year:1,week:1}]);
});
test("other managers never see the control or trigger server-authoritative World resolution",async({page})=>{
 await page.route("**/api/session",route=>route.fulfill({json:{
  worldId:"world-20261017",playerId:"guest",csrfToken:"csrf",
  overview:{world,membership:"ACTIVE",promotion},availablePromotions:[],
  canManualAdvance:false
 }}));
 await page.route("**/api/card",route=>route.fulfill({json:{
  world,membership:"ACTIVE",promotion
 }}));
 let called=0;await page.route("**/api/playtest-week",route=>{
  called++;return route.fulfill({status:403,json:{}});
 });
 await page.goto("/#/home");
 await expect(page.getByRole("heading",{name:"Control Room"})).toHaveCount(0);
 await page.goto("/#/admin");
 await expect(page).toHaveURL(/home$/);
 expect(called).toBe(0);
});

test("one press automatically finishes multiple certified batches",async({page})=>{
 let batches=0;
 await page.route("**/api/session",route=>route.fulfill({json:{
  worldId:"world-20261017",playerId:"owner",csrfToken:"csrf",
  overview:{world,membership:"ACTIVE",promotion},availablePromotions:[],canManualAdvance:true
 }}));
 await page.route("**/api/card",route=>route.fulfill({json:{world,membership:"ACTIVE",promotion}}));
 await page.route("**/api/admin",route=>route.fulfill({json:admin(world)}));
 await page.route("**/api/playtest-week",route=>{
  expect(route.request().postDataJSON()).toMatchObject({
   confirm:"ADVANCE_SHARED_WORLD",year:1,week:1});
  batches++;
  return route.fulfill({json:batches===1?{
   status:"LIMIT_REACHED",steps:[{action:"ASSESS_CONTINUITY",status:"EXECUTED"}],blockers:[]
  }:{status:"PUBLISHED",steps:[{action:"PUBLISH_WEEK",status:"EXECUTED"}],blockers:[]}});
 });
 await page.goto("/#/admin");
 page.once("dialog",dialog=>dialog.accept());
 await page.getByRole("button",{name:"Advance Week"}).click();
 await expect(page.getByText(/next playable week is ready/)).toBeVisible();
 expect(batches).toBe(2);
});

test("Home offers the same one-tap solo week advance without entering Admin",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 let batches=0;
 await page.route("**/api/session",route=>route.fulfill({json:{
  worldId:"world-20261017",playerId:"owner",csrfToken:"csrf",
  overview:{world,membership:"ACTIVE",promotion},availablePromotions:[],
  canManualAdvance:true
 }}));
 await page.route("**/api/card",route=>route.fulfill({json:{
  world,membership:"ACTIVE",promotion
 }}));
 await page.route("**/api/playtest-week",route=>{
  expect(route.request().postDataJSON()).toMatchObject({
   confirm:"ADVANCE_SHARED_WORLD",year:1,week:1
  });
  batches++;
  return route.fulfill({json:batches===1?{
   status:"LIMIT_REACHED",steps:[{action:"ASSESS_CONTINUITY",status:"EXECUTED"}],blockers:[]
  }:{status:"PUBLISHED",steps:[{action:"PUBLISH_WEEK",status:"EXECUTED"}],blockers:[]}});
 });
 await page.goto("/#/home");
 const action=page.getByRole("button",{name:"Advance Week 1"});
 await expect(action).toBeVisible();
 page.once("dialog",dialog=>dialog.accept());
 await action.click();
 await expect.poll(()=>batches).toBe(2);
 await expect(page.getByText(/One tap advances the shared World/)).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
});
