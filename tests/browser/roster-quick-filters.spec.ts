import {test,expect} from "@playwright/test";

const overview={world:{revision:4,name:"Genesis",year:1,week:5,phase:"OPEN",
 nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
 membership:"ACTIVE",promotion:{id:"cwa",name:"Chaotic Wrestling Alliance",
 tier:"LOCAL",cash:5_000_000,debt:0,lastWeeklyNet:0,financialDistress:"HEALTHY"}};
const session={worldId:"world",playerId:"owner",csrfToken:"csrf",
 overview,availablePromotions:[]};
const people=[
 {personId:"rose",name:"Rose Sinclair",ringName:"Rose Sinclair",
  division:"WOMEN",alignment:"FACE",championships:["Women's World"],
  roleExpectation:"MAIN_EVENT",availability:"YOUR_ROSTER",popularity:88,
  recognition:87,momentum:79,remainingDates:18,medicalWeeksRemaining:null,
  startsInWeeks:0,weeklyGuarantee:3000,appearanceFee:0},
 {personId:"joe",name:"Samoa Joe",ringName:"Samoa Joe",
  division:"MEN",alignment:"HEEL",championships:[],
  roleExpectation:"FEATURED",availability:"YOUR_ROSTER",popularity:81,
  recognition:79,momentum:75,remainingDates:0,medicalWeeksRemaining:null,
  startsInWeeks:0,weeklyGuarantee:2000,appearanceFee:0},
 {personId:"mason",name:"Mason Cole",ringName:"Mason Cole",
  division:"MEN",alignment:"FACE",championships:[],
  roleExpectation:"REGULAR",availability:"YOUR_ROSTER",popularity:61,
  recognition:64,momentum:52,remainingDates:null,medicalWeeksRemaining:2,
  startsInWeeks:0,weeklyGuarantee:1500,appearanceFee:0}
];
test("320px roster quick chips follow booking-picker semantics without another Neon read",async({page})=>{
 await page.setViewportSize({width:320,height:740});
 const requests:Record<string,unknown>[]=[];
 await page.route("**/api/session",route=>route.fulfill({json:session}));
 await page.route("**/api/card",route=>{
  const req=route.request().postDataJSON() as {method:string;filter?:Record<string,unknown>};
  if(req.method==="wrestlerDirectory"){
   requests.push(req.filter??{});
   const division=req.filter?.division??"ALL";
   return route.fulfill({json:{
    view:"ROSTER",year:1,week:5,currentWeekIndex:4,worldRevision:4,
    canEdit:true,hasMore:false,people:people.filter(p=>
     division==="ALL"||p.division===division)
   }});
  }
  return route.fulfill({json:{}});
 });
 await page.goto("/#/roster");
 const cards=page.locator(".ppw-directory-list .ppw-wrestler-card.ppw-wrestler-roster");
 await expect(cards).toHaveCount(3);
 const chips=page.getByLabel("Quick roster filters · this page");
 await chips.getByRole("button",{name:"Heel",exact:true}).click();
 await expect(chips.getByRole("button",{name:"Heel",exact:true}))
  .toHaveAttribute("aria-pressed","true");
 await expect(cards).toHaveCount(1);
 await expect(cards.first()).toContainText("Samoa Joe");
 await chips.getByRole("button",{name:"Face",exact:true}).click();
 await expect(chips.getByRole("button",{name:"Heel",exact:true}))
  .toHaveAttribute("aria-pressed","false");
 await expect(cards).toHaveCount(2);
 await chips.getByRole("button",{name:"Champions",exact:true}).click();
 await expect(cards).toHaveCount(1);
 await expect(cards.first()).toContainText("Rose Sinclair");
 await chips.getByRole("button",{name:"Has dates"}).click();
 await expect(cards).toHaveCount(1);
 await expect(cards.first().locator(".ppw-wrestler-stats")).toHaveCount(0);
 await expect(cards.first().locator(".ppw-wrestler-fans")).toBeVisible();
 expect(requests).toHaveLength(1);
 await page.getByRole("button",{name:"Women",exact:true}).click();
 await expect(cards).toHaveCount(1);
 expect(requests.at(-1)?.division).toBe("WOMEN");
 expect(requests).toHaveLength(2);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
  .toBeLessThanOrEqual(1);
});
