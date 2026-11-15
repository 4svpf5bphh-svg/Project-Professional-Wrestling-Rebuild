import {test,expect} from "@playwright/test";
const overview={world:{id:"genesis",name:"Genesis",year:1,week:5,revision:4,
 phase:"OPEN",nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
 membership:"ACTIVE",promotion:{id:"home",name:"Home Wrestling",tier:"LOCAL",
 cash:3000000,debt:0,attention:{plannedShows:0,unpreparedShow:false,
 pendingBackstage:false,expiringTalent:false,pendingContractOffers:false}}};
const session={worldId:"genesis",playerId:"booker",csrfToken:"test",
 overview,availablePromotions:[]};
const title=(promotionId:string,name:string)=>({
 promotionId,championshipId:name,promotionName:promotionId==="home"?"Home Wrestling":"Rival",
 name,division:"SINGLES",status:"ACTIVE",prestige:80,currentReignId:null,
 holderId:null,holderType:null,holderName:null,defenses:0});
for(const width of [320,390]){
 test(`My Champions ${width}px: own belts only, World view still available without second read`,async({page})=>{
  await page.setViewportSize({width,height:844});
  const methods:string[]=[];
  await page.route("**/api/session",r=>r.fulfill({json:session}));
  await page.route("**/api/card",r=>{
   const method=r.request().postDataJSON().method as string;
   methods.push(method);
   return r.fulfill({json:method==="wrestlerDirectory"?{
    year:1,week:5,currentWeekIndex:4,worldRevision:4,canEdit:true,
    people:[],hasMore:false
   }:method==="championships"?{
    worldName:"Genesis",year:1,week:5,viewerPromotionId:"home",
    titles:[title("home","Home Heavyweight"),title("rival","Rival World")]
   }:{}});
  });
  await page.goto("/#/roster");
  const chips=page.getByRole("group",{name:"Quick roster filters · this page"});
  await expect(page.getByRole("navigation",{name:"Roster divisions"})).toHaveCount(0);
  await expect(chips.getByRole("button",{name:"Champions",exact:true})).toHaveCount(1);
  await expect(chips.getByRole("button",{name:"My Champions",exact:true})).toHaveCount(0);
  // Titles remain reachable via the existing Promotion championship route,
  // without restoring a duplicate button above or inside roster slicers.
  await page.goto("/#/championships");
  // Direct Promotion navigation starts in World scope. Switch using the
  // existing championship controls rather than duplicating roster shortcuts.
  await page.getByRole("button",{name:"My Champions",exact:true}).click();
  await expect(page.getByRole("heading",{name:"My Champions"})).toBeVisible();
  await expect(page.locator(".ppw-belt-card:visible")).toHaveCount(1);
  await expect(page.locator(".ppw-belt-card:visible")).toContainText("Home Heavyweight");
  await page.getByRole("button",{name:"World Championships"}).click();
  await expect(page.locator(".ppw-belt-card:visible")).toHaveCount(2);
  expect(methods.filter(x=>x==="championships").length).toBe(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
   .toBeLessThanOrEqual(1);
 });
}

for(const width of [320,390]){
 test(`Earned champions' contenders are readable and private at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:780});
  const methods:string[]=[];
  await page.route("**/api/session",r=>r.fulfill({json:session}));
  await page.route("**/api/card",r=>{
   const method=r.request().postDataJSON().method as string;
   methods.push(method);
   if(method!=="championships")return r.fulfill({json:{}});
   return r.fulfill({json:{
    worldName:"Genesis",year:1,week:21,viewerPromotionId:"home",canEdit:false,
    worldRevision:10,
    titles:[{...title("home","Men's Championship"),
      championshipId:"men",bookingDivision:"MEN",holderId:"champ",
      holderName:"Reigning Champion",currentReignId:"r1"},
     {...title("rival","World Championship"),
      championshipId:"rival",bookingDivision:"MEN"}],
    contenders:{men:[
     {id:"worker",name:"Rising Contender",format:"SINGLES",division:"MEN",
      rank:1,score:18.5,wins:3,losses:0,lastResultWeek:20,
      titleMatches:1,momentum:64,popularity:52},
     {id:"veteran",name:"Veteran Challenger",format:"SINGLES",division:"MEN",
      rank:2,score:5.2,wins:1,losses:2,lastResultWeek:19,
      titleMatches:0,momentum:70,popularity:82}]
    }
   }});
  });
  await page.goto("/#/championships");
  const own=page.locator(".ppw-belt-card").first();
  await own.locator("summary").click();
  await expect(own.getByRole("heading",{name:"Title contenders"})).toBeVisible();
  await expect(own.locator(".ppw-belt-contender")).toHaveCount(2);
  await expect(own.locator(".ppw-belt-contender").first()).toContainText(
   "#1");
  await expect(own.locator(".ppw-belt-contender").first()).toContainText(
   "Rising Contender");
  await expect(own.locator(".ppw-belt-contender").first()).toContainText(
   "3W · 0L");
  // Verify the champion isn't accidentally included in the contender list.
  await expect(own.locator(".ppw-belt-contender").filter({hasText:"Reigning Champion"})).toHaveCount(0);
  await page.getByRole("button",{name:"World Championships"}).click();
  const rival=page.locator(".ppw-belt-card:visible").nth(1);
  await rival.locator("summary").click();
  await expect(rival.locator(".ppw-belt-contender-board")).toHaveCount(0);
  expect(methods.filter(m=>m==="championships")).toHaveLength(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
   .toBeLessThanOrEqual(1);
 });
}

for(const width of [320,390]){
 test(`Earned title challenger chooses a real future show and gets an unsaved champion match at ${width}px`,
 async({page})=>{
  await page.setViewportSize({width,height:780});
  const calls:string[]=[];
  const planner={worldName:"Genesis",promotionName:"Home Wrestling",
   year:1,week:5,worldRevision:4,canEdit:true,homeMarketId:"home",
   venues:[],weeks:[{year:1,week:5,offset:0,required:true,major:false,
    canEdit:true,scheduled:[],shows:[{draftId:"actual-show",year:1,week:5,
     status:"DRAFT",eventType:"REGULAR",day:5,marketId:"home",venueId:"arena",
     marketName:"Home",venueName:"Arena",ticketStrategy:"STANDARD",
     ready:false,slots:0,bookingClass:"REGULAR",showSeriesId:null,
     showName:"Ascension"}]}]};
  const card={showId:"actual-show",year:1,week:5,worldRevision:4,
   canEdit:true,ready:false,day:5,venueId:"arena",showName:"Ascension",
   promotionName:"Home Wrestling",venueName:"Arena",marketName:"Home",
   bookingClass:"REGULAR",ticketStrategy:"STANDARD",
   championships:[{championshipId:"men",name:"Men's World Title",
    division:"SINGLES",bookingDivision:"MEN",holderId:"champ",holderName:"Champion",
    vacant:false}],programmes:[],programmeLinks:[],selectedPeople:[],slots:[]};
  await page.route("**/api/session",r=>r.fulfill({json:session}));
  await page.route("**/api/card",r=>{
   const input=r.request().postDataJSON() as {method:string;search?:string};
   calls.push(input.method);
   if(input.method==="championships")return r.fulfill({json:{
    worldName:"Genesis",year:1,week:5,viewerPromotionId:"home",
    canEdit:true,worldRevision:4,
    titles:[{...title("home","Men's World Title"),championshipId:"men",
     bookingDivision:"MEN",holderId:"champ",holderName:"Champion",
     currentReignId:"r1"}],
    contenders:{men:[{id:"worker",name:"Earned Challenger",
     format:"SINGLES",division:"MEN",rank:1,score:18,wins:3,losses:0,
     lastResultWeek:4,titleMatches:0,momentum:70,popularity:45}]}
   }});
   if(input.method==="planner")return r.fulfill({json:planner});
   if(input.method==="load")return r.fulfill({json:card});
   if(input.method==="talent"){
    const person=input.search==="Champion"?{personId:"champ",name:"Champion"}:
     {personId:"worker",name:"Earned Challenger"};
    return r.fulfill({json:{talent:[{...person,contractId:"deal-"+person.personId,
     available:true,division:"MEN",popularity:70,momentum:70,
     recognition:70,stamina:70,fatigue:0}],cursor:null}});
   }
   return r.fulfill({json:{}});
  });
  await page.goto("/#/championships");
  const belt=page.locator(".ppw-belt-card").first();
  await belt.locator("summary").click();
  await belt.getByRole("button",{name:"Plan title challenge"}).click();
  // Planner automatically opens the real draft when there is only one.
  // Both the transient Planner and the final exact-card route are valid.
  await expect(page).toHaveURL(/#\/(?:card|planner(?:\/card)?)/);
  await expect(page.getByRole("heading",{name:"The Card"})).toBeVisible();
  expect(calls).toContain("planner");
  await expect.poll(()=>calls.includes("load")).toBe(true);
  await expect(page.getByText("Champion vs Earned Challenger")).toBeVisible();
  await page.getByRole("button",{name:"Start title match"}).click();
  await expect(page.getByRole("dialog",{name:/Edit match/})).toBeVisible();
  await expect(page.getByRole("dialog",{name:/Edit match/}))
   .toContainText("Champion");
  await expect(page.getByRole("dialog",{name:/Edit match/}))
   .toContainText("Earned Challenger");
  expect(calls.filter(x=>x==="talent")).toHaveLength(2);
  expect(calls).not.toContain("save");
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
   .toBeLessThanOrEqual(1);
 });
}
