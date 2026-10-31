import {test,expect} from "@playwright/test";
const overview={world:{revision:7,name:"PPW World",year:1,week:15,phase:"OPEN",
 nextLockEpoch:Date.now()/1000+10000,serverEpoch:Date.now()/1000},
 membership:"ACTIVE",promotion:{id:"chaotic",name:"Chaotic Wrestling Alliance",
 tier:"LOCAL",cash:200000,debt:0,lastWeeklyNet:0,financialDistress:"HEALTHY"}};
const session={worldId:"world",playerId:"owner",csrfToken:"secret",overview,
 availablePromotions:[]};
test("320px My Championships can create independent women's and secondary titles without crowning anyone",async({page})=>{
 await page.setViewportSize({width:320,height:744});
 const posted:string[]=[];let revision=7;
 const titles=[
  {promotionId:"chaotic",championshipId:"world",name:"Chaotic World Championship",
   promotionName:"Chaotic Wrestling Alliance",division:"SINGLES",bookingDivision:null,
   titleRole:"PRIMARY",status:"ACTIVE",prestige:50,currentReignId:null,
   holderId:null,holderType:null,holderName:null,defenses:0},
  {promotionId:"chaotic",championshipId:"tag",name:"Chaotic Tag Championship",
   promotionName:"Chaotic Wrestling Alliance",division:"TAG",bookingDivision:null,
   titleRole:"PRIMARY",status:"ACTIVE",prestige:45,currentReignId:null,
   holderId:null,holderType:null,holderName:null,defenses:0}
 ];
 await page.route("**/api/session",r=>r.fulfill({json:session}));
 await page.route("**/api/card",r=>{
  const p=r.request().postDataJSON() as {method:string;kind?:string;
   name?:string;expectedRevision?:number};
  if(p.method==="championships")return r.fulfill({json:{worldName:"PPW World",
   year:1,week:15,worldRevision:revision,canEdit:true,
   viewerPromotionId:"chaotic",titles}});
  if(p.method==="createChampionship"){
   expect(p.expectedRevision).toBe(revision);
   posted.push(String(p.kind));
   const women=p.kind==="WOMEN_SINGLES",id=women?"women":"secondary";
   titles.push({...titles[0]!,championshipId:id,name:String(p.name),
    bookingDivision:women?"WOMEN":"MEN",titleRole:women?"PRIMARY":"SECONDARY"});
   revision++;return r.fulfill({json:{status:"APPLIED",revision}});
  }
  return r.fulfill({json:{}});
 });
 await page.goto("/#/championships");
 await page.getByText("+ Create championship").click();
 await expect(page.getByLabel("Championship type")).toBeVisible();
 await expect(page.getByLabel("New championship name")).toContainText("");
 await page.getByRole("button",{name:"Create vacant title"}).click();
 await expect(page.getByText("Chaotic Wrestling Alliance Intercontinental Championship")).toBeVisible();
 await page.getByText("+ Create championship").click();
 await page.getByLabel("Championship type").selectOption("WOMEN_SINGLES");
 await page.getByRole("button",{name:"Create vacant title"}).click();
 await expect(page.getByText("Chaotic Wrestling Alliance Women's Championship")).toBeVisible();
 expect(posted).toEqual(["SECONDARY_MEN","WOMEN_SINGLES"]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
  .toBeLessThanOrEqual(1);
});
