import type {PlannerView,PlannerWeek,PlanWeekInput} from "../db/planner-workspace.js";
export interface PlannerPort {
 load():Promise<PlannerView>;
 save(input:Omit<PlanWeekInput,"worldId"|"promotionId"|"playerId">):Promise<unknown>;
 openCard(draftId:string):void;
 openCalendar?():void;
}
const node=(tag:string,text="",className="")=>{
 const x=document.createElement(tag);x.textContent=text;x.className=className;return x;};
export function mountPlanner(root:HTMLElement,port:PlannerPort,onBack?:()=>void){
 let data:PlannerView|null=null,error="",busy=false,editing:PlannerWeek|null=null;
 let selectedDraft="",marketId="",venueId="",day=5,strategy:PlanWeekInput["ticketStrategy"]="STANDARD";
 let selectedSeriesId="";
 const button=(label:string,action:()=>void,disabled=false)=>{
  const b=node("button",label,"ppw-planner-button") as HTMLButtonElement;
  b.type="button";b.disabled=disabled;b.onclick=action;return b;};
 const formatMoney=(n:number)=>new Intl.NumberFormat("en-GB",{style:"currency",currency:"GBP",maximumFractionDigits:0}).format(n);
 async function refresh(){
  busy=true;draw();
  try{data=await port.load();error="";}catch(e){error=e instanceof Error?e.message:"Planner unavailable";}
  finally{busy=false;draw();}
 }
 async function save(){
  if(!data||!editing||busy)return;
  const venue=data.venues.find(v=>v.venueId===venueId);
  if(!venue){error="Choose a venue.";draw();return;}
  const requestId=crypto.randomUUID();
  busy=true;draw();
  try{
   const result=await port.save({requestId,expectedRevision:data.worldRevision,
    year:editing.year,week:editing.week,eventType:editing.scheduled.find(s=>s.seriesId===selectedSeriesId)?.eventType??
      "REGULAR",showSeriesId:selectedSeriesId||undefined,
    day,venueId,marketId:venue.marketId,ticketStrategy:strategy,
    ...(selectedDraft?{draftId:selectedDraft}:{})});
   if(result&&typeof result==="object"&&"status" in result&&
    result.status==="STALE"){
    data=await port.load();
    throw new Error("World changed. Review the updated Planner and save again.");
   }
   editing=null;selectedDraft="";data=await port.load();error="";
  }catch(e){error=e instanceof Error?e.message:"Could not save show";}
  finally{busy=false;draw();}
 }
 function edit(week:PlannerWeek,draft?:PlannerWeek["shows"][number],seriesId=""){
  editing=week;selectedDraft=draft?.draftId??"";
  selectedSeriesId=draft?.showSeriesId??seriesId;
  venueId=draft?.venueId??data?.venues.find(v=>v.home)?.venueId??data?.venues[0]?.venueId??"";
  marketId=data?.venues.find(v=>v.venueId===venueId)?.marketId??"";
  day=draft?.day??5;strategy=draft?.ticketStrategy??"STANDARD";draw();
 }
 function draw(){
  root.replaceChildren();root.classList.add("ppw-planner");
  const header=node("header","","ppw-planner-header");
  if(onBack)header.append(button("← Back",onBack));
  if(port.openCalendar)header.append(button("Show Calendar",()=>port.openCalendar?.()));
  header.append(node("h1","Show Planner"),node("p","Plan the next six weeks. Find the right venue and build your card."));
  root.append(header);
  if(error)root.append(node("p",error,"ppw-planner-error"));
  if(!data){root.append(button(busy?"Loading…":"Retry",()=>void refresh(),busy));return;}
  const summary=node("p",data.promotionName+" · Year "+data.year+", Week "+data.week,"ppw-planner-summary");
  root.append(summary);
  const homeMarketId=data.homeMarketId;
  const home=data.venues.find(v=>v.marketId===homeMarketId);
  root.append(node("p","HOME MARKET  /  "+(home?.marketName??"Not assigned")+
   " · "+(home?"Your promotion\u0027s local audience and venue territory":"See Business for your promotion identity"),
   "ppw-planner-home-market"));
  if(editing){
   const form=node("section","","ppw-planner-form");
   form.append(node("h2","Year "+editing.year+" · Week "+editing.week));
   const markets=new Map<string,{name:string;home:boolean}>();
   for(const v of data.venues)markets.set(v.marketId,{
    name:v.marketName,home:v.marketId===data.homeMarketId});
   const choices=[...markets.entries()].sort((a,b)=>Number(b[1].home)-
    Number(a[1].home)||a[1].name.localeCompare(b[1].name));
   const market=document.createElement("select");
   market.setAttribute("aria-label","Show market");
   for(const [id,meta] of choices){
    const o=document.createElement("option");o.value=id;
    o.textContent=(meta.home?"★ YOUR HOME · ":"")+meta.name;
    market.append(o);
   }
   market.value=marketId;
   market.onchange=()=>{
    marketId=market.value;
    venueId=data!.venues.find(v=>v.marketId===marketId)?.venueId??"";
    draw();
   };
   const venues=document.createElement("select");
   venues.setAttribute("aria-label","Show venue");venues.disabled=busy;
   for(const v of data.venues.filter(v=>v.marketId===marketId)){
    const option=document.createElement("option");option.value=v.venueId;
    option.textContent=v.name+" · "+v.capacity.toLocaleString("en-GB")+
     " seats · "+formatMoney(v.weeklyHireCost)+" hire";
    venues.append(option);
   }
   venues.value=venueId;venues.onchange=()=>{venueId=venues.value;draw();};
   form.append(node("p","Booking: "+
    (editing.scheduled.find(s=>s.seriesId===selectedSeriesId)?.name??
    "Weekly show"),"ppw-planner-calendar-label"));
   form.append(node("label","Market"),market,node("label","Venue"),venues);
   const currentVenue=data.venues.find(v=>v.venueId===venueId);
   if(currentVenue){
    const context=node("section","","ppw-planner-market-context");
    context.append(node("span","MARKET INTELLIGENCE","ppw-planner-context-kicker"),
     node("h3",currentVenue.marketName+
      (currentVenue.home?" / HOME ADVANTAGE":" / AWAY SHOW")),
     node("p",currentVenue.home?
      "Your promotion's established territory. These are current local market signals, not an attendance forecast.":
      "Away-market awareness and audience loyalty may differ. This is current local information, not a promised turnout."));
    const figures=node("div","","ppw-planner-market-metrics");
    for(const [label,value] of [
     ["Local awareness",currentVenue.awareness],
     ["Live-show strength",currentVenue.liveStrength],
     ["Loyalty",currentVenue.loyalty],
     ["Audience potential",currentVenue.audiencePotential],
     ["Wrestling interest",currentVenue.wrestlingInterest],
     ["Spending power",currentVenue.spendingIndex]
    ] as const){
     const stat=node("div","","ppw-planner-market-stat");
     stat.append(node("span",label),node("strong",Math.round(value).toString()));
     const rail=node("span","","ppw-planner-market-rail");
     const bar=node("span","","ppw-planner-market-fill");
     bar.style.width=Math.min(100,Math.max(0,value))+"%";
     rail.append(bar);stat.append(rail);figures.append(stat);
    }
    context.append(figures);
    const rival=currentVenue.strongestRival;
    const competition=node("div","","ppw-planner-competition");
    if(rival){
     competition.append(node("span","LOCAL COMPETITION","ppw-planner-context-kicker"),
      node("strong",rival.name+" · "+rival.tier.replaceAll("_"," ").toLowerCase()+
       (rival.basedHere?" · Local promotion":"")),
      node("p","Their local strength: "+Math.round(rival.liveStrength)+"/100 · Yours: "+
       Math.round(currentVenue.liveStrength)+"/100. Consider your following before choosing this market.",
       "ppw-planner-market-note"));
    }else competition.append(node("p","No other active promotion has an established local following here.",
     "ppw-planner-market-note"));
    const venueBrief=node("section","","ppw-planner-venue-brief");
    venueBrief.append(node("span","THE BUILDING","ppw-planner-context-kicker"),
     node("strong",currentVenue.name));
    const venueStats=node("div","","ppw-planner-venue-stats");
    for(const [caption,score] of [
     ["Prestige",currentVenue.prestige],
     ["Production suitability",currentVenue.productionSuitability]
    ] as const){
     const tile=node("div","","ppw-planner-venue-score");
     tile.append(node("span",caption),
      node("strong",score===null?"Not rated":Math.round(score)+"/100"));
     venueStats.append(tile);
    }
    venueBrief.append(venueStats);
    context.append(venueBrief);
    context.append(competition,node("p",
     "Venue capacity: "+currentVenue.capacity.toLocaleString("en-GB")+
     " · Hire cost: "+formatMoney(currentVenue.weeklyHireCost)+
     ". Choose a venue that suits your event and finances.",
     "ppw-planner-market-note"));
    form.append(context);
   }
   const days=document.createElement("select");days.setAttribute("aria-label","Show day");
   for(let d=1;d<=7;d++){const opt=document.createElement("option");opt.value=String(d);opt.textContent=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"][d-1];days.append(opt);}
   days.value=String(day);days.onchange=()=>{day=Number(days.value);};form.append(node("label","Day"),days);
   const ticket=document.createElement("select");ticket.setAttribute("aria-label","Ticket strategy");
   for(const value of ["ACCESSIBLE","STANDARD","PREMIUM","PRESTIGE"] as const){
    const opt=document.createElement("option");opt.value=value;opt.textContent=value.toLowerCase();ticket.append(opt);
   }
   ticket.value=strategy;ticket.onchange=()=>{strategy=ticket.value as typeof strategy;};
   form.append(node("label","Ticket strategy"),ticket,
    button(busy?"Saving…":"Save show",()=>void save(),busy),
    button("Cancel",()=>{editing=null;draw();},busy));
   root.append(form);return;
  }
  for(const week of data.weeks){
   const card=node("section","","ppw-planner-week");
   card.append(node("h2","Year "+week.year+" · Week "+week.week),
    node("p",week.major?"Major event week":week.required?"Regular show week":"Optional show week"));
   if(week.scheduled?.length)card.append(node("p",
    "On the calendar: "+week.scheduled.map(s=>s.name+" ("+
     (s.role==="FLAGSHIP"?"A":s.role==="SECONDARY"?"B":s.role==="PREMIUM"?"PPV":s.role)+")").join(" · "),
    "ppw-planner-calendar-label"));
   for(const show of week.shows){
    card.append(node("p",show.showName+" · "+(show.venueName??"Venue not chosen")+" · "+
     (show.marketName??"Market not chosen")+" · "+show.slots+" card slots"+
     (show.ready?" · Confirmed":" · Draft")));
    if(week.offset===0)card.append(button("Edit card",()=>port.openCard(show.draftId)));
    else card.append(node("p","Scheduled ahead · booking opens when the week arrives."));
    if(week.canEdit&&show.status==="DRAFT")
     card.append(button("Change venue / date",()=>edit(week,show),busy));
   }
   if(week.canEdit){
    for(const s of week.scheduled){
     if(!week.shows.some(show=>show.bookingClass===
       (s.eventType==="MAJOR"?"PREMIUM":"REGULAR")))
      card.append(button(s.eventType==="MAJOR"?
       "Book PPV · "+s.name:"Plan "+s.name,
       ()=>edit(week,undefined,s.seriesId),busy||!data.venues.length));
    }
    if(!week.scheduled.some(s=>s.eventType==="REGULAR")&&
     !week.shows.some(s=>s.bookingClass==="REGULAR"))
     card.append(button("Plan weekly show",()=>edit(week),
      busy||!data.venues.length));
   }
   root.append(card);
  }
 }
 void refresh();
}
