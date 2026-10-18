/** Mobile contract workspace adapted from original PPW's expiring/offers desk.
 * All balances are server receipts, never optimistic booking rights.
 */
import type {readContractDesk} from "../db/contract-desk-workspace.js";
import type {OfferTerms} from "../domain/contract-economics.js";
export type ContractDeskView=Awaited<ReturnType<typeof readContractDesk>>;
type Mutation={requestId:string;expectedRevision:number};
export interface ContractDeskPort{
 load():Promise<ContractDeskView>;
 requestDates(input:Mutation&{contractId:string;additionalDates:number;additionalPayment:number}):Promise<unknown>;
 cancelDates(input:Mutation&{dateRequestId:string}):Promise<unknown>;
 renewal(input:Mutation&{contractId:string}):Promise<unknown>;
 negotiatedRenewal(input:Mutation&{personId:string;sourceContractId:string;terms:OfferTerms}):Promise<unknown>;
 withdrawRenewal(input:Mutation&{proposalId:string}):Promise<unknown>;
 withdrawOffer(input:Mutation&{offerId:string}):Promise<unknown>;
 openWrestler?(personId:string):void;
}
const el=(tag:string,cls="",text="")=>{
 const x=document.createElement(tag);x.className=cls;x.textContent=text;return x;};
const money=(n:number)=>"$"+Math.round(n).toLocaleString("en-GB");
const title=(s:string)=>s.replaceAll("_"," ").toLowerCase().replace(/(^|\s)\S/g,v=>v.toUpperCase());
const btn=(value:string,click:()=>void,disabled=false)=>{
 const x=el("button","ppw-contract-button",value) as HTMLButtonElement;
 x.type="button";x.disabled=disabled;x.onclick=click;return x;};
export function mountContractDesk(root:HTMLElement,port:ContractDeskPort,onBack?:()=>void){
 let view:ContractDeskView|null=null,working=false,error="",notice="";
 let filter:"ALL"|"ATTENTION"|"NO_DATES"|"EXPIRING"="ATTENTION";
 let search="";
 let amounts=new Map<string,{dates:number;payment:number}>();
 let pending=new Map<string,string>();
 const editable=()=>view?.canEdit===true&&!working;
 const request=(key:string)=>{let id=pending.get(key);if(!id){id=crypto.randomUUID();pending.set(key,id);}return id;};
 const clear=(key:string)=>{pending.delete(key);};
 const entryName=(contractId:string)=>view?.roster.find(c=>c.contractId===contractId)?.name??"Contract";
 async function action(key:string,doIt:(m:Mutation)=>Promise<unknown>,ok:string){
  if(!view||!editable())return;
  const input={requestId:request(key),expectedRevision:view.worldRevision};
  working=true;error="";notice="";render();
  try{
   const result=await doIt(input);
   if(result&&typeof result==="object"&&"status" in result&&
    (result as {status:unknown}).status==="STALE")
    throw new Error("World state changed. Reload the contract desk and try again.");
   view=await port.load();notice=ok;clear(key);
  }catch(e){error=e instanceof Error?e.message:"Contract action could not be completed";}
  finally{working=false;render();}
 }
 function render(){
  root.replaceChildren();root.classList.add("ppw-editor","ppw-contract-desk");
  const header=el("header","ppw-contract-header");
  if(onBack)header.append(btn("← Back to booking",onBack,working));
  header.append(el("span","ppw-eyebrow","PPW / THE OFFICE"),
   el("h1","","Contract Desk"),
   el("p","ppw-muted",view?
    "Year "+view.year+" · Week "+view.week+" · Your promotion only":
    "Loading your contract ledger…"));
  root.append(header);
  if(error)root.append(el("p","ppw-alert ppw-error",error));
  if(notice)root.append(el("p","ppw-alert ppw-success",notice));
  if(!view){root.append(btn(working?"Loading…":"Retry",()=>void load(),working));return;}
  const sums=el("div","ppw-contract-summary");
  for(const [metric,value] of [
   ["SIGNED",view.summary.signed],["NEED ATTENTION",view.summary.expiringSoon+view.summary.noDates],
   ["PENDING",view.summary.pendingNegotiations+view.summary.pendingRenewals+
     view.summary.pendingOffers],["WEEKLY GUARANTEES",money(view.summary.weeklyGuarantees)]
  ] as const){
   const panel=el("div","ppw-contract-metric");
   panel.append(el("span","",metric),el("strong","",String(value)));sums.append(panel);
  }
  root.append(sums);
  const helper=el("p","ppw-muted",
   "Offers and additional dates are requests, not instant agreements. Wrestlers respond at World resolution.");
  root.append(helper);
  if(!view.canEdit)root.append(el("p","ppw-alert",
   "World Lock is closed. You can review contracts but cannot make new offers."));
  const inbox=el("section","ppw-contract-inbox");
  const pendingTotal=view.requests.length+view.renewals.length+view.offers.length;
  if(pendingTotal){
   const box=document.createElement("details");box.className="ppw-contract-pending";box.open=true;
   box.append(el("summary","",pendingTotal+" pending negotiations"));
   for(const r of view.requests){
    const row=el("div","ppw-contract-request");
    row.append(el("span","",entryName(r.contract_id)+
     " · +"+r.additional_dates+" requested dates"),
     btn("Withdraw request",()=>void action("date:"+r.request_id,m=>
      port.cancelDates({...m,dateRequestId:r.request_id}),
      "Additional-dates request withdrawn."),!editable()));
    box.append(row);
   }
   for(const r of view.renewals){
    const row=el("div","ppw-contract-request");
    row.append(el("span","",entryName(r.contract_id)+" · renewal awaiting decision"),
     btn("Withdraw renewal",()=>void action("renewal:"+r.proposal_id,m=>
      port.withdrawRenewal({...m,proposalId:r.proposal_id}),
      "Renewal offer withdrawn."),!editable()));
    box.append(row);
   }
   for(const o of view.offers){
    const row=el("div","ppw-contract-request");
    const worker=view.roster.find(r=>r.personId===o.person_id);
    row.append(el("span","",(worker?.name??"Recruitment")+
     (o.source_contract_id?" · negotiated renewal pending":" · recruitment offer pending")),
     btn("Withdraw offer",()=>void action("offer:"+o.offer_id,m=>
      port.withdrawOffer({...m,offerId:o.offer_id}),
      "Contract offer withdrawn."),!editable()));
    box.append(row);
   }
   inbox.append(box);root.append(inbox);
  }
  const filters=el("div","ppw-contract-filters");
  const input=document.createElement("input");
  input.type="search";input.placeholder="Search your contracted wrestlers";
  input.setAttribute("aria-label","Search roster contracts");input.value=search;
  const mode=document.createElement("select");
  mode.setAttribute("aria-label","Contract filter");
  for(const [key,value] of [["ATTENTION","Needs attention"],["ALL","All contracts"],
   ["EXPIRING","Expiring soon"],["NO_DATES","No dates left"]] as const){
   const opt=document.createElement("option");opt.value=key;opt.textContent=value;
   mode.append(opt);
  }
  mode.value=filter;filters.append(input,mode);
  root.append(filters);
  const list=el("div","ppw-contract-list");root.append(list);
  function paint(){
   list.replaceChildren();
   const visible=view!.roster.filter(c=>
    (filter==="ALL"||filter==="ATTENTION"&&c.needsAttention||
     filter==="EXPIRING"&&c.expiringSoon||
     filter==="NO_DATES"&&c.reason==="NO_DATES")&&
    (!search||c.name.toLowerCase().includes(search.toLowerCase())));
   for(const c of visible){
    const card=document.createElement("details");
    card.className="ppw-contract-card"+(c.needsAttention?" ppw-contract-urgent":"");
    const summary=document.createElement("summary");
    const chips=el("div","ppw-contract-heading");
    chips.append(el("strong","",c.name),
     el("span","",title(c.family)+" · "+
      (c.remainingDates===null?"Unlimited":c.remainingDates+" dates")+" · "+
      c.weeksRemaining+" weeks left"));
    if(c.pendingNegotiation||c.pendingRenewal)
     chips.append(el("small","ppw-contract-pending-label","NEGOTIATING"));
    else if(c.reason==="NO_DATES")
     chips.append(el("small","ppw-contract-danger","NO DATES"));
    else if(c.expiringSoon)
     chips.append(el("small","ppw-contract-danger","EXPIRING"));
    summary.append(chips);card.append(summary);
    const body=el("div","ppw-contract-details");
    body.append(el("p","ppw-muted","Weekly "+money(c.weeklyGuarantee)+
     " · Appearance "+money(c.appearanceFee)),
     el("p","ppw-muted","Role: "+title(c.roleExpectation)+
     " · Creative control: "+title(c.creativeControl)));
    if(port.openWrestler)body.append(btn("Wrestler profile ↗",
     ()=>port.openWrestler?.(c.personId)));
    if(c.additionalDatesEligible&&!c.pendingNegotiation&&view!.canEdit){
     const values=amounts.get(c.contractId)??{dates:3,payment:0};
     const section=el("div","ppw-contract-date-action");
     section.append(el("span","","Request more dates"));
     const dates=document.createElement("input");
     dates.type="number";dates.inputMode="numeric";
     dates.min="1";dates.max="104";dates.value=String(values.dates);
     dates.setAttribute("aria-label","Additional dates for "+c.name);
     const pay=document.createElement("input");
     pay.type="number";pay.inputMode="numeric";
     pay.min="0";pay.max="1000000000";pay.value=String(values.payment);
     pay.setAttribute("aria-label","Additional payment offered for "+c.name);
     dates.onchange=()=>{values.dates=Number(dates.value);amounts.set(c.contractId,values);clear("dates:"+c.contractId);};
     pay.onchange=()=>{values.payment=Number(pay.value);amounts.set(c.contractId,values);clear("dates:"+c.contractId);};
     amounts.set(c.contractId,values);
     const submit=btn("Send request",()=>{
      if(!Number.isSafeInteger(values.dates)||values.dates<1||values.dates>104||
       !Number.isSafeInteger(values.payment)||values.payment<0||
       values.payment>1_000_000_000){
       error="Dates must be 1–104 and payment must be a non-negative whole amount.";
       render();return;
      }
      void action("dates:"+c.contractId,m=>port.requestDates({...m,
       contractId:c.contractId,additionalDates:values.dates,
       additionalPayment:values.payment}),"Additional-dates offer submitted.");
     },!editable());
     section.append(el("label","","Dates"),dates,
      el("label","","Extra payment ($)"),pay,submit);
     body.append(section);
    }
    const negotiatedPending=view!.offers.some(o=>o.source_contract_id===c.contractId)||
     view!.renewals.some(r=>r.contract_id===c.contractId);
    if(c.renewalEligible&&!c.pendingRenewal&&view!.canEdit&&!negotiatedPending){
     body.append(btn("Offer same-terms renewal",()=>void action(
      "renew:"+c.contractId,m=>port.renewal({...m,contractId:c.contractId}),
      "Same-terms renewal offered. Awaiting wrestler decision."),!editable()));
     const negotiate=document.createElement("details");
     negotiate.className="ppw-contract-renegotiate";
     negotiate.append(el("summary","","Negotiate different terms"));
     negotiate.append(el("p","ppw-muted",
      "An alternative renewal, not an extra booking. If accepted, the next contract begins after this one expires."));
     const family=c.family as OfferTerms["family"];
     const fixed=family==="EXCLUSIVE"||family==="ONE_OFF";
     const nextWeek=c.expiresWeekIndex+1;
     const draft:OfferTerms={
      family,roleExpectation:c.roleExpectation as OfferTerms["roleExpectation"],
      creativeControl:family==="ONE_OFF"?"NONE":c.creativeControl as OfferTerms["creativeControl"],
      startWeekIndex:nextWeek,termWeeks:family==="ONE_OFF"?1:13,
      dateEntitlement:family==="ONE_OFF"?1:family==="EXCLUSIVE"?13:
       Math.max(1,Math.min(26,c.dateEntitlement??5)),
      weeklyGuarantee:family==="ONE_OFF"?0:c.weeklyGuarantee,
      appearanceFee:family==="EXCLUSIVE"?0:c.appearanceFee,
      signingBonus:c.signingBonus
     };
     const panel=el("div","ppw-contract-renegotiate-fields");
     const numeric=(name:string,key:"termWeeks"|"dateEntitlement"|"weeklyGuarantee"|"appearanceFee"|"signingBonus",
      min:number,max:number,disabled=false)=>{
      const label=el("label","",name),input=document.createElement("input");
      input.type="number";input.inputMode="numeric";input.min=String(min);input.max=String(max);
      input.value=String(draft[key]);input.disabled=disabled;
      input.setAttribute("aria-label",name+" for "+c.name);
      input.oninput=()=>{if(input.value!=="")draft[key]=Number(input.value);
       if(key==="termWeeks"&&family==="EXCLUSIVE"){
        draft.dateEntitlement=Number(input.value);
        const dates=panel.querySelector<HTMLInputElement>('[data-renew-dates="yes"]');
        if(dates)dates.value=input.value;
       }};
      if(key==="dateEntitlement")input.dataset.renewDates="yes";
      label.append(input);panel.append(label);
     };
     numeric("New term (weeks)","termWeeks",1,52,family==="ONE_OFF");
     numeric("Purchased dates","dateEntitlement",1,104,fixed);
     numeric("Weekly guarantee ($)","weeklyGuarantee",0,1000000000,family==="ONE_OFF");
     numeric("Appearance fee ($)","appearanceFee",0,1000000000,family==="EXCLUSIVE");
     numeric("Signing bonus ($)","signingBonus",0,1000000000);
     const dropdown=<T extends string>(name:string,options:readonly T[],initial:T,set:(v:T)=>void)=>{
      const label=el("label","",name),select=document.createElement("select");
      select.setAttribute("aria-label",name+" for "+c.name);select.value=initial;
      for(const key of options){
       const item=document.createElement("option");item.value=key;item.textContent=title(key);
       select.append(item);
      }
      select.value=initial;select.onchange=()=>set(select.value as T);
      label.append(select);panel.append(label);
     };
     dropdown("Roster role",["DEVELOPMENTAL","REGULAR","FEATURED","UPPER_CARD",
      "MAIN_EVENT","SPECIAL_ATTRACTION"] as const,draft.roleExpectation,
      value=>{draft.roleExpectation=value;});
     if(family!=="ONE_OFF")dropdown("Creative control",
      ["NONE","CONSULTATION","PROTECTED_FINISHES","FULL_APPROVAL"] as const,
      draft.creativeControl,value=>{draft.creativeControl=value;});
     negotiate.append(panel);
     const note=el("p","ppw-contract-renew-hint",
      "Proposed start: Y"+(Math.floor(nextWeek/52)+1)+
      " W"+(nextWeek%52+1)+". Acceptance is not guaranteed.");
     negotiate.append(note,btn("Send negotiated renewal",()=>{
      const numbers=[draft.termWeeks,draft.dateEntitlement,draft.weeklyGuarantee,
       draft.appearanceFee,draft.signingBonus];
      if(!numbers.every(v=>Number.isSafeInteger(v)&&v>=0)||
       draft.termWeeks<1||draft.termWeeks>52||
       draft.dateEntitlement<1||draft.dateEntitlement>104||
       (family==="EXCLUSIVE"&&draft.dateEntitlement!==draft.termWeeks)||
       (family!=="EXCLUSIVE"&&draft.dateEntitlement>draft.termWeeks*2)){
       error="Review the proposed duration, dates and payment values.";
       render();return;
      }
      void action("negotiated:"+c.contractId,m=>port.negotiatedRenewal({
       ...m,personId:c.personId,sourceContractId:c.contractId,terms:draft}),
       "Negotiated renewal submitted. Wrestler response arrives at World resolution.");
     },!editable()));
     body.append(negotiate);
    }
    card.append(body);
    list.append(card);
   }
   if(!visible.length)list.append(el("p","ppw-muted",
    view!.roster.length?"No contracts match this filter.":"No signed contracts yet."));
  }
  input.oninput=()=>{search=input.value;paint();};
  mode.onchange=()=>{filter=mode.value as typeof filter;paint();};
  paint();
 }
 async function load(){
  working=true;render();
  try{view=await port.load();error="";}
  catch(e){error=e instanceof Error?e.message:"Unable to load contract desk";}
  finally{working=false;render();}
 }
 void load();
}
