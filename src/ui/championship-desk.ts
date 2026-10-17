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
const week=(index:number)=>"YEAR "+(Math.floor(index/52)+1)+" / WEEK "+(index%52+1);
export async function mountChampionshipDesk(root:HTMLElement,port:ChampionshipPort,onBack?:()=>void){
 root.classList.add("ppw-editor","ppw-championship-desk");
 root.replaceChildren(element("p","ppw-muted","Opening championship records…"));
 try{
  const directory=await port.loadDirectory();
  const header=element("header","ppw-title-hero");
  const eyebrow=element("span","ppw-eyebrow","PPW / THE RECORD BOOKS");
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
  const tabs=element("div","ppw-title-filters");
  tabs.append(search,status,division);
  const summary=element("p","ppw-title-summary");
  const list=element("section","ppw-title-list");
  root.replaceChildren(header,tabs,summary,list);
  const buckets=new Map<string,{card:HTMLElement;title:ChampionshipCard}>();
  function titleCard(title:ChampionshipCard){
   const details=document.createElement("details");
   details.className="ppw-belt-card";
   const head=document.createElement("summary");
   head.append(element("span","ppw-belt-promotion",title.promotionName+" / "+title.division),
    element("strong","ppw-belt-name",title.name),
    element("span","ppw-belt-current",title.holderName??"Vacant — no current champion"),
    element("span","ppw-belt-meta",label(title.status)+" · Prestige "+
     Math.round(title.prestige)+(title.currentReignId?
      " · "+title.defenses+" defenses":"")));
   const history=element("div","ppw-belt-history");
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
      history.replaceChildren();
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
      article.append(name,
       element("span","ppw-title-reign-state",
        reign.isCurrent?"CURRENT CHAMPION":label(reign.status)),
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
  root.replaceChildren(element("p","ppw-alert ppw-error",
   e instanceof Error?e.message:"Championship history unavailable"));
 }
}
