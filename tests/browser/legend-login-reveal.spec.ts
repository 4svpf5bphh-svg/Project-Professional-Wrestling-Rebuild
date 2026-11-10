import {test,expect} from "@playwright/test";
const overview={world:{revision:8,name:"Genesis",year:2,week:22,phase:"OPEN",
 nextLockEpoch:Date.now()/1000+6000,serverEpoch:Date.now()/1000},
 membership:"ACTIVE",promotion:{id:"home",name:"CWA",tier:"INDEPENDENT",
 cash:1500000,debt:0,lastWeeklyNet:0,financialDistress:"HEALTHY"}};
for(const width of [320,390]){
 test(`Unseen Cult Legends greet the returning manager at ${width}px, exactly once each`,
 async({page})=>{
  await page.setViewportSize({width,height:width===320?568:844});
  await page.emulateMedia({reducedMotion:"reduce"});
  const seen=new Set<string>(),requests:string[]=[];
  const entries=[
   {id:"lance-storm",name:"Lance Storm",year:2,week:20,
    cardAsset:"/assets/legends/lance-storm-cult-card.webp"},
   {id:"jerry-lynn",name:"Jerry Lynn",year:2,week:21,
    cardAsset:"/assets/legends/jerry-lynn-cult-card.webp"}
  ];
  await page.route("**/api/session",r=>r.fulfill({json:{
   worldId:"world",playerId:"booker",csrfToken:"opaque",overview,
   unseenLegendReveal:seen.size<entries.length,availablePromotions:[]
  }}));
  await page.route("**/api/card",r=>{
   const request=r.request().postDataJSON() as {method:string;legendId?:string};
   requests.push(request.method);
   if(request.method==="industry")return r.fulfill({json:{
    worldName:"Genesis",year:2,week:22,ownPromotionId:"home",
    ownPromotionName:"CWA",promotions:[],headlines:[],broadcasts:[]}});
   if(request.method==="legendsVault")return r.fulfill({json:{
    worldYear:2,worldWeek:22,curated:129,balance:750,
    entries:entries.map(e=>({...e,tier:"CULT",division:"MEN",
     tradition:null,visibility:"KNOWN",clue:"Technical wrestling",
     achievement:"Earned World career milestone",progress:100,
     exactProgress:20,target:20,personIds:["legend:"+e.id+":0"],
     unlocked:true,collected:false,collectibleReady:true,
     revealSeen:seen.has(e.id),price:750}))
   }});
   if(request.method==="legendSeen"){
    if(!request.legendId)return r.fulfill({status:400,json:{error:"No legend ID"}});
    seen.add(request.legendId);return r.fulfill({json:{seen:true}});
   }
   if(request.method==="industryNews")return r.fulfill({json:{
    latestEdition:{year:2,week:21},stories:[],awards:[],voices:[]
   }});
   return r.fulfill({json:{}});
  });
  // Returning on Home or News must not hide an unheard discovery behind
  // a mere headline. Two unlocks chain through the original Cult ceremony.
  await page.goto("/#/news");
  await expect(page).toHaveURL(/#\/industry\/legends$/);
  for(const entry of entries){
   const reveal=page.getByRole("dialog",{name:"Legend unlocked: "+entry.name});
   await expect(reveal).toBeVisible();
   await expect(reveal).toHaveAttribute("data-tier","CULT");
   const card=reveal.locator("img.ppw-legend-card-art");
   await expect(card).toHaveAttribute("src",entry.cardAsset);
   await expect(card).toHaveJSProperty("naturalWidth",960);
   await expect(card).toHaveJSProperty("naturalHeight",1440);
   await expect(reveal.locator(".ppw-ceremony-identity"))
    .toHaveAttribute("aria-label","The Underground Never Forgets");
   expect(seen.has(entry.id),
    "A presentation must not be pre-acknowledged by navigation").toBe(false);
   await reveal.getByRole("button",{name:"Continue to the Vault"}).click();
   await expect.poll(()=>seen.has(entry.id)).toBe(true);
  }
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(requests.filter(x=>x==="legendSeen")).toHaveLength(2);
  expect(requests.filter(x=>x==="legendsVault")).toHaveLength(1);
  expect(requests).not.toContain("kpAction");
  await page.goto("/#/news");
  await expect(page).toHaveURL(/#\/news$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(requests.filter(x=>x==="legendsVault"),
   "No unnecessary second Vault check after both reveals are seen").toHaveLength(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
   .toBeLessThanOrEqual(1);
 });
}
