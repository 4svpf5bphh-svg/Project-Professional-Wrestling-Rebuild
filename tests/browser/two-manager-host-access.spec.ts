import {test,expect} from "@playwright/test";

const world={revision:1,name:"PPW Rebuild Genesis",year:1,week:1,phase:"OPEN",
 nextLockEpoch:Date.now()/1000+999999,serverEpoch:Date.now()/1000};
const promotions={owner:{id:"promotion-009",name:"Crown Wrestling"},
 guest:{id:"promotion-010",name:"Revolution Pro"}};

test("iPhone safely signs out and changes manager without retaining the other account's office",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 let actor:"owner"|"guest"|null=null;
 await page.route("**/api/auth",route=>{
  if(route.request().method()==="DELETE"){
   actor=null;return route.fulfill({json:{ok:true}});
  }
  const b=route.request().postDataJSON();
  if(b.accessCode!=="test-"+b.playerId)return route.fulfill({status:401,json:{error:"Invalid sign-in"}});
  actor=b.playerId;
  return route.fulfill({json:{ok:true}});
 });
 await page.route("**/api/session",route=>{
  if(!actor)return route.fulfill({status:401,json:{error:"Sign in required"}});
  const promotion=promotions[actor];
  return route.fulfill({json:{
   worldId:"world-20261017",playerId:actor,csrfToken:"csrf-"+actor,
   overview:{world,membership:"ACTIVE",promotion},availablePromotions:[]
  }});
 });
 await page.route("**/api/card",route=>{
  const promotion=actor?promotions[actor]:null;
  return route.fulfill({json:{world,membership:"ACTIVE",promotion}});
 });
 await page.goto("/#/home");
 await expect(page.getByRole("heading",{name:"Enter the locker room"})).toBeVisible();
 await page.getByRole("textbox",{name:"Player ID"}).fill("owner");
 await page.getByRole("textbox",{name:"Private access code"}).fill("test-owner");
 await page.getByRole("button",{name:"Sign in"}).click();
 await expect(page.locator(".ppw-shell-brand strong")).toHaveText("Crown Wrestling");
 await page.getByRole("button",{name:"Sign out"}).click();
 await expect(page.getByRole("heading",{name:"Enter the locker room"})).toBeVisible();
 await expect(page.locator(".ppw-shell-brand")).toHaveCount(0);
 await page.getByRole("textbox",{name:"Player ID"}).fill("guest");
 await page.getByRole("textbox",{name:"Private access code"}).fill("test-guest");
 await page.getByRole("button",{name:"Sign in"}).click();
 await expect(page.locator(".ppw-shell-brand strong")).toHaveText("Revolution Pro");
 await expect(page.getByText("Crown Wrestling")).toHaveCount(0);
});

test("failed mobile sign-out preserves the authenticated account and explains the failure",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const promotion=promotions.owner;
 await page.route("**/api/session",route=>route.fulfill({json:{
  worldId:"world-20261017",playerId:"owner",csrfToken:"owner-csrf",
  overview:{world,membership:"ACTIVE",promotion},availablePromotions:[]
 }}));
 await page.route("**/api/card",route=>route.fulfill({json:{world,membership:"ACTIVE",promotion}}));
 await page.route("**/api/auth",route=>route.fulfill({status:503,json:{error:"Unavailable"}}));
 await page.goto("/#/home");
 await expect(page.locator(".ppw-shell-brand strong")).toHaveText("Crown Wrestling");
 await page.getByRole("button",{name:"Sign out"}).click();
 await expect(page.getByRole("alert")).toContainText("Could not confirm sign-out");
 await expect(page.locator(".ppw-shell-brand strong")).toHaveText("Crown Wrestling");
 await expect(page.getByRole("button",{name:"Sign out"})).toBeEnabled();
});

test("repeated invalid mobile sign-ins show one correction instead of stacking alerts",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.route("**/api/session",route=>route.fulfill({status:401,json:{error:"Sign in required"}}));
 await page.route("**/api/auth",route=>route.fulfill({status:401,json:{error:"Invalid sign-in"}}));
 await page.goto("/");
 await page.getByRole("textbox",{name:"Player ID"}).fill("guest");
 await page.getByRole("textbox",{name:"Private access code"}).fill("incorrect");
 await page.getByRole("button",{name:"Sign in"}).click();
 await expect(page.getByRole("alert")).toHaveCount(1);
 await page.getByRole("textbox",{name:"Private access code"}).fill("incorrect-again");
 await page.getByRole("button",{name:"Sign in"}).click();
 await expect(page.getByRole("alert")).toHaveCount(1);
 await expect(page.getByRole("button",{name:"Sign in"})).toBeEnabled();
});

test("first-time iPhone manager names their owner identity and may rebrand after claiming",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 let actor=false,ownerName:string|null=null,joined=false,claimed=false;
 let promotionName="Crown Wrestling",renames=0;
 const ownerSnapshots:string[]=[];
 await page.route("**/api/auth",route=>{
  actor=true;return route.fulfill({json:{ok:true}});
 });
 await page.route("**/api/session",route=>{
  if(!actor)return route.fulfill({status:401,json:{error:"Sign in required"}});
  ownerSnapshots.push(String(ownerName)+" | "+promotionName);
  return route.fulfill({json:{
   worldId:"world-20261017",playerId:"owner",ownerName,csrfToken:"csrf-owner",
   overview:{world,membership:joined?"ACTIVE":"NONE",
    promotion:claimed?{id:"promotion-009",name:promotionName}:null},
   availablePromotions:joined&&!claimed?[{id:"promotion-009",name:"Crown Wrestling",tier:"LOCAL"}]:[]
  }});
 });
 await page.route("**/api/card",route=>route.fulfill({json:{
  world,membership:"ACTIVE",promotion:{id:"promotion-009",name:promotionName}
 }}));
 await page.route("**/api/profile",route=>{
  const payload=route.request().postDataJSON();
  expect(payload).toMatchObject({action:"SET_NAME",name:"Josh Robinson"});
  expect(route.request().headers()["x-ppw-csrf"]).toBe("csrf-owner");
  ownerName=payload.name;
  return route.fulfill({json:{displayName:ownerName}});
 });
 await page.route("**/api/join",route=>{
  joined=true;return route.fulfill({json:{status:"APPLIED",result:{joined:true}}});
 });
 await page.route("**/api/claim",route=>{
  claimed=true;return route.fulfill({json:{status:"APPLIED",result:{claimed:true}}});
 });
 await page.route("**/api/promotion-identity",route=>{
  const payload=route.request().postDataJSON();
  expect(payload).toMatchObject({action:"RENAME",promotionId:"promotion-009",name:"Kingdom Pro"});
  renames++;promotionName=payload.name;
  return route.fulfill({json:{name:promotionName,changed:true,previousName:"Crown Wrestling"}});
 });
 await page.goto("/#/home");
 await page.getByRole("textbox",{name:"Player ID"}).fill("owner");
 await page.getByRole("textbox",{name:"Private access code"}).fill("test-owner");
 await page.getByRole("button",{name:"Sign in"}).click();
 await expect(page.getByRole("heading",{name:"What's your name?"})).toBeVisible();
 await page.getByRole("textbox",{name:"Your manager name"}).fill("Josh Robinson");
 await page.getByRole("button",{name:"Enter the wrestling world"}).click();
 expect(ownerName).toBe("Josh Robinson");
 await expect(page.getByRole("heading",{name:/Join /})).toBeVisible();
 await expect(page.locator(".ppw-shell-brand small")).toContainText("Josh Robinson");
 await page.getByRole("button",{name:"Join World"}).click();
 await expect(page.getByRole("heading",{name:"Pick a promotion"})).toBeVisible();
 await page.getByRole("button",{name:"Run this promotion"}).click();
 await expect(page.getByRole("heading",{name:"Make it yours"})).toBeVisible();
 await expect(page.locator(".ppw-shell-brand small")).toContainText("Josh Robinson");
 await page.getByRole("textbox",{name:"Promotion name"}).fill("Kingdom Pro");
 await page.getByRole("button",{name:"Save promotion name"}).click();
 await expect(page.locator(".ppw-shell-brand strong")).toHaveText("Kingdom Pro");
 await expect(page.locator(".ppw-shell-brand small"),ownerSnapshots.join(" :: ")).toContainText("Josh Robinson");
 expect(renames).toBe(1);
});
