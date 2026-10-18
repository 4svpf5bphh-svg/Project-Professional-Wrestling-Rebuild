import type {readIndustryWorldHub} from "../db/industry-world-hub.js";
export type IndustryHubView=Awaited<ReturnType<typeof readIndustryWorldHub>>;
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
  active:"STANDINGS"|"BROADCASTS"="STANDINGS",
  search="",tier="ALL",sort:IndustryOrder="REACH";
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
  head.append(el("span","ppw-industry-kicker","PPW / THE WORLD"),
   el("h1","","Industry"),
   el("p","ppw-industry-muted",view?
    view.worldName+" · Year "+view.year+" · Week "+view.week:
    "The same World, shared by every player and AI promotion."));
  root.append(head);
  if(error)root.append(el("p","ppw-alert ppw-error",error));
  if(!view){if(!loading)root.append(btn("Retry",()=>void load()));return;}
  const status=el("section","ppw-industry-status");
  status.append(el("span","","WORLD PHASE"),
   el("strong","",view.phase==="OPEN"?"Bookings open":
    view.phase==="LOCKED"?"Cards locked":"World resolution"));
  const when=Number.isFinite(view.nextLockEpoch)&&view.nextLockEpoch>0?
    new Date(view.nextLockEpoch*1000).toLocaleString("en-GB",{
     dateStyle:"medium",timeStyle:"short"}):"Not scheduled";
  status.append(el("span","","NEXT WORLD LOCK"),el("strong","",when));
  status.append(el("p","ppw-industry-muted",
   "One weekly deadline for every promotion. The server resolves booked events; opening the game gives no simulation advantage."));
  root.append(status);
  const nav=el("nav","ppw-industry-nav");
  nav.setAttribute("aria-label","Industry views");
  for(const [key,label] of [["STANDINGS","Promotions"],["BROADCASTS","Recent broadcasts"]] as const){
   const b=btn(label,()=>{active=key;render();});
   b.setAttribute("aria-current",active===key?"page":"false");
   nav.append(b);
  }
  root.append(nav);
  if(active==="STANDINGS"){
   const section=el("section","ppw-industry-list");
   section.append(el("h2","","The promotion landscape"),
    el("p","ppw-industry-muted",
     "World ranking reflects media reach. Form measures crowd response to completed shows across 12 PPW weeks."));
   const filters=el("div","ppw-industry-filters");
   const queryLabel=el("label","ppw-industry-field","Search promotions");
   const query=document.createElement("input");query.type="search";
   query.value=search;query.placeholder="Company name or tier";
   query.setAttribute("aria-label","Search public PPW promotions");
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
     const summary=document.createElement("summary");summary.className="ppw-industry-company-summary";
     const crest=el("span","ppw-industry-company-crest",
      p.name.split(/\\s+/).filter(Boolean).slice(0,2).map(s=>s[0]).join("").toUpperCase());
     crest.setAttribute("aria-hidden","true");
     const identity=el("span","ppw-industry-company-identity");
     identity.append(el("span","ppw-industry-company-name",p.name));
     const state=el("span","ppw-industry-company-subtitle",
      p.tier.toLowerCase()+" · "+
      (p.managementMode==="AI"?"AI promotion":p.isYours?"Your promotion":"Promotion"));
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
