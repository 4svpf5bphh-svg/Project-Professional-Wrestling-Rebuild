import {test,expect} from "@playwright/test";

for(const width of [320,390]){
 test("Backstage Promises keeps the active and settled commitments readable at "+width+"px",async({page},info)=>{
  await page.setViewportSize({width,height:844});
  const requests:string[]=[];
  const world={revision:12,name:"PPW",year:1,week:20,phase:"OPEN",
   nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000};
  await page.route("**/api/session",r=>r.fulfill({json:{worldId:"world",playerId:"owner",csrfToken:"opaque",
   overview:{world,membership:"ACTIVE",promotion:{id:"company",name:"Coastal Wrestling",tier:"INDEPENDENT"}},
   availablePromotions:[]}}));
  const promise={id:"title",personId:"eli",name:"Eli Crown",commitment:"Give a Harbour Championship opportunity",
   status:"IN_PROGRESS",made:17,due:21,detail:"Harbour Lights · Y1 W21 · draft. This only counts after the show is certified.",
   nextAction:"PLANNER"};
  await page.route("**/api/card",r=>{
   const input=r.request().postDataJSON() as {method:string;view?:string};
   requests.push(input.method+(input.view?":"+input.view:""));
   if(input.method==="backstage")return r.fulfill({json:{roster:[],personId:null,worldMessages:[],
    worldRevision:12,worldYear:1,worldWeek:20,canEdit:true}});
   if(input.method==="backstagePromises")return r.fulfill({json:{next:null,entries:input.view==="OUTSTANDING"?
    [promise,{...promise,id:"second",name:"Sam Sands",status:"OUTSTANDING",commitment:"Book an in-ring appearance",
     detail:"A qualifying show is still needed.",due:22}]:
    [{...promise,status:"FULFILLED",detail:"A completed, certified show fulfilled this booking commitment.",nextAction:null},
     {...promise,id:"third",name:"Alix Vale",status:"BROKEN",commitment:"Give time for a promo or angle",
      detail:"No qualifying completed appearance by the deadline. Promotion trust -3.",nextAction:null}]}});
   return r.fulfill({json:{}});
  });
  await page.goto("/#/backstage");
  await page.getByRole("button",{name:"Promises",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Promises"})).toBeVisible();
  await expect(page.getByText("IN PROGRESS")).toBeVisible();
  await expect(page.getByText("OUTSTANDING",{exact:true}).last()).toBeVisible();
  await expect(page.getByRole("button",{name:"Open Show Planner"})).toHaveCount(2);
  const contrast=await page.locator(".ppw-promise-card").first().evaluate(card=>{
   const luminance=(value:string)=>[...(value.match(/\d+/g)??[])].slice(0,3).map(Number)
    .map(channel=>channel/255).map(channel=>channel<=.04045?channel/12.92:((channel+.055)/1.055)**2.4)
    .reduce((total,channel,i)=>total+channel*[.2126,.7152,.0722][i]!,0);
   const background=luminance(getComputedStyle(card).backgroundColor);
   return Math.min(...[...card.querySelectorAll("h2,strong,small,p")].map(label=>{
    const foreground=luminance(getComputedStyle(label).color);
    return (Math.max(background,foreground)+.05)/(Math.min(background,foreground)+.05);
   }));
  });
  expect(contrast).toBeGreaterThanOrEqual(4.5);
  await page.screenshot({path:info.outputPath("backstage-promises-"+width+".png")});
  await page.getByRole("button",{name:"History",exact:true}).click();
  await expect(page.getByText("FULFILLED",{exact:true})).toBeVisible();
  await expect(page.getByText("BROKEN",{exact:true})).toBeVisible();
  await expect(page.getByText(/Promotion trust -3/)).toBeVisible();
  expect(requests).toEqual(["backstage","backstagePromises:OUTSTANDING","backstagePromises:HISTORY"]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
 });
}
