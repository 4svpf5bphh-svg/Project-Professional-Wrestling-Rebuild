import {test,expect} from "@playwright/test";
const overview={world:{revision:5,name:"Genesis",year:3,week:1,phase:"OPEN",
 nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
 membership:"ACTIVE",promotion:{id:"home",name:"CWA",tier:"INDEPENDENT",
 cash:2000000,debt:0,lastWeeklyNet:0,financialDistress:"HEALTHY"}};
const stories=[
 {id:"week52:official",year:2,week:52,desk:"OFFICIAL",
  certainty:"CONFIRMED",promotionId:"home",promotionName:"CWA",
  showId:"s52",title:"The Year Ends With a Champion",summary:"A certified title change.",
  sourceKind:"TITLE"},
 {id:"week51:official",year:2,week:51,desk:"OFFICIAL",
  certainty:"CONFIRMED",promotionId:"home",promotionName:"CWA",
  showId:"s51",title:"The Road to the Finale",summary:"The official rivalry grew.",
  sourceKind:"MATCH"},
 {id:"week52:dirt",year:2,week:52,desk:"DIRT",
  certainty:"SPECULATION",promotionId:"home",promotionName:"CWA",
  showId:"s52",title:"A Champion With Enemies?",summary:"The rumour mill is busy.",
  sourceKind:"CROWD"},
 {id:"week51:dirt",year:2,week:51,desk:"DIRT",
  certainty:"SPECULATION",promotionId:"home",promotionName:"CWA",
  showId:"s51",title:"Locker Room Whisper",summary:"Speculation from last week.",
  sourceKind:"CROWD"}
];
for(const width of [320,390]){
 test(`Both News desks distinguish certified This Week from previous weeks at ${width}px`,
 async({page})=>{
  await page.setViewportSize({width,height:width===320?568:844});
  const calls:string[]=[];
  await page.route("**/api/session",r=>r.fulfill({json:{
   worldId:"world",playerId:"manager",csrfToken:"opaque",
   overview,availablePromotions:[],unseenLegendReveal:false
  }}));
  await page.route("**/api/card",r=>{
   const method=r.request().postDataJSON().method as string;
   calls.push(method);
   if(method==="industry")return r.fulfill({json:{
    worldName:"Genesis",year:3,week:1,ownPromotionId:"home",
    ownPromotionName:"CWA",promotions:[],headlines:[],broadcasts:[]
   }});
   if(method==="industryNews")return r.fulfill({json:{
    latestEdition:{year:2,week:52},awards:[],annualAwards:[],
    voices:[],stories:[...stories,{...stories[0]!,id:"duplicate-editorial-source"}]
   }});
   return r.fulfill({json:{}});
  });
  await page.goto("/#/news");
  for(const [desk,current,older] of [
   ["Official News","The Year Ends With a Champion","The Road to the Finale"],
   ["Dirt Sheets","A Champion With Enemies?","Locker Room Whisper"]
  ] as const){
   await page.getByRole("button",{name:desk}).click();
   const news=page.locator(".ppw-news");
   await expect(news.locator(".ppw-news-edition-label")).toHaveText("THIS WEEK");
   await expect(news.locator(".ppw-news-edition-clock"))
    .toHaveText("YEAR 2 · WEEK 52");
   await expect(news.locator(".ppw-news-edition-current")).toContainText(current);
   await expect(news.locator(".ppw-news-edition-current")).not.toContainText(older);
   await expect(news.locator(".ppw-news-previous-weeks")).toHaveAttribute("open","");
   await expect(news.locator(".ppw-news-previous-summary")).toHaveText("PREVIOUS WEEKS");
   await expect(news.locator(".ppw-news-previous-clock")).toHaveText("YEAR 2 · WEEK 51");
   await expect(news.locator(".ppw-news-previous-weeks")).toContainText(older);
   await expect(news.locator(".ppw-hot-tag-thread")).toHaveCount(2);
   const safe=await page.evaluate(()=>
    document.documentElement.scrollWidth-innerWidth);
   expect(safe,`No ${desk} iPhone horizontal overflow`).toBeLessThanOrEqual(1);
  }
  expect(calls,
   "Chronology is client-side over the existing single cached News read").toEqual(["industry","industryNews"]);
 });
}
