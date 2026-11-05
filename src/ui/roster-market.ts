/** PPW roster and market: one thumb-friendly directory, separate recruitment
 * from contracted talent, reuse existing team, stable, persona, contract desks.
 */
import type {readWrestlerDirectory,DirectoryFilter,DirectoryView}
 from "../db/wrestler-directory.js";
import type {OfferTerms} from "../domain/contract-economics.js";
import {createWrestlerCard} from "./wrestler-card.js";
import {createTalentFilterFrame} from "./talent-filter-controls.js";
import {contractStaffNotes} from "../domain/staff-context-advice.js";
import {forecastContractCost} from "../domain/contract-cost-forecast.js";
import {recommendTalentOffer,type TalentOfferProfile} from "../domain/talent-offer-advice.js";
import {CONTRACT_TERM_PRESETS,applyContractTermPreset,selectedContractTermPreset}
 from "../domain/contract-term-presets.js";
import type {StaffRole} from "../domain/world-staff.js";
export type WrestlerDirectoryData=Awaited<ReturnType<typeof readWrestlerDirectory>>;
export interface RosterMarketPort{
 load(filter:DirectoryFilter):Promise<WrestlerDirectoryData>;
 offer(input:{personId:string;requestId:string;expectedRevision:number;
  terms:OfferTerms}):Promise<unknown>;
 openContracts(personId?:string):void;openTagTeams():void;openStables():void;
 openChampionships():void;
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
type TermsDraft={family:OfferTerms["family"];role:OfferTerms["roleExpectation"];
 creative:OfferTerms["creativeControl"];weeks:number;dates:number;
 weekly:number;appearance:number;bonus:number};
const offerDefaults=():TermsDraft=>({
 family:"LIMITED_NON_EXCLUSIVE",role:"FEATURED",creative:"CONSULTATION",
 weeks:52,dates:40,weekly:0,appearance:9000,bonus:0
});
export function mountRosterMarket(root:HTMLElement,port:RosterMarketPort,
 initialView:DirectoryView="ROSTER"){
 let filter:DirectoryFilter={view:initialView,search:"",division:"ALL",
  availability:"ALL",role:"ALL",contract:"ALL",interest:"ALL",sort:initialView==="MARKET"?"INTEREST":"NAME",minPopularity:undefined,limit:25,offset:0};
 let view:WrestlerDirectoryData|null=null,error="",success="",loading=false,
  sending=false,pendingKey="",activeOffer:string|null=null;
 let choices=new Map<string,TermsDraft>();
 const openAdvancedTerms=new Set<string>();
 // The player chooses when detailed scouting filters are visible. Persist
 // disclosure across server refreshes without storing private World data.
 let filtersExpanded=false,attributesExpanded=false;
 // Like the booking picker, these act on the loaded roster page only.
 // Server-backed division, role, search and sort remain comprehensive.
 const quickChips=new Set<"AVAILABLE"|"FACE"|"HEEL"|"POPULAR"|"DATES"|"CHAMPIONS">();
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
  input.max=String(max);input.step="1";input.value=String(initial);
  input.setAttribute("aria-label",caption);
  // Whole weeks/dates and non-negative costs: do not crash the live
  // calculator while a mobile number field is being edited.
  const apply=(final:boolean)=>{
   // A cleared field is temporary while typing; clamp on blur.
   if(!input.value.trim()&&!final)return;
   const raw=Number(input.value);
   const valid=Number.isFinite(raw)?
    Math.min(max,Math.max(min,Math.round(raw))):min;
   if(final)input.value=String(valid);
   onchange(valid);
  };
  input.oninput=()=>apply(false);
  input.onchange=()=>apply(true);
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
   terms.dateEntitlement>104||terms.dateEntitlement>terms.termWeeks||
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
    throw new Error("The terms or deadline have changed. Review the latest details before offering.");
   pendingKey="";activeOffer=null;
   success="Offer sent. The wrestler will respond at the end of the week.";
   await load();
  }catch(e){error=e instanceof Error?e.message:"Offer could not be sent";}
  finally{sending=false;render();}
 }
 function offerEditor(personId:string){
  const prospect=view?.people.find(p=>p.personId===personId);
  const manager=view?.offerBudget?.talentManager;
  const proposed=prospect&&manager?recommendTalentOffer({
   personId,name:prospect.name,
   marketWeeklyValue:prospect.estimatedWeeklyValue??9000,
   popularity:prospect.popularity,recognition:prospect.recognition,
   morale:prospect.morale,careerStage:prospect.careerStage,
   interest:prospect.interest as TalentOfferProfile["interest"]
  },manager):null;
  const fromProposal=proposed?{
   family:proposed.terms.family,role:proposed.terms.roleExpectation,
   creative:proposed.terms.creativeControl,
   weeks:proposed.terms.termWeeks,dates:proposed.terms.dateEntitlement,
   weekly:proposed.terms.weeklyGuarantee,
   appearance:proposed.terms.appearanceFee,
   bonus:proposed.terms.signingBonus
  }:null;
  const draft=choices.get(personId)??fromProposal??offerDefaults();
  choices.set(personId,draft);
  const editor=el("div","ppw-directory-offer");
  editor.append(el("h3","","Make an offer"));
  if(proposed&&fromProposal){
   const pitch=el("section","ppw-directory-manager-proposal");
   pitch.append(el("span","ppw-directory-manager-eyebrow",
    proposed.managerName+" · TALENT MANAGER"),
    el("h4","","My recommendation"),
    el("p","ppw-directory-manager-voice",proposed.voice),
    el("div","ppw-directory-manager-price",
     money(proposed.projectedCommitment)+" potential full-term cost"),
    el("small","",proposed.rationale));
   const apply=btn("Use my recommendation",()=>{
    Object.assign(draft,fromProposal);
    pendingKey="";render();
   });
   apply.className+=" ppw-directory-manager-apply";
   pitch.append(apply);editor.append(pitch);
  }
  const signableWeek=view!.currentWeekIndex+1;
  const eligibleWeek="Year "+(Math.floor(signableWeek/52)+1)+
   " Week "+(signableWeek%52+1);
  const signingWindowNote=el("p","ppw-directory-offer-timing");
  const updateTiming=()=>{signingWindowNote.textContent=draft.family==="ONE_OFF"?
   "One-night booking available in "+eligibleWeek+" if accepted.":
   "Starts "+eligibleWeek+" if accepted.";};
  updateTiming();editor.append(signingWindowNote);
  const termsMenu=el("section","ppw-directory-term-menu");
  termsMenu.append(el("strong","","Choose a deal length"));
  const presetChoices=el("div","ppw-directory-presets");
  const active=selectedContractTermPreset(draft.family,draft.weeks,draft.dates);
  for(const choice of CONTRACT_TERM_PRESETS){
   const plan=applyContractTermPreset(draft.family,choice.id);
   const button=btn(choice.label,()=>{
    Object.assign(draft,plan);pendingKey="";render();
   });
   button.className+=" ppw-directory-preset"+(active===choice.id?" ppw-directory-preset-active":"");
   button.setAttribute("aria-pressed",String(active===choice.id));
   button.append(el("small","",plan.weeks+" weeks · "+
    (plan.family==="EXCLUSIVE"?"Unlimited dates":plan.dates+" dates")));
   presetChoices.append(button);
  }
  const oneNight=btn("One night only",()=>{
   Object.assign(draft,applyContractTermPreset(draft.family,"ONE_NIGHT"));
   pendingKey="";render();
  });
  oneNight.className+=" ppw-directory-preset"+(active==="ONE_NIGHT"?" ppw-directory-preset-active":"");
  oneNight.setAttribute("aria-pressed",String(active==="ONE_NIGHT"));
  oneNight.append(el("small","","1 appearance · no weekly wage"));
  presetChoices.append(oneNight);
  termsMenu.append(presetChoices);editor.append(termsMenu);
  const custom=openAdvancedTerms.has(personId);
  const toggle=btn(custom?"Hide custom terms":"Customise this offer",()=>{
   if(custom)openAdvancedTerms.delete(personId);
   else openAdvancedTerms.add(personId);
   render();
  });
  toggle.className+=" ppw-directory-custom-toggle";
  editor.append(toggle);
  const advanced=el("section","ppw-directory-advanced-terms");
  advanced.append(el("h4","","Detailed terms"));
  advanced.append(selection("Contract type",[
   ["LIMITED_NON_EXCLUSIVE","Non-exclusive · purchased dates"],
   ["EXCLUSIVE","Exclusive · unlimited appearances"],
   ["ONE_OFF","One appearance"]
  ] as const,draft.family,next=>{
   const prior=draft.family;draft.family=next;
   if(next==="ONE_OFF"){draft.weeks=1;draft.dates=1;}
   else if(prior==="ONE_OFF"){
    const plan=applyContractTermPreset(next,"SHORT");
    draft.weeks=plan.weeks;draft.dates=plan.dates;
   }else if(next==="EXCLUSIVE")draft.dates=draft.weeks;
   else draft.dates=Math.min(draft.dates,draft.weeks);
   pendingKey="";openAdvancedTerms.add(personId);render();
  }));
  advanced.append(selection("Card role",[
   ["DEVELOPMENTAL","Developing"],["REGULAR","Regular"],
   ["FEATURED","Featured"],["UPPER_CARD","Upper card"],
   ["MAIN_EVENT","Main event"],["SPECIAL_ATTRACTION","Special attraction"]
  ] as const,draft.role,next=>{draft.role=next;pendingKey="";}));
  if(draft.family!=="ONE_OFF")advanced.append(selection("Creative rights",[
   ["NONE","No control"],["CONSULTATION","Consultation"],
   ["PROTECTED_FINISHES","Protected finishes"],
   ["FULL_APPROVAL","Full approval"]
  ] as const,draft.creative,next=>{draft.creative=next;pendingKey="";}));
  const fields=el("div","ppw-directory-offer-fields");
   const quote=el("section","ppw-directory-contract-estimate");
   const affordability=el("section","ppw-directory-affordability");
   const adviser=el("section","ppw-directory-adviser");
   const adviserHeading=el("h4","","Talent Manager · financial concerns");
   adviser.append(adviserHeading);
   const adviserContents=el("div","ppw-directory-adviser-content");
   adviser.append(adviserContents);
   const updateQuote=()=>{
    updateTiming();
    const weeks=draft.family==="ONE_OFF"?1:draft.weeks;
    const guarantee=draft.family==="ONE_OFF"?0:draft.weekly;
    const appearance=draft.family==="EXCLUSIVE"?0:draft.appearance;
    const dates=draft.family==="ONE_OFF"?1:draft.family==="EXCLUSIVE"?0:draft.dates;
    const projection=forecastContractCost({weeks,dates,weeklyGuarantee:guarantee,
     appearanceFee:appearance,signingBonus:draft.bonus});
    quote.replaceChildren();
    const costHeading=el("div","ppw-directory-contract-estimate-top");
    costHeading.append(el("span","","POTENTIAL FULL-TERM COST · ALL DATES USED"),
     el("strong","",money(projection.plannedFullTermCost)),
     el("small","ppw-directory-guaranteed",
      "Guaranteed wages + signing bonus: "+
      money(projection.guaranteedWages+projection.oneTimeBonus)));
    quote.append(costHeading);
    const breakdown=el("div","ppw-directory-contract-breakdown");
    const costRow=(title:string,amount:number)=>{
     const row=el("div","ppw-directory-contract-cost-row");
     row.append(el("span","",title),el("strong","",money(amount)));
     breakdown.append(row);
    };
    costRow(weeks+" week"+(weeks===1?"":"s")+" × "+money(guarantee)+
     " guaranteed wages",projection.guaranteedWages);
    if(dates>0)costRow(dates+" date"+(dates===1?"":"s")+" × "+money(appearance)+
     " appearance fee",projection.plannedAppearanceFees);
    costRow("One-time signing bonus",projection.oneTimeBonus);
    if(custom)quote.append(breakdown);
    quote.append(el("small","ppw-directory-contract-assumption",
     "Includes wages, bonus and all planned appearances. Only worked dates incur appearance fees."));
    affordability.replaceChildren();
    const company=view?.offerBudget;
    if(company){
     affordability.append(el("strong","","What this does to your company"));
     const reservedCash=company.cash-draft.bonus;
     // Conditional appearance fees are a potential full-term cost, not
     // a charge at signing. Compare only this proposed deal to today's bank.
     const existing=company.signedRosterExposure;
     const includesRoster=typeof existing==="number"&&Number.isFinite(existing);
     const cashOnly=company.cash-(includesRoster?existing:0)-
      projection.plannedFullTermCost;
     const cashStress=document.createElement("details");
     cashStress.className="ppw-directory-cash-stress";
     cashStress.append(el("summary","","Review future contract commitments"));
     const coverage=el("div","ppw-directory-cash-only");
     coverage.dataset.coverage=cashOnly>=0?"covered":"gap";
     coverage.append(el("span","",includesRoster?
      "Cash-only scenario · signed roster + this offer":
      "Cash-only scenario · this offer only"),
      el("strong","",cashOnly>=0?money(cashOnly)+" remaining":
       money(-cashOnly)+" above today's bank"));
     cashStress.append(coverage,el("p","ppw-directory-muted",
      "This stress test assumes every remaining appearance is worked and "+
      "compares future payments with today's cash only. It does not include "+
      "future broadcast, sponsor or ticket income; the amount is not owed now."));
     affordability.append(cashStress);
     const wageRoom=company.weeklyWageLimit===null?null:
      company.weeklyWageLimit-company.weeklyGuarantees-guarantee;
     const baseline=company.weeklyIncome===null||company.weeklyOverhead===null?null:
      company.weeklyIncome-company.weeklyOverhead-
      company.weeklyGuarantees-company.weeklyStaffPayroll;
     const postMargin=baseline===null?null:baseline-guarantee;
     // The full contract cost already sits immediately above this panel.
     // Only show the four implications that change a managerial decision.
     const lines:[string,string][]=[
      ["Cash after signing bonus",money(reservedCash)],
      ["Weekly wage room",wageRoom===null?
       "No spending plan":wageRoom>=0?money(wageRoom):money(-wageRoom)+" over limit"],
      ["Weekly operating room",postMargin===null?
       "Not configured":money(postMargin)]
     ];
     for(const [title,value] of lines){const row=el("div","ppw-directory-affordability-row");
      row.append(el("span","",title),el("strong","",value));affordability.append(row);}
     const expectedVariableWeek=(projection.plannedAppearanceFees+
      projection.oneTimeBonus)/Math.max(1,weeks);
     const variablePressure=postMargin!==null&&
      expectedVariableWeek>postMargin;
     const realRisk=wageRoom!==null&&wageRoom<0||
      company.cashReserve!==null&&reservedCash<company.cashReserve||
      postMargin!==null&&postMargin<0||variablePressure;
     affordability.dataset.risk=String(realRisk);
     if(realRisk)affordability.append(el("p","ppw-directory-affordability-warning",
      variablePressure?
       "Working every purchased date would exceed the available recurring "+
       "cashflow on average. Reconsider the dates, fees or deal length.":
       "This offer exceeds your weekly wage room or planned cash reserve. "+
       "You can still propose it, but review the terms first."));
     adviserContents.replaceChildren();
     if(company.hasTalentManager){
      const messages=contractStaffNotes({
       weeklyGuarantee:guarantee,weeks,appearanceFee:appearance,dates,
       signingBonus:draft.bonus,cash:company.cash,cashReserve:company.cashReserve,
       weeklyGuarantees:company.weeklyGuarantees,
       wageLimit:company.weeklyWageLimit,recurringMargin:baseline,
       existingRosterExposure:includesRoster?existing:0
      },new Set<StaffRole>(["TALENT_MANAGER"]));
      const concerns=messages.filter(x=>x.level==="WATCH").length;
      adviser.dataset.risk=concerns?"watch":"info";
      adviser.hidden=concerns===0;
      adviserHeading.textContent="Talent Manager · "+concerns+
       " financial concern"+(concerns===1?"":"s");
      for(const m of messages){
       const item=el("div","ppw-directory-adviser-note");
       item.dataset.level=m.level;
       item.append(el("strong","",m.title),el("p","",m.message));
       adviserContents.append(item);
      }
     }else{
      adviser.hidden=true;
     }
    }
   };
   updateQuote();
  const timing=el("div","ppw-directory-advanced-fields");
  if(draft.family!=="ONE_OFF")numbers(timing,"Weeks (1–52)",
   draft.weeks,1,52,n=>{
    draft.weeks=n;draft.dates=Math.min(draft.dates,n);
    const dates=timing.querySelector<HTMLInputElement>('[aria-label="Purchased dates"]');
    if(dates)dates.value=String(draft.dates);
    pendingKey="";updateQuote();
   });
  if(draft.family==="LIMITED_NON_EXCLUSIVE")
   numbers(timing,"Purchased dates",draft.dates,1,52,
    n=>{draft.dates=Math.min(n,draft.weeks);pendingKey="";updateQuote();});
  advanced.append(timing);
  if(custom)editor.append(advanced);
  if(draft.family!=="ONE_OFF")numbers(fields,"Weekly guarantee ($)",
   draft.weekly,0,1e9,n=>{draft.weekly=n;pendingKey="";updateQuote();});
  if(draft.family!=="EXCLUSIVE")numbers(fields,"Appearance fee ($)",
   draft.appearance,0,1e9,n=>{draft.appearance=n;pendingKey="";updateQuote();});
  numbers(fields,"Signing bonus ($)",draft.bonus,0,1e9,
   n=>{draft.bonus=n;pendingKey="";updateQuote();});
  // First the suggested deal, then affordability. Detailed term editing is
  // an explicit choice and never another nested disclosure.
  if(custom)editor.append(fields);
  editor.append(adviser,quote,affordability);
  if(port.openBusiness)editor.append(btn("Check company finances →",()=>port.openBusiness?.()));
  editor.append(btn(sending?"Sending…":"Submit offer",
   ()=>void send(personId),sending));
  return editor;
 }
 function render(){
  root.classList.add("ppw-editor","ppw-directory");
  root.replaceChildren();
  const head=el("header","ppw-directory-header");
  head.append(el("span","ppw-directory-kicker","THE LOCKER ROOM / TALENT"),
   el("h1","",filter.view==="ROSTER"?"My Roster":"Talent Market"),
   el("p","ppw-directory-muted",
    view?"Year "+view.year+" · Week "+view.week+
     (filter.view==="ROSTER"?" · Signed talent only":" · Recruiting across the industry"):
     "Keep an eye on your wrestlers, their contracts and who might be available."));
  root.append(head);
  if(error)root.append(el("p","ppw-alert ppw-error",error));
  if(success)root.append(el("p","ppw-alert ppw-success",success));
  const controls=el("section","ppw-directory-filters");
  const searchRow=el("div","ppw-directory-search-row");
  const search=document.createElement("input");
  search.type="search";search.placeholder=filter.view==="ROSTER"?
   "Search your roster":"Search wrestlers";
  search.setAttribute("aria-label","Search wrestlers");
  search.value=filter.search??"";search.maxLength=70;
  search.oninput=()=>{filter.search=search.value;};
  search.onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();pick({search:search.value});}};
  searchRow.append(search,btn("Search",()=>pick({search:search.value})));
  const chips=el("div","ppw-directory-chips");
  chips.setAttribute("role","group");
  chips.setAttribute("aria-label","Quick roster filters · this page");
  const addChip=(name:string,cb:()=>void,selected=false)=>{
   const button=btn(name,cb);
   button.className+=" ppw-directory-quick-chip";
   button.setAttribute("aria-pressed",String(selected));
   chips.append(button);
  };
  addChip("All",()=>{
   quickChips.clear();pick({division:"ALL",availability:"ALL"});
  },filter.division==="ALL"&&!quickChips.size&&
   (filter.view==="ROSTER"||(filter.availability??"ALL")==="ALL"));
  for(const [division,name] of [["MEN","Men"],["WOMEN","Women"]] as const)
   addChip(name,()=>pick({division:filter.division===division?"ALL":division}),
    filter.division===division);
  if(filter.view==="MARKET"){
   addChip("Free agents",()=>pick({availability:filter.availability==="FREE_AGENT"?"ALL":"FREE_AGENT"}),
    filter.availability==="FREE_AGENT");
   addChip("Can approach",()=>pick({availability:filter.availability==="APPROACHABLE"?"ALL":"APPROACHABLE"}),
    filter.availability==="APPROACHABLE");
  }
  for(const [key,name] of [
   ["AVAILABLE","Available"],["FACE","Face"],["HEEL","Heel"],
   ["POPULAR","Popular 75+"],["DATES","Has dates"],
   ["CHAMPIONS","Champions"]
  ] as const){
   // Market eligibility is server-authoritative and can include contracted people.
   if(key==="AVAILABLE"&&filter.view==="MARKET")continue;
   addChip(name,()=>{
    if(quickChips.has(key))quickChips.delete(key);
    else{
     quickChips.add(key);
     if(key==="FACE")quickChips.delete("HEEL");
     if(key==="HEEL")quickChips.delete("FACE");
    }
    render();
   },quickChips.has(key));
  }
  if(filter.view==="ROSTER"){
   addChip("My Champions",port.openChampionships);
   addChip("Tag Teams",port.openTagTeams);
   addChip("Trios",port.openTagTeams); // The established Teams desk includes the Trios workspace.
   addChip("Stables",port.openStables);
  }
  const sortOptions=filter.view==="ROSTER"?[
   ["ROLE","By card role"],["NAME","Name"],["POPULARITY","Popularity"],
   ["RECOGNITION","Recognition"],["MOMENTUM","Momentum"],
   ["DATES_LOW","Dates remaining: lowest"],["DATES_HIGH","Dates remaining: highest"],
   ["EXPIRY","Expires soonest"],["PAY_LOW","Wage: lowest"],
   ["PAY_HIGH","Wage: highest"],["FEE_LOW","Appearance fee: lowest"],
   ["FEE_HIGH","Appearance fee: highest"]
  ] as const:[
   ["INTEREST","Interest: strongest"],["NAME","Name"],
   ["POPULARITY","Popularity"],["RECOGNITION","Recognition"],
   ["MOMENTUM","Momentum"],["VALUE","Value: lowest"]
  ] as const;
  const sortRow=el("div","ppw-directory-sort-row");
  sortRow.append(selection("Sort by",sortOptions,
   sortOptions.some(x=>x[0]===filter.sort)?filter.sort??"NAME":
    filter.view==="ROSTER"?"NAME":"INTEREST",sort=>pick({sort})),
   selection("Division",[
    ["ALL","All divisions"],["MEN","Men"],["WOMEN","Women"]
   ] as const,filter.division??"ALL",division=>pick({division})));
  controls.append(createTalentFilterFrame(searchRow,sortRow,chips));
  const enabled=filter.view==="ROSTER"?
   Number(filter.role!=="ALL")+Number(filter.contract!=="ALL"):
   Number(filter.availability!=="ALL")+Number(filter.interest!=="ALL");
  const attributeCount=[
   filter.minPopularity,filter.minRecognition,filter.minMomentum,
   filter.minInRing,filter.minCraft,filter.minPresentation
  ].filter(x=>typeof x==="number"&&x>0).length;
  const refinements=document.createElement("details");
  refinements.className="ppw-directory-refinements";
  // A quick Free Agents tap must not expand the advanced filter form.
  // The summary still displays the active count until the player opens it.
  refinements.open=filtersExpanded;
  const refineSummary=el("summary","",
   "Refine talent"+(enabled+attributeCount?
    " · "+(enabled+attributeCount)+" active":""));
  // Native details.toggle can arrive after an RPC rerender on mobile.
  refineSummary.onclick=()=>{filtersExpanded=!refinements.open;};
  refinements.ontoggle=()=>{
   if(refinements.isConnected)filtersExpanded=refinements.open;
  };
  refinements.append(refineSummary);
  const fields=el("div","ppw-directory-refine-fields");
  if(filter.view==="ROSTER"){
   fields.append(selection("Role",[
    ["ALL","All roles"],["MAIN_EVENT","Main event"],
    ["UPPER_CARD","Upper card"],["FEATURED","Featured"],
    ["REGULAR","Regular"],["DEVELOPMENTAL","Developmental"],
    ["SPECIAL_ATTRACTION","Special attraction"]
   ] as const,filter.role??"ALL",role=>pick({role})));
   fields.append(selection("Contract",[
    ["ALL","All deals"],["EXCLUSIVE","Exclusive"],
    ["LIMITED_NON_EXCLUSIVE","Non-exclusive"]
   ] as const,filter.contract??"ALL",contract=>pick({contract})));
  }else{
   fields.append(selection("Contract availability",[
    ["ALL","All wrestlers"],["APPROACHABLE","Can approach"],
    ["FREE_AGENT","Free agents"],["NON_EXCLUSIVE","Non-exclusive"]
   ] as const,filter.availability??"ALL",availability=>pick({availability})));
   fields.append(selection("Recruitment interest",[
    ["ALL","Any interest"],["OPEN_PLUS","Open to talks+"],
    ["INTERESTED_PLUS","Interested+"]
   ] as const,filter.interest??"ALL",interest=>pick({interest})));
   fields.append(el("p","ppw-directory-hint",
    "Interest is a scouting estimate, not a guarantee of acceptance."));
  }
  refinements.append(fields);
  const advanced=document.createElement("details");
  advanced.className="ppw-directory-advanced";
  advanced.open=attributesExpanded||attributeCount>0;
  const attributeSummary=el("summary","","Advanced attributes");
  attributeSummary.onclick=()=>{attributesExpanded=!advanced.open;};
  advanced.ontoggle=()=>{if(advanced.isConnected)attributesExpanded=advanced.open;};
  advanced.append(attributeSummary);
  const thresholds=el("div","ppw-directory-thresholds");
  for(const [key,label] of [
   ["minPopularity","Min popularity"],["minRecognition","Min recognition"],
   ["minMomentum","Min momentum"],["minInRing","Min in-ring"],
   ["minCraft","Min match craft"],["minPresentation","Min presentation"]
  ] as const)numbers(thresholds,label,filter[key]??0,0,100,n=>{
   filter[key]=n===0?undefined:n;
  });
  advanced.append(thresholds,btn("Apply attributes",()=>{
   filtersExpanded=true;attributesExpanded=true;pick({});
  }));
  refinements.append(advanced);
  const clear=btn("Clear filters",()=>{
   filter={...filter,search:"",division:"ALL",role:"ALL",contract:"ALL",
    availability:"ALL",interest:"ALL",sort:filter.view==="ROSTER"?"NAME":"INTEREST",
    minPopularity:undefined,minRecognition:undefined,minMomentum:undefined,
    minInRing:undefined,minCraft:undefined,minPresentation:undefined,offset:0};
   quickChips.clear();
   filtersExpanded=false;attributesExpanded=false;void load();
  });
  clear.className+=" ppw-directory-clear";
  refinements.append(clear);
  controls.append(refinements);root.append(controls);
  // Never present stale roster results as actionable while a new filter loads.
  // Otherwise a tapped dossier can disappear when the pending response rerenders.
  if(loading){
   root.append(el("p","ppw-directory-loading","Updating directory…"));
   return;
  }
  if(!view){
   root.append(btn("Retry",()=>void load()));
   return;
  }
  const listing=el("section","ppw-directory-list");
  listing.setAttribute("aria-label",filter.view==="ROSTER"?"My wrestlers":"Talent marketplace");
  const heading=el("div","ppw-directory-listheading");
  heading.append(el("h2","",filter.view==="ROSTER"?"Your roster":"Available profiles"),
   el("span","ppw-directory-muted","Page "+(Math.floor((filter.offset??0)/(filter.limit??25))+1)));
  listing.append(heading);
  // Quick chips never imply that only the first 25 wrestlers exist.
  // Each result remains a full server-backed page; pagination is unchanged.
  const people=view.people.filter(p=>
    (!quickChips.has("FACE")||p.alignment==="FACE")&&
    (!quickChips.has("HEEL")||p.alignment==="HEEL")&&
    (!quickChips.has("POPULAR")||typeof p.popularity==="number"&&p.popularity>=75)&&
    (!quickChips.has("CHAMPIONS")||Boolean(p.championships?.length))&&
    (!quickChips.has("DATES")||(p.remainingDates===null||p.remainingDates>0))&&
    (!quickChips.has("AVAILABLE")||
     p.medicalWeeksRemaining==null&&!(p.startsInWeeks&&p.startsInWeeks>0)&&
     (p.remainingDates===null||p.remainingDates>0)));
  if(quickChips.size){
   heading.append(el("small","ppw-directory-muted",
    people.length+" of "+view.people.length+" · this page"));
  }
  for(const p of people){
   const label=p.medicalWeeksRemaining!=null?
     "INJURED · "+p.medicalWeeksRemaining+" WEEK"+
     (p.medicalWeeksRemaining===1?"":"S")+" TO CLEARANCE":
     p.affiliatedViaParent?"PARENT-COMPANY ROSTER · "+
     (p.contractOwnerName??"PARENT PROMOTION"):
    p.pendingOffer?"OFFER PENDING":
    p.availability==="EXCLUSIVE_ELSEWHERE"?"EXCLUSIVE ELSEWHERE":
    p.availability==="SIGNED_FUTURE_YOURS"?
      "STARTS IN "+p.startsInWeeks+" WEEKS":
    p.availability==="YOUR_ROSTER"?(p.remainingDates===null?"UNLIMITED DATES":
      p.remainingDates+" DATES LEFT"):
    p.availability==="FUTURE_EXCLUSIVE_ELSEWHERE"?"EXCLUSIVE STARTS SOON":
    p.availability==="CONTRACTED_SOON"?"CONTRACTED SOON":
    p.availability==="FREE_AGENT"?"FREE AGENT":"NON-EXCLUSIVE";
   if(filter.view==="ROSTER"){
    const card=createWrestlerCard({...p,status:label},{
     context:"ROSTER",label,onSelect:()=>port.openWrestler(p.personId,"ROSTER")
    });
    const role=p.roleExpectation??"UNASSIGNED";
    if(filter.sort==="ROLE"){
     let group=listing.querySelector<HTMLDetailsElement>(
      '.ppw-directory-role-group[data-role="'+role+'"]');
     if(!group){
      group=document.createElement("details");
      group.className="ppw-directory-role-group";group.dataset.role=role;
      group.open=true;
      group.append(el("summary","ppw-directory-role-heading",
       role==="UNASSIGNED"?"Other wrestlers":role.replaceAll("_"," ").toLowerCase()));
      listing.append(group);
     }
     group.append(card);
    }else listing.append(card);
    continue;
   }
   const card=document.createElement("details");card.className="ppw-directory-card";
   const title=document.createElement("summary");
   title.append(createWrestlerCard({...p,status:label},{
    context:filter.view,label}));
   title.append(el("span","ppw-directory-interest",
    "Recruitment interest · "+p.interest.replaceAll("_"," ").toLowerCase()));
   card.append(title);
   const detail=el("div","ppw-directory-detail");
    detail.append(el("p","ppw-directory-interest",
     "Recruitment interest · "+p.interest.replaceAll("_"," ").toLowerCase()+
     ". Indicative only: agreed terms and acceptance are still uncertain."));

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
     "Your offer is awaiting a response."));
    else if(p.availability!=="EXCLUSIVE_ELSEWHERE"&&view.canEdit)
     detail.append(btn(activeOffer===p.personId?"Close proposal":"Make contract offer",
      ()=>{activeOffer=activeOffer===p.personId?null:p.personId;render();}));
    if(activeOffer===p.personId&&view.canEdit&&
      p.availability!=="EXCLUSIVE_ELSEWHERE"&&!p.pendingOffer)
     detail.append(offerEditor(p.personId));
    if(!view.canEdit)detail.append(el("p","ppw-directory-muted",
     "The weekly deadline has passed. You can review talent, but offers are closed."));
   card.append(detail);
   if(activeOffer===p.personId)card.open=true;
   listing.append(card);
  }
  if(!people.length)listing.append(el("p","ppw-directory-empty",
   view.people.length&&quickChips.size?
    "No wrestlers on this page match. Clear a quick filter or turn the page.":
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
