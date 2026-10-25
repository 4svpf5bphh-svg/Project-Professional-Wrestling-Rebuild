import type {readIndustryWorldHub,readIndustryFeaturedTalent} from "../db/industry-world-hub.js";
import type {readPromotionRecordBook} from "../db/promotion-record-book.js";
import type {readIndustryWorldNews} from "../db/industry-news.js";
import {createWrestlerPortrait} from "./wrestler-portrait.js";
import {createWrestlerCard} from "./wrestler-card.js";
import {originalPersonaBaseline} from "../domain/portable-persona.js";
export type IndustryHubView=Awaited<ReturnType<typeof readIndustryWorldHub>>;
export type IndustryFeaturedView=Awaited<ReturnType<typeof readIndustryFeaturedTalent>>;
export type IndustryNewsView=Awaited<ReturnType<typeof readIndustryWorldNews>>;
export type PromotionRecordView=Awaited<ReturnType<typeof readPromotionRecordBook>>;
export type IndustryPromotion=IndustryHubView["promotions"][number];
export type IndustryOrder="REACH"|"FORM"|"NAME";
/** Public data already fetched with Industry; no search RPC or new DB work. */
export function visibleIndustryPromotions<T extends {
 name:string;tier:string;mediaReach:number|null;
 recentAverageCrowd:number|null;rank:number
}>(companies:readonly T[],search:string,tier:string,order:IndustryOrder):T[]{
 const phrase=search.trim().toLocaleLowerCase("en-GB");
 return companies.filter(c=>
  (tier==="ALL"||c.tier===tier)&&(!phrase||
   c.name.toLocaleLowerCase("en-GB").includes(phrase)||
   c.tier.toLocaleLowerCase("en-GB").includes(phrase)))
  .sort((a,b)=>order==="NAME"?a.name.localeCompare(b.name):
   order==="FORM"?(b.recentAverageCrowd??-1)-(a.recentAverageCrowd??-1)||
    a.rank-b.rank:a.rank-b.rank);
}
export interface IndustryHubPort{
 load():Promise<IndustryHubView>;
 news?():Promise<IndustryNewsView>;
 featured?(targetPromotionId:string):Promise<IndustryFeaturedView>;
 records?():Promise<PromotionRecordView>;
 openWrestler?(personId:string):void;
 openOwnResults?(showId:string):void;
 openBusiness?():void;openPlanner?():void;back?():void;
}
const el=(tag:string,cls="",content="")=>{
 const x=document.createElement(tag);x.className=cls;x.textContent=content;return x;
};
const btn=(label:string,fn:()=>void)=>{
 const x=el("button","ppw-industry-button",label) as HTMLButtonElement;
 x.type="button";x.onclick=fn;return x;
};
export function mountIndustryWorldHub(root:HTMLElement,port:IndustryHubPort){
 let view:IndustryHubView|null=null,loading=false,error="",
  active:"STANDINGS"|"BROADCASTS"|"OFFICIAL"|"DIRT"|"RECORDS"="STANDINGS",
  search="",tier="ALL",sort:IndustryOrder="REACH";
 let records:PromotionRecordView|null=null,recordsBusy=false,recordsError="";
 let news:IndustryNewsView|null=null,newsBusy=false,newsError="";
 async function loadNews(){
  if(!port.news||newsBusy||news)return;
  newsBusy=true;newsError="";render();
  try{news=await port.news();}
  catch(e){newsError=e instanceof Error?e.message:"World News could not load";}
  finally{newsBusy=false;render();}
 }
 const loadRecords=async()=>{
  if(!port.records||recordsBusy||records)return;
  recordsBusy=true;recordsError="";render();
  try{records=await port.records();}
  catch(e){recordsError=e instanceof Error?e.message:"Records could not load";}
  finally{recordsBusy=false;render();}
 };
 const featuredCache=new Map<string,IndustryFeaturedView>();
 const featuredBusy=new Set<string>();
 async function showFeatured(promotionId:string,container:HTMLElement){
  if(!port.featured)return;
  container.replaceChildren();
  const available=featuredCache.get(promotionId);
  if(available){
   container.append(el("h3","","Featured wrestlers"));
   if(!available.people.length)container.append(el("p","ppw-industry-muted",
    "No signed wrestlers are currently listed for this promotion."));
   for(const person of available.people){
    const baseline=originalPersonaBaseline(person.name,person.gimmickId);
    container.append(createWrestlerCard({
     personId:person.personId,name:person.name,promotion:available.promotionName,
     ringName:baseline.personaName,
     division:person.division,gimmickId:baseline.gimmickId,
     primaryStyle:baseline.primaryStyle,alignment:person.alignment,
     popularity:person.popularity,recognition:person.recognition,
     momentum:person.momentum,inRingQuality:person.inRingQuality,
     matchCraft:person.matchCraft,presentation:person.presentation
    },{context:"MARKET",compact:true,label:"VIEW WRESTLER DOSSIER",
     ...(port.openWrestler?{onSelect:()=>port.openWrestler?.(person.personId)}:{})}));
   }
   if(available.moreThanEight)container.append(el("p","ppw-industry-muted",
    "Showing the promotion's eight most prominent active wrestlers."));
   return;
  }
  if(featuredBusy.has(promotionId)){
   container.append(el("p","ppw-industry-muted","Checking the roster…"));return;
  }
  featuredBusy.add(promotionId);
  container.append(el("p","ppw-industry-muted","Checking the roster…"));
  try{
   featuredCache.set(promotionId,await port.featured(promotionId));
   if(container.isConnected)void showFeatured(promotionId,container);
  }catch(e){
   if(container.isConnected){
    container.replaceChildren(el("p","ppw-industry-muted",
     e instanceof Error?e.message:"Unable to read this roster"),
     btn("Try again",()=>void showFeatured(promotionId,container)));
   }
  }finally{featuredBusy.delete(promotionId);}
 }
 async function load(){
  loading=true;render();
  try{view=await port.load();error="";}
  catch(e){error=e instanceof Error?e.message:"Could not load Industry";}
  finally{loading=false;render();}
 }
 function render(){
  root.classList.add("ppw-editor","ppw-industry");root.replaceChildren();
  const head=el("header","ppw-industry-head");
  if(port.back)head.append(btn("← Back",()=>port.back?.()));
  head.append(el("span","ppw-industry-kicker","THE INDUSTRY / PROMOTIONS"),
   el("h1","","Industry"),
   el("p","ppw-industry-muted",view?
    view.worldName+" · Year "+view.year+" · Week "+view.week:
    "See the competition, follow rival promotions and find out who's making headlines."));
  root.append(head);
  if(error)root.append(el("p","ppw-alert ppw-error",error));
  if(!view){if(!loading)root.append(btn("Retry",()=>void load()));return;}
  const status=el("section","ppw-industry-status");
  status.append(el("span","","THIS WEEK"),
   el("strong","",view.phase==="OPEN"?"Bookings open":
    view.phase==="LOCKED"?"Cards locked":"Shows taking place"));
  const when=Number.isFinite(view.nextLockEpoch)&&view.nextLockEpoch>0?
    new Date(view.nextLockEpoch*1000).toLocaleString("en-GB",{
     dateStyle:"medium",timeStyle:"short"}):"Not scheduled";
  status.append(el("span","","BOOKING DEADLINE"),el("strong","",when));
  status.append(el("p","ppw-industry-muted",
   "All promotions share the same weekly deadline. Their cards stay private until the shows take place."));
  root.append(status);
  const nav=el("nav","ppw-industry-nav");
  nav.setAttribute("aria-label","Industry views");
  for(const [key,label] of [["STANDINGS","Promotions"],["OFFICIAL","Official News"],["DIRT","Dirt Sheets"],["BROADCASTS","Recent broadcasts"],["RECORDS","Record book"]] as const){
   const b=btn(label,()=>{active=key;render();if(key==="RECORDS")void loadRecords();
    if(key==="OFFICIAL"||key==="DIRT")void loadNews();});
   b.setAttribute("aria-current",active===key?"page":"false");
   nav.append(b);
  }
  root.append(nav);
  if(active==="STANDINGS"){
   const section=el("section","ppw-industry-list");
   section.append(el("h2","","The promotion landscape"),
    el("p","ppw-industry-muted",
     "Rankings reflect each promotion's reach. Form reflects the response to their shows over the last 12 weeks."));
   const filters=el("div","ppw-industry-filters");
   const queryLabel=el("label","ppw-industry-field","Search promotions");
   const query=document.createElement("input");query.type="search";
   query.value=search;query.placeholder="Company name or tier";
   query.setAttribute("aria-label","Search promotions");
   queryLabel.append(query);
   const dropdown=(label:string,values:readonly string[],current:string)=>{
    const field=el("label","ppw-industry-field",label);
    const select=document.createElement("select");
    select.setAttribute("aria-label",label);
    for(const value of values){
     const option=document.createElement("option");option.value=value;
     option.textContent=value==="ALL"?"Every tier":
      value==="REACH"?"Media reach ranking":
      value==="FORM"?"Recent crowd response":
      value==="NAME"?"Promotion name":value[0]+value.slice(1).toLowerCase();
     select.append(option);
    }
    select.value=current;field.append(select);filters.append(field);return select;
   };
   filters.append(queryLabel);
   const tierSelect=dropdown("Promotion tier",
    ["ALL","GLOBAL","NATIONAL","RISING","INDEPENDENT","LOCAL"],tier);
   const sortSelect=dropdown("Sort by",["REACH","FORM","NAME"],sort);
   section.append(filters);
   const count=el("p","ppw-industry-result-count");
   count.setAttribute("aria-live","polite");
   const list=el("div","ppw-industry-companies");
   section.append(count,list);
   const drawCompanies=()=>{
    list.replaceChildren();
    const visible=visibleIndustryPromotions(view!.promotions,search,tier,sort);
    count.textContent=visible.length+" of "+view!.promotions.length+
     " promotions · public records only";
    for(const p of visible){
     const card=document.createElement("details");card.className="ppw-industry-company";
     if(p.isYours)card.classList.add("ppw-industry-own");
      card.dataset.promotionTier=p.tier.toLowerCase();
     const summary=document.createElement("summary");summary.className="ppw-industry-company-summary";
     const crest=el("span","ppw-industry-company-crest",
      p.name.trim().split(/\s+/).filter(Boolean).slice(0,2).map(s=>s[0]).join("").toUpperCase());
     crest.setAttribute("aria-hidden","true");
     const identity=el("span","ppw-industry-company-identity");
     identity.append(el("span","ppw-industry-company-name",p.name));
     const state=el("span","ppw-industry-company-subtitle",
      p.tier.toLowerCase()+" · "+
      (p.isYours?"Your promotion":"Rival promotion"));
     identity.append(state);
     if(p.isYours)identity.append(el("span","ppw-industry-ours","YOU"));
     const position=el("span","ppw-industry-company-standing","#"+p.rank);
     position.append(el("small","","MEDIA RANK"));
     summary.append(crest,identity,position);
     card.append(summary);
     const detail=el("div","ppw-industry-company-body");
     const stats=el("div","ppw-industry-company-metrics");
     for(const [label,note] of [
      ["MEDIA REACH",p.mediaReach===null?"Not published":Math.round(p.mediaReach).toLocaleString("en-GB")],
      ["RECENT SHOWS",String(p.recentShowCount)],
      ["CROWD FORM",p.recentAverageCrowd===null?"Awaiting results":p.recentAverageCrowd.toFixed(1)+"/100"]
     ] as const){
      const metric=el("div","ppw-industry-company-metric");
      metric.append(el("small","",label),el("strong","",note));stats.append(metric);
     }
     detail.append(stats);
     const appearances=view!.broadcasts.filter(show=>show.promotionId===p.promotionId).slice(0,3);
     if(appearances.length){
      detail.append(el("h3","","Recent published events"));
      for(const show of appearances){
       const row=el("div","ppw-industry-company-show");
       row.append(el("strong","",show.showName),el("small","",
        "Y"+show.year+" W"+show.week+
        " · Crowd "+Math.round(show.crowdResponse)+"/100"));
       if(show.isYours&&port.openOwnResults)row.append(btn("Open Results →",
        ()=>port.openOwnResults?.(show.showId)));
       detail.append(row);
      }
     }else detail.append(el("p","ppw-industry-muted",
      "No published broadcasts in the current public window."));
     // No wrestler identity data is transferred on opening Industry.
     // The extra bounded request happens only when this promotion expands.
     if(port.featured){
      const featured=el("section","ppw-industry-featured");
      featured.setAttribute("aria-label","Featured wrestlers for "+p.name);
      detail.append(featured);
      card.addEventListener("toggle",()=>{
       if(card.open)void showFeatured(p.promotionId,featured);
      });
     }
     detail.append(el("p","ppw-industry-privacy",
      "Public information only. Contracts, wages, cash, draft cards and condition are private."));
     card.append(detail);
     list.append(card);
    }
    if(!visible.length)list.append(el("p","ppw-industry-empty",
     "No companies match. Clear the search or choose another tier."));
   };
   query.oninput=()=>{search=query.value;drawCompanies();};
   tierSelect.onchange=()=>{tier=tierSelect.value;drawCompanies();};
   sortSelect.onchange=()=>{sort=sortSelect.value as IndustryOrder;drawCompanies();};
   drawCompanies();
   root.append(section);
  }else if(active==="RECORDS"){
   const section=el("section","ppw-industry-list ppw-industry-record-book");
   section.append(el("h2","","Promotion record book"),
    el("p","ppw-industry-muted",
     "Your active roster's certified matches, wins and average star rating. No manual ranking boosts."));
   if(recordsError)section.append(el("p","ppw-alert ppw-error",recordsError),
    btn("Try again",()=>void loadRecords()));
   if(recordsBusy)section.append(el("p","ppw-industry-muted","Checking completed match records…"));
   if(records&&!records.leaders.length)section.append(el("p","ppw-industry-muted",
    "No certified matches yet for your current roster."));
   for(const [i,w] of (records?.leaders??[]).entries()){
    const item=el("article","ppw-industry-record-row");
    item.append(el("strong","",String(i+1)),el("span","",w.name),
     el("small","",w.wins+" wins / "+w.matches+" matches"+
      (w.averageStars===null?"":" · "+w.averageStars.toFixed(2)+"★")));
    section.append(item);
   }
   root.append(section);
  }else if(active==="OFFICIAL"||active==="DIRT"){
   const section=el("section","ppw-industry-list ppw-news");
   const official=active==="OFFICIAL";
   section.append(el("span","ppw-news-eyebrow",official?
    "THE RECORD / THE RESULTS":"THE RUMOUR MILL / BEHIND THE CURTAIN"),
    el("h2","",official?"Official News":"Dirt Sheets"),
    el("p","ppw-industry-muted",official?
     "What actually happened in the wrestling world. Awards and reports come from certified completed shows.":
     "The insider desk reads between the lines of public shows. Speculation is labelled; another manager's plans and negotiations stay private."));
   if(newsBusy)section.append(el("p","ppw-industry-muted","Opening this week's news desk…"));
   if(newsError)section.append(el("p","ppw-alert ppw-error",newsError),
    btn("Retry",()=>void loadNews()));
   if(official&&news?.awards.length){
    const latest=news.awards[0]!;
    const lead=news.awards.filter(a=>a.year===latest.year&&a.week===latest.week);
    const features=el("div","ppw-news-features");
    for(const award of lead){
     const poster=el("article","ppw-news-poster");
     poster.dataset.kind=award.kind.toLowerCase();
     poster.append(el("span","ppw-news-poster-mast",
      award.kind==="MATCH"?"★ MATCH OF THE WEEK":"◆ ANGLE OF THE WEEK"),
      el("span","ppw-news-poster-week","YEAR "+award.year+"  /  WEEK "+award.week));
     const faces=el("div","ppw-news-faces");
     for(const person of award.peopleNames.slice(0,3)){
      const portrait=createWrestlerPortrait(person,145);
      if(portrait){
       const frame=el("div","ppw-news-face");
       portrait.alt="Portrait of "+person;
       portrait.loading="lazy";
       portrait.onerror=()=>frame.remove();
       frame.append(portrait);faces.append(frame);
      }
     }
     if(faces.childElementCount)poster.append(faces);
     poster.append(el("span","ppw-news-poster-promotion",award.promotionName),
      el("strong","ppw-news-poster-title",award.title),
      el("span","ppw-news-poster-event",award.showName),
      el("strong","ppw-news-poster-rating",
       award.ratingUnit==="STARS"?award.rating.toFixed(2)+" ★":
        Math.round(award.rating)+"/100 CROWD"));
     features.append(poster);
    }
    section.append(features);
    const history=news.awards.filter(a=>a.year!==latest.year||a.week!==latest.week);
    if(history.length){
     const archive=document.createElement("details");
     archive.className="ppw-news-history";
     archive.append(el("summary","","Previous weekly awards"));
     for(const award of history){
      const row=el("article","ppw-news-history-row");
      row.append(el("small","",award.kind+" / Y"+award.year+" W"+award.week),
       el("strong","",award.title),
       el("span","",award.promotionName+" · "+
        (award.ratingUnit==="STARS"?award.rating.toFixed(2)+" ★":
         Math.round(award.rating)+"/100 crowd")));
      archive.append(row);
     }
     section.append(archive);
    }
   }
   const published=(news?.stories??[]).filter(s=>s.desk===(official?"OFFICIAL":"DIRT"));
   if(!newsBusy&&!published.length&&(!official||!view.headlines.length))
    section.append(el("p","ppw-industry-empty",official?
     "No major certified headlines yet. The next completed World week will publish its highlights.":
     "Nothing worth printing in the rumour mill. No fabricated backstage sources here."));
   for(const story of published){
    const item=el("article","ppw-news-story");
    item.append(el("span","ppw-news-desk",official?"CONFIRMED / OFFICIAL":
     "SPECULATION / NOT CONFIRMED"),
     el("strong","ppw-news-story-title",story.title),
     el("p","",story.summary),
     el("small","ppw-industry-muted",story.promotionName+
      " · Year "+story.year+" · Week "+story.week));
    section.append(item);
   }
   if(official){
    // The pre-existing ledger headlines stay on the official desk; they
    // come from verified World changes, not other managers' private state.
    const titles:Record<string,(s:IndustryHubView["headlines"][number])=>string>={
     WRESTLER_RETIRED:s=>(s.personName??"A veteran")+" calls time on their in-ring career",
     WRESTLER_DEBUTED:s=>(s.personName??"A fresh face")+" enters the wrestling business",
     CAREER_STAGE_CHANGED:s=>(s.personName??"A wrestler")+" enters a new career chapter",
     PROMOTION_TIER_CHANGED:s=>(s.promotionName??"A promotion")+" moves "+
      (s.toTier??"to a new level"),
     PROMOTION_RESTRUCTURED:s=>(s.promotionName??"A promotion")+" reshapes its operation",
     PROMOTION_ENTERED_DORMANCY:s=>(s.promotionName??"A promotion")+" suspends operations",
     PROMOTION_RECOVERED_FROM_DISTRESS:s=>(s.promotionName??"A promotion")+" finds its feet again"
    };
    for(const story of view.headlines){
     const item=el("article","ppw-news-story");
     item.append(el("span","ppw-news-desk","CONFIRMED / INDUSTRY"),
      el("strong","ppw-news-story-title",titles[story.kind]?.(story)??"Industry update"),
      el("small","ppw-industry-muted","Year "+story.year+" · Week "+story.week));
     if(story.personId&&port.openWrestler)
      item.append(btn("Open wrestler dossier →",()=>port.openWrestler?.(story.personId!)));
     section.append(item);
    }
   }
   root.append(section);
  }else{
   const section=el("section","ppw-industry-list");
   section.append(el("h2","","Completed broadcasts"),
    el("p","ppw-industry-muted",
     "World-public show identities and crowd reactions. Rival plans, negotiations and finances remain private."));
   if(!view.broadcasts.length)section.append(el("p","ppw-industry-muted",
    "No completed broadcasts have been published yet."));
   for(const show of view.broadcasts){
    const card=el("article","ppw-industry-broadcast");
    card.append(el("strong","",show.showName),
     el("small","ppw-industry-muted",
      show.promotionName+" · Year "+show.year+" Week "+show.week),
     el("span","ppw-industry-crowd",
      "Crowd response "+Math.round(show.crowdResponse)+"/100"));
    if(show.isYours&&port.openOwnResults)card.append(btn("Open Results →",
     ()=>port.openOwnResults?.(show.showId)));
    section.append(card);
   }
   root.append(section);
  }
 }
 void load();
 return {refresh:load};
}
