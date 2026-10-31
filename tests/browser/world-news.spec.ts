import {test,expect} from "@playwright/test";
const overview={world:{revision:4,name:"PPW",year:2,week:7,phase:"OPEN",
 nextLockEpoch:Date.now()/1000+6000,serverEpoch:Date.now()/1000},
 membership:"ACTIVE",promotion:{id:"human",name:"Human Pro",tier:"LOCAL",
 cash:1000000,debt:0,lastWeeklyNet:10,financialDistress:"HEALTHY"}};
const session={worldId:"world",playerId:"owner",csrfToken:"opaque",overview,
 availablePromotions:[]};
test("iPhone World News awards, official and dirt sheets render on demand and never spill plans",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const calls:string[]=[];
 await page.route("**/api/session",route=>route.fulfill({json:session}));
 await page.route("**/api/card",route=>{
  const method=String(route.request().postDataJSON().method);
  calls.push(method);
  if(method==="industry")return route.fulfill({json:{
   worldName:"PPW",year:2,week:7,phase:"OPEN",nextLockEpoch:Date.now()/1000+6000,
   ownPromotionId:"human",ownPromotionName:"Human Pro",
   promotions:[],headlines:[
    {id:"stage-1",kind:"CAREER_STAGE_CHANGED",year:2,week:6,
     personId:"a",personName:"Maya Storm",careerStage:"SPECIAL_ATTRACTION",
     fromStage:"VETERAN",promotionName:null},
    {id:"retire-1",kind:"WRESTLER_RETIRED",year:2,week:6,
     personId:"b",personName:"Alex Rook",careerStage:null,fromStage:null,
     promotionName:null}],broadcasts:[]}});
  if(method==="industryNews")return route.fulfill({json:{
   awards:[{year:2,week:6,kind:"MATCH",promotionId:"ai",
    promotionName:"AI Elite",showId:"s2",showName:"Final Clash",slotId:"m2",
    title:"Cara vs Drew",peopleNames:["Cara","Drew"],personIds:["c","d"],
    rating:4.75,ratingUnit:"STARS"},
    {year:2,week:6,kind:"ANGLE",promotionId:"human",promotionName:"Human Pro",
    showId:"s1",showName:"Fight Night",slotId:"a1",title:"Alice — Turn",
    peopleNames:["Alice"],personIds:["a"],rating:88,ratingUnit:"CROWD"}],
   annualAwards:[{year:1,week:37,kind:"MATCH",promotionId:"ai",
    promotionName:"AI Elite",showId:"last-year",showName:"World Classic",
    slotId:"m1",title:"Great Match of the Year",rating:5,ratingUnit:"STARS"}],
   stories:[{year:2,week:6,id:"m2",desk:"OFFICIAL",certainty:"CONFIRMED",
    promotionId:"ai",promotionName:"AI Elite",showId:"s2",
    title:"A certified classic",summary:"4.75 star match",sourceKind:"MATCH"},
    {year:2,week:6,id:"s1",desk:"DIRT",certainty:"SPECULATION",
    promotionId:"human",promotionName:"Human Pro",showId:"s1",
    title:"Creative shake-up?",summary:"No plans have been confirmed.",sourceKind:"CROWD"},
    {year:2,week:6,id:"wild:s1",desk:"DIRT",certainty:"SPECULATION",
    promotionId:"human",promotionName:"Human Pro",showId:"s1",
    title:"Did Alice walk out after Fight Night? Conflicting sources",
    summary:"One anonymous claim alleges a departure. A competing account denies it. No backstage incident has been established.",
    sourceKind:"EVENT"}]
  }});
  return route.fulfill({json:method==="overview"?overview:{}});
 });
 await page.goto("/#/news");
 await expect(page.getByRole("heading",{name:"World News"})).toBeVisible();
 await expect(page.getByRole("button",{name:"Promotions"})).toHaveCount(0);
 // Opening the News root fetches the weekly public desk once.
 await page.getByRole("button",{name:"Official News"}).click();
 await expect(page.getByText("MATCH OF THE WEEK")).toBeVisible();
 await expect(page.getByText("ANGLE OF THE WEEK")).toBeVisible();
 await expect(page.getByText("4.75 ★")).toBeVisible();
 await expect(page.getByText("88/100 CROWD")).toBeVisible();
 await expect(page.getByText("A certified classic")).toBeVisible();
 await expect(page.getByText("Maya Storm becomes a special attraction")).toBeVisible();
 await expect(page.getByText("Alex Rook hangs up the boots")).toBeVisible();
 await expect(page.getByText(/Career stage: veteran → special attraction/)).toBeVisible();
 for(const width of [390,320]){
  await page.setViewportSize({width,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
   .toBeLessThanOrEqual(1);
 }
 await page.setViewportSize({width:390,height:844});
 await expect(page.locator(".ppw-news-annual")).toHaveCount(0);
 // The annual awards now have their own World destination.
 const poster=page.locator(".ppw-news-poster").first();
 const rect=await poster.boundingBox();
 expect(rect).not.toBeNull();
 expect(rect!.x).toBeGreaterThanOrEqual(0);
 expect(rect!.x+rect!.width).toBeLessThanOrEqual(391);
 await page.getByRole("button",{name:"Dirt Sheets"}).click();
 await expect(page.getByText("Creative shake-up?")).toBeVisible();
 await expect(page.getByText("RUMOUR / NOT CONFIRMED")).toBeVisible();
 await expect(page.getByText("UNVERIFIED / DISPUTED REPORT 👀")).toBeVisible();
 await expect(page.locator(".ppw-dirt-outlet")).toHaveCount(2);
 await expect(page.locator(".ppw-news-dirt")).toHaveCount(1);
 await expect(page.getByText("Fictional in-game wrestling reporting.",{exact:false}).first()).toBeVisible();
 await expect(page.getByText(/Did Alice walk out after Fight Night/)).toBeVisible();
 const threads=page.locator(".ppw-news-dirt .ppw-hot-tag-thread");
 await expect(threads).toHaveCount(2);
 await threads.first().locator("summary").click();
 await expect(threads.first().locator(".ppw-hot-tag-brand")).toContainText("HOT TAG");
 await expect(threads.first().locator(".ppw-hot-tag-news-post")).toHaveCount(3);
 await expect(threads.first().locator(".ppw-hot-tag-brand")).toContainText("Tag in. Sound off.");
 for(const width of [320,390]){
  await page.setViewportSize({width,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
   .toBeLessThanOrEqual(1);
 }
 await expect(page.locator(".ppw-news-wild-theory")).toHaveCount(1);
 await expect(page.getByText("A certified classic")).toHaveCount(0);
 await expect(page.getByText("SECRET PRIVATE CONTRACT")).toHaveCount(0);
 await page.getByRole("button",{name:"Official News"}).click();
 expect(calls).toEqual(["industry","industryNews"]);
});
