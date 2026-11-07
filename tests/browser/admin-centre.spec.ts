import {test,expect} from "@playwright/test";
const now=Date.now()/1000;
const overview={world:{revision:8,name:"Genesis",year:1,week:2,
 phase:"RESOLVING",nextLockEpoch:now-3600,serverEpoch:now},
 membership:"ACTIVE",promotion:{id:"crown",name:"Crown Wrestling",tier:"LOCAL",
 cash:200000,debt:0,lastWeeklyNet:0}};
const settings={model:"openai/gpt-oss-120b",voice:"MARTY",
 detail:"BALANCED",creativity:0.92,reasoning:"low",additionalGuidance:"",version:0};
const aiLabRun={run_id:"00000000-0000-4000-8000-000000000001",
 show_id:"old-show",show_name:"Friday Fire",provider:"GROQ",model:"openai/gpt-oss-120b",
 duration_ms:2150,provider_calls:1,input_tokens:750,output_tokens:320,
 rating:null,flags:[],notes:"",created_at:"2026-11-07 08:00:00+00"};
const aiLabReview={showHeadline:"The bell and the bill",opening:"Some compelling wrestling.",
 closing:"The night earned its reputation.",
 slots:[{slotId:"one",headline:"A hard-fought win",recap:"A proper battle."}]};
const adminData={plan:{year:1,week:2,action:"RESOLVE_DETAILED_SHOWS",blockers:[],
 ready:{phase:"RESOLVING",active:13,regularSubmitted:13,submitted:13,
 cleared:13,certified:null,legacyResolved:13,detailedResolved:8}},
 settings,groqConfigured:true,aiUsage:{call_count:3,reserved_tokens:5500,
  reported_input_tokens:"1800",reported_output_tokens:"700",completed_calls:3,failed_calls:0},
 testKp:{balance:100,granted:false,target:50000},
 shows:[{show_id:"old-show",show_name:"Friday Fire",year:1,week:1}]};
test("owner Admin lives only under Business and exposes audited Groq controls",async({page})=>{
 await page.route("**/api/session",route=>route.fulfill({json:{
 worldId:"genesis",playerId:"operator",csrfToken:"csrf",overview,
 canManualAdvance:true,availablePromotions:[]}}));
 await page.route("**/api/card",route=>route.fulfill({json:overview}));
 let grants=0,ratings=0,historyReads=0;
 await page.route("**/api/admin?aiLab=*",route=>{
  const url=new URL(route.request().url());
  if(url.searchParams.get("aiLab")==="review"){
   expect(url.searchParams.get("runId")).toBe(aiLabRun.run_id);
   return route.fulfill({json:{review:aiLabReview}});
  }
  expect(url.searchParams.get("aiLab")).toBe("summary");
  historyReads++;
  return route.fulfill({json:{
   usage:[{day:"2026-11-07",provider:"GROQ",calls:3,reserved:5500,
    input:"1800",output:"700",failed:0}],
   runs:[aiLabRun],
   scores:[{provider:"GROQ",model:"openai/gpt-oss-120b",
    total:1,reviewed:0,average_score:null}]
  }});
 });
 await page.route("**/api/admin",async route=>{
  if(route.request().method()==="GET")return route.fulfill({json:{
   ...adminData,testKp:{balance:grants?50000:100,granted:grants>0,target:50000}
  }});
  const body=route.request().postDataJSON();
  if(body.action==="GRANT_PLAYTEST_KP"){
   grants++;expect(route.request().headers()["x-ppw-csrf"]).toBe("csrf");
   return route.fulfill({json:{balance:50000,credited:49900,alreadyGranted:false}});
  }
  if(body.action==="RATE_AI_LAB_RUN"){
   ratings++;expect(body).toMatchObject({runId:aiLabRun.run_id,rating:5,
    flags:["TAG_RULES"],notes:"Great personality but fix legal tags"});
   expect(route.request().headers()["x-ppw-csrf"]).toBe("csrf");
   return route.fulfill({json:{saved:true}});
  }
  expect(body).toMatchObject({action:"SAVE_RINGSIDE",expectedVersion:0,
   settings:{model:"openai/gpt-oss-20b",voice:"SATIRE",detail:"LONG"}});
  return route.fulfill({json:{settings:{...body.settings,version:1}}});
 });
 let previewCalls=0;
 await page.route("**/api/admin-preview",route=>{
  previewCalls++;
  expect(route.request().postDataJSON().showId).toBe("old-show");
  return route.fulfill({json:{review:aiLabReview,
   labRunId:aiLabRun.run_id,metrics:{durationMs:2150,providerCalls:1,
    inputTokens:750,outputTokens:320}}});
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
 await page.getByRole("button",{name:"Playtests"}).click();
 page.once("dialog",dialog=>void dialog.accept());
 await page.getByRole("button",{name:"Credit 50,000 test KP"}).click();
 await expect(page.getByText("Your balance: 50,000 KP")).toBeVisible();
 await expect(page.getByRole("button",{name:"Test credit already claimed"})).toBeDisabled();
 expect(grants).toBe(1);
 await page.getByRole("button",{name:"AI Testing Lab"}).click();
 await expect(page.getByRole("heading",{name:"AI Quality Lab"})).toBeVisible();
 await expect(page.getByText(/Groq today · 3\/40 calls/)).toBeVisible();
 await expect(page.getByText("Groq reported tokens")).toBeVisible();
 expect(historyReads).toBeGreaterThanOrEqual(1);
 await page.getByRole("button",{name:"Read & rate"}).click();
 await expect(page.getByRole("heading",{name:"The bell and the bill"})).toBeVisible();
 await page.getByRole("button",{name:"5 ★"}).click();
 await page.getByRole("button",{name:"Tag rules"}).click();
 await page.getByLabel("Playtest notes").fill("Great personality but fix legal tags");
 await page.getByRole("button",{name:"Save assessment"}).click();
 await expect(page.getByText(/Assessment saved/)).toBeVisible();
 expect(ratings).toBe(1);
 await page.getByRole("button",{name:"Compare",exact:true}).click();
 await expect(page.getByRole("heading",{name:"The bell and the bill"})).toHaveCount(2);
 await expect(page.getByLabel("Preview provider")).toHaveValue("GROQ");
 await expect(page.getByLabel("Preview provider").locator("option")).toHaveCount(1);
 await page.getByLabel("AI model").selectOption("openai/gpt-oss-20b");
 await page.getByLabel("Columnist style").selectOption("SATIRE");
 await page.getByLabel("Review length").selectOption("LONG");
 await page.getByRole("button",{name:"Save Ringside preferences"}).click();
 await expect(page.getByText(/Saved for future Ringside reports/)).toBeVisible();
 await page.getByRole("button",{name:"Preview this style"}).click();
 await expect(page.locator(".ppw-admin-panel").filter({
  has:page.getByRole("heading",{name:"Ringside AI Studio"})
 }).getByRole("heading",{name:"The bell and the bill"})).toBeVisible();
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
