import {test,expect} from "@playwright/test";
const overview={world:{id:"genesis",name:"Genesis",year:1,week:5,revision:4,
 phase:"OPEN",nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
 membership:"ACTIVE",promotion:{id:"home",name:"Home Wrestling",tier:"LOCAL",
 cash:3000000,debt:0,attention:{plannedShows:0,unpreparedShow:false,
 pendingBackstage:false,expiringTalent:false,pendingContractOffers:false}}};
const session={worldId:"genesis",playerId:"booker",csrfToken:"test",
 overview,availablePromotions:[]};
const people=Array.from({length:5},(_,i)=>({
 personId:"p"+i,name:"Wrestler "+(i+1),division:i===4?"WOMEN":"MEN"
}));
for(const width of [320,390]){
 test("tournament draw and verified bracket are reachable within Championships on "+width+"px iPhone",
 async({page})=>{
  await page.setViewportSize({width,height:844});
  let created=false,submitted:any=null;
  const methods:string[]=[];
  await page.route("**/api/session",r=>r.fulfill({json:session}));
  await page.route("**/api/card",r=>{
   const input=r.request().postDataJSON() as Record<string,unknown>;
   const method=input.method as string;methods.push(method);
   if(method==="createTournament"){
    submitted=input;created=true;
    return r.fulfill({json:{status:"APPLIED",result:{tournamentId:"cup",name:"King's Crown"}}});
   }
   if(method==="tournaments")return r.fulfill({json:{
    year:1,week:5,worldRevision:4,canEdit:true,roster:people,
    vacantTitles:[{championshipId:"vacant",name:"World Heavyweight"}],
    tournaments:created?[{tournamentId:"cup",name:"King's Crown",
     division:"MEN",status:"ACTIVE",championshipId:"vacant",
     championshipName:"World Heavyweight",winnerPersonId:null,winnerName:null,
     bouts:[{boutNo:1,personA:"p0",personB:"p3",nameA:"Wrestler 1",
      nameB:"Wrestler 4",winnerPersonId:null,winnerName:null,
      showId:null,slotId:null,resolvedWeekIndex:null},
      {boutNo:2,personA:"p1",personB:"p2",nameA:"Wrestler 2",
      nameB:"Wrestler 3",winnerPersonId:null,winnerName:null,
      showId:null,slotId:null,resolvedWeekIndex:null},
      {boutNo:3,personA:null,personB:null,nameA:null,nameB:null,
       winnerPersonId:null,winnerName:null,showId:null,slotId:null,
       resolvedWeekIndex:null}]}]:[]
   }});
   return r.fulfill({json:method==="championships"?{
    worldName:"Genesis",year:1,week:5,viewerPromotionId:"home",titles:[]
   }:{}});
  });
  await page.goto("/#/championships");
  await page.getByRole("button",{name:/Tournaments/}).click();
  await expect(page.getByRole("heading",{name:"The Road to the Final"})).toBeVisible();
  await page.getByRole("textbox",{name:"Tournament name"}).fill("King's Crown");
  const seed=page.locator("select[aria-label^='Seed ']");
  for(let i=0;i<4;i++)await seed.nth(i).selectOption("p"+i);
  await page.getByRole("combobox",{name:"Vacant championship prize"}).selectOption("vacant");
  await page.getByRole("button",{name:"Create tournament"}).click();
  await expect(page.getByText("Wrestler 1 vs Wrestler 4")).toBeVisible();
  await expect(page.getByText("Wrestler 2 vs Wrestler 3")).toBeVisible();
  await expect(page.getByText("Awaiting first finalist vs Awaiting second finalist")).toBeVisible();
  expect((submitted as any)?.entrants).toEqual(["p0","p1","p2","p3"]);
  expect(methods.filter(m=>m==="createTournament")).toHaveLength(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
   .toBeLessThanOrEqual(1);
 });
}
