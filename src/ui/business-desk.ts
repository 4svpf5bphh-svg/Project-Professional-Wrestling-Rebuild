import type {readBusinessWorkspace} from "../db/business-workspace.js";
export type BusinessView=Awaited<ReturnType<typeof readBusinessWorkspace>>;
export interface BusinessPort{
 load():Promise<BusinessView>;
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
  pane:"FINANCES"|"EVENTS"|"TERRITORIES"="FINANCES";
 async function refresh(){
  loading=true;draw();
  try{view=await port.load();error="";}
  catch(e){error=e instanceof Error?e.message:"Cannot load your finances";}
  finally{loading=false;draw();}
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
  head.append(el("span","ppw-business-kicker","PPW / THE FRONT OFFICE"),
   el("h1","","Business"),
   el("p","ppw-business-muted",
    view?view.name+" · Year "+view.year+" / Week "+view.week:
     "Cash, show receipts and territories. No fictional forecasts."));
  if(port.back)head.prepend(button("← Back",()=>port.back?.()));
  root.append(head);
  if(error)root.append(el("p","ppw-alert ppw-error",error));
  if(!view){if(!loading)root.append(button("Retry",()=>void refresh()));return;}
  const nav=el("nav","ppw-business-nav");
  nav.setAttribute("aria-label","Business reports");
  for(const [id,title] of [
   ["FINANCES","Finances"],["EVENTS","Events"],["TERRITORIES","Territories"]
  ] as const){
   const b=button(title,()=>{pane=id;draw();});
   b.setAttribute("aria-current",pane===id?"page":"false");nav.append(b);
  }
  root.append(nav);
  if(pane==="FINANCES"){
   const cards=el("section","ppw-business-grid");
   cards.append(metric("CASH",money(view.cash)),metric("DEBT",money(view.debt)),
    metric("LAST WEEK NET",view.lastWeeklyNet===null?"Not settled":money(view.lastWeeklyNet),
     "Actual result, including settled shows and contracts"),
    metric("RUNWAY",view.runwayWeeks===null?
     view.lastWeeklyNet===null?"Not settled":"No projected shortfall":
      view.runwayWeeks+" weeks",
      view.financialDistress??"Awaiting first World resolution"));
   root.append(cards);
   const flow=el("section","ppw-business-panel");
   flow.append(el("h2","","Weekly commitments"),
    el("p","ppw-business-muted",
     "Recurring base only, not a promise of future profits. Upcoming show results and one-time contract costs are excluded."));
   for(const [label,n] of [
    ["Media income",view.weeklyMediaIncome],
    ["Sponsorship",view.weeklySponsorIncome],
    ["Fixed overhead",view.weeklyFixedOverhead===null?null:-view.weeklyFixedOverhead],
    ["Signed talent guarantees",-view.weeklyGuarantees]
   ] as const){
    const line=el("div","ppw-business-line");
    line.append(el("span","",label),el("strong",n===null?"Not configured":money(n)));
    flow.append(line);
   }
   const total=el("div","ppw-business-line ppw-business-total");
   total.append(el("span","","Recurring margin before events and variable costs"),
    el("strong",tone(view.recurringMargin??0),
     view.recurringMargin===null?"Not configured":money(view.recurringMargin)));
   flow.append(total);
   if(port.openContracts||port.openRoster){
    const links=el("div","ppw-business-actions");
    if(port.openContracts)links.append(button("Manage contracts →",()=>port.openContracts?.()));
    if(port.openRoster)links.append(button("My Roster →",()=>port.openRoster?.()));
    flow.append(links);
   }
   root.append(flow);
  }
  if(pane==="EVENTS"){
   const section=el("section","ppw-business-panel");
   section.append(el("h2","","Recent settled events"),
    el("p","ppw-business-muted",
     "Most recent 12 verified shows. Live-gate revenue, venue and production costs are recorded at World resolution."));
   if(!view.shows.length)section.append(el("p","ppw-business-muted",
    "No settled show-finance receipts yet."));
   for(const show of view.shows){
    const card=document.createElement("details");
    card.className="ppw-business-show";
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
  if(pane==="TERRITORIES"){
   const section=el("section","ppw-business-panel");
   section.append(el("h2","","Your markets"),
    el("p","ppw-business-muted",
     "World-wide territory awareness, audience loyalty and live strength. Updated after real completed shows."));
   if(!view.territories.length)section.append(el("p","ppw-business-muted",
    "Territory economics are not configured in this World."));
   for(const t of view.territories){
    const card=el("article","ppw-business-territory");
    card.append(el("h3","",t.name+(t.isHome?" · Home market":"")));
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
