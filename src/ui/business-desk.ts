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
  head.append(el("span","ppw-business-kicker","THE FRONT OFFICE"),
   el("h1","","Business"),
   el("p","ppw-business-muted",
    view?view.name+" · Year "+view.year+" / Week "+view.week:
     "Your latest accounts, show takings and strength in each territory."));
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
    line.append(el("span","",label),el("strong",n===null?"Not configured":money(n)));
    flow.append(line);
   }
   const total=el("div","ppw-business-line ppw-business-total");
   total.append(el("span","","Recurring margin before events and variable costs"),
    el("strong",tone(view.recurringMargin??0),
     view.recurringMargin===null?"Not configured":money(view.recurringMargin)));
   flow.append(total);
   root.append(flow);
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
      "Profit and loss from your latest completed events. Tap an event to see its accounts."));
    const scroll=el("div","ppw-business-trend-scroll");
    scroll.setAttribute("role","group");
    scroll.setAttribute("aria-label","Event profit and loss");
    const bars=el("div","ppw-business-trend-bars");
    const max=Math.max(1,...events.map(s=>Math.abs(s.netResult)));
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
     const plot=el("span","ppw-business-trend-plot");
     const axis=el("span","ppw-business-trend-axis");
     const bar=el("span","ppw-business-trend-column "+
      (show.netResult>=0?"ppw-business-trend-gain":"ppw-business-trend-loss"));
     bar.style.height=(Math.max(5,Math.round(Math.abs(show.netResult)/max*43)))+"%";
     plot.append(axis,bar);
     pick.append(el("small","ppw-business-trend-value",
      money(show.netResult)),plot,el("small","ppw-business-trend-week",
      "Y"+show.year+" W"+show.week));
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
