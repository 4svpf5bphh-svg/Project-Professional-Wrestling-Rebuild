import {test,expect} from "@playwright/test";
const overview={world:{revision:4,name:"Genesis",year:1,week:12,
 phase:"OPEN",nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
 membership:"ACTIVE",promotion:{id:"independent",name:"Moonlight Wrestling",
 tier:"LOCAL",cash:100000,debt:0,lastWeeklyNet:-20000,financialDistress:"DISTRESSED"}};
const session={worldId:"genesis",playerId:"owner",csrfToken:"opaque",overview,
 availablePromotions:[]};
const business=(approved:boolean)=>({
 name:"Moonlight Wrestling",tier:"LOCAL",year:1,week:12,phase:"OPEN",
 homeMarketName:"Birmingham",mediaReach:30,cash:approved?82000:100000,debt:0,
 standing:null,weeklyMediaIncome:0,weeklySponsorIncome:0,
 weeklyFixedOverhead:approved?8400:10000,
 weeklyGuarantees:approved?600:9600,weeklyStaffPayroll:0,
 recurringMargin:approved?-9000:-19600,lastWeeklyNet:approved?-18000:-20000,
 runwayWeeks:3.8,financialDistress:approved?"HEALTHY":"DISTRESSED",
 shows:[],rollingFourWeeks:{income:0,spending:0,net:0,byCategory:[]},
 recentTransactions:[],territories:[]
});
const plan={
 worldRevision:4,year:1,week:12,promotionId:"independent",
 financialDistress:"DISTRESSED",stressWeeks:12,
 minimumViableRoster:6,currentRoster:8,oldOverhead:10000,newOverhead:8400,
 oldCadence:1,newCadence:2,priorRestructures:0,
 releases:[
  {personId:"expensive-a",contractId:"deal-a",name:"Star One",settlement:10000},
  {personId:"expensive-b",contractId:"deal-b",name:"Star Two",settlement:8000}]
};
test("iPhone: voluntary restructuring previews exact cuts and requires explicit owner consent",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const methods:string[]=[];let applied=false;
 await page.route("**/api/session",route=>route.fulfill({json:session}));
 await page.route("**/api/card",route=>{
  const input=route.request().postDataJSON() as {
   method:string;requestId?:string;expectedRevision?:number;
   worldId:string;promotionId:string;
  };
  methods.push(input.method);
  expect(input.worldId).toBe("genesis");
  expect(input.promotionId).toBe("independent");
  if(input.method==="business")
   return route.fulfill({json:business(applied)});
  if(input.method==="previewRestructure")
   return route.fulfill({json:plan});
  if(input.method==="restructurePromotion"){
   expect(input.expectedRevision).toBe(4);
   expect(input.requestId).toMatch(/^[0-9a-f-]{36}$/);
   applied=true;
   return route.fulfill({json:{status:"APPLIED",revision:5,
    result:{newOverhead:8400,releasedContracts:2,settlement:18000}}});
  }
  return route.fulfill({json:{}});
 });
 await page.goto("/#/business");
 await expect(page.getByRole("heading",{name:"Financial recovery"})).toBeVisible();
 await expect(page.getByRole("button",{name:"Review restructuring options"})).toBeVisible();
 expect(methods).toEqual(["business"]);
 await page.getByRole("button",{name:"Review restructuring options"}).click();
 await expect(page.getByRole("heading",{name:"Contracts to terminate"})).toBeVisible();
 await expect(page.getByText("Star One",{exact:true})).toBeVisible();
 await expect(page.getByText("Star Two",{exact:true})).toBeVisible();
 await expect(page.getByText("US$10,000 settlement")).toBeVisible();
 await expect(page.getByText("US$8,000 settlement")).toBeVisible();
 expect(methods).toEqual(["business","previewRestructure"]);
 await page.getByRole("button",{name:"Cancel"}).click();
 await expect(page.getByText("Contracts to terminate")).toHaveCount(0);
 expect(methods).toEqual(["business","previewRestructure"]);
 await page.getByRole("button",{name:"Review restructuring options"}).click();
 page.once("dialog",dialog=>void dialog.accept());
 await page.getByRole("button",{name:"Approve restructuring"}).click();
 await expect(page.getByRole("heading",{name:"Financial recovery"})).toHaveCount(0);
 await expect(page.getByText("BASE WEEKLY OVERHEAD")).toBeVisible();
 const spend=page.locator(".ppw-business-metric").filter({hasText:"BASE WEEKLY OVERHEAD"});
 await expect(spend).toContainText("8,400");
 expect(methods).toEqual(["business","previewRestructure",
  "previewRestructure","restructurePromotion","business"]);
 const bounds=await page.locator(".ppw-business").boundingBox();
 expect(bounds).not.toBeNull();
 expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(391);
});
