/** iPhone-first championship history adapted from original PPW.
 * Opening a belt loads only its first 15 reigns, not the World's history.
 */
import {createWrestlerPortrait} from "./wrestler-portrait.js";
import {wrestlerInitials} from "./wrestler-card.js";
import {promotionBrand} from "./broadcast-identity.js";
import {beltCategory} from "./championship-artwork.js";
import type {TournamentPort} from "./tournament-desk.js";
import type {ChampionshipDirectory,ChampionshipHistory,ChampionshipCard,ReignCursor}
 from "../db/championship-history.js";
export interface ChampionshipPort extends Partial<TournamentPort> {
 loadDirectory():Promise<ChampionshipDirectory>;
 createChampionship?(input:{requestId:string;expectedRevision:number;
  kind:"SECONDARY_MEN"|"WOMEN_SINGLES";name:string}):Promise<unknown>;
 loadHistory(promotionId:string,championshipId:string,cursor:ReignCursor|null):Promise<ChampionshipHistory>;
 openWrestler?(id:string):void;
 openTeam?(id:string):void;
}
const element=(tag:string,cls="",text="")=>{
 const e=document.createElement(tag);e.className=cls;e.textContent=text;return e;};
const label=(s:string)=>s.replaceAll("_"," ").toLowerCase()
 .replace(/(^|\s)\S/g,c=>c.toUpperCase());
const week=(index:number)=>"YEAR "+(Math.floor(index/52)+1)+" / WEEK "+(index%52+1);
export async function mountChampionshipDesk(root:HTMLElement,port:ChampionshipPort,
 onBack?:()=>void,initialScope:"WORLD"|"MINE"="MINE"){
 root.classList.add("ppw-editor","ppw-championship-desk");
 root.replaceChildren(element("p","ppw-muted","Opening championship records…"));
 try{
  const directory=await port.loadDirectory();
  const header=element("header","ppw-title-hero");
  const eyebrow=element("span","ppw-eyebrow","CHAMPIONSHIPS / THE RECORD BOOKS");
  const heading=element("h1","",initialScope==="MINE"?"My Champions":"World Championships");
  const subtitle=element("p","ppw-muted",
   directory.worldName+" · Year "+directory.year+" · Week "+directory.week);
  if(onBack){
   const back=element("button","ppw-title-back","← Back") as HTMLButtonElement;
   back.type="button";back.onclick=onBack;header.append(back);
  }
  header.append(eyebrow,heading,subtitle);

  // A dedicated title-creation screen is distinct from the champion list.
  // Returning to the list reuses the already loaded, bounded directory.
  if(port.createChampionship&&directory.canEdit){
   const current=directory.titles.filter(t=>
    t.promotionId===directory.viewerPromotionId&&t.status==="ACTIVE");
   const canSecondary=!current.some(t=>t.division==="SINGLES"&&
    t.bookingDivision==="MEN"&&t.titleRole==="SECONDARY");
   const canWomen=!current.some(t=>t.division==="SINGLES"&&
    t.bookingDivision==="WOMEN"&&t.titleRole==="PRIMARY");
   const create=element("button","ppw-title-back ppw-title-create-entry",
    "＋ Create Championship") as HTMLButtonElement;
   create.type="button";create.disabled=current.length>=8||!canSecondary&&!canWomen;
   create.onclick=()=>{
    const previous=Array.from(root.childNodes);
    const screen=element("section","ppw-title-create-screen");
    const back=element("button","ppw-title-back","← My Champions") as HTMLButtonElement;
    back.type="button";back.onclick=()=>root.replaceChildren(...previous);
    screen.append(back,element("span","ppw-eyebrow","MY PROMOTION / TITLES"),
     element("h1","","Create Championship"),
     element("p","ppw-muted","Choose the division and name the new title."));
    const types=element("div","ppw-title-create-kinds");
    types.setAttribute("role","group");
    types.setAttribute("aria-label","Championship division");
    type Kind="SECONDARY_MEN"|"WOMEN_SINGLES";
    let selected:Kind=canSecondary?"SECONDARY_MEN":"WOMEN_SINGLES";
    const name=document.createElement("input");
    name.type="text";name.maxLength=90;name.minLength=4;
    name.className="ppw-title-create-name";name.setAttribute("aria-label","Championship name");
    const promotion=directory.titles.find(t=>t.promotionId===directory.viewerPromotionId)?.
     promotionName??"";
    const suggested=(kind:Kind)=>promotion+" "+
     (kind==="WOMEN_SINGLES"?"Women's":"Intercontinental")+" Championship";
    name.value=suggested(selected).trim();
    const choices:[Kind,string,boolean][]=[
     ["SECONDARY_MEN","Men's secondary",canSecondary],
     ["WOMEN_SINGLES","Women's singles",canWomen]
    ];
    for(const [kind,label,allowed] of choices){
     const choose=element("button","ppw-title-create-kind",label) as HTMLButtonElement;
     choose.type="button";choose.disabled=!allowed;
     choose.setAttribute("aria-pressed",String(selected===kind));
     choose.onclick=()=>{
      const original=suggested(selected).trim();
      const auto=name.value.trim()===original;
      selected=kind;if(auto)name.value=suggested(selected).trim();
      types.querySelectorAll("button").forEach(b=>
       b.setAttribute("aria-pressed",String(b===choose)));
     };
     types.append(choose);
    }
    const error=element("p","ppw-alert ppw-error");error.hidden=true;
    const submit=element("button","ppw-title-more","Create vacant title") as HTMLButtonElement;
    submit.type="button";
    submit.onclick=async()=>{
     if(!port.createChampionship)return;
     const proposed=name.value.trim();
     if(proposed.length<4||proposed.length>90){
      error.hidden=false;error.textContent="Use a title name of 4–90 characters.";return;
     }
     submit.disabled=true;error.hidden=true;
     try{
      const result=await port.createChampionship({requestId:crypto.randomUUID(),
       expectedRevision:directory.worldRevision,kind:selected,name:proposed});
      if(result&&typeof result==="object"&&"status" in result&&
       (result as {status:unknown}).status==="STALE")
       throw new Error("Another manager changed the World. Reload and try again.");
      await mountChampionshipDesk(root,port,onBack,"MINE");
     }catch(e){
      error.hidden=false;
      error.textContent=e instanceof Error?e.message:"Could not create championship";
      submit.disabled=false;
     }
    };
    screen.append(types,name,
     element("p","ppw-muted",
      "A new championship begins vacant. The first valid title match crowns its champion."),
     submit,error);
    root.replaceChildren(screen);
   };
   header.append(create);
  }
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
  let scope=initialScope;
  const scopeTabs=element("nav","ppw-title-scope-tabs");
  scopeTabs.setAttribute("aria-label","Championship scope");
  const mine=element("button","ppw-title-back","My Champions") as HTMLButtonElement;
  const world=element("button","ppw-title-back","World Championships") as HTMLButtonElement;
  mine.type=world.type="button";
  mine.onclick=()=>{scope="MINE";heading.textContent="My Champions";update();};
  world.onclick=()=>{scope="WORLD";heading.textContent="World Championships";update();};
  scopeTabs.append(mine,world);
  // The headline totals always match the selected promotion scope.
  const updateFacts=()=>{
   const own=scope==="MINE"?directory.titles.filter(t=>
    t.promotionId===directory.viewerPromotionId):directory.titles;
   const live=own.filter(t=>t.status==="ACTIVE");
   facts.replaceChildren();
   for(const [name,value] of [
    [scope==="MINE"?"MY TITLES":"WORLD TITLES",own.length],
    ["ACTIVE BELTS",live.length],
    ["REIGNING CHAMPIONS",live.filter(t=>t.holderId!==null).length],
   ] as const){
    const box=element("article","ppw-title-overview-fact");
    box.append(element("small","",name),element("strong","",String(value)));
    facts.append(box);
   }
  };
  updateFacts();
  const tabs=element("div","ppw-title-filters");
  tabs.append(search,status,division);
  const summary=element("p","ppw-title-summary");
  const list=element("section","ppw-title-list");
  const noTitles=element("p","ppw-title-scope-empty","No championships in this view yet.");
  root.replaceChildren(header,scopeTabs,facts,tabs,summary,list,noTitles);
  const buckets=new Map<string,{card:HTMLElement;title:ChampionshipCard}>();
  function titleCard(title:ChampionshipCard){
   const details=document.createElement("details");
   details.className="ppw-belt-card";
   details.classList.add(title.status==="ACTIVE"?"ppw-belt-active":"ppw-belt-inactive");
   details.classList.add(title.division==="TAG"?"ppw-belt-tag":"ppw-belt-singles");
   details.classList.add(title.titleRole==="SECONDARY"?"ppw-belt-secondary":"ppw-belt-primary");
   if(title.promotionId===directory.viewerPromotionId)details.classList.add("ppw-belt-ours");
   details.dataset.reign=title.currentReignId??"VACANT";
   if(title.holderId&&title.status==="ACTIVE")details.classList.add("ppw-belt-crowned");
   const head=document.createElement("summary");head.className="ppw-belt-summary";
   // Championship presentation is deliberately typographic: 26 existing
   // World titles cannot credibly use one generic illustrated belt template.
   const family=beltCategory(title.name,title.division);
   details.dataset.titleFamily=family;
   details.dataset.promotionBrand=promotionBrand(title.promotionName).key;
   const identity=element("span","ppw-belt-identity");
   identity.append(element("small","ppw-belt-title-kicker",
    family==="tag"?"TAG TEAM CHAMPIONSHIP":
    title.bookingDivision==="WOMEN"||family==="women"?"WOMEN'S CHAMPIONSHIP":
    family==="world"?"WORLD CHAMPIONSHIP":"CHAMPIONSHIP"));
   identity.append(element("strong","ppw-belt-name",title.name));
   const promo=element("span","ppw-belt-promotion",
    title.promotionName+" / "+(title.division==="TAG"?"TAG TEAM":"SINGLES")+
    " · "+(title.titleRole==="SECONDARY"?"SECONDARY TITLE":"PRIMARY TITLE"));
   identity.append(promo);
   const throne=element("span","ppw-belt-current-display");
   if(title.holderType==="PERSON"&&title.holderName){
    // Preserve the same premium monogram when a genuine Commons image
    // is absent or the remote file cannot load.
    const well=element("span","ppw-belt-champion-well");
    well.setAttribute("aria-hidden","true");
    well.append(element("span","ppw-belt-champion-initials",wrestlerInitials(title.holderName)));
    const portrait=createWrestlerPortrait(title.holderName,180);
    if(portrait){
     portrait.classList.add("ppw-belt-champion-portrait");
     portrait.onerror=()=>portrait.remove();
     well.append(portrait);
    }
    throne.append(well);
   }
   const reign=element("span","ppw-belt-champion-copy");
   reign.append(element("small","ppw-belt-reign-title",title.holderId?"REIGNING CHAMPION":"TITLE VACANT"),
    element("strong","ppw-belt-current",title.holderName??"Awaiting first champion"));
   throne.append(reign);identity.append(throne);
   const more=element("span","ppw-belt-meta");
   more.append(element("strong","",Math.round(title.prestige)+""),
    element("small","","EARNED PRESTIGE"),
    element("small","",title.defenses+" "+(title.defenses===1?"defense":"defenses")));
   head.append(identity,more);
   if(title.lastPrestigeChange!==undefined&&title.lastPrestigeChange!==0)
    more.append(element("small","ppw-belt-prestige-change",
     (title.lastPrestigeChange>0?"+":"")+title.lastPrestigeChange.toFixed(2)+" this week"));
   const history=element("div","ppw-belt-history");
   const historyIntro=element("div","ppw-belt-history-heading");
   historyIntro.append(element("h3","","Championship lineage"),
    element("span","",title.status==="ACTIVE"?"ACTIVE LINEAGE":"INACTIVE TITLE"));
   history.append(historyIntro);
   // Ranked contenders exist only for the owner's licensed roster, and only
   // after a genuinely certified match. A celebrity with no result is not #1.
   const contenders=title.promotionId===directory.viewerPromotionId?
    directory.contenders?.[title.championshipId]:undefined;
   const contenderPanel=contenders===undefined?null:
    element("section","ppw-belt-contender-board");
   if(contenderPanel&&contenders){
    contenderPanel.append(element("h3","","Title contenders"),
     element("p","ppw-muted","Last 26 weeks · certified match form"));
    if(contenders.length===0)
     contenderPanel.append(element("p","ppw-muted",
      "No earned contenders yet. Book matches to establish the rankings."));
    for(const candidate of contenders){
     const entry=element("div","ppw-belt-contender");
     const place=element("strong","ppw-belt-contender-rank",
      "#"+candidate.rank);
     const wrestler=element("button","ppw-title-holder ppw-belt-contender-name",
      candidate.name) as HTMLButtonElement;
     wrestler.type="button";
     if(candidate.format==="SINGLES"&&port.openWrestler)
      wrestler.onclick=()=>port.openWrestler!(candidate.id);
     else if(candidate.format==="TAG"&&port.openTeam)
      wrestler.onclick=()=>port.openTeam!(candidate.id);
     else wrestler.disabled=true;
     const form=element("span","ppw-belt-contender-form",
      candidate.wins+"W · "+candidate.losses+"L · "+
      candidate.score.toFixed(1)+" form");
     entry.append(place,wrestler,form);
     contenderPanel.append(entry);
    }
    history.append(contenderPanel);
   }
   if(title.lastContestWeekIndex!==undefined&&title.lastContestWeekIndex!==null)
    history.append(element("p","ppw-title-heritage-fact",
     "Last certified title contest: "+week(title.lastContestWeekIndex)));
   else history.append(element("p","ppw-title-heritage-fact",
    "No verified championship contest has been recorded yet."));
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
      history.replaceChildren(historyIntro,...(contenderPanel?[contenderPanel]:[]));
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
    const match=(scope==="WORLD"||title.promotionId===directory.viewerPromotionId)&&
     (status.value==="ALL"||status.value===title.status)&&
     (division.value==="ALL"||division.value===title.division)&&
     (!query||[title.name,title.promotionName,title.holderName??""]
      .some(s=>s.toLocaleLowerCase().includes(query)));
    card.hidden=!match;if(match)shown++;
   }
   mine.setAttribute("aria-pressed",String(scope==="MINE"));
   world.setAttribute("aria-pressed",String(scope==="WORLD"));
   updateFacts();noTitles.hidden=shown!==0;
   summary.textContent=shown+" of "+(scope==="MINE"?directory.titles.filter(t=>t.promotionId===directory.viewerPromotionId).length:directory.titles.length)+" championships"+
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
  retry.type="button";retry.onclick=()=>void mountChampionshipDesk(root,port,onBack,initialScope);
  root.replaceChildren(error,retry);
 }
}
