/** iPhone-first championship history adapted from original PPW.
 * Opening a belt loads only its first 15 reigns, not the World's history.
 */
import type {ChampionshipDirectory,ChampionshipHistory,ChampionshipCard,ReignCursor}
 from "../db/championship-history.js";
export interface ChampionshipPort {
 loadDirectory():Promise<ChampionshipDirectory>;
 loadHistory(promotionId:string,championshipId:string,cursor:ReignCursor|null):Promise<ChampionshipHistory>;
 openWrestler?(id:string):void;
 openTeam?(id:string):void;
}
const element=(tag:string,cls="",text="")=>{
 const e=document.createElement(tag);e.className=cls;e.textContent=text;return e;};
const label=(s:string)=>s.replaceAll("_"," ").toLowerCase()
 .replace(/(^|\s)\S/g,c=>c.toUpperCase());
/** Locally rendered engraved title artwork, independent of title ownership. */
function championshipArtwork(division:"SINGLES"|"TAG"){
 const ns="http://www.w3.org/2000/svg";
 const svg=document.createElementNS(ns,"svg");
 svg.setAttribute("viewBox","0 0 80 90");
 svg.setAttribute("focusable","false");svg.setAttribute("aria-hidden","true");
 svg.classList.add("ppw-title-engraving");
 const path=(d:string,cls:string)=>{
  const p=document.createElementNS(ns,"path");
  p.setAttribute("d",d);p.setAttribute("class",cls);svg.append(p);
 };
 path("M40 5 58 13 70 29 66 65 40 83 14 65 10 29 22 13Z","ppw-title-engraving-frame");
 path("M40 13 54 19 62 32 59 60 40 74 21 60 18 32 26 19Z","ppw-title-engraving-field");
 path("M17 43h46M40 13v61","ppw-title-engraving-inlay");
 if(division==="TAG"){
  path("M23 37 30 29 37 37 43 29 50 37 57 29 54 51 26 51Z","ppw-title-engraving-crown");
  path("M27 57h26M31 62h18","ppw-title-engraving-inlay");
 }else path("M40 22 45 36 60 36 48 45 53 61 40 52 27 61 32 45 20 36 35 36Z","ppw-title-engraving-crown");
 for(const y of [8,80]){
  const c=document.createElementNS(ns,"circle");
  c.setAttribute("cx","40");c.setAttribute("cy",String(y));
  c.setAttribute("r","2");c.setAttribute("class","ppw-title-gem");svg.append(c);
 }
 return svg;
}
const week=(index:number)=>"YEAR "+(Math.floor(index/52)+1)+" / WEEK "+(index%52+1);
export async function mountChampionshipDesk(root:HTMLElement,port:ChampionshipPort,onBack?:()=>void){
 root.classList.add("ppw-editor","ppw-championship-desk");
 root.replaceChildren(element("p","ppw-muted","Opening championship records…"));
 try{
  const directory=await port.loadDirectory();
  const header=element("header","ppw-title-hero");
  const eyebrow=element("span","ppw-eyebrow","CHAMPIONSHIPS / THE RECORD BOOKS");
  const heading=element("h1","","Championships");
  const subtitle=element("p","ppw-muted",
   directory.worldName+" · Year "+directory.year+" · Week "+directory.week);
  if(onBack){
   const back=element("button","ppw-title-back","← Back") as HTMLButtonElement;
   back.type="button";back.onclick=onBack;header.append(back);
  }
  header.append(eyebrow,heading,subtitle);
  const search=document.createElement("input");
  search.type="search";search.placeholder="Find a belt, promotion or champion";
  search.className="ppw-title-search";search.setAttribute("aria-label","Search championships");
  const status=document.createElement("select");status.className="ppw-title-status";
  status.setAttribute("aria-label","Filter championship status");
  for(const [v,t] of [["ALL","All titles"],["ACTIVE","Active"],["INACTIVE","Inactive"]]){
   const o=document.createElement("option");o.value=v;o.textContent=t;status.append(o);
  }
  const division=document.createElement("select");division.className="ppw-title-status";
  division.setAttribute("aria-label","Filter singles or tag championships");
  for(const [v,t] of [["ALL","All divisions"],["SINGLES","Singles"],["TAG","Tag teams"]]){
   const o=document.createElement("option");o.value=v;o.textContent=t;division.append(o);
  }
  const facts=element("section","ppw-title-overview");
  const activeTitles=directory.titles.filter(t=>t.status==="ACTIVE");
  for(const [name,value] of [
   ["WORLD TITLES",directory.titles.length],
   ["ACTIVE BELTS",activeTitles.length],
   ["REIGNING CHAMPIONS",activeTitles.filter(t=>t.holderId!==null).length],
  ] as const){
   const box=element("article","ppw-title-overview-fact");
   box.append(element("small","",name),element("strong","",String(value)));
   facts.append(box);
  }
  const tabs=element("div","ppw-title-filters");
  tabs.append(search,status,division);
  const summary=element("p","ppw-title-summary");
  const list=element("section","ppw-title-list");
  root.replaceChildren(header,facts,tabs,summary,list);
  const buckets=new Map<string,{card:HTMLElement;title:ChampionshipCard}>();
  function titleCard(title:ChampionshipCard){
   const details=document.createElement("details");
   details.className="ppw-belt-card";
   details.classList.add(title.status==="ACTIVE"?"ppw-belt-active":"ppw-belt-inactive");
   details.classList.add(title.division==="TAG"?"ppw-belt-tag":"ppw-belt-singles");
   if(title.promotionId===directory.viewerPromotionId)details.classList.add("ppw-belt-ours");
   const head=document.createElement("summary");head.className="ppw-belt-summary";
   const belt=element("span","ppw-belt-insignia");
   const plate=element("span","ppw-belt-plate");
   plate.setAttribute("aria-hidden","true");plate.append(championshipArtwork(title.division));
   belt.append(plate);
   const identity=element("span","ppw-belt-identity");
   const promo=element("span","ppw-belt-promotion",
    title.promotionName+" / "+(title.division==="TAG"?"TAG TEAM":"SINGLES"));
   identity.append(promo,element("strong","ppw-belt-name",title.name),
    element("span","ppw-belt-current",
     (title.holderId===null?"VACANT · ": "CHAMPION · ")+
     (title.holderName??"Awaiting first champion")));
   const more=element("span","ppw-belt-meta");
   more.append(element("strong","",Math.round(title.prestige)+""),
    element("small","","PRESTIGE"),
    element("small","",title.defenses+" "+(title.defenses===1?"defense":"defenses")));
   head.append(belt,identity,more);
   const history=element("div","ppw-belt-history");
   const historyIntro=element("div","ppw-belt-history-heading");
   historyIntro.append(element("h3","","Championship lineage"),
    element("span","",title.status==="ACTIVE"?"ACTIVE LINEAGE":"INACTIVE TITLE"));
   history.append(historyIntro);
   details.append(head,history);
   let page:ReignCursor|null=null,loaded=false,busy=false;
   async function loadMore(){
    if(busy)return;
    busy=true;
    const pending=element("p","ppw-muted","Consulting the record books…");
    history.append(pending);
    try{
     const data=await port.loadHistory(title.promotionId,title.championshipId,page);
     pending.remove();
     if(!loaded){
      history.replaceChildren(historyIntro);
      if(!data.reigns.length)history.append(element("p","ppw-muted",
       "No reign recorded yet. The belt is awaiting its first champion."));
     }
     for(const reign of data.reigns){
      const article=element("article","ppw-title-reign");
      const name=element("button","ppw-title-holder",reign.holderName) as HTMLButtonElement;
      name.type="button";
      if(reign.holderType==="PERSON"&&port.openWrestler)
       name.onclick=()=>port.openWrestler!(reign.holderId);
      else if(reign.holderType==="TEAM"&&port.openTeam)
       name.onclick=()=>port.openTeam!(reign.holderId);
      else name.disabled=true;
      if(reign.isCurrent)article.classList.add("ppw-title-reign-current");
      article.append(name,
       element("span","ppw-title-reign-state",
        reign.isCurrent?"REIGNING CHAMPION":label(reign.status)),
       element("span","ppw-title-reign-period",week(reign.startWeekIndex)+
        " → "+(reign.endedWeekIndex===null?"PRESENT":week(reign.endedWeekIndex))),
       element("span","ppw-title-defenses",reign.defenses+
        (reign.defenses===1?" defense":" defenses")));
      history.append(article);
     }
     page=data.nextCursor;loaded=true;
     const old=history.querySelector(".ppw-title-more");old?.remove();
     if(page){
      const more=element("button","ppw-title-more","Older reigns ↓") as HTMLButtonElement;
      more.type="button";more.onclick=()=>void loadMore();history.append(more);
     }
    }catch(err){
     pending.textContent=err instanceof Error?err.message:"Unable to read title history";
     const retry=element("button","ppw-title-more","Retry") as HTMLButtonElement;
     retry.type="button";retry.onclick=()=>{pending.remove();retry.remove();void loadMore();};
     history.append(retry);
    }finally{busy=false;}
   }
   details.addEventListener("toggle",()=>{if(details.open&&!loaded&&!busy)void loadMore();});
   return details;
  }
  for(const title of directory.titles){
   const card=titleCard(title);
   buckets.set(title.promotionId+":"+title.championshipId,{card,title});
   list.append(card);
  }
  const update=()=>{
   const query=search.value.trim().toLocaleLowerCase();
   let shown=0;
   for(const {card,title} of buckets.values()){
    const match=(status.value==="ALL"||status.value===title.status)&&
     (division.value==="ALL"||division.value===title.division)&&
     (!query||[title.name,title.promotionName,title.holderName??""]
      .some(s=>s.toLocaleLowerCase().includes(query)));
    card.hidden=!match;if(match)shown++;
   }
   summary.textContent=shown+" of "+directory.titles.length+" championships"+
    " · "+directory.titles.filter(t=>t.status==="ACTIVE").length+" active";
  };
  search.addEventListener("input",update);
  status.addEventListener("change",update);
  division.addEventListener("change",update);
  update();
  if(!directory.titles.length)list.append(element("p","ppw-muted",
   "No championships have been created in this World."));
 }catch(e){
  const error=element("p","ppw-alert ppw-error",
   e instanceof Error?e.message:"Championship history unavailable");
  const retry=element("button","ppw-title-more","Try again") as HTMLButtonElement;
  retry.type="button";retry.onclick=()=>void mountChampionshipDesk(root,port,onBack);
  root.replaceChildren(error,retry);
 }
}
