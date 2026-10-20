import {test,expect} from "@playwright/test";

const world={revision:4,name:"Genesis",year:1,week:5,phase:"OPEN",
 nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000};
const promotion={id:"independent",name:"Independent",tier:"LOCAL",
 cash:1000000,debt:0,lastWeeklyNet:null,financialDistress:"HEALTHY"};
const session={worldId:"genesis",playerId:"owner",csrfToken:"csrf",
 overview:{world,membership:"ACTIVE",promotion},availablePromotions:[]};

test("World status confirmation updates the promotion banner without a duplicate session read",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 let reads=0,sessionReads=0;
 await page.route("**/api/session",route=>{
  sessionReads++;
  return route.fulfill({json:session});
 });
 await page.route("**/api/card",route=>{
  const method=route.request().postDataJSON().method;
  if(method!=="overview")throw new Error("Unexpected Home request "+method);
  reads++;
  const changed=reads===1?{...world,revision:5,phase:"LOCKED"}:
   {...world,revision:6,phase:"OPEN",week:6};
  return route.fulfill({json:{...session.overview,world:changed}});
 });
 await page.goto("/#/home");
 await expect(page.getByText("● CARDS LOCKED")).toBeVisible();
 await expect(page.locator(".ppw-shell-brand small")).toContainText("Y1 W5");
 await page.getByRole("button",{name:"Check World status"}).click();
 await expect(page.getByRole("heading",{name:"The World has moved on"})).toBeVisible();
 await expect(page.locator(".ppw-shell-brand small")).toContainText("Y1 W6");
 expect(reads).toBe(2);
 expect(sessionReads).toBe(1);
});

test("card management links enter the correct shell desk and Back restores the premium show",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const shows=[{draftId:"weekly",showName:"Weekly Show",bookingClass:"REGULAR"},
  {draftId:"premium",showName:"The Big Event",bookingClass:"PREMIUM"}]
  .map(s=>({...s,year:1,week:5,status:"DRAFT",
   eventType:s.bookingClass==="PREMIUM"?"MAJOR":"REGULAR",
   day:5,marketId:"home",venueId:"arena",marketName:"Home",venueName:"Arena",
   ticketStrategy:"STANDARD",ready:false,slots:0,showSeriesId:null}));
 const planner={worldName:"Genesis",promotionName:"Independent",year:1,week:5,
  canEdit:true,worldRevision:4,homeMarketId:"home",venues:[],
  weeks:[{year:1,week:5,offset:0,required:true,major:true,canEdit:true,
   scheduled:[],shows}]};
 const loaded:string[]=[];
 await page.route("**/api/session",route=>route.fulfill({json:session}));
 await page.route("**/api/card",route=>{
  const b=route.request().postDataJSON();
  if(b.method==="planner")return route.fulfill({json:planner});
  if(b.method==="load"){
   loaded.push(b.showId);
   return route.fulfill({json:{
    showId:b.showId,year:1,week:5,canEdit:true,ready:false,worldRevision:4,
    day:5,venueId:"arena",showName:b.showId==="premium"?"The Big Event":"Weekly Show",
    promotionName:"Independent",venueName:"Arena",marketName:"Home",
    bookingClass:b.showId==="premium"?"PREMIUM":"REGULAR",ticketStrategy:"STANDARD",
    championships:[],programmes:[],programmeLinks:[],selectedPeople:[],slots:[]
   }});
  }
  if(b.method==="business")return route.fulfill({json:{}});
  throw new Error("Unexpected request "+b.method);
 });
 await page.goto("/#/planner");
 await page.getByRole("button",{name:"Edit card"}).nth(1).click();
 await expect(page).toHaveURL(/#\/card$/);
 await expect(page.getByText("The Big Event")).toBeVisible();
 await page.locator(".ppw-management-menu summary").click();
 await page.locator(".ppw-management-menu").getByRole("button",{name:"Business",exact:true}).click();
 await expect(page).toHaveURL(/#\/business$/);
 await expect(page.locator("html")).toHaveAttribute("data-ppw-screen","business");
 await page.goBack();
 await expect(page).toHaveURL(/#\/card$/);
 await expect(page.getByText("The Big Event")).toBeVisible();
 expect(loaded).toEqual(["premium","premium"]);
 expect(page.url()).not.toContain("premium");
});

test("old session replies cannot restore a previous manager over the new player's mobile shell",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 let started!:()=>void,release!:()=>void;
 const firstStarted=new Promise<void>(resolve=>{started=resolve;});
 const hold=new Promise<void>(resolve=>{release=resolve;});
 let reads=0;
 await page.route("**/api/session",async route=>{
  reads++;
  if(reads===1){
   started();
   await hold;
   return route.fulfill({json:{...session,playerId:"previous",
    overview:{...session.overview,promotion:{...promotion,name:"Previous Owner"}}}});
  }
  return route.fulfill({json:{...session,playerId:"current",
   overview:{...session.overview,promotion:{...promotion,name:"Current Owner"}}}});
 });
 await page.route("**/api/card",route=>route.fulfill({json:{
  ...session.overview,promotion:{...promotion,name:"Current Owner"}
 }}));
 await page.goto("/#/home");
 await firstStarted;
 await page.evaluate(()=>window.dispatchEvent(new Event("ppw:session-lost")));
 await expect(page.locator(".ppw-shell-brand strong")).toHaveText("Current Owner");
 release();
 await expect(page.locator(".ppw-shell-brand strong")).toHaveText("Current Owner");
 await expect(page.getByRole("heading",{name:"Your World"})).toBeVisible();
 expect(reads).toBe(2);
});
