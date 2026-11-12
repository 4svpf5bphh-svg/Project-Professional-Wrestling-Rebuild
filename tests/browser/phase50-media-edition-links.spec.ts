import {test,expect} from "@playwright/test";
const overview={world:{revision:9,name:"Genesis",year:2,week:25,phase:"OPEN",
 nextLockEpoch:Date.now()/1000+6000,serverEpoch:Date.now()/1000},
 membership:"ACTIVE",promotion:{id:"home",name:"CWA",tier:"RISING",
 cash:1000000,debt:0,lastWeeklyNet:0,financialDistress:"HEALTHY"}};
const pressSummary='Josh Robinson offered no concrete details when Mara Finch asked about the main event, replying "There are conversations we will have behind closed doors. Tonight was important."';
const news={
 latestEdition:{year:2,week:24},voices:[],annualAwards:[],
 awards:[
  {year:2,week:24,kind:"MATCH",promotionId:"home",
   promotionName:"CWA",showId:"ppv",showName:"Armageddon",slotId:"m1",
   title:"Samoa Joe vs Mistico",peopleNames:["Samoa Joe","Mistico"],
   personIds:["joe","mistico"],rating:4.5,ratingUnit:"STARS"},
  {year:2,week:24,kind:"ANGLE",promotionId:"rival",
   promotionName:"Rival Wrestling",showId:"rival-show",showName:"Rival Live",slotId:"a1",
   title:"Rival confrontation",peopleNames:["Rex"],personIds:["rex"],
   rating:88,ratingUnit:"CROWD"}],
 stories:[
  {year:2,week:24,id:"press:official:ppv",desk:"OFFICIAL",
   certainty:"CONFIRMED",promotionId:"home",promotionName:"CWA",
   showId:"ppv",title:"Josh Robinson keeps details close after Armageddon",
   summary:pressSummary,sourceKind:"EVENT"},
  {year:2,week:24,id:"press:rumour:ppv",desk:"DIRT",
   certainty:"SPECULATION",promotionId:"home",promotionName:"CWA",
   showId:"ppv",title:"Josh Robinson kept details close. What happens after Armageddon?",
   summary:"The public answer was evasive. Any private decisions remain unknown.",
   sourceKind:"EVENT"}
 ]
};
for(const width of [320,390]){
 test(`Media issue and award links open only real completed results on iPhone ${width}px`,
 async({page})=>{
  await page.setViewportSize({width,height:width===320?568:844});
  const requests:{method:string;showId?:string;targetPromotionId?:string}[]=[];
  await page.route("**/api/session",r=>r.fulfill({json:{
   worldId:"world",playerId:"booker",csrfToken:"opaque",overview,
   unseenLegendReveal:false,availablePromotions:[]
  }}));
  await page.route("**/api/card",r=>{
   const p=r.request().postDataJSON() as {
    method:string;showId?:string;targetShowId?:string;targetPromotionId?:string};
   requests.push({method:p.method,showId:p.showId??p.targetShowId,
    targetPromotionId:p.targetPromotionId});
   if(p.method==="industry")return r.fulfill({json:{
    worldName:"Genesis",year:2,week:25,ownPromotionId:"home",
    ownPromotionName:"CWA",promotions:[],headlines:[],
    broadcasts:[{showId:"rival-show",promotionId:"rival",humanManaged:true}]
   }});
   if(p.method==="industryNews")return r.fulfill({json:news});
   if(p.method==="results")return r.fulfill({json:{
    showId:"ppv",showName:"Armageddon",promotionName:"CWA",year:2,week:24,
    bookingClass:"PREMIUM",crowdResponse:88,matchCount:0,angleCount:0,
    entries:[],staffReport:null
   }});
   if(p.method==="publicResults")return r.fulfill({json:{
    promotionName:"Rival Wrestling",showName:"Rival Live",year:2,week:24,
    crowdResponse:86,entries:[]
   }});
   return r.fulfill({json:{}});
  });
  await page.goto("/#/news");
  await expect(page.locator(".ppw-news-edition-label")).toHaveText("THIS WEEK");
  await expect(page.locator(".ppw-news-edition-clock")).toHaveText("YEAR 2 · WEEK 24");
  const ownAward=page.locator('.ppw-news-poster[data-kind="match"]');
  await expect(ownAward.getByRole("button",{name:"Read completed show"})).toBeVisible();
  const rivalAward=page.locator('.ppw-news-poster[data-kind="angle"]');
  await expect(rivalAward.getByRole("button",{name:"Read rival results"})).toBeVisible();
  await rivalAward.getByRole("button",{name:"Read rival results"}).click();
  await expect.poll(()=>requests.filter(p=>p.method==="publicResults").length).toBe(1);
  await expect(page.getByText("Rival Live")).toBeVisible();
  await page.reload();
  const press=page.locator(".ppw-news-official .ppw-news-press");
  await expect(press).toHaveCount(1);
  await expect(press).toContainText("Josh Robinson keeps details close");
  await expect(press).toContainText("behind closed doors");
  await press.locator(".ppw-hot-tag-thread summary").click();
  await expect(press.locator(".ppw-hot-tag-news-post").first())
   .toContainText(/sidestep|promoter|details|card|answer|follow-up/i);
  await expect(press.getByRole("button",{name:"Read the completed PPV"})).toBeVisible();
  await press.getByRole("button",{name:"Read the completed PPV"}).click();
  await expect.poll(()=>requests.filter(p=>p.method==="results"&&p.showId==="ppv").length)
   .toBe(1);
  await page.reload();
  await page.getByRole("button",{name:"Dirt Sheets"}).click();
  const dirt=page.locator(".ppw-news-dirt .ppw-news-press");
  await expect(dirt).toHaveCount(1);
  await expect(dirt).toContainText("What happens after Armageddon?");
  await expect(dirt.getByRole("button",{name:"Read the completed PPV"}),
   "A rumour must not impersonate a confirmed result link").toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
   .toBeLessThanOrEqual(1);
  expect(requests.filter(p=>p.method==="publicResults")[0]?.targetPromotionId).toBe("rival");
 });
}
