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
  root.classList.add("ppw-home");root.replaceChildren();
  const masthead=el("header","ppw-home-head");
  masthead.append(el("span","ppw-home-brand","PROJECT PROFESSIONAL WRESTLING"),
   el("h1","","Your World"),
   el("p","ppw-home-small","Every promotion, every wrestler, one living calendar."));
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
  hero.append(el("span","ppw-home-kicker",world.name+" · YEAR "+world.year+" / WEEK "+world.week),
   el("h2","",promotion?.name??"Choose a promotion"),
   el("p","ppw-home-small",world.phase==="OPEN"?
    "The booking window is open. Your creative choices remain yours.":
    world.phase==="LOCKED"?"The World is locked. Cards are no longer editable.":
    "The World is resolving this week's submitted shows."));
  const tags=el("div","ppw-home-tags");
  tags.append(el("span","",world.phase),
   el("span","",promotion?.tier??membership),
   el("span","","Server-authoritative World"));
  hero.append(tags);root.append(hero);
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
  if(promotion.financialDistress&&promotion.financialDistress!=="HEALTHY"){
   root.append(el("p","ppw-home-attention",
    "Financial outlook: "+promotion.financialDistress+
     ". Open Business to review cash and weekly commitments."));
  }
  const main=el("section","ppw-home-group");
  main.append(el("h3","","Run your promotion"));
  main.append(control("Show Planner","Calendar, venues and cards",port.planner,"▣"),
   control("My Roster","Singles, teams and factions",port.roster,"♟"),
   control("Talent Market","Scout and negotiate contracts",port.market,"◇"),
   control("Backstage","Wrestler conversations and creative proposals",port.backstage,"☷"),
   control("Results","Finished broadcasts and match reports",port.results,"★"));
  root.append(main);
  const office=el("section","ppw-home-group");
  office.append(el("h3","","The front office"));
  office.append(control("Contracts","Renewals, dates and pending offers",port.contracts,"▤"),
   control("Business","Finances and regional audiences",port.business,"◫"),
   control("Staff","Delegate permissions before World Lock",port.staff,"◉"),
   control("Industry","Other promotions and completed shows",port.industry,"◎"),
   control("Show Calendar","Weekly series and premium events",port.calendar,"▦"));
  root.append(office);
  const reload=el("button","ppw-home-refresh","↻ Refresh World") as HTMLButtonElement;
  reload.type="button";reload.disabled=loading;reload.onclick=()=>void load();
  root.append(reload);
 }
 void load();
 return {refresh:load};
}
