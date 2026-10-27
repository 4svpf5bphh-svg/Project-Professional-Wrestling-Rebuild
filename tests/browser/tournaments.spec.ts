import {test,expect} from "@playwright/test";
const overview={world:{id:"genesis",name:"Genesis",year:1,week:5,revision:4,
 phase:"OPEN",nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
 membership:"ACTIVE",promotion:{id:"home",name:"Home Wrestling",tier:"LOCAL",
 cash:3000000,debt:0,attention:{plannedShows:0,unpreparedShow:false,
 pendingBackstage:false,expiringTalent:false,pendingContractOffers:false}}};
const session={worldId:"genesis",playerId:"booker",csrfToken:"test",
 overview,availablePromotions:[]};
const people=Array.from({length:9},(_,i)=>({
 personId:"p"+i,name:"Wrestler "+(i+1),division:i===8?"WOMEN":"MEN"
}));
for(const width of [320,390])for(const size of [4,8] as const){
 test(`tournament ${size}-person draw stays bookable inside Championships at ${width}px`,
 async({page})=>{
  await page.setViewportSize({width,height:844});
  let created=false,submitted:Record<string,unknown>|null=null;
  const methods:string[]=[];
  const pairings=size===4?[[0,3],[1,2]]:
   [[0,7],[3,4],[1,6],[2,5]];
  const bouts=Array.from({length:size-1},(_,i)=>{
   const pair=pairings[i];
   return {boutNo:i+1,personA:pair?"p"+pair[0]:null,
    personB:pair?"p"+pair[1]:null,
    nameA:pair?"Wrestler "+(pair[0]+1):null,
    nameB:pair?"Wrestler "+(pair[1]+1):null,
    winnerPersonId:null,winnerName:null,
    showId:null,slotId:null,resolvedWeekIndex:null};
  });
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
     division:"MEN",status:"ACTIVE",entrantsCount:size,championshipId:"vacant",
     championshipName:"World Heavyweight",winnerPersonId:null,winnerName:null,
     bouts}]:[]
   }});
   return r.fulfill({json:method==="championships"?{
    worldName:"Genesis",year:1,week:5,viewerPromotionId:"home",titles:[]
   }:{}});
  });
  await page.goto("/#/championships");
  await page.getByRole("button",{name:/Tournaments/}).click();
  await expect(page.getByRole("heading",{name:"The Road to the Final"})).toBeVisible();
  await page.getByRole("textbox",{name:"Tournament name"}).fill("King's Crown");
  await page.getByRole("combobox",{name:"Draw size"}).selectOption(String(size));
  const seeds=page.locator("select[aria-label^='Seed ']");
  await expect(seeds).toHaveCount(size);
  for(let i=0;i<size;i++)await seeds.nth(i).selectOption("p"+i);
  await page.getByRole("combobox",{name:"Vacant championship prize"}).selectOption("vacant");
  await page.getByRole("button",{name:"Create tournament"}).click();
  await expect(page.getByText("Wrestler 1 vs Wrestler "+size)).toBeVisible();
  await expect(page.getByText("Wrestler "+(size===4?2:4)+" vs Wrestler "+(size===4?3:5))).toBeVisible();
  await expect(page.locator(".ppw-tournament-bout")).toHaveCount(size-1);
  await expect(page.getByText("Awaiting first finalist vs Awaiting second finalist")).toBeVisible();
  expect((submitted as Record<string,unknown>|null)?.entrants).toEqual(Array.from({length:size},(_,i)=>"p"+i));
  expect(methods.filter(m=>m==="createTournament")).toHaveLength(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
   .toBeLessThanOrEqual(1);
 });
}

for(const width of [320,390]){
 test(`verified cup heritage, historical bracket and repeat edition stay legible at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:844});
  let posted:Record<string,unknown>|null=null;
  const tournament={tournamentId:"past-year-3",name:"King's Crown",
   division:"MEN",status:"COMPLETE",entrantsCount:8,championshipId:null,
   championshipName:null,winnerPersonId:"p1",winnerName:"Wrestler 2",
   createdWeekIndex:109,finalResolvedWeekIndex:111,finalRatingStars:4.25,
   bouts:Array.from({length:7},(_,i)=>({boutNo:i+1,
    personA:i===6?"p1":null,personB:i===6?"p2":null,
    nameA:i===6?"Wrestler 2":null,nameB:i===6?"Wrestler 3":null,
    winnerPersonId:i===6?"p1":null,winnerName:i===6?"Wrestler 2":null,
    showId:"show",slotId:"slot",resolvedWeekIndex:i===6?111:null}))};
  const heritage=[{key:"MEN:king's crown",name:"King's Crown",division:"MEN",
   completedEditions:3,seasons:3,firstSeason:1,lastSeason:3,
   latestChampion:{personId:"p1",name:"Wrestler 2"},
   latestCompletedTournamentId:"past-year-3",latestEntrantsCount:8,
   lastFinalRatingStars:4.25,averageFinalRatingStars:3.75,mostWins:2,
   leaders:[{personId:"p1",name:"Wrestler 2",wins:2},
    {personId:"p4",name:"Wrestler 5",wins:1}],legacy:"ANNUAL FIXTURE"}];
  await page.route("**/api/session",r=>r.fulfill({json:session}));
  await page.route("**/api/card",r=>{
   const input=r.request().postDataJSON() as Record<string,unknown>;
   if(input.method==="createTournament"){
    posted=input;
    return r.fulfill({json:{status:"APPLIED",result:{
     tournamentId:"new",name:"King's Crown"}}});
   }
   if(input.method==="tournaments")return r.fulfill({json:{
    year:4,week:10,worldRevision:4,canEdit:true,
    historyTruncated:false,heritage,roster:people,
    vacantTitles:[],tournaments:[tournament]
   }});
   return r.fulfill({json:input.method==="championships"?{
    worldName:"Genesis",year:4,week:10,viewerPromotionId:"home",titles:[]}:{}});
  });
  await page.goto("/#/championships");
  await page.getByRole("button",{name:/Tournaments/}).click();
  await expect(page.getByRole("heading",{name:"The Tournament Record Book"})).toBeVisible();
  await expect(page.getByText("ANNUAL FIXTURE")).toBeVisible();
  await expect(page.getByText("3 completed editions")).toBeVisible();
  await expect(page.getByText("Defending tournament winner: Wrestler 2")).toBeVisible();
  await expect(page.getByText(/Record winners: Wrestler 2 \(2 wins\)/)).toBeVisible();
  await expect(page.getByText("Last final: 4.25 ★ (verified match rating)")).toBeVisible();
  const historical=page.locator(".ppw-tournament-archived-rounds");
  await expect(historical).toHaveCount(1);
  await expect(historical.getByText("Wrestler 2 vs Wrestler 3")).toBeHidden();
  await historical.locator("summary").click();
  await expect(historical.getByText("Wrestler 2 vs Wrestler 3")).toBeVisible();
  await page.getByRole("button",{name:"Plan another edition"}).click();
  await expect(page.getByRole("textbox",{name:"Tournament name"})).toHaveValue("King's Crown");
  await expect(page.getByRole("combobox",{name:"Draw size"})).toHaveValue("8");
  await expect(page.locator("select[aria-label='Seed 1']")).toHaveValue("p1");
  await expect(page.getByText(/Returning winner selected as Seed 1/)).toBeVisible();
  const seedOptions=["p1","p0","p2","p3","p4","p5","p6","p7"];
  for(let i=1;i<8;i++)await page.locator(`select[aria-label='Seed ${i+1}']`)
   .selectOption(seedOptions[i]!);
  await page.getByRole("button",{name:"Create tournament"}).click();
  await expect.poll(()=>posted).not.toBeNull();
  expect((posted as Record<string,unknown>|null)?.entrants).toEqual(seedOptions);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
   .toBeLessThanOrEqual(1);
 });
}
