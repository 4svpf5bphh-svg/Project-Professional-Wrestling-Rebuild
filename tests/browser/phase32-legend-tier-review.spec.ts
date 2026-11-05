import {test,expect} from "@playwright/test";
import {LEGENDS_CATALOGUE,LEGEND_TIER_PRICES} from "../../src/domain/legends-catalogue.js";

// Authenticated running-game captures, with only World unlock receipts mocked.
// Names, tiers, milestone descriptions and 960x1440 art come from PPW itself.
const ids=["jerry-lynn","trish-stratus","sting","undertaker"] as const;
const taglines:Record<string,string>={
 CULT:"The Underground Never Forgets",
 LEGEND:"A Name Etched in History",
 ICON:"Born for the Spotlight",
 IMMORTAL:"A Legacy That Echoes Forever"
};
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
   await expect(reveal.locator(".ppw-ceremony-headline")).toHaveText(item.tier);
   await expect(reveal.locator(".ppw-ceremony-identity")).toHaveAttribute("aria-label",taglines[item.tier]!);
   await expect(reveal.locator(".ppw-ceremony-identity")).toBeVisible();
   await expect(reveal.locator(".ppw-ceremony-identity")).toBeEmpty();
   const taglineImage=await reveal.locator(".ppw-ceremony-identity")
    .evaluate(node=>getComputedStyle(node).backgroundImage);
   expect(taglineImage).toContain("/assets/legends/reveals/"+item.tier.toLowerCase()+"-tagline.svg");
   const taglineResponse=await page.request.get("/assets/legends/reveals/"+item.tier.toLowerCase()+"-tagline.svg");
   expect(taglineResponse.status()).toBe(200);
   expect(taglineResponse.headers()["content-type"]).toMatch(/image\/svg\+xml/);
   await expect(reveal.getByRole("button",{name:"View wrestler dossier"})).toBeVisible();
   await expect(reveal.getByRole("button",{name:"Talent Market"})).toBeVisible();
   await expect(reveal.locator(".ppw-ceremony-strap,.ppw-ceremony-signal,.ppw-ceremony-achievement")).toHaveCount(0);
   await expect(reveal.locator(".ppw-legend-photo-credit,.ppw-ceremony-credit,a")).toHaveCount(0);
   const plate=await reveal.locator(".ppw-ceremony-set").evaluate(node=>getComputedStyle(node).backgroundImage);
   expect(plate).toContain("/assets/legends/reveals/"+item.tier.toLowerCase()+"-scene.webp");
   const plateResponse=await page.request.get("/assets/legends/reveals/"+item.tier.toLowerCase()+"-scene.webp");
   expect(plateResponse.status(),"The actual WebP scene plate is bundled").toBe(200);
   expect(plateResponse.headers()["content-type"]).toMatch(/image\/webp/);
   // A single common coordinate system ties the illustrated glowing opening
   // to the real 2:3 card. The stage can be cropped horizontally, not stretched.
   await expect(reveal).toHaveAttribute("data-sequence","FINALE",{timeout:8000});
   await expect.poll(()=>reveal.locator(".ppw-ceremony-card-stage")
    .evaluate(node=>getComputedStyle(node).opacity)).toBe("1");
   const geometry=await reveal.evaluate(node=>{
    const stage=node.querySelector(".ppw-ceremony-stage-wrap")!.getBoundingClientRect();
    const card=node.querySelector(".ppw-ceremony-card-stage")!.getBoundingClientRect();
    return {centreOffset:Math.abs((card.left+card.width/2)-(stage.left+stage.width/2)),
     topFraction:(card.top-stage.top)/stage.height,
     bottomFraction:(card.bottom-stage.top)/stage.height};
   });
   expect(geometry.centreOffset).toBeLessThan(2);
   expect(geometry.topFraction).toBeGreaterThan(.235);
   expect(geometry.topFraction).toBeLessThan(.26);
   expect(geometry.bottomFraction).toBeGreaterThan(.77);
   expect(geometry.bottomFraction).toBeLessThan(.85);
   if(item.tier==="IMMORTAL")expect(plate).not.toMatch(/undertaker|deadman|violet/);
   const styleInfo=await reveal.evaluate(node=>{
    const art=node.querySelector<HTMLElement>(".ppw-ceremony-set")!;
    const clip=node.querySelector<HTMLElement>(".ppw-ceremony-stage-clip")!;
    const card=node.querySelector<HTMLElement>("img.ppw-legend-card-art")!;
    return {artShear:getComputedStyle(art).transform,
      backdrop:getComputedStyle(clip,"::before").backgroundImage,
      cardTransform:getComputedStyle(card).transform,
      imageBack:getComputedStyle(clip,"::before").position};
   });
   expect(styleInfo.artShear).toBe("none");
   expect(styleInfo.cardTransform).toBe("none");
   const framed=await reveal.locator(".ppw-ceremony-card-stage img").evaluate(node=>({
    glow:getComputedStyle(node).boxShadow,transform:getComputedStyle(node).transform
   }));
   expect(framed.glow).toContain("rgb");
   expect(framed.glow).not.toBe("none");
   expect(framed.transform).toBe("none");
   await expect(reveal.locator(".ppw-ceremony-card-mist")).toHaveCount(1);
   expect(styleInfo.backdrop).toContain("/assets/legends/reveals/");
   const footerBox=await reveal.locator(".ppw-ceremony-finale").boundingBox();
   const taglineBox=await reveal.locator(".ppw-ceremony-identity").boundingBox();
   const cardBox=await reveal.locator(".ppw-ceremony-card-stage").boundingBox();
   expect(footerBox).not.toBeNull();expect(taglineBox).not.toBeNull();
   expect(footerBox!.y).toBeGreaterThan(taglineBox!.y+taglineBox!.height-2);
   expect(footerBox!.y+footerBox!.height).toBeLessThanOrEqual((width===320?568:844)+1);
   expect(taglineBox!.y).toBeGreaterThanOrEqual(cardBox!.y+cardBox!.height-8);
   const skipBounds=await reveal.getByRole("button",{name:"Skip reveal"}).boundingBox();
   const tierBounds=await reveal.locator(".ppw-ceremony-headline").boundingBox();
   expect(skipBounds).not.toBeNull();expect(tierBounds).not.toBeNull();
   expect(skipBounds!.width,"Compact Skip").toBeLessThanOrEqual(78);
   expect(skipBounds!.y+skipBounds!.height,"Skip doesn't overlap tier").toBeLessThan(tierBounds!.y);

   const img=reveal.locator("img.ppw-legend-card-art");
   await expect(img).toHaveAttribute("src",art);
   await expect(img).toHaveJSProperty("naturalWidth",960);
   await expect(img).toHaveJSProperty("naturalHeight",1440);
   await expect(reveal.getByRole("button",{name:"Skip reveal"})).toBeVisible();
   // Playwright records the live, actual CSS transition to a WebM artifact.
   await expect(reveal).toHaveAttribute("data-sequence","FINALE",{timeout:8000});
   await expect(reveal.getByText(/NOW AVAILABLE TO EVERY PROMOTION/)).toHaveCount(0);
   // Capture the stable, fully visible finale rather than a mid-fade frame.
   await expect.poll(()=>reveal.locator(".ppw-ceremony-finale")
    .evaluate(node=>getComputedStyle(node).opacity)).toBe("1");
   await expect(reveal.getByRole("button",{name:"Skip reveal"})).toHaveText("Skip");
   await expect(reveal.getByRole("button",{name:"Continue to the Vault"})).toHaveText("Continue");
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
   const reducedMist=await reduced.locator(".ppw-ceremony-card-mist")
    .evaluate(node=>getComputedStyle(node).animationName);
   expect(reducedMist).toBe("none");
   await page.screenshot({path:info.outputPath("phase32-"+item.tier.toLowerCase()+"-"+width+"-reduced.png")});
   await reduced.getByRole("button",{name:"Skip reveal"}).click();
   await expect(reduced).toHaveCount(0);
   // Dossier action follows the same server-authoritative seen receipt and
   // must dismiss the reveal before opening the real wrestler view.
   await page.locator('.ppw-legend-tile[data-legend-id="'+item.id+'"]')
    .getByRole("button",{name:"Replay the reveal"}).click();
   const dossierReveal=page.getByRole("dialog",{name:"Legend unlocked: "+item.name});
   await dossierReveal.getByRole("button",{name:"View wrestler dossier"}).click();
   await expect(dossierReveal).toHaveCount(0);
   const wrestlerDossier=page.getByRole("dialog",{name:"Wrestler dossier"});
   await expect(wrestlerDossier).toBeVisible();
   await wrestlerDossier.press("Escape");
   await expect(wrestlerDossier).toHaveCount(0);
   expect(seenWrites).toBe(1);
   expect(kpWrites).toBe(1);
   expect(methods).not.toContain("signLegend");
  });
 }
}
