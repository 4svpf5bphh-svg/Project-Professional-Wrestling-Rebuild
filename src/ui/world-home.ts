/** PPW's iPhone-first landing surface. Uses an existing small overview read,
 * never polls, advances time, or invents future show and finance outcomes.
 */
import type {PlayerWorldOverview} from "../db/player-world-overview.js";
export interface WorldHomePort{
 load():Promise<PlayerWorldOverview|null>;
 planner():void;roster():void;market():void;contracts():void;
 backstage():void;results():void;business():void;staff():void;
 industry():void;calendar():void;
}
const el=(tag:string,cls="",label="")=>{
 const node=document.createElement(tag);node.className=cls;
 node.textContent=label;return node;
};
const amount=(n:number)=>new Intl.NumberFormat("en-GB",{
 style:"currency",currency:"USD",maximumFractionDigits:0}).format(n);
export function mountWorldHome(root:HTMLElement,port:WorldHomePort){
 let overview:PlayerWorldOverview|null=null,loading=false,error="",loaded=false;
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
   if(seconds===0){node.textContent="Lock deadline reached · refresh World";
    clearClock();return;}
   const days=Math.floor(seconds/86400),hours=Math.floor(seconds%86400/3600),
    mins=Math.floor(seconds%3600/60),secs=seconds%60;
   node.textContent="Next World Lock in "+(days?days+"d ":"")+
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
  catch(e){error=e instanceof Error?e.message:"The World is unavailable";}
  finally{loading=false;draw();}
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
    "Reading your World…":"No current World snapshot."));
   if(!loading)root.append(control("Retry connection","Reload this World",()=>void load(),"↻"));
   return;
  }
  if(!overview){
   root.append(el("p","ppw-home-small",
    "This World does not exist or is not available to your session."));
   root.append(control("Try again","Reload your World",()=>void load(),"↻"));
   return;
  }
  const {world,promotion,membership}=overview;
  const hero=el("section","ppw-home-hero");
  const heroTop=el("div","ppw-home-hero-top");
  heroTop.append(el("span","ppw-home-kicker",world.name+" / YEAR "+world.year+" · WEEK "+world.week));
  const live=el("span","ppw-home-phase ppw-home-phase-"+world.phase.toLowerCase(),
   world.phase==="OPEN"?"● BOOKING OPEN":world.phase==="LOCKED"?"● WORLD LOCKED":"● RESOLVING");
  heroTop.append(live);
  hero.append(heroTop,
   el("h2","",promotion?.name??"Choose a promotion"),
   ...(promotion?.homeMarketName?[el("p","ppw-home-territory",
    "HOME TERRITORY  /  "+promotion.homeMarketName)]:[]),
   el("p","ppw-home-small",world.phase==="OPEN"?
    "The booking window is open. Your creative choices remain yours.":
    world.phase==="LOCKED"?"The World is locked. Cards are no longer editable.":
    "The World is resolving this week's submitted shows."));
  const tags=el("div","ppw-home-tags");
  tags.append(el("span","",world.phase),
   el("span","",promotion?.tier??membership),
   el("span","","Server-authoritative World"));
  hero.append(tags);
  if(world.phase==="OPEN"){
   const countdown=el("p","ppw-home-countdown","Loading lock deadline…");
   countdown.setAttribute("aria-live","off");
   hero.append(countdown);
   startClock(countdown,world);
  }else if(world.phase==="LOCKED"||world.phase==="RESOLVING"){
   hero.append(el("p","ppw-home-countdown","Booking is closed until World resolution completes."));
  }
  root.append(hero);
  if(!promotion){
   root.append(el("p","ppw-home-small",
    "Join and claim a promotion through the World selection screen before managing your roster."));
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
    "You have a draft show that has not been confirmed ready for World Lock.",
    action:port.planner,icon:"▤",level:"priority"});
  if(attention?.pendingBackstage)
   items.push({title:"Your locker room has messages",detail:
    "Wrestlers are waiting for a decision. Open your private Backstage conversations.",
    action:port.backstage,icon:"✉",level:"important"});
  if(attention?.expiringTalent)
   items.push({title:"Contracts approaching expiry",detail:
    "At least one active wrestler's deal expires within the next two PPW weeks.",
    action:port.contracts,icon:"◈",level:"important"});
  if(attention?.pendingContractOffers)
   items.push({title:"Offers awaiting decisions",detail:
    "Contract offers are pending. Check the negotiation desk for their status.",
    action:port.contracts,icon:"◇",level:"normal"});
  if(promotion.financialDistress&&promotion.financialDistress!=="HEALTHY")
   items.push({title:"Financial pressure",detail:
    "Current financial outlook: "+promotion.financialDistress+". Review commitments and runway.",
    action:port.business,icon:"!",level:"important"});
  if(!items.length)brief.append(el("p","ppw-home-brief-clear",
   "No outstanding alerts in the tracked areas. Review your Planner for full show readiness."));
  for(const item of items){
   const entry=control(item.title,item.detail,item.action,item.icon);
   entry.classList.add("ppw-home-action-"+item.level);
   brief.append(entry);
  }
  root.append(brief);
  root.append(el("p","ppw-home-small ppw-home-drawer-hint",
   "Use the five-section menu at the bottom to open Roster, Market, Backstage, Planning, Business and Results. All gameplay actions remain in their respective desks."));
 }
 void load();
 return {refresh:load};
}
