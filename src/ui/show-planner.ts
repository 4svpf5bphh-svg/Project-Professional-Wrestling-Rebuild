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
 let selectedDraft="",venueId="",day=5,strategy:PlanWeekInput["ticketStrategy"]="STANDARD";
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
      (editing.major?"MAJOR":"REGULAR"),showSeriesId:selectedSeriesId||undefined,
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
  day=draft?.day??5;strategy=draft?.ticketStrategy??"STANDARD";draw();
 }
 function draw(){
  root.replaceChildren();root.classList.add("ppw-planner");
  const header=node("header","","ppw-planner-header");
  if(onBack)header.append(button("← Back",onBack));
  if(port.openCalendar)header.append(button("Show Calendar",()=>port.openCalendar?.()));
  header.append(node("h1","Show Planner"),node("p","Six PPW weeks ahead. Book your card when ready."));
  root.append(header);
  if(error)root.append(node("p",error,"ppw-planner-error"));
  if(!data){root.append(button(busy?"Loading…":"Retry",()=>void refresh(),busy));return;}
  const summary=node("p",data.promotionName+" · Year "+data.year+", Week "+data.week,"ppw-planner-summary");
  root.append(summary);
  if(editing){
   const form=node("section","","ppw-planner-form");
   form.append(node("h2","Year "+editing.year+" · Week "+editing.week));
   const venues=document.createElement("select");
   venues.setAttribute("aria-label","Show venue");venues.disabled=busy;
   for(const v of data.venues){
    const option=document.createElement("option");option.value=v.venueId;
    option.textContent=v.marketName+" · "+v.name+" · "+v.capacity+" seats · "+formatMoney(v.weeklyHireCost);
    venues.append(option);
   }
   venues.value=venueId;venues.onchange=()=>{venueId=venues.value;};
   form.append(node("p","Booking: "+
    (editing.scheduled.find(s=>s.seriesId===selectedSeriesId)?.name??
    "Weekly show"),"ppw-planner-calendar-label"));
   form.append(node("label","Venue"),venues);
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
    else card.append(node("p","Scheduled ahead · card editing opens in this PPW week."));
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
    if(!week.scheduled.length&&!week.shows.length)
     card.append(button("Plan show",()=>edit(week),busy||!data.venues.length));
   }
   root.append(card);
  }
 }
 void refresh();
}
