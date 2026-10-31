import type {readBusinessWorkspace} from "../db/business-workspace.js";
import {commercialCompanyName,COMMERCIAL_COMPANIES} from "../domain/commercial-offers.js";
import type {previewHumanPromotionRestructure} from "../db/human-promotion-restructuring.js";
export type BusinessView=Awaited<ReturnType<typeof readBusinessWorkspace>>;
export type RescueView=NonNullable<Awaited<ReturnType<typeof previewHumanPromotionRestructure>>>;
export interface BusinessPort{
 load():Promise<BusinessView>;
 renamePromotion?(name:string):Promise<{name:string;changed:boolean}>;
 signCommercial?(input:{requestId:string;expectedRevision:number;offerCode:string}):Promise<unknown>;
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
  commercialBusy=false,commercialNotice="",renaming=false,renameBusy=false;
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
   // Context from the existing workspace, never a projection of future
   // bookings, ticket sales or the next World settlement.
   const overview=el("section","ppw-business-pulse");
   const risk=view.financialDistress,margin=view.recurringMargin;
   overview.dataset.health=risk==="DISTRESSED"||risk==="CRISIS"?"warning":
    risk==="WATCH"?"watch":"normal";
   overview.append(el("span","ppw-business-kicker","THE COMPANY / THIS WEEK"),
    el("h2","","Your trading position"));
   const headline=margin===null?
    "Recurring operating margin is not configured yet.":
    margin>=0?
     "Recurring income covers regular commitments by "+money(margin)+" per week.":
     "Regular commitments exceed recurring income by "+money(-margin)+" per week.";
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
   cards.append(metric("HOME TERRITORY",view.homeMarketName??"Not designated",
     "The market where your promotion is based"),
    metric("BROADCAST REACH",view.mediaReach==null?"Not recorded":
     Math.round(view.mediaReach).toLocaleString("en-GB"),
     "Current distribution strength"),
    metric("CASH",money(view.cash)),metric("DEBT",money(view.debt)),
    metric("BASE WEEKLY OVERHEAD",view.weeklyFixedOverhead===null?
     "Not configured":money(view.weeklyFixedOverhead),
     "Premises, operations and running the company · excludes talent, staff and live shows"),
    metric("TOTAL RECURRING SPEND",view.weeklyFixedOverhead===null?
     "Not configured":money(view.weeklyFixedOverhead+view.weeklyGuarantees+view.weeklyStaffPayroll),
     "Fixed overhead + signed guarantees + staff wages"),
    metric("LAST WEEK NET",view.lastWeeklyNet===null?"Not settled":money(view.lastWeeklyNet),
     "Actual result, including settled shows and contracts"),
    metric("RUNWAY",view.runwayWeeks===null?
     view.lastWeeklyNet===null?"Not settled":"No projected shortfall":
      view.runwayWeeks+" weeks",
      view.financialDistress??"Awaiting the first weekly accounts"));
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
   root.append(flow);
   if(view.recurringMargin!==null){
    const resilience=el("section","ppw-business-panel");
    resilience.append(el("h2","","Trading position"),
     el("p","ppw-business-muted",
      "This compares verified recurring commitments with the cash added by completed shows. It is not a forecast."));
    const sample=view.shows.slice(0,4);
    const average=sample.length?Math.round(sample.reduce(
     (sum,show)=>sum+show.incrementalCash,0)/sample.length):null;
    const gap=Math.max(0,-view.recurringMargin);
    const summary=gap>0?
     "Recurring commitments exceed guaranteed weekly income by "+money(gap)+
      ". Ticket sales and other show receipts must help cover that gap.":
     "Guaranteed weekly income currently covers recurring commitments by "+
      money(view.recurringMargin)+" before show costs and receipts.";
    resilience.append(el("p","",summary));
    if(average!==null)resilience.append(el("p","ppw-business-muted",
     "Last "+sample.length+" completed show"+(sample.length===1?"":"s")+
      ": average incremental cash contribution "+money(average)+
      " per event. Results vary by card, venue, tickets and competition."));
    root.append(resilience);
   }
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
    if(port.openResults)body.append(button("Open broadcast results →",
     ()=>port.openResults?.(show.showId)));
    card.append(body);section.append(card);
   }
   root.append(section);
  }
  if(pane==="COMMERCIAL"){
   const section=el("section","ppw-business-panel ppw-commercial-desk");
   section.append(el("h2","","Broadcasting & sponsorship"),
    el("p","ppw-business-muted",
     "Your shows earn their audience. Commercial partners offer real weekly terms; contracts last until expiry and do not automatically renew."));
   const active=view.commercialAgreements;
   if(active.length)section.append(el("h3","","Current agreements"));
   for(const deal of active){
    const item=el("article","ppw-commercial-offer");
    item.append(el("strong","",deal.kind==="BROADCAST"?"Broadcast partner":"Sponsor"),
     el("p","",commercialCompanyName(deal.offerCode)),
     el("small","","Weekly guarantee "+money(deal.weeklyIncome)+
      " · "+Math.max(0,deal.endWeekIndex-((view.year-1)*52+view.week-1)+1)+
      " weeks remaining"+
      (deal.kind==="BROADCAST"?" · additional reach +"+Math.round(deal.reachIncrease):"")));
    section.append(item);
   }
   section.append(el("h3","","Available opportunities"));
   if(!view.commercialOffers.length)section.append(el("p","ppw-business-muted",
    "No new agreements currently qualify. Complete strong shows to attract offers, or let an existing agreement expire."));
   for(const offer of view.commercialOffers){
    const item=el("article","ppw-commercial-offer");
    item.append(el("strong","",offer.name));
    const identity=COMMERCIAL_COMPANIES[offer.code];
    if(identity)item.append(el("p","ppw-commercial-tagline",identity.tagline));
    item.append(el("p","",offer.description));
    if(identity)item.append(el("small","ppw-business-muted",
     "Best fit: "+identity.preference));
    const terms=el("div","ppw-commercial-terms");
    terms.append(el("span","",money(offer.weeklyIncome)+"/week"),
     el("span","",offer.termWeeks+" weeks"),
     el("span","",offer.kind==="BROADCAST"?
      "+"+Math.round(offer.reachIncrease)+" audience reach":"Sponsorship"));
    item.append(terms,el("small","ppw-business-muted",offer.obligation));
    if(offer.code==="SPONSOR_LOCAL")item.append(el("small","ppw-commercial-bonus",
     "Hardcore-match bonus: a certified show with a Hardcore / No DQ bout adds 5% of the weekly guarantee."));
    if(["BROADCAST_GROWTH","BROADCAST_INDIE","BROADCAST_TV","BROADCAST_GLOBAL",
      "SPONSOR_PARTNER","SPONSOR_FOOD","SPONSOR_TECH","SPONSOR_LUXURY"]
      .includes(offer.code))item.append(el("small","ppw-commercial-bonus",
       "Eligible certified shows also earn a modest performance reward, paid after completion."));
    if(port.signCommercial)item.append(button(commercialBusy?
     "Reviewing…" : "Sign agreement",()=>void acceptCommercial(offer.code)));
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
