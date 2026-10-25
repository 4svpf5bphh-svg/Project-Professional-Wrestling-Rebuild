import {test,expect} from "@playwright/test";
const overview={world:{name:"Genesis",revision:4,year:1,week:5,phase:"OPEN",
 nextLockEpoch:Date.now()/1000+3600,serverEpoch:Date.now()/1000},
 membership:"ACTIVE",promotion:{id:"home",name:"Home Wrestling",tier:"LOCAL",
 cash:100000,debt:0}};
const session={worldId:"genesis",playerId:"booker",csrfToken:"test",overview,availablePromotions:[]};
const wrestlers=[
 {personId:"alpha",name:"Alpha",division:"MEN",popularity:65,recognition:65,momentum:65,
  inRingQuality:70,matchCraft:70,presentation:70},
 {personId:"beta",name:"Beta",division:"MEN",popularity:65,recognition:65,momentum:65,
  inRingQuality:70,matchCraft:70,presentation:70}
];
for(const width of [320,390]){
 test(`iPhone ${width}px: visible Form team creates a pair and survives roster refresh`,async({page})=>{
  await page.setViewportSize({width,height:844});
  let revision=4,created=false,commands=0;
  await page.route("**/api/session",route=>route.fulfill({json:session}));
  await page.route("**/api/card",route=>{
   const req=route.request().postDataJSON() as {method:string;name?:string;
    personIds?:string[];expectedRevision?:number;requestId?:string};
   if(req.method==="createTagTeam"){
    expect(req.name).toBe("The Lightning Express");
    expect(req.personIds).toEqual(["alpha","beta"]);
    expect(req.expectedRevision).toBe(4);
    expect(req.requestId).toBeTruthy();
    commands++;created=true;revision=5;
    return route.fulfill({json:{status:"APPLIED",revision:5}});
   }
   if(req.method==="tagTeams")
    return route.fulfill({json:{year:1,week:5,worldRevision:revision,canEdit:true,
     roster:wrestlers,teams:created?[{
      teamId:"express",name:"The Lightning Express",
      members:[{personId:"alpha",name:"Alpha"},{personId:"beta",name:"Beta"}],
      experience:"NEW",matchesTogether:0,currentTitles:[],familiarity:0,
      formedWeekIndex:4,totalTitleReigns:0,totalTitleDefenses:0,canRename:true
     }]:[]}});
   return route.fulfill({json:{}});
  });
  await page.goto("/#/teams");
  const submit=page.getByRole("button",{name:/Form this team/});
  await expect(submit).toBeDisabled();
  await page.getByRole("textbox",{name:"New tag team name"}).fill("The Lightning Express");
  await page.locator(".ppw-pair-picks .ppw-wrestler-card").first().click();
  await page.locator(".ppw-pair-picks .ppw-wrestler-card").nth(1).click();
  await expect(page.getByText("Partners selected. Name the team to make it official.")).toBeVisible();
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.getByText("The team is official.")).toBeVisible();
  await expect(page.locator(".ppw-pair-list")).toContainText("The Lightning Express");
  expect(commands).toBe(1);
  await page.reload();
  await expect(page.locator(".ppw-pair-list")).toContainText("The Lightning Express");
  expect(commands).toBe(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
   .toBeLessThanOrEqual(1);
 });
}
