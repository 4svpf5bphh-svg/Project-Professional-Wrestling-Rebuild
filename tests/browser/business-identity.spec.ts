import {test,expect} from "@playwright/test";
const overview={world:{revision:4,name:"Genesis",year:1,week:5,
 phase:"OPEN",nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
 membership:"ACTIVE",promotion:{id:"local",name:"Home",tier:"LOCAL",cash:5_000_000,debt:0,
 lastWeeklyNet:null,financialDistress:"HEALTHY"}};
const session={worldId:"world",playerId:"owner",csrfToken:"opaque",overview,
 availablePromotions:[]};
test("iPhone Business retains authentic home market, broadcast reach and no-fetch report tabs",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const methods:string[]=[];
 await page.route("**/api/session",route=>route.fulfill({json:session}));
 await page.route("**/api/card",route=>{
  const req=route.request().postDataJSON() as {method:string};
  methods.push(req.method);
  if(req.method!=="business")return route.fulfill({json:{}});
  return route.fulfill({json:{
   name:"Home",tier:"LOCAL",year:1,week:5,phase:"OPEN",
   homeMarketName:"Territory 0",mediaReach:90,cash:5_000_000,debt:0,
   standing:{prestige:82,fanReputation:78,businessReputation:82,
    talentReputation:74,lastEvaluatedYear:0},
   weeklyMediaIncome:300_000,weeklySponsorIncome:25_000,
   weeklyFixedOverhead:60_000,weeklyGuarantees:15_000,weeklyStaffPayroll:0,
   recurringMargin:250_000,lastWeeklyNet:0,runwayWeeks:null,
   financialDistress:"HEALTHY",shows:[],
   rollingFourWeeks:{income:425000,spending:125000,net:300000,
    byCategory:[{category:"MEDIA_INCOME",amount:300000},
     {category:"GATE_REVENUE",amount:125000},
     {category:"VENUE_COST",amount:-25000}]},
   recentTransactions:[{eventId:5,year:1,week:5,
    category:"GATE_REVENUE",amount:125000}],
   territories:[{
    marketId:"market-0",name:"Territory 0",awareness:62,
    liveStrength:58,loyalty:54,isHome:true
   }]
  }});
 });
 await page.goto("/#/business");
 await expect(page.getByRole("heading",{name:"Business"})).toBeVisible();
 await expect(page.locator(".ppw-business-metric").filter({hasText:"HOME TERRITORY"}).getByText("Territory 0",{exact:true})).toBeVisible();
 await expect(page.getByText("BROADCAST REACH")).toBeVisible();
 await expect(page.getByText("90",{exact:true})).toBeVisible();
 await expect(page.getByText(/Based in Territory 0/)).toBeVisible();
 // Actual currency values must stay visible inside the iPhone viewport.
 // This covers the finance screenshot regression, not only the data payload.
 const figures=page.locator(".ppw-business-line>strong");
 await expect(figures).toHaveCount(6);
 const amounts=await figures.allTextContents();
 expect(amounts).toContain("US$300,000");
 expect(amounts).toContain("US$25,000");
 expect(amounts).toContain("-US$60,000");
 expect(amounts).toContain("-US$15,000");
 expect(amounts).toContain("US$250,000");
 for(const item of await figures.all()){
  const rect=await item.boundingBox();
  expect(rect).not.toBeNull();
  expect(rect!.x).toBeGreaterThanOrEqual(0);
  expect(rect!.x+rect!.width).toBeLessThanOrEqual(391);
  expect(rect!.height).toBeGreaterThan(14);
  expect(await item.evaluate(el=>getComputedStyle(el).visibility)).toBe("visible");
 }
 await page.getByRole("button",{name:"Standing"}).click();
 await expect(page.getByRole("heading",{name:"Company standing"})).toBeVisible();
 await expect(page.getByText("82 / 100")).toHaveCount(2);
 await expect(page.getByText("78 / 100")).toBeVisible();
 await expect(page.getByText("74 / 100")).toBeVisible();
 await expect(page.getByText(/first annual review has not taken place/)).toBeVisible();
 await page.getByRole("button",{name:"Activity"}).click();
 await expect(page.getByRole("heading",{name:"Four-week activity"})).toBeVisible();
 await expect(page.getByText("Ticket sales")).toHaveCount(2);
 await expect(page.getByText("Venue hire")).toBeVisible();
 await expect(page.getByText("Ticket sales · Y1 W5",{exact:true})).toBeVisible();
 await page.getByRole("button",{name:"Territories"}).click();
 await expect(page.getByRole("heading",{name:"Your markets"})).toBeVisible();
 await expect(page.getByRole("heading",{name:"Territory 0 · Home market"})).toBeVisible();
 await page.getByRole("button",{name:"Finances"}).click();
 await expect(page.getByText("BROADCAST REACH")).toBeVisible();
 expect(methods).toEqual(["business"]);
});
