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

test("bottom Business navigation enters the correct desk and Back restores the premium show",async({page})=>{
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
 await expect(page.locator(".ppw-management-menu")).toHaveCount(0);
 await page.getByRole("button",{name:"Open Business menu"}).click();
 await page.getByRole("navigation",{name:"Promotion navigation"})
  .getByRole("button",{name:/Finances & deals/}).click();
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

test("unfinished show shortcut chooses the required weekly card ahead of a drafted premium",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const shows=[["premium","PREMIUM"],["weekly","REGULAR"]].map(([draftId,bookingClass])=>({
  draftId,bookingClass,year:1,week:5,status:"DRAFT",ready:false,
  eventType:bookingClass==="PREMIUM"?"MAJOR":"REGULAR",
  day:5,marketId:"home",venueId:"arena",marketName:"Home",venueName:"Arena",
  showName:bookingClass==="PREMIUM"?"Premium Event":"Weekly Show",
  ticketStrategy:"STANDARD",slots:0,showSeriesId:null
 }));
 const requested:string[]=[];
 await page.route("**/api/session",route=>route.fulfill({json:session}));
 await page.route("**/api/card",route=>{
  const b=route.request().postDataJSON();
  if(b.method==="planner")return route.fulfill({json:{
   worldName:"Genesis",promotionName:"Independent",year:1,week:5,
   canEdit:true,worldRevision:4,homeMarketId:"home",venues:[],
   weeks:[{year:1,week:5,offset:0,required:true,major:true,
    canEdit:true,scheduled:[],shows}]
  }});
  if(b.method==="load"){
   requested.push(b.showId);
   return route.fulfill({json:{
    showId:b.showId,year:1,week:5,worldRevision:4,canEdit:true,ready:false,
    day:5,venueId:"arena",showName:b.showId==="weekly"?"Weekly Show":"Premium Event",
    promotionName:"Independent",venueName:"Arena",marketName:"Home",
    bookingClass:b.showId==="weekly"?"REGULAR":"PREMIUM",ticketStrategy:"STANDARD",
    championships:[],programmes:[],programmeLinks:[],selectedPeople:[],slots:[]
   }});
  }
  throw new Error("Unexpected request "+b.method);
 });
 await page.goto("/#/planner/card");
 await expect(page).toHaveURL(/#\/card$/);
 await expect(page.getByText("Weekly Show")).toBeVisible();
 expect(requested).toEqual(["weekly"]);
});

// On an installed Home Screen app there are no Safari toolbar controls.
// The one-handed menu and its drawer must remain inside the app viewport.
test("iPhone standalone keeps one five-root drawer reachable from the bottom",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.route("**/api/session",route=>route.fulfill({json:session}));
 await page.route("**/api/card",route=>route.fulfill({json:session.overview}));
 await page.goto("/#/home");
 const menu=page.getByRole("button",{name:"Open World menu"});
 await expect(menu).toBeVisible();
 await expect(page.locator(".ppw-bottom-navigation .ppw-bottom-tab")).toHaveCount(5);
 const buttonBox=await menu.boundingBox();
 expect(buttonBox).not.toBeNull();
 expect(buttonBox!.y+buttonBox!.height).toBeLessThanOrEqual(844);
 expect(buttonBox!.y).toBeGreaterThan(700);
 expect(buttonBox!.width).toBeGreaterThanOrEqual(44);
 await menu.click();
 const drawer=page.getByRole("navigation",{name:"Promotion navigation"});
 await expect(drawer).toBeVisible();
 const drawerBox=await drawer.boundingBox();
 expect(drawerBox).not.toBeNull();
 expect(drawerBox!.y+drawerBox!.height).toBeLessThanOrEqual(buttonBox!.y+3);
 expect(drawerBox!.y+drawerBox!.height).toBeLessThanOrEqual(844);
 expect(drawerBox!.x).toBeGreaterThanOrEqual(0);
 expect(drawerBox!.x+drawerBox!.width).toBeLessThanOrEqual(390);
 await expect(drawer.locator(".ppw-tab")).toHaveCount(0);
 await expect(drawer.locator(".ppw-nav-drawer-entry")).toHaveCount(1);
 await expect(drawer.getByRole("button",{name:/World dashboard/})).toBeVisible();
 await page.getByRole("button",{name:"Open Business menu"}).click();
 await expect(drawer.getByRole("button",{name:/Staff/})).toBeVisible();
 await page.keyboard.press("Escape");
 await expect(drawer).toBeHidden();
});
