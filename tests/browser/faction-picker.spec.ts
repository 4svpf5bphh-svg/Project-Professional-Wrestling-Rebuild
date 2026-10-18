import {test,expect} from "@playwright/test";
test("iPhone faction selector reuses scouting cards and submits only the selected founders",async({page})=>{
 const methods:string[]=[];let submitted:unknown=null;
 const overview={world:{name:"Genesis",year:1,week:5,revision:4,phase:"OPEN",
  serverEpoch:Date.now()/1000,nextLockEpoch:Date.now()/1000+1800},
  promotion:{id:"aew",name:"AEW",tier:"GLOBAL",cash:5000000,debt:0}};
 const session={worldId:"genesis",playerId:"owner",csrfToken:"test-csrf",overview,
  availablePromotions:[]};
 const roster=Array.from({length:46},(_,i)=>({
  personId:"p-"+i,name:"Performer "+String(i).padStart(3,"0"),
  ringName:"Performer "+String(i).padStart(3,"0"),division:i%3===0?"WOMEN":"MEN",
  stableId:null,popularity:55+i%35,recognition:50+i%40,
  momentum:40+i%50,inRingQuality:63+i%24,matchCraft:65,
  presentation:74,alignment:"FACE",gimmickId:"AUTHENTIC",primaryStyle:"TECHNICAL"
 }));
 await page.route("**/api/session",async route=>route.fulfill({json:session}));
 await page.route("**/api/card",async route=>{
  const input=route.request().postDataJSON();
  methods.push(input.method);
  if(input.method==="createStable"){
   submitted=input;
   return route.fulfill({json:{status:"APPLIED",result:{stableId:"formed"}}});
  }
  return route.fulfill({json:input.method==="stables"?
   {year:1,week:5,worldRevision:4,canEdit:true,stables:[],
    roster,storyFollowThrough:[]}:{}});
 });
 await page.goto("/#/stables");
 await expect(page.getByRole("heading",{name:"Stables"})).toBeVisible();
 const cards=page.locator(".ppw-stable-founder-card");
 await expect(cards).toHaveCount(40);
 await expect(page.getByRole("button",{name:"Form faction"})).toBeDisabled();
 for(let i=0;i<3;i++)await cards.nth(i).click();
 await expect(page.getByRole("button",{name:"Form faction"})).toBeEnabled();
 await expect(page.locator(".ppw-stable-founder-card[aria-pressed=true]")).toHaveCount(3);
 const field=page.getByRole("searchbox",{name:"Search faction founders"});
 await field.fill("Performer 045");
 await expect(cards).toHaveCount(1);
 await expect(page.getByText(/3 of 12 chosen/)).toBeVisible();
 expect(methods).toEqual(["stables"]);
 await page.getByLabel("Faction name").fill("The Revolution");
 await page.getByRole("button",{name:"Form faction"}).click();
 await expect(page.getByText("New faction created")).toBeVisible();
 expect(submitted).toMatchObject({method:"createStable",name:"The Revolution",
  personIds:["p-0","p-1","p-2"]});
 expect((submitted as {playerId?:string}).playerId).toBeUndefined();
 expect(methods.filter(x=>x==="stables")).toHaveLength(2);
 expect(methods).not.toContain("wrestlerProfile");
});
