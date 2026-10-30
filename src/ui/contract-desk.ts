/** Mobile contract workspace adapted from original PPW's expiring/offers desk.
 * All balances are server receipts, never optimistic booking rights.
 */
import type {readContractDesk} from "../db/contract-desk-workspace.js";
import type {OfferTerms} from "../domain/contract-economics.js";
import {createWrestlerPortrait} from "./wrestler-portrait.js";
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
export function mountContractDesk(root:HTMLElement,port:ContractDeskPort,onBack?:()=>void,
 initialFocus:"ATTENTION"|"EXPIRING"|"PENDING"="ATTENTION"){
 let view:ContractDeskView|null=null,working=false,error="",notice="";
 let filter:"ALL"|"ATTENTION"|"NO_DATES"|"EXPIRING"=
  initialFocus==="EXPIRING"?"EXPIRING":"ATTENTION";
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
    throw new Error("The deadline or contract terms have changed. Review the latest details before trying again.");
   view=await port.load();notice=ok;clear(key);
  }catch(e){error=e instanceof Error?e.message:"Contract action could not be completed";}
  finally{working=false;render();}
 }
 function render(){
  root.replaceChildren();root.classList.add("ppw-editor","ppw-contract-desk");
  const header=el("header","ppw-contract-header");
  if(onBack)header.append(btn("← Back to booking",onBack,working));
  header.append(el("span","ppw-eyebrow","THE OFFICE / CONTRACTS"),
   el("h1","","Contract Desk"),
   el("p","ppw-muted",view?
    "Year "+view.year+" · Week "+view.week+" · Your promotion only":
    "Checking your wrestlers' agreements…"));
  root.append(header);
  if(initialFocus==="PENDING")
   root.append(el("p","ppw-contract-context",
    "Your outstanding offers, renewals and date requests are listed first."));
  else if(initialFocus==="EXPIRING")
   root.append(el("p","ppw-contract-context",
    "Contracts closest to expiry are shown below. Review the terms before your next show."));
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
   "Offers and extra dates are proposals, not guarantees. Wrestlers respond after the weekly deadline.");
  root.append(helper);
  if(!view.canEdit)root.append(el("p","ppw-alert",
   "The deadline has passed. You can review current deals, but new offers must wait until next week."));
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
    const portrait=createWrestlerPortrait(o.person_name,160);
    if(portrait){portrait.classList.add("ppw-contract-offer-portrait");
     portrait.onerror=()=>portrait.remove();row.append(portrait);}
    const copy=el("div","ppw-contract-offer-copy");
    const t=(o.terms??{}) as Partial<OfferTerms>;
    copy.append(el("strong","ppw-contract-offer-name",o.person_name),
     el("small","ppw-contract-offer-status",o.source_contract_id?
      "RENEWAL OFFER · AWAITING DECISION":"NEW SIGNING · AWAITING DECISION"));
    const terms=[
     t.family?title(t.family):null,
     typeof t.termWeeks==="number"?t.termWeeks+" weeks":null,
     typeof t.dateEntitlement==="number"?(t.family==="EXCLUSIVE"?"Exclusive":t.dateEntitlement+" dates"):null,
     typeof t.weeklyGuarantee==="number"?money(t.weeklyGuarantee)+"/week":null,
     typeof t.appearanceFee==="number"&&t.appearanceFee>0?money(t.appearanceFee)+"/appearance":null,
     typeof t.signingBonus==="number"&&t.signingBonus>0?money(t.signingBonus)+" signing bonus":null
    ].filter(Boolean).join(" · ");
    if(terms)copy.append(el("span","ppw-contract-offer-terms",terms));
    if(port.openWrestler)copy.append(btn("View wrestler dossier ↗",
     ()=>port.openWrestler?.(o.person_id)));
    row.append(copy,btn("Withdraw offer",()=>void action("offer:"+o.offer_id,m=>
      port.withdrawOffer({...m,offerId:o.offer_id}),
      "Contract offer withdrawn."),!editable()));
    box.append(row);
   }
   inbox.append(box);root.append(inbox);
  }
  // An accepted or declined contract is still visible after its Home news
  // item has been dismissed. This is the actual agreement desk, not an alert.
  if((view.resolvedOffers??[]).length){
   const recent=document.createElement("details");
   recent.className="ppw-contract-decisions";recent.open=initialFocus==="PENDING";
   recent.append(el("summary","",
    "Recent decisions · "+view.resolvedOffers.length));
   const events=el("div","ppw-contract-decision-list");
   for(const offer of view.resolvedOffers){
    const entry=el("article","ppw-contract-decision");
    const accepted=offer.status==="ACCEPTED";
    entry.append(el("small","ppw-contract-decision-state "+(accepted?
     "ppw-contract-decision-accepted":"ppw-contract-decision-rejected"),
      accepted?"SIGNED":"DECLINED"),
     el("strong","",offer.name),
     el("p","ppw-muted",accepted?
      (offer.sourceContractId?
       "Renewal terms accepted. The next agreement begins after the current one.":
       "The wrestler accepted the proposed contract. Check the agreed dates before booking."):
      (offer.reason??"The proposed terms were declined. You can discuss a different offer.")));
    const week=offer.submittedWeekIndex;
    entry.append(el("small","ppw-contract-decision-week",
     "Offer submitted · Year "+(Math.floor(week/52)+1)+" Week "+(week%52+1)));
    if(port.openWrestler)
     entry.append(btn("Wrestler dossier ↗",
      ()=>port.openWrestler?.(offer.personId)));
    events.append(entry);
   }
   recent.append(events);root.append(recent);
  }
  if(view.dateDecisions?.length){
   const history=document.createElement("details");history.className="ppw-contract-decisions";
   history.open=initialFocus==="PENDING";
   history.append(el("summary","","Additional-date decisions · "+view.dateDecisions.length));
   const events=el("div","ppw-contract-decision-list");
   for(const decision of view.dateDecisions){
    const accepted=decision.status==="ACCEPTED";
    const entry=el("article","ppw-contract-decision");
    entry.append(el("small","ppw-contract-decision-state "+(accepted?
     "ppw-contract-decision-accepted":"ppw-contract-decision-rejected"),
      accepted?"ACCEPTED":"DECLINED"),
     el("strong","",decision.name),
     el("p","ppw-muted","Contract "+decision.contractId+" · "+
      (accepted?"+":"")+(accepted?decision.additionalDates:0)+" dates granted"+
      (accepted?(decision.additionalPayment>0?
       " · $"+decision.additionalPayment.toLocaleString("en-GB")+" extra payment":
       " · no extra payment"):
       " · "+decision.additionalDates+" additional dates were requested")),
     el("small","ppw-contract-decision-week",
      "Decision · Year "+decision.year+" Week "+decision.week));
    if(port.openWrestler)entry.append(btn("Wrestler dossier ↗",
     ()=>port.openWrestler?.(decision.personId)));
    events.append(entry);
   }
   history.append(events);root.append(history);
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
    const freeWeeks=Math.max(0,c.weeksRemaining-(c.remainingDates??0));
    const maxExtra=Math.max(0,Math.min(freeWeeks,
     104-(c.dateEntitlement??c.remainingDates??0)));
    if(c.additionalDatesEligible&&!c.pendingNegotiation&&view!.canEdit&&maxExtra>0){
     const values=amounts.get(c.contractId)??{dates:Math.min(3,maxExtra),payment:0};
     values.dates=Math.min(values.dates,maxExtra);
     const section=el("div","ppw-contract-date-action");
     section.append(el("span","","Request more dates"));
     const dates=document.createElement("input");
     dates.type="number";dates.inputMode="numeric";
     dates.min="1";dates.max=String(maxExtra);dates.value=String(values.dates);
     dates.setAttribute("aria-label","Additional dates for "+c.name);
     const pay=document.createElement("input");
     pay.type="number";pay.inputMode="numeric";
     pay.min="0";pay.max="1000000000";pay.value=String(values.payment);
     pay.setAttribute("aria-label","Additional payment offered for "+c.name);
     dates.onchange=()=>{values.dates=Number(dates.value);amounts.set(c.contractId,values);clear("dates:"+c.contractId);};
     pay.onchange=()=>{values.payment=Number(pay.value);amounts.set(c.contractId,values);clear("dates:"+c.contractId);};
     amounts.set(c.contractId,values);
     const submit=btn("Send request",()=>{
      if(!Number.isSafeInteger(values.dates)||values.dates<1||values.dates>maxExtra||
       !Number.isSafeInteger(values.payment)||values.payment<0||
       values.payment>1_000_000_000){
       error="Extra dates must fit the remaining contract weeks; payment must be non-negative.";
       render();return;
      }
      void action("dates:"+c.contractId,m=>port.requestDates({...m,
       contractId:c.contractId,additionalDates:values.dates,
       additionalPayment:values.payment}),"Additional-dates offer submitted.");
     },!editable());
     section.append(el("small","ppw-contract-renew-hint",
      "Maximum "+maxExtra+" further "+(maxExtra===1?"date":"dates")+
      " before expiry · one booked appearance per week"),
      el("label","","Dates"),dates,
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
       Math.max(1,Math.min(13,c.dateEntitlement??5)),
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
     numeric("Purchased dates","dateEntitlement",1,52,fixed);
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
       (family!=="EXCLUSIVE"&&draft.dateEntitlement>draft.termWeeks)){
       error="Review the proposed duration, dates and payment values.";
       render();return;
      }
      void action("negotiated:"+c.contractId,m=>port.negotiatedRenewal({
       ...m,personId:c.personId,sourceContractId:c.contractId,terms:draft}),
       "Renewal offer sent. The wrestler will respond at the end of the week.");
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
