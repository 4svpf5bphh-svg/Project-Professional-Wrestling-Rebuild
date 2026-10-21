/** PPW's iPhone-first landing surface. Uses an existing small overview read,
 * never polls, advances time, or invents future show and finance outcomes.
 */
import {promotionBrand} from "./broadcast-identity.js";
import type {PlayerWorldOverview} from "../db/player-world-overview.js";
export interface WorldHomePort{
 load():Promise<PlayerWorldOverview|null>;
 /** Only enabled for the selected private preview operator. Never on a timer. */
 manualAdvance?:(year:number,week:number)=>Promise<{
  status:"PUBLISHED"|"BLOCKED"|"LIMIT_REACHED";blockers:string[]}>;
 planner():void;roster():void;market():void;contracts():void;
 openUnfinishedCard?():void;openUnreadBackstage?():void;
 openBackstageThread?(personId:string,unread:boolean):void;
 contractsExpiring?():void;contractsPending?():void;
 backstage():void;results():void;business():void;staff():void;
 industry():void;calendar():void;championships():void;
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
 let manualStatus="";let manualBusy=false;
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
   const backstage=overview?.promotion?.attention?.backstageResults;
   if(backstage)overview!.promotion!.attention.backstageResults=
    backstage.filter(x=>x.id!==id);
   const injuries=overview?.promotion?.attention?.injuryNews;
   if(injuries)overview!.promotion!.attention.injuryNews=injuries.filter(x=>x.id!==id);
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
  const keys=[...(attention?.offerResults??[]),...(attention?.backstageResults??[]),
   ...(attention?.businessUpdates??[]),...(attention?.titleNews??[]),
   ...(attention?.injuryNews??[])]
   .slice(0,10).map(item=>item.id);
  if(keys.length<2||keys.length>10)return;
  clearing=true;error="";draw();
  try{
   await port.dismissAttentionBatch(keys);
   const cleared=new Set(keys);
   if(attention){
    attention.offerResults=attention.offerResults?.filter(x=>!cleared.has(x.id));
    attention.backstageResults=attention.backstageResults?.filter(x=>!cleared.has(x.id));
    attention.businessUpdates=attention.businessUpdates?.filter(x=>!cleared.has(x.id));
    attention.titleNews=attention.titleNews?.filter(x=>!cleared.has(x.id));
    attention.injuryNews=attention.injuryNews?.filter(x=>!cleared.has(x.id));
   }
  }catch(e){error=e instanceof Error?e.message:"Could not clear the updates";}
  finally{clearing=false;draw();}
 }
 function draw(){
  clearClock();root.classList.add("ppw-home");root.replaceChildren();
  const masthead=el("header","ppw-home-head");
  masthead.append(el("span","ppw-home-brand","THE LIVING WRESTLING WORLD"),
   el("h1","","Your World"),
   el("p","ppw-home-small","Your promotion. Your decisions. One shared wrestling universe."));
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
  const {world,promotion,membership}=overview;
  const key=world.year+":"+world.week;
  const deadlineDue=world.phase==="OPEN"&&(
   expiredOnScreen===key||
   (Number.isFinite(world.nextLockEpoch)&&Number.isFinite(world.serverEpoch)
    &&world.nextLockEpoch<=world.serverEpoch));
  const bookingOpen=world.phase==="OPEN"&&!deadlineDue;
  const hero=el("section","ppw-home-hero");
   const brand=promotionBrand(promotion?.name??"");
   hero.dataset.promotion=brand.key;
  const heroTop=el("div","ppw-home-hero-top");
  heroTop.append(el("span","ppw-home-kicker",world.name+" / YEAR "+world.year+" · WEEK "+world.week));
  const live=el("span","ppw-home-phase ppw-home-phase-"+
   (deadlineDue?"due":world.phase.toLowerCase()),
   bookingOpen?"● BOOKING OPEN":deadlineDue?"● DEADLINE REACHED":
    world.phase==="LOCKED"?"● CARDS LOCKED":"● SHOWS IN PROGRESS");
  heroTop.append(live);
  hero.append(heroTop,
   el("div","ppw-home-broadcast","PPW / PROMOTION CONTROL"),
    el("span","ppw-home-promotion-mark",brand.mark),
   el("h2","",promotion?.name??"Choose a promotion"),
   ...(promotion?.homeMarketName?[el("p","ppw-home-territory",
    "HOME TERRITORY  /  "+promotion.homeMarketName)]:[]),
   el("p","ppw-home-small",deadlineDue?
    "Booking has closed. Check the World before making further plans.":
    world.phase==="OPEN"?
    "The booking window is open. Your creative choices remain yours.":
    world.phase==="LOCKED"?"This week's cards are locked. The show lineup is final.":
    "This week's shows are taking place. The new standings will follow."));
  const tags=el("div","ppw-home-tags");
  tags.append(el("span","",world.phase),
   el("span","",promotion?.tier??membership),
   el("span","","One shared wrestling universe"));
  hero.append(tags);
  const check=el("button","ppw-home-status-refresh",
   loading?"Checking World…":"Check World status") as HTMLButtonElement;
  check.type="button";check.disabled=loading;check.onclick=()=>void load();
  if(world.phase==="OPEN"){
   const countdown=el("p","ppw-home-countdown",
    deadlineDue?"Booking deadline reached · check World status":
     "Checking this week's deadline…");
   countdown.setAttribute("aria-live","off");
   hero.append(countdown);
   check.hidden=!deadlineDue;
   hero.append(check);
   if(!deadlineDue)startClock(countdown,world,()=>{
    expiredOnScreen=key;
    draw();
   });
  }else if(world.phase==="LOCKED"||world.phase==="RESOLVING"){
   hero.append(el("p","ppw-home-countdown",
    "This week's booking has closed. Shows settle for everyone at the same World Lock."));
   hero.append(check);
  }
  root.append(hero);
  if(port.manualAdvance&&promotion){
   const controls=el("section","ppw-manual-test");
   controls.append(el("span","ppw-home-brand","PRIVATE PLAYTEST CONTROL"),
    el("h3","","Advance the shared week"),
    el("p","ppw-home-small",
     "Only the playtest operator can run this. It affects every promotion, and every human manager must confirm their show first. No automatic World Lock is active."));
   if(manualStatus)controls.append(el("p","ppw-home-small",manualStatus));
   const action=el("button","ppw-home-status-refresh",manualBusy?
    "Processing World…":world.phase==="OPEN"?"Advance Week "+world.week:
    "Continue show resolution") as HTMLButtonElement;
   action.type="button";action.disabled=manualBusy;
   action.onclick=async()=>{
    if(manualBusy)return;
    if(world.phase==="OPEN"&&!window.confirm(
     "Advance the ENTIRE shared PPW World after all human shows are confirmed? Week "+world.week+
     " will be locked and simulated; this cannot be undone."))return;
    manualBusy=true;manualStatus="Processing this week's shows…";draw();
    try{
     const result=await port.manualAdvance!(world.year,world.week);
     if(result.status==="PUBLISHED"){
      manualStatus="Shows settled. Refreshing your World…";
      await load();return;
     }
     manualStatus=result.status==="BLOCKED"?
      "World resolution is waiting for a booking or conflict decision. No results have been invented.":
      "Resolution is in progress. Press Continue when ready.";
    }catch(e){manualStatus=e instanceof Error?e.message:"Could not advance World";}
    finally{manualBusy=false;draw();}
   };
   controls.append(action);root.append(controls);
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
  // Contextual actions, never a persistent tab bar. Only authoritative facts
  // from the existing single overview query appear as attention cues.
  const brief=el("section","ppw-home-brief");
  const briefHead=el("header","ppw-home-brief-title");
  briefHead.append(el("span","ppw-home-brand","YOUR WEEK"),
   el("h3","","What needs you"));
  brief.append(briefHead);
  const items:{title:string;detail:string;action:()=>void;icon:string;level:string}[]=[];
  // Tolerate previously cached session projections and historical test fixtures.
  // Unavailable telemetry must never be interpreted as a confirmed alert.
  const attention=promotion.attention;
  if(bookingOpen&&(world.year>1||world.week>1)){
   if(!progressedFrom)items.push({title:"Last week's results",detail:
    "The previous week's shows have been completed. Read your latest broadcasts.",
    action:port.results,icon:"★",level:"normal"});
  }
  if(bookingOpen&&attention?.plannedShows===0)
   items.push({title:"Plan this week's show",detail:
    "No show has been planned for your promotion this week. Open Planner to prepare your next event.",
    action:port.planner,icon:"◷",level:"priority"});
  if(bookingOpen&&attention?.unpreparedShow)
   items.push({title:"Finish your booking card",detail:
    "Your card still needs confirming before the weekly deadline.",
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
   const noDates=item.kind==="DATES_EXHAUSTED";
   const when=item.weeksRemaining===0?"this week":
    "in "+item.weeksRemaining+" week"+(item.weeksRemaining===1?"":"s");
   const title=item.waiting?item.name+" has a negotiation pending":
    noDates?item.name+" has no contracted dates left":
     item.name+"'s contract expires "+when;
   const detail=item.waiting?
    (noDates?"All contracted appearances are used. A new proposal is awaiting a decision.":
     "A new proposal is pending. The existing agreement still expires "+when+"."):
    noDates?"No contracted appearances remain. Consider negotiating more dates before booking them again.":
    "The current agreement expires "+when+". Review renewal terms before the deadline.";
   items.push({title,detail,action:item.waiting?
    port.contractsPending??port.contracts:
    noDates?port.contracts:port.contractsExpiring??port.contracts,
    icon:noDates?"◇":"◈",level:noDates?"priority":"important"});
  }
  if(attention?.expiringTalent&&!contractAlerts.some(x=>x.kind==="EXPIRING"))
   items.push({title:"Contracts approaching expiry",detail:
    "Additional wrestler contracts approach expiry. Review all expiring agreements.",
    action:port.contractsExpiring??port.contracts,icon:"◈",level:"important"});
  if(attention?.pendingContractOffers)
   items.push({title:"Offers awaiting decisions",detail:
    "Contract offers are pending. Check the negotiation desk for their status.",
    action:port.contractsPending??port.contracts,icon:"◇",level:"normal"});
  if(promotion.financialDistress&&promotion.financialDistress!=="HEALTHY")
   items.push({title:"Financial pressure",detail:
    "Current financial outlook: "+promotion.financialDistress+". Review commitments and runway.",
    action:port.business,icon:"!",level:"important"});
  if(!items.length)brief.append(el("p","ppw-home-brief-clear",
   "Your desk is clear for now. Review your next show whenever you're ready."));
  for(const item of items){
   const entry=control(item.title,item.detail,item.action,item.icon);
   entry.classList.add("ppw-home-action-"+item.level);
   brief.append(entry);
  }
  root.append(brief);
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
   root.append(wire);
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
   root.append(wire);
  }
  const businessUpdates=attention?.businessUpdates??[];
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
    const open=el("button","ppw-home-wire-button","Open Business") as HTMLButtonElement;
    open.type="button";open.onclick=port.business;actions.append(open);
    if(port.dismissAttention){
     const dismiss=el("button","ppw-home-wire-dismiss","Dismiss update") as HTMLButtonElement;
     dismiss.type="button";dismiss.disabled=clearing||dismissing.has(item.id);
     dismiss.setAttribute("aria-label","Dismiss "+title.toLowerCase());
     dismiss.onclick=()=>void dismissNews(item.id);actions.append(dismiss);
    }
    entry.append(actions);wire.append(entry);
   }
   root.append(wire);
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
   root.append(wire);
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
      " out; current recovery and clearance have not been verified."));
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
   root.append(wire);
  }
  const resolvedCount=results.length+resolved.length+businessUpdates.length+
   titleNews.length+injuryNews.length;
  if(port.dismissAttentionBatch&&resolvedCount>1){
   const clear=el("button","ppw-home-clear-resolved",
    clearing?"Clearing updates…":"Clear "+Math.min(resolvedCount,10)+" resolved updates") as HTMLButtonElement;
   clear.type="button";clear.disabled=clearing||dismissing.size>0;
   clear.setAttribute("aria-label","Clear all resolved updates");
   clear.onclick=()=>void clearResolvedUpdates();
   root.append(clear);
  }
  root.append(el("p","ppw-home-small ppw-home-drawer-hint",
   "Open the menu to visit talent, booking, backstage, business and the wider industry."));
 }
 void load();
 return {refresh:load};
}
