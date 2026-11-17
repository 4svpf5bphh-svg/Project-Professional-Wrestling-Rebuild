import {activateWorkspaceRoot} from "./workspace-root.js";
import type {PlannerView,PlannerWeek,PlanWeekInput} from "../db/planner-workspace.js";
import type {CreativeWeekOutline} from "../domain/creative-outline.js";
import {createAnimatedEventPoster} from "./animated-event-poster.js";
import {createBroadcastPackageFrame} from "./broadcast-package-frame.js";
import type {CalendarPlanningTarget} from "./world-calendar.js";
import {venuePressureCount,freeVenueDays} from "./planner-venue-pressure.js";
import {buildSixWeekProduction,type SixWeekBuild} from "../domain/six-week-production-board.js";
export interface PlannerPort {
 load():Promise<PlannerView>;
 save(input:Omit<PlanWeekInput,"worldId"|"promotionId"|"playerId">):Promise<unknown>;
 saveCreativeOutline?(input:{requestId:string;expectedRevision:number;
  notes:CreativeWeekOutline[]}):Promise<unknown>;
 openCard(draftId:string,programmeId?:string):void;
 openCalendar?():void;
 openDeals?(target?:CalendarPlanningTarget):void;
}
const node=(tag:string,text="",className="")=>{
 const x=document.createElement(tag);x.textContent=text;x.className=className;return x;};
export function mountPlanner(root:HTMLElement,port:PlannerPort,onBack?:()=>void,
 openUnfinishedCard=false,initialTarget?:CalendarPlanningTarget){
 let cardRoutePending=openUnfinishedCard;
 let focusTarget=initialTarget;
 let data:PlannerView|null=null,error="",busy=false,editing:PlannerWeek|null=null;
 let selectedDraft="",marketId="",venueId="",day=5,strategy:PlanWeekInput["ticketStrategy"]="STANDARD";
 let selectedSeriesId="";
 // Retain the exact World command identity if the server committed a plan
 // but the mobile connection died before the receipt reached the browser.
 let pendingSave:{fingerprint:string;requestId:string}|null=null;
 let pendingOutline:{fingerprint:string;requestId:string}|null=null;
 let pendingStoryProgrammeId:string|null=null;
 const outlinedNotes=new Map<string,string>();
 let outlineExpanded=false;
 const button=(label:string,action:()=>void,disabled=false)=>{
  const b=node("button",label,"ppw-planner-button") as HTMLButtonElement;
  b.type="button";b.disabled=disabled;b.onclick=action;return b;};
 const formatMoney=(n:number)=>new Intl.NumberFormat("en-GB",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(n);
 async function refresh(){
  busy=true;draw();let navigated=false;
  try{
   data=await port.load();error="";
   if(focusTarget){
    const target=focusTarget;focusTarget=undefined;
    const week=data.weeks.find(w=>w.year===target.year&&w.week===target.week);
    const draft=week?.shows.find(s=>s.draftId===target.draftId||
     (!!s.showSeriesId&&s.showSeriesId===target.seriesId));
    const scheduled=week?.scheduled.some(s=>s.seriesId===target.seriesId);
    if(week?.canEdit&&(draft?.status==="DRAFT"||!draft&&(scheduled||!target.seriesId))){
     edit(week,draft,target.seriesId);
    }else if(!week)error="This event is outside the advance booking window.";
    else if(draft?.status==="SUBMITTED")error="This show has already been submitted.";
    else error="This event is no longer available for planning.";
   }
   if(cardRoutePending){
    cardRoutePending=false;
    const unfinished=data.weeks.find(w=>w.offset===0)?.shows.filter(s=>
     s.status==="DRAFT"&&!s.ready)??[];
    // Optional premiums cannot displace the compulsory normal broadcast.
    const draft=unfinished.find(s=>s.bookingClass==="REGULAR")??unfinished[0];
    if(draft&&data.canEdit){
     navigated=true;port.openCard(draft.draftId);return;
    }
    error="There isn't an unfinished show card this week. Check your schedule below.";
   }
  }catch(e){error=e instanceof Error?e.message:"Planner unavailable";}
  finally{busy=false;if(!navigated)draw();}
 }
 async function save(){
  if(!data||!editing||busy)return;
  const venue=data.venues.find(v=>v.venueId===venueId);
  if(!venue){error="Choose a venue.";draw();return;}
  const input:Omit<PlanWeekInput,"worldId"|"promotionId"|"playerId"|"requestId">={
   expectedRevision:data.worldRevision,
   year:editing.year,week:editing.week,
   eventType:editing.scheduled.find(s=>s.seriesId===selectedSeriesId)?.eventType??"REGULAR",
   showSeriesId:selectedSeriesId||undefined,
   day,venueId,marketId:venue.marketId,ticketStrategy:strategy,
   ...(selectedDraft?{draftId:selectedDraft}:{})
  };
  const fingerprint=JSON.stringify(input);
  if(!pendingSave||pendingSave.fingerprint!==fingerprint)
   pendingSave={fingerprint,requestId:crypto.randomUUID()};
  const requestId=pendingSave.requestId;
  busy=true;error="";draw();
  let openAfterSave:{draftId:string;programmeId:string}|null=null;
  try{
   const response=await port.save({requestId,...input});
   const status=response&&typeof response==="object"&&"status" in response?
    response.status:null;
   if(status==="STALE"){
    // The other manager changed the World. This edit stays visible and cannot
    // accidentally claim success or replace the booker's chosen venue/day.
    pendingSave=null;
    data=await port.load();
    editing=data.weeks.find(w=>w.year===input.year&&w.week===input.week)??editing;
    throw new Error("Plans have changed. Review the updated schedule before saving.");
   }
   if(status!=="APPLIED"&&status!=="REPLAYED")
    throw new Error("The show was not confirmed. Retry without changing your choices.");
   // If the acknowledgement arrived but refreshing failed, the *same*
   // requestId can be retried and safely REPLAYED, never creating a second
   // weekly/PPV draft or charging twice.
   const refreshed=await port.load();
   if(pendingStoryProgrammeId){
    const planned=refreshed.weeks.find(w=>w.year===input.year&&w.week===input.week)?.
     shows.find(show=>show.status==="DRAFT"&&
      (!input.showSeriesId||show.showSeriesId===input.showSeriesId)&&
      (!input.draftId||show.draftId===input.draftId));
    if(planned)openAfterSave={draftId:planned.draftId,programmeId:pendingStoryProgrammeId};
   }
   data=refreshed;editing=null;selectedDraft="";pendingSave=null;
   pendingStoryProgrammeId=null;error="";
  }catch(e){error=e instanceof Error?e.message:"Could not save show";}
  finally{busy=false;if(!openAfterSave)draw();}
  if(openAfterSave)port.openCard(openAfterSave.draftId,openAfterSave.programmeId);
 }
 function edit(week:PlannerWeek,draft?:PlannerWeek["shows"][number],
  seriesId="",storyProgrammeId:string|null=null){
  pendingSave=null;pendingStoryProgrammeId=storyProgrammeId;
  editing=week;selectedDraft=draft?.draftId??"";
  selectedSeriesId=draft?.showSeriesId??seriesId;
  venueId=draft?.venueId??data?.venues.find(v=>v.home)?.venueId??data?.venues[0]?.venueId??"";
  marketId=data?.venues.find(v=>v.venueId===venueId)?.marketId??"";
  const selected=week.scheduled.find(x=>x.seriesId===selectedSeriesId);
  const premium=draft?.bookingClass==="PREMIUM"||selected?.eventType==="MAJOR";
  const slot=data?.broadcastSlot,index=(week.year-1)*52+week.week-1;
  const fixed=!premium&&slot&&index>=slot.startWeekIndex&&index<=slot.endWeekIndex;
  // If weekly TV owns Saturday, the premium weekend opener belongs
  // on Sunday instead. Saturday/Sunday remain changeable by the player.
  const saturdayTv=week.shows.some(x=>x.bookingClass==="REGULAR"&&x.day===6)||
   Boolean(slot&&index>=slot.startWeekIndex&&index<=slot.endWeekIndex&&slot.day===6);
  day=fixed?slot.day:draft?.day??(premium?(saturdayTv?7:6):5);
  strategy=draft?.ticketStrategy??"STANDARD";draw();
 }
 const outlineKey=(year:number,week:number)=>year+"-"+week;
 function outlineNotes():CreativeWeekOutline[]{
  if(!data)return [];
  return data.weeks.flatMap(w=>{
   const fromServer=data!.creativeOutline?.find(n=>
    n.year===w.year&&n.week===w.week)?.note??"";
   const note=(outlinedNotes.get(outlineKey(w.year,w.week))??fromServer).trim();
   return note?[{year:w.year,week:w.week,note}]:[];
  });
 }
 async function saveOutline(){
  if(!data||busy||!port.saveCreativeOutline)return;
  const notes=outlineNotes();
  const fingerprint=JSON.stringify({revision:data.worldRevision,notes});
  if(!pendingOutline||pendingOutline.fingerprint!==fingerprint)
   pendingOutline={fingerprint,requestId:crypto.randomUUID()};
  const requestId=pendingOutline.requestId;
  busy=true;error="";draw();
  try{
   const outcome=await port.saveCreativeOutline({
    requestId,expectedRevision:data.worldRevision,notes});
   const status=outcome&&typeof outcome==="object"&&"status" in outcome?
    outcome.status:null;
   if(status==="STALE"){
    pendingOutline=null;data=await port.load();
    throw new Error("The World changed. Review your outline and save again.");
   }
   if(status!=="APPLIED"&&status!=="REPLAYED")
    throw new Error("Creative outline was not confirmed. Retry to keep your plan.");
   data=await port.load();
   pendingOutline=null;outlinedNotes.clear();outlineExpanded=false;error="";
  }catch(e){error=e instanceof Error?e.message:"Unable to save creative outline";}
  finally{busy=false;draw();}
 }
 function outlineEditor(){
  const section=node("section","","ppw-planner-outline");
  const notes=data?.creativeOutline??[];
  section.append(node("h3","Booker's creative outline"),
   node("p","Record what you intend to build. These notes do not book wrestlers, "+
    "guarantee results or charge appearance fees.","ppw-planner-board-summary"));
  const toggle=button(outlineExpanded?"Hide outline editor":
   notes.length?"Edit "+notes.length+" week notes":"Plan future story beats",()=>{
    outlineExpanded=!outlineExpanded;draw();},busy);
  section.append(toggle);
  if(!outlineExpanded){
   for(const note of notes)section.append(
    node("p","Week "+note.week+" · "+note.note,"ppw-planner-outline-note"));
   return section;
  }
  for(const week of data?.weeks??[]){
   const label=node("label","","ppw-planner-outline-label");
   label.append(node("span","Year "+week.year+" · Week "+week.week+
    (week.major?" · PPV week":"")));
   const area=document.createElement("textarea");
   area.maxLength=240;area.rows=2;area.disabled=busy||!data?.canEdit;
   area.setAttribute("aria-label","Creative intention for Year "+week.year+
    " Week "+week.week);
   const key=outlineKey(week.year,week.week);
   area.value=outlinedNotes.get(key)??notes.find(n=>
    n.year===week.year&&n.week===week.week)?.note??"";
   area.placeholder="e.g. Build tension before the title match";
   area.oninput=()=>{outlinedNotes.set(key,area.value);pendingOutline=null;};
   label.append(area);section.append(label);
  }
  if(port.saveCreativeOutline)section.append(button(busy?"Saving…":
   "Save six-week outline",()=>void saveOutline(),busy||!data?.canEdit));
  return section;
 }
 function buildBoard(snapshot:SixWeekBuild){
  const source=data!;
  const section=node("section","","ppw-planner-production-board");
  section.setAttribute("aria-label","Six-week booking and PPV build");
  section.append(node("span","YOUR NEXT SIX WEEKS","ppw-planner-board-kicker"),
   node("h2","Production board"));
  const summary=node("p",
   snapshot.preparedShows+" prepared for World Lock · "+
   snapshot.submittedShows+" submitted · "+
   snapshot.needsActionWeeks+" week"+(snapshot.needsActionWeeks===1?"":"s")+
   " need booking or confirmation. Prepared drafts stay drafts.",
   "ppw-planner-board-summary");
  section.append(summary);
  if(snapshot.nextPremium){
   const ppv=snapshot.nextPremium;
   const event=node("p",
    "Next PPV: "+ppv.name+" · Year "+ppv.year+" Week "+ppv.week+
    " · "+(ppv.offset===0?"This week":ppv.offset===1?"Next week":"In "+ppv.offset+" weeks"),
    "ppw-planner-board-premium");
   section.append(event);
  }else{
   section.append(node("p","No confirmed PPV falls within this booking window. "+
    "Your annual calendar controls premium event dates.","ppw-planner-board-summary"));
  }
  const tiles=node("div","","ppw-planner-board-weeks");
  tiles.setAttribute("aria-label","Select a booking week");
  for(const week of snapshot.weeks){
   const tile=button("",()=>{
    const target=root.querySelector<HTMLElement>("#ppw-planner-week-"+week.key);
    if(target){target.scrollIntoView({block:"start"});target.focus({preventScroll:true});}
   },busy);
   tile.classList.add("ppw-planner-board-tile");
   tile.dataset.state=week.state;
   tile.dataset.premium=String(week.isPremium);
   tile.setAttribute("aria-label","Year "+week.year+" Week "+week.week+
    ", "+(week.premiumName?"PPV "+week.premiumName+", ":"")+week.label);
   tile.replaceChildren(
    node("strong","W"+week.week),
    node("small","Y"+week.year+(week.isPremium?" · PPV":" · TV")),
    node("span",week.label,"ppw-planner-board-state"));
   tiles.append(tile);
  }
  section.append(tiles);
  if(snapshot.programmes.length){
   const stories=node("section","","ppw-planner-stories");
   stories.append(node("h3","Storyline build"),
    node("p","Active Programmes stay visible even before their next chapter is booked. "+
     "Only actual linked matches and angles count as chapters; drafts remain provisional.",
     "ppw-planner-board-summary"));
   for(const lane of snapshot.programmes){
    const row=node("div","","ppw-planner-story-lane");
    row.append(node("strong",lane.name,"ppw-planner-story-title"));
    if(!lane.chapters.length)row.append(node("small",
     "No future chapters booked yet","ppw-planner-story-empty"));
    const weeks=node("div","","ppw-planner-story-weeks");
    for(const week of snapshot.weeks){
     const chapter=lane.chapters.find(c=>c.year===week.year&&c.week===week.week);
     const scheduled=source.weeks.find(w=>w.year===week.year&&w.week===week.week);
     const editable=scheduled?.canEdit===true&&source.canEdit;
     const draft=editable?scheduled?.shows.find(show=>
      show.draftId===chapter?.editableDraftId&&show.status==="DRAFT"&&show.venueId)??(
       !chapter?scheduled?.shows.find(show=>show.status==="DRAFT"&&show.venueId):undefined):undefined;
     const missing=editable&&!draft&&!chapter?scheduled?.scheduled.find(event=>
      !scheduled.shows.some(show=>show.bookingClass===
       (event.eventType==="MAJOR"?"PREMIUM":"REGULAR"))):undefined;
     const label=chapter?(chapter.finalePayoff?"Finale":
      chapter.matches&&chapter.segments?"Match + angle":
      chapter.matches?"Match":"Angle"):(draft||missing?"Plan":"—");
     const cell=draft||missing?
      button(label,()=>{
       if(draft)port.openCard(draft.draftId,lane.programmeId);
       else if(scheduled&&missing)edit(scheduled,undefined,missing.seriesId,
        lane.programmeId);
      },busy):node("span",label);
     cell.classList.add("ppw-planner-story-beat");
     if(draft||missing)cell.classList.add("ppw-planner-story-action");
     cell.dataset.submitted=String(chapter?.submitted??false);
     cell.dataset.hasChapter=String(Boolean(chapter));
     cell.dataset.finale=String(Boolean(chapter?.finalePayoff));
     cell.title="Year "+week.year+" Week "+week.week+(chapter?
      (chapter.finalePayoff?" · Planned on-screen payoff":"")+
      (chapter.submitted?" · Submitted":" · Draft"):" · No chapter booked");
     if(draft||missing)cell.setAttribute("aria-label",
      (chapter?"Edit booked storyline chapter":"Book a storyline chapter")+
      " · "+lane.name+" · Year "+week.year+" Week "+week.week);
     weeks.append(cell);
    }
    row.append(weeks);stories.append(row);
   }
   if(snapshot.programmeCount>snapshot.programmes.length)
    stories.append(node("p","Showing "+snapshot.programmes.length+" of "+
     snapshot.programmeCount+" active or booked Programmes.","ppw-planner-board-summary"));
   section.append(stories);
  }else{
   section.append(node("p","Create a Programme or book a match or angle linked "+
    "to an existing storyline to build your next PPV.",
    "ppw-planner-board-summary"));
  }
  section.append(outlineEditor());
  const pending=source.weeks.find(w=>w.canEdit&&(
   w.shows.some(show=>show.status==="DRAFT"&&!show.ready)||
   w.scheduled.some(event=>!w.shows.some(show=>show.bookingClass===
    (event.eventType==="MAJOR"?"PREMIUM":"REGULAR")))||
   !w.shows.length&&w.required));
  if(pending){
   const draft=pending.shows.find(show=>show.status==="DRAFT"&&!show.ready&&show.venueId);
   const unplanned=pending.scheduled.find(s=>!pending.shows.some(show=>
    show.bookingClass===(s.eventType==="MAJOR"?"PREMIUM":"REGULAR")));
   const action=draft?()=>port.openCard(draft.draftId):()=>edit(pending,undefined,
    unplanned?.seriesId??pending.scheduled[0]?.seriesId??"");
   section.append(button(draft?"Continue Week "+pending.week+" card":
    "Plan Week "+pending.week+" show",action,busy||!source.canEdit||!draft&&!source.venues.length));
  }
  return section;
 }
 function draw(){
  activateWorkspaceRoot(root,"ppw-planner");root.replaceChildren();
  const header=node("header","","ppw-planner-header");
  if(onBack)header.append(button("← Back",onBack));
  if(port.openCalendar)header.append(button("Show Calendar",()=>port.openCalendar?.()));
  header.append(node("h1","Show Planner"),
   node("p","Choose a venue, set your show date and build the card. Six weeks are available."));
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
  const progress=buildSixWeekProduction(data.weeks,data.activeProgrammes??[]);
  if(!editing)root.append(buildBoard(progress));
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
    const competing=venuePressureCount(data!,editing.year,editing.week,day,v.venueId);
    option.textContent=v.name+" · "+v.capacity.toLocaleString("en-GB")+
     " seats · "+formatMoney(v.weeklyHireCost)+" hire"+
     (competing?" · Other interest: "+competing:"");
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
   const selected=editing.scheduled.find(x=>x.seriesId===selectedSeriesId);
   const premium=selected?.eventType==="MAJOR"||
    editing.shows.find(x=>x.draftId===selectedDraft)?.bookingClass==="PREMIUM";
   const contract=data.broadcastSlot,idx=(editing.year-1)*52+editing.week-1;
   const fixed=!premium&&contract&&idx>=contract.startWeekIndex&&idx<=contract.endWeekIndex;
   if(fixed)day=contract.day;
   const weekdays=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
   form.append(node("label",fixed?"Contracted TV day":"Show day"));
   if(fixed){
    const lock=node("div",weekdays[contract.day-1]+" · "+
     String(contract.hour).padStart(2,"0")+":00","ppw-planner-day-locked");
    lock.setAttribute("aria-label","Contracted TV day: "+weekdays[contract.day-1]+
     " at "+String(contract.hour).padStart(2,"0")+":00");
    form.append(lock,node("p",contract.networkName+" · Fixed by your broadcast agreement.",
     "ppw-planner-calendar-label"));
    if(port.openDeals)form.append(button("Request another broadcast day",()=>
     port.openDeals?.({year:editing!.year,week:editing!.week,
      seriesId:selectedSeriesId,...(selectedDraft?{draftId:selectedDraft}:{})})));
   }else{
    const choices=node("div","","ppw-planner-day-grid");
    choices.setAttribute("role","group");choices.setAttribute("aria-label","Show day");
    for(let d=1;d<=7;d++){
     const pick=button(weekdays[d-1]!,()=>{day=d;draw();},busy);
     pick.classList.add("ppw-planner-day-choice");
     pick.setAttribute("aria-pressed",String(day===d));
     choices.append(pick);
    }
    form.append(choices);
    if(premium)form.append(node("p",
     "PPVs normally run on Saturday or Sunday. Any day is available.",
     "ppw-planner-calendar-label"));
   }
   const contenders=venuePressureCount(data,editing.year,editing.week,day,venueId);
   if(contenders){
    const warning=node("section","","ppw-planner-contention");
    warning.setAttribute("role","status");
    warning.append(node("strong","Other promotions are eyeing this venue"),
     node("p",contenders+" other "+(contenders===1?"promotion has":"promotions have")+
      " planned a show here on the same day. Neither booking has priority yet. "+
      "You can keep your choice, or avoid a possible clash."));
    const ownDays=new Set(editing.shows.filter(s=>s.draftId!==selectedDraft)
     .flatMap(s=>s.day===null?[]:[s.day]));
    const freeDays=freeVenueDays(data,editing.year,editing.week,venueId)
     .filter(d=>!ownDays.has(d));
    const alternative=fixed?undefined:freeDays.find(d=>d!==day);
    if(alternative){
     const dayName=["","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"][alternative];
     warning.append(button("Try "+dayName+" instead",()=>{day=alternative;draw();}));
    }
    const otherVenue=data.venues.find(v=>v.marketId===marketId&&v.venueId!==venueId&&
     venuePressureCount(data!,editing!.year,editing!.week,day,v.venueId)===0);
    if(otherVenue)warning.append(button("Choose "+otherVenue.name+" instead",()=>{
     venueId=otherVenue.venueId;draw();
    }));
    form.append(warning);
   }else{
    form.append(node("p","No other promotion currently has a show planned at this "+
     "venue on this day. Venue arrangements remain provisional until the booking deadline.",
     "ppw-planner-venue-clear"));
   }
   const ticket=document.createElement("select");ticket.setAttribute("aria-label","Ticket strategy");
   for(const value of ["ACCESSIBLE","STANDARD","PREMIUM","PRESTIGE"] as const){
    const opt=document.createElement("option");opt.value=value;opt.textContent=value.toLowerCase();ticket.append(opt);
   }
   ticket.value=strategy;ticket.onchange=()=>{strategy=ticket.value as typeof strategy;};
   form.append(node("label","Ticket strategy"),ticket,
    button(busy?"Saving…":"Save show",()=>void save(),busy),
    button("Cancel",()=>{editing=null;pendingSave=null;draw();},busy));
   root.append(form);return;
  }
  for(const week of data.weeks){
   const card=node("section","","ppw-planner-week");
   card.id="ppw-planner-week-"+week.year+"-"+week.week;
   card.tabIndex=-1;
   const state=progress.weeks.find(w=>w.year===week.year&&w.week===week.week)?.state;
   const status=state==="SUBMITTED"?"SUBMITTED":
    state==="READY_FOR_LOCK"?"PREPARED FOR WORLD LOCK":
    state==="CARD_IN_PROGRESS"?"FINISH YOUR CARD":
    state==="PARTIALLY_BOOKED"?"BOOKING IN PROGRESS":
    week.required?"SHOW NEEDS PLANNING":"NO SHOW PLANNED";
   card.dataset.bookingState=state==="SUBMITTED"||state==="READY_FOR_LOCK"?"ready":
    state==="CARD_IN_PROGRESS"?"attention":
    state==="PARTIALLY_BOOKED"?"booked":"empty";
   card.append(node("span",status,"ppw-planner-booking-state"));
   card.append(node("h2","Year "+week.year+" · Week "+week.week),
    node("p",week.major?"Major event week":week.required?"Regular show week":"Optional show week"));
   const contracted=data.broadcastSlot,weekIndex=(week.year-1)*52+week.week-1;
   if(contracted&&weekIndex>=contracted.startWeekIndex&&weekIndex<=contracted.endWeekIndex)
    card.append(node("span",contracted.networkName+" · Weekly TV "+
     ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][contracted.day-1]+" "+
     String(contracted.hour).padStart(2,"0")+":00","ppw-planner-week-tv-slot"));
   if(week.scheduled?.length)card.append(node("p",
    "On the calendar: "+week.scheduled.map(s=>s.name+" ("+
     (s.role==="FLAGSHIP"?"A":s.role==="SECONDARY"?"B":s.role==="PREMIUM"?"PPV":s.role)+")").join(" · "),
    "ppw-planner-calendar-label"));
   for(const show of week.shows){
     const posterShell=node("div","","ppw-planner-event-shell");
     posterShell.dataset.premium=String(show.bookingClass==="PREMIUM");
     posterShell.append(node("span",show.bookingClass==="PREMIUM"?"PREMIUM EVENT":"WEEKLY SHOW","ppw-event-type-line"),
      node("strong",show.showName,"ppw-dynamic-event-heading"),
      node("small",data.promotionName,"ppw-event-promoter-line"));
     const animated=show.bookingClass==="PREMIUM"?createAnimatedEventPoster({
      style:show.posterStyle??data.eventPosterStyle,eventName:show.showName,promotionName:data.promotionName,
      compact:true}):null;
     const television=show.bookingClass==="REGULAR"?createBroadcastPackageFrame({
      style:data.broadcastPackage,kind:"OPEN",show:show.showName,
      promotion:data.promotionName,compact:true}):null;
     card.append(animated??television??posterShell);
    const dayName=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][(show.day??0)-1];
    card.append(node("p",show.showName+" · "+
     (dayName??"Day unassigned")+" · "+(show.venueName??"Venue not chosen")+" · "+
     (show.marketName??"Market not chosen")+" · "+show.slots+" card slots"+
     (show.status==="SUBMITTED"?" · Submitted":show.ready?" · Prepared for World Lock":" · Draft")));
    const competing=show.venueId&&show.day!==null?
     venuePressureCount(data,week.year,week.week,show.day,show.venueId):0;
    if(competing)card.append(node("p",competing+" other "+
     (competing===1?"promotion is":"promotions are")+
     " planning to use this venue on the same day. The venue remains contested "+
     "until bookings close.","ppw-planner-week-contention"));
    if(week.canEdit&&show.status==="DRAFT"&&show.venueId)
     card.append(button("Edit card",()=>port.openCard(show.draftId),busy));
    else if(show.status==="SUBMITTED")
     card.append(node("p","Submitted · read-only."));
    else if(!show.venueId)card.append(node("p","Confirm a venue to start booking the card."));
    else if(!week.canEdit)card.append(node("p","Booking is closed during World Lock."));
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
