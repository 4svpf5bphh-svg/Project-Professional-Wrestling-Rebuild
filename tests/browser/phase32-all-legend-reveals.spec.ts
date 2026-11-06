import {test,expect} from "@playwright/test";
import {LEGENDS_CATALOGUE,LEGEND_TIER_PRICES,type LegendTier} from "../../src/domain/legends-catalogue.js";

/** Owner-approved four tier presentations must work across ALL unlocked
 * source-backed cards, including team cards and the 81-card expansion.
 * Real Vite PWA + actual card images/CSS; only World unlock receipts mocked.
 * Use reduced motion for the exhaustive sweep; the separate Phase 32 four-card
 * browser suite records and verifies full animations at both phone widths. */
test.use({video:"off"});
const tiers=["CULT","LEGEND","ICON","IMMORTAL"] as const;
const taglines:Record<LegendTier,string>={
 CULT:"The Underground Never Forgets",
 LEGEND:"A Name Etched in History",
 ICON:"Born for the Spotlight",
 IMMORTAL:"A Legacy That Echoes Forever"
};
const overview={world:{revision:4,name:"PPW",year:2,week:1,phase:"OPEN",
 nextLockEpoch:Date.now()/1000+6000,serverEpoch:Date.now()/1000},
 membership:"ACTIVE",promotion:{id:"human",name:"Human Pro",tier:"LOCAL",
 cash:1000000,debt:0,lastWeeklyNet:10,financialDistress:"HEALTHY"}};
const all=LEGENDS_CATALOGUE.filter(x=>x.status==="ACTIVE");
test("All original and expanded Legends have unique identities and valid tier artwork paths",()=>{
 expect(all).toHaveLength(129);
 expect(new Set(all.map(x=>x.id)).size).toBe(129);
 expect(all.filter(x=>x.roster.length>1).length).toBeGreaterThan(0);
 for(const item of all){
  expect(item.cardAsset,item.name).toMatch(
   /^\/assets\/legends\/[a-z0-9-]+-(cult|legend|icon|immortal)-card\.webp$/
  );
  expect(item.cardAsset,item.name).toContain("-"+item.tier.toLowerCase()+"-card.webp");
  expect(item.roster.length).toBeGreaterThan(0);
 }
});

for(const tier of tiers){
 for(const width of [320,390]){
  test("Full catalogue "+tier+" reveal coverage at "+width+"px",async({page})=>{
   test.setTimeout(240_000);
   const entries=all.filter(x=>x.tier===tier);
   expect(entries.length).toBeGreaterThan(0);
   await page.setViewportSize({width,height:width===320?568:844});
   await page.emulateMedia({reducedMotion:"reduce"});
   let seenWrites=0,kpWrites=0,otherWrites=0;
   const entriesOnServer=entries.map(item=>({
    id:item.id,name:item.name,tier:item.tier,division:item.division,
    tradition:item.tradition,visibility:item.visibility,
    clue:item.clue,achievement:item.achievement,progress:100,
    exactProgress:item.target??0,target:item.target??0,
    unlocked:true,year:2,week:1,
    personIds:item.roster.map((_,i)=>"legend:"+item.id+":"+i),
    revealSeen:true,collected:false,collectibleReady:true,
    cardAsset:item.cardAsset,price:LEGEND_TIER_PRICES[tier]
   }));
   await page.route("**/api/session",route=>route.fulfill({json:{
    worldId:"review-world",playerId:"owner",csrfToken:"opaque",
    overview,availablePromotions:[]}}));
   await page.route("**/api/card",route=>{
    const method=String(route.request().postDataJSON().method);
    if(method==="industry")return route.fulfill({json:{
     worldName:"PPW",year:2,week:1,phase:"OPEN",
     nextLockEpoch:Date.now()/1000+6000,
     ownPromotionId:"human",ownPromotionName:"Human Pro",
     promotions:[],headlines:[],broadcasts:[]}});
    if(method==="legendsVault")return route.fulfill({json:{
     worldYear:2,worldWeek:1,balance:0,curated:all.length,
     entries:entriesOnServer
    }});
    if(method==="legendSeen"){seenWrites++;return route.fulfill({json:{seen:true}});}
    if(method==="kpAction"){kpWrites++;return route.fulfill({json:{ok:true}});}
    otherWrites++;return route.fulfill({json:{}});
   });
   await page.goto("/#/industry/legends");
   await expect(page.locator(".ppw-legend-tile")).toHaveCount(entries.length);
   await expect(page.getByRole("dialog")).toHaveCount(0);

   const names=new Set<string>();
   for(const item of entries){
    const tile=page.locator('.ppw-legend-tile[data-legend-id="'+item.id+'"]');
    await tile.getByRole("button",{name:"Replay the reveal"}).click();
    const reveal=page.getByRole("dialog",{name:"Legend unlocked: "+item.name});
    await expect(reveal).toHaveAttribute("data-legend-id",item.id);
    await expect(reveal).toHaveAttribute("data-tier",tier);
    await expect(reveal).toHaveAttribute("data-motion","reduced");
    await expect(reveal).toHaveAttribute("data-sequence","FINALE");
    const art=reveal.locator("img.ppw-legend-card-art");
    await expect(art).toHaveAttribute("src",item.cardAsset!);
    await expect(art).toHaveJSProperty("naturalWidth",960);
    await expect(art).toHaveJSProperty("naturalHeight",1440);
    await expect(reveal.locator(".ppw-ceremony-identity"))
     .toHaveAttribute("aria-label",taglines[tier]);
    await expect(reveal.locator(".ppw-ceremony-card-mist")).toHaveCount(1);
    await expect(reveal.getByRole("button",{name:"View wrestler dossier"})).toBeVisible();
    await expect(reveal.getByRole("button",{name:"Talent Market"})).toBeVisible();
    // A generic 2:3 card and its glow come from the actual same image box.
    const bounds=await reveal.evaluate(node=>{
     const image=node.querySelector("img.ppw-legend-card-art")!.getBoundingClientRect();
     const stage=node.querySelector(".ppw-ceremony-stage-wrap")!.getBoundingClientRect();
     const container=node.querySelector(".ppw-ceremony-stage-clip")!.getBoundingClientRect();
     return {cardX:image.x,cardY:image.y,cardRight:image.right,
      ratio:image.width/image.height,
      centred:Math.abs((image.left+image.right)/2-(stage.left+stage.right)/2),
      viewportRight:container.right,
      glow:getComputedStyle(node.querySelector("img.ppw-legend-card-art")!).boxShadow};
    });
    expect(bounds.ratio,item.name+" card aspect").toBeGreaterThan(.64);
    expect(bounds.ratio,item.name+" card aspect").toBeLessThan(.69);
    expect(bounds.centred,item.name+" alignment").toBeLessThan(2);
    expect(bounds.cardRight,item.name+" clipping").toBeLessThanOrEqual(width+1);
    expect(bounds.cardX,item.name+" clipping").toBeGreaterThanOrEqual(-1);
    expect(bounds.glow,item.name+" glow").not.toBe("none");
    names.add(item.id);
    await reveal.getByRole("button",{name:"Continue to the Vault"}).click();
    await expect(reveal).toHaveCount(0);
   }
   expect(names.size).toBe(entries.length);
   expect(seenWrites,"No replay changes World unlock receipts").toBe(0);
   expect(kpWrites,"No replay purchases cards").toBe(0);
   expect(otherWrites,"Presentation makes no other commands").toBe(0);
  });
 }
}
