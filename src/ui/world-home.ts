/** PPW's iPhone-first landing surface. Uses an existing small overview read,
 * never polls, advances time, or invents future show and finance outcomes.
 */
import {promotionBrand} from "./broadcast-identity.js";
import {createBroadcastPackageFrame} from "./broadcast-package-frame.js";
import {createPromoterPrestigeCrest} from "./promoter-prestige-crest.js";
import type {HomeCompletedShow,HomeUpcomingShow,PlayerWorldOverview} from "../db/player-world-overview.js";
export interface WorldHomePort{
 load():Promise<PlayerWorldOverview|null>;
 /** Only enabled for the selected private preview operator. Never on a timer. */
 manualAdvance?:(year:number,week:number)=>Promise<{
  status:"PUBLISHED"|"BLOCKED"|"LIMIT_REACHED";blockers:string[]}>;
 extendBooking?:(year:number,week:number)=>Promise<{status:string}>;
 onWeekPublished?():Promise<void>;
 claimWeeklyKP?():Promise<{awarded:number;reason?:string}>;
 openLegends?():void;openKayfabe?():void;openAchievements?():void;
 planner():void;roster():void;market():void;contracts():void;
 openUnfinishedCard?():void;openUpcomingShow?(showId:string):void;openUnreadBackstage?():void;
 openBackstageThread?(personId:string,unread:boolean):void;
 contractsExpiring?():void;contractsPending?():void;
 backstage():void;results():void;openCompletedShow?(showId:string):void;business():void;staff():void;
 ratingsWar?():void;
 industry():void;calendar():void;championships():void;news?():void;
 dismissAttention?(attentionId:string):Promise<unknown>;
 dismissAttentionBatch?(attentionIds:string[]):Promise<unknown>;
 openWrestler?(personId:string):void;
}
const el=(tag:string,cls="",label="")=>{
 const node=document.createElement(tag);node.className=cls;
 node.textContent=label;return node;
};
function homeEventFormat(show:HomeCompletedShow|HomeUpcomingShow):string{
 return show.broadcastFormat??(show.bookingClass==="PREMIUM"?"Premium event":"Regular event");
}
export function mountWorldHome(root:HTMLElement,port:WorldHomePort,initialOverview?:PlayerWorldOverview){
 let overview:PlayerWorldOverview|null=initialOverview??null;
 let loading=false,error="",loaded=!!initialOverview;
 let progressedFrom:{year:number;week:number}|null=null;
 let expiredOnScreen:string|null=null;
 let claimingKP=false;
 const dismissing=new Set<string>();
 let clearing=false;
 let clockTimer:ReturnType<typeof setInterval>|null=null;
 function clearClock(){if(clockTimer!==null){clearInterval(clockTimer);clockTimer=null;}}
 function startClock(node:HTMLElement,world:PlayerWorldOverview["world"],
  onDeadline:()=>void){
  if(world.phase!=="OPEN"||!Number.isFinite(world.nextLockEpoch)||
   !Number.isFinite(world.serverEpoch))return;
  const origin=Date.now(),serverStart=world.serverEpoch;
  const tick=()=>{
   if(!root.isConnected||!root.contains(node)){clearClock();return;}
   const seconds=Math.max(0,Math.ceil(world.nextLockEpoch-
    (serverStart+(Date.now()-origin)/1000)));
   if(seconds===0){node.textContent="Booking deadline reached · check World status";
    onDeadline();clearClock();return;}
   const days=Math.floor(seconds/86400),hours=Math.floor(seconds%86400/3600),
    mins=Math.floor(seconds%3600/60),secs=seconds%60;
   node.textContent="Booking closes in "+(days?days+"d ":"")+
    String(hours).padStart(2,"0")+":"+String(mins).padStart(2,"0")+
    ":"+String(secs).padStart(2,"0");
  };
  tick();clockTimer=setInterval(tick,1000);
 }
 const control=(title:string,summary:string,action:()=>void,icon:string)=>{
  const b=el("button","ppw-home-tile") as HTMLButtonElement;
  b.type="button";b.onclick=action;
  b.append(el("span","ppw-home-icon",icon));
  const content=el("span","ppw-home-tile-copy");
  content.append(el("strong","",title));
  if(summary)content.append(el("small","",summary));
  b.append(content,el("span","ppw-home-arrow","→"));
  return b;
 };
 async function load(){
  if(loading)return;
  loading=true;draw();
  try{
   const previous=overview?.world;
   const updated=await port.load();
   if(updated&&previous){
    const before=(previous.year-1)*52+previous.week;
    const after=(updated.world.year-1)*52+updated.world.week;
    if(after>before)progressedFrom={year:previous.year,week:previous.week};
   }
   overview=updated;error="";loaded=true;
  }
  catch(e){error=e instanceof Error?e.message:"Your promotion is unavailable";}
  finally{loading=false;draw();}
 }
 async function dismissNews(id:string){
  if(!port.dismissAttention||dismissing.has(id)||clearing)return;
  dismissing.add(id);
  try{
   await port.dismissAttention(id);
   const news=overview?.promotion?.attention?.offerResults;
   if(news)overview!.promotion!.attention.offerResults=news.filter(x=>x.id!==id);
   const dates=overview?.promotion?.attention?.dateDecisions;
   if(dates)overview!.promotion!.attention.dateDecisions=dates.filter(x=>x.id!==id);
   const backstage=overview?.promotion?.attention?.backstageResults;
   if(backstage)overview!.promotion!.attention.backstageResults=
    backstage.filter(x=>x.id!==id);
   const injuries=overview?.promotion?.attention?.injuryNews;
   if(injuries)overview!.promotion!.attention.injuryNews=injuries.filter(x=>x.id!==id);
   const clearance=overview?.promotion?.attention?.medicalClearances;
   if(clearance)overview!.promotion!.attention.medicalClearances=
    clearance.filter(x=>x.id!==id);
   const titles=overview?.promotion?.attention?.titleNews;
   if(titles)overview!.promotion!.attention.titleNews=titles.filter(x=>x.id!==id);
   const business=overview?.promotion?.attention?.businessUpdates;
   if(business)overview!.promotion!.attention.businessUpdates=
    business.filter(x=>x.id!==id);
   error="";
  }catch(e){error=e instanceof Error?e.message:"Unable to dismiss the update";}
  finally{dismissing.delete(id);draw();}
 }
 async function clearResolvedUpdates(){
  if(!port.dismissAttentionBatch||clearing||dismissing.size)return;
  const attention=overview?.promotion?.attention;
  const keys=[...(attention?.offerResults??[]),...(attention?.dateDecisions??[]),
   ...(attention?.businessUpdates??[]).filter(x=>x.kind!=="COMMERCIAL_EXPIRED"&&
    (overview?((overview.world.year-x.year)*52+overview.world.week-x.week)<=2:true)),
   ...(attention?.titleNews??[]),
   ...(attention?.injuryNews??[]),...(attention?.medicalClearances??[])]
   .slice(0,10).map(item=>item.id);
  if(keys.length<2||keys.length>10)return;
  clearing=true;error="";draw();
  try{
   await port.dismissAttentionBatch(keys);
   const cleared=new Set(keys);
   if(attention){
    attention.offerResults=attention.offerResults?.filter(x=>!cleared.has(x.id));
    attention.dateDecisions=attention.dateDecisions?.filter(x=>!cleared.has(x.id));

    attention.businessUpdates=attention.businessUpdates?.filter(x=>!cleared.has(x.id));
    attention.titleNews=attention.titleNews?.filter(x=>!cleared.has(x.id));
    attention.injuryNews=attention.injuryNews?.filter(x=>!cleared.has(x.id));
    attention.medicalClearances=attention.medicalClearances?.filter(x=>!cleared.has(x.id));
   }
  }catch(e){error=e instanceof Error?e.message:"Could not clear the updates";}
  finally{clearing=false;draw();}
 }
 function draw(){
  clearClock();root.classList.add("ppw-home");root.replaceChildren();
  if(error)root.append(el("p","ppw-alert ppw-error",error));
  if(!loaded){
   root.append(el("p","ppw-home-small",loading?
    "Getting your promotion up to date…":"No promotion details are available."));
   if(!loading)root.append(control("Retry connection","Try the connection again",()=>void load(),"↻"));
   return;
  }
  if(!overview){
   root.append(el("p","ppw-home-small",
    "The selected promotion is unavailable. Return to the promotion list or sign in again."));
   root.append(control("Try again","Refresh promotion",()=>void load(),"↻"));
   return;
  }
  const {world,promotion}=overview;
  const key=world.year+":"+world.week;
  const deadlineDue=world.phase==="OPEN"&&(
   expiredOnScreen===key||
   (Number.isFinite(world.nextLockEpoch)&&Number.isFinite(world.serverEpoch)
    &&world.nextLockEpoch<=world.serverEpoch));
  const bookingOpen=world.phase==="OPEN"&&!deadlineDue;
  const masthead=el("header","ppw-home-head");
  const phaseText=deadlineDue?"LOCK DUE":world.phase==="OPEN"?"WORLD OPEN":
   world.phase==="LOCKED"?"CARDS LOCKED":world.phase==="UPDATING"?"WORLD UPDATING":"WORLD PROCESSING";
  const phase=el("strong","ppw-home-phase-tag",phaseText);
  phase.dataset.phase=deadlineDue?"due":world.phase.toLowerCase();
  masthead.append(phase,el("span","ppw-home-period",
   "Y"+world.year+" W"+world.week));
  root.append(masthead);
  const hero=el("section","ppw-home-hero ppw-home-hero-compact");
  hero.dataset.promotion=promotionBrand(promotion?.name??"").key;
  hero.setAttribute("aria-label","Your promotion and World status");
  hero.append(el("h2","ppw-home-promotion-name",
   promotion?.name??"Choose a promotion"));
  if(promotion?.promoterPrestige){
   const prestige=promotion.promoterPrestige;
   const crest=createPromoterPrestigeCrest({
    rank:prestige.rank,earned:prestige.earnedCount,
    total:prestige.total,finish:promotion.milestoneFrame,
    onOpen:port.openAchievements
   });
   crest.classList.add("ppw-home-prestige-small");
   const awards=el("span","ppw-home-achievement-badge",
    prestige.earnedCount+" / "+prestige.total);
   awards.setAttribute("aria-label",
    prestige.earnedCount+" of "+prestige.total+" achievements earned");
   // Keep rank copy full width on small iPhones: the badge shares the
   // eyebrow row rather than stealing a third grid column.
   const copy=crest.querySelector(".ppw-prestige-crest-copy");
   const eyebrow=copy?.querySelector(".ppw-prestige-crest-eyebrow");
   if(copy&&eyebrow){
    const header=el("span","ppw-home-prestige-header");
    eyebrow.replaceWith(header);
    header.append(eyebrow,awards);
   }else crest.append(awards);
   hero.append(crest);
  }
  if(!bookingOpen){
   const check=el("button","ppw-home-status-refresh",
    "Check World status") as HTMLButtonElement;
   check.type="button";check.disabled=loading;check.onclick=()=>void load();
   hero.append(check);
  }
  root.append(hero);
  // The booking-open cue stays prominent without expanding the prestige bar.
  // Actual server-supplied lock time remains authoritative.
  const booking=el("button","ppw-home-booking-strip") as HTMLButtonElement;
  booking.type="button";booking.dataset.phase=deadlineDue?"due":world.phase.toLowerCase();
  const copy=el("span","ppw-home-booking-copy");
  copy.append(el("strong","",bookingOpen?"BOOKING OPEN":
   deadlineDue?"BOOKING DEADLINE REACHED":
   world.phase==="LOCKED"?"BOOKING CLOSED":world.phase==="UPDATING"?"WORLD UPDATING":"WORLD PROCESSING"));
  const longTestWindow=bookingOpen&&Number.isFinite(world.nextLockEpoch)&&
   Number.isFinite(world.serverEpoch)&&world.nextLockEpoch-world.serverEpoch>30*86400;
  const detail=el("small","ppw-home-countdown",deadlineDue?"Booking deadline reached · check World status":
   bookingOpen&&longTestWindow?"Booking is open · finish your next card when ready":
   bookingOpen?"Booking closes soon · prepare your next show":
   world.phase==="UPDATING"?"Preparing results and news · plan your upcoming shows":
   "Your World will update after processing.");
  copy.append(detail);
  const scheduled=promotion?.upcomingShows??[];
  if(bookingOpen&&promotion?.attention?.plannedShows&&!promotion.attention.unpreparedShow&&
   scheduled.length&&scheduled.every(show=>show.year===world.year&&show.week===world.week&&
    (show.ready||show.status==="SUBMITTED"))){
   copy.append(el("small","ppw-home-booking-ready","Cards confirmed for this week"));
  }
  booking.append(el("span","ppw-home-booking-icon","▣"),copy,
   el("span","ppw-home-booking-arrow","→"));
  // The banner is an independent action. Its accessible name must not
  // duplicate the dedicated Check World status button at the lock boundary.
  if(world.phase==="UPDATING")booking.setAttribute("aria-label","Plan upcoming shows while World updates");
  else if(!bookingOpen)booking.setAttribute("aria-label",
   deadlineDue?"Review booking deadline":"Review World lock");
  booking.onclick=bookingOpen||world.phase==="UPDATING"?port.planner:()=>void load();
  root.append(booking);
  if(bookingOpen&&!longTestWindow)
   startClock(detail,world,()=>{expiredOnScreen=key;draw();});
  if(promotion){
   const dashboard=el("section","ppw-home-dashboard");
   dashboard.setAttribute("aria-label","Your show and Backstage");
   const next=promotion.nextShow,last=promotion.latestShow;
   const spotlight=el("section","ppw-home-show-spotlight");
   spotlight.setAttribute("aria-label","Your shows");
   const completed=promotion.latestShows??[];
   const upcoming=promotion.upcomingShows??[];
   const name=promotion.flagshipName??completed.find(s=>s.bookingClass==="REGULAR")?.showName??
    (completed.length?null:next?.showName??last?.showName)??"Weekly show";
   const featured=upcoming.find(s=>s.showName===name)??completed.find(s=>s.showName===name);
   const televised=featured?.broadcastFormat==="TV";
   const frame=createBroadcastPackageFrame({
    style:promotion.broadcastPackageStyle??null,
    promotion:promotion.name,show:name,kind:"OPEN",televised
   });
   if(frame){
    frame.classList.add("ppw-home-broadcast-frame");
    spotlight.dataset.broadcastPackage=frame.dataset.broadcastPackage??"standard";
    spotlight.append(frame);
   }else{
    const standard=el("div","ppw-home-standard-opening");
    standard.append(el("small","",televised?"PPW / ON AIR":"PPW / LIVE EVENTS"),
     el("strong","",name));
    spotlight.dataset.broadcastPackage="standard";
    spotlight.append(standard);
   }
   const eventRows=(label:string)=>{
    const section=el("section","ppw-home-event-list");
    section.setAttribute("aria-label",label);
    section.append(el("h3","",label));
    const rows=el("div","ppw-home-recent-shows");
    section.append(rows);spotlight.append(section);
    return rows;
   };
   if(upcoming.length){
    const first=upcoming[0]!;
    const rows=eventRows("Upcoming · Y"+first.year+" W"+first.week);
    for(const show of upcoming){
     const format=homeEventFormat(show);
     const status=show.status==="SUBMITTED"?"Submitted":show.ready?"Ready":
      !show.hasVenue?"Choose venue":bookingOpen?"Edit card":"View card";
     const action=show.hasVenue&&port.openUpcomingShow?
      ()=>port.openUpcomingShow!(show.showId):port.calendar;
     const tile=control(show.showName,format+" · "+status,action,"▶");
     tile.classList.add("ppw-home-recent-show");
     tile.dataset.bookingClass=show.bookingClass.toLowerCase();
     rows.append(tile);
    }
   }
   if(completed.length&&port.openCompletedShow){
    const first=completed[0]!;
    const rows=eventRows("Latest results · Y"+first.year+" W"+first.week);
    for(const show of completed){
     const format=homeEventFormat(show);
     const tile=control(show.showName,format+" · "+Math.round(show.crowdResponse)+"/100 crowd",
      ()=>port.openCompletedShow!(show.showId),"◀");
     tile.classList.add("ppw-home-recent-show");
     tile.dataset.bookingClass=show.bookingClass.toLowerCase();
     tile.setAttribute("aria-label","Read "+show.showName+" · "+format);
     rows.append(tile);
    }
   }
   const showControls=el("div","ppw-home-show-controls");
   const hasDirectResults=completed.length>0&&!!port.openCompletedShow;
   const lastShow=control(hasDirectResults?"Results archive":"Last Show","",port.results,"◀");
   lastShow.classList.add("ppw-home-show-last");
   lastShow.setAttribute("aria-label",hasDirectResults?"Results archive":last?
    "Last show · LATEST CERTIFIED SHOW · "+last.showName:"Last show · RESULTS ARCHIVE");
   const nextShow=control(upcoming.length?"Show calendar":"Next Show","",
    upcoming.length?port.calendar:
    next&&!next.ready?(port.openUnfinishedCard??port.planner):port.planner,"▶");
   nextShow.classList.add("ppw-home-show-next");
   if(next?.ready&&!upcoming.length)nextShow.dataset.ready="true";
   showControls.append(lastShow,nextShow);spotlight.append(showControls);
   dashboard.append(spotlight);
   // The genuine player-private unread count is already in this one overview
   // snapshot. Never trigger a second Home database read.
   const unread=promotion.attention?.backstageUnreadCount??0;
   const backstageDecision=promotion.attention?.pendingBackstage===true;
   const soleRequest=promotion.attention?.backstageRequests?.length===1?
    promotion.attention.backstageRequests[0]:null;
   const openBackstage=unread===0&&backstageDecision&&soleRequest&&
    port.openBackstageThread?
    ()=>port.openBackstageThread!(soleRequest.personId,true):
    unread>0||backstageDecision?port.openUnreadBackstage??port.backstage:port.backstage;
   const backstage=control("BACKSTAGE",
    backstageDecision?(soleRequest?
     soleRequest.name+" needs your decision":"A private conversation needs your decision"):
    "Wrestlers · staff · broadcasters · opportunities",
    openBackstage,"✉");
   backstage.classList.add("ppw-home-backstage-action");
   backstage.setAttribute("aria-label",unread>0?
    "Open Backstage, "+unread+" unread message"+(unread===1?"":"s"):
    "Open Backstage messages");
   if(unread>0)backstage.append(el("span","ppw-home-backstage-badge",
    unread>99?"99+":String(unread)));
   dashboard.append(backstage);root.append(dashboard);
   // These are the original certified comparisons. Art never manufactures
   // an audience, a TV rating or a head-to-head show that did not happen.
   const competition=promotion.competition;
   const circuit=el("section","ppw-home-competition");
   circuit.setAttribute("aria-label","Your current promotional competition");
   circuit.append(el("span","ppw-home-brand","RATINGS WAR"));
   const arena=el("div","ppw-home-ratings-arena");
   const stat=(company:string,show:
    {tvRating?:number|null;year:number;week:number;showName:string}|null|undefined)=>{
    const side=el("div","ppw-home-ratings-side");
    side.append(el("strong","ppw-home-ratings-promotion",company));
    if(show){
     side.append(el("span","ppw-home-ratings-meta",
      show.showName&&show.showName.toLowerCase()!=="null"?
       show.showName+" · Y"+show.year+" W"+show.week:
       "Latest broadcast · Y"+show.year+" W"+show.week));
     side.append(el("strong","ppw-home-ratings-tv",
      typeof show.tvRating==="number"&&Number.isFinite(show.tvRating)?
       show.tvRating.toFixed(2)+" TV rating":"TV rating pending"));
    }else side.append(el("small","ppw-home-ratings-pending",
     "Awaiting broadcast figures"));
    return side;
   };
   arena.append(stat(promotion.name,competition?.ownLatestShow));
   const vs=el("span","ppw-home-vs-mark","VS");
   vs.setAttribute("aria-hidden","true");arena.append(vs);
   const rival=stat(competition?.name??"Opponent not assigned",
    competition?.rivalLatestShow);
   if(competition?.humanManaged)
    rival.append(el("small","ppw-home-human-rival","HUMAN MANAGER"));
   arena.append(rival);
   circuit.append(arena);
   if(competition&&typeof competition.ownAvgAttendance==="number"&&
    typeof competition.rivalAvgAttendance==="number")
    circuit.append(el("small","ppw-home-ratings-attendance",
     "AVG ATTENDANCE · "+
     Math.round(competition.ownAvgAttendance).toLocaleString("en-GB")+
     " vs "+Math.round(competition.rivalAvgAttendance).toLocaleString("en-GB")));
   if(competition?.provisional)circuit.append(el("small",
    "ppw-home-competition-review","Provisional peer"));
   const openWar=el("button","ppw-home-competition-action",
    "Open Ratings War →") as HTMLButtonElement;
   openWar.type="button";openWar.onclick=()=>(port.ratingsWar??port.business)();
   circuit.append(openWar);root.append(circuit);
   // News, weekly awards and the rumour mill already live under the persistent
   // News tab. Do not add two Home shortcuts pointing to that same screen.
  }
  if(progressedFrom){
   const status=el("p","ppw-home-week-notice",
    "Year "+progressedFrom.year+" · Week "+progressedFrom.week+" is complete.");
   status.setAttribute("role","status");masthead.after(status);
  }
  if(!promotion){
   root.append(el("p","ppw-home-small",
    "Choose a promotion to take charge of talent, bookings and business."));
   // A controller must claim a promotion before private Industry views open.
   return;
  }
  // News belongs to its dedicated department. Home shows the next card,
  // actual player decisions and recent consequences, not a duplicate feed.
  const brief=el("section","ppw-home-brief");
  const briefHead=el("header","ppw-home-brief-title");
  briefHead.append(el("h3","","Notifications"));
  brief.append(briefHead);
  const items:{title:string;detail:string;action:()=>void;icon:string;
   level:string;noticeId?:string;personId?:string;personName?:string}[]=[];
  // Tolerate previously cached session projections and historical test fixtures.
  // Unavailable telemetry must never be interpreted as a confirmed alert.
  const attention=promotion.attention;
   if(attention?.unseenLegends&&port.openLegends){
    items.push({title:"Legend revealed in the World",detail:
     attention.unseenLegends+" new historic arrival"+(attention.unseenLegends===1?" is":"s are")+
     " ready for your reveal. All promotions can pursue these free agents.",
     action:port.openLegends,icon:"★",level:"priority"});
   }
   if(attention?.kpClaimAvailable){
    items.push({title:"Claim your latest show reward",detail:
     "Collect the Kayfabe Points earned by your latest show.",
     action:()=>{if(claimingKP)return;
      if(!port.claimWeeklyKP){port.openKayfabe?.();return;}
      claimingKP=true;
      void port.claimWeeklyKP().then(()=>load())
       .catch(e=>{error=e instanceof Error?e.message:"Could not claim points";})
       .finally(()=>{claimingKP=false;draw();});
     },icon:"★",level:"priority"});
   }
  // The next-show tile above is already the single booking action.
  // Only retain this fallback when an older overview cannot supply its
  // draft-show identity despite reporting an unfinished card.
  if(bookingOpen&&attention?.unpreparedShow&&!promotion.nextShow)
   items.push({title:"Finish your booking card",detail:
    "Review and confirm your current card.",
    action:port.openUnfinishedCard??port.planner,icon:"▤",level:"priority"});
  // Backstage's hero already owns wrestler, network and staff messages.
  // Avoid duplicates in the general Notifications list.
  const contractAlerts=(attention?.contractAlerts??[]).slice(0,5);
  for(const item of contractAlerts){
   // The owner already placed this proposal. Only an outcome, not
   // an outgoing offer, can create a fresh decision for the owner.
   if(item.waiting)continue;
   const noDates=item.kind==="DATES_EXHAUSTED";
   const when=item.weeksRemaining<=1?"this week":
    "after "+item.weeksRemaining+" weeks, including this week";
   const title=noDates?item.name+" has no contracted dates left":
    item.name+"'s contract expires "+when;
   const detail=noDates?
    (item.nextTermStart==null?"No bookable appearances remain. Open Contracts to offer more dates.":
     "The current term has no dates left. The agreed renewal begins in Year "+(Math.floor(item.nextTermStart/52)+1)+" Week "+(item.nextTermStart%52+1)+"."):
    "The agreement expires "+when+". Review renewal terms.";
   items.push({title,detail,action:
    noDates?port.contracts:port.contractsExpiring??port.contracts,
    icon:noDates?"◇":"◈",level:noDates?"priority":"important"});
  }
  if(attention?.expiringTalent&&contractAlerts.length===0)
   items.push({title:"Contracts approaching expiry",detail:
    "Additional wrestler contracts approach expiry. Review all expiring agreements.",
    action:port.contractsExpiring??port.contracts,icon:"◈",level:"important"});
  if(promotion.financialDistress&&promotion.financialDistress!=="HEALTHY")
   items.push({title:"Financial pressure · "+promotion.financialDistress.replaceAll("_"," ").toLowerCase(),detail:
    "Current financial outlook: "+promotion.financialDistress+". Review commitments and runway.",
    action:port.business,icon:"!",level:"important"});
  for(const item of items){
   const entry=control(item.title,"",item.action,item.icon);
   entry.classList.add("ppw-home-action-"+item.level);
   if(item.noticeId&&port.dismissAttention){
    const holder=el("div","ppw-home-action-with-dismiss");
    const dismiss=el("button","ppw-home-wire-dismiss","Dismiss") as HTMLButtonElement;
    dismiss.type="button";dismiss.disabled=clearing||dismissing.has(item.noticeId);
    dismiss.onclick=()=>void dismissNews(item.noticeId!);
    holder.append(entry);
    if(item.personId&&item.personName&&port.openWrestler){
     const dossier=el("button","ppw-home-wire-button",
      "View "+item.personName+"'s wrestler dossier") as HTMLButtonElement;
     dossier.type="button";
     dossier.onclick=()=>port.openWrestler!(item.personId!);
     holder.append(dossier);
    }
    holder.append(dismiss);brief.append(holder);
   }else brief.append(entry);
  }
  // Notifications are the final visual section, below the Ratings War.
  // All counts reflect the existing, authenticated overview response.
  briefHead.append(el("span","ppw-home-notification-count",
   items.length?items.length+" TO REVIEW":"ALL CLEAR"));
  if(!items.length)brief.append(el("p","ppw-home-brief-clear",
   "No management issues require attention right now."));
  root.append(brief);
  // Secondary news is one compact inbox; accepted offers already have their
  // own primary action and acknowledgement above the dashboard.
  const inboxBody=el("div","ppw-home-inbox-body");
  const results=attention?.offerResults??[];
  if(results.length){
   const wire=el("section","ppw-home-wire");
   wire.append(el("span","ppw-home-brand","THE CONTRACT WIRE"),
    el("h3","","Decisions received"));
   for(const item of results){
    const entry=el("article","ppw-home-wire-item");
    entry.append(el("span","ppw-home-wire-status "+(item.status==="ACCEPTED"?
     "ppw-home-wire-accepted":"ppw-home-wire-declined"),
      item.status==="ACCEPTED"?"ACCEPTED":"DECLINED"),
     el("strong","",item.name+(item.status==="ACCEPTED"?
      (item.renewal?" agreed to renew":" has signed"):" declined the offer")),
     el("p","",item.status==="ACCEPTED"?
      item.renewal&&item.startWeekIndex!=null?
       "The new terms start in Year "+(Math.floor(item.startWeekIndex/52)+1)+" Week "+(item.startWeekIndex%52+1)+".":
       "The terms have been agreed. Review your current contracts and upcoming dates.":
      "The agreement did not go ahead. You can review the terms before approaching them again."));
    const actions=el("div","ppw-home-wire-actions");
    const open=el("button","ppw-home-wire-button","Open Contracts") as HTMLButtonElement;
    open.type="button";open.onclick=port.contracts;
    actions.append(open);
    if(port.openWrestler){
     const person=el("button","ppw-home-wire-button","View "+item.name) as HTMLButtonElement;
     person.type="button";
     person.onclick=()=>port.openWrestler?.(item.personId);
     person.setAttribute("aria-label","View "+item.name+"'s wrestler dossier");
     actions.append(person);
    }
    if(port.dismissAttention){
     const dismissButton=el("button","ppw-home-wire-dismiss","Dismiss update") as HTMLButtonElement;
     dismissButton.type="button";dismissButton.disabled=clearing||dismissing.has(item.id);
     dismissButton.setAttribute("aria-label","Dismiss "+item.name+"'s contract update");
     dismissButton.onclick=()=>void dismissNews(item.id);
     actions.append(dismissButton);
    }
    entry.append(actions);wire.append(entry);
   }
   inboxBody.append(wire);
  }
  const dateDecisions=attention?.dateDecisions??[];
  if(dateDecisions.length){
   const wire=el("section","ppw-home-wire");
   wire.append(el("span","ppw-home-brand","THE CONTRACT WIRE"),
    el("h3","","Additional dates decided"));
   for(const item of dateDecisions){
    const accepted=item.status==="ACCEPTED";
    const entry=el("article","ppw-home-wire-item");
    entry.append(el("span","ppw-home-wire-status "+(accepted?
     "ppw-home-wire-accepted":"ppw-home-wire-declined"),
      accepted?"ACCEPTED":"DECLINED"),
     el("strong","",item.name+(accepted?" accepted additional dates":" declined additional dates")),
     el("p","",accepted?
      "Contract "+item.contractId+" · +"+item.additionalDates+" dates agreed"+
       (item.additionalPayment>0?" for $"+item.additionalPayment.toLocaleString("en-GB"):" at no extra cost")+
       ". Year "+item.year+", Week "+item.week+".":
      "Contract "+item.contractId+" · +"+item.additionalDates+
       " proposed dates declined. Year "+item.year+", Week "+item.week+"."));
    const actions=el("div","ppw-home-wire-actions");
    const open=el("button","ppw-home-wire-button","Open Contract Desk") as HTMLButtonElement;
    open.type="button";open.onclick=port.contractsPending??port.contracts;actions.append(open);
    if(port.dismissAttention){
     const dismiss=el("button","ppw-home-wire-dismiss","Dismiss update") as HTMLButtonElement;
     dismiss.type="button";dismiss.disabled=clearing||dismissing.has(item.id);
     dismiss.onclick=()=>void dismissNews(item.id);
     actions.append(dismiss);
    }
    entry.append(actions);wire.append(entry);
   }
   inboxBody.append(wire);
  }
  // The Backstage hub owns wrestler/staff messages and settled outcomes;
  // never duplicate these as Home notifications.
  // Expired agreements are auditable in Commercials, but they are NOT
  // current attention. Show only recent non-commercial business changes.
  const businessUpdates=(attention?.businessUpdates??[]).filter(item=>
   item.kind!=="COMMERCIAL_EXPIRED"&&
   ((world.year-item.year)*52+world.week-item.week)>=0&&
   ((world.year-item.year)*52+world.week-item.week)<=2);
  if(businessUpdates.length){
   const wire=el("section","ppw-home-wire");
   wire.append(el("span","ppw-home-brand","THE BUSINESS WIRE"),
    el("h3","","Company updates"));
   const label:Record<string,string>={HEALTHY:"Healthy",WATCH:"On watch",
    DISTRESSED:"Under pressure",CRISIS:"In crisis"};
   for(const item of businessUpdates){
    const annual=item.kind==="ANNUAL_REVIEW";
    const delta=item.prestigeDelta;
    const improved=annual?delta!==null&&delta>=0:item.after==="HEALTHY";
    const title=annual?"Your annual company review is in":
     "Your financial outlook has changed";
    const detail=annual?(delta===null?
     "Your company reputation has been evaluated. Review the ratings in Business.":
     "Your prestige "+(delta>=0?"rose by ":"fell by ")+
     Math.abs(delta).toLocaleString("en-GB",{maximumFractionDigits:1})+
     " points. Review your fan, business and talent reputation in Business."):
     "Your financial position moved from "+(label[item.before??""]??"its previous status")+
     " to "+(label[item.after??""]??"a new status")+
     ". Review your latest income, spending and runway.";
    const entry=el("article","ppw-home-wire-item");
    entry.append(el("span","ppw-home-wire-status "+
     (improved?"ppw-home-wire-accepted":"ppw-home-wire-declined"),
     annual?"YEAR-END REVIEW":"FINANCIAL UPDATE"),
     el("strong","",title),
     el("p","",detail),
     el("small","ppw-home-small","Year "+item.year+" · Week "+item.week));
    const actions=el("div","ppw-home-wire-actions");
    const open=el("button","ppw-home-wire-button",
     "Open Business") as HTMLButtonElement;
    open.type="button";open.onclick=port.business;actions.append(open);
    if(port.dismissAttention){
     const dismiss=el("button","ppw-home-wire-dismiss","Dismiss update") as HTMLButtonElement;
     dismiss.type="button";dismiss.disabled=clearing||dismissing.has(item.id);
     dismiss.setAttribute("aria-label","Dismiss "+title.toLowerCase());
     dismiss.onclick=()=>void dismissNews(item.id);actions.append(dismiss);
    }
    entry.append(actions);wire.append(entry);
   }
   inboxBody.append(wire);
  }
  const titleNews=attention?.titleNews??[];
  if(titleNews.length){
   const wire=el("section","ppw-home-wire");
   wire.append(el("span","ppw-home-brand","THE TITLE PICTURE"),
    el("h3","","New champions"));
   for(const item of titleNews){
    const entry=el("article","ppw-home-wire-item");
    entry.append(el("span","ppw-home-wire-status ppw-home-wire-accepted",
     item.holderType==="TEAM"?"TAG TITLE":"SINGLES TITLE"),
     el("strong","",item.winnerName+" won "+item.titleName),
     el("p","","A verified championship change at Year "+item.year+
      ", Week "+item.week+". Explore the title and its reign history."));
    const actions=el("div","ppw-home-wire-actions");
    const go=el("button","ppw-home-wire-button","Open Championships") as HTMLButtonElement;
    go.type="button";go.onclick=port.championships;actions.append(go);
    if(item.personId&&port.openWrestler){
     const person=el("button","ppw-home-wire-button","View "+item.winnerName) as HTMLButtonElement;
     person.type="button";person.onclick=()=>port.openWrestler?.(item.personId!);
     actions.append(person);
    }
    if(port.dismissAttention){
     const dismiss=el("button","ppw-home-wire-dismiss","Dismiss update") as HTMLButtonElement;
     dismiss.type="button";dismiss.disabled=clearing||dismissing.has(item.id);
     dismiss.setAttribute("aria-label","Dismiss "+item.titleName+" title change");
     dismiss.onclick=()=>void dismissNews(item.id);actions.append(dismiss);
    }
    entry.append(actions);wire.append(entry);
   }
   inboxBody.append(wire);
  }
  const injuryNews=attention?.injuryNews??[];
  if(injuryNews.length){
   const wire=el("section","ppw-home-wire");
   wire.append(el("span","ppw-home-brand","THE MEDICAL REPORT"),
    el("h3","","Recent match injuries"));
   for(const item of injuryNews){
    const entry=el("article","ppw-home-wire-item");
    entry.append(el("span","ppw-home-wire-status ppw-home-wire-declined",
     item.severity+" INJURY"),
     el("strong","",item.name+" suffered an injury"),
     el("p","","A "+item.severity.toLowerCase()+" injury was recorded at Year "+
      item.year+", Week "+item.week+". The original report estimated "+
      item.originalWeeksOut+" week"+(item.originalWeeksOut===1?"":"s")+
      " out. Open the wrestler dossier for current medical clearance."));
    const actions=el("div","ppw-home-wire-actions");
    if(port.openWrestler){
     const person=el("button","ppw-home-wire-button","View "+item.name) as HTMLButtonElement;
     person.type="button";person.onclick=()=>port.openWrestler?.(item.personId);
     actions.append(person);
    }else{
     const open=el("button","ppw-home-wire-button","Open Roster") as HTMLButtonElement;
     open.type="button";open.onclick=port.roster;actions.append(open);
    }
    if(port.dismissAttention){
     const dismiss=el("button","ppw-home-wire-dismiss","Dismiss update") as HTMLButtonElement;
     dismiss.type="button";dismiss.disabled=clearing||dismissing.has(item.id);
     dismiss.setAttribute("aria-label","Dismiss "+item.name+"'s injury update");
     dismiss.onclick=()=>void dismissNews(item.id);actions.append(dismiss);
    }
    entry.append(actions);wire.append(entry);
   }
   inboxBody.append(wire);
  }
  const clearanceNotices=attention?.medicalClearances??[];
  if(clearanceNotices.length){
   const wire=el("section","ppw-home-wire");
   wire.append(el("span","ppw-home-brand","THE MEDICAL REPORT"),
    el("h3","","Cleared to return"));
   for(const item of clearanceNotices){
    const entry=el("article","ppw-home-wire-item");
    entry.append(el("span","ppw-home-wire-status","MEDICALLY CLEARED"),
     el("strong","",item.name+" is available again"),
     el("p","","Cleared at Year "+item.year+", Week "+item.week+
      " following a "+item.severity.toLowerCase()+" injury."));
    const actions=el("div","ppw-home-wire-actions");
    const open=el("button","ppw-home-wire-button","View "+item.name) as HTMLButtonElement;
    open.type="button";
    open.onclick=()=>port.openWrestler?port.openWrestler(item.personId):port.roster();
    actions.append(open);
    if(port.dismissAttention){
     const dismiss=el("button","ppw-home-wire-dismiss","Dismiss update") as HTMLButtonElement;
     dismiss.type="button";dismiss.disabled=clearing||dismissing.has(item.id);
     dismiss.setAttribute("aria-label","Dismiss "+item.name+"'s clearance update");
     dismiss.onclick=()=>void dismissNews(item.id);actions.append(dismiss);
    }
    entry.append(actions);wire.append(entry);
   }
   inboxBody.append(wire);
  }
  const resolvedCount=(attention?.offerResults??[]).length+dateDecisions.length+
   businessUpdates.length+titleNews.length+injuryNews.length+clearanceNotices.length;
  if(inboxBody.childElementCount){
   // Recent changes should be visible, not behind a nested dropdown.
   const inbox=el("section","ppw-home-updates");
   inbox.setAttribute("aria-label","Recent decisions and changes");
   inbox.append(el("header","ppw-home-updates-head",
    "RECENT CHANGES · "+resolvedCount),inboxBody);
   brief.append(inbox);
  }
  if(port.dismissAttentionBatch&&resolvedCount>1){
   const clear=el("button","ppw-home-clear-resolved",
    clearing?"Clearing updates…":"Clear "+Math.min(resolvedCount,10)+" resolved updates") as HTMLButtonElement;
   clear.type="button";clear.disabled=clearing||dismissing.size>0;
   clear.setAttribute("aria-label","Clear all resolved updates");
   clear.onclick=()=>void clearResolvedUpdates();
   inboxBody.append(clear);
  }
  const privateControls=root.querySelector(".ppw-manual-test");
  if(privateControls)root.append(privateControls);
 }
 if(initialOverview)draw();else void load();
 return {refresh:load};
}
