import {test,expect} from "@playwright/test";
const overview={world:{revision:4,name:"PPW",year:2,week:1,phase:"OPEN",
 nextLockEpoch:Date.now()/1000+6000,serverEpoch:Date.now()/1000},
 membership:"ACTIVE",promotion:{id:"human",name:"Human Pro",tier:"LOCAL",
 cash:1000000,debt:0,lastWeeklyNet:10,financialDistress:"HEALTHY"}};
test("Legends Vault lazy-loads, honours mystery hints and replays offline unlock without a second nav",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const called:string[]=[];
 let acknowledged=false;
 await page.route("**/api/session",route=>route.fulfill({json:{
  worldId:"world",playerId:"owner",csrfToken:"opaque",overview,availablePromotions:[]}}));
 await page.route("**/api/card",route=>{
  const payload=route.request().postDataJSON();
  const method=String(payload.method);called.push(method);
  if(method==="industry")return route.fulfill({json:{
   worldName:"PPW",year:2,week:1,phase:"OPEN",nextLockEpoch:Date.now()/1000+6000,
   ownPromotionId:"human",ownPromotionName:"Human Pro",
   promotions:[],headlines:[],broadcasts:[]}});
  if(method==="legendsVault")return route.fulfill({json:{worldYear:2,worldWeek:1,curated:48,
   entries:[{id:"jerry-lynn",name:"Jerry Lynn",tier:"CULT",division:"MEN",
    tradition:null,visibility:"KNOWN",clue:"The worker of a lifetime",
    achievement:"Eight classics",progress:25,exactProgress:2,target:8,
    unlocked:false,year:null,week:null,personIds:[],revealSeen:false,collected:false,
    collectibleReady:false,cardAsset:null,price:750},
   {id:"eddie-guerrero",name:"Eddie Guerrero",tier:"LEGEND",division:"MEN",
    tradition:"Mexican-American",visibility:"CLUED",clue:"Lie, cheat, steal",
    achievement:"Twelve dirty finishes",progress:100,exactProgress:12,target:12,
    unlocked:true,year:1,week:51,personIds:["legend:eddie-guerrero:0"],
    revealSeen:acknowledged,collected:false,collectibleReady:false,cardAsset:null,price:1400},
   {id:"undertaker",name:null,tier:"IMMORTAL",division:"MEN",
    tradition:null,visibility:"SECRET",clue:"Under the brightest lights",
    achievement:null,progress:10,exactProgress:null,target:null,
    unlocked:false,year:null,week:null,personIds:[],revealSeen:false,collected:false,
    collectibleReady:false,cardAsset:null,price:4000}]}});
  if(method==="legendSeen"){
   acknowledged=true;return route.fulfill({json:{seen:true}});
  }
  return route.fulfill({json:{}});
 });
 await page.goto("/#/industry");
 await expect(page.getByRole("heading",{name:"Industry"})).toBeVisible();
 expect(called).toEqual(["industry"]);
 await page.getByRole("button",{name:"Legends Vault"}).click();
 await expect(page.getByRole("dialog",{name:"Legend unlocked: Eddie Guerrero"})).toBeVisible();
 await expect(page.getByText("NOW AVAILABLE TO EVERY PROMOTION",{exact:false})).toBeVisible();
 await page.getByRole("button",{name:"Skip reveal"}).click();
 await expect(page.getByRole("dialog")).toHaveCount(0);
 await expect.poll(()=>acknowledged).toBe(true);
 await expect(page.getByRole("heading",{name:"Identity shrouded"})).toBeVisible();
 await expect(page.getByText("2 / 8 · 25%")).toBeVisible();
 await page.getByRole("button",{name:"Replay the reveal"}).click();
 await expect(page.getByRole("dialog")).toBeVisible();
 await page.getByRole("button",{name:"Continue to the Vault"}).click();
 await expect(page.getByRole("button",{name:"Card artwork not yet available"})).toBeDisabled();
 const tile=page.locator(".ppw-legend-tile").first();
 const box=await tile.boundingBox();
 expect(box).not.toBeNull();
 expect(box!.x+box!.width).toBeLessThanOrEqual(391);
 expect(called).toContain("legendsVault");
 expect(called).toContain("legendSeen");
 expect(called).not.toContain("kpAction");
});

test("Undertaker pilot reuses the exact bundled real-photo card in reveal, Vault, paid cabinet and full viewer",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const card="/assets/legends/undertaker-immortal-card.webp";
 let seen=false,collected=false,collects=0;
 await page.route("**/api/session",route=>route.fulfill({json:{
  worldId:"world",playerId:"owner",csrfToken:"opaque",overview,availablePromotions:[]}}));
 await page.route("**/api/card",route=>{
  const method=String(route.request().postDataJSON().method);
  if(method==="industry")return route.fulfill({json:{
   worldName:"PPW",year:2,week:2,phase:"OPEN",nextLockEpoch:Date.now()/1000+6000,
   ownPromotionId:"human",ownPromotionName:"Human Pro",
   promotions:[],headlines:[],broadcasts:[]}});
  if(method==="legendsVault")return route.fulfill({json:{
   worldYear:2,worldWeek:2,curated:48,entries:[{
    id:"undertaker",name:"The Undertaker",tier:"IMMORTAL",division:"MEN",
    tradition:"American sports entertainment",visibility:"SECRET",
    clue:"The dead refuse to stay buried",
    achievement:"Undertaker reveal pilot: completed certified regular weekly show",
    progress:100,exactProgress:15,target:15,unlocked:true,year:2,week:1,
    personIds:["legend:undertaker:0"],revealSeen:seen,
    collected,collectibleReady:true,cardAsset:card,price:4000
   }]}});
  if(method==="legendSeen"){seen=true;return route.fulfill({json:{seen:true}});}
  if(method==="kpAction"){collects++;collected=true;
   return route.fulfill({json:{ok:true}});}
  return route.fulfill({json:{}});
 });
 await page.goto("/#/industry/legends");

 const reveal=page.getByRole("dialog",{name:"Legend unlocked: The Undertaker"});
 await expect(reveal).toBeVisible();
 const visual=reveal.locator("img.ppw-undertaker-card");
 await expect(visual).toHaveAttribute("src",card);
 await expect(visual).toHaveJSProperty("naturalWidth",960);
 await expect(reveal.getByRole("button",{name:"Skip reveal"})).toBeVisible();
 await expect(reveal.getByText("NOW AVAILABLE TO EVERY PROMOTION",{exact:false})).toBeVisible();
 await reveal.getByRole("button",{name:"Continue to the Vault"}).click();
 await expect(reveal).toHaveCount(0);
 await expect.poll(()=>seen).toBe(true);
 const tile=page.locator('.ppw-legend-tile[data-tier="IMMORTAL"]');
 await expect(tile.locator("img.ppw-undertaker-card")).toHaveAttribute("src",card);
 await tile.getByRole("button",{name:/Collect card/}).click();
 await expect.poll(()=>collects).toBe(1);
 const cabinet=page.locator(".ppw-legend-collection");
 await expect(cabinet.locator("img.ppw-undertaker-card")).toHaveAttribute("src",card);
 await cabinet.getByRole("button",{name:"Enlarge card"}).click();
 const expanded=page.getByRole("dialog",{name:"Collectible card: The Undertaker"});
 await expect(expanded.locator("img.ppw-undertaker-card")).toHaveAttribute("src",card);
 await expect(expanded.locator("a[href*='commons.wikimedia.org']")).toBeVisible();
 await expanded.getByRole("button",{name:"Close card"}).click();
 await expect(page.getByRole("dialog")).toHaveCount(0);
});
