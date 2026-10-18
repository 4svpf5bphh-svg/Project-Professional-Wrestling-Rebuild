/** PPW's iPhone-first landing surface. Uses an existing small overview read,
 * never polls, advances time, or invents future show and finance outcomes.
 */
import type {PlayerWorldOverview} from "../db/player-world-overview.js";
export interface WorldHomePort{
 load():Promise<PlayerWorldOverview|null>;
 planner():void;roster():void;market():void;contracts():void;
 openUnfinishedCard?():void;openUnreadBackstage?():void;
 contractsExpiring?():void;contractsPending?():void;
 backstage():void;results():void;business():void;staff():void;
 industry():void;calendar():void;
 dismissAttention?(attentionId:string):Promise<unknown>;
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
 const dismissing=new Set<string>();
 let clockTimer:ReturnType<typeof setInterval>|null=null;
 function clearClock(){if(clockTimer!==null){clearInterval(clockTimer);clockTimer=null;}}
 function startClock(node:HTMLElement,world:PlayerWorldOverview["world"]){
  if(world.phase!=="OPEN"||!Number.isFinite(world.nextLockEpoch)||
   !Number.isFinite(world.serverEpoch))return;
  const origin=Date.now(),serverStart=world.serverEpoch;
  const tick=()=>{
   if(!root.isConnected||!root.contains(node)){clearClock();return;}
   const seconds=Math.max(0,Math.ceil(world.nextLockEpoch-
    (serverStart+(Date.now()-origin)/1000)));
   if(seconds===0){node.textContent="Booking deadline reached · refresh";
    clearClock();return;}
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
  loading=true;draw();
  try{overview=await port.load();error="";loaded=true;}
  catch(e){error=e instanceof Error?e.message:"Your promotion is unavailable";}
  finally{loading=false;draw();}
 }
 async function dismissNews(id:string){
  if(!port.dismissAttention||dismissing.has(id))return;
  dismissing.add(id);
  try{
   await port.dismissAttention(id);
   const news=overview?.promotion?.attention?.offerResults;
   if(news)overview!.promotion!.attention.offerResults=news.filter(x=>x.id!==id);
   error="";
  }catch(e){error=e instanceof Error?e.message:"Unable to dismiss the contract update";}
  finally{dismissing.delete(id);draw();}
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
  const hero=el("section","ppw-home-hero");
  const heroTop=el("div","ppw-home-hero-top");
  heroTop.append(el("span","ppw-home-kicker",world.name+" / YEAR "+world.year+" · WEEK "+world.week));
  const live=el("span","ppw-home-phase ppw-home-phase-"+world.phase.toLowerCase(),
   world.phase==="OPEN"?"● BOOKING OPEN":world.phase==="LOCKED"?"● CARDS LOCKED":"● SHOWS IN PROGRESS");
  heroTop.append(live);
  hero.append(heroTop,
   el("h2","",promotion?.name??"Choose a promotion"),
   ...(promotion?.homeMarketName?[el("p","ppw-home-territory",
    "HOME TERRITORY  /  "+promotion.homeMarketName)]:[]),
   el("p","ppw-home-small",world.phase==="OPEN"?
    "The booking window is open. Your creative choices remain yours.":
    world.phase==="LOCKED"?"This week's cards are locked. The show lineup is final.":
    "This week's shows are taking place. The new standings will follow."));
  const tags=el("div","ppw-home-tags");
  tags.append(el("span","",world.phase),
   el("span","",promotion?.tier??membership),
   el("span","","One shared wrestling universe"));
  hero.append(tags);
  if(world.phase==="OPEN"){
   const countdown=el("p","ppw-home-countdown","Checking this week's deadline…");
   countdown.setAttribute("aria-live","off");
   hero.append(countdown);
   startClock(countdown,world);
  }else if(world.phase==="LOCKED"||world.phase==="RESOLVING"){
   hero.append(el("p","ppw-home-countdown","Booking reopens when this week's shows are complete."));
  }
  root.append(hero);
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
  if(world.phase==="OPEN"&&attention?.plannedShows===0)
   items.push({title:"Plan this week's show",detail:
    "No show has been planned for your promotion this week. Open Planner to prepare your next event.",
    action:port.planner,icon:"◷",level:"priority"});
  if(world.phase==="OPEN"&&attention?.unpreparedShow)
   items.push({title:"Finish your booking card",detail:
    "Your card still needs confirming before the weekly deadline.",
    action:port.openUnfinishedCard??port.planner,icon:"▤",level:"priority"});
  if(attention?.pendingBackstage)
   items.push({title:"Your locker room has messages",detail:
    "Wrestlers are waiting for a decision. Open your private Backstage conversations.",
    action:port.openUnreadBackstage??port.backstage,icon:"✉",level:"important"});
  if(attention?.expiringTalent)
   items.push({title:"Contracts approaching expiry",detail:
    "A wrestler's contract expires within the next two weeks.",
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
     dismissButton.type="button";dismissButton.disabled=dismissing.has(item.id);
     dismissButton.setAttribute("aria-label","Dismiss "+item.name+"'s contract update");
     dismissButton.onclick=()=>void dismissNews(item.id);
     actions.append(dismissButton);
    }
    entry.append(actions);wire.append(entry);
   }
   root.append(wire);
  }
  root.append(el("p","ppw-home-small ppw-home-drawer-hint",
   "Open the menu to visit talent, booking, backstage, business and the wider industry."));
 }
 void load();
 return {refresh:load};
}
