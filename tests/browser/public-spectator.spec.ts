import {test,expect} from "@playwright/test";
const overview={world:{revision:4,name:"PPW",year:1,week:5,phase:"OPEN",
 nextLockEpoch:Date.now()/1000+6000,serverEpoch:Date.now()/1000},
 membership:"ACTIVE",promotion:{id:"mine",name:"My Promotion",tier:"LOCAL",
 cash:100000,debt:0,lastWeeklyNet:0,financialDistress:"HEALTHY"}};
const session={worldId:"w",playerId:"owner",csrfToken:"csrf",overview,availablePromotions:[]};
test("iPhone can read another human's completed results without viewing any unbooked show",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const calls:string[]=[];
 await page.route("**/api/session",route=>route.fulfill({json:session}));
 await page.route("**/api/card",route=>{
  const request=route.request().postDataJSON(),method=String(request.method);
  calls.push(method);
  if(method==="industry")return route.fulfill({json:{
   worldName:"PPW",year:1,week:5,phase:"OPEN",nextLockEpoch:Date.now()/1000+6000,
   ownPromotionId:"mine",ownPromotionName:"My Promotion",headlines:[],
   promotions:[{promotionId:"mine",name:"My Promotion",tier:"LOCAL",rank:1,
    mediaReach:25,recentAverageCrowd:80,recentShowCount:0,
    managementMode:"HUMAN",isYours:true},
    {promotionId:"rival",name:"Rival Promotion",tier:"LOCAL",rank:2,
    mediaReach:20,recentAverageCrowd:70,recentShowCount:1,
    managementMode:"HUMAN",isYours:false}],
   broadcasts:[{showId:"finished",promotionId:"rival",promotionName:"Rival Promotion",
    showName:"Saturday Slam",bookingClass:"REGULAR",year:1,week:4,
    crowdResponse:80,day:4,isYours:false,humanManaged:true}]
  }});
  if(method==="industryFeatured")return route.fulfill({json:{people:[],moreThanEight:false}});
  if(method==="publicResults"){
   expect(request.targetPromotionId).toBe("rival");
   expect(request.targetShowId).toBe("finished");
   return route.fulfill({json:{showId:"finished",promotionName:"Rival Promotion",
    showName:"Saturday Slam",year:1,week:4,crowdResponse:80,
    entries:[{slotId:"a",position:0,type:"MATCH",
     headline:"Samoa Joe vs Matt Riddle",outcome:"SUBMISSION",
     winner:"Matt Riddle",ratingStars:4.25,crowdResponse:88}]}})
  }
  throw Error("Unexpected method "+method);
 });
 await page.goto("/#/industry");
 await expect(page.getByRole("heading",{name:"Industry"})).toBeVisible();
 await page.locator(".ppw-industry-company").filter({hasText:"Rival Promotion"})
  .locator("summary").click();
 await page.getByRole("button",{name:"Read Results"}).click();
 await expect(page.getByRole("heading",{name:"Saturday Slam"})).toBeVisible();
 await expect(page.getByText("Samoa Joe vs Matt Riddle")).toBeVisible();
 await expect(page.getByText("WINNER · Matt Riddle")).toBeVisible();
 await expect(page.getByText(/4.25 \/ 5/)).toBeVisible();
 await expect(page.getByText(/future creative remain private/)).toBeVisible();
 expect(calls).toEqual(["industry","industryFeatured","publicResults"]);
 await page.getByRole("button",{name:"← Back to Industry"}).click();
 await expect(page.getByRole("heading",{name:"Industry"})).toBeVisible();
 expect(calls).toEqual(["industry","industryFeatured","publicResults"]); // Reuse the already loaded Industry state.
});
