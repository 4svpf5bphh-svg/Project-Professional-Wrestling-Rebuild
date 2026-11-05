import {test,expect} from "@playwright/test";
import {LEGENDS_CATALOGUE,LEGEND_TIER_PRICES} from "../../src/domain/legends-catalogue.js";

// Authenticated running-game captures, with only World unlock receipts mocked.
// Names, tiers, milestone descriptions and 960x1440 art come from PPW itself.
const ids=["jerry-lynn","trish-stratus","sting","undertaker"] as const;
const overview={world:{revision:4,name:"PPW",year:2,week:1,phase:"OPEN",
 nextLockEpoch:Date.now()/1000+6000,serverEpoch:Date.now()/1000},
 membership:"ACTIVE",promotion:{id:"human",name:"Human Pro",tier:"LOCAL",
 cash:1000000,debt:0,lastWeeklyNet:10,financialDistress:"HEALTHY"}};
test.use({video:"on"});
for(const id of ids){
 const item=LEGENDS_CATALOGUE.find(x=>x.id===id)!;
 for(const width of [320,390]){
  test("Phase 32 "+item.tier+" real-card reveal at "+width+"px",async({page},info)=>{
   test.setTimeout(45_000);
   const art=item.cardAsset!;
   expect(art).toMatch(/^\/assets\/legends\/.+-card\.webp$/);
   await page.setViewportSize({width,height:width===320?568:844});
   let seen=false,collected=false,seenWrites=0,kpWrites=0;
   const methods:string[]=[];
   await page.route("**/api/session",route=>route.fulfill({json:{
    worldId:"review-world",playerId:"owner",csrfToken:"opaque",overview,
    availablePromotions:[]}}));
   await page.route("**/api/card",route=>{
    const method=String(route.request().postDataJSON().method);
    methods.push(method);
    if(method==="industry")return route.fulfill({json:{
     worldName:"PPW",year:2,week:1,phase:"OPEN",nextLockEpoch:Date.now()/1000+6000,
     ownPromotionId:"human",ownPromotionName:"Human Pro",
     promotions:[],headlines:[],broadcasts:[]}});
    if(method==="legendsVault")return route.fulfill({json:{
     worldYear:2,worldWeek:1,balance:9000,curated:LEGENDS_CATALOGUE.length,
     entries:[{id:item.id,name:item.name,tier:item.tier,division:item.division,
      tradition:item.tradition,visibility:item.visibility,clue:item.clue,
      achievement:item.achievement,progress:100,exactProgress:item.target??0,
      target:item.target??0,unlocked:true,year:2,week:1,
      personIds:["legend:"+item.id+":0"],revealSeen:seen,collected,
      collectibleReady:true,cardAsset:art,price:LEGEND_TIER_PRICES[item.tier]}]}}); 
    if(method==="legendSeen"){seenWrites++;seen=true;return route.fulfill({json:{seen:true}});}
    if(method==="kpAction"){kpWrites++;collected=true;return route.fulfill({json:{ok:true}});}
    return route.fulfill({json:{}});
   });
   await page.goto("/#/industry/legends");
   const reveal=page.getByRole("dialog",{name:"Legend unlocked: "+item.name});
   await expect(reveal).toBeVisible();
   await expect(reveal).toHaveAttribute("data-tier",item.tier);
   await expect(reveal).toHaveAttribute("data-motion","full");
   await expect(reveal.locator(".ppw-ceremony-set")).toHaveCount(1);
   const img=reveal.locator("img.ppw-legend-card-art");
   await expect(img).toHaveAttribute("src",art);
   await expect(img).toHaveJSProperty("naturalWidth",960);
   await expect(img).toHaveJSProperty("naturalHeight",1440);
   await expect(reveal.getByRole("button",{name:"Skip reveal"})).toBeVisible();
   // Playwright records the live, actual CSS transition to a WebM artifact.
   await expect(reveal).toHaveAttribute("data-sequence","FINALE",{timeout:8000});
   await expect(reveal.getByText(/NOW AVAILABLE TO EVERY PROMOTION/)).toBeVisible();
   const sizing=await reveal.evaluate(node=>({scroll:node.scrollWidth,client:node.clientWidth,
    cardRight:node.querySelector("img")?.getBoundingClientRect().right??0}));
   expect(sizing.scroll,"Horizontal reveal overflow").toBeLessThanOrEqual(sizing.client+1);
   expect(sizing.cardRight,"Card clipped by phone").toBeLessThanOrEqual(width+1);
   await page.screenshot({path:info.outputPath("phase32-"+item.tier.toLowerCase()+"-"+width+"-reveal.png")});
   await reveal.getByRole("button",{name:"Continue to the Vault"}).click();
   await expect(reveal).toHaveCount(0);
   await expect.poll(()=>seenWrites).toBe(1);
   const tile=page.locator('.ppw-legend-tile[data-legend-id="'+item.id+'"]');
   await tile.getByRole("button",{name:"Replay the reveal"}).click();
   const again=page.getByRole("dialog",{name:"Legend unlocked: "+item.name});
   await expect(again).toBeVisible();
   await again.getByRole("button",{name:"Skip reveal"}).click();
   await expect(again).toHaveCount(0);
   expect(seenWrites,"Replay never re-acknowledges an unlock").toBe(1);
   await tile.getByRole("button",{name:/Collect card/}).click();
   await expect.poll(()=>kpWrites).toBe(1);
   await page.goto("/#/collection");
   const album=page.locator(".ppw-legend-collection");
   await album.getByRole("button",{name:"Collected"}).click();
   await expect(album.locator("img.ppw-legend-card-art")).toHaveAttribute("src",art);
   await page.screenshot({path:info.outputPath("phase32-"+item.tier.toLowerCase()+"-"+width+"-album.png")});
   await album.getByRole("button",{name:"View card"}).click();
   const viewer=page.getByRole("dialog",{name:"Collectible card: "+item.name});
   await expect(viewer.locator("img.ppw-legend-card-art")).toHaveJSProperty("naturalWidth",960);
   await viewer.getByRole("button",{name:"Close card"}).click();
   await page.emulateMedia({reducedMotion:"reduce"});
   await page.goto("/#/industry/legends");
   await expect(page.getByRole("dialog")).toHaveCount(0);
   await page.locator('.ppw-legend-tile[data-legend-id="'+item.id+'"]')
    .getByRole("button",{name:"Replay the reveal"}).click();
   const reduced=page.getByRole("dialog",{name:"Legend unlocked: "+item.name});
   await expect(reduced).toHaveAttribute("data-motion","reduced");
   await expect(reduced).toHaveAttribute("data-sequence","FINALE");
   await expect(reduced.locator("img.ppw-legend-card-art")).toHaveJSProperty("naturalWidth",960);
   await page.screenshot({path:info.outputPath("phase32-"+item.tier.toLowerCase()+"-"+width+"-reduced.png")});
   await reduced.getByRole("button",{name:"Skip reveal"}).click();
   await expect(reduced).toHaveCount(0);
   expect(seenWrites).toBe(1);
   expect(kpWrites).toBe(1);
   expect(methods).not.toContain("signLegend");
  });
 }
}
