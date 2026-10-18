import type {readStaffWorkspace} from "../db/staff-workspace.js";
export type StaffView=Awaited<ReturnType<typeof readStaffWorkspace>>;
export interface StaffPort{
 load():Promise<StaffView>;
 save(input:{requestId:string;expectedRevision:number;
  allowUnfinishedFallback:boolean;allowLogisticsFallback:boolean;
  autoRenewSameTerms:boolean;
  permittedDays:number[];permittedVenueIds:string[]}):Promise<unknown>;
 hire(input:{requestId:string;expectedRevision:number;staffId:string}):Promise<unknown>;
 release(input:{requestId:string;expectedRevision:number;employmentId:string}):Promise<unknown>;
 back?():void;
}
const el=(tag:string,cls="",content="")=>{
 const x=document.createElement(tag);x.className=cls;x.textContent=content;return x;
};
const button=(content:string,click:()=>void,disabled=false)=>{
 const b=el("button","ppw-staff-button",content) as HTMLButtonElement;
 b.type="button";b.disabled=disabled;b.onclick=click;return b;
};
const weekdays=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
/** Every permission opt-in is explicit, revocable before World Lock and
 * guarded by the same verified actor and revision as booking decisions. */
export function mountStaffDesk(root:HTMLElement,port:StaffPort){
 let view:StaffView|null=null,loading=false,saving=false,error="",notice="";
 let releaseConfirm=false;
 let unfinished=false,logistics=false,autoRenew=false,days=new Set<number>(),
  venues=new Set<string>(),requestId="";
 const changed=()=>{requestId="";};
 const hydrate=(next:StaffView)=>{
  view=next;unfinished=next.allowUnfinishedFallback;
  autoRenew=next.autoRenewSameTerms;
  logistics=next.allowLogisticsFallback;days=new Set(next.permittedDays);
  venues=new Set(next.permittedVenueIds);
 };
 async function refresh(){
  loading=true;render();
  try{hydrate(await port.load());error="";}
  catch(e){error=e instanceof Error?e.message:"Staff settings could not load";}
  finally{loading=false;render();}
 }
 async function employment(action:"HIRE"|"RELEASE",identity:string){
  if(!view?.canEdit||saving)return;
  const requestId=crypto.randomUUID(),expectedRevision=view.worldRevision;
  saving=true;error="";notice="";render();
  try{
   const result=action==="HIRE"?
    await port.hire({requestId,expectedRevision,staffId:identity}):
    await port.release({requestId,expectedRevision,employmentId:identity});
   if(result&&typeof result==="object"&&"status" in result&&
    (result as {status:unknown}).status==="STALE")
    throw new Error("The World changed. Reopen Staff to review current records.");
   hydrate(await port.load());releaseConfirm=false;changed();
   notice=action==="HIRE"?"Talent Manager hired. Their wages are paid with your weekly accounts.":
    "Talent Manager released. Their wages and renewal duties end now.";
  }catch(e){error=e instanceof Error?e.message:"The employment decision failed";}
  finally{saving=false;render();}
 }
 async function save(){
  if(!view?.canEdit||saving)return;
  if(logistics&&(!days.size||!venues.size)){
   error="Choose at least one day and one venue for logistics delegation.";
   render();return;
  }
  const id=requestId||(requestId=crypto.randomUUID());
  saving=true;error="";notice="";render();
  try{
   const result=await port.save({
    requestId:id,expectedRevision:view.worldRevision,
    allowUnfinishedFallback:unfinished,allowLogisticsFallback:logistics,
    autoRenewSameTerms:autoRenew,
    permittedDays:logistics?[...days].sort():[],
    permittedVenueIds:logistics?[...venues].sort():[]
   });
   if(result&&typeof result==="object"&&"status" in result&&
     (result as {status:unknown}).status==="STALE")
    throw new Error("World changed. Reload Staff permissions to review this choice.");
   hydrate(await port.load());requestId="";
   notice="Staff instructions updated for upcoming shows.";
  }catch(e){error=e instanceof Error?e.message:"Staff permissions were not saved";}
  finally{saving=false;render();}
 }
 function toggle(text:string,description:string,value:boolean,
  onChange:(next:boolean)=>void,disabled=false){
  const row=el("label","ppw-staff-toggle");
  const input=document.createElement("input");input.type="checkbox";
  input.checked=value;input.disabled=disabled;input.onchange=()=>{
   onChange(input.checked);changed();render();
  };
  row.append(input,el("strong","",text),el("span","",description));
  return row;
 }
 function render(){
  root.classList.add("ppw-editor","ppw-staff");root.replaceChildren();
  const head=el("header","ppw-staff-head");
  if(port.back)head.append(button("← Back",()=>port.back?.()));
  head.append(el("span","ppw-staff-kicker","THE OFFICE / STAFF"),
   el("h1","","Staff"),
   el("p","ppw-staff-muted",
    view?"Year "+view.year+" · Week "+view.week:
     "Put trusted people in charge of renewals, scheduling and show-day cover."));
  root.append(head);
  if(error)root.append(el("p","ppw-alert ppw-error",error));
  if(notice)root.append(el("p","ppw-alert ppw-success",notice));
  if(!view){if(!loading)root.append(button("Retry",()=>void refresh()));return;}
  if(!view.canEdit)root.append(el("p","ppw-staff-lock",
   "The weekly deadline has passed. Staff instructions can be reviewed but not changed until next week."));
  const fallback=el("section","ppw-staff-panel");
  fallback.append(el("h2","","Emergency show cover"),
   toggle("Cover an unfinished show",
    "If your card is incomplete at the deadline, staff can arrange cover without changing your chosen winners.",
    unfinished,v=>{unfinished=v;},!view.canEdit||saving));
  root.append(fallback);
  const manager=el("section","ppw-staff-panel ppw-staff-manager");
  manager.append(el("span","ppw-staff-kicker","THE TALENT OFFICE"),el("h2","","Talent Manager"));
  if(view.talentManager){
   const member=view.talentManager;
   const employed=el("article","ppw-staff-employed");
   const identity=el("div","ppw-staff-manager-identity");
   identity.append(el("span","ppw-staff-manager-avatar",
    member.name.split(" ").slice(0,2).map(x=>x[0]).join("")),
    el("strong","",member.name));
   employed.append(identity);
   const figures=el("div","ppw-staff-manager-metrics");
   figures.append(el("span","","INSIGHT  /  "+member.insight+"/100"),
    el("span","","SALARY  /  $"+member.weeklySalary.toLocaleString("en-GB")+"/week"));
   employed.append(figures);
   if(releaseConfirm){
    employed.append(el("p","ppw-staff-muted",
     "Release this manager? Their salary and delegated renewal authority end. Submitted wrestler offers are unaffected."),
     button("Confirm release",()=>void employment("RELEASE",member.employmentId),saving||!view.canEdit),
     button("Keep manager",()=>{releaseConfirm=false;render();},saving));
   }else employed.append(button("Release manager",()=>{
    releaseConfirm=true;render();},saving||!view.canEdit));
   manager.append(employed);
  }else{
   manager.append(el("p","ppw-staff-muted",
    "Your talent office needs a manager. Choose an available candidate and hold enough cash to cover four weeks' wages."));
   const candidates=el("div","ppw-staff-candidates");
   for(const member of view.availableManagers){
    const candidate=el("article","ppw-staff-candidate");
    const copy=el("div","");
    copy.append(el("strong","",member.name),
     el("small","","INSIGHT "+member.insight+"/100 · $"+
      member.weeklySalary.toLocaleString("en-GB")+"/week"));
    candidate.append(copy,button("Hire",()=>void employment("HIRE",member.staffId),
     saving||!view.canEdit));
    candidates.append(candidate);
   }
   if(!view.availableManagers.length)candidates.append(el("p","ppw-staff-muted",
    "Every Talent Manager is employed by another promotion."));
   manager.append(candidates);
  }
  manager.append(toggle("Delegate same-terms renewals",
    "When enabled, your employed manager offers unchanged terms in the final three weeks. Wrestlers may refuse.",
    autoRenew,v=>{autoRenew=v;},!view.talentManager||!view.canEdit||saving));
  manager.append(el("p","ppw-staff-muted",
   "An experienced manager can offer better advice, but every wrestler decides whether to accept. Follow offers in Contracts."));
  root.append(manager);
  const support=el("section","ppw-staff-panel");
  support.append(el("h2","","Logistics authority"),
   toggle("Permit scheduling assistance",
    "Let staff find an approved date or venue when plans fall through. They cannot change your match card.",
    logistics,v=>{logistics=v;},!view.canEdit||saving));
  const choices=el("div","ppw-staff-choices");
  choices.append(el("h3","","Permitted show days"));
  const dayList=el("div","ppw-staff-picks");
  weekdays.forEach((day,i)=>{
   const index=i+1;
   dayList.append(toggle(day,"",days.has(index),checked=>{
    if(checked)days.add(index);else days.delete(index);
   },!view!.canEdit||saving||!logistics));
  });
  choices.append(dayList,el("h3","","Permitted venues"));
  const venueList=el("div","ppw-staff-picks");
  for(const venue of view.venues){
   venueList.append(toggle(venue.name,
    venue.capacity===null?"Available arena":
     venue.capacity.toLocaleString("en-GB")+" capacity"+
      (venue.weeklyHireCost===null?"":" · $"+
       venue.weeklyHireCost.toLocaleString("en-GB")+" hire"),
    venues.has(venue.venueId),checked=>{
     if(checked)venues.add(venue.venueId);else venues.delete(venue.venueId);
    },!view.canEdit||saving||!logistics));
  }
  if(!view.venues.length)venueList.append(el("p","ppw-staff-muted",
   "No suitable venues are currently available."));
  choices.append(venueList);support.append(choices);root.append(support);
  const footer=el("section","ppw-staff-panel");
  footer.append(el("h2","","What staff cannot do"),
   el("p","ppw-staff-muted",
    "Your team can handle administration, but you still choose the winners, storylines, signings and appearances."));
  if(view.lockedLogisticsDelegated)footer.append(el("p","ppw-staff-muted",
   "Your scheduling instructions were already confirmed for this week."));
  footer.append(button(saving?"Saving…":"Save instructions",()=>void save(),
   !view.canEdit||saving||loading));
  root.append(footer);
 }
 void refresh();
 return {refresh};
}
