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
 await expect(page.getByRole("button",{name:"Advance World week"})).toBeVisible();
 expect(requests).toHaveLength(0);
 page.once("dialog",dialog=>dialog.dismiss());
 await page.getByRole("button",{name:"Advance World week"}).click();
 expect(requests).toHaveLength(0);
 page.once("dialog",dialog=>dialog.accept());
 await page.getByRole("button",{name:"Advance Week 1"}).click();
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
