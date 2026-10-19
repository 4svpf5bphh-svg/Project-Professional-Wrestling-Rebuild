import {seriesDue,weekIndex,type ShowSeries,type ShowRole}
 from "../domain/show-calendar.js";
import type {CalendarBooking} from "../db/calendar-workspace.js";
import {calendarBookingForSeries,calendarBookingLocation,calendarBookingState}
 from "./calendar-booked-show.js";
import {calendarSeriesPreview,setSeriesCadence,SERIES_CADENCES}
 from "./calendar-series-preview.js";
export interface CalendarPlanningTarget {
 year:number;week:number;seriesId:string;draftId?:string;
}
export interface CalendarPort{
 openPlanner?(target:CalendarPlanningTarget):void;
 openCard?(draftId:string):void;
 load():Promise<{promotionId?:string;promotionName:string;year:number;week:number;worldRevision:number;
 canEdit:boolean;series:ShowSeries[];
 bookings?:CalendarBooking[];
 weeks:{year:number;week:number;offset:number;shows:ShowSeries[]}[];
 worldWeeks?:{year:number;week:number;offset:number;events:{
 promotionId:string;promotionName:string;seriesId:string;name:string;
 role:ShowRole;eventType:string;importance:number}[]}[]}>;
 save(input:{requestId:string;expectedRevision:number;series:ShowSeries}):Promise<unknown>;
 archive(input:{requestId:string;expectedRevision:number;seriesId:string}):Promise<unknown>;
}
const node=(tag:string,text="",css="")=>{
 const el=document.createElement(tag);el.textContent=text;el.className=css;return el;};
const label=(role:ShowRole)=>role==="FLAGSHIP"?"A show · Flagship":
 role==="SECONDARY"?"B show · Secondary":role==="DEVELOPMENTAL"?"Developmental":
 role==="PREMIUM"?"Premium PPV":"Special / PPV";
export function mountWorldCalendar(root:HTMLElement,port:CalendarPort,back:()=>void){
 let data:Awaited<ReturnType<CalendarPort["load"]>>|null=null;
 let editing:ShowSeries|null=null,busy=false,error="",expanded=false;
 let mode:"mine"|"world"="mine",ppvOnly=false;
 function button(name:string,click:()=>void,disabled=false){
  const b=node("button",name,"ppw-calendar-button") as HTMLButtonElement;
  b.type="button";b.disabled=disabled;b.onclick=click;return b;
 }
 function field(name:string,control:HTMLElement){
  const f=node("label","","ppw-calendar-field");
  f.append(node("span",name),control);return f;
 }
 async function load(){
  busy=true;render();
  try{data=await port.load();error="";}catch(e){error=e instanceof Error?e.message:"Calendar unavailable";}
  finally{busy=false;render();}
 }
 async function change(archiveId?:string){
  if(!data||busy||(!archiveId&&!editing))return;
  if(!archiveId&&editing){
   const checked=calendarSeriesPreview(editing,data.series,data.year,data.week);
   if(!checked.valid){error=checked.message;render();return;}
  }
  busy=true;render();
  try{
   const shared={requestId:crypto.randomUUID(),expectedRevision:data.worldRevision};
   const result=archiveId?
    await port.archive({...shared,seriesId:archiveId}):
    await port.save({...shared,series:editing!});
   if(result&&typeof result==="object"&&"status" in result&&
    result.status==="STALE"){
    data=await port.load();
    throw new Error("The schedule has changed. Review the latest dates before saving.");
   }
   data=await port.load();editing=null;error="";
  }catch(e){error=e instanceof Error?e.message:"Calendar change failed";}
  finally{busy=false;render();}
 }
 function form(){
  const s=editing!,section=node("section","","ppw-calendar-form");
  section.append(node("h2",s.seriesId==="NEW"?"Create recurring event":"Edit recurring event"));
  section.append(node("p","Every date below is a future broadcast slot. Booking the venue and match card happens in Planner.",
   "ppw-calendar-form-help"));
  const name=document.createElement("input");name.type="text";name.maxLength=80;
  name.value=s.name;name.setAttribute("aria-label","Event name");
  section.append(field("Event name",name));
  const role=document.createElement("select");role.setAttribute("aria-label","Event role");
  const roles:ShowRole[]=s.role==="FLAGSHIP"?["FLAGSHIP"]:
   ["SECONDARY","DEVELOPMENTAL","SPECIAL","PREMIUM"];
  for(const value of roles){
   const option=document.createElement("option");option.value=value;option.textContent=label(value);
   role.append(option);
  }
  role.value=s.role;section.append(field("Event type",role));
  const cadence=document.createElement("select");
  cadence.setAttribute("aria-label","Repeat frequency");
  for(const option of SERIES_CADENCES){
   const item=document.createElement("option");item.value=String(option.weeks);
   item.textContent=option.label;cadence.append(item);
  }
  const custom=document.createElement("option");custom.value="custom";custom.textContent="Custom frequency";
  cadence.append(custom);
  cadence.value=SERIES_CADENCES.some(c=>c.weeks===s.cadenceWeeks)?
   String(s.cadenceWeeks):"custom";
  section.append(field("Repeat",cadence));
  const customCadence=document.createElement("input");customCadence.type="number";
  customCadence.min="1";customCadence.max="260";customCadence.step="1";
  customCadence.value=String(s.cadenceWeeks);
  customCadence.setAttribute("aria-label","Custom repeat interval in weeks");
  const customField=field("Every how many weeks?",customCadence);
  customField.hidden=cadence.value!=="custom";section.append(customField);
  const cycle=document.createElement("input");cycle.type="number";
  cycle.min="1";cycle.max=String(s.cadenceWeeks);
  cycle.step="1";cycle.value=String(s.anchorWeek+1);
  cycle.setAttribute("aria-label","First week in repeat cycle");
  const cycleLabel=node("span",s.cadenceWeeks===52?
   "Annual show week (1–52)":"First week of the repeat cycle");
  const cycleField=field("",cycle);cycleField.firstElementChild?.replaceWith(cycleLabel);
  section.append(cycleField);
  const importance=document.createElement("input");importance.type="number";
  importance.min="1";importance.max="100";importance.step="1";importance.value=String(s.importance);
  importance.setAttribute("aria-label","Event importance");
  section.append(field("Event importance (1–100)",importance));
  const forecast=node("div","","ppw-calendar-forecast");
  forecast.setAttribute("aria-live","polite");
  section.append(forecast);
  const save=button("Save event",()=>void change(),busy);
  const refresh=()=>{
   const outcome=calendarSeriesPreview(s,data!.series,data!.year,data!.week);
   forecast.replaceChildren();
   forecast.append(node("strong","NEXT APPEARANCES","ppw-calendar-forecast-kicker"));
   if(outcome.occurrences.length){
    const dates=node("div","","ppw-calendar-forecast-dates");
    for(const date of outcome.occurrences)
     dates.append(node("span","YEAR "+date.year+" · WEEK "+date.week));
    forecast.append(dates);
   }
   const message=node("p",outcome.message,outcome.valid?
    "ppw-calendar-forecast-ok":"ppw-calendar-forecast-warning");
   forecast.append(message);
   save.disabled=busy||!outcome.valid;
   cycleLabel.textContent=s.cadenceWeeks===52?
    "Annual show week (1–52)":"First week of the repeat cycle";
   cycle.max=String(Math.max(1,s.cadenceWeeks));
  };
  name.oninput=()=>{s.name=name.value;refresh();};
  role.onchange=()=>{
   s.role=role.value as ShowRole;
   s.eventType=["SPECIAL","PREMIUM"].includes(s.role)?"MAJOR":"REGULAR";
   refresh();
  };
  cadence.onchange=()=>{
   customField.hidden=cadence.value!=="custom";
   if(cadence.value!=="custom"){
    Object.assign(s,setSeriesCadence(s,Number(cadence.value)));
    customCadence.value=String(s.cadenceWeeks);
    cycle.value=String(s.anchorWeek+1);
   }
   refresh();
  };
  customCadence.oninput=()=>{
   Object.assign(s,setSeriesCadence(s,Number(customCadence.value)));
   cycle.value=String(s.anchorWeek+1);refresh();
  };
  cycle.oninput=()=>{s.anchorWeek=Number(cycle.value)-1;refresh();};
  importance.oninput=()=>{s.importance=Number(importance.value);refresh();};
  section.append(save,button("Cancel",()=>{editing=null;error="";render();},busy));
  refresh();
  return section;
 }
 /** Broadcast-style public event identity; no network or invented attendance. */
 function eventTile(name:string,role:ShowRole,eventType:string,
  owner?:string){
  const major=eventType==="MAJOR";
  const card=node("div","","ppw-calendar-event "+(major?
   "ppw-calendar-event-major":"ppw-calendar-event-weekly"));
  const emblem=node("span",major?"★":role==="FLAGSHIP"?"◆":"◇",
   "ppw-calendar-event-emblem");
  emblem.setAttribute("aria-hidden","true");
  const copy=node("div","","ppw-calendar-event-copy");
  copy.append(node("small",owner??(major?"PREMIUM / SPECIAL":"WEEKLY BROADCAST"),
   "ppw-calendar-event-strap"),
   node("strong",name,"ppw-calendar-event-name"),
   node("span",label(role),"ppw-calendar-event-role"));
  card.append(emblem,copy);return card;
 }
 function ownTile(s:ShowSeries,year:number,week:number,
  due:readonly ShowSeries[],owner?:string){
  const card=eventTile(s.name,s.role,s.eventType,owner);
  const booking=calendarBookingForSeries(s,year,week,due,data?.bookings??[]);
  const offset=weekIndex(year,week)-weekIndex(data!.year,data!.week);
  const near=offset>=0&&offset<6;
  if(booking){
   card.append(node("span",calendarBookingState(booking),
    "ppw-calendar-booked-state"),
    node("span",calendarBookingLocation(booking),
     "ppw-calendar-booked-place"));
   if(offset===0&&data!.canEdit&&booking.status==="DRAFT"&&port.openCard)
    card.append(button("Open this card",()=>port.openCard?.(booking.draftId)));
   else if(near&&data!.canEdit&&booking.status==="DRAFT"&&port.openPlanner)
    card.append(button("Change venue / day",()=>port.openPlanner?.({
     year,week,seriesId:s.seriesId,draftId:booking.draftId
    })));
  }else{
   card.append(node("span",near?"Not yet booked":"Calendar announcement",
    "ppw-calendar-unbooked-state"));
   if(near&&data!.canEdit&&port.openPlanner)
    card.append(button("Plan this show",()=>port.openPlanner?.({
     year,week,seriesId:s.seriesId
    })));
  }
  return card;
 }
 function render(){
  root.replaceChildren();root.classList.add("ppw-world-calendar");
  const head=node("header","","ppw-calendar-header");
  head.append(button("← Planner",back),node("h1","Show Calendar"),
   node("p","Your weekly broadcasts, major events and special attractions."));
  root.append(head);
  if(error)root.append(node("p",error,"ppw-calendar-error"));
  if(!data){root.append(button(busy?"Loading…":"Retry",()=>void load(),busy));return;}
  root.append(node("p",data.promotionName+" · Year "+data.year+" Week "+data.week));
  const manage=node("section","","ppw-calendar-panel");
  manage.append(node("h2","My recurring events"));
  manage.append(button("+ Add event",()=>{
   editing={seriesId:"NEW",name:"",role:"SPECIAL",eventType:"MAJOR",
    cadenceWeeks:52,anchorWeek:data!.week-1,importance:85,active:true};render();
  },!data.canEdit||busy));
  for(const s of data.series){
   const line=node("div","","ppw-calendar-series");
   const description=node("div");description.append(node("strong",s.name),
    node("p",label(s.role)+" · Every "+s.cadenceWeeks+" weeks · Importance "+s.importance));
   line.append(description,
    button("Edit",()=>{editing={...s};render();},!data.canEdit||busy));
   if(s.role!=="FLAGSHIP")line.append(button("Archive",()=>{
    if(window.confirm("Archive "+s.name+"?"))void change(s.seriesId);
   },!data.canEdit||busy));
   manage.append(line);
  }
  if(editing)manage.append(form());
  root.append(manage);
  const upcoming=node("section","","ppw-calendar-panel");
  upcoming.append(node("h2","Upcoming weeks"));
  upcoming.append(button("My shows",()=>{mode="mine";render();},mode==="mine"),
   button("Across the World",()=>{mode="world";render();},mode==="world"));
  if(mode==="mine"){
   upcoming.append(button("All events",()=>{ppvOnly=false;render();},!ppvOnly),
    button("PPVs & specials",()=>{ppvOnly=true;render();},ppvOnly));
   for(const w of (ppvOnly?data.weeks:data.weeks.slice(0,expanded?52:12))){
    const shows=ppvOnly?w.shows.filter(s=>s.eventType==="MAJOR"):w.shows;
    if(!shows.length)continue;
    const article=node("article","","ppw-calendar-occurrence"+
     (w.offset===0?" ppw-calendar-current":""));
    const heading=node("div","","ppw-calendar-week-head");
    heading.append(node("strong","YEAR "+w.year+" · WEEK "+w.week),
     ...(w.offset===0?[node("span","THIS WEEK","ppw-calendar-now")]:[]));
    article.append(heading);
    for(const s of shows)article.append(ownTile(s,w.year,w.week,w.shows));
    upcoming.append(article);
   }
   if(!ppvOnly)upcoming.append(button(expanded?"Show fewer weeks":"View full 52-week year",()=>{
    expanded=!expanded;render();
   }));
  }else{
   upcoming.append(node("p","See what rival promotions have announced. Their venues and future match cards remain under wraps."),
    button("All events",()=>{ppvOnly=false;render();},!ppvOnly),
    button("PPVs & specials",()=>{ppvOnly=true;render();},ppvOnly));
   for(const w of data.worldWeeks??[]){
    const visible=ppvOnly?w.events.filter(e=>e.eventType==="MAJOR"):w.events;
    if(!visible.length)continue;
    const article=node("article","","ppw-calendar-occurrence"+
     (w.offset===0?" ppw-calendar-current":""));
    const heading=node("div","","ppw-calendar-week-head");
    heading.append(node("strong","YEAR "+w.year+" · WEEK "+w.week));
    article.append(heading);
    const myShows=data.weeks.find(x=>x.year===w.year&&x.week===w.week)?.shows??[];
    for(const e of visible){
     const mySeries=myShows.find(s=>s.seriesId===e.seriesId);
     if(mySeries&&e.promotionId===data.promotionId)
      article.append(ownTile(mySeries,w.year,w.week,myShows,e.promotionName));
     else article.append(eventTile(e.name,e.role,e.eventType,e.promotionName));
    }
    upcoming.append(article);
   }
  }
  root.append(upcoming);
 }
 void load();
}
