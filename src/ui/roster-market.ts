/** PPW roster and market: one thumb-friendly directory, separate recruitment
 * from contracted talent, reuse existing team, stable, persona, contract desks.
 */
import type {readWrestlerDirectory,DirectoryFilter,DirectoryView}
 from "../db/wrestler-directory.js";
import type {OfferTerms} from "../domain/contract-economics.js";
import {createWrestlerCard} from "./wrestler-card.js";
export type WrestlerDirectoryData=Awaited<ReturnType<typeof readWrestlerDirectory>>;
export interface RosterMarketPort{
 load(filter:DirectoryFilter):Promise<WrestlerDirectoryData>;
 offer(input:{personId:string;requestId:string;expectedRevision:number;
  terms:OfferTerms}):Promise<unknown>;
 openContracts():void;openTagTeams():void;openStables():void;
 openWrestler(personId:string,origin:DirectoryView):void;
 openBusiness?():void;
 openStaff?():void;
 openIndustry?():void;
 backToBooking?():void;
 backToHome?():void;
}
const el=(tag:string,cls="",value="")=>{
 const x=document.createElement(tag);x.className=cls;x.textContent=value;return x;
};
const btn=(value:string,fn:()=>void,disabled=false)=>{
 const x=el("button","ppw-directory-button",value) as HTMLButtonElement;
 x.type="button";x.onclick=fn;x.disabled=disabled;return x;
};
const money=(n:number)=>"$"+Math.round(n).toLocaleString("en-GB");
const value=(n:number|null)=>n===null?"–":Math.round(n).toString();
type TermsDraft={family:OfferTerms["family"];role:OfferTerms["roleExpectation"];
 creative:OfferTerms["creativeControl"];weeks:number;dates:number;
 weekly:number;appearance:number;bonus:number};
const offerDefaults=():TermsDraft=>({
 family:"LIMITED_NON_EXCLUSIVE",role:"FEATURED",creative:"CONSULTATION",
 weeks:8,dates:4,weekly:0,appearance:9000,bonus:0
});
export function mountRosterMarket(root:HTMLElement,port:RosterMarketPort,
 initialView:DirectoryView="ROSTER"){
 let filter:DirectoryFilter={view:initialView,search:"",division:"ALL",
  availability:"ALL",role:"ALL",contract:"ALL",interest:"ALL",sort:initialView==="MARKET"?"INTEREST":"ROLE",minPopularity:undefined,limit:25,offset:0};
 let view:WrestlerDirectoryData|null=null,error="",success="",loading=false,
  sending=false,pendingKey="",activeOffer:string|null=null;
 let choices=new Map<string,TermsDraft>();
 let querySerial=0;
 function pick(next:Partial<DirectoryFilter>){
  filter={...filter,...next,offset:0};void load();
 }
 async function load(){
  const current=++querySerial;loading=true;error="";render();
  try{
   const result=await port.load(filter);
   if(current!==querySerial)return;
   view=result;
  }catch(e){
   if(current!==querySerial)return;
   error=e instanceof Error?e.message:"Could not load wrestler directory";
  }finally{if(current===querySerial){loading=false;render();}}
 }
 const numbers=(box:HTMLElement,caption:string,initial:number,min:number,max:number,
  onchange:(n:number)=>void)=>{
  const label=el("label","ppw-directory-field",caption);
  const input=document.createElement("input");
  input.type="number";input.inputMode="numeric";input.min=String(min);
  input.max=String(max);input.value=String(initial);
  input.setAttribute("aria-label",caption);
  input.onchange=()=>onchange(Number(input.value));
  label.append(input);box.append(label);
 };
 const selection=<T extends string>(caption:string,options:readonly (readonly [T,string])[],
  current:T,onchange:(v:T)=>void)=>{
  const label=el("label","ppw-directory-field",caption);
  const select=document.createElement("select");select.setAttribute("aria-label",caption);
  for(const [id,name] of options){
   const option=document.createElement("option");option.value=id;option.textContent=name;
   select.append(option);
  }
  select.value=current;select.onchange=()=>onchange(select.value as T);
  label.append(select);return label;
 };
 async function send(personId:string){
  if(!view||!view.canEdit||sending)return;
  const draft=choices.get(personId)??offerDefaults();
  const exclusive=draft.family==="EXCLUSIVE";
  const oneOff=draft.family==="ONE_OFF";
  const terms:OfferTerms={
   family:draft.family,roleExpectation:draft.role,creativeControl:
    oneOff?"NONE":draft.creative,
   startWeekIndex:view.currentWeekIndex,termWeeks:oneOff?1:draft.weeks,
   dateEntitlement:oneOff?1:exclusive?draft.weeks:draft.dates,
   weeklyGuarantee:oneOff?0:draft.weekly,
   appearanceFee:exclusive?0:draft.appearance,signingBonus:draft.bonus
  };
  if(![terms.termWeeks,terms.dateEntitlement,terms.weeklyGuarantee,
   terms.appearanceFee,terms.signingBonus].every(n=>Number.isSafeInteger(n)&&n>=0)||
   terms.termWeeks<1||terms.termWeeks>52||terms.dateEntitlement<1||
   terms.dateEntitlement>104||terms.dateEntitlement>terms.termWeeks*2||
   terms.weeklyGuarantee>1e9||terms.appearanceFee>1e9||terms.signingBonus>1e9){
   error="Review the term length, dates and non-negative payment amounts.";render();return;
  }
  const requestId=pendingKey||crypto.randomUUID();pendingKey=requestId;
  sending=true;error="";success="";render();
  try{
   const result=await port.offer({personId,requestId,
    expectedRevision:view.worldRevision,terms});
   if(result&&typeof result==="object"&&"status" in result&&
    (result as {status:unknown}).status==="STALE")
    throw new Error("The World changed. Refresh before making this offer.");
   pendingKey="";activeOffer=null;
   success="Offer sent. The wrestler decides during World resolution.";
   await load();
  }catch(e){error=e instanceof Error?e.message:"Offer could not be sent";}
  finally{sending=false;render();}
 }
 function offerEditor(personId:string){
  const draft=choices.get(personId)??offerDefaults();choices.set(personId,draft);
  const editor=el("div","ppw-directory-offer");
  editor.append(el("h3","","Propose a contract"),
   el("p","ppw-directory-muted",
    "An offer is not an agreement. Wages, dates and creative control affect their answer."));
  editor.append(selection("Contract type",[
   ["LIMITED_NON_EXCLUSIVE","Non-exclusive • purchased dates"],
   ["EXCLUSIVE","Exclusive • unlimited appearances"],
   ["ONE_OFF","One appearance"]
  ] as const,draft.family,next=>{
   draft.family=next;pendingKey="";render();
  }));
  editor.append(selection("Card role",[
   ["DEVELOPMENTAL","Developing"],["REGULAR","Regular"],
   ["FEATURED","Featured"],["UPPER_CARD","Upper card"],
   ["MAIN_EVENT","Main event"],["SPECIAL_ATTRACTION","Special attraction"]
  ] as const,draft.role,next=>{draft.role=next;pendingKey="";}));
  if(draft.family!=="ONE_OFF")editor.append(selection("Creative rights",[
   ["NONE","No control"],["CONSULTATION","Consultation"],
   ["PROTECTED_FINISHES","Protected finishes"],
   ["FULL_APPROVAL","Full approval"]
  ] as const,draft.creative,next=>{draft.creative=next;pendingKey="";}));
  const fields=el("div","ppw-directory-offer-fields");
  if(draft.family!=="ONE_OFF")numbers(fields,"Weeks (1–52)",
   draft.weeks,1,52,n=>{draft.weeks=n;pendingKey="";});
  if(draft.family==="LIMITED_NON_EXCLUSIVE")
   numbers(fields,"Purchased dates",draft.dates,1,104,
    n=>{draft.dates=n;pendingKey="";});
  if(draft.family!=="ONE_OFF")numbers(fields,"Weekly guarantee ($)",
   draft.weekly,0,1e9,n=>{draft.weekly=n;pendingKey="";});
  if(draft.family!=="EXCLUSIVE")numbers(fields,"Appearance fee ($)",
   draft.appearance,0,1e9,n=>{draft.appearance=n;pendingKey="";});
  numbers(fields,"Signing bonus ($)",draft.bonus,0,1e9,
   n=>{draft.bonus=n;pendingKey="";});
  editor.append(fields,btn(sending?"Sending…":"Submit offer",
   ()=>void send(personId),sending));
  return editor;
 }
 function render(){
  root.classList.add("ppw-editor","ppw-directory");
  root.replaceChildren();
  const head=el("header","ppw-directory-header");
  head.append(el("span","ppw-directory-kicker","PPW / THE LOCKER ROOM"),
   el("h1","",filter.view==="ROSTER"?"My Roster":"Talent Market"),
   el("p","ppw-directory-muted",
    view?"Year "+view.year+" · Week "+view.week+
     (filter.view==="ROSTER"?" · Signed talent only":" · World-wide recruitment"):
     "Your wrestlers, their contracts and opportunities across the World."));
  root.append(head);
  if(error)root.append(el("p","ppw-alert ppw-error",error));
  if(success)root.append(el("p","ppw-alert ppw-success",success));
  const controls=el("section","ppw-directory-filters");
  const search=document.createElement("input");
  search.type="search";search.placeholder="Search wrestlers by name";
  search.setAttribute("aria-label","Search wrestlers");
  search.value=filter.search??"";search.maxLength=70;
  search.oninput=()=>{filter.search=search.value;};
  search.onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();pick({search:search.value});}};
  controls.append(search,btn("Search",()=>pick({search:search.value})));
  controls.append(selection("Division",[
   ["ALL","All"],["MEN","Men"],["WOMEN","Women"]
  ] as const,filter.division??"ALL",division=>pick({division})));
  const sortOptions=filter.view==="ROSTER"?[
   ["ROLE","By card role"],["NAME","Name"],["POPULARITY","Popularity"],
   ["RECOGNITION","Recognition"],["MOMENTUM","Momentum"],
   ["DATES_LOW","Dates remaining: lowest"],["DATES_HIGH","Dates remaining: highest"],
   ["EXPIRY","Expires soonest"],["PAY_LOW","Wage: lowest"],
   ["PAY_HIGH","Wage: highest"]
  ] as const:[
   ["INTEREST","Interest: strongest"],["NAME","Name"],
   ["POPULARITY","Popularity"],["RECOGNITION","Recognition"],
   ["MOMENTUM","Momentum"],["VALUE","Value: lowest"]
  ] as const;
  controls.append(selection("Sort by",sortOptions,
   sortOptions.some(x=>x[0]===filter.sort)?filter.sort??"NAME":
    filter.view==="ROSTER"?"ROLE":"INTEREST",sort=>pick({sort})));
  if(filter.view==="ROSTER"){
   controls.append(selection("Role",[
    ["ALL","All roles"],["MAIN_EVENT","Main event"],
    ["UPPER_CARD","Upper card"],["FEATURED","Featured"],
    ["REGULAR","Regular"],["DEVELOPMENTAL","Developmental"],
    ["SPECIAL_ATTRACTION","Special attraction"]
   ] as const,filter.role??"ALL",role=>pick({role})));
   controls.append(selection("Contract",[
    ["ALL","All deals"],["EXCLUSIVE","Exclusive"],
    ["LIMITED_NON_EXCLUSIVE","Non-exclusive"]
   ] as const,filter.contract??"ALL",contract=>pick({contract})));
  }else{
   controls.append(selection("Contract availability",[
    ["ALL","All wrestlers"],["APPROACHABLE","Can approach"],
    ["FREE_AGENT","Free agents"],["NON_EXCLUSIVE","Non-exclusive"]
   ] as const,filter.availability??"ALL",availability=>pick({availability})));
   controls.append(selection("Recruitment interest",[
    ["ALL","Any interest"],["OPEN_PLUS","Open to talks+"],
    ["INTERESTED_PLUS","Interested+"]
   ] as const,filter.interest??"ALL",interest=>pick({interest})));
   controls.append(el("p","ppw-directory-hint",
    "Interest is an estimate of willingness to discuss terms, not a guarantee of acceptance."));
  }
  const advanced=document.createElement("details");advanced.className="ppw-directory-advanced";
  advanced.append(el("summary","","Advanced attributes"));
  const thresholds=el("div","ppw-directory-thresholds");
  for(const [key,label] of [
   ["minPopularity","Min popularity"],["minRecognition","Min recognition"],
   ["minMomentum","Min momentum"],["minCraft","Min match craft"],
   ["minPresentation","Min presentation"]
  ] as const)numbers(thresholds,label,filter[key]??0,0,100,n=>{
   filter[key]=n===0?undefined:n;
  });
  advanced.append(thresholds,btn("Apply attributes",()=>pick({})));
  controls.append(advanced);root.append(controls);
  if(loading)root.append(el("p","ppw-directory-loading","Updating directory…"));
  if(!view){
   if(!loading)root.append(btn("Retry",()=>void load()));
   return;
  }
  const listing=el("section","ppw-directory-list");
  listing.setAttribute("aria-label",filter.view==="ROSTER"?"My signed wrestlers":"Talent marketplace");
  const heading=el("div","ppw-directory-listheading");
  heading.append(el("h2","",filter.view==="ROSTER"?"Signed wrestlers":"Available profiles"),
   el("span","ppw-directory-muted","Page "+(Math.floor((filter.offset??0)/(filter.limit??25))+1)));
  listing.append(heading);
  for(const p of view.people){
   const card=document.createElement("details");card.className="ppw-directory-card";
   const title=document.createElement("summary");
   const label=p.pendingOffer?"OFFER PENDING":
    p.availability==="EXCLUSIVE_ELSEWHERE"?"EXCLUSIVE ELSEWHERE":
    p.availability==="SIGNED_FUTURE_YOURS"?
      "STARTS IN "+p.startsInWeeks+" WEEKS":
    p.availability==="YOUR_ROSTER"?(p.remainingDates===null?"UNLIMITED DATES":
      p.remainingDates+" DATES LEFT"):
    p.availability==="FUTURE_EXCLUSIVE_ELSEWHERE"?"EXCLUSIVE STARTS SOON":
    p.availability==="CONTRACTED_SOON"?"CONTRACTED SOON":
    p.availability==="FREE_AGENT"?"FREE AGENT":"NON-EXCLUSIVE";
   title.append(createWrestlerCard({...p,status:label},{
    context:filter.view,label}));
   if(filter.view==="MARKET")title.append(el("span","ppw-directory-interest",
    "Recruitment interest · "+p.interest.replaceAll("_"," ").toLowerCase()));
   card.append(title);
   const detail=el("div","ppw-directory-detail");
   const metrics=el("div","ppw-directory-metrics");
   for(const [name,n] of [
    ["Recognition",p.recognition],["Match craft",p.matchCraft],
    ["Presentation",p.presentation],["Morale",p.morale]
   ] as const){
    const row=el("div","ppw-directory-metric");
    row.append(el("span","",name),el("strong","",value(n)));metrics.append(row);
   }
   detail.append(metrics);
   if(filter.view==="ROSTER"){
    detail.append(el("p","ppw-directory-muted",
     (p.family??"Contract").replaceAll("_"," ")+" · "+
     (p.startsInWeeks&&p.startsInWeeks>0?
      "Starts in "+p.startsInWeeks+" weeks":
      (p.weeksRemaining??0)+" weeks left")+" · Weekly "+
     money(p.weeklyGuarantee??0)+" · Appearance "+money(p.appearanceFee??0)));
    if(p.startsInWeeks&&p.startsInWeeks>0)
     detail.append(el("p","ppw-directory-warning",
      "Already signed, but not eligible for booking until the contract starts."));
    else if(p.remainingDates===0)detail.append(el("p","ppw-directory-warning",
     "No dates remaining — negotiate an addendum before booking."));
    detail.append(btn("Wrestler profile →",()=>port.openWrestler(p.personId,filter.view)),
     btn("Manage contract →",()=>port.openContracts()));
   }else{
    detail.append(el("p","ppw-directory-interest",
     "Recruitment interest · "+p.interest.replaceAll("_"," ").toLowerCase()+
     ". Indicative only: agreed terms and acceptance are still uncertain."));
    detail.append(el("p","ppw-directory-muted",
     "Indicative weekly market value: "+
      (p.estimatedWeeklyValue===null?"Unavailable":money(p.estimatedWeeklyValue))+
      ". This is not an asking price or predicted acceptance."));
    detail.append(el("p","ppw-directory-muted",p.availability==="EXCLUSIVE_ELSEWHERE"?
     "Exclusive contract held elsewhere. Recruitment is currently blocked.":
     p.availability==="FUTURE_EXCLUSIVE_ELSEWHERE"?
      "Another promotion's exclusive agreement begins in "+
       Math.max(0,(p.nextFutureStart??view.currentWeekIndex)-view.currentWeekIndex)+
       " weeks. Offers extending into it will be refused.":
     p.availability==="CONTRACTED_SOON"?
      "A signed commitment begins in "+
       Math.max(0,(p.nextFutureStart??view.currentWeekIndex)-view.currentWeekIndex)+
       " weeks. Longer offers may conflict with it.":
     p.availability==="FREE_AGENT"?
      "No current or future signed contract. You can submit terms for consideration.":
      "Works elsewhere on non-exclusive terms. Acceptance depends on scheduling, fit and your offer."));
    detail.append(btn("Full wrestler profile →",
     ()=>port.openWrestler(p.personId,filter.view)));
    if(p.pendingOffer)detail.append(el("p","ppw-directory-muted",
     "Your offer is awaiting the next World resolution."));
    else if(p.availability!=="EXCLUSIVE_ELSEWHERE"&&view.canEdit)
     detail.append(btn(activeOffer===p.personId?"Close proposal":"Make contract offer",
      ()=>{activeOffer=activeOffer===p.personId?null:p.personId;render();}));
    if(activeOffer===p.personId&&view.canEdit&&
      p.availability!=="EXCLUSIVE_ELSEWHERE"&&!p.pendingOffer)
     detail.append(offerEditor(p.personId));
    if(!view.canEdit)detail.append(el("p","ppw-directory-muted",
     "World Lock is closed; recruitment is read-only."));
   }
   card.append(detail);
   if(activeOffer===p.personId)card.open=true;
   if(filter.view==="ROSTER"&&filter.sort==="ROLE"){
    const role=p.roleExpectation??"UNASSIGNED";
    let group=listing.querySelector<HTMLDetailsElement>(
     '.ppw-directory-role-group[data-role="'+role+'"]');
    if(!group){
     group=document.createElement("details");
     group.className="ppw-directory-role-group";group.dataset.role=role;group.open=true;
     const summary=el("summary","ppw-directory-role-heading",
      role==="UNASSIGNED"?"Other wrestlers":role.replaceAll("_"," ").toLowerCase());
     group.append(summary);listing.append(group);
    }
    group.append(card);
   }else listing.append(card);
  }
  if(!view.people.length)listing.append(el("p","ppw-directory-empty",
   "No wrestlers match. Clear the filters or change division."));
  const pager=el("div","ppw-directory-pager");
  pager.append(btn("← Previous",()=>{filter.offset=Math.max(0,(filter.offset??0)-
   (filter.limit??25));void load();},loading||(filter.offset??0)===0),
   btn("Next →",()=>{filter.offset=(filter.offset??0)+(filter.limit??25);
    void load();},loading||!view.hasMore));
  listing.append(pager);root.append(listing);
 }
 void load();
 return {refresh:load};
}
