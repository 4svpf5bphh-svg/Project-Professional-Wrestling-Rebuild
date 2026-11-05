import {test,expect} from "@playwright/test";
import {LEGENDS_CATALOGUE,LEGEND_TIER_PRICES} from "../../src/domain/legends-catalogue.js";
const overview={world:{revision:4,name:"PPW",year:2,week:1,phase:"OPEN",nextLockEpoch:Date.now()/1000+6000,serverEpoch:Date.now()/1000},
 membership:"ACTIVE",promotion:{id:"human",name:"Human Pro",tier:"LOCAL",cash:1000000,debt:0,lastWeeklyNet:10,financialDistress:"HEALTHY"}};
for(const width of [320,390]){
 test("Phase 32 private 129-card cabinet browsing at "+width+"px",async({page},info)=>{
  test.setTimeout(60_000);
  await page.setViewportSize({width,height:width===320?568:844});
  const items=LEGENDS_CATALOGUE;
  const ownedIds=new Set(["jerry-lynn","trish-stratus","sting","undertaker"]);
  let reads=0,writes=0;
  await page.route("**/api/session",r=>r.fulfill({json:{worldId:"review",playerId:"owner",csrfToken:"opaque",overview,availablePromotions:[]}}));
  await page.route("**/api/card",r=>{
   const method=String(r.request().postDataJSON().method);
   if(method==="legendsVault"){
    reads++;
    return r.fulfill({json:{worldYear:2,worldWeek:1,balance:3000,curated:items.length,
     entries:items.map(x=>({id:x.id,name:x.id.includes("secret")?null:x.name,
      tier:x.tier,division:x.division,tradition:x.tradition,visibility:x.visibility,
      clue:x.clue,achievement:x.achievement,progress:100,exactProgress:x.target??0,
      target:x.target??0,unlocked:true,year:1,week:1,
      personIds:x.roster.map((_,i)=>"legend:"+x.id+":"+i),
      revealSeen:true,collected:ownedIds.has(x.id),collectibleReady:true,
      cardAsset:x.cardAsset,price:LEGEND_TIER_PRICES[x.tier]}))}});
   }
   writes++;return r.fulfill({json:{}});
  });
  await page.goto("/#/collection");
  const album=page.locator(".ppw-album");
  await expect(album.getByRole("progressbar",{name:"Legend card collection progress"})).toHaveAttribute("aria-valuenow","4");
  await expect(album.locator(".ppw-album-tier-summary")).toHaveCount(4);
  await expect(album.locator(".ppw-album-slot")).toHaveCount(12);
  await expect(album.getByText("129 cards · Page 1 of 11")).toBeVisible();
  await expect(page.getByRole("link",{name:"World Record Book"})).toHaveAttribute("href","#/records");
  await page.screenshot({path:info.outputPath("phase32-album-"+width+"-main.png")});
  await album.getByRole("button",{name:"Next page"}).click();
  await expect(album.getByText("129 cards · Page 2 of 11")).toBeVisible();
  await expect(album.locator(".ppw-album-slot")).toHaveCount(12);
  await album.getByRole("button",{name:"Collected",exact:true}).click();
  await expect(album.locator(".ppw-album-slot")).toHaveCount(4);
  await expect(album.locator(".ppw-album-slot[data-collected='false']")).toHaveCount(0);
  await page.screenshot({path:info.outputPath("phase32-album-"+width+"-collected.png")});
  await album.getByRole("button",{name:"View card"}).first().click();
  const viewer=page.getByRole("dialog",{name:"Collectible card: Jerry Lynn"});
  await expect(viewer).toBeVisible();
  await expect(viewer.locator("img.ppw-legend-card-art")).toHaveJSProperty("naturalWidth",960);
  await expect.poll(()=>viewer.evaluate(node=>Number(getComputedStyle(node).opacity))).toBe(1);
  await page.screenshot({path:info.outputPath("phase32-album-"+width+"-viewer.png")});
  await viewer.getByRole("button",{name:"Next card"}).click();
  const next=page.getByRole("dialog",{name:"Collectible card: Trish Stratus"});
  await expect(next).toBeVisible();
  await next.press("ArrowRight");
  await expect(page.getByRole("dialog",{name:"Collectible card: Sting"})).toBeVisible();
  await page.getByRole("dialog").press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(album.getByRole("button",{name:"Collected",exact:true})).toHaveAttribute("aria-pressed","true");
  const search=album.getByRole("searchbox",{name:"Search cards"});
  await search.fill("Undertaker");
  await expect(album.locator(".ppw-album-slot")).toHaveCount(1);
  await album.getByRole("button",{name:"A–Z"}).click();
  await expect(album.locator(".ppw-album-slot")).toHaveCount(1);
  await search.fill("");
  await album.getByRole("button",{name:"Browse icon cards"}).click();
  await expect(album.getByRole("button",{name:"Icons"})).toHaveAttribute("aria-pressed","true");
  const metrics=await album.evaluate(node=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));
  expect(metrics.scroll).toBeLessThanOrEqual(metrics.client+1);
  expect(reads).toBe(1);expect(writes).toBe(0);
 });
}
