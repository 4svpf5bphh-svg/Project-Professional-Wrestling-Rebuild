import {eventDesign} from "./broadcast-identity.js";
import {createPromotionLogo} from "./promotion-logo.js";
import {promotionBrand} from "./broadcast-identity.js";
import {seriesDue,weekIndex,type ShowSeries,type ShowRole}
 from "../domain/show-calendar.js";
import {validateAnnualPremiumEvents,type AnnualPremiumEvent,
 type PremiumPolicy} from "../domain/annual-premium-plan.js";
import type {StandingTier} from "../domain/annual-promotion-standing.js";
import type {CalendarBooking,PremiumCalendarEdition}
 from "../db/calendar-workspace.js";
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
 canEdit:boolean;eventPosterStyle?:string|null;broadcastPackage?:string|null;series:ShowSeries[];
 broadcastSlot?:{offerCode:string;networkName:string;day:number;hour:number;
  startWeekIndex:number;endWeekIndex:number}|null;
 bookings?:CalendarBooking[];premiumEditions?:PremiumCalendarEdition[];
 annual?:{tier:StandingTier;policyStartYear?:number;policy:PremiumPolicy;years:{
  year:number;confirmed:boolean;events:AnnualPremiumEvent[];
  suggested:AnnualPremiumEvent[]}[]};
 weeks:{year:number;week:number;offset:number;shows:ShowSeries[]}[];
 worldWeeks?:{year:number;week:number;offset:number;events:{
 promotionId:string;promotionName:string;seriesId:string;name:string;
 role:ShowRole;eventType:string;importance:number}[]}[]}>;
 save(input:{requestId:string;expectedRevision:number;series:ShowSeries}):Promise<unknown>;
 archive(input:{requestId:string;expectedRevision:number;seriesId:string}):Promise<unknown>;
 saveAnnual?(input:{requestId:string;expectedRevision:number;
  year:number;events:AnnualPremiumEvent[]}):Promise<unknown>;
 renameBooked?(input:{requestId:string;expectedRevision:number;draftId:string;
  year:number;week:number;name:string}):Promise<unknown>;
}
const node=(tag:string,text="",css="")=>{
 const el=document.createElement(tag);el.textContent=text;el.className=css;return el;};
const label=(role:ShowRole)=>role==="FLAGSHIP"?"A show · Flagship":
 role==="SECONDARY"?"B show · Secondary":role==="DEVELOPMENTAL"?"Developmental":
 role==="PREMIUM"?"Premium PPV":"Special / PPV";
export function mountWorldCalendar(root:HTMLElement,port:CalendarPort,back:()=>void){
 let data:Awaited<ReturnType<CalendarPort["load"]>>|null=null;
 let editing:ShowSeries|null=null,busy=false,error="";
 let mode:"mine"|"world"="mine",ppvOnly=false,manageExpanded=false;
 let pendingChange:{fingerprint:string;requestId:string}|null=null;
 let yearChosen:number|null=null,yearActiveWeek:number|null=null;
 const yearlyDrafts=new Map<number,AnnualPremiumEvent[]>();
 let pendingYear:{fingerprint:string;requestId:string}|null=null;
 let pendingRename:{fingerprint:string;requestId:string}|null=null;
 const renamedDrafts=new Map<string,string>();
 const premiumEdition=(year:number,week:number)=>
  (data?.premiumEditions??[]).find(x=>x.year===year&&x.week===week)??null;
 const draftKey=(draft:PremiumCalendarEdition)=>draft.draftId;
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
  const input=archiveId?{expectedRevision:data.worldRevision,seriesId:archiveId}:
   {expectedRevision:data.worldRevision,series:{...editing!}};
  const fingerprint=JSON.stringify(input);
  if(!pendingChange||pendingChange.fingerprint!==fingerprint)
   pendingChange={fingerprint,requestId:crypto.randomUUID()};
  const requestId=pendingChange.requestId;
  busy=true;error="";render();
  try{
   const result=archiveId?
    await port.archive({requestId,expectedRevision:data.worldRevision,seriesId:archiveId}):
    await port.save({requestId,expectedRevision:data.worldRevision,series:{...editing!}});
   const status=result&&typeof result==="object"&&"status" in result?
    result.status:null;
   if(status==="STALE"){
    // A second manager may have changed a contract in this same World.
    // Refresh the authoritative revision without discarding this event edit.
    pendingChange=null;
    data=await port.load();
    throw new Error("The World changed. Your event choices are preserved. Review the dates and save again.");
   }
   if(status!=="APPLIED"&&status!=="REPLAYED")
    throw new Error("The calendar change was not confirmed. Your choices remain available to retry.");
   // The command receipt survives a lost HTTP reply OR failed post-save read.
   // A retry with the same ID replays the result, not a second series INSERT.
   const refreshed=await port.load();
   data=refreshed;editing=null;pendingChange=null;error="";
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
  section.append(field("Advertised show importance (1–100)",importance));
  section.append(node("p",
   "Advertised importance affects booking presentation, not earned prestige. Heritage is recognised only after certified shows.",
   "ppw-calendar-tradition"));
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
 /** Year-opening PPV commitments are weeks/identities, not early match cards.
  * One compact world command on confirmation; buttons never write on tap. */
 function yearData(){
  if(!data?.annual)return null;
  if(yearChosen===null||!data.annual.years.some(x=>x.year===yearChosen))
   yearChosen=data.year;
  return data.annual.years.find(x=>x.year===yearChosen)??null;
 }
 function yearEvents(year:number):AnnualPremiumEvent[]{
  const yearRow=data?.annual?.years.find(x=>x.year===year);
  if(!yearRow)return [];
  return yearlyDrafts.get(year)??(yearRow.confirmed?yearRow.events:yearRow.suggested);
 }
 function changeYearEvent(year:number,week:number,seriesId:string|null){
  if(premiumEdition(year,week)){
   error="A booked or certified PPV has a protected identity. Select it to review the actual title.";
   render();return;
  }
  const previous=yearEvents(year).find(x=>x.week===week&&x.seriesId===seriesId);
  const without=yearEvents(year).filter(x=>x.week!==week);
  if(seriesId)without.push(previous?{...previous}:{week,seriesId});
  // Preserve the optional edition name on an unchanged show identity.
  // Rebuilding only {seriesId,week} silently discarded that name.
  yearlyDrafts.set(year,without.sort((a,b)=>
   a.week-b.week||a.seriesId.localeCompare(b.seriesId)));
  pendingYear=null;render();
 }
 function renameYearEvent(year:number,week:number,name:string){
  if(premiumEdition(year,week))return;
  const current=yearEvents(year).find(x=>x.week===week);
  if(!current||!data)return;
  const seriesName=data.series.find(s=>s.seriesId===current.seriesId)?.name??"";
  const trimmed=name.trim();
  const revised=yearEvents(year).map(e=>e.week===week?
   {...e,name:trimmed&&trimmed!==seriesName?trimmed:undefined}:e);
  yearlyDrafts.set(year,revised);
  pendingYear=null;
 }
 async function renameBookedPremium(booking:PremiumCalendarEdition){
  if(!data||busy||!port.renameBooked)return;
  const name=(renamedDrafts.get(draftKey(booking))??booking.showName).trim();
  if(!name||name.length>80){error="Enter a PPV title up to 80 characters";render();return;}
  const input={expectedRevision:data.worldRevision,draftId:booking.draftId,
   year:booking.year,week:booking.week,name};
  const fingerprint=JSON.stringify(input);
  if(!pendingRename||pendingRename.fingerprint!==fingerprint)
   pendingRename={fingerprint,requestId:crypto.randomUUID()};
  const requestId=pendingRename.requestId;
  busy=true;error="";render();
  try{
   const result=await port.renameBooked({...input,requestId});
   const status=result&&typeof result==="object"&&"status" in result?
    String(result.status):"";
   if(status==="STALE"){
    data=await port.load();pendingRename=null;
    throw new Error("The World changed. Review the booked title before renaming.");
   }
   if(status!=="APPLIED"&&status!=="REPLAYED")
    throw new Error("The booked PPV was not renamed. Check the card and retry.");
   data=await port.load();renamedDrafts.delete(draftKey(booking));
   yearlyDrafts.delete(booking.year);pendingRename=null;error="";
  }catch(e){error=e instanceof Error?e.message:"Could not rename the booked PPV";}
  finally{busy=false;render();}
 }
 async function confirmAnnual(){
  const selected=yearData(),annual=data?.annual;
  if(!selected||!annual||!data||busy||!port.saveAnnual)return;
  const events=yearEvents(selected.year),currentYear=data.year;
  try{
   validateAnnualPremiumEvents({year:selected.year,tier:annual.tier,events,
    series:data.series,originalName:data.promotionName,
    previous:selected.year===currentYear+1?
     annual.years.find(x=>x.year===currentYear)?.events:undefined});
  }catch(e){error=e instanceof Error?e.message:"Review your annual PPV dates";render();return;}
  const input={year:selected.year,expectedRevision:data.worldRevision,events};
  const fingerprint=JSON.stringify(input);
  if(!pendingYear||pendingYear.fingerprint!==fingerprint)
   pendingYear={fingerprint,requestId:crypto.randomUUID()};
  const requestId=pendingYear.requestId;
  busy=true;error="";render();
  try{
   const result=await port.saveAnnual({...input,requestId});
   const status=result&&typeof result==="object"&&"status" in result?
    String(result.status):"";
   if(status==="STALE"){
    data=await port.load();pendingYear=null;
    throw new Error("The World changed. Your chosen PPV dates are preserved. Review and confirm again.");
   }
   if(status!=="APPLIED"&&status!=="REPLAYED")
    throw new Error("The annual calendar wasn't confirmed. Review and retry.");
   data=await port.load();yearlyDrafts.delete(selected.year);
   pendingYear=null;yearActiveWeek=null;error="";
  }catch(e){error=e instanceof Error?e.message:"Could not save the PPV year";}
  finally{busy=false;render();}
 }
 function annualPlanner(){
  if(!data?.annual)return null;
  const annual=data.annual,chosen=yearData()!;
  const rootSection=node("section","","ppw-calendar-panel ppw-calendar-year-plan");
  rootSection.append(node("span","TV + PREMIUM EVENTS","ppw-calendar-schedule-kicker"),
   node("h2","Year "+chosen.year+" · Full calendar"));
  const summary=node("p",
   data.promotionName+" · "+annual.tier+" · "+
   annual.policy.minimum+"–"+annual.policy.maximum+
   " major events per 52-week year","ppw-calendar-year-subtitle");
  rootSection.append(summary);
  rootSection.append(node("p",
   chosen.year===data.year?
    "CURRENT WORLD YEAR · Actual TV recurrence and this year's events":
    "FUTURE YEAR · PPV changes affect Year "+chosen.year+" only",
   "ppw-calendar-year-context"));
  const years=node("div","","ppw-calendar-year-toggle");
  for(const row of annual.years){
   const choose=button("Year "+row.year,()=>{
    yearChosen=row.year;yearActiveWeek=null;error="";render();
   },busy);
   choose.setAttribute("aria-pressed",String(chosen.year===row.year));
   years.append(choose);
  }
  rootSection.append(years);
  const events=yearEvents(chosen.year);
  const lockedCurrent=chosen.year<(data.annual.policyStartYear??1)||
   chosen.year===data.year&&data.week>1&&!chosen.confirmed;
  const canEdit=data.canEdit&&!!port.saveAnnual&&!lockedCurrent&&!busy;
  const dated=new Map(events.map(x=>[x.week,x]));
  rootSection.append(node("p",
   (chosen.confirmed?"Confirmed for Year ":"Suggested for Year ")+chosen.year+
   " · "+events.length+" of "+annual.policy.maximum+" dates"+
   (events.length<annual.policy.minimum?" · Below the expected minimum":""),
   "ppw-calendar-year-count"));
  if(lockedCurrent)rootSection.append(node("p",
   "This year's existing dates stay protected. Plan next year before the season begins.",
   "ppw-calendar-year-notice"));
  else if(!chosen.confirmed)rootSection.append(node("p",
   "Suggested dates are not live yet. Choose your show weeks and confirm the year. Match cards and venues come later.",
   "ppw-calendar-year-notice"));
  const series=new Map(data.series.filter(x=>x.eventType==="MAJOR")
   .map(x=>[x.seriesId,x]));
  const quarters=node("div","","ppw-calendar-quarters");
  for(let quarter=0;quarter<4;quarter++){
   const part=node("section","","ppw-calendar-quarter");
   part.append(node("h3","Quarter "+(quarter+1),"ppw-calendar-quarter-heading"));
   const grid=node("div","","ppw-calendar-week-grid");
   for(let i=1;i<=13;i++){
    const week=quarter*13+i,edition=dated.get(week);
    const booked=premiumEdition(chosen.year,week);
    const show=edition?series.get(edition.seriesId):
     booked?series.get(booked.showSeriesId??""):null;
    // The actual saved draft/certified title outranks the calendar preview.
    const showName=booked?.showName??edition?.name??show?.name;
    const picked=week===yearActiveWeek;
    const date=button("W"+String(week).padStart(2,"0"),()=>{
     yearActiveWeek=week;render();
    },busy);
    date.classList.add("ppw-calendar-week-button");
    date.dataset.hasEvent=String(!!showName);
    date.dataset.booked=String(!!booked);
    if(booked)date.dataset.status=booked.certified?"CERTIFIED":
     booked.status==="SUBMITTED"?"SUBMITTED":"DRAFT";
    date.setAttribute("aria-pressed",String(picked));
    if(showName)date.append(node("small",showName,
     "ppw-calendar-year-major"));
    if(booked)date.append(node("small",booked.certified?"CERTIFIED":
     booked.status==="SUBMITTED"?"SUBMITTED":"BOOKED",
     "ppw-calendar-year-edition-state"));
    const tv=data!.broadcastSlot,idx=weekIndex(chosen.year,week);
    const dueTv=data!.series.filter(s=>s.eventType==="REGULAR"&&
     seriesDue(s,idx));
    date.dataset.hasTelevision=String(dueTv.length>0);
    const appearances=[showName,...dueTv.map(x=>x.name)].filter(Boolean);
    date.setAttribute("aria-label","Year "+chosen.year+" week "+week+" — "+
     (appearances.length?appearances.join(" + "):"no shows due"));
    for(const regular of dueTv.slice(0,2)){
     const validSlot=tv&&idx>=tv.startWeekIndex&&idx<=tv.endWeekIndex;
     date.append(node("small",regular.name+
      (validSlot?" · "+["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][tv.day-1]:""),
      "ppw-calendar-ppv-week-tv"));
    }
    grid.append(date);
   }
   part.append(grid);quarters.append(part);
  }
  rootSection.append(quarters);
  const selectedBooking=yearActiveWeek===null?null:
   premiumEdition(chosen.year,yearActiveWeek);
  if(yearActiveWeek!==null&&canEdit&&!selectedBooking){
   const picker=node("section","","ppw-calendar-year-picker");
   picker.append(node("strong","YEAR "+chosen.year+" · WEEK "+yearActiveWeek),
    node("p","Pick an event for this week. Nothing is booked until you confirm."));
   const choices=node("div","","ppw-calendar-year-choices");
   for(const show of series.values()){
    const selected=button(show.name,()=>{
     changeYearEvent(chosen.year,yearActiveWeek!,show.seriesId);
    });
    selected.setAttribute("aria-pressed",
     String(dated.get(yearActiveWeek)?.seriesId===show.seriesId));
    choices.append(selected);
   }
   const clear=button("Leave week free",()=>changeYearEvent(chosen.year,yearActiveWeek!,null));
   choices.append(clear);picker.append(choices);
   const currentEdition=dated.get(yearActiveWeek);
   if(currentEdition){
    const event=series.get(currentEdition.seriesId);
    const named=node("label","","ppw-calendar-year-edition");
    named.append(node("span","PPV edition name"));
    const name=document.createElement("input");
    name.type="text";name.maxLength=80;
    name.setAttribute("aria-label","PPV edition name");
    name.value=currentEdition.name??event?.name??"";
    const official=["WWE","AEW"].includes(data.promotionName.trim().toUpperCase());
    name.disabled=official;
    name.oninput=()=>{
     renameYearEvent(chosen.year,yearActiveWeek!,name.value);
     const shown=name.value.trim()||event?.name||"";
     const tile=root.querySelector<HTMLButtonElement>(
      ".ppw-calendar-week-button[aria-pressed=true]");
     if(tile&&shown){
      const title=tile.querySelector(".ppw-calendar-year-major");
      if(title)title.textContent=shown;
      const index=weekIndex(chosen.year,yearActiveWeek!);
      const dueNames=data!.series.filter(x=>x.eventType==="REGULAR"&&
       seriesDue(x,index)).map(x=>x.name);
      tile.setAttribute("aria-label","Year "+chosen.year+" week "+yearActiveWeek+
       " — "+[shown,...dueNames].join(" + "));
     }
    };
    named.append(name);
    picker.append(named);
    if(official)picker.append(node("p",
     "Official annual event names are protected.","ppw-calendar-year-footer"));
   }
   rootSection.append(picker);
  }
  if(yearActiveWeek!==null&&(!canEdit||selectedBooking)){
   const week=yearActiveWeek,index=weekIndex(chosen.year,week);
   const due=data.series.filter(s=>s.eventType==="REGULAR"&&seriesDue(s,index));
   const premium=dated.get(week);
   const plannedName=premium?.name??data.series.find(s=>
    s.seriesId===premium?.seriesId)?.name;
   const premiumName=selectedBooking?.showName??plannedName;
   const detail=node("section","","ppw-calendar-year-picker");
   detail.append(node("strong","Year "+chosen.year+" · Week "+week));
   for(const tv of due)detail.append(node("p",
    tv.name+" · "+(tv.cadenceWeeks===1?"weekly":
     tv.cadenceWeeks===2?"alternate-week":"every "+tv.cadenceWeeks+" weeks")+" TV"));
   if(premiumName)detail.append(node("p","PPV / special · "+premiumName));
   if(selectedBooking){
    detail.append(node("strong",selectedBooking.certified?"CERTIFIED SHOW":
     selectedBooking.status==="SUBMITTED"?"SUBMITTED CARD":
     selectedBooking.ready?"CARD READY":"EDITABLE BOOKED DRAFT"));
    if(plannedName&&plannedName!==selectedBooking.showName)
     detail.append(node("p",
      "The annual title says “"+plannedName+"”, but the actual booked show remains “"+
      selectedBooking.showName+"”. It will not be renamed automatically.",
      "ppw-calendar-year-name-warning"));
    const offset=index-weekIndex(data.year,data.week);
    const renamable=!!port.renameBooked&&data.canEdit&&
     selectedBooking.status==="DRAFT"&&!selectedBooking.ready&&
     !selectedBooking.certified&&offset>=0&&offset<=6;
    if(renamable){
     const named=node("label","","ppw-calendar-year-edition");
     named.append(node("span","Rename booked PPV"));
     const name=document.createElement("input");
     name.type="text";name.maxLength=80;
     name.setAttribute("aria-label","Rename booked PPV");
     name.value=renamedDrafts.get(draftKey(selectedBooking))??selectedBooking.showName;
     name.oninput=()=>{renamedDrafts.set(draftKey(selectedBooking),name.value);
      pendingRename=null;};
     named.append(name);detail.append(named,
      button("Save booked PPV title",()=>void renameBookedPremium(selectedBooking)));
     detail.append(node("small",
      "Explicit rename updates this unsubmitted card and its confirmed annual edition together. Matches and booking rules stay unchanged.",
      "ppw-calendar-year-footer"));
    }else detail.append(node("small",
     "Submitted, certified or ready cards keep their actual title. Editable drafts can only be renamed in the six-week booking window.",
     "ppw-calendar-year-footer"));
   }
   if(!due.length&&!premiumName)detail.append(node("p","No show due this week"));
   if(lockedCurrent)detail.append(node("small",
    "Current-year commitments are locked. Select Year "+(data.year+1)+
    " to plan future annual PPV dates.","ppw-calendar-year-footer"));
   rootSection.append(detail);
  }
  if(canEdit){
   rootSection.append(button("Use recommended dates",()=>{
    yearlyDrafts.set(chosen.year,[...chosen.suggested]);yearActiveWeek=null;
    pendingYear=null;error="";render();
   },busy));
   const commit=button(chosen.confirmed?"Save revised year":"Confirm Year "+chosen.year,
    ()=>void confirmAnnual(),busy);
   commit.classList.add("ppw-calendar-year-confirm");rootSection.append(commit);
  }
  rootSection.append(node("small",
   "TV follows its actual recurrence. PPV dates and names are saved per World year.",
   "ppw-calendar-year-footer"));
  return rootSection;
 }
 /** Broadcast-style public event identity; no network or invented attendance. */
 function eventTile(name:string,role:ShowRole,eventType:string,
  owner?:string){
  const major=eventType==="MAJOR";
  const card=node("div","","ppw-calendar-event "+(major?
   "ppw-calendar-event-major":"ppw-calendar-event-weekly"));
  card.dataset.eventRole=role.toLowerCase();
   const graphic=eventDesign(name,owner??data?.promotionName??"",major);
   card.dataset.eventMotif=graphic.motif;
   card.dataset.eventPromotion=graphic.brand;
   const emblem=node("span",major?"★":role==="FLAGSHIP"?"◆":"◇",
   "ppw-calendar-event-emblem");
  emblem.setAttribute("aria-hidden","true");
  const copy=node("div","","ppw-calendar-event-copy");
  copy.append(node("small",owner??(major?"PREMIUM / SPECIAL":"WEEKLY BROADCAST"),
   "ppw-calendar-event-strap"),
   node("span",label(role),"ppw-calendar-event-role"));
   const artwork=node("span","","ppw-calendar-artwork-shell");
   artwork.append(node("span",major?"PPW / SPECIAL PRESENTATION":"PPW / WEEKLY BROADCAST","ppw-event-type-line"),
    node("strong",name,"ppw-dynamic-event-heading"),
    node("span",owner??data?.promotionName??"","ppw-event-promoter-line"));
   card.append(artwork,emblem,copy);
  // Keep the promoter identity legible when third-party marks fail to load.
  const identity=node("span",promotionBrand(owner??data?.promotionName??"").mark,
   "ppw-calendar-owner-mark");
  identity.dataset.brand=graphic.brand;
  const ownerLogo=createPromotionLogo(graphic.brand,96);
  if(ownerLogo&&graphic.brand!=="njpw"&&graphic.brand!=="cmll"){
   ownerLogo.classList.add("ppw-calendar-promoter-logo");
   ownerLogo.onload=()=>{identity.dataset.logoReady="true";};
   ownerLogo.onerror=()=>{ownerLogo.remove();delete identity.dataset.logoReady;};
   identity.append(ownerLogo);
  }
  card.append(identity);
  return card;
 }
 function ownTile(s:ShowSeries,year:number,week:number,
  due:readonly ShowSeries[],owner?:string){
  const booking=calendarBookingForSeries(s,year,week,due,data?.bookings??[]);
  const actualName=booking?.showName??
   (s.eventType==="MAJOR"?premiumEdition(year,week)?.showName:null)??s.name;
  const card=eventTile(actualName,s.role,s.eventType,owner);
  // The annual calendar is a compact agenda; art remains on show/results.
  card.classList.add("ppw-calendar-event-compact");
  card.querySelector(".ppw-calendar-artwork-shell")?.remove();
  card.querySelector(".ppw-calendar-event-emblem")?.remove();
  card.querySelector(".ppw-calendar-owner-mark")?.remove();
  card.prepend(node("strong",actualName,"ppw-calendar-compact-title"));
  const slot=data?.broadcastSlot,index=weekIndex(year,week);
  if(s.eventType==="REGULAR"&&slot&&index>=slot.startWeekIndex&&index<=slot.endWeekIndex)
   card.append(node("span",slot.networkName+" · "+
    ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][slot.day-1]+" "+
    String(slot.hour).padStart(2,"0")+":00","ppw-calendar-tv-slot"));
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
    card.append(button(s.eventType==="REGULAR"&&slot&&index>=slot.startWeekIndex&&
     index<=slot.endWeekIndex?"Change venue":"Change venue / day",()=>port.openPlanner?.({
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
  head.append(button("Edit recurring schedule",()=>{
   manageExpanded=true;
   const section=root.querySelector<HTMLDetailsElement>(".ppw-calendar-management");
   if(section){
    section.open=true;
    section.scrollIntoView({behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?
     "auto":"smooth",block:"start"});
   }
  },busy));
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
    node("p",label(s.role)+" · Every "+s.cadenceWeeks+" weeks · Importance "+s.importance+" (advertised)"),
    node("small",(s.earnedPrestige??0)>0?
     "Earned prestige "+(s.earnedPrestige??0).toFixed(1)+
      " · "+(s.celebratedEditions??0)+" completed editions":
     "Tradition builds from completed editions — no artificial prestige boost",
     "ppw-calendar-tradition"));
   line.append(description,
    button("Edit",()=>{editing={...s};render();},!data.canEdit||busy));
   if(s.role!=="FLAGSHIP")line.append(button("Archive",()=>{
    if(window.confirm("Archive "+s.name+"?"))void change(s.seriesId);
   },!data.canEdit||busy));
   manage.append(line);
  }
  if(editing)manage.append(form());
  const management=document.createElement("details");
  management.className="ppw-calendar-management";
  management.open=manageExpanded||!!editing||!data.series.length;
  const manageSummary=node("summary","","ppw-calendar-management-toggle");
  manageSummary.append(node("strong","Manage recurring events"),
   node("span",data.series.length+" established series · Edit weekly shows and PPVs"));
  management.append(manageSummary,manage);
  management.addEventListener("toggle",()=>{manageExpanded=management.open;});
  const upcoming=node("section","","ppw-calendar-panel ppw-calendar-schedule");
  upcoming.append(node("span","ON THE BOOKING SHEET","ppw-calendar-schedule-kicker"),
   node("h2","Upcoming weeks"));
  const tabs=node("div","","ppw-calendar-view-tabs");
  tabs.setAttribute("role","group");tabs.setAttribute("aria-label","Calendar view");
  for(const [value,title] of [["mine","My shows"],["world","Across the World"]] as const){
   const option=button(title,()=>{mode=value;render();});
   option.setAttribute("aria-pressed",String(mode===value));tabs.append(option);
  }
  upcoming.append(tabs);
  if(mode==="mine"&&data.broadcastSlot){
   const tv=data.broadcastSlot,current=weekIndex(data.year,data.week);
   if(tv.endWeekIndex>=current){
    const line=node("div","","ppw-calendar-network-term");
    const regular=data.series.find(s=>s.role==="FLAGSHIP"&&s.active);
    const cadence=regular?.cadenceWeeks===1?"WEEKLY":
     regular?.cadenceWeeks===2?"ALTERNATE-WEEK":
     "EVERY "+(regular?.cadenceWeeks??"?")+" WEEKS";
    line.append(node("strong",cadence+" TELEVISION · "+tv.networkName),
     node("span",["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"][tv.day-1]+
      " · "+String(tv.hour).padStart(2,"0")+":00 · Fixed by your contract"),
     node("small","Only due broadcasts appear on the calendar. Your contracted day and time stay fixed."));
    upcoming.append(line);
   }
  }
  if(mode==="mine"){
   const filters=node("div","","ppw-calendar-type-tabs");
   for(const [selected,title] of [[false,"All events"],[true,"PPVs & specials"]] as const){
    const option=button(title,()=>{ppvOnly=selected;render();});
    option.setAttribute("aria-pressed",String(ppvOnly===selected));filters.append(option);
   }
   upcoming.append(filters);
   let rendered=0;
   for(const w of data.weeks.slice(0,6)){
    const shows=ppvOnly?w.shows.filter(s=>s.eventType==="MAJOR"):w.shows;
    if(!shows.length)continue;
    const article=node("article","","ppw-calendar-occurrence"+
     (w.offset===0?" ppw-calendar-current":""));
    article.dataset.week=w.year+"-"+w.week;
    const heading=node("div","","ppw-calendar-week-head");
    heading.append(node("strong","YEAR "+w.year+" · WEEK "+w.week),
     ...(w.offset===0?[node("span","THIS WEEK","ppw-calendar-now")]:[]));
    article.append(heading);
    for(const s of shows)article.append(ownTile(s,w.year,w.week,w.shows));
    upcoming.append(article);rendered++;
   }
   if(!rendered)upcoming.append(node("p",ppvOnly?
    "No PPVs or specials are due in the next six weeks.":
    "No shows are due in the next six weeks.",
    "ppw-calendar-empty"));

  }else{
   upcoming.append(node("p","See what rival promotions have announced. Their venues and future match cards remain under wraps."));
   const filters=node("div","","ppw-calendar-type-tabs");
   for(const [selected,title] of [[false,"All events"],[true,"PPVs & specials"]] as const){
    const option=button(title,()=>{ppvOnly=selected;render();});
    option.setAttribute("aria-pressed",String(ppvOnly===selected));filters.append(option);
   }
   upcoming.append(filters);
   let rendered=0;
   for(const w of data.worldWeeks??[]){
    const visible=ppvOnly?w.events.filter(e=>e.eventType==="MAJOR"):w.events;
    if(!visible.length)continue;
    const article=node("article","","ppw-calendar-occurrence"+
     (w.offset===0?" ppw-calendar-current":""));
    article.dataset.week=w.year+"-"+w.week;
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
    upcoming.append(article);rendered++;
   }
   if(!rendered)upcoming.append(node("p",ppvOnly?
    "No rival premium events or specials have been announced in this window.":
    "The World has no public event announcements in this window.",
    "ppw-calendar-empty"));
  }
  const yearly=annualPlanner();
  if(yearly)root.append(yearly,upcoming,management);
  else root.append(upcoming,management);
 }
 void load();
}
