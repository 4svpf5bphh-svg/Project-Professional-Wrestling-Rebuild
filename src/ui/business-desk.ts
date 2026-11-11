import {activateWorkspaceRoot} from "./workspace-root.js";
import type {readBusinessWorkspace} from "../db/business-workspace.js";
import {commercialCompanyName,COMMERCIAL_COMPANIES,broadcasterRatingTarget,partnerResponse,formatTvRating}
 from "../domain/commercial-offers.js";
import {commercialPartnerBrand} from "./commercial-partner-identity.js";
import {assessPromotionSpendingPlan,type PromotionSpendingPlan}
 from "../domain/promotion-spending-plan.js";
import type {previewHumanPromotionRestructure} from "../db/human-promotion-restructuring.js";
import {recommendPromotionBudgets,type BudgetRisk} from "../domain/financial-adviser.js";
import {broadcasterReaction} from "../domain/broadcast-network-review.js";
export type BusinessView=Awaited<ReturnType<typeof readBusinessWorkspace>>;
export type RescueView=NonNullable<Awaited<ReturnType<typeof previewHumanPromotionRestructure>>>;
export interface BusinessPort{
 load():Promise<BusinessView>;
 renamePromotion?(name:string):Promise<{name:string;changed:boolean}>;
 signCommercial?(input:{requestId:string;expectedRevision:number;offerCode:string}):Promise<unknown>;
 requestBroadcastDay?(input:{requestId:string;expectedRevision:number;dealId:string;requestedDay:number}):Promise<unknown>;
 setSpendingPlan?(input:PromotionSpendingPlan&{requestId:string;expectedRevision:number}):Promise<unknown>;
 previewRestructure?():Promise<RescueView|null>;
 openKayfabe?():void;
 restructure?(input:{requestId:string;expectedRevision:number}):
  Promise<{status:"APPLIED"|"REPLAYED"|"STALE";revision:number}>;
 openResults?(showId:string):void;
 returnToResults?():void;
 openRoster?():void;openContracts?():void;openStaff?():void;
 back?():void;
}
const el=(tag:string,cls="",content="")=>{
 const x=document.createElement(tag);x.className=cls;x.textContent=content;return x;
};
const button=(label:string,fn:()=>void,disabled=false)=>{
 const x=el("button","ppw-business-action",label) as HTMLButtonElement;
 x.type="button";x.disabled=disabled;x.onclick=fn;return x;
};
const money=(n:number)=>new Intl.NumberFormat("en-GB",{
 style:"currency",currency:"USD",maximumFractionDigits:0
}).format(n);
const tone=(n:number)=>n>=0?"ppw-positive":"ppw-negative";
/** Read-only company balance-sheet and verified event P&L, no invented revenues. */
export function mountBusinessDesk(root:HTMLElement,port:BusinessPort,
 initialPane:"OVERVIEW"|"FINANCES"|"RATINGS"|"COMMERCIAL"|"STANDING"|
 "ACTIVITY"|"EVENTS"|"TERRITORIES"="OVERVIEW"){
 let view:BusinessView|null=null,error="",loading=false,
  rescue:RescueView|null=null,rescueReviewed=false,rescueBusy=false,
  rescueReceipt:string|null=null,
  pane:"OVERVIEW"|"FINANCES"|"STANDING"|"ACTIVITY"|"EVENTS"|"TERRITORIES"|"COMMERCIAL"|"RATINGS"=initialPane,
  selectedRatingsRivalId:string|null=null,
  commercialBusy=false,commercialNotice="",requestingDayFor:string|null=null,
  chosenBroadcastDay=5,renaming=false,renameBusy=false,
  commercialKind:"BROADCAST"|"SPONSOR"="BROADCAST",
  spendingExpanded=false;
 let spendingDraft:PromotionSpendingPlan|null=null,spendingBusy=false,spendingNotice="";
 let selectedBudget:BudgetRisk|null=null;
 async function refresh(){
  loading=true;draw();
  try{view=await port.load();error="";}
  catch(e){error=e instanceof Error?e.message:"Cannot load your finances";}
  finally{loading=false;draw();}
 }
 async function acceptCommercial(offerCode:string){
  if(commercialBusy||!port.signCommercial||!view)return;
  const term=COMMERCIAL_COMPANIES[offerCode];
  const weekday=term?.preferredDay?
   ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"][term.preferredDay-1]:null;
  const schedule=offerCode.startsWith("BROADCAST_")&&weekday?
   " Your weekly TV shows will be fixed to "+weekday+" at "+term.airtime+
   ". Move conflicting existing bookings before signing.":"";
  if(!window.confirm("Sign this commercial agreement? Its weekly income and distribution apply until the term ends."+
   schedule+" The offer cannot be replaced early."))return;
  commercialBusy=true;error="";commercialNotice="";draw();
  try{
   const result=await port.signCommercial({offerCode,requestId:crypto.randomUUID(),
    expectedRevision:view.worldRevision});
   const receipt=result as {status?:string;result?:{accepted?:boolean}};
   if(receipt.status==="STALE"){
    error="The World changed before you signed. Review current offers.";await refresh();
   }else if(receipt.status==="APPLIED"||receipt.status==="REPLAYED"){
    await refresh();commercialNotice="Commercial agreement signed. It will settle with your normal weekly accounts.";
   }else error="The agreement was not accepted.";
  }catch(e){error=e instanceof Error?e.message:"Agreement could not be signed";}
  finally{commercialBusy=false;draw();}
 }
 async function sendBroadcastDayRequest(dealId:string){
  if(commercialBusy||!port.requestBroadcastDay||!view)return;
  const current=view.commercialAgreements.find(x=>x.dealId===dealId);
  if(!current||current.kind!=="BROADCAST"||current.airingDay===chosenBroadcastDay)return;
  const dayName=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"][chosenBroadcastDay-1];
  if(!window.confirm("Request "+dayName+" from your network? The network permits one approved day change per contract."+
   " Any unsubmitted TV cards will move with the slot and need to be marked ready again."))return;
  commercialBusy=true;error="";commercialNotice="";draw();
  try{
   const response=await port.requestBroadcastDay({dealId,requestedDay:chosenBroadcastDay,
    requestId:crypto.randomUUID(),expectedRevision:view.worldRevision}) as
    {status?:string;result?:{networkResponse?:string}};
   if(response.status==="STALE"){
    error="The World changed. Review your broadcaster's terms and try again.";
    await refresh();
   }else if(response.status==="APPLIED"||response.status==="REPLAYED"){
    requestingDayFor=null;await refresh();
    commercialNotice=response.result?.networkResponse??
     "Your broadcaster approved the new weekly TV day.";
   }else error="Your network did not approve the day change.";
  }catch(e){error=e instanceof Error?e.message:"The day-change request was refused.";}
  finally{commercialBusy=false;draw();}
 }
 async function reviewRescue(){
  if(rescueBusy||!port.previewRestructure)return;
  rescueBusy=true;error="";draw();
  try{
   rescue=await port.previewRestructure();rescueReviewed=true;
   rescueReceipt=rescue?crypto.randomUUID():null;
  }catch(e){error=e instanceof Error?e.message:"Cannot review restructuring";}
  finally{rescueBusy=false;draw();}
 }
 async function approveRescue(){
  if(rescueBusy||!rescue||!rescueReceipt||!port.restructure)return;
  const names=rescue.releases.map(p=>p.name).join(", ");
  if(!window.confirm("Confirm voluntary restructuring for "+view?.name+
   "? This changes weekly overhead and event cadence, withdraws pending offers"+
   (names?", and terminates contracts for "+names:"")+
   ". Contract settlements are paid immediately. This cannot be undone."))return;
  rescueBusy=true;error="";draw();
  try{
   const outcome=await port.restructure({requestId:rescueReceipt,
    expectedRevision:rescue.worldRevision});
   if(outcome.status==="STALE"){
    rescue=null;rescueReviewed=false;rescueReceipt=null;
    error="Your World has changed. Review the restructuring plan again.";
   }else{
    rescue=null;rescueReviewed=false;rescueReceipt=null;
    await refresh();
   }
  }catch(e){error=e instanceof Error?e.message:"Restructuring was not applied";}
  finally{rescueBusy=false;draw();}
 }
 async function saveSpendingPlan(){
  if(!view||!port.setSpendingPlan||!spendingDraft||spendingBusy)return;
  const plan=spendingDraft;
  try{assessPromotionSpendingPlan(plan,{cash:view.cash,
   weeklyGuarantees:view.weeklyGuarantees});}
  catch(e){error=e instanceof Error?e.message:"Invalid spending allocations";draw();return;}
  spendingBusy=true;error="";spendingNotice="";draw();
  let accepted=false;
  try{
   const r=await port.setSpendingPlan({...plan,requestId:crypto.randomUUID(),
    expectedRevision:view.worldRevision}) as {status?:string};
   if(r.status==="STALE")throw new Error("The World changed. Review your limits again.");
   if(r.status!=="APPLIED"&&r.status!=="REPLAYED")
    throw new Error("Spending plan was not confirmed. Please review before retrying.");
   accepted=true;
   // A confirmed save is not enough: read back the authoritative figures.
   // Rendering must not re-create a draft from stale suggestions mid-refresh.
   const latest=await port.load();
   const saved=latest.spendingPlan;
   if(!saved||saved.weeklyWageLimit!==plan.weeklyWageLimit||
    saved.showTalentLimit!==plan.showTalentLimit||
    saved.cashReserve!==plan.cashReserve)
    throw new Error("The saved figures were not confirmed on refresh.");
   view=latest;spendingDraft=null;error="";
   spendingNotice="Your spending allocations are saved.";
  }catch(e){
   error=accepted?
    "The server accepted your spending plan, but the refreshed values could not be verified. Reload Business before submitting again.":
    e instanceof Error?e.message:"Spending plan was not saved";
  }finally{spendingBusy=false;draw();}
 }
 function metric(caption:string,value:string,additional=""){
  const card=el("div","ppw-business-metric");
  card.append(el("span","",caption),el("strong","",value));
  if(additional)card.append(el("small","",additional));
  return card;
 }
 function draw(){
  activateWorkspaceRoot(root,"ppw-business");root.replaceChildren();
  const ratingsFocused=pane==="RATINGS";
  root.classList.toggle("ppw-business-ratings-focused",ratingsFocused);
  const head=el("header","ppw-business-head");
  head.append(el("span","ppw-business-kicker","THE FRONT OFFICE"),
   el("h1","",pane==="OVERVIEW"?"Business":
    ({FINANCES:"Finances",COMMERCIAL:"Commercials",RATINGS:"Ratings War",
      STANDING:"Company Standing",ACTIVITY:"Financial Activity",
      EVENTS:"Event Accounts",TERRITORIES:"Territories"} as const)[pane]),
   el("p","ppw-business-muted",
    view?view.name+" · "+(view.homeMarketName?
      "Based in "+view.homeMarketName+" · ":"")+
      "Year "+view.year+" / Week "+view.week:
     "Your latest accounts, show takings and strength in each territory."));
  if(port.back)head.prepend(button("← Back",()=>port.back?.()));

  if(pane==="OVERVIEW"&&port.renamePromotion&&view){
   head.append(button("Rename promotion",()=>{renaming=!renaming;draw();}));
  }
  if(ratingsFocused){
   const returnNav=el("nav","ppw-ratings-war-return");
   returnNav.setAttribute("aria-label","Ratings War navigation");
   if(port.returnToResults)
    returnNav.append(button("← Ringside Results",()=>port.returnToResults?.()));
   returnNav.append(button("← Business",()=>{
    pane="OVERVIEW";
    if(["#/business/ratings","#/ratings-war"].includes(window.location.hash))
     window.history.replaceState(null,"","#/business");
    draw();
   }));
   root.append(returnNav);
  }else root.append(head);
  if(!ratingsFocused&&renaming&&view&&port.renamePromotion){
   const panel=el("section","ppw-business-panel");
   panel.append(el("h2","","Promotion identity"),
    el("p","ppw-business-muted",
     "Choose a new name. Titles, contracts, booked events and certified history remain attached to the same promotion."));
   const form=document.createElement("form");
   form.className="ppw-business-rename";
   const input=document.createElement("input");input.type="text";input.value=view.name;
   input.maxLength=56;input.minLength=3;input.required=true;
   input.setAttribute("aria-label","New promotion name");
   const save=document.createElement("button");save.type="submit";
   save.className="ppw-business-action";save.textContent="Save new name";
   const cancel=button("Cancel",()=>{renaming=false;draw();});
   form.append(input,save,cancel);
   form.onsubmit=async event=>{
    event.preventDefault();
    if(renameBusy||!port.renamePromotion)return;
    renameBusy=true;save.disabled=true;
    try{
     const changed=await port.renamePromotion(input.value);
     renaming=false;
     await refresh();
     commercialNotice=changed.changed?
      "Promotion renamed. Existing title and show history are preserved.":
      "Promotion name unchanged.";
     window.dispatchEvent(new Event("ppw:promotion-renamed"));
    }catch(e){error=e instanceof Error?e.message:"Could not rename promotion";draw();}
    finally{renameBusy=false;save.disabled=false;}
   };
   panel.append(form);root.append(panel);
  }
  if(error)root.append(el("p","ppw-alert ppw-error",error));
  if(commercialNotice)root.append(el("p","ppw-alert ppw-success",commercialNotice));
  if(!view){if(!loading)root.append(button("Retry",()=>void refresh()));return;}
  if(pane==="OVERVIEW"){
   // The eight dedicated desks are reached from the Business drawer. The
   // company page is for identity and a concise snapshot, not another menu.
   const company=el("section","ppw-business-company");
   company.append(el("span","ppw-business-kicker","YOUR PROMOTION"),
    el("h2","",view.name),
    el("p","ppw-business-muted",
     [view.tier,view.homeMarketName??""].filter(Boolean).join(" · ")));
   const facts=el("div","ppw-business-company-facts");
   for(const [label,value] of [
    ["BANK",money(view.cash)],["DEBT",money(view.debt)],
    ["WEEKLY MEDIA",view.weeklyMediaIncome===null?"—":money(view.weeklyMediaIncome)],
    ["WEEKLY SPONSORS",view.weeklySponsorIncome===null?"—":money(view.weeklySponsorIncome)]
   ] as const){
    const cell=el("div","ppw-business-company-fact");
    cell.append(el("small","",label),el("strong","",value));
    facts.append(cell);
   }
   company.append(facts,el("p","ppw-business-muted",
    "Open the Business menu below for Finances, Commercials, Ratings War, Staff Office and your other reports."));
   root.append(company);return;
  }
  if(pane!=="RATINGS"){
   const nav=el("nav","ppw-business-back-nav");
   nav.setAttribute("aria-label","Business navigation");
   nav.append(button("← Business",()=>{
    pane="OVERVIEW";
    window.history.replaceState(null,"","#/business");
    draw();
   }));
   root.append(nav);
  }
  if(pane==="FINANCES"){
   const weeklyIncome=view.weeklyMediaIncome!=null&&view.weeklySponsorIncome!=null?
    view.weeklyMediaIncome+view.weeklySponsorIncome:null;
   const fixedWeekly=view.weeklyFixedOverhead!=null?
    view.weeklyFixedOverhead+view.weeklyGuarantees+view.weeklyStaffPayroll:null;
   const bank=el("section","ppw-finance-first");
   bank.append(el("span","ppw-business-kicker","YOUR COMPANY / YOUR MONEY"),
    el("h2","","Financial position"));
   const balance=el("div","ppw-finance-bank");
   balance.append(el("small","","Cash in the bank"),
    el("strong","",money(view.cash)));
   bank.append(balance);
   const snapshot=el("div","ppw-finance-snapshot");
   const item=(caption:string,figure:string,help:string)=>{
    const tile=el("div","ppw-finance-snapshot-tile");
    tile.append(el("span","",caption),el("strong","",figure),
     el("small","",help));return tile;
   };
   snapshot.append(
    item("Weekly income",weeklyIncome===null?"Not reported":money(weeklyIncome),
     "Confirmed network + sponsor"),
    item("Weekly commitments",fixedWeekly===null?"Not reported":money(fixedWeekly),
     "Wages, staff and overhead"),
    item("Operating room",view.recurringMargin===null?"Not reported":
     money(view.recurringMargin),"Before show income and costs"),
    item("Last week net",view.lastWeeklyNet===null?"Not settled":
     money(view.lastWeeklyNet),"After the last weekly settlement"));
   bank.append(snapshot);
   // Full-term roster exposure remains available in Contracts, where it is actionable.
   if(view.debt>0)bank.append(el("p","ppw-finance-debt",
    "Outstanding debt · "+money(view.debt)));
   const actions=el("div","ppw-finance-first-actions");
   if(port.openContracts)actions.append(button("Manage roster costs",
    ()=>port.openContracts?.()));
   actions.append(button(spendingExpanded?"Close spending limits":
    "Manage spending limits",()=>{spendingExpanded=!spendingExpanded;draw();}));
   bank.append(actions);
   root.append(bank);
   const advice=recommendPromotionBudgets({
    cash:view.cash,debt:view.debt,
    weeklyMediaIncome:view.weeklyMediaIncome,
    weeklySponsorIncome:view.weeklySponsorIncome,
    weeklyFixedOverhead:view.weeklyFixedOverhead,
    weeklyStaffPayroll:view.weeklyStaffPayroll,
    weeklyGuarantees:view.weeklyGuarantees,
    recentShowAppearanceFees:view.shows[0]?.appearanceFees??0,
    recentShowTotalCost:view.shows[0]?.totalCost??null,
    recentShowGateRevenue:view.shows[0]?.gateRevenue??null,
    lastWeeklyNet:view.lastWeeklyNet
   });
   const plan=spendingDraft??view.spendingPlan??
    advice.scenarios.find(x=>x.id==="STABLE")!.plan;
   const budget=el("section","ppw-business-budget");
   budget.append(el("span","ppw-business-kicker","YOUR TALENT MANAGER / FINANCE"),
    el("h2","","Set your spending limits"),
    el("p","ppw-business-muted",
     "Choose a budget, then adjust any figure. Your limits guide decisions, not block bookings."));
   const adviser=el("section","ppw-business-budget-adviser");
   adviser.append(el("strong","","Talent Manager · Budget advice"),
    el("p","",advice.summary));
   const presets=el("div","ppw-business-budget-presets");
   presets.setAttribute("role","group");
   presets.setAttribute("aria-label","Talent Manager budget options");
   const presetButtons=new Map<BudgetRisk,HTMLButtonElement>();
   for(const recommendation of advice.scenarios){
    const choice=button(recommendation.label,()=>{
     selectedBudget=recommendation.id;
     spendingDraft={...recommendation.plan};spendingNotice="";
     for(const [key,input] of inputByKey)input.value=String(spendingDraft[key]);
     for(const [id,node] of presetButtons)
      node.setAttribute("aria-pressed",String(id===selectedBudget));
     refreshPreview();
    });
    choice.className+=" ppw-business-budget-preset";
    choice.dataset.risk=recommendation.id;
    choice.setAttribute("aria-pressed",String(selectedBudget===recommendation.id));
    choice.append(el("small","",recommendation.description));
    choice.disabled=spendingBusy;
    presetButtons.set(recommendation.id,choice);presets.append(choice);
   }
   adviser.append(presets);
   budget.append(adviser);
   // Keep one authoritative money snapshot above. Budgets are optional player limits,
   // not extra accounts or funds reserved by the server.
   const fields=el("div","ppw-business-budget-fields");
   const inputByKey=new Map<keyof PromotionSpendingPlan,HTMLInputElement>();
   const preview=el("div","ppw-business-budget-preview");
   const save=button("Save spending plan",()=>void saveSpendingPlan());
   const refreshPreview=()=>{
    try{
     const check=assessPromotionSpendingPlan(spendingDraft??plan,{
      cash:view!.cash,weeklyGuarantees:view!.weeklyGuarantees});
     preview.textContent="Weekly wages: "+money(view!.weeklyGuarantees)+
      " committed · "+(check.wageRoom>=0?money(check.wageRoom)+" available":
      money(-check.wageRoom)+" over your limit")+
      " · "+money(check.unreservedCash)+" cash above reserve.";
     preview.dataset.risk=String(check.wageRoom<0||check.reserveAtRisk);
     save.disabled=spendingBusy;
    }catch{preview.textContent="Enter non-negative amounts up to $1 billion.";save.disabled=true;}
   };
   for(const [label,key,help] of [
    ["Weekly wrestler wages","weeklyWageLimit","Guaranteed contract wages only"],
    ["Talent per show","showTalentLimit","Appearance-fee allowance per event"],
    ["Cash reserve","cashReserve","Money you intend to keep available"]
   ] as const){
    const field=el("label","ppw-business-budget-field");
    field.append(el("span","",label),el("small","",help));
    const input=document.createElement("input");input.type="number";
    input.min="0";input.max="1000000000";input.step="1000";
    input.inputMode="numeric";input.value=String(plan[key]);
    input.setAttribute("aria-label",label);
    input.oninput=()=>{spendingDraft={...(spendingDraft??plan),[key]:Number(input.value)};
     selectedBudget=null;spendingNotice="";
     for(const node of presetButtons.values())node.setAttribute("aria-pressed","false");
     refreshPreview();};
    input.disabled=spendingBusy;inputByKey.set(key,input);
    field.append(input);fields.append(field);
   }
   budget.append(fields,preview);
   // Recruiting shows the same package-cost and affordability model in context.
   // A second five-field contract calculator here was duplicating that decision.
   if(port.openRoster)budget.append(button("Explore wrestler signings",()=>port.openRoster?.()));

   if(spendingNotice)budget.append(el("p","ppw-business-budget-saved",spendingNotice));
   if(port.setSpendingPlan)budget.append(save);
   refreshPreview();
   if(spendingExpanded)root.append(budget);
   // Context from the existing workspace, never a projection of future
   // bookings, ticket sales or the next World settlement.
   const overview=document.createElement("details");overview.className="ppw-business-pulse";
   const risk=view.financialDistress,margin=view.recurringMargin;
   overview.dataset.health=risk==="DISTRESSED"||risk==="CRISIS"?"warning":
    risk==="WATCH"?"watch":"normal";
   overview.append(el("summary","","Talent Manager · Financial outlook"));
   const headline=margin===null?
    "Recurring operating margin is not configured yet.":
    margin>=0?
     "Recurring income covers regular commitments by "+money(margin)+" per week.":
     "Regular commitments exceed recurring income by "+money(-margin)+" per week.";
   if(risk==="DISTRESSED"||risk==="CRISIS"||risk==="WATCH")overview.open=true;
   overview.append(el("span","ppw-business-kicker","TALENT MANAGER / FINANCIAL REVIEW"),
    el("strong","ppw-business-pulse-headline",headline));
   const context=risk==="CRISIS"||risk==="DISTRESSED"?
    "The company is under sustained financial pressure. Review spending and show returns before committing to new costs.":
    risk==="WATCH"?
    "Your financial position needs monitoring. A strong event can help, but its takings are not guaranteed.":
    "This is a baseline before event takings, venue costs and irregular contract settlements — not a profit forecast.";
   overview.append(el("p","ppw-business-muted",context));
   if(view.runwayWeeks!==null&&view.runwayWeeks<10)
    overview.append(el("p","ppw-business-runway-warning",
     "Current cash-runway estimate: "+view.runwayWeeks.toFixed(1)+
      " weeks at the recently observed rate. This is not a deadline or a Game Over."));
   root.append(overview);
   const cards=el("section","ppw-business-grid");
   cards.append(metric("HOME TERRITORY",view.homeMarketName??"Not designated"),
    metric("BROADCAST REACH",view.mediaReach==null?"Not reported":
     Math.round(view.mediaReach).toLocaleString("en-GB")),
    metric("BASE WEEKLY OVERHEAD",view.weeklyFixedOverhead===null?
     "Not configured":money(view.weeklyFixedOverhead)),
    metric("WEEKLY CONTRACT WAGES",money(view.weeklyGuarantees)));
   root.append(cards);
   const flow=el("section","ppw-business-panel");
   flow.append(el("h2","","Weekly commitments"),
    el("p","ppw-business-muted",
     "Recurring base only, not a promise of future profits. Upcoming show results and one-time contract costs are excluded."));
   for(const [label,n] of [
    ["Media income",view.weeklyMediaIncome],
    ["Sponsorship",view.weeklySponsorIncome],
    ["Fixed overhead",view.weeklyFixedOverhead===null?null:-view.weeklyFixedOverhead],
    ["Signed talent guarantees",-view.weeklyGuarantees],
    ["Talent office wages",-view.weeklyStaffPayroll]
   ] as const){
    const line=el("div","ppw-business-line");
    line.append(el("span","",label),el("strong","",n===null?"Not configured":money(n)));
    flow.append(line);
   }
   const total=el("div","ppw-business-line ppw-business-total");
   total.append(el("span","","Recurring margin before events and variable costs"),
    el("strong",tone(view.recurringMargin??0),
     view.recurringMargin===null?"Not configured":money(view.recurringMargin)));
   flow.append(total);
   const breakdown=document.createElement("details");
   breakdown.className="ppw-business-breakdown";
   breakdown.append(el("summary","","View weekly income and commitments"),flow);
   root.append(breakdown);
   if((view.financialDistress==="DISTRESSED"||
      view.financialDistress==="CRISIS")&&port.previewRestructure){
    const panel=el("section","ppw-business-panel");
    panel.append(el("h2","","Financial recovery"),
     el("p","ppw-business-muted",
      "Your promotion is under sustained financial pressure. You remain in charge. Restructuring is a decision, not an automatic takeover."));
    if(!rescueReviewed){
     panel.append(button(rescueBusy?"Checking the accounts…":
      "Review restructuring options",()=>void reviewRescue()));
    }else if(!rescue){
     panel.append(el("p","ppw-business-muted",
      "An immediate restructuring is not due. Continue reviewing your commitments and trading position."));
    }else{
     panel.append(el("p","ppw-business-muted",
      "Stress: "+rescue.stressWeeks+" weeks · Minimum viable roster: "+
      rescue.minimumViableRoster+". These are the precise changes awaiting approval."));
     for(const [label,before,after] of [
      ["Weekly overhead",money(rescue.oldOverhead),money(rescue.newOverhead)],
      ["Normal show cadence",String(rescue.oldCadence)+" weeks",
       String(rescue.newCadence)+" weeks"]
     ] as const){
      const line=el("div","ppw-business-line");
      line.append(el("span","",label),
       el("strong","",before+" → "+after));panel.append(line);
     }
     if(rescue.releases.length){
      panel.append(el("h3","","Contracts to terminate"));
      for(const person of rescue.releases){
       const line=el("div","ppw-business-line");
       line.append(el("span","",person.name),
        el("strong","",money(person.settlement)+" settlement"));
       panel.append(line);
      }
     }else panel.append(el("p","ppw-business-muted",
      "Your current roster is already at or below its safe minimum. No contracts are being terminated."));
     const actions=el("div","ppw-business-actions");
     actions.append(button(rescueBusy?"Applying…":"Approve restructuring",
      ()=>void approveRescue()),
      button("Cancel",()=>{rescue=null;rescueReviewed=false;
       rescueReceipt=null;draw();}));
     panel.append(actions);
    }
    root.append(panel);
   }
  }
  if(pane==="STANDING"){
   const section=el("section","ppw-business-panel ppw-business-standing");
   section.append(el("h2","","Company standing"),
    el("p","ppw-business-muted",
     "Your promotion's official standing in the wrestling industry. Ratings change at the annual review."));
   if(view.creativeIdentity){
    const identity=el("article","ppw-business-standing-card");
    identity.append(el("span","","EARNED WRESTLING IDENTITY"),
     el("h3","",view.creativeIdentity.title),
     el("p","ppw-business-muted",view.creativeIdentity.description+
      " Based on "+view.creativeIdentity.sampleMatches+
      " matches across "+view.creativeIdentity.completedShows+" completed shows."));
    section.append(identity);
   }else section.append(el("p","ppw-business-muted",
    "Your in-ring identity emerges from completed matches. Book your shows your way; there's no style selection or penalty."));
   if(!view.standing){
    section.append(el("p","ppw-business-muted",
     "No verified company standing is recorded for this world."));
   }else{
    const score=el("div","ppw-business-standing-grid");
    for(const [label,value,description] of [
     ["Prestige",view.standing.prestige,"Your promotion's standing in the industry"],
     ["Fan reputation",view.standing.fanReputation,"Your reputation with wrestling fans"],
     ["Business reputation",view.standing.businessReputation,"Confidence in how the company operates"],
     ["Talent reputation",view.standing.talentReputation,"How wrestlers view the promotion"]
    ] as const){
     const tile=el("article","ppw-business-standing-card");
     tile.append(el("span","",label),
      el("strong","",value.toLocaleString("en-GB",{maximumFractionDigits:1})+" / 100"),
      el("small","",description));
     const meter=el("div","ppw-business-meter");
     const fill=el("span","");
     fill.style.width=Math.max(0,Math.min(100,value))+"%";
     meter.append(fill);tile.append(meter);score.append(tile);
    }
    section.append(score,el("p","ppw-business-muted",
     view.standing.lastEvaluatedYear===0
      ?"Opening standing · first annual review has not taken place"
      :"Last evaluated: Year "+view.standing.lastEvaluatedYear));
   }
   root.append(section);
  }
  if(pane==="ACTIVITY"){
   const section=el("section","ppw-business-panel");
   section.append(el("h2","","Four-week activity"),
    el("p","ppw-business-muted",
     "Recorded money in and out over the current and previous three weeks. These are settled receipts, not forecasts."));
   const figures=el("div","ppw-business-event-stats");
   for(const [label,amount,note] of [
    ["INCOME",view.rollingFourWeeks.income,"Recorded receipts"],
    ["SPENDING",view.rollingFourWeeks.spending,"Actual payments"],
    ["NET",view.rollingFourWeeks.net,"Combined cash movement"]
   ] as const){
    const tile=el("article","ppw-business-event-stat");
    tile.append(el("span","",label),el("strong",
     label==="NET"?tone(amount):"",money(amount)),el("small","",note));
    figures.append(tile);
   }
   section.append(figures);
   const labels:Record<string,string>={
    MEDIA_INCOME:"Broadcast income",SPONSOR_INCOME:"Sponsorship",
    PERFORMANCE_BONUS:"Certified-show commercial reward",
    FIXED_OVERHEAD:"Fixed overhead",STAFF_SALARY:"Staff salaries",
    STAFF_BUYOUT:"Staff contract buyouts",
    CONTRACT_GUARANTEE:"Talent guarantees",
    RESTRUCTURING_SETTLEMENT:"Contract restructuring settlements",
    CONTRACT_SIGNING_BONUS:"Signing bonuses",
    EXTRA_DATES:"Additional contract dates",APPEARANCE_FEE:"Appearance fees",
    GATE_REVENUE:"Ticket sales",VENUE_COST:"Venue hire",
    PRODUCTION_COST:"Production",TRAVEL_COST:"Travel"
   };
   const name=(c:string)=>labels[c]??c.replaceAll("_"," ").toLowerCase();
   section.append(el("h3","","By category"));
   if(!view.rollingFourWeeks.byCategory.length)section.append(
    el("p","ppw-business-muted",
     "There are no recorded payments or takings for this period."));
   for(const entry of view.rollingFourWeeks.byCategory){
    const line=el("div","ppw-business-line");
    line.append(el("span","",name(entry.category)),
     el("strong",tone(entry.amount),money(entry.amount)));
    section.append(line);
   }
   section.append(el("h3","","Recent transactions"),
    el("p","ppw-business-muted",
     "Latest eight individual accounting entries, drawn from settled cash receipts."));
   if(!view.recentTransactions.length)section.append(
    el("p","ppw-business-muted","No recent transactions recorded."));
   for(const entry of view.recentTransactions){
    const line=el("div","ppw-business-line");
    line.append(el("span","",name(entry.category)+
     " · Y"+entry.year+" W"+entry.week),
     el("strong",tone(entry.amount),money(entry.amount)));
    section.append(line);
   }
   root.append(section);
  }
  if(pane==="EVENTS"){
   const section=el("section","ppw-business-panel");
   section.append(el("h2","","Recent settled events"),
    el("p","ppw-business-muted",
     "Your 12 most recent shows. Ticket income, venue hire and production spending are reflected in each week's accounts."));
   if(!view.shows.length)section.append(el("p","ppw-business-muted",
    "Your first show's takings will appear here after the event."));
   if(view.shows.length){
    // Every number below is calculated from the 12 already-loaded receipts.
    // Do not confuse operating result with actual incremental cash effect.
    const events=view.shows;
    const sample=events.length;
    const stats=el("div","ppw-business-event-stats");
    const total=(key:"gateRevenue"|"netResult"|"incrementalCash")=>
     events.reduce((sum,show)=>sum+show[key],0);
    const cells:[string,string,string][]=[
     ["SHOWS",String(sample),"Last "+sample+" completed events"],
     ["GATE TAKINGS",money(total("gateRevenue")),"Ticket receipts"],
     ["EVENT RESULT",money(total("netResult")),"Before other company costs"],
     ["CASH EFFECT",money(total("incrementalCash")),"Change to the company balance"]
    ];
    for(const [title,number,note] of cells){
     const tile=el("article","ppw-business-event-stat");
     tile.append(el("span","",title),
      el("strong",title==="EVENT RESULT"||title==="CASH EFFECT"?
       tone(title==="EVENT RESULT"?total("netResult"):total("incrementalCash")):"",number),
      el("small","",note));
     stats.append(tile);
    }
    section.append(stats);
    const panel=el("section","ppw-business-trend");
    panel.append(el("h3","","Event performance"),
     el("p","ppw-business-muted",
      "Every event at a glance. Select one for tickets, production, appearance fees and the full breakdown."));
    const scroll=el("div","ppw-business-trend-scroll");
    scroll.setAttribute("role","group");
    scroll.setAttribute("aria-label","Event profit and loss");
    const bars=el("div","ppw-business-trend-bars");
    for(const show of [...events].reverse()){
     const pick=el("button","ppw-business-trend-pick") as HTMLButtonElement;
     pick.type="button";
     pick.setAttribute("aria-label",show.name+
      ", Year "+show.year+" Week "+show.week+", net "+money(show.netResult));
     pick.onclick=()=>{
      const match=[...section.querySelectorAll<HTMLDetailsElement>("details.ppw-business-show")]
       .find(x=>x.dataset.showId===show.showId);
      if(match){match.open=true;match.scrollIntoView({
       behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth",
       block:"center"});}
     };
      pick.append(el("strong","ppw-business-trend-name",show.name),
      el("small","ppw-business-trend-week","Y"+show.year+" W"+show.week),
      el("small","ppw-business-trend-value "+tone(show.netResult),
       money(show.netResult)));
     bars.append(pick);
    }
    scroll.append(bars);panel.append(scroll);section.append(panel);
   }
   for(const show of view.shows){
    const card=document.createElement("details");
    card.className="ppw-business-show";card.dataset.showId=show.showId;
    const summary=el("summary","");
    summary.append(el("strong","",show.name),
     el("span","ppw-business-muted","Y"+show.year+" W"+show.week+
      " · "+show.attendance.toLocaleString("en-GB")+" attended"),
     el("b",tone(show.netResult),money(show.netResult)));
    if(show.audience?.format==="TV"&&show.audience.householdRating!==null){
     summary.append(el("span","ppw-business-audience-mini",
      formatTvRating(show.audience.householdRating)+" TV rating"));
    }else if(show.audience?.format==="PPV"&&show.audience.ppvBuys!==null){
     summary.append(el("span","ppw-business-audience-mini",
      show.audience.ppvBuys.toLocaleString("en-GB")+" PPV buys"));
    }
    card.append(summary);
    const body=el("div","ppw-business-show-detail");
    for(const [label,n] of [
     ["Gate revenue",show.gateRevenue],["Venue",-show.venueCost],
     ["Production",-show.productionCost],["Travel",-show.travelCost],
     ["Appearance fees",-show.appearanceFees],
     ["Total event costs",-show.totalCost],
     ["Actual cash effect",show.incrementalCash]
    ] as const){
     const line=el("div","ppw-business-line");
     line.append(el("span","",label),el("strong","",money(n)));body.append(line);
    }
    body.append(el("p","ppw-business-muted",
     "Show profit or loss includes wrestler appearance fees already paid earlier in the World settlement. Cash effect shows only the amount posted when this event's remaining bills and ticket receipts settled. Use the overall weekly balance for your total company profit or loss."));
    if(port.openResults)body.append(button("Open broadcast results →",
     ()=>port.openResults?.(show.showId)));
    card.append(body);section.append(card);
   }
   root.append(section);
  }

  if(pane==="RATINGS"){
   // The existing bounded six-week competitor read is public certified World
   // audience data. All filters, head-to-head choices and graphs are local.
   const section=el("section","ppw-ratings-war-desk");
   section.dataset.kind="certified-tv";
   const header=el("header","ppw-ratings-war-head");
   header.append(el("span","ppw-business-kicker","PPW / BROADCAST BATTLE"),
    el("h2","","Ratings War"),
    el("p","ppw-business-muted",
     "Latest certified TV episode per promotion · past six weeks"));
   section.append(header);
   // Small human promotions compete for genuine attendance, exposure and
   // their circuit standing long before a network sells them a TV slot.
   const circuit=view.competition;
   const rivalry=el("section","ppw-ratings-circuit");
   rivalry.setAttribute("aria-label","Your primary promotion rival");
   rivalry.append(el("span","ppw-business-kicker","PRIMARY PROMOTION RIVAL"));
   if(circuit){
    rivalry.append(el("h3","",view.name+" vs "+circuit.name),
     el("p","ppw-ratings-circuit-sub",
      (circuit.humanManaged?"Human-managed":"AI-managed")+
       " · "+circuit.tier+" · Reviewed Y"+
       (Math.floor(circuit.reviewedWeekIndex/52)+1)+" W"+
       (circuit.reviewedWeekIndex%52+1)));
    const metrics=el("div","ppw-ratings-circuit-metrics");
    const attendees=(n:number|null)=>n===null?"—":
     Math.round(n).toLocaleString("en-GB");
    const pair=(label:string,mine:string,theirs:string)=>{
     const entry=el("div","ppw-ratings-circuit-row");
     entry.append(el("span","",label),el("strong","",mine),
      el("strong","",theirs));return entry;
    };
    const names=el("div","ppw-ratings-circuit-labels");
    names.append(el("b","",view.name),el("b","",circuit.name));
    metrics.append(
     pair("Average attendance",attendees(circuit.ownAvgAttendance),
      attendees(circuit.rivalAvgAttendance)),
     pair("Certified shows",String(circuit.ownShowCount),
      String(circuit.rivalShowCount)),
     pair("Broadcast reach",
      circuit.ownReach===null?"—":String(circuit.ownReach),
      circuit.rivalReach===null?"—":String(circuit.rivalReach)));
    rivalry.append(names,metrics);
    if(circuit.ownAvgAttendance!==null&&circuit.rivalAvgAttendance!==null&&
     circuit.ownShowCount>0&&circuit.rivalShowCount>0){
     const difference=Math.round(
      circuit.ownAvgAttendance-circuit.rivalAvgAttendance);
     rivalry.append(el("p","ppw-ratings-circuit-status",
      difference===0?"Recent attendance is level.":
      difference>0?"You lead by "+difference.toLocaleString("en-GB")+
       " average attendees.":circuit.name+" leads by "+
       Math.abs(difference).toLocaleString("en-GB")+" average attendees."));
    }else rivalry.append(el("p","ppw-ratings-circuit-status",
     "Not enough certified attendance to compare yet."));
    if(circuit.targetName&&circuit.targetName!==circuit.name)
     rivalry.append(el("small","ppw-ratings-circuit-target",
      "NEXT COMPANY TO CATCH · "+circuit.targetName));
    rivalry.append(el("small","ppw-ratings-circuit-disclaimer",
     "Rolling 13-week certified circuit results. Real TV viewers only move "+
     "between programmes sharing an airtime."));
   }else rivalry.append(el("h3","","The circuit is taking shape"),
    el("p","ppw-ratings-circuit-status",
     "The first completed World week will establish your nearest rival."));
   section.append(rivalry);
   const ranking=view.competitorBroadcasts??[];
   const own=ranking.find(episode=>episode.isYours)??null;
   const others=ranking.filter(episode=>!episode.isYours);
   const opponent=others.find(episode=>episode.promotionId===selectedRatingsRivalId)??
    others.find(episode=>episode.promotionId===circuit?.promotionId)??
    // Real same-slot competition is the default comparison over a human
    // promotion airing in a different window.
    others.find(episode=>own&&episode.year===own.year&&
     episode.week===own.week&&episode.day===own.day&&
     episode.airingHour!==null&&episode.airingHour!==undefined&&
     episode.airingHour===own.airingHour&&
     (own.ratingsWarOpponents??0)>0&&(episode.ratingsWarOpponents??0)>0)??
    others.find(episode=>episode.humanManaged)??others[0]??null;
   const ownRank=ranking.findIndex(episode=>episode.isYours);
   const compare=el("section","ppw-ratings-war-faceoff");
   compare.setAttribute("aria-label","Certified TV ratings comparison");
   const cards=el("div","ppw-ratings-war-faceoff-scores");
   const scoreCard=(name:string,rating:number|null,kind:"OWNER"|"RIVAL")=>{
    const tile=el("div","ppw-ratings-war-score");
    tile.dataset.side=kind;
    tile.append(el("span","",kind==="OWNER"?"YOUR PROMOTION":"CHALLENGER"),
     el("strong","ppw-ratings-war-promotion",name),
     el("b","ppw-ratings-war-rating",rating===null?"—":formatTvRating(rating)),
     el("small","",rating===null?"No recent certified TV result":"HOUSEHOLD RATING"));
    return tile;
   };
   cards.append(scoreCard(own?.name??view.name,own?.householdRating??null,"OWNER"),
    el("span","ppw-ratings-war-versus","VS"),
    scoreCard(opponent?.name??"No challenger recorded",
     opponent?.householdRating??null,"RIVAL"));
   if(opponent?.humanManaged)
    cards.lastElementChild?.prepend(el("small","ppw-ratings-war-human-label",
     "HUMAN MANAGER"));
   compare.append(cards);
   if(own&&opponent){
    const difference=own.householdRating-opponent.householdRating;
    const score=Math.abs(difference).toFixed(1);
    compare.append(el("p","ppw-ratings-war-result",difference===0?
     "Latest broadcasts are level on household rating.":
     difference>0?"You're ahead by "+score+" rating points.":
      opponent.name+" leads by "+score+" rating points."));
    const sameWeek=own.year===opponent.year&&own.week===opponent.week;
    const sameSlot=sameWeek&&own.day===opponent.day&&
     own.airingHour!==null&&own.airingHour!==undefined&&
     own.airingHour===opponent.airingHour&&
     (own.ratingsWarOpponents??0)>0&&(opponent.ratingsWarOpponents??0)>0;
    if(sameSlot)
     compare.append(el("small","ppw-ratings-war-note",
      "HEAD-TO-HEAD · Same night, same broadcast hour. These ratings include audience competition."));
    else if(!sameWeek)
     compare.append(el("small","ppw-ratings-war-note",
      "Latest episodes aired in different weeks; this is not a same-slot result."));
    else compare.append(el("small","ppw-ratings-war-note",
      "Different broadcast slots. This is a standings comparison, not a live audience clash."));
    if((own.ratingsWarOpponents??0)>0&&typeof own.ratingsWarChange==="number"){
     const change=own.ratingsWarChange;
     compare.append(el("p","ppw-ratings-war-impact",
      change>0?"YOU GAINED "+change.toFixed(1)+" RATING POINTS IN YOUR AIRTIME BATTLE":
      change<0?"YOU LOST "+Math.abs(change).toFixed(1)+" RATING POINTS IN YOUR AIRTIME BATTLE":
      "YOUR LATEST AIRTIME BATTLE ENDED EVEN"));
    }
   }else compare.append(el("p","ppw-ratings-war-result",
    "Compare audiences once you and another promotion have certified TV results."));
   section.append(compare);
   if(ownRank>=0){
    const position=el("p","ppw-ratings-war-standings",
     "YOUR POSITION  ·  #"+(ownRank+1)+" OF "+ranking.length+
     " RECENT BROADCASTERS");
    section.append(position);
   }
   const episodes=view.shows.filter(show=>
    show.audience?.format==="TV"&&typeof show.audience.householdRating==="number")
    .slice(0,6).reverse();
   const trend=el("section","ppw-ratings-war-trend");
   trend.append(el("h3","","Your last six TV broadcasts"));
   if(!episodes.length)trend.append(el("p","ppw-business-muted",
    "Your first certified TV rating will appear after a completed broadcast."));
   else{
    const highest=Math.max(.1,...episodes.map(e=>e.audience!.householdRating!));
    const bars=el("div","ppw-ratings-war-bars");
    bars.setAttribute("role","list");
    bars.setAttribute("aria-label","Your certified TV ratings history");
    for(const episode of episodes){
     const rating=episode.audience!.householdRating!;
     const bar=el("div","ppw-ratings-war-bar");
     bar.setAttribute("role","listitem");
     bar.setAttribute("aria-label","Year "+episode.year+" Week "+episode.week+
      ", household rating "+formatTvRating(rating));
     bar.append(el("strong","",formatTvRating(rating)));
     const track=el("div","ppw-ratings-war-track");
     const fill=el("span","ppw-ratings-war-fill");
     fill.style.height=Math.max(5,Math.round(rating/highest*100))+"%";
     track.append(fill);bar.append(track,
      el("small","","W"+episode.week));
     bars.append(bar);
    }
    trend.append(bars);
    if(typeof view.averageTvRating==="number"&&view.recentTvEpisodes)
     trend.append(el("p","ppw-ratings-war-average",
      view.recentTvEpisodes+" recent broadcasts · "+
      formatTvRating(view.averageTvRating)+" average TV rating"));
   }
   section.append(trend);
   const board=el("section","ppw-ratings-war-leaderboard");
   board.append(el("h3","","The field"));
   if(!ranking.length)board.append(el("p","ppw-business-muted",
    "No certified TV broadcasts in the last six weeks."));
   const days=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
   // Display the current promotion even when outside the first seven.
   const shown=ranking.slice(0,7);
   if(ownRank>=7)shown.push(ranking[ownRank]!);
   for(const episode of shown){
    const row=el("article","ppw-ratings-war-rival");
    if(episode.isYours)row.dataset.own="true";
    if(episode.humanManaged&&!episode.isYours)row.dataset.human="true";
    if(episode.promotionId===opponent?.promotionId)row.dataset.selected="true";
    const rank=ranking.indexOf(episode)+1;
    const description=el("div","ppw-ratings-war-rival-copy");
    description.append(el("strong","","#"+rank+" · "+episode.name+
     (episode.isYours?" · YOU":episode.humanManaged?" · HUMAN MANAGER":"")),
     el("small","",episode.showName+" · "+(days[(episode.day??0)-1]??"Day unreported")+
      (typeof episode.airingHour==="number"?" "+String(episode.airingHour).padStart(2,"0")+":00":"")+
      " · Y"+episode.year+" W"+episode.week+
      (typeof episode.ratingsWarChange==="number"&&episode.ratingsWarChange!==0?
       " · WAR "+(episode.ratingsWarChange>0?"+":"")+episode.ratingsWarChange.toFixed(1):"")));
    const numbers=el("div","ppw-ratings-war-rival-number");
    numbers.append(el("b","",episode.householdRating.toFixed(1)),
     el("small","",episode.estimatedViewers===null?
      "Household rating":episode.estimatedViewers.toLocaleString("en-GB")+" viewers"));
    row.append(description,numbers);
    if(!episode.isYours){
     const choose=button("Compare",()=>{
      selectedRatingsRivalId=episode.promotionId;draw();
     });
     choose.classList.add("ppw-ratings-war-compare");
     choose.setAttribute("aria-label","Compare against "+episode.name);
     choose.setAttribute("aria-pressed",
      String(episode.promotionId===opponent?.promotionId));
     row.append(choose);
    }
    board.append(row);
   }
   section.append(board);
   const next=el("div","ppw-ratings-war-next");
   next.append(el("strong","","Turn ratings into better deals"),
    el("p","ppw-business-muted",
     "Audience and reach influence available broadcasters. Partners are exclusive in this World."));
   next.append(button("Networks & sponsors",()=>{
    commercialKind="BROADCAST";pane="COMMERCIAL";draw();
   }));
   section.append(next);root.append(section);
  }
  if(pane==="COMMERCIAL"){
   const section=el("section","ppw-business-panel ppw-commercial-desk");
   const day=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
   const now=(view.year-1)*52+view.week-1;
   section.append(el("h2","","Commercials"),
    el("p","ppw-business-muted","Broadcast networks, streaming services and sponsors."));
   const rows=el("div","ppw-commercial-deal-tabs");
   for(const [kind,label] of [["BROADCAST","Networks & streaming"],["SPONSOR","Sponsors"]] as const){
    const choice=button(label,()=>{commercialKind=kind;draw();});
    choice.setAttribute("aria-pressed",String(commercialKind===kind));
    rows.append(choice);
   }
   section.append(rows);
   // A rating belongs to the certified TV episode, not the show's 0–100
   // quality score. PPV purchases are reported separately.
   if(commercialKind==="BROADCAST"){
    const episodes=view.shows.filter(show=>show.audience?.format==="TV"&&
     show.audience.householdRating!==null).slice(0,6);
    const audience=el("section","ppw-commercial-market-trend");
    const latest=episodes[0];
    audience.append(el("small","","YOUR TV AUDIENCE"),
     el("strong","",latest?.audience?.householdRating!==null&&latest?
      formatTvRating(latest.audience!.householdRating!)+" · "+latest.name:
      "Awaiting a certified TV broadcast"));
    if(typeof view.averageTvRating==="number"&&view.recentTvEpisodes)
     audience.append(el("small","",
      view.recentTvEpisodes+" recent episodes · "+formatTvRating(view.averageTvRating)+
      " average household rating"));
    const ppv=view.shows.find(s=>s.audience?.format==="PPV"&&
     typeof s.audience.ppvBuys==="number");
    if(ppv)audience.append(el("small","",
     ppv.name+" · "+ppv.audience!.ppvBuys!.toLocaleString("en-GB")+" PPV buys"));
    section.append(audience);
   }
   const current=view.commercialAgreements.filter(d=>d.kind===commercialKind);
   if(current.length)section.append(el("h3","","Your partner"));
   for(const deal of current){
    const item=el("article","ppw-commercial-offer");
    item.append(commercialPartnerBrand(deal.offerCode));
    item.append(el("p","ppw-commercial-voice",deal.networkReview?
     broadcasterReaction(deal.networkReview):
     partnerResponse(deal.offerCode,{
      tier:view.tier,averageTvRating:view.averageTvRating,
      crowd:view.recentAverageCrowd,current:true
     })));
    if(deal.networkReview){
     const review=deal.networkReview;
     const status=review.missedConsecutively>=3?"AT RISK":
      review.status==="OFF_SLOT"?"OFF-SLOT BROADCAST":
      review.status==="NO_TV"?"NO CERTIFIED TV":
      review.status==="BELOW_TARGET"?"AUDIENCE BELOW TARGET":
      review.status==="WATCH"?"NEAR TARGET":
      review.status==="LEGACY"?"AUDIENCE NOT REPORTED":"ON TARGET";
     const line=el("div","ppw-commercial-partner-review");
     line.dataset.status=review.missedConsecutively>=3?"warning":review.status;
     line.append(el("strong","",status),
      el("small","",review.rating===null?"Last week · Rating not reported":
       "Last week · "+formatTvRating(review.rating)+" TV / "+
        review.target.toFixed(2)+" partner target"));
     if(review.missedConsecutively>=2)
      line.append(el("small","",
       review.missedConsecutively+" consecutive missed network requirements"+
       (review.missedConsecutively>=3?
        " · Performance bonuses suspended until delivery improves":"")));
     else if(!review.bonusEligible)
      line.append(el("small","","Performance bonus not earned this week; guaranteed weekly income is unchanged"));
     item.append(line);
    }
    item.append(el("strong","",
     money(deal.weeklyIncome)+" weekly guarantee"));
    item.append(el("small","ppw-commercial-status",
     Math.max(0,deal.endWeekIndex-now+1)+" weeks left on this agreement"));
    if(deal.kind==="BROADCAST"&&typeof deal.airingDay==="number"&&typeof deal.airingHour==="number"){
     item.append(el("span","ppw-commercial-slot",
      "Your contracted TV night · "+(day[deal.airingDay-1]??"Weekly")+
       " at "+String(deal.airingHour).padStart(2,"0")+":00 · Weekly shows fixed"));
     if(port.requestBroadcastDay&&deal.source==="HUMAN"){
      const open=requestingDayFor===deal.dealId;
      item.append(button(open?"Cancel day request":"Request a different broadcast day",()=>{
       requestingDayFor=open?null:deal.dealId;
       chosenBroadcastDay=deal.airingDay===5?4:5;draw();
      },commercialBusy));
      if(open){
       const selector=el("div","ppw-broadcast-day-options");
       selector.setAttribute("role","group");
       selector.setAttribute("aria-label","Requested broadcast day");
       for(let next=1;next<=7;next++){
        if(next===deal.airingDay)continue;
        const choose=button(day[next-1]!,()=>{
         chosenBroadcastDay=next;draw();
        },commercialBusy);
        choose.setAttribute("aria-pressed",String(chosenBroadcastDay===next));
        selector.append(choose);
       }
       item.append(selector);
       item.append(button(commercialBusy?"Requesting…":"Ask the network",()=>{
        void sendBroadcastDayRequest(deal.dealId);
       },commercialBusy));
      }
     }
    }
    section.append(item);
   }
   const brands=Object.entries(COMMERCIAL_COMPANIES)
    .filter(([code])=>code.startsWith(commercialKind+"_"));
   // A signed deal gets priority over a catalogue of unavailable options.
   const market=document.createElement("details");
   market.className="ppw-commercial-market-browser";
   market.open=current.length===0;
   market.append(el("summary","ppw-commercial-market-trigger",
    current.length?"Explore other "+(commercialKind==="BROADCAST"?"networks":"sponsors")+
     " · "+Math.max(0,brands.length-current.length):
     "Available "+(commercialKind==="BROADCAST"?"networks":"sponsors")));
   const marketBody=el("div","ppw-commercial-market-body");
   marketBody.append(el("p","ppw-commercial-world-note",
    "Partners are exclusive in this World. Stronger audiences attract better offers."));
   for(const [code,identity] of brands){
    if(current.some(d=>d.offerCode===code))continue;
    const reserved=(view.partnerInventory??[]).find(d=>d.offerCode===code);
    const offer=view.commercialOffers.find(d=>d.code===code);
    const qualified=(view.commercialQualified??view.commercialOffers).find(d=>d.code===code);
    const item=el("article","ppw-commercial-offer");
    item.dataset.availability=reserved?"TAKEN":offer?"AVAILABLE":"LOCKED";
    item.append(commercialPartnerBrand(code));
    item.append(el("p","ppw-commercial-voice",partnerResponse(code,{
     tier:view.tier,averageTvRating:view.averageTvRating,
     crowd:view.recentAverageCrowd,current:false,
     heldBy:reserved?.promotionName??null
    })));
    if(reserved){
     item.append(el("span","ppw-commercial-status",
      "Exclusive partner of "+reserved.promotionName+" · "+
      Math.max(0,reserved.endWeekIndex-now+1)+" weeks remaining"));
    }else if(current.length){
     item.append(el("span","ppw-commercial-status",
      "Your current "+(commercialKind==="BROADCAST"?"network":"sponsor")+
      " agreement runs until expiry"));
    }else if(offer){
     item.append(el("strong","",money(offer.weeklyIncome)+"/week · "+
      offer.termWeeks+" weeks"));
     if(offer.kind==="BROADCAST"){
      item.append(el("span","ppw-commercial-slot",
       "Contracted weekly slot: "+(day[identity.preferredDay-1]??"weekly")+
       " at "+identity.airtime+" · Rating target "+
       broadcasterRatingTarget(code,view.tier).toFixed(1)));
      item.append(el("span","ppw-commercial-slot",
       "+"+Math.round(offer.reachIncrease)+" distribution reach"));
     }else item.append(el("small","ppw-commercial-slot",identity.preference));
     item.append(el("small","",offer.obligation));
     if(port.signCommercial){
      const sign=button(commercialBusy?"Negotiating…":"Sign "+identity.name,
       ()=>void acceptCommercial(code));
      (sign as HTMLButtonElement).disabled=commercialBusy;
      item.append(sign);
     }
    }else{
     item.append(el("span","ppw-commercial-status",qualified?
      "Not available while another deal is signed":
      "Not approaching your promotion yet"));
     item.append(el("small","ppw-business-muted",identity.preference));
    }
    marketBody.append(item);
   }
   market.append(marketBody);section.append(market);
   root.append(section);
  }
  if(pane==="TERRITORIES"){
   const section=el("section","ppw-business-panel");
   section.append(el("h2","","Your markets"),
    el("p","ppw-business-muted",
     "Your local following grows from real completed shows in each market. A wider broadcast reach is not a free pass to local loyalty."));
   if(!view.territories.length)section.append(el("p","ppw-business-muted",
    "No territory trading figures are available yet."));
   for(const t of view.territories){
    const card=el("article","ppw-business-territory");
    card.append(el("h3","",t.name+(t.isHome?" · Home market":"")));
    if(t.strongestRival&&t.rivalLiveStrength!==null){
     const difference=Math.round(t.liveStrength-t.rivalLiveStrength);
     card.append(el("p","ppw-business-muted",
      "Strongest local rival: "+t.strongestRival+" · "+
      (difference>0?"Your following leads by "+difference:
       difference<0?"Their following leads by "+(-difference):
       "Local support is level")+" strength point"+(Math.abs(difference)===1?"":"s")+
      ". Completed shows here can change the balance."));
    }else card.append(el("p","ppw-business-muted",
     "No active rival currently records an audience in this territory."));
    for(const [label,n] of [
     ["Awareness",t.awareness],["Live strength",t.liveStrength],["Loyalty",t.loyalty]
    ] as const){
     const line=el("div","ppw-business-territory-row");
     line.append(el("span","",label),el("strong","",Math.round(n)+" / 100"));
     const track=el("div","ppw-business-meter");
     const fill=el("span","");
     fill.style.width=Math.min(100,Math.max(0,n))+"%";
     track.append(fill);line.append(track);card.append(line);
    }
    section.append(card);
   }
   root.append(section);
  }
 }
 void refresh();
 return {refresh};
}
