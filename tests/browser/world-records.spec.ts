import {test,expect} from "@playwright/test";
const overview={world:{revision:4,name:"PPW",year:2,week:6,phase:"OPEN",
 nextLockEpoch:Date.now()/1000+6000,serverEpoch:Date.now()/1000},
 membership:"ACTIVE",promotion:{id:"promotion-0",name:"Human Pro",tier:"LOCAL",
 cash:1000000,debt:0,lastWeeklyNet:10,financialDistress:"HEALTHY"}};
test("World record book shows earned men/women rankings and searchable wrestler dossiers without polling",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const calls:string[]=[];
 await page.route("**/api/session",route=>route.fulfill({json:{
  worldId:"world",playerId:"owner",csrfToken:"opaque",overview,availablePromotions:[]
 }}));
 await page.route("**/api/card",route=>{
  const req=route.request().postDataJSON() as {method:string;search?:string};
  calls.push(req.method);
  const responses:Record<string,unknown>={
   industry:{worldName:"PPW",year:2,week:6,phase:"OPEN",
    nextLockEpoch:Date.now()/1000+6000,ownPromotionId:"promotion-0",
    ownPromotionName:"Human Pro",promotions:[],headlines:[],broadcasts:[]},
   promotionRecordBook:{leaders:[]},
   worldRankings:{windowWeeks:13,year:2,week:6,leaders:[
    {personId:"a",name:"Alice",division:"WOMEN",wins:3,losses:1,matches:4,
     averageStars:4.2,averageCrowd:80,score:75,champion:true,rank:1},
    {personId:"b",name:"Bob",division:"MEN",wins:5,losses:2,matches:7,
     averageStars:4.1,averageCrowd:86,score:80,champion:false,rank:1}]},
   worldCareerSearch:{people:[{personId:"a",name:"Alice",division:"WOMEN",
    status:"ACTIVE",promotionName:"Human Pro"}],hasMore:false}
  };
  if(req.method==="worldCareerSearch")expect(req.search).toBe("Ali");
  return route.fulfill({json:responses[req.method]??overview});
 });
 await page.goto("/#/records");
 await expect(page.getByRole("heading",{name:"Record Book",level:1})).toBeVisible();
 await expect(page.getByRole("heading",{name:"The Record Books"})).toBeVisible();
 await page.getByRole("button",{name:"World Rankings"}).click();
 await expect(page.getByText("Bob",{exact:true})).toBeVisible();
 await expect(page.getByText("5–2")).toBeVisible();
 await page.getByRole("button",{name:"Women"}).click();
 await expect(page.getByText(/Alice/)).toBeVisible();
 await expect(page.getByText("Bob",{exact:true})).toHaveCount(0);
 await page.getByRole("button",{name:"Find a Career"}).click();
 const input=page.getByPlaceholder("Search the wrestling World");
 await input.fill("Ali");
 expect(calls.filter(x=>x==="worldCareerSearch")).toHaveLength(0);
 await page.getByRole("button",{name:"Search careers"}).click();
 await expect(page.getByRole("button",{name:"View career →"})).toBeVisible();
 expect(calls.filter(x=>x==="worldRankings")).toHaveLength(1);
 expect(calls.filter(x=>x==="worldCareerSearch")).toHaveLength(1);
 await expect(page.locator(".ppw-industry-career-row")).toHaveCount(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth))
  .toBeLessThanOrEqual(391);
});

test("promotion record ordering is client-only and respects the bounded top-eight source",async({page})=>{
 await page.setViewportSize({width:320,height:720});
 const calls:string[]=[];
 await page.route("**/api/session",r=>r.fulfill({json:{
  worldId:"world",playerId:"owner",csrfToken:"opaque",overview,availablePromotions:[]
 }}));
 await page.route("**/api/card",r=>{
  const method=r.request().postDataJSON().method as string;calls.push(method);
  if(method==="industry")return r.fulfill({json:{
   worldName:"PPW",year:2,week:6,phase:"OPEN",ownPromotionId:"promotion-0",
   ownPromotionName:"Human Pro",promotions:[],headlines:[],broadcasts:[]}});
  if(method==="promotionRecordBook")return r.fulfill({json:{leaders:[
   {personId:"a",name:"Alice",matches:9,wins:6,averageStars:3.3},
   {personId:"b",name:"Bob",matches:12,wins:5,averageStars:4.4},
   {personId:"c",name:"Cara",matches:5,wins:4,averageStars:2.9}
  ]}});
  return r.fulfill({json:{}});
 });
 await page.goto("/#/records");
 const names=page.locator(".ppw-promotion-record-row .ppw-record-identity>strong");
 await expect(names).toHaveText(["Alice","Bob","Cara"]);
 await page.getByRole("button",{name:"Top average rating"}).click();
 await expect(names).toHaveText(["Bob","Alice","Cara"]);
 await page.getByRole("button",{name:"Most matches"}).click();
 await expect(names).toHaveText(["Bob","Alice","Cara"]);
 await page.getByRole("button",{name:"Most wins"}).click();
 await expect(names).toHaveText(["Alice","Bob","Cara"]);
 expect(calls.filter(x=>x==="promotionRecordBook")).toHaveLength(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
  .toBeLessThanOrEqual(1);
});
