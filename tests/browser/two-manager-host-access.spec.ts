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
