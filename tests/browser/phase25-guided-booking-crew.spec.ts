import {test,expect,type Page} from "@playwright/test";
import {mkdir} from "node:fs/promises";

const session={worldId:"world",playerId:"manager",csrfToken:"csrf",
 overview:{world:{revision:4,name:"Genesis",year:1,week:5,phase:"OPEN",
  nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
  membership:"ACTIVE",promotion:{id:"company",name:"Chaotic Wrestling Alliance",
   tier:"LOCAL",cash:5_000_000,debt:0,lastWeeklyNet:0,
   financialDistress:"HEALTHY"}},availablePromotions:[]};
const week={year:1,week:5,offset:0,required:true,canEdit:true,major:false,
 scheduled:[],shows:[{draftId:"weekly",year:1,week:5,status:"DRAFT",
  eventType:"REGULAR",day:5,marketId:"home",venueId:"arena",
  marketName:"Home",venueName:"Arena",ticketStrategy:"STANDARD",ready:false,
  slots:0,bookingClass:"REGULAR",showSeriesId:null,showName:"Ascension"}]};
const planner={worldName:"Genesis",promotionName:"Chaotic Wrestling Alliance",
 year:1,week:5,worldRevision:4,canEdit:true,homeMarketId:"home",venues:[],weeks:[week]};
const talent=[
 {personId:"joe",contractId:"c-joe",name:"Samoa Joe",division:"MEN",
  alignment:"HEEL",available:true,reason:"AVAILABLE",remainingDates:18,
  popularity:86,recognition:89,momentum:62,inRingQuality:75,matchCraft:46,
  presentation:44,stamina:34,safety:42,fatigue:78,wear:82,appearanceFee:11000},
 {personId:"mistico",contractId:"c-mistico",name:"Místico",division:"MEN",
  alignment:"FACE",available:true,reason:"AVAILABLE",remainingDates:20,
  popularity:91,recognition:91,momentum:70,inRingQuality:90,matchCraft:90,
  presentation:85,stamina:91,safety:84,fatigue:6,wear:12,appearanceFee:16000,
  creativeControl:"PROTECTED_FINISHES"}
];
const card={showId:"weekly",year:1,week:5,worldRevision:4,
 canEdit:true,ready:false,day:5,venueId:"arena",showName:"Ascension",
 promotionName:"Chaotic Wrestling Alliance",venueName:"Arena",marketName:"Home",
 bookingClass:"REGULAR",ticketStrategy:"STANDARD",
 championships:[],programmes:[],programmeLinks:[],bookableTeams:[],
 bookableTrios:[],selectedPeople:[],slots:[],
 advisers:[{role:"ROAD_AGENT",name:"Derek James",staffId:"agent"},
  {role:"MEDICAL",name:"Dr Singh",staffId:"doctor"},
  {role:"REFEREE",name:"Mark Reid",staffId:"ref"},
  {role:"CREATIVE",name:"Emma Cross",staffId:"creative"}]};
async function stub(page:Page){
 const calls:string[]=[];
 const saved:unknown[]=[];
 await page.route("**/api/session",route=>route.fulfill({json:session}));
 await page.route("**/api/card",route=>{
  const req=route.request().postDataJSON() as {method:string;matches?:unknown[];segments?:unknown[]};
  calls.push(req.method);
  if(req.method==="save"){
   saved.push({matches:req.matches,segments:req.segments});
   return route.fulfill({json:{status:"APPLIED",result:{showId:"weekly"}}});
  }
  const data=req.method==="planner"?planner:req.method==="load"?card:
   req.method==="talent"?{talent,cursor:null}:{};
  return route.fulfill({json:data});
 });
 return {calls,saved};
}
async function goToCard(page:Page){
 await page.goto("/#/planner");
 await page.getByRole("button",{name:"Edit card"}).click();
 await expect(page.getByRole("heading",{name:"The Card"})).toBeVisible();
}
test("320px: a match moves through format, both sides, outcome and named crew briefing before reaching the card",async({page})=>{
 await page.setViewportSize({width:320,height:740});
 await mkdir("test-results/presentation-screenshots",{recursive:true});
 const {calls,saved}=await stub(page);
 await goToCard(page);
 await page.getByRole("button",{name:"+ Add match"}).click();
 const dialog=page.getByRole("dialog",{name:"Edit match"});
 await expect(dialog.getByText("STEP 1 OF 4 · SETUP")).toBeVisible();
 await expect(page.locator(".ppw-card[data-booking-slot-id]")).toHaveCount(0);
 await expect(page.locator(".ppw-card-airtime-heading")).toContainText("0 / 120 min");
 await dialog.getByRole("button",{name:"Ladder Match"}).click();
 await expect(dialog.locator(".ppw-guide-rules-brief")).toContainText("physical risk");
 await page.screenshot({path:"test-results/presentation-screenshots/phase25-guided-match-setup-320.png",animations:"disabled"});
 await dialog.getByRole("button",{name:"Continue · Select wrestlers"}).click();
 await expect(dialog.getByText("STEP 2 OF 4 · CAST")).toBeVisible();
 await dialog.getByRole("button",{name:"Choose wrestler"}).first().click();
 const picker=page.getByRole("dialog",{name:"Choose wrestler"});
 await expect(picker.locator(".ppw-picker-side-tabs .ppw-picker-side-tab")).toHaveCount(2);
 await expect(picker.locator(".ppw-wrestler-card")).toHaveCount(2);
 await picker.getByRole("button",{name:"Heel",exact:true}).click();
 await picker.getByRole("button",{name:"Fatigued 65+"}).click();
 await expect(picker.locator(".ppw-wrestler-card")).toHaveCount(1);
 await page.screenshot({path:"test-results/presentation-screenshots/phase25-side-a-filters-320.png",animations:"disabled"});
 await picker.locator(".ppw-wrestler-card").first().click();
 await expect(picker.locator('.ppw-picker-side-tab[aria-pressed="true"]')).toContainText("Side B");
 await expect(picker.getByRole("button",{name:"Heel",exact:true}))
  .toHaveAttribute("aria-pressed","false");
 await expect(picker.getByRole("button",{name:"Fatigued 65+"}))
  .toHaveAttribute("aria-pressed","false");
 await expect(picker.locator(".ppw-wrestler-card")).toHaveCount(2);
 // Switching sides restores the exact previous Side A filters, without
 // another roster request or accidentally filtering Side B.
 await picker.locator(".ppw-picker-side-tab").first().click();
 await expect(picker.getByRole("button",{name:"Heel",exact:true}))
  .toHaveAttribute("aria-pressed","true");
 await expect(picker.getByRole("button",{name:"Fatigued 65+"}))
  .toHaveAttribute("aria-pressed","true");
 await picker.locator(".ppw-picker-side-tab").nth(1).click();
 await expect(picker.getByRole("button",{name:"Heel",exact:true}))
  .toHaveAttribute("aria-pressed","false");
 await page.screenshot({path:"test-results/presentation-screenshots/phase25-side-b-independent-filters-320.png",animations:"disabled"});
 await picker.locator(".ppw-wrestler-card").first().click();
 await expect(picker).toHaveCount(0);
 await expect(dialog.locator(".ppw-guide-crew-pulse")).toContainText("Watch cumulative wear");
 await dialog.getByRole("button",{name:"Next · Script outcome"}).click();
 await expect(dialog.getByText("STEP 3 OF 4 · SCRIPT")).toBeVisible();
 await dialog.getByLabel("Minutes").fill("30");
 await dialog.getByLabel("Minutes").press("Tab");
 // Ladder stipulation changes the scripted finish, so it should not
 // trigger a clean-loss protection warning.
 await expect(dialog.locator(".ppw-guide-contract-alert")).toHaveCount(0);
 await dialog.getByRole("button",{name:"Next · Staff briefing"}).click();
 await expect(dialog.getByText("STEP 4 OF 4 · REVIEW")).toBeVisible();
 const review=dialog.locator(".ppw-guide-staff-review");
 await expect(review).toContainText("Derek James");
 await expect(review).toContainText("Dr Singh");
 await expect(review).toContainText("Mark Reid");
 await expect(review).toContainText("Show airtime with this booking · 30 / 120 min");
 await expect(review).toContainText("This is a demanding match");
 await expect(review).toContainText("Watch cumulative wear");
 await expect(review).toContainText("Risky stipulation and safety concerns");
 await expect(review).not.toContainText("Místico's contract protects");
 const condition=review.locator(".ppw-guide-condition-list");
 await expect(condition).toContainText("Samoa Joe");
 await expect(condition).toContainText("Fatigue 78/100");
 await expect(condition).toContainText("Wear 82/100");
 await expect(condition).toContainText("Místico");
 await expect(review).toContainText("Additional appearance fees · $27,000");
 await expect(review).toContainText("does not establish whether they have good or bad chemistry");
 await page.screenshot({path:"test-results/presentation-screenshots/phase25-staff-review-top-320.png",animations:"disabled"});
 await condition.scrollIntoViewIfNeeded();
 await page.screenshot({path:"test-results/presentation-screenshots/phase25-staff-condition-320.png",animations:"disabled"});
 expect(calls.filter(x=>x==="talent")).toHaveLength(1);
 expect(saved).toHaveLength(0);
 await dialog.getByRole("button",{name:"Complete match"}).click();
 await expect(dialog).toHaveCount(0);
 await expect(page.locator(".ppw-card-matchup")).toBeVisible();
 await expect(page.locator(".ppw-match-card")).toBeInViewport({ratio:0.8});
 await expect(page.locator(".ppw-card-matchup")).toContainText("Samoa Joe");
 await expect(page.locator(".ppw-card-matchup")).toContainText("Místico");
 await expect(page.locator(".ppw-card-matchup img")).toHaveCount(0);
 await expect(page.locator(".ppw-card-booked-facts")).toContainText("Planned winner");
 await expect(page.locator(".ppw-booking-readiness")).toHaveCount(0);
 await expect(page.locator(".ppw-card-lineup")).not.toContainText("2 / 2 booked");
 await expect(page.locator(".ppw-card-airtime-heading")).toContainText("30 / 120 min");
 await expect(page.getByText("Unsaved changes")).toBeVisible();
 await page.getByRole("button",{name:/Edit match in slot 1/}).click();
 await expect(page.getByRole("dialog",{name:"Edit match"})).toBeVisible();
 await page.getByRole("dialog",{name:"Edit match"}).getByRole("button",
  {name:"Close card editor"}).click();
 await page.screenshot({path:"test-results/presentation-screenshots/phase25-completed-card-320.png",animations:"disabled"});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
  .toBeLessThanOrEqual(1);
 await page.getByRole("button",{name:"Save changes"}).click();
 await expect(page.getByText("Show card saved")).toBeVisible();
 expect(saved).toHaveLength(1);
 expect(calls.filter(x=>x==="talent")).toHaveLength(1);
});
test("390px: cancelling a new match or scene leaves no phantom running-order slot",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const {saved}=await stub(page);
 await goToCard(page);
 await page.getByRole("button",{name:"+ Add match"}).click();
 let dialog=page.getByRole("dialog",{name:"Edit match"});
 await dialog.getByRole("button",{name:"Close card editor"}).click();
 await expect(dialog).toHaveCount(0);
 await expect(page.locator(".ppw-card[data-booking-slot-id]")).toHaveCount(0);
 await expect(page.getByText("Unsaved changes")).toHaveCount(0);
 await page.getByRole("button",{name:"+ Add angle"}).click();
 dialog=page.getByRole("dialog",{name:"Edit angle"});
 await dialog.locator(".ppw-angle-category-tiles").getByRole("button",{name:"Turns"}).click();
 await dialog.getByRole("button",{name:"Close card editor"}).click();
 await expect(dialog).toHaveCount(0);
 await expect(page.locator(".ppw-card[data-booking-slot-id]")).toHaveCount(0);
 expect(saved).toHaveLength(0);
});
test("390px: an angle also has a meaningful Creative team review before completion",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const {calls,saved}=await stub(page);
 await goToCard(page);
 await page.getByRole("button",{name:"+ Add angle"}).click();
 const dialog=page.getByRole("dialog",{name:"Edit angle"});
 await dialog.locator(".ppw-angle-category-tiles").getByRole("button",{name:"Turns"}).click();
 await dialog.getByRole("button",{name:"Continue · Select wrestlers"}).click();
 await dialog.getByRole("button",{name:"+ Add performer"}).click();
 const picker=page.getByRole("dialog",{name:"Choose wrestler"});
 await picker.locator(".ppw-wrestler-card").nth(1).click();
 await dialog.getByRole("button",{name:"Next · Script outcome"}).click();
 await dialog.getByLabel("Angle duration (minutes)").selectOption("20");
 await dialog.getByRole("button",{name:"Next · Staff briefing"}).click();
 const review=dialog.locator(".ppw-guide-staff-review");
 await expect(review).toContainText("Emma Cross");
 await expect(review).toContainText("Long scene, limited presentation strength");
 await expect(review.locator(".ppw-guide-condition-list")).toContainText("Samoa Joe");
 await expect(review.locator(".ppw-guide-condition-list")).toContainText("Fatigue 78/100");
 await dialog.getByRole("button",{name:"Complete angle"}).click();
 await expect(page.locator(".ppw-card[data-booking-slot-id]")).toHaveCount(1);
 expect(saved).toHaveLength(0);
 expect(calls.filter(x=>x==="talent")).toHaveLength(1);
});

test("320px: a new angle chooses What, casts initiator and target with independent slicers, scripts Where/Why and reviews staff risks",async({page})=>{
 await page.setViewportSize({width:320,height:740});
 await mkdir("test-results/presentation-screenshots",{recursive:true});
 const {calls,saved}=await stub(page);
 await goToCard(page);
 await page.getByRole("button",{name:"+ Add angle"}).click();
 const dialog=page.getByRole("dialog",{name:"Edit angle"});
 await expect(dialog.getByText("STEP 1 OF 4 · SETUP")).toBeVisible();
 await expect(dialog.getByLabel("Creative direction")).toHaveCount(0);
 await expect(dialog.getByLabel("Angle type")).toHaveCount(0);
 await dialog.locator(".ppw-angle-category-tiles").getByRole("button",{name:"Conflict & attacks"}).click();
 const choices=dialog.locator(".ppw-angle-type-tiles");
 await expect(choices).toContainText("Attack");
 expect(await choices.evaluate(element=>
  getComputedStyle(element).gridTemplateColumns.split(" ").length)).toBe(2);
 await choices.getByRole("button",{name:"Attack",exact:true}).click();
 await expect(dialog.getByLabel("Angle type")).toHaveCount(0);
 await expect(choices.getByRole("button",{name:"Attack",exact:true}))
  .toHaveAttribute("aria-pressed","true");
 await page.screenshot({path:"test-results/presentation-screenshots/phase25-angle-what-320.png",animations:"disabled"});
 await dialog.getByRole("button",{name:"Continue · Select wrestlers"}).click();
 await expect(dialog.getByText("STEP 2 OF 4 · CAST")).toBeVisible();
 await expect(dialog.getByLabel("Creative direction")).toHaveCount(0);
 await expect(dialog.locator(".ppw-guide-angle-context")).toContainText("Attack");
 await dialog.getByRole("button",{name:"+ Add attacker"}).click();
 let picker=page.getByRole("dialog",{name:"Choose wrestler"});
 await expect(picker.locator(".ppw-picker-side-tab")).toHaveCount(2);
 expect(await picker.locator(".ppw-picker-side-tab").evaluateAll(
  tabs=>tabs.every(tab=>tab.scrollWidth<=tab.clientWidth+1))).toBe(true);
 await expect(picker.locator(".ppw-picker-source-tab")).toHaveCount(5);
 await expect(picker.locator(".ppw-wrestler-card")).toHaveCount(2);
 await picker.getByRole("button",{name:"Heel",exact:true}).click();
 await expect(picker.locator(".ppw-wrestler-card")).toHaveCount(1);
 await picker.locator(".ppw-picker-side-tab").nth(1).click();
 await expect(picker.getByRole("button",{name:"Heel",exact:true}))
  .toHaveAttribute("aria-pressed","false");
 await expect(picker.locator(".ppw-wrestler-card")).toHaveCount(2);
 await picker.locator(".ppw-picker-side-tab").first().click();
 await expect(picker.getByRole("button",{name:"Heel",exact:true}))
  .toHaveAttribute("aria-pressed","true");
 await page.screenshot({path:"test-results/presentation-screenshots/phase25-angle-initiator-filters-320.png",animations:"disabled"});
 await picker.locator(".ppw-wrestler-card").first().click();
 await expect(picker).toHaveCount(0);
 await dialog.getByRole("button",{name:"+ Add target"}).click();
 picker=page.getByRole("dialog",{name:"Choose wrestler"});
 await expect(picker.locator(".ppw-picker-side-tab[aria-pressed=true]"))
  .toContainText("Target");
 await picker.getByRole("button",{name:"Face",exact:true}).click();
 await expect(picker.locator(".ppw-wrestler-card")).toHaveCount(1);
 await picker.locator(".ppw-wrestler-card").first().click();
 await expect(picker).toHaveCount(0);
 await dialog.getByRole("button",{name:"Next · Script outcome"}).click();
 await expect(dialog.getByText("STEP 3 OF 4 · SCRIPT")).toBeVisible();
 await expect(dialog.getByRole("heading",{name:"Where does it happen?",exact:true})).toBeVisible();
 await expect(dialog.getByRole("heading",{name:"Why is this on the show?",exact:true})).toBeVisible();
 await expect(dialog.getByRole("heading",{name:"How does it unfold?",exact:true})).toBeVisible();
 await expect(dialog.getByLabel("Angle type")).toHaveCount(0);
 await dialog.getByLabel("Area",{exact:true}).selectOption("OUTSIDE");
 await dialog.getByLabel("Exact location").selectOption("PARKING_LOT");
 await dialog.getByLabel("Attack intensity").selectOption("BRUTAL");
 await dialog.getByLabel("Visible aftermath").selectOption("BLOODIED");
 await dialog.getByLabel("Storytelling purpose").selectOption("SEEK_REVENGE");
 await page.screenshot({path:"test-results/presentation-screenshots/phase25-angle-where-why-320.png",animations:"disabled"});
 await dialog.getByRole("button",{name:"Next · Staff briefing"}).click();
 const review=dialog.locator(".ppw-guide-staff-review");
 await expect(dialog.getByText("STEP 4 OF 4 · REVIEW")).toBeVisible();
 await expect(review).toContainText("Samoa Joe");
 await expect(review).toContainText("Místico");
 await expect(review).toContainText("Dr Singh");
 await expect(review).toContainText("Mark Reid");
 await expect(review).toContainText("Check condition before this physical scene");
 await expect(review).toContainText("Coordinate the staged violence");
 await expect(review).toContainText("Additional appearance fees · $27,000");
 await expect(page.locator(".ppw-card-airtime-heading")).toContainText("0 / 120 min");
 await expect(page.locator(".ppw-card-appearance-cost")).toHaveCount(0);
 await page.screenshot({path:"test-results/presentation-screenshots/phase25-angle-staff-review-320.png",animations:"disabled"});
 expect(saved).toHaveLength(0);
 expect(calls.filter(c=>c==="talent")).toHaveLength(2);
 await dialog.getByRole("button",{name:"Complete angle"}).click();
 await expect(dialog).toHaveCount(0);
 await expect(page.locator(".ppw-angle-card")).toBeInViewport({ratio:0.8});
 await expect(page.locator(".ppw-angle-card .ppw-card-lineup")).toContainText("Attacker: Samoa Joe");
 await expect(page.locator(".ppw-angle-card .ppw-card-lineup")).toContainText("Victim: Místico");
 await expect(page.locator(".ppw-angle-card .ppw-card-lineup")).toContainText("Arena car park");
 await expect(page.locator(".ppw-card-airtime-heading")).toContainText("5 / 120 min");
 await expect(page.getByRole("group",{name:"Save and confirm show"})
  .getByRole("button",{name:"Save changes"})).toBeDisabled();
 await expect(page.getByText("Add and complete a match to enable saving.")).toBeVisible();
 await page.screenshot({path:"test-results/presentation-screenshots/phase25-completed-angle-card-320.png",animations:"disabled"});
 await page.locator(".ppw-angle-card .ppw-card-open-zone").click();
 await expect(page.getByRole("dialog",{name:"Edit angle"})).toBeVisible();
 await page.getByRole("dialog",{name:"Edit angle"}).getByRole("button",
  {name:"Close card editor"}).click();
 await expect(page.getByText("Unsaved changes")).toBeVisible();
 expect(saved).toHaveLength(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
  .toBeLessThanOrEqual(1);
});

test("390px: match and physical angle share show workload advice and are saved together once",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const {saved}=await stub(page);
 await goToCard(page);
 await page.getByRole("button",{name:"+ Add match"}).click();
 const match=page.getByRole("dialog",{name:"Edit match"});
 await expect(page.locator(".ppw-save .ppw-primary")).toBeDisabled();
 await match.getByRole("button",{name:"Continue · Select wrestlers"}).click();
 await match.getByRole("button",{name:"Choose wrestler"}).first().click();
 let picker=page.getByRole("dialog",{name:"Choose wrestler"});
 await picker.getByRole("button",{name:"Heel",exact:true}).click();
 await picker.locator(".ppw-wrestler-card").first().click();
 await expect(picker.locator(".ppw-picker-side-tab[aria-pressed=true]"))
  .toContainText("Side B");
 await picker.locator(".ppw-wrestler-card").first().click();
 await match.getByRole("button",{name:"Next · Script outcome"}).click();
 await expect(match.locator(".ppw-guide-contract-alert"))
  .toContainText("Místico's contract protects against this planned clean loss");
 await match.getByRole("button",{name:"Next · Staff briefing"}).click();
 await expect(match.locator(".ppw-guide-staff-review"))
  .toContainText("Místico's contract protects");
 await match.getByRole("button",{name:"Complete match"}).click();
 await expect(page.locator(".ppw-card-matchup")).toBeVisible();
 await expect(page.locator(".ppw-save .ppw-primary")).toBeEnabled();
 await page.getByRole("button",{name:"+ Add angle"}).click();
 const angle=page.getByRole("dialog",{name:"Edit angle"});
 await expect(page.locator(".ppw-save .ppw-primary")).toBeDisabled();
 await angle.locator(".ppw-angle-category-tiles").getByRole("button",{name:"Conflict & attacks"}).click();
 await angle.locator(".ppw-angle-type-tiles")
  .getByRole("button",{name:"Attack",exact:true}).click();
 await angle.getByRole("button",{name:"Continue · Select wrestlers"}).click();
 await angle.getByRole("button",{name:"+ Add attacker"}).click();
 picker=page.getByRole("dialog",{name:"Choose wrestler"});
 await expect(picker.locator(".ppw-picker-overlap")).toHaveCount(2);
 await expect(picker.locator(".ppw-picker-overlap").first())
  .toContainText("Appearance fee counted once");
 await picker.getByRole("button",{name:"Heel",exact:true}).click();
 await picker.locator(".ppw-wrestler-card").first().click();
 await angle.getByRole("button",{name:"+ Add target"}).click();
 picker=page.getByRole("dialog",{name:"Choose wrestler"});
 await picker.getByRole("button",{name:"Face",exact:true}).click();
 await picker.locator(".ppw-wrestler-card").first().click();
 await angle.getByRole("button",{name:"Next · Script outcome"}).click();
 await angle.getByRole("button",{name:"Next · Staff briefing"}).click();
 const staff=angle.locator(".ppw-guide-staff-review");
 await expect(staff).toContainText("Multiple physical bookings on this show");
 await expect(staff).toContainText("also have a match");
 await expect(staff).toContainText("Dr Singh");
 await expect(staff).toContainText("No additional appearance fees");
 await expect(staff).toContainText("Show airtime with this booking · 23 / 120 min");
 await angle.getByRole("button",{name:"Complete angle"}).click();
 await expect(page.locator(".ppw-match-card")).toHaveCount(1);
 await expect(page.locator(".ppw-angle-card")).toHaveCount(1);
 await expect(page.locator(".ppw-card-appearance-cost")).toContainText("$27,000");
 // Completing the scene updates the *existing match's* staff view too.
 // Reopen its original slot rather than building a second advisory surface.
 await page.getByRole("button",{name:/Edit match in slot 1/}).click();
 const reopened=page.getByRole("dialog",{name:"Edit match"});
 await expect(reopened.locator(".ppw-guide-staff-review"))
  .toContainText("Multiple physical bookings on this show");
 await expect(reopened.locator(".ppw-guide-staff-review"))
  .toContainText("No additional appearance fees");
 await reopened.getByRole("button",{name:"Close card editor"}).click();
 await expect(page.locator(".ppw-save .ppw-primary")).toBeEnabled();
 await page.getByRole("button",{name:"Save changes"}).click();
 await expect(page.getByText("Show card saved")).toBeVisible();
 expect(saved).toHaveLength(1);
 const payload=saved[0] as {matches:unknown[];segments:unknown[]};
 expect(payload.matches).toHaveLength(1);
 expect(payload.segments).toHaveLength(1);
});

test("390px: referee changes dangerous match rules only on request; Road Agent then suggests legal shorter length",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const {calls,saved}=await stub(page);
 await goToCard(page);
 await page.getByRole("button",{name:"+ Add match"}).click();
 const dialog=page.getByRole("dialog",{name:"Edit match"});
 await dialog.getByRole("button",{name:"Ladder Match"}).click();
 await dialog.getByRole("button",{name:"Continue · Select wrestlers"}).click();
 await dialog.getByRole("button",{name:"Choose wrestler"}).first().click();
 const picker=page.getByRole("dialog",{name:"Choose wrestler"});
 await picker.getByRole("button",{name:"Heel",exact:true}).click();
 await picker.locator(".ppw-wrestler-card").first().click();
 await picker.locator(".ppw-wrestler-card").first().click();
 await dialog.getByRole("button",{name:"Next · Script outcome"}).click();
 const choice=dialog.locator(".ppw-booking-choice-panel");
 await expect(choice).toContainText("Mark Reid");
 await expect(choice).toContainText("Reconsider the stipulation");
 await expect(dialog.getByLabel("Minutes")).toHaveValue("18");
 await choice.getByRole("button",{name:"Use standard rules"}).click();
 await expect(choice).toHaveCount(0);
 await dialog.getByLabel("Minutes").fill("35");
 await dialog.getByLabel("Minutes").press("Tab");
 await expect(choice).toContainText("Derek James");
 await expect(choice).toContainText("Samoa Joe");
 await expect(choice).toContainText("35 minutes");
 await choice.getByRole("button",{name:"Shorten to 18 min"}).click();
 await expect(dialog.getByLabel("Minutes")).toHaveValue("18");
 await expect(choice).toHaveCount(0);
 await dialog.getByRole("button",{name:"Next · Staff briefing"}).click();
 const review=dialog.locator(".ppw-guide-staff-review");
 await expect(review).toContainText("Standard rules");
 await expect(review).toContainText("Winner · Samoa Joe");
 await expect(review).toContainText("18 min");
 await dialog.getByRole("button",{name:"Complete match"}).click();
 await page.getByRole("button",{name:"Save changes"}).click();
 expect(saved).toHaveLength(1);
 const recorded=(saved[0] as {matches:{payload:{plannedFinish:string;
  plannedLengthMinutes:number;scriptedWinnerSide:string}}[]}).matches[0]!.payload;
 expect(recorded.plannedFinish).toBe("CLEAN_PIN");
 expect(recorded.plannedLengthMinutes).toBe(18);
 expect(recorded.scriptedWinnerSide).toBe("A");
 expect(calls.filter(x=>x==="talent")).toHaveLength(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
  .toBeLessThanOrEqual(1);
});

test("320px: Medical reduces an authored bloody attack only when explicitly tapped",async({page})=>{
 await page.setViewportSize({width:320,height:740});
 const {calls,saved}=await stub(page);
 await goToCard(page);
 await page.getByRole("button",{name:"+ Add angle"}).click();
 const dialog=page.getByRole("dialog",{name:"Edit angle"});
 await dialog.locator(".ppw-angle-category-tiles").getByRole("button",{name:"Conflict & attacks"}).click();
 await dialog.locator(".ppw-angle-type-tiles")
  .getByRole("button",{name:"Attack",exact:true}).click();
 await dialog.getByRole("button",{name:"Continue · Select wrestlers"}).click();
 await dialog.getByRole("button",{name:"+ Add attacker"}).click();
 let picker=page.getByRole("dialog",{name:"Choose wrestler"});
 await picker.getByRole("button",{name:"Heel",exact:true}).click();
 await picker.locator(".ppw-wrestler-card").first().click();
 await dialog.getByRole("button",{name:"+ Add target"}).click();
 picker=page.getByRole("dialog",{name:"Choose wrestler"});
 await picker.getByRole("button",{name:"Face",exact:true}).click();
 await picker.locator(".ppw-wrestler-card").first().click();
 await dialog.getByRole("button",{name:"Next · Script outcome"}).click();
 const choice=dialog.locator(".ppw-booking-choice-panel");
 await expect(choice).toHaveCount(0);
 await dialog.getByLabel("Attack intensity").selectOption("BRUTAL");
 await dialog.getByLabel("Visible aftermath").selectOption("BLOODIED");
 await expect(choice).toContainText("Dr Singh");
 await expect(choice).toContainText("Samoa Joe");
 await expect(choice).toContainText("Soften this physical scene");
 await expect(dialog.getByLabel("Visible aftermath")).toHaveValue("BLOODIED");
 await choice.getByRole("button",{name:"Reduce physical intensity"}).click();
 await expect(dialog.getByLabel("Attack intensity")).toHaveValue("WARNING");
 await expect(dialog.getByLabel("Visible aftermath")).toHaveValue("OFFICIALS_SEPARATE");
 await expect(choice).toHaveCount(0);
 await dialog.getByRole("button",{name:"Next · Staff briefing"}).click();
 const review=dialog.locator(".ppw-guide-staff-review");
 await expect(review).toContainText("Check condition before this physical scene");
 await expect(review).not.toContainText("Coordinate the staged violence");
 await dialog.getByRole("button",{name:"Complete angle"}).click();
 expect(saved).toHaveLength(0);
 expect(calls.filter(x=>x==="talent")).toHaveLength(2);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
  .toBeLessThanOrEqual(1);
});

test("390px: Creative can tighten a weak long promo without altering the scripted scene",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const {calls,saved}=await stub(page);
 await goToCard(page);
 await page.getByRole("button",{name:"+ Add angle"}).click();
 const dialog=page.getByRole("dialog",{name:"Edit angle"});
 await dialog.getByRole("button",{name:"Continue · Select wrestlers"}).click();
 await dialog.getByRole("button",{name:"+ Add attacker"}).click();
 const picker=page.getByRole("dialog",{name:"Choose wrestler"});
 await picker.getByRole("button",{name:"Heel",exact:true}).click();
 await picker.locator(".ppw-wrestler-card").first().click();
 await dialog.getByRole("button",{name:"Next · Script outcome"}).click();
 await dialog.getByLabel("Angle duration (minutes)").selectOption("20");
 const choice=dialog.locator(".ppw-booking-choice-panel");
 await expect(choice).toContainText("Emma Cross");
 await expect(choice).toContainText("Samoa Joe");
 await choice.getByRole("button",{name:"Shorten scene to 10 min"}).click();
 await expect(dialog.getByLabel("Angle duration (minutes)")).toHaveValue("10");
 await expect(choice).toHaveCount(0);
 await dialog.getByRole("button",{name:"Next · Staff briefing"}).click();
 await expect(dialog.locator(".ppw-guide-staff-review"))
  .not.toContainText("Long scene, limited presentation strength");
 await dialog.getByRole("button",{name:"Complete angle"}).click();
 expect(saved).toHaveLength(0);
 expect(calls.filter(x=>x==="talent")).toHaveLength(1);
});
