import {test,expect} from "@playwright/test";
const overview={world:{revision:4,name:"PPW",year:2,week:1,phase:"OPEN",
 nextLockEpoch:Date.now()/1000+6000,serverEpoch:Date.now()/1000},
 membership:"ACTIVE",promotion:{id:"human",name:"Human Pro",tier:"LOCAL",
 cash:1000000,debt:0,lastWeeklyNet:10,financialDistress:"HEALTHY"}};
test("World History is an on-demand accessible iPhone archive for annual honours, Hall and Moments",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const called:string[]=[];
 await page.route("**/api/session",route=>route.fulfill({json:{
  worldId:"world",playerId:"owner",csrfToken:"opaque",overview,availablePromotions:[]}}));
 await page.route("**/api/card",route=>{
  const method=String(route.request().postDataJSON().method);
  called.push(method);
  if(method==="industry")return route.fulfill({json:{
   worldName:"PPW",year:2,week:1,phase:"OPEN",nextLockEpoch:Date.now()/1000+6000,
   ownPromotionId:"human",ownPromotionName:"Human Pro",
   promotions:[],headlines:[],broadcasts:[]}});
  if(method==="worldHeritage")return route.fulfill({json:{
   honours:[{year:1,category:"WRESTLER_MEN",subjectId:"hero",
    name:"The Great One",promotionName:null,
    citation:"27 wins in 30 matches · 4.32 average stars",week:null},
    {year:1,category:"PROMOTION",subjectId:"human",
    name:"Human Pro",promotionName:"Human Pro",
    citation:"48 completed shows · 84/100 average crowd",week:null}],
   momentCursor:{year:1,week:52,key:"classic:s1:m1"},
   hall:[{personId:"hero",name:"The Great One",division:"MEN",
    year:1,matches:143,wins:102,bestStars:4.93}],
   moments:[{id:"classic:s1:m1",year:1,week:52,kind:"CLASSIC",
    title:"A world classic for the ages",
    description:"A certified 4.93 star show-stealer.",
    promotionName:"Human Pro",showId:"s1"}]
  }});
  if(method==="worldMomentsOlder")return route.fulfill({json:{
   moments:[{id:"title:s0:m0",year:1,week:40,kind:"TITLE",
    title:"A historic championship change",
    description:"The title changed hands at a completed broadcast.",
    promotionName:"AI Elite",showId:"s0"}],
   momentCursor:null
  }});
  return route.fulfill({json:method==="overview"?overview:{}});
 });
 await page.goto("/#/annual-awards");
 await expect(page.getByRole("heading",{name:"Annual Awards"})).toBeVisible();
 await expect(page.getByRole("heading",{name:"The End-of-Year Honours"})).toBeVisible();
 await expect(page.getByText("MEN'S WRESTLER OF THE YEAR")).toBeVisible();
 await expect(page.getByText("The Great One")).toBeVisible();
 const nav=page.getByRole("navigation",{name:"Promotion navigation"});
 await page.getByRole("button",{name:"Open World menu"}).click();
 await nav.getByRole("button",{name:/Hall of Fame/}).click();
 await expect(page).toHaveURL(/#\/hall-of-fame$/);
 await expect(page.getByRole("heading",{name:"The Hall of Fame"})).toBeVisible();
 await expect(page.getByText("CLASS OF 1")).toBeVisible();
 await expect(page.getByText("143 certified matches",{exact:false})).toBeVisible();
 await page.getByRole("button",{name:"Open World menu"}).click();
 await nav.getByRole("button",{name:/World Moments/}).click();
 await expect(page).toHaveURL(/#\/world-moments$/);
 await expect(page.getByRole("heading",{name:"World Moments"})).toBeVisible();
 await expect(page.getByText("A world classic for the ages")).toBeVisible();
 const bounds=await page.locator(".ppw-heritage-moment").boundingBox();
 expect(bounds).not.toBeNull();
 expect(bounds!.x).toBeGreaterThanOrEqual(0);
 expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(391);
 await page.getByRole("button",{name:"Load older World Moments"}).click();
 await expect(page.getByText("A historic championship change")).toBeVisible();
 await expect(page.getByRole("button",{name:"Load older World Moments"})).toHaveCount(0);
 expect(called.filter(x=>x==="industry")).toHaveLength(3);
 expect(called.filter(x=>x==="worldHeritage")).toHaveLength(3);
 expect(called.filter(x=>x==="worldMomentsOlder")).toHaveLength(1);
});
