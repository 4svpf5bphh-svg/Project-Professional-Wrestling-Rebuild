import {test,expect} from "@playwright/test";
const session={worldId:"world",playerId:"owner",csrfToken:"secret",
 overview:{world:{revision:4,name:"Genesis",year:1,week:8,
  phase:"OPEN",nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
  membership:"ACTIVE",promotion:{id:"p1",name:"Chaotic Wrestling Alliance",tier:"LOCAL"}},
 availablePromotions:[]};
const categories=["CAREER","EVENTS","MATCHES","BUSINESS"] as const;
const trophy=(key:string,label:string,category:typeof categories[number],
 progress:number,target:number,earned:boolean)=>({
 key,label,category,description:"Complete a certified wrestling milestone in this category.",
 tier:"SILVER",metric:"shows",progress,target,earned,unit:"shows",
 percent:Math.round(progress/target*100)
});
for(const width of [320,390]){
 test(`Trophy Room ${width}px: earned prestige, progress filters, categories and no extra reads`,async({page})=>{
  await page.setViewportSize({width,height:844});
  let reads=0;const calls:string[]=[];
  await page.route("**/api/session",r=>r.fulfill({json:session}));
  await page.route("**/api/card",r=>{
   const payload=r.request().postDataJSON();
   calls.push(payload.method);
   if(payload.method==="achievements"){
    reads++;
    return r.fulfill({json:{
     promotionName:"Chaotic Wrestling Alliance",worldYear:1,week:8,
     activeBadge:"GOLD",rank:"RISING STAR",prestigeScore:13,earnedCount:2,total:4,
     achievements:[
      trophy("FIRST_BELL","First Bell","CAREER",1,1,true),
      trophy("TEN_SHOWS","The Regular","CAREER",7,10,false),
      trophy("FIRST_CLASSIC","Matchmaker","MATCHES",1,1,true),
      trophy("FIRST_PROFIT","In The Black","BUSINESS",0,1,false)
     ]
    }});
   }
   if(payload.method==="kpWorkspace")return r.fulfill({json:{}});
   return r.fulfill({json:{}});
  });
  await page.goto("/#/achievements");
  await expect(page.getByRole("heading",{name:"TROPHY ROOM"})).toBeVisible();
  await expect(page.getByText("RISING STAR")).toBeVisible();
  await expect(page.locator(".ppw-trophy-count").first()).toContainText("2");
  await expect(page.getByText("The Regular").first()).toBeVisible();
  await expect(page.locator(".ppw-trophy-tile").filter({hasText:"First Bell"})).toHaveCount(1);
  await page.getByRole("button",{name:"Earned",exact:true}).click();
  await expect(page.locator(".ppw-trophy-grid .ppw-trophy-tile")).toHaveCount(2);
  await page.getByRole("button",{name:"In progress"}).click();
  await expect(page.locator(".ppw-trophy-grid .ppw-trophy-tile")).toHaveCount(1);
  await page.getByRole("button",{name:"All",exact:true}).click();
  await page.getByRole("combobox",{name:"Achievement category"}).selectOption("MATCHES");
  await expect(page.locator(".ppw-trophy-grid .ppw-trophy-tile")).toHaveCount(1);
  expect(reads).toBe(1);
  expect(calls).toEqual(["achievements"]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  await page.getByRole("button",{name:"★ KP Wallet"}).click();
  await expect(page.getByRole("heading",{name:"Kayfabe Points"})).toBeVisible();
  expect(calls).toEqual(["achievements","kpWorkspace"]);
 });
}
