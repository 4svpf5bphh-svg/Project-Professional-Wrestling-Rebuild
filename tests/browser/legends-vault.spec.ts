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
 await page.goto("/#/legends");
 await expect(page.getByRole("heading",{name:"Legends Vault",level:1})).toBeVisible();
 await expect(page.getByRole("dialog",{name:"Legend unlocked: Eddie Guerrero"})).toBeVisible();
 await expect(page.getByText("NOW AVAILABLE TO EVERY PROMOTION",{exact:false})).toBeVisible();
 await page.getByRole("button",{name:"Skip reveal"}).click();
 await expect(page.getByRole("dialog")).toHaveCount(0);
 await expect.poll(()=>acknowledged).toBe(true);
 await expect(page.getByRole("heading",{name:"Identity shrouded"})).toBeVisible();
 await expect(page.getByText("2 / 8 · 25%")).toBeVisible();
 await expect(page.locator(".ppw-album-slot")).toHaveCount(0);
 await page.getByRole("button",{name:"Discovered (1)"}).click();
 await expect(page.locator(".ppw-legend-tile:visible")).toHaveCount(1);
 await expect(page.getByRole("button",{name:"Discovered (1)"})).toHaveAttribute("aria-pressed","true");
 await page.getByRole("button",{name:"Locked (2)"}).click();
 await expect(page.locator(".ppw-legend-tile:visible")).toHaveCount(2);
 await page.getByRole("button",{name:"All (3)"}).click();
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
 await page.getByRole("link",{name:"Open My Collection"}).click();
 await expect(page).toHaveURL(/#\/collection$/);
 await expect(page.getByRole("heading",{name:"My Collection"})).toBeVisible();
 await expect(page.locator(".ppw-album-slot")).toHaveCount(3);
 await page.getByRole("navigation",{name:"Card album pages"}).getByRole("button",{name:"Icons"}).click();
 await expect(page.locator(".ppw-album-slot")).toHaveCount(0);
 await page.getByRole("navigation",{name:"Card album pages"}).getByRole("button",{name:"All pages"}).click();
 await expect(page.locator(".ppw-album-slot")).toHaveCount(3);
 expect(called.filter(x=>x==="industry")).toHaveLength(1);
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
   worldYear:2,worldWeek:2,balance:5000,curated:48,entries:[{
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
 await page.goto("/#/collection");
 const cabinet=page.locator(".ppw-legend-collection");
 await expect(cabinet.locator("img.ppw-undertaker-card")).toHaveAttribute("src",card);
 await expect(cabinet.getByRole("progressbar",{name:"Legend card collection progress"}))
  .toHaveAttribute("aria-valuenow","1");
 await expect(cabinet.locator(".ppw-album-slot")).toHaveCount(1);
 await cabinet.getByRole("button",{name:"Collected"}).click();
 await expect(cabinet.getByRole("button",{name:"Collected"})).toHaveAttribute("aria-pressed","true");
 await cabinet.getByRole("button",{name:"View card"}).click();
 const expanded=page.getByRole("dialog",{name:"Collectible card: The Undertaker"});
 await expect(expanded.locator("img.ppw-undertaker-card")).toHaveAttribute("src",card);
 await expect(expanded.locator("a[href*='commons.wikimedia.org']")).toBeVisible();
 await expanded.getByRole("button",{name:"Close card"}).click();
 await expect(page.getByRole("dialog")).toHaveCount(0);
});


test("new Phase 14 Midnight Express card remains the same image in reveal, Vault, paid album and full viewer",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const card="/assets/legends/the-midnight-express-legend-card.webp";
 let seen=false,collected=false,collects=0;
 const persons=["legend:the-midnight-express:0","legend:the-midnight-express:1"];
 await page.route("**/api/session",route=>route.fulfill({json:{
  worldId:"world",playerId:"owner",csrfToken:"opaque",overview,availablePromotions:[]}}));
 await page.route("**/api/card",route=>{
  const method=String(route.request().postDataJSON().method);
  if(method==="industry")return route.fulfill({json:{
   worldName:"PPW",year:3,week:4,phase:"OPEN",nextLockEpoch:Date.now()/1000+6000,
   ownPromotionId:"human",ownPromotionName:"Human Pro",
   promotions:[],headlines:[],broadcasts:[]}});
  if(method==="legendsVault")return route.fulfill({json:{
   worldYear:3,worldWeek:4,balance:5000,curated:129,entries:[{
    id:"the-midnight-express",name:"The Midnight Express",tier:"LEGEND",division:"MEN",
    tradition:"American tag wrestling",visibility:"CLUED",
    clue:"Two wrestlers, one unforgettable team",
    achievement:"Certified outstanding tag wrestling",
    progress:100,exactProgress:30,target:30,unlocked:true,year:3,week:3,
    personIds:persons,revealSeen:seen,collected,
    collectibleReady:true,cardAsset:card,price:1400
   }]}});
  if(method==="legendSeen"){seen=true;return route.fulfill({json:{seen:true}});}
  if(method==="kpAction"){collects++;collected=true;return route.fulfill({json:{ok:true}});}
  return route.fulfill({json:{}});
 });
 await page.goto("/#/industry/legends");
 const reveal=page.getByRole("dialog",{name:"Legend unlocked: The Midnight Express"});
 await expect(reveal).toBeVisible();
 const revealImage=reveal.locator("img.ppw-legend-card-art");
 await expect(revealImage).toHaveAttribute("src",card);
 await expect(revealImage).toHaveJSProperty("naturalWidth",960);
 await expect(revealImage).toHaveJSProperty("naturalHeight",1440);
 await expect(reveal.getByText("NOW AVAILABLE TO EVERY PROMOTION",{exact:false})).toBeVisible();
 await reveal.getByRole("button",{name:"Continue to the Vault"}).click();
 await expect.poll(()=>seen).toBe(true);
 const tile=page.locator('.ppw-legend-tile[data-tier="LEGEND"]');
 await expect(tile.locator("img.ppw-legend-card-art")).toHaveAttribute("src",card);
 await tile.getByRole("button",{name:/Collect card/}).click();
 await expect.poll(()=>collects).toBe(1);
 await page.goto("/#/collection");
 const cabinet=page.locator(".ppw-legend-collection");
 await expect(cabinet.locator("img.ppw-legend-card-art")).toHaveAttribute("src",card);
 await cabinet.getByRole("button",{name:"Collected"}).click();
 await expect(cabinet.getByRole("button",{name:"Collected"})).toHaveAttribute("aria-pressed","true");
 await cabinet.getByRole("button",{name:"View card"}).click();
 const expanded=page.getByRole("dialog",{name:"Collectible card: The Midnight Express"});
 await expect(expanded.locator("img.ppw-legend-card-art")).toHaveAttribute("src",card);
 await expect(expanded.locator("img.ppw-legend-card-art")).toHaveJSProperty("naturalWidth",960);
 await expanded.getByRole("button",{name:"Close card"}).click();
 await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("historically unlocked Trish, Taz and Jerry Lynn show the original collectible artwork without a new unlock",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const items=[
  {id:"trish-stratus",name:"Trish Stratus",tier:"LEGEND",division:"WOMEN",
   card:"/assets/legends/trish-stratus-legend-card.webp",person:"legend:trish-stratus:0",price:1400},
  {id:"taz",name:"Taz",tier:"CULT",division:"MEN",
   card:"/assets/legends/taz-cult-card.webp",person:"legend:taz:0",price:750},
  {id:"jerry-lynn",name:"Jerry Lynn",tier:"CULT",division:"MEN",
   card:"/assets/legends/jerry-lynn-cult-card.webp",person:"legend:jerry-lynn:0",price:750}
 ];
 let collected=false,charged=0,seen=0;
 await page.route("**/api/session",route=>route.fulfill({json:{
  worldId:"world",playerId:"owner",csrfToken:"opaque",overview,availablePromotions:[]}}));
 await page.route("**/api/card",route=>{
  const method=String(route.request().postDataJSON().method);
  if(method==="industry")return route.fulfill({json:{
   worldName:"PPW",year:2,week:1,phase:"OPEN",nextLockEpoch:Date.now()/1000+6000,
   ownPromotionId:"human",ownPromotionName:"Human Pro",
   promotions:[],headlines:[],broadcasts:[]}});
  if(method==="legendsVault")return route.fulfill({json:{
   worldYear:2,worldWeek:1,balance:5000,curated:129,
   entries:items.map(x=>({
    id:x.id,name:x.name,tier:x.tier,division:x.division,
    visibility:"KNOWN",tradition:"Classic wrestling",
    clue:"Previously unlocked",achievement:"Previously certified World milestone",
    progress:100,exactProgress:10,target:10,unlocked:true,
    year:1,week:1,personIds:[x.person],revealSeen:true,
    collected:x.id==="trish-stratus"&&collected,
    collectibleReady:true,cardAsset:x.card,price:x.price
   }))}});
  if(method==="legendSeen"){seen++;return route.fulfill({json:{seen:true}});}
  if(method==="kpAction"){charged++;collected=true;return route.fulfill({json:{ok:true}});}
  return route.fulfill({json:{}});
 });
 await page.goto("/#/industry/legends");
 for(const entry of items){
  const tile=page.locator('.ppw-legend-tile[data-legend-id="'+entry.id+'"]');
  await expect(tile.locator("img.ppw-legend-card-art")).toHaveAttribute("src",entry.card);
  await expect(tile.locator("img.ppw-legend-card-art")).toHaveJSProperty("naturalWidth",960);
  await expect(tile.getByRole("button",{name:/Collect card/})).toBeEnabled();
 }
 await expect(page.getByRole("button",{name:"Card artwork not yet available"})).toHaveCount(0);
 const trish=page.locator('.ppw-legend-tile[data-legend-id="trish-stratus"]');
 await trish.getByRole("button",{name:"Replay the reveal"}).click();
 const reveal=page.getByRole("dialog",{name:"Legend unlocked: Trish Stratus"});
 await expect(reveal.locator("img.ppw-legend-card-art")).toHaveAttribute("src",
  "/assets/legends/trish-stratus-legend-card.webp");
 await reveal.getByRole("button",{name:"Continue to the Vault"}).click();
 // Replaying an already-seen reveal must not create a second acknowledgement.
 expect(seen).toBe(0);
 await trish.getByRole("button",{name:/Collect card/}).click();
 await expect.poll(()=>charged).toBe(1);
 await page.goto("/#/collection");
 const album=page.locator(".ppw-legend-collection");
 await album.getByRole("button",{name:"Collected"}).click();
 await expect(album.locator("img.ppw-legend-card-art")).toHaveAttribute("src",
  "/assets/legends/trish-stratus-legend-card.webp");
 await album.getByRole("button",{name:"View card"}).click();
 const viewer=page.getByRole("dialog",{name:"Collectible card: Trish Stratus"});
 await expect(viewer.locator("img.ppw-legend-card-art")).toHaveJSProperty("naturalHeight",1440);
 await viewer.getByRole("button",{name:"Close card"}).click();
});
