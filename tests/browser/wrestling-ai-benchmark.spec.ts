import {test,expect} from "@playwright/test";
const now=Date.now()/1000;
const overview={world:{revision:8,name:"Genesis",year:1,week:14,
 phase:"OPEN",nextLockEpoch:now+20000,serverEpoch:now},
 membership:"ACTIVE",promotion:{id:"cwa",name:"Chaotic Wrestling Alliance",tier:"REGIONAL",
 cash:900000,debt:0,lastWeeklyNet:20000}};
const defaultSettings={model:"openai/gpt-oss-120b",voice:"MARTY",
 detail:"BALANCED",creativity:0.92,reasoning:"low",additionalGuidance:"",version:0};
test("owner runs a controlled wrestling benchmark and sees actual usage without an auto-call",async({page})=>{
 await page.route("**/api/session",route=>route.fulfill({json:{
  worldId:"genesis",playerId:"operator",csrfToken:"csrf",overview,
  canManualAdvance:true,availablePromotions:[]}}));
 await page.route("**/api/card",route=>route.fulfill({json:overview}));
 await page.route("**/api/admin",route=>route.fulfill({json:{
  plan:{year:1,week:14,action:"WAIT_FOR_WORLD_LOCK",blockers:[],
   ready:{phase:"OPEN",active:8,regularSubmitted:0,submitted:0,
    cleared:null,certified:null,legacyResolved:0,detailedResolved:0}},
  settings:defaultSettings,groqConfigured:true,openAiPreviewEnabled:false,
  pilot:null,testKp:{balance:100,granted:false,target:50000},
  aiUsage:null,shows:[]
 }}));
 let generated=0,historyReads=0;
 const sample={run_id:"00000000-0000-4000-8000-000000000042",
  show_id:"benchmark:tag-standard",
  show_name:"Ringside Benchmark · Tag · conventional 2v2",
  provider:"GROQ",model:"openai/gpt-oss-20b",
  duration_ms:1750,provider_calls:1,input_tokens:700,output_tokens:420,
  rating:null,flags:[],notes:"",status:"READY",error_code:null,
  created_at:"2026-11-07 10:00:00+00"};
 const failedSample={...sample,run_id:"00000000-0000-4000-8000-000000000043",
  model:"openai/gpt-oss-120b",status:"FAILED",error_code:"FACT_VALIDATION",
  duration_ms:3220,provider_calls:2,input_tokens:2800,output_tokens:1150,
  created_at:"2026-11-07 09:55:00+00"};
 await page.route("**/api/admin?aiLab=summary",route=>{
  historyReads++;
  return route.fulfill({json:{
   usage:[{day:"2026-11-07",provider:"GROQ",calls:3,reserved:6000,
    input:"3000",output:"1400",failed:1,
    provider_rpd_limit:1000,provider_rpd_remaining:970,
    provider_tpm_limit:8000,provider_tpm_remaining:4500,
    provider_last_model:"openai/gpt-oss-20b",
    provider_limit_observed_at:"2026-11-07 09:28:00+00"}],
   runs:generated?[sample,failedSample]:[failedSample],scores:[],
   providers:{groq:true,openai:false},
   scenarios:[
    {id:"singles-technical",name:"Singles · technical classic",
     focus:"A 24-minute clean-pin contest",
     expectation:"Selling and counters",watchFor:"False finishes"},
    {id:"tag-standard",name:"Tag · conventional 2v2",
     focus:"Four wrestlers with a recorded winning side",
     expectation:"Legal participants and clear tag changes",
     watchFor:"Both partners legal simultaneously"}
   ]
  }});
 });
 await page.route("**/api/admin-preview",route=>{
  generated++;
  const body=route.request().postDataJSON();
  expect(route.request().headers()["x-ppw-csrf"]).toBe("csrf");
  expect(body).toMatchObject({
   benchmarkId:"tag-standard",previewProvider:"GROQ",
   settings:{model:"openai/gpt-oss-20b",voice:"MARTY",reasoning:"low",
    detail:"BALANCED",creativity:0.92,additionalGuidance:""}
  });
  expect(body.showId).toBeUndefined();
  return route.fulfill({json:{
   review:{showHeadline:"The legal tag matters",opening:"The crowd watched.",
    closing:"The winning team prevailed.",slots:[{slotId:"benchmark-main-event",
     headline:"The corner battle",recap:"A legal tag changed the contest."}]},
   preview:true,labRunId:sample.run_id,benchmark:{
    scenario:"tag-standard",certifiedFactsValidated:true,
    diagnosticCues:["Some tag-team mechanics mentioned"],humanReviewRequired:true,
    reviewFocus:"Legal participants and clear tag changes",
    watchFor:"Both partners legal simultaneously"},
   metrics:{durationMs:1750,providerCalls:1,inputTokens:700,outputTokens:420}
  }});
 });
 await page.goto("/#/home");
 await page.getByRole("button",{name:"Open Business menu"}).click();
 await page.getByRole("navigation",{name:"Promotion navigation"}).getByRole(
  "button",{name:/Admin/}).click();
 await page.getByRole("button",{name:"AI Testing Lab"}).click();
 await expect(page.getByRole("heading",{name:"Wrestling IQ Benchmarks"})).toBeVisible();
 await expect(page.getByText(/970\/1000 requests left that day/)).toBeVisible();
 await expect(page.getByText(/4500\/8000 tokens left that minute/)).toBeVisible();
 expect(generated).toBe(0); // Opening the AI Lab must never spend AI tokens.
 await expect(page.getByText(/FAILED: FACT_VALIDATION/)).toBeVisible();
 await expect(page.locator(".ppw-lab-history-row").filter({
  hasText:"FAILED: FACT_VALIDATION"
 }).getByRole("button",{name:/Read & rate|Compare/})).toHaveCount(0);
 await expect(page.getByLabel("Benchmark provider").locator("option")).toHaveCount(1);
 await page.getByLabel("Wrestling scenario").selectOption("tag-standard");
 await expect(page.getByText(/Both partners legal simultaneously/)).toBeVisible();
 await page.getByLabel("Groq model").selectOption("openai/gpt-oss-20b");
 await page.getByRole("button",{name:"Run Wrestling IQ benchmark"}).click();
 await expect(page.getByText(/Saved Tag · conventional 2v2/)).toBeVisible();
 await expect(page.getByText(/1 provider call\(s\)/)).toBeVisible();
 await expect(page.getByText(/Ringside Benchmark · Tag · conventional 2v2/)).toBeVisible();
 expect(generated).toBe(1);
 expect(historyReads).toBe(2);
});
