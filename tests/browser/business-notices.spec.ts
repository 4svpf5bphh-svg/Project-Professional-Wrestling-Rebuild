import {test,expect} from "@playwright/test";
const base={world:{revision:4,name:"Genesis",year:2,week:1,
 phase:"OPEN",nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
 membership:"ACTIVE",promotion:{id:"local",name:"Home",tier:"LOCAL",
 cash:5000000,debt:0,lastWeeklyNet:null,financialDistress:"WATCH",
 attention:{plannedShows:0,unpreparedShow:false,pendingBackstage:true,
  backstageRequests:[{personId:"wendy",name:"Wendy",kind:"MORALE"}],
  expiringTalent:false,pendingContractOffers:false,
  businessUpdates:[
   {id:"business-update:100",kind:"ANNUAL_REVIEW",year:1,week:52,
    prestigeDelta:1.8,before:null,after:null},
   {id:"business-update:101",kind:"FINANCIAL_HEALTH",year:2,week:1,
    prestigeDelta:null,before:"HEALTHY",after:"WATCH"}]}}};
test("iPhone shows genuine year-end/finance notices with private dismissal and protected obligations",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const session={worldId:"world",playerId:"owner",csrfToken:"opaque",overview:base,availablePromotions:[]};
 const methods:string[]=[];let deleted=new Set<string>();
 await page.route("**/api/session",route=>route.fulfill({json:session}));
 await page.route("**/api/card",async route=>{
  const req=route.request().postDataJSON() as {method:string;attentionId?:string;attentionIds?:string[]};
  methods.push(req.method);
  if(req.method==="overview"){
   const p=base.promotion;
   return route.fulfill({json:{...base,promotion:{...p,attention:{
    ...p.attention,businessUpdates:p.attention.businessUpdates.filter(x=>!deleted.has(x.id))
   }}}});
  }
  if(req.method==="dismissAttention"){
   expect(req.attentionId).toBe("business-update:100");
   deleted.add(req.attentionId!);
   return route.fulfill({json:{dismissed:true,firstDismissal:true}});
  }
  if(req.method==="dismissAttentionBatch"){
   expect(req.attentionIds).toEqual(["business-update:101"]);
   for(const id of req.attentionIds!)deleted.add(id);
   return route.fulfill({json:{dismissed:1,firstDismissals:1}});
  }
  return route.fulfill({json:{}});
 });
 await page.goto("/#/home");
 await expect(page.getByRole("heading",{name:"Company updates"})).toBeVisible();
 await expect(page.getByText("Your annual company review is in")).toBeVisible();
 await expect(page.getByText("Your financial outlook has changed")).toBeVisible();
 await expect(page.getByText(/prestige rose by 1.8 points/)).toBeVisible();
 await expect(page.getByText(/Healthy to On watch/)).toBeVisible();
 await expect(page.getByRole("button",{name:/Plan this week's show/})).toBeVisible();
 await expect(page.getByRole("button",{name:/Wendy is waiting/})).toBeVisible();
 await page.getByRole("button",{name:"Dismiss your annual company review is in"}).click();
 await expect(page.getByText("Your annual company review is in")).toHaveCount(0);
 await expect(page.getByText("Your financial outlook has changed")).toBeVisible();
 await expect(page.getByRole("button",{name:/Plan this week's show/})).toBeVisible();
 await page.reload();
 await expect(page.getByText("Your annual company review is in")).toHaveCount(0);
 await expect(page.getByText("Your financial outlook has changed")).toBeVisible();
 await page.getByRole("button",{name:"Open Business",exact:true}).click();
 await expect(page).toHaveURL(/#\/business$/);
 expect(methods.slice(0,3)).toEqual(["overview","dismissAttention","overview"]);
});
test("iPhone clears mixed contract, backstage and company notices without hiding required action",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const p=base.promotion;
 const notice={...p.attention,
  offerResults:[{id:"offer-result:two",personId:"fred",name:"Fred",status:"ACCEPTED"}],
  backstageResults:[{id:"backstage-result:25",personId:"wendy",name:"Wendy",status:"BROKEN"}]};
 const session={worldId:"world",playerId:"owner",csrfToken:"opaque",
  overview:{...base,promotion:{...p,attention:notice}},availablePromotions:[]};
 const methods:string[]=[];let dismissed=false;
 await page.route("**/api/session",route=>route.fulfill({json:session}));
 await page.route("**/api/card",route=>{
  const req=route.request().postDataJSON() as {method:string;attentionIds?:string[]};
  methods.push(req.method);
  if(req.method==="dismissAttentionBatch"){
   expect(req.attentionIds).toEqual(["offer-result:two","backstage-result:25",
    "business-update:100","business-update:101"]);
   dismissed=true;return route.fulfill({json:{dismissed:4,firstDismissals:4}});
  }
  if(req.method==="overview")return route.fulfill({json:{...base,promotion:{
   ...p,attention:dismissed?{...notice,offerResults:[],backstageResults:[],businessUpdates:[]}:notice
  }}});
  return route.fulfill({json:{}});
 });
 await page.goto("/#/home");
 await page.getByRole("button",{name:"Clear all resolved updates"}).click();
 await expect(page.getByText("Company updates")).toHaveCount(0);
 await expect(page.getByText("Decisions received")).toHaveCount(0);
 await expect(page.getByText("Promises settled")).toHaveCount(0);
 await expect(page.getByRole("button",{name:/Plan this week's show/})).toBeVisible();
 await expect(page.getByRole("button",{name:/Wendy is waiting/})).toBeVisible();
 expect(methods).toEqual(["overview","dismissAttentionBatch"]);
});
