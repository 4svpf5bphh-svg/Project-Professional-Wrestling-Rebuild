import type {readIndustryWorldHub,readIndustryFeaturedTalent} from "../db/industry-world-hub.js";
import type {PublicCompletedShow} from "../db/public-completed-show.js";
import type {readPromotionRecordBook} from "../db/promotion-record-book.js";
import type {readIndustryWorldNews} from "../db/industry-news.js";
import type {readWorldTalentRankings,searchPublicWorldCareers} from "../db/world-records.js";
import type {readWorldHeritage,WorldMomentCursor} from "../db/world-honours.js";
import {createWrestlerPortrait} from "./wrestler-portrait.js";
import {certifiedCareerMoment} from "../domain/certified-career-moments.js";
import {drawLegendsVault,clearLegendRevealPortal,type LegendsVaultView} from "./legends-vault.js";
import {createWrestlerCard} from "./wrestler-card.js";
import {originalPersonaBaseline} from "../domain/portable-persona.js";
export type IndustryHubView=Awaited<ReturnType<typeof readIndustryWorldHub>>;
export type IndustryFeaturedView=Awaited<ReturnType<typeof readIndustryFeaturedTalent>>;
export type IndustryNewsView=Awaited<ReturnType<typeof readIndustryWorldNews>>;
export type WorldRankingsView=Awaited<ReturnType<typeof readWorldTalentRankings>>;
export type WorldCareersView=Awaited<ReturnType<typeof searchPublicWorldCareers>>;
export type WorldHeritageView=Awaited<ReturnType<typeof readWorldHeritage>>;
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
 heritage?():Promise<WorldHeritageView>;
 legends?():Promise<LegendsVaultView>;
 legendSeen?(id:string):Promise<unknown>;
 collectLegend?(id:string):Promise<unknown>;
 olderMoments?(cursor:WorldMomentCursor):Promise<{
  moments:WorldHeritageView["moments"];momentCursor:WorldMomentCursor|null}>;
 rankings?():Promise<WorldRankingsView>;
 careers?(search:string):Promise<WorldCareersView>;
 featured?(targetPromotionId:string):Promise<IndustryFeaturedView>;
 records?():Promise<PromotionRecordView>;
 openWrestler?(personId:string):void;
 openOwnResults?(showId:string):void;
 publicResults?(targetPromotionId:string,showId:string):Promise<PublicCompletedShow>;
 openBusiness?():void;openPlanner?():void;openMarket?():void;back?():void;
}
const el=(tag:string,cls="",content="")=>{
 const x=document.createElement(tag);x.className=cls;x.textContent=content;return x;
};
const btn=(label:string,fn:()=>void)=>{
 const x=el("button","ppw-industry-button",label) as HTMLButtonElement;
 x.type="button";x.onclick=fn;return x;
};
export function mountIndustryWorldHub(root:HTMLElement,port:IndustryHubPort,initialLegends?:LegendsVaultView){
 const route=typeof window==="undefined"?"":window.location.hash;
 let view:IndustryHubView|null=null,loading=false,error="",
  active:"STANDINGS"|"BROADCASTS"|"OFFICIAL"|"DIRT"|"RECORDS"|"HERITAGE"|"LEGENDS"=
    route==="#/industry/legends"||route==="#/legends"?"LEGENDS":
    route==="#/broadcasts"?"BROADCASTS":
    route==="#/records"?"RECORDS":
    ["#/hall-of-fame","#/annual-awards","#/world-moments"].includes(route)?"HERITAGE":
    route==="#/news"?"OFFICIAL":"STANDINGS",
  search="",tier="ALL",sort:IndustryOrder="REACH";
 let watched:PublicCompletedShow|null=null,watching=false,watchError="";
 async function readRivalResult(targetPromotionId:string,showId:string){
  if(!port.publicResults||watching)return;
  watching=true;watchError="";watched=null;render();
  try{watched=await port.publicResults(targetPromotionId,showId);}
  catch(e){watchError=e instanceof Error?e.message:"Completed results unavailable";}
  finally{watching=false;render();}
 }
 function renderPublicShow(){
  root.classList.add("ppw-editor","ppw-industry");
  root.replaceChildren();
  const section=el("section","ppw-public-results");
  section.append(btn(active==="BROADCASTS"?"← Back to Broadcasts":"← Back to Promotions",()=>{
   watched=null;watchError="";watching=false;render();
  }));
  if(watching)section.append(el("p","ppw-industry-muted","Opening completed results…"));
  if(watchError)section.append(el("p","ppw-alert ppw-error",watchError));
  if(watched){
   section.append(el("span","ppw-news-eyebrow","PUBLISHED WORLD RESULTS"),
    el("h2","",watched.showName),
    el("p","ppw-industry-muted",watched.promotionName+" · Year "+watched.year+
     " / Week "+watched.week+" · Crowd "+Math.round(watched.crowdResponse)+"/100"),
    el("p","ppw-industry-privacy",
     "Completed outcomes only. Personal show reports and future creative remain private."));
   for(const entry of watched.entries){
    const card=el("article","ppw-public-result");
    card.append(el("span","ppw-news-desk",
     "CARD "+(entry.position+1)+" · "+(entry.type==="MATCH"?"MATCH":"ANGLE")),
     el("strong","",entry.headline));
    if(entry.type==="MATCH"){
     if(entry.winner)card.append(el("p","","WINNER · "+entry.winner));
     card.append(el("small","ppw-industry-muted",
      entry.outcome.replaceAll("_"," ").toLowerCase()+
      (entry.ratingStars===null?"":" · ★ "+entry.ratingStars.toFixed(2)+" / 5")));
    }else card.append(el("small","ppw-industry-muted",
     entry.outcome==="HAPPENS"?"Aired as planned":
     entry.outcome==="REFUSED"?"Did not take place":"Interrupted"));
    section.append(card);
   }
  }
  root.append(section);
 }
 let records:PromotionRecordView|null=null,recordsBusy=false,recordsError="";
 let recordsTab:"MY"|"WORLD"|"SEARCH"="MY",division:"MEN"|"WOMEN"="MEN";
 let recordOrder:"WINS"|"MATCHES"|"RATING"="WINS";
 let rankings:WorldRankingsView|null=null,rankingBusy=false,rankingError="";
 let careerSearch="",careerResults:WorldCareersView|null=null,
  careerBusy=false,careerError="";
 async function loadRankings(){
  if(!port.rankings||rankingBusy||rankings)return;
  rankingBusy=true;rankingError="";render();
  try{rankings=await port.rankings();}
  catch(e){rankingError=e instanceof Error?e.message:"Rankings unavailable";}
  finally{rankingBusy=false;render();}
 }
 async function findCareers(){
  if(!port.careers||careerBusy)return;
  if(careerSearch.trim().length<2){
   careerError="Enter at least two letters";render();return;
  }
  careerBusy=true;careerError="";render();
  try{careerResults=await port.careers(careerSearch.trim());}
  catch(e){careerError=e instanceof Error?e.message:"Career search unavailable";}
  finally{careerBusy=false;render();}
 }
 let news:IndustryNewsView|null=null,newsBusy=false,newsError="";
 async function loadNews(){
  if(!port.news||newsBusy||news)return;
  newsBusy=true;newsError="";render();
  try{news=await port.news();}
  catch(e){newsError=e instanceof Error?e.message:"World News could not load";}
  finally{newsBusy=false;render();}
 }
 let heritage:WorldHeritageView|null=null,heritageBusy=false,heritageError="";
 let heritageTab:"AWARDS"|"HALL"|"MOMENTS"=
  route==="#/hall-of-fame"?"HALL":route==="#/world-moments"?"MOMENTS":"AWARDS";
 let olderMoments:WorldHeritageView["moments"]=[],olderBusy=false,olderError="";
 let moreMoments:WorldMomentCursor|null=null;
 async function loadOlderMoments(){
  if(!port.olderMoments||!moreMoments||olderBusy)return;
  olderBusy=true;olderError="";render();
  try{
   const page=await port.olderMoments(moreMoments);
   olderMoments.push(...page.moments);
   moreMoments=page.momentCursor;
  }catch(e){olderError=e instanceof Error?e.message:"Older World Moments unavailable";}
  finally{olderBusy=false;render();}
 }
 async function loadHeritage(){
  if(!port.heritage||heritageBusy||heritage)return;
  heritageBusy=true;heritageError="";render();
  try{
   heritage=await port.heritage();
   olderMoments=[];moreMoments=heritage.momentCursor;
  }
  catch(e){heritageError=e instanceof Error?e.message:"World history unavailable";}
  finally{heritageBusy=false;render();}
 }
 let legends:LegendsVaultView|null=initialLegends??null,legendsBusy=false,legendsError="";
 let revealingLegend:string|null=null,inspectingCard:string|null=null,legendNotice="";
 let revealBusy=false,revealReturnScroll=0;
 const rarity:Record<string,number>={IMMORTAL:4,ICON:3,LEGEND:2,CULT:1};
 const nextLegend=(v:LegendsVaultView)=>v.entries
  .filter(e=>e.unlocked&&!e.revealSeen)
  .sort((a,b)=>(rarity[b.tier]??0)-(rarity[a.tier]??0)||
   (a.year??0)-(b.year??0)||(a.week??0)-(b.week??0)||
   a.id.localeCompare(b.id))[0]?.id??null;
 const retainScroll=()=>{
  const current=revealReturnScroll;
  render();
  if(typeof window!=="undefined")requestAnimationFrame(()=>window.scrollTo(0,current));
 };
 if(legends)revealingLegend=nextLegend(legends);
 async function loadLegends(){
  if(!port.legends||legendsBusy||legends)return;
  legendsBusy=true;legendsError="";render();
  try{
   legends=await port.legends();
   revealingLegend=nextLegend(legends);
  }catch(e){legendsError=e instanceof Error?e.message:"Legends Vault unavailable";}
  finally{legendsBusy=false;render();}
 }
 async function finishReveal(id:string,navigateMarket=false){
  if(revealBusy)return;
  revealBusy=true;
  const alreadySeen=legends?.entries.find(e=>e.id===id)?.revealSeen===true;
  try{
   if(!alreadySeen&&port.legendSeen)await port.legendSeen(id);
   if(legends)legends={...legends,entries:legends.entries.map(e=>e.id===id?
    {...e,revealSeen:true}:e)};
   revealingLegend=legends?nextLegend(legends):null;
   legendNotice="";legendsError="";
  }catch(e){
   legendsError=e instanceof Error?e.message:"Could not save reveal acknowledgement";
   revealingLegend=id;
  }finally{
   revealBusy=false;
   if(revealingLegend)retainScroll();
   else if(navigateMarket)port.openMarket?.();
   else retainScroll();
  }
 }
 async function collectLegend(id:string){
  if(!port.collectLegend)return;
  legendsBusy=true;legendNotice="";legendsError="";render();
  try{
   await port.collectLegend(id);
   if(port.legends)legends=await port.legends();
   legendNotice="Card permanently added to your personal collection.";
  }catch(e){legendsError=e instanceof Error?e.message:"Card could not be collected";}
  finally{legendsBusy=false;render();}
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
  clearLegendRevealPortal();
  if(watching||watched||watchError){renderPublicShow();return;}
  root.classList.add("ppw-editor","ppw-industry");root.replaceChildren();
  const head=el("header","ppw-industry-head");
  if(port.back)head.append(btn("← Back",()=>port.back?.()));
  const headings:Record<string,[string,string]>={
   STANDINGS:["THE WORLD / COMPANIES",route==="#/industry"?"Industry":"Promotions"],
   BROADCASTS:["THE WORLD / COMPLETED SHOWS","Recent Broadcasts"],
   RECORDS:["THE WORLD / THE ARCHIVE","Record Book"],
   LEGENDS:["THE WORLD / COLLECTIBLES","Legends Vault"],
   OFFICIAL:["THE PPW WIRE / THE RECORD","World News"],
   DIRT:["THE PPW WIRE / THE RUMOUR MILL","World News"],
   HERITAGE:["THE WORLD / THE LEGACY",
    heritageTab==="HALL"?"Hall of Fame":heritageTab==="MOMENTS"?"World Moments":"Annual Awards"]
  };
  const heading=headings[active]??headings.STANDINGS!;
  head.append(el("span","ppw-industry-kicker",heading[0]),
   el("h1","",heading[1]),
   el("p","ppw-industry-muted",view?
    view.worldName+" · Year "+view.year+" · Week "+view.week:
    "The companies, careers and history of the shared wrestling World."));
  root.append(head);
  if(error)root.append(el("p","ppw-alert ppw-error",error));
  if(!view){if(!loading)root.append(btn("Retry",()=>void load()));return;}
  // World destinations have distinct URLs and no duplicated Industry
  // menu/booking clock. News alone uses two editorial desk tabs.
  if(route==="#/news"){
   const nav=el("nav","ppw-industry-nav");
   nav.setAttribute("aria-label","News desks");
   for(const [key,label] of [["OFFICIAL","Official News"],["DIRT","Dirt Sheets"]] as const){
    const b=btn(label,()=>{active=key;render();void loadNews();});
    b.setAttribute("aria-current",active===key?"page":"false");
    nav.append(b);
   }
   root.append(nav);
  }
  if(active==="LEGENDS"){
   const section=el("section","ppw-industry-list ppw-legends");
   if(legends){
    const content=el("div","ppw-legend-content");
    section.append(content);
    drawLegendsVault(content,legends,{
     showReveal:id=>{revealReturnScroll=window.scrollY;revealingLegend=id;inspectingCard=null;retainScroll();},
     showCard:id=>{revealReturnScroll=window.scrollY;inspectingCard=id;revealingLegend=null;retainScroll();},
     closeCard:()=>{inspectingCard=null;retainScroll();},
     closeReveal:id=>{void finishReveal(id);},
     collect:id=>{if(!legendsBusy)void collectLegend(id);},
     openWrestler:port.openWrestler,
     goToMarket:id=>{void finishReveal(id,true);}
    },revealingLegend,inspectingCard);
   }
   if(legendsBusy)section.append(el("p","ppw-industry-muted","Reading the World Legends…"));
   if(legendsError)section.append(el("p","ppw-alert ppw-error",legendsError),
    btn("Retry",()=>{legends=null;void loadLegends();}));
   if(legendNotice)section.append(el("p","ppw-alert ppw-success",legendNotice));
   root.append(section);
  }else if(active==="STANDINGS"){
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
     detail.append(el("p","ppw-industry-muted","Owner: "+p.ownerName));
     if(p.publicIdentity)detail.append(el("p","ppw-industry-muted",
      "Creative approach: "+p.publicIdentity+
      ". Based on this rival's established booking preferences, not a prediction of future cards."));
     const appearances=view!.broadcasts.filter(show=>show.promotionId===p.promotionId).slice(0,3);
     if(appearances.length){
      detail.append(el("h3","","Recent published events"));
      for(const show of appearances){
       const row=el("div","ppw-industry-company-show");
       row.append(el("strong","",show.showName),el("small","",
        "Y"+show.year+" W"+show.week+
        " · Crowd "+Math.round(show.crowdResponse)+"/100"));
       if(show.isYours&&port.openOwnResults)row.append(btn("Open Results",
        ()=>port.openOwnResults?.(show.showId)));
       else if(show.humanManaged&&port.publicResults)row.append(btn("Read Results",
        ()=>void readRivalResult(show.promotionId,show.showId)));
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
  }else if(active==="HERITAGE"){
   const section=el("section","ppw-industry-list ppw-heritage");
   section.append(el("span","ppw-news-eyebrow","THE WORLD / THE LEGACY"),
    el("p","ppw-industry-muted",
     "Recorded from completed World events, not future plans or private booking."));
   if(heritageBusy)section.append(el("p","ppw-industry-muted",
    "Opening the World archives…"));
   if(heritageError)section.append(el("p","ppw-alert ppw-error",heritageError),
    btn("Retry",()=>void loadHeritage()));
   if(heritageTab==="AWARDS"){
    section.append(el("h3","","The End-of-Year Honours"),
     el("p","ppw-industry-muted",
      "Match, angle, men's wrestler, women's wrestler and promotion of the year. " +
      "Only a fully completed 52-week year can produce a new class of winners; " +
      "wrestlers and promotions must have enough verified performances to qualify."));
    const labels:Record<string,string>={
     MATCH:"MATCH OF THE YEAR",ANGLE:"ANGLE OF THE YEAR",
     WRESTLER_MEN:"MEN'S WRESTLER OF THE YEAR",
     WRESTLER_WOMEN:"WOMEN'S WRESTLER OF THE YEAR",
     PROMOTION:"PROMOTION OF THE YEAR"
    };
    // A graphic identity for the awards, not a misleading generic cup.
    const emblem=el("div","ppw-honours-emblem");
    emblem.setAttribute("aria-hidden","true");
    emblem.append(el("span","","✦"),el("strong","","YEAR-END HONOURS"));
    section.append(emblem);
    if(heritage&&!heritage.honours.length)section.append(el("div","ppw-heritage-empty-spotlight",
     "The stage is set. The first annual honours will be announced after 52 weeks of verified wrestling."));
    for(const award of heritage?.honours??[]){
     const card=el("article","ppw-heritage-honour");
     card.dataset.award=award.category.toLowerCase();
     card.append(el("span","ppw-news-desk","YEAR "+award.year+" · "+
       (labels[award.category]??award.category)),
      el("strong","ppw-heritage-honour-name",award.name));
     if(award.promotionName&&award.promotionName!==award.name)
      card.append(el("small","ppw-industry-muted",award.promotionName));
     card.append(el("p","ppw-heritage-proof",award.citation));
     section.append(card);
    }
   }else if(heritageTab==="HALL"){
    section.append(el("h3","","The Hall of Fame"),
     el("p","ppw-industry-muted",
      "A permanent honour for retired wrestlers with exceptional, documented " +
      "careers. Inductions take place at completed year-end ceremonies. " +
      "This does not unlock playable legends or award points."));
    if(heritage&&!heritage.hall.length){
     const wall=el("div","ppw-hall-empty-wall");
     wall.append(el("span","ppw-hall-emblem","✦"),
      el("strong","","THE FIRST CLASS AWAITS"),
      el("p","","Greatness earns a place here. Once eligible retired careers have been certified at year-end, their names become part of this World's history."));
     section.append(wall);
    }
    for(const member of heritage?.hall??[]){
     const card=el("article","ppw-heritage-inductee");
     card.append(el("span","ppw-hall-induction-mark","✦"));
     const portrait=createWrestlerPortrait(member.name,96);
     if(portrait){
      portrait.alt="Portrait of "+member.name;portrait.loading="lazy";
      const frame=el("div","ppw-heritage-portrait");
      portrait.onerror=()=>frame.remove();
      frame.append(portrait);card.append(frame);
     }
     const detail=el("div","ppw-heritage-inductee-detail");
     detail.append(el("span","ppw-news-desk","CLASS OF "+member.year+" · "+member.division),
      el("strong","",member.name),
      el("small","ppw-industry-muted",member.wins+" career wins · "+
       member.matches+" certified matches · "+member.bestStars.toFixed(2)+"★ best"));
     if(port.openWrestler)detail.append(btn("Career dossier →",
      ()=>port.openWrestler?.(member.personId)));
     card.append(detail);section.append(card);
    }
   }else{
    section.append(el("h3","","Historic Highlights"),
     el("p","ppw-industry-muted",
      "The enduring highlight reel: historic title changes, classics, big turns " +
      "and landmark events. Only a few verified moments make the cut each week."));
    if(heritage&&!heritage.moments.length)section.append(el("p","ppw-industry-empty",
     "The World hasn't recorded a landmark moment yet."));
    for(const moment of [...(heritage?.moments??[]),...olderMoments]){
     const card=el("article","ppw-heritage-moment");
     card.dataset.kind=moment.kind.toLowerCase();
     card.append(el("span","ppw-news-desk",
       moment.kind.replaceAll("_"," ")+" · YEAR "+moment.year+" / WEEK "+moment.week),
      el("strong","",moment.title),
      el("p","",moment.description),
      el("small","ppw-industry-muted",moment.promotionName));
     section.append(card);
    }
    if(olderBusy)section.append(el("p","ppw-industry-muted","Turning back the World clock…"));
    if(olderError)section.append(el("p","ppw-alert ppw-error",olderError),
     btn("Retry older moments",()=>void loadOlderMoments()));
    if(moreMoments&&!olderBusy)section.append(btn("Load older World Moments",
     ()=>void loadOlderMoments()));
   }
   root.append(section);
  }else if(active==="RECORDS"){
   const section=el("section","ppw-industry-list ppw-industry-record-book");
   section.append(el("h2","","The Record Books"),
    el("p","ppw-industry-muted",
     "The official record: confirmed matches, career milestones and wrestlers who made their mark."));
   const choice=el("div","ppw-industry-nav");
   for(const [key,label] of [["MY","My Promotion"],["WORLD","World Rankings"],
    ["SEARCH","Find a Career"]] as const){
    const control=btn(label,()=>{
     recordsTab=key;render();
     if(key==="MY")void loadRecords();
     if(key==="WORLD")void loadRankings();
    });
    control.setAttribute("aria-current",recordsTab===key?"page":"false");
    choice.append(control);
   }
   section.append(choice);
   if(recordsTab==="MY"){
    section.append(el("p","ppw-industry-muted",
     "Eight leading active roster wrestlers by certified wins in this promotion. Sort these eight by match appearances or average ratings; the list is not a ranking of the entire talent market."));
    const sort=el("div","ppw-record-sort");
    sort.setAttribute("role","group");sort.setAttribute("aria-label","Sort promotion records");
    for(const [order,label] of [["WINS","Most wins"],["MATCHES","Most matches"],["RATING","Top average rating"]] as const){
     const control=btn(label,()=>{recordOrder=order;render();});
     control.setAttribute("aria-pressed",String(recordOrder===order));sort.append(control);
    }
    section.append(sort);
    if(recordsError)section.append(el("p","ppw-alert ppw-error",recordsError),
     btn("Try again",()=>void loadRecords()));
    if(recordsBusy)section.append(el("p","ppw-industry-muted","Checking promotion records…"));
    if(records&&!records.leaders.length)section.append(el("p","ppw-industry-muted",
     "No certified match records for the current roster yet."));
    const ordered=[...(records?.leaders??[])].sort((a,b)=>{
     const main=recordOrder==="WINS"?b.wins-a.wins:recordOrder==="MATCHES"?
      b.matches-a.matches:(b.averageStars??-1)-(a.averageStars??-1);
     return main||b.wins-a.wins||b.matches-a.matches||
      a.name.localeCompare(b.name)||a.personId.localeCompare(b.personId);
    });
    for(const [i,w] of ordered.entries()){
     const item=el("article","ppw-industry-record-row ppw-promotion-record-row");
     if(i===0)item.classList.add("ppw-record-leader");
     const identity=el("div","ppw-record-identity");
     identity.append(el("strong","",w.name),
      el("small","",w.wins+" wins in "+w.matches+" completed matches"+
       (w.averageStars===null?"":" · "+w.averageStars.toFixed(2)+"★ average")));
     item.append(el("strong","ppw-record-position",String(i+1)),identity);
     if(port.openWrestler)item.append(btn("Dossier →",()=>port.openWrestler?.(w.personId)));
     section.append(item);
    }
   }else if(recordsTab==="WORLD"){
    section.append(el("p","ppw-industry-muted",
     "Top 20 in each division, ranked on verified recent matches, actual wins, " +
     "star ratings, crowd reception, level of competition, current form and championships. " +
     "The latest unfinished week is excluded."));
    const divisions=el("div","ppw-industry-nav");
    for(const value of ["MEN","WOMEN"] as const){
     const control=btn(value==="MEN"?"Men":"Women",()=>{
      division=value;render();
     });
     control.setAttribute("aria-current",division===value?"page":"false");
     divisions.append(control);
    }
    section.append(divisions);
    if(rankingBusy)section.append(el("p","ppw-industry-muted","Reading the World rankings…"));
    if(rankingError)section.append(el("p","ppw-alert ppw-error",rankingError),
     btn("Retry",()=>void loadRankings()));
    const leaders=(rankings?.leaders??[]).filter(r=>r.division===division);
    if(rankings&&!leaders.length)section.append(el("p","ppw-industry-empty",
     "No rated, completed matches in this division's recent window yet."));
    for(const wrestler of leaders){
     const item=el("article","ppw-industry-record-row ppw-industry-world-rank");
     const rank=el("strong","","#"+wrestler.rank);
     const identity=el("div","ppw-industry-rank-details");
     identity.append(el("span","",wrestler.name+
      (wrestler.champion?"  ♛":"")),
      el("small","",wrestler.wins+"–"+wrestler.losses+" · "+
       (wrestler.averageStars===null?"Unrated":wrestler.averageStars.toFixed(2)+"★")+" average"));
     item.append(rank,identity);
     if(port.openWrestler)item.append(btn("Career →",
      ()=>port.openWrestler?.(wrestler.personId)));
     section.append(item);
    }
   }else{
    section.append(el("p","ppw-industry-muted",
     "Search wrestlers across every promotion, including former stars. " +
     "Open an existing dossier for their verified career history and title lineage."));
    const form=document.createElement("form");form.className="ppw-industry-filters";
    const label=el("label","ppw-industry-field","Wrestler's name");
    const input=document.createElement("input");input.type="search";
    input.value=careerSearch;input.placeholder="Search the wrestling World";
    input.autocomplete="off";
    label.append(input);
    const submit=btn("Search careers",()=>{careerSearch=input.value;void findCareers();});
    form.append(label,submit);
    form.onsubmit=e=>{e.preventDefault();careerSearch=input.value;void findCareers();};
    section.append(form);
    if(careerBusy)section.append(el("p","ppw-industry-muted","Searching public careers…"));
    if(careerError)section.append(el("p","ppw-alert ppw-error",careerError));
    if(careerResults&&!careerResults.people.length)
     section.append(el("p","ppw-industry-empty","No wrestlers found with that name."));
    for(const wrestler of careerResults?.people??[]){
     const item=el("article","ppw-industry-record-row ppw-industry-career-row");
     const identity=el("div","ppw-industry-rank-details");
     identity.append(el("span","",wrestler.name),
      el("small","",(wrestler.division??"World talent").toLowerCase()+
       " · "+(wrestler.promotionName??wrestler.status.toLowerCase())));
     item.append(identity);
     if(port.openWrestler)item.append(btn("View career →",
      ()=>port.openWrestler?.(wrestler.personId)));
     section.append(item);
    }
    if(careerResults?.hasMore)section.append(el("p","ppw-industry-muted",
     "Showing the first 20 matches. Refine your search for more."));
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
     "Backstage gossip, theories and occasionally complete nonsense. Rumours are not facts. Another manager's private decisions stay private."));
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
    // Internal award ordering stays in the resolver, not the reader's newsroom.
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
     "The rumour mill is unusually quiet. We suspect someone has disconnected the office coffee machine."));
   for(const [index,story] of published.entries()){
    const item=el("article","ppw-news-story");
    if(index===0)item.classList.add("ppw-news-lead");
    const wild=!official&&story.key.startsWith("wild:");
    if(wild)item.classList.add("ppw-news-wild-theory");
    item.append(el("span","ppw-news-desk",official?"CONFIRMED / OFFICIAL":
     wild?"UNVERIFIED / INTERNET CONSPIRACY 👀":"RUMOUR / NOT CONFIRMED"),
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
     LEGEND_ARRIVED:s=>(s.personName??"A historic legend")+" awakens in the World talent market",
     CAREER_STAGE_CHANGED:s=>(s.personName??"A wrestler")+" enters a new career chapter",
     PROMOTION_TIER_CHANGED:s=>(s.promotionName??"A promotion")+" moves "+
      (s.toTier??"to a new level"),
     PROMOTION_RESTRUCTURED:s=>(s.promotionName??"A promotion")+" reshapes its operation",
     PROMOTION_ENTERED_DORMANCY:s=>(s.promotionName??"A promotion")+" suspends operations",
     PROMOTION_RECOVERED_FROM_DISTRESS:s=>(s.promotionName??"A promotion")+" finds its feet again"
    };
    for(const story of view.headlines){
     const moment=certifiedCareerMoment(story);
     const item=el("article","ppw-news-story"+(moment?" ppw-news-story-career":""));
     item.append(el("span","ppw-news-desk",moment?
      "CERTIFIED CAREER CHAPTER":"CONFIRMED / INDUSTRY"),
      el("strong","ppw-news-story-title",moment?.title??
       titles[story.kind]?.(story)??"Industry update"));
     if(moment)item.append(el("p","",moment.detail));
     item.append(el("small","ppw-industry-muted",
      "Year "+story.year+" · Week "+story.week));
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
    if(show.isYours&&port.openOwnResults)card.append(btn("Open Results",
     ()=>port.openOwnResults?.(show.showId)));
    else if(show.humanManaged&&port.publicResults)card.append(btn("Read Results",
     ()=>void readRivalResult(show.promotionId,show.showId)));
    section.append(card);
   }
   root.append(section);
  }
 }
 void load();
 // Deep link from the completed weekly show / operator desk. No polling;
 // the Vault is read once and the unseen one-time reveal appears immediately.
 if(active==="LEGENDS")void loadLegends();
 if(route==="#/news")void loadNews();
 if(active==="HERITAGE")void loadHeritage();
 if(active==="RECORDS")void loadRecords();
 return {refresh:load};
}
