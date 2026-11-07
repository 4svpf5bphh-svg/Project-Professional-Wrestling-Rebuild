import {test,expect} from "@playwright/test";
const now=Date.now()/1000;
const overview={world:{revision:8,name:"Genesis",year:1,week:2,
 phase:"RESOLVING",nextLockEpoch:now-3600,serverEpoch:now},
 membership:"ACTIVE",promotion:{id:"crown",name:"Crown Wrestling",tier:"LOCAL",
 cash:200000,debt:0,lastWeeklyNet:0}};
const copy={version:1,
 news:{slotId:"benchmark-main-event",headline:"Holt wins inside the steel",
  summary:"Mason Holt defeated Isaiah King by pinfall inside the Steel Cage. "+
   "The official result was a clean three-count after a punishing encounter."},
 wrestler:{slotId:"benchmark-main-event",personId:"fixture-0",
  text:"I walked into that cage knowing the walls would test us. I left with the result and nobody can take that from me."},
 roadAgent:{slotId:"benchmark-main-event",
  note:"Keep the follow-up focused on what the cage fight achieved. Give both wrestlers recovery time before repeating another high-pressure stipulation."}};
test("iPhone protected AI Lab runs one fictional 20B voice batch and keeps saved results",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.route("**/api/session",route=>route.fulfill({json:{
  worldId:"genesis",playerId:"operator",csrfToken:"csrf",overview,
  canManualAdvance:false,canAiBenchmark:true,availablePromotions:[]}}));
 await page.route("**/api/card",route=>route.fulfill({json:overview}));
 let calls=0,reads=0;
 await page.route("**/api/admin?aiLab=*",route=>{
  reads++;
  return route.fulfill({json:{
   usage:[],runs:[],scores:[],providers:{groq:true,openai:false},
   scenarios:[{id:"steel-cage",name:"Steel Cage · singles",
    focus:"Wrestling in cage",expectation:"A real pin",watchFor:"invented escape"}],
   shortformScenarios:[
    {id:"i-quit",name:"I Quit · intense surrender",
     expectation:"Real verbal finish and useful advice"},
    {id:"steel-cage",name:"Steel Cage · decisive pinfall",
     expectation:"Correct pinfall, character and staff advice"}
   ],
   shortformRuns:calls?[{
    runId:"00000000-0000-4000-8000-000000000042",
    scenarioId:"steel-cage",scenarioName:"Steel Cage · decisive pinfall",
    model:"openai/gpt-oss-20b",status:"READY",errorCode:null,
    durationMs:1250,providerCalls:1,inputTokens:825,outputTokens:240,
    createdAt:"2026-11-07T13:00:00Z",copy}]:[]
  }});
 });
 await page.route("**/api/admin-preview",route=>{
  const body=route.request().postDataJSON();
  expect(Object.keys(body)).toEqual(["shortformBenchmarkId"]);
  expect(body.shortformBenchmarkId).toBe("steel-cage");
  expect(route.request().headers()["x-ppw-csrf"]).toBe("csrf");
  calls++;
  return route.fulfill({json:{copy,runId:"00000000-0000-4000-8000-000000000042",
   metrics:{durationMs:1250,providerCalls:1,inputTokens:825,outputTokens:240}}});
 });
 await page.goto("/#/home");
 await page.getByRole("button",{name:"Open Business menu"}).click();
 await page.getByRole("navigation",{name:"Promotion navigation"})
  .getByRole("button",{name:/Admin/}).click();
 await expect(page.getByRole("heading",{name:"Post-show voices · Groq 20B"})).toBeVisible();
 await expect(page.getByRole("button",{name:"Playtests"})).toHaveCount(0);
 const scenario=page.getByLabel("Fictional post-show scenario");
 await expect(scenario).toHaveValue("i-quit");
 await scenario.selectOption("steel-cage");
 await page.getByRole("button",{name:"Run 20B voice batch"}).click();
 await expect.poll(()=>calls).toBe(1);
 await expect(page.getByText(/Saved the 20B voice batch · 1 Groq request/)).toBeVisible();
 await expect(page.getByText("OFFICIAL NEWS · Holt wins inside the steel")).toBeVisible();
 await expect(page.getByText("WRESTLER REACTION")).toBeVisible();
 await expect(page.getByText("ROAD AGENT")).toBeVisible();
 await expect(page.getByText(/Give both wrestlers recovery time/)).toBeVisible();
 await expect(scenario).toHaveValue("steel-cage");
 for(const width of [320,390]){
  await page.setViewportSize({width,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
   .toBeLessThanOrEqual(1);
 }
 expect(reads).toBeGreaterThanOrEqual(2);
 expect(calls).toBe(1);
});
