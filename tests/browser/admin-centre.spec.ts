import {test,expect} from "@playwright/test";
const now=Date.now()/1000;
const overview={world:{revision:8,name:"Genesis",year:1,week:2,
 phase:"RESOLVING",nextLockEpoch:now-3600,serverEpoch:now},
 membership:"ACTIVE",promotion:{id:"crown",name:"Crown Wrestling",tier:"LOCAL",
 cash:200000,debt:0,lastWeeklyNet:0}};
const settings={model:"openai/gpt-oss-120b",voice:"MARTY",
 detail:"BALANCED",creativity:0.92,reasoning:"low",additionalGuidance:"",version:0};
const adminData={plan:{year:1,week:2,action:"RESOLVE_DETAILED_SHOWS",blockers:[],
 ready:{phase:"RESOLVING",active:13,regularSubmitted:13,submitted:13,
 cleared:13,certified:null,legacyResolved:13,detailedResolved:8}},
 settings,groqConfigured:true,
 shows:[{show_id:"old-show",show_name:"Friday Fire",year:1,week:1}]};
test("owner Admin lives only under Business and exposes audited Groq controls",async({page})=>{
 await page.route("**/api/session",route=>route.fulfill({json:{
 worldId:"genesis",playerId:"operator",csrfToken:"csrf",overview,
 canManualAdvance:true,availablePromotions:[]}}));
 await page.route("**/api/card",route=>route.fulfill({json:overview}));
 await page.route("**/api/admin",async route=>{
  if(route.request().method()==="GET")return route.fulfill({json:adminData});
  const body=route.request().postDataJSON();
  expect(body).toMatchObject({action:"SAVE_RINGSIDE",expectedVersion:0,
   settings:{model:"openai/gpt-oss-20b",voice:"SATIRE",detail:"LONG"}});
  expect(route.request().headers()["x-ppw-csrf"]).toBe("csrf");
  return route.fulfill({json:{settings:{...body.settings,version:1}}});
 });
 let previewCalls=0;
 await page.route("**/api/admin-preview",route=>{
  previewCalls++;
  expect(route.request().postDataJSON().showId).toBe("old-show");
  return route.fulfill({json:{review:{showHeadline:"The bell and the bill",
   opening:"Some compelling wrestling.",closing:"The night earned its reputation.",
   slots:[{slotId:"one",headline:"A hard-fought win",recap:"A proper battle."}]}}});
 });
 await page.goto("/#/home");
 await expect(page.getByRole("button",{name:"Continue resolution"})).toHaveCount(0);
 await page.getByRole("button",{name:"Open Business menu"}).click();
 await expect(page.getByRole("navigation",{name:"Promotion navigation"})
  .getByRole("button",{name:/Admin/})).toBeVisible();
 await page.getByRole("navigation",{name:"Promotion navigation"})
  .getByRole("button",{name:/Admin/}).click();
 await expect(page.getByRole("heading",{name:"Control Room"})).toBeVisible();
 await expect(page.getByText(/Completed shows: 8\/13/)).toBeVisible();
 await expect(page.getByRole("button",{name:"Advance Week"})).toBeVisible();
 await page.getByLabel("AI model").selectOption("openai/gpt-oss-20b");
 await page.getByLabel("Columnist style").selectOption("SATIRE");
 await page.getByLabel("Review length").selectOption("LONG");
 await page.getByRole("button",{name:"Save Ringside preferences"}).click();
 await expect(page.getByText(/Saved for future Ringside reports/)).toBeVisible();
 await page.getByRole("button",{name:"Preview this style"}).click();
 await expect(page.getByRole("heading",{name:"The bell and the bill"})).toBeVisible();
 expect(previewCalls).toBe(1);
});
test("ordinary manager cannot discover the Admin department or route",async({page})=>{
 await page.route("**/api/session",route=>route.fulfill({json:{
 worldId:"genesis",playerId:"guest",csrfToken:"csrf",overview,
 canManualAdvance:false,availablePromotions:[]}}));
 await page.route("**/api/card",route=>route.fulfill({json:overview}));
 let calls=0;
 await page.route("**/api/admin",route=>{calls++;return route.fulfill({status:403,json:{error:"Not authorised"}});});
 await page.goto("/#/home");
 await page.getByRole("button",{name:"Open Business menu"}).click();
 await expect(page.getByRole("navigation",{name:"Promotion navigation"})
  .getByRole("button",{name:/Admin/})).toHaveCount(0);
 await page.goto("/#/admin");
 await expect(page).toHaveURL(/#\/home$/);
 expect(calls).toBe(0);
});
