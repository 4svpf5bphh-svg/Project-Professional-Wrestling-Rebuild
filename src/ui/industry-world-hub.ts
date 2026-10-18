import type {readIndustryWorldHub} from "../db/industry-world-hub.js";
export type IndustryHubView=Awaited<ReturnType<typeof readIndustryWorldHub>>;
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
  active:"STANDINGS"|"BROADCASTS"="STANDINGS";
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
     "Ranked by media reach, not an invented overall score. 12-week form uses only completed shows."));
   for(const p of view.promotions){
    const card=el("article","ppw-industry-company");
    card.append(el("span","ppw-industry-rank","#"+p.rank),
     el("div","ppw-industry-company-name",p.name+(p.isYours?" · YOU":"")));
    const meta=el("div","ppw-industry-muted",
     p.tier+" · "+(p.mediaReach===null?"No public reach":Math.round(p.mediaReach)+" media reach")+
     " · "+p.recentShowCount+" recent shows");
    card.append(meta);
    if(p.recentAverageCrowd!==null)
     card.append(el("div","ppw-industry-crowd",
      "Avg crowd response · "+p.recentAverageCrowd.toFixed(1)+"/100"));
    section.append(card);
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
