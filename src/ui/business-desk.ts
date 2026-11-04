import type {readBusinessWorkspace} from "../db/business-workspace.js";
import {commercialCompanyName,COMMERCIAL_COMPANIES,broadcasterRatingTarget,partnerResponse}
 from "../domain/commercial-offers.js";
import {commercialPartnerBrand} from "./commercial-partner-identity.js";
import {assessPromotionSpendingPlan,type PromotionSpendingPlan}
 from "../domain/promotion-spending-plan.js";
import type {previewHumanPromotionRestructure} from "../db/human-promotion-restructuring.js";
export type BusinessView=Awaited<ReturnType<typeof readBusinessWorkspace>>;
export type RescueView=NonNullable<Awaited<ReturnType<typeof previewHumanPromotionRestructure>>>;
export interface BusinessPort{
 load():Promise<BusinessView>;
 renamePromotion?(name:string):Promise<{name:string;changed:boolean}>;
 signCommercial?(input:{requestId:string;expectedRevision:number;offerCode:string}):Promise<unknown>;
 setSpendingPlan?(input:PromotionSpendingPlan&{requestId:string;expectedRevision:number}):Promise<unknown>;
 previewRestructure?():Promise<RescueView|null>;
 openKayfabe?():void;
 restructure?(input:{requestId:string;expectedRevision:number}):
  Promise<{status:"APPLIED"|"REPLAYED"|"STALE";revision:number}>;
 openResults?(showId:string):void;
 openRoster?():void;openContracts?():void;
 back?():void;
}
const el=(tag:string,cls="",content="")=>{
 const x=document.createElement(tag);x.className=cls;x.textContent=content;return x;
};
const button=(label:string,fn:()=>void)=>{
 const x=el("button","ppw-business-action",label) as HTMLButtonElement;
 x.type="button";x.onclick=fn;return x;
};
const money=(n:number)=>new Intl.NumberFormat("en-GB",{
 style:"currency",currency:"USD",maximumFractionDigits:0
}).format(n);
const tone=(n:number)=>n>=0?"ppw-positive":"ppw-negative";
/** Read-only company balance-sheet and verified event P&L, no invented revenues. */
export function mountBusinessDesk(root:HTMLElement,port:BusinessPort){
 let view:BusinessView|null=null,error="",loading=false,
  rescue:RescueView|null=null,rescueReviewed=false,rescueBusy=false,
  rescueReceipt:string|null=null,
  pane:"FINANCES"|"STANDING"|"ACTIVITY"|"EVENTS"|"TERRITORIES"|"COMMERCIAL"="FINANCES",
  commercialBusy=false,commercialNotice="",renaming=false,renameBusy=false,
  commercialKind:"BROADCAST"|"SPONSOR"="BROADCAST",
  spendingExpanded=false;
 let spendingDraft:PromotionSpendingPlan|null=null,spendingBusy=false,spendingNotice="";
 async function refresh(){
  loading=true;draw();
  try{view=await port.load();error="";}
  catch(e){error=e instanceof Error?e.message:"Cannot load your finances";}
  finally{loading=false;draw();}
 }
 async function acceptCommercial(offerCode:string){
  if(commercialBusy||!port.signCommercial||!view)return;
  if(!window.confirm("Sign this commercial agreement? Its weekly income and distribution apply until the term ends. The offer cannot be replaced early."))return;
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
  root.classList.add("ppw-editor","ppw-business");root.replaceChildren();
  const head=el("header","ppw-business-head");
  head.append(el("span","ppw-business-kicker","THE FRONT OFFICE"),
   el("h1","","Business"),
   el("p","ppw-business-muted",
    view?view.name+" · "+(view.homeMarketName?
      "Based in "+view.homeMarketName+" · ":"")+
      "Year "+view.year+" / Week "+view.week:
     "Your latest accounts, show takings and strength in each territory."));
  if(port.back)head.prepend(button("← Back",()=>port.back?.()));

  if(port.renamePromotion&&view){
   head.append(button("Rename promotion",()=>{renaming=!renaming;draw();}));
  }
  root.append(head);
  if(renaming&&view&&port.renamePromotion){
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
  const nav=el("nav","ppw-business-nav");
  nav.setAttribute("aria-label","Business reports");
  for(const [id,title] of [
   ["FINANCES","Finances"],["STANDING","Standing"],["ACTIVITY","Activity"],["EVENTS","Events"],["TERRITORIES","Territories"],["COMMERCIAL","Deals"]
  ] as const){
   const b=button(title,()=>{pane=id;draw();});
   b.setAttribute("aria-current",pane===id?"page":"false");nav.append(b);
  }
  root.append(nav);
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
   if(typeof view.remainingRosterPotential==="number"){
    const commitment=document.createElement("details");
    commitment.className="ppw-finance-roster-exposure";
    commitment.append(el("summary","","Remaining roster commitments · "+
     money(view.remainingRosterPotential)));
    commitment.append(el("p","ppw-finance-commitments",
     money(view.remainingRosterGuaranteed)+
      " is guaranteed wages; up to "+
      money(Math.max(0,view.remainingRosterPotential-view.remainingRosterGuaranteed))+
      " is appearance fees only if every remaining date is used. These amounts"+
      " are payable over the remaining contracts, not owed today."));
    bank.append(commitment);
   }
   if(view.debt>0)bank.append(el("p","ppw-finance-debt",
    "Outstanding debt · "+money(view.debt)));
   const actions=el("div","ppw-finance-first-actions");
   if(port.openContracts)actions.append(button("Manage roster costs",
    ()=>port.openContracts?.()));
   actions.append(button(spendingExpanded?"Close spending limits":
    "Manage spending limits",()=>{spendingExpanded=!spendingExpanded;draw();}));
   bank.append(actions);
   root.append(bank);
   // Owner budgeting is independent of actual settlement, contracts and cash.
   const regularCosts=(view.weeklyFixedOverhead??0)+view.weeklyGuarantees+
    view.weeklyStaffPayroll;
   const suggestion:PromotionSpendingPlan={
    weeklyWageLimit:Math.ceil(Math.max(1000,view.weeklyGuarantees*1.35)/1000)*1000,
    showTalentLimit:Math.ceil(Math.max(1000,(view.shows[0]?.appearanceFees??0)*1.25)/1000)*1000,
    cashReserve:Math.ceil(Math.max(regularCosts*8,view.cash*0.2)/1000)*1000};
   const plan=spendingDraft??view.spendingPlan??suggestion;
   const budget=el("section","ppw-business-budget");
   budget.append(el("span","ppw-business-kicker","YOUR MONEY / YOUR RULES"),
    el("h2","","Set your spending limits"),
    el("p","ppw-business-muted",
     "Protect working capital and decide how much to commit to talent. Limits guide your decisions; they do not move cash or cancel a booking."));
   // Keep one authoritative money snapshot above. Budgets are optional player limits,
   // not extra accounts or funds reserved by the server.
   const fields=el("div","ppw-business-budget-fields");
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
     spendingNotice="";refreshPreview();};
    input.disabled=spendingBusy;field.append(input);fields.append(field);
   }
   budget.append(fields,preview);
   // Recruiting shows the same package-cost and affordability model in context.
   // A second five-field contract calculator here was duplicating that decision.
   if(port.openRoster)budget.append(button("Explore wrestler signings",()=>port.openRoster?.()));
   if(!view.spendingPlan)budget.append(el("small","ppw-business-muted",
    "Suggestions are based on current wages, recent shows and eight weeks of fixed commitments. Review them before saving."));
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
   overview.append(el("summary","","Financial outlook"));
   const headline=margin===null?
    "Recurring operating margin is not configured yet.":
    margin>=0?
     "Recurring income covers regular commitments by "+money(margin)+" per week.":
     "Regular commitments exceed recurring income by "+money(-margin)+" per week.";
   if(risk==="DISTRESSED"||risk==="CRISIS"||risk==="WATCH")overview.open=true;
   overview.append(el("strong","ppw-business-pulse-headline",headline));
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
      show.audience.householdRating.toFixed(1)+" TV rating"));
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
  if(pane==="COMMERCIAL"){
   const section=el("section","ppw-business-panel ppw-commercial-desk");
   const day=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
   const now=(view.year-1)*52+view.week-1;
   section.append(el("h2","","Broadcasting & sponsorship"));
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
      latest.audience!.householdRating!.toFixed(1)+" · "+latest.name:
      "Awaiting a certified TV broadcast"));
    if(typeof view.averageTvRating==="number"&&view.recentTvEpisodes)
     audience.append(el("small","",
      view.recentTvEpisodes+" recent episodes · "+view.averageTvRating.toFixed(1)+
      " average household rating"));
    const ppv=view.shows.find(s=>s.audience?.format==="PPV"&&
     typeof s.audience.ppvBuys==="number");
    if(ppv)audience.append(el("small","",
     ppv.name+" · "+ppv.audience!.ppvBuys!.toLocaleString("en-GB")+" PPV buys"));
    section.append(audience);
    const rivals=view.competitorBroadcasts??[];
    if(rivals.length){
     const ranking=el("section","ppw-business-broadcast-comparison");
     ranking.append(el("h3","","Ratings war"),
      el("small","ppw-business-muted","Latest TV episode per promotion · past six weeks"));
     const yourRank=rivals.findIndex(r=>r.isYours);
     ranking.append(el("p","ppw-business-muted",yourRank>=0?
      "Your latest TV show ranks #"+(yourRank+1)+" of "+
      rivals.length+" recent broadcasters.":"No certified recent episode of yours."));
     if(yourRank>0)ranking.append(el("p","ppw-business-muted",
      rivals[0]!.name+" leads your latest audience by "+
      Math.max(0,rivals[0]!.householdRating-rivals[yourRank]!.householdRating)
       .toFixed(1)+" rating points."));
     // Keep the manager's own place visible even below the seven leaders.
     const visible=rivals.slice(0,7);
     if(yourRank>=7)visible.push(rivals[yourRank]!);
     for(const episode of visible){
      const i=rivals.indexOf(episode);
      const row=el("article","ppw-business-broadcast-row");
      if(episode.isYours)row.classList.add("ppw-business-broadcast-yours");
      const label=el("div","");
      label.append(el("strong","","#"+(i+1)+" · "+episode.name+
       (episode.isYours?" · YOUR SHOW":"")),
       el("span","",episode.showName+" · "+
        (day[(episode.day??0)-1]??"Day unreported")+
        " · Y"+episode.year+" W"+episode.week),
       el("small","",episode.networkOfferCode?
        commercialCompanyName(episode.networkOfferCode):"No partner on record"));
      const score=el("div","ppw-business-broadcast-numbers");
      score.append(el("strong","",episode.householdRating.toFixed(1)),
       el("small","",episode.estimatedViewers===null?"Household rating":
        episode.estimatedViewers.toLocaleString("en-GB")+" viewers"));
      row.append(label,score);ranking.append(row);
     }
     section.append(ranking);
    }
   }
   const current=view.commercialAgreements.filter(d=>d.kind===commercialKind);
   if(current.length)section.append(el("h3","","Your partner"));
   for(const deal of current){
    const item=el("article","ppw-commercial-offer");
    item.append(commercialPartnerBrand(deal.offerCode));
    item.append(el("p","ppw-commercial-voice",partnerResponse(deal.offerCode,{
     tier:view.tier,averageTvRating:view.averageTvRating,
     crowd:view.recentAverageCrowd,current:true
    })));
    item.append(el("strong","",
     money(deal.weeklyIncome)+" weekly guarantee"));
    item.append(el("small","ppw-commercial-status",
     Math.max(0,deal.endWeekIndex-now+1)+" weeks left on this agreement"));
    if(deal.kind==="BROADCAST"&&typeof deal.airingDay==="number"&&typeof deal.airingHour==="number")
     item.append(el("span","ppw-commercial-slot",
      "Your broadcast slot · "+(day[deal.airingDay-1]??"Weekly")+
       " at "+String(deal.airingHour).padStart(2,"0")+":00"));
    section.append(item);
   }
   section.append(el("h3","","The World deal market"),
    el("p","ppw-commercial-world-note",
     "Each partner can back only one promotion at a time in this World. "+
     "More viewers strengthen future offers; existing agreements are honoured until expiry."));
   const brands=Object.entries(COMMERCIAL_COMPANIES)
    .filter(([code])=>code.startsWith(commercialKind+"_"));
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
       "Preferred "+(day[identity.preferredDay-1]??"weekly")+
       " "+identity.airtime+" · Rating target "+
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
    section.append(item);
   }
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
