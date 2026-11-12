/** PPW's iPhone-first landing surface. Uses an existing small overview read,
 * never polls, advances time, or invents future show and finance outcomes.
 */
import {promotionBrand} from "./broadcast-identity.js";
import {createPromoterPrestigeCrest} from "./promoter-prestige-crest.js";
import {createPromotionLogo} from "./promotion-logo.js";
import type {PlayerWorldOverview} from "../db/player-world-overview.js";
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
 openUnfinishedCard?():void;openUnreadBackstage?():void;
 openBackstageThread?(personId:string,unread:boolean):void;
 contractsExpiring?():void;contractsPending?():void;
 backstage():void;results():void;business():void;staff():void;
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
const amount=(n:number)=>new Intl.NumberFormat("en-GB",{
 style:"currency",currency:"USD",maximumFractionDigits:0}).format(n);
export function mountWorldHome(root:HTMLElement,port:WorldHomePort){
 let overview:PlayerWorldOverview|null=null,loading=false,error="",loaded=false;
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
  content.append(el("strong","",title),el("small","",summary));
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
  const keys=[...(attention?.offerResults??[]),...(attention?.dateDecisions??[]),...(attention?.backstageResults??[]),
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
    attention.backstageResults=attention.backstageResults?.filter(x=>!cleared.has(x.id));
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
  const masthead=el("header","ppw-home-head");
  masthead.append(el("span","ppw-home-brand","PPW / WORLD DESK"),
   el("h1","","Your World"));
  root.append(masthead);
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
  const hero=el("section","ppw-home-hero");
   const brand=promotionBrand(promotion?.name??"");
   hero.dataset.promotion=brand.key;
   const logo=createPromotionLogo(brand.key,170);
  const heroTop=el("div","ppw-home-hero-top");
  heroTop.append(el("span","ppw-home-kicker","YOUR WORLD / YEAR "+world.year+" · WEEK "+world.week));
  const live=el("span","ppw-home-phase ppw-home-phase-"+
   (deadlineDue?"due":world.phase.toLowerCase()),
   bookingOpen?"● BOOKING OPEN":deadlineDue?"● DEADLINE REACHED":
    world.phase==="LOCKED"?"● CARDS LOCKED":"● SHOWS IN PROGRESS");
  heroTop.append(live);
  const identity=el("div","ppw-home-promotion-identity");
  const mark=el("span","ppw-home-promotion-mark",brand.mark);
  if(logo){
   logo.loading="eager";
   logo.onload=()=>{
    mark.dataset.logoReady="true";
    identity.dataset.logoReady="true";
   };
   logo.onerror=()=>{
    logo.remove();
    delete mark.dataset.logoReady;
    delete identity.dataset.logoReady;
   };
   mark.append(logo);
  }
  identity.append(mark,el("h2","",promotion?.name??"Choose a promotion"));
  hero.append(heroTop,identity,
   ...(promotion?.promoterPrestige&&port.openAchievements?[
    createPromoterPrestigeCrest({
     rank:promotion.promoterPrestige.rank,
     earned:promotion.promoterPrestige.earnedCount,
     total:promotion.promoterPrestige.total,
     finish:promotion.milestoneFrame,
     onOpen:port.openAchievements
    })
   ]:[]),
   ...(promotion?.homeMarketName?[el("p","ppw-home-territory",
    "HOME TERRITORY  /  "+promotion.homeMarketName)]:[]));
  const check=el("button","ppw-home-status-refresh",
   loading?"Checking World…":"Check World status") as HTMLButtonElement;
  check.type="button";check.disabled=loading;check.onclick=()=>void load();
  if(world.phase==="OPEN"){
   // The deliberately extended solo playtest deadline is real, but a
   // five-year countdown is not useful dashboard information. Keep normal
   // short-window countdowns and all authoritative deadline checks intact.
   const longTestWindow=Number.isFinite(world.nextLockEpoch)&&
    Number.isFinite(world.serverEpoch)&&
    world.nextLockEpoch-world.serverEpoch>30*86400;
   const countdown=el("p","ppw-home-countdown",
    deadlineDue?"Booking deadline reached · check World status":
    longTestWindow?"Booking is open · finish your next card when ready":
     "Checking this week's deadline…");
   countdown.setAttribute("aria-live","off");
   hero.append(countdown);
   check.hidden=!deadlineDue;
   hero.append(check);
   if(!deadlineDue&&!longTestWindow)startClock(countdown,world,()=>{
    expiredOnScreen=key;
    draw();
   });
  }else if(world.phase==="LOCKED"||world.phase==="RESOLVING"){
   hero.append(el("p","ppw-home-countdown",
    "This week's booking has closed. Shows settle for everyone at the same World Lock."));
   hero.append(check);
  }
  root.append(hero);
  if(promotion){
   const dashboard=el("section","ppw-home-dashboard");
   dashboard.setAttribute("aria-label","Your promotion at a glance");
   const next=promotion.nextShow;
   const needsCard=!!next&&!next.ready&&!!promotion.attention?.unpreparedShow;
   const nextAction=control(
    needsCard?"Finish your booking card · "+next!.showName:
     next?"NEXT SHOW · "+next.showName:"Plan this week's show",
    next?"Year "+next.year+" · Week "+next.week+" · "+
     (next.ready?"Card ready for showtime":"Finish preparing the card"):
     "Set a date and start booking.",
    needsCard?port.openUnfinishedCard??port.planner:port.planner,"▣");
   nextAction.classList.add("ppw-home-next-action");
   if(next?.ready)nextAction.dataset.ready="true";
   dashboard.append(nextAction);
   const last=promotion.latestShow;
   const resultsAction=control(last?"LATEST RESULT · "+last.showName:"RESULTS ARCHIVE",
    last?"Year "+last.year+" · Week "+last.week+" · Read the broadcast recap":
     "Your certified show history, title changes and match finishes.",port.results,"★");
   resultsAction.classList.add("ppw-home-result-action");
   dashboard.append(resultsAction);
   const standing=promotion.standing;
   dashboard.append(control(standing?"WORLD RANK · #"+standing.position+" / "+standing.total:
    "WORLD RANK · Standings",
    "See where your promotion stands by broadcast reach.",port.industry,"◆"));
   root.append(dashboard);
   // A circuit rival exists even when neither small promotion has a TV deal.
   // This is a saved World-level matchup, not a fictional same-slot TV fight.
   const competition=promotion.competition;
   const circuit=el("section","ppw-home-competition");
   circuit.setAttribute("aria-label","Your current promotional competition");
   circuit.append(el("span","ppw-home-brand","YOUR COMPETITION"));
   if(competition){
    const rival=el("h3","",competition.name);
    const circuitKind=competition.humanManaged?"HUMAN MANAGER":"AI PROMOTION";
    const tier=competition.tier.charAt(0)+competition.tier.slice(1).toLowerCase();
    circuit.append(rival,el("p","ppw-home-competition-kind",
     circuitKind+" · "+tier+" circuit"));
    const note=competition.ownAvgAttendance!==null&&
     competition.rivalAvgAttendance!==null?
     "Recent average attendance: "+Math.round(competition.ownAvgAttendance).toLocaleString("en-GB")+
      " vs "+Math.round(competition.rivalAvgAttendance).toLocaleString("en-GB"):
     "Compare recent show results, reach and industry growth.";
    circuit.append(el("p","ppw-home-competition-note",note));
    circuit.append(el("small","ppw-home-competition-review",
     "Last circuit review · Year "+(Math.floor(competition.reviewedWeekIndex/52)+1)+
      ", Week "+(competition.reviewedWeekIndex%52+1)));
    if(competition.targetName&&competition.targetName!==competition.name)
     circuit.append(el("small","ppw-home-competition-review",
      "Company to catch · "+competition.targetName));
   }else{
    circuit.append(el("h3","","The circuit is taking shape"),
     el("p","ppw-home-competition-note",
      "Your first certified World results will establish your nearest promotion rival."));
   }
   const rivalButton=el("button","ppw-home-competition-action",
    "Open Ratings War") as HTMLButtonElement;
   rivalButton.type="button";rivalButton.onclick=()=>(
    port.ratingsWar??port.business)();
   circuit.append(rivalButton);root.append(circuit);
   // News, weekly awards and the rumour mill already live under the persistent
   // News tab. Do not add two Home shortcuts pointing to that same screen.
  }
  if(progressedFrom){
   const completed=el("section","ppw-home-week-complete");
   completed.append(el("span","ppw-home-brand","WEEK COMPLETED"),
    el("h3","","The World has moved on"),
    el("p","", "Year "+progressedFrom.year+" · Week "+progressedFrom.week+
     " is complete. Your show's broadcast and verified outcomes are ready to read."));
   completed.append(control("Read completed shows",
    "See your broadcast reports, title changes and match outcomes.",
    port.results,"★"));
   root.append(completed);
  }
  if(!promotion){
   root.append(el("p","ppw-home-small",
    "Choose a promotion to take charge of talent, bookings and business."));
   // A controller must claim a promotion before private Industry views open.
   return;
  }
  const stats=el("section","ppw-home-finances");
  for(const [label,note] of [
   ["CASH",amount(promotion.cash)],
   ["DEBT",amount(promotion.debt)],
   ["LAST WEEK",promotion.lastWeeklyNet===null?"Not settled":amount(promotion.lastWeeklyNet)]
  ] as const){
   const tile=el("div","ppw-home-stat");
   tile.append(el("span","",label),el("strong","",note));stats.append(tile);
  }
  root.append(stats);
  // News belongs to its dedicated department. Home shows the next card,
  // actual player decisions and recent consequences, not a duplicate feed.
  const brief=el("section","ppw-home-brief");
  const briefHead=el("header","ppw-home-brief-title");
  briefHead.append(el("span","ppw-home-brand","YOUR NEXT MOVES"),
   el("h3","","Needs your decision"));
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
    items.push({title:"Claim Reward",detail:
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
  if(attention?.pendingBackstage){
   const pending=(attention.backstageRequests??[]).slice(0,3);
   const subjects:Record<string,string>={
    CONTRACT:"wants to talk about their contract",
    MORALE:"has something on their mind backstage",
    MOMENTUM:"wants to discuss their place on the card",
    CREATIVE:"has a new creative idea",
    PARTNERSHIP:"wants to talk about a potential partner"
   };
   if(pending.length){
    for(const request of pending){
     items.push({title:request.name+" is waiting",detail:
      (subjects[request.kind]??"has a private request for you")+
      ". Open your locker-room conversations.",
      action:port.openBackstageThread?
       ()=>port.openBackstageThread!(request.personId,true):
       port.openUnreadBackstage??port.backstage,icon:"✉",level:"important"});
    }
   }else items.push({title:"Your locker room has messages",detail:
    "Wrestlers are waiting for a decision. Open your private Backstage conversations.",
    action:port.openUnreadBackstage??port.backstage,icon:"✉",level:"important"});
  }
  const contractAlerts=(attention?.contractAlerts??[]).slice(0,5);
  for(const item of contractAlerts){
   // The owner already placed this proposal. Only an outcome, not
   // an outgoing offer, can create a fresh decision for the owner.
   if(item.waiting)continue;
   const noDates=item.kind==="DATES_EXHAUSTED";
   const when=item.weeksRemaining===0?"this week":
    "in "+item.weeksRemaining+" week"+(item.weeksRemaining===1?"":"s");
   const title=noDates?item.name+" has no contracted dates left":
    item.name+"'s contract expires "+when;
   const detail=noDates?
    "No bookable appearances remain. Open Contracts to offer more dates.":
    "The agreement expires "+when+". Review renewal terms.";
   items.push({title,detail,action:
    noDates?port.contracts:port.contractsExpiring??port.contracts,
    icon:noDates?"◇":"◈",level:noDates?"priority":"important"});
  }
  if(attention?.expiringTalent&&contractAlerts.length===0)
   items.push({title:"Contracts approaching expiry",detail:
    "Additional wrestler contracts approach expiry. Review all expiring agreements.",
    action:port.contractsExpiring??port.contracts,icon:"◈",level:"important"});
  // Accepted offers are actionable NOW, not buried under the end-of-week wire.
  for(const accepted of (attention?.offerResults??[])
   .filter(x=>x.status==="ACCEPTED").slice(0,3)){
   items.unshift({title:accepted.name+" has signed",
    detail:"Agreement accepted. Check dates and booking availability in Contracts.",
    action:port.contracts,icon:"✓",level:"priority",noticeId:accepted.id,
    personId:accepted.personId,personName:accepted.name});
  }
  if(promotion.financialDistress&&promotion.financialDistress!=="HEALTHY")
   items.push({title:"Financial pressure",detail:
    "Current financial outlook: "+promotion.financialDistress+". Review commitments and runway.",
    action:port.business,icon:"!",level:"important"});
  for(const item of items){
   const entry=control(item.title,item.detail,item.action,item.icon);
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
  // Immediate decisions are above passive links; no additional reads.
  if(items.length)root.insertBefore(brief,stats);
  // Secondary news is one compact inbox; accepted offers already have their
  // own primary action and acknowledgement above the dashboard.
  const inboxBody=el("div","ppw-home-inbox-body");
  const results=(attention?.offerResults??[]).filter(x=>x.status!=="ACCEPTED");
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
      " accepted the offer":" declined the offer")),
     el("p","",item.status==="ACCEPTED"?
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
  const resolved=attention?.backstageResults??[];
  if(resolved.length){
   const wire=el("section","ppw-home-wire");
   wire.append(el("span","ppw-home-brand","THE LOCKER ROOM"),
    el("h3","","Promises settled"));
   for(const item of resolved){
    const kept=item.status==="FULFILLED";
    const entry=el("article","ppw-home-wire-item");
    entry.append(el("span","ppw-home-wire-status "+(kept?
     "ppw-home-wire-accepted":"ppw-home-wire-declined"),kept?"KEPT":"BROKEN"),
     el("strong","",item.name+(kept?" saw your promise kept":" was left waiting")),
     el("p","",kept?
      "Your commitment was honoured. Catch up with the wrestler in the locker room.":
      "A promise went unfulfilled. Speak with the wrestler about what comes next."));
    const actions=el("div","ppw-home-wire-actions");
    const open=el("button","ppw-home-wire-button","Open Backstage") as HTMLButtonElement;
    open.type="button";open.onclick=()=>port.openBackstageThread?
     port.openBackstageThread(item.personId,false):port.backstage();
    actions.append(open);
    if(port.openWrestler){
     const person=el("button","ppw-home-wire-button","View "+item.name) as HTMLButtonElement;
     person.type="button";person.onclick=()=>port.openWrestler?.(item.personId);
     actions.append(person);
    }
    if(port.dismissAttention){
     const dismiss=el("button","ppw-home-wire-dismiss","Dismiss update") as HTMLButtonElement;
     dismiss.type="button";dismiss.disabled=clearing||dismissing.has(item.id);
     dismiss.setAttribute("aria-label","Dismiss "+item.name+"'s locker room update");
     dismiss.onclick=()=>void dismissNews(item.id);actions.append(dismiss);
    }
    entry.append(actions);wire.append(entry);
   }
   inboxBody.append(wire);
  }
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
   resolved.length+businessUpdates.length+titleNews.length+injuryNews.length+clearanceNotices.length;
  if(inboxBody.childElementCount){
   // Recent changes should be visible, not behind a nested dropdown.
   const inbox=el("section","ppw-home-updates");
   inbox.setAttribute("aria-label","Recent decisions and changes");
   inbox.append(el("header","ppw-home-updates-head",
    "RECENT CHANGES · "+resolvedCount),inboxBody);
   root.insertBefore(inbox,stats);
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
 void load();
 return {refresh:load};
}
