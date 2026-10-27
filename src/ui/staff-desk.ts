/** Staff Office — mobile-first private promotion dashboard.
 * No extra bottom navigation. Only the controlling player can sign staff.
 */
import type {readStaffWorkspace} from "../db/staff-workspace.js";
import {STAFF_ROLES,type StaffRole} from "../domain/world-staff.js";
import {GORILLA_POLICIES,type GorillaPolicy} from "../domain/gorilla-position.js";
export type StaffView=Awaited<ReturnType<typeof readStaffWorkspace>>;
export interface StaffPort{
 load():Promise<StaffView>;
 saveGorilla?(input:{requestId:string;expectedRevision:number;policy:GorillaPolicy}):Promise<unknown>;
 save(input:{requestId:string;expectedRevision:number;
  allowUnfinishedFallback:boolean;allowLogisticsFallback:boolean;
  autoRenewSameTerms:boolean;
  permittedDays:number[];permittedVenueIds:string[]}):Promise<unknown>;
 hire(input:{requestId:string;expectedRevision:number;staffId:string;
  weeklySalary:number;termWeeks:52|104}):Promise<unknown>;
 release(input:{requestId:string;expectedRevision:number;employmentId:string}):Promise<unknown>;
 renew(input:{requestId:string;expectedRevision:number;employmentId:string;
  weeklySalary:number;termWeeks:52|104}):Promise<unknown>;
 openContracts?():void;openProgrammes?():void;openRoster?():void;
 openMarket?():void;openGorilla?():void;back?():void;
}
const el=(tag:string,cls="",content="")=>{
 const x=document.createElement(tag);x.className=cls;x.textContent=content;return x;
};
const button=(text:string,action:()=>void,disabled=false)=>{
 const b=el("button","ppw-staff-button",text) as HTMLButtonElement;
 b.type="button";b.onclick=action;b.disabled=disabled;return b;
};
const money=(amount:number)=>"$"+amount.toLocaleString("en-GB");
const roles=(role:StaffRole)=>role.replaceAll("_"," ").toLowerCase()
 .replace(/(^|\s)\S/g,c=>c.toUpperCase());
const weekdays=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
export function mountStaffDesk(root:HTMLElement,port:StaffPort){
 let view:StaffView|null=null,loading=false,saving=false,error="",notice="";
 let fallback=false,logistics=false,autoRenew=false;
 let gorillaPolicy:GorillaPolicy="STICK_TO_CARD";
 let days=new Set<number>(),venues=new Set<string>(),requestId="";
 let department:StaffRole="ROAD_AGENT",termWeeks:52|104=52;
 let confirming="",renewing="";
 let pane:"MEETINGS"|"TEAM"|"CONTRACTS"|"MARKET"="MEETINGS";
 const offers=new Map<string,number>();
 const hydrate=(v:StaffView)=>{
  view=v;fallback=v.allowUnfinishedFallback;logistics=v.allowLogisticsFallback;
  gorillaPolicy=v.gorillaPolicy??"STICK_TO_CARD";
  autoRenew=v.autoRenewSameTerms;days=new Set(v.permittedDays);
  venues=new Set(v.permittedVenueIds);
 };
 async function refresh(){
  loading=true;render();
  try{hydrate(await port.load());error="";}catch(e){
   error=e instanceof Error?e.message:"Staff Office could not load";
  }finally{loading=false;render();}
 }
 async function act(action:"HIRE"|"RELEASE"|"RENEW",identity:string,
  salary=0){
  if(!view?.canEdit||saving)return;
  const requestId=crypto.randomUUID(),expectedRevision=view.worldRevision;
  saving=true;error="";notice="";render();
  try{
   const result=action==="HIRE"?
    await port.hire({requestId,expectedRevision,staffId:identity,
     weeklySalary:salary,termWeeks}):
    action==="RENEW"?await port.renew({requestId,expectedRevision,
     employmentId:identity,weeklySalary:salary,termWeeks}):
    await port.release({requestId,expectedRevision,employmentId:identity});
   const response=result as {status?:string;result?:{accepted?:boolean;reason?:string}};
   if(response?.status==="STALE")throw new Error("Staff contracts changed. Reload before deciding.");
   hydrate(await port.load());confirming="";renewing="";
   notice=response?.result?.accepted===false?
    response.result.reason??"This offer was declined.":
    action==="HIRE"?"Staff contract signed. Weekly payroll now includes this employee.":
    action==="RENEW"?"Staff contract renewed on the agreed terms.":
    "Employee released. The buyout was charged once and the position is free.";
  }catch(e){error=e instanceof Error?e.message:"The employment decision was not saved";}
  finally{saving=false;render();}
 }
 async function save(){
  if(!view?.canEdit||saving)return;
  if(logistics&&(!days.size||!venues.size)){
   error="Choose at least one day and one venue for logistics delegation.";render();return;
  }
  const id=requestId||(requestId=crypto.randomUUID());
  saving=true;error="";notice="";render();
  try{
   const result=await port.save({requestId:id,expectedRevision:view.worldRevision,
    allowUnfinishedFallback:fallback,allowLogisticsFallback:logistics,
    autoRenewSameTerms:autoRenew,permittedDays:logistics?[...days].sort():[],
    permittedVenueIds:logistics?[...venues].sort():[]});
   if((result as {status?:string})?.status==="STALE")
    throw new Error("World settings changed. Reload your instructions.");
   hydrate(await port.load());requestId="";
   notice="Staff instructions saved.";
  }catch(e){error=e instanceof Error?e.message:"Staff permissions could not be saved";}
  finally{saving=false;render();}
 }
 async function saveGorilla(){
  if(!view?.canEdit||saving||!port.saveGorilla)return;
  const requestId=crypto.randomUUID(),expectedRevision=view.worldRevision;
  saving=true;error="";notice="";render();
  try{
   const result=await port.saveGorilla({requestId,expectedRevision,policy:gorillaPolicy});
   if((result as {status?:string})?.status==="STALE")
    throw new Error("Gorilla instructions changed. Reload before deciding.");
   hydrate(await port.load());notice="Gorilla instructions saved before World Lock.";
  }catch(e){error=e instanceof Error?e.message:"Unable to save Gorilla instructions";}
  finally{saving=false;render();}
 }
 function toggle(text:string,desc:string,checked:boolean,
  changed:(checked:boolean)=>void,disabled=false){
  const row=el("label","ppw-staff-toggle");
  const input=document.createElement("input");input.type="checkbox";
  input.checked=checked;input.disabled=disabled;
  input.onchange=()=>{changed(input.checked);requestId="";render();};
  row.append(input,el("strong","",text),el("span","",desc));return row;
 }
 function render(){
  root.classList.add("ppw-editor","ppw-staff");root.replaceChildren();
  const header=el("header","ppw-staff-head");
  if(port.back)header.append(button("← Back",()=>port.back?.()));
  header.append(el("span","ppw-staff-kicker","THE OFFICE / BACKSTAGE"),
   el("h1","","Staff Office"),el("p","ppw-staff-muted",
    view?"Year "+view.year+" · Week "+view.week+" · Nine departments":
    "Build a team that shapes the wrestling World."));
  root.append(header);
  if(error)root.append(el("p","ppw-alert ppw-error",error));
  if(notice)root.append(el("p","ppw-alert ppw-success",notice));
  if(!view){if(!loading)root.append(button("Retry",()=>void refresh()));return;}
  if(!view.canEdit)root.append(el("p","ppw-staff-lock",
   "The booking deadline has passed. Staff contracts can be reviewed but not changed until the next week."));
  const overview=el("section","ppw-staff-office-overview");
  const cards=el("div","ppw-staff-overview-grid");
  for(const [value,label] of [
   [view.employees.length+"/"+STAFF_ROLES.length,"DEPARTMENTS"],
   [money(view.weeklyPayroll),"WEEKLY PAYROLL"],
   [money(view.promotionCash),"CASH AVAILABLE"]
  ] as const){
   const card=el("div","ppw-staff-overview-metric");
   card.append(el("strong","",value),el("small","",label));cards.append(card);
  }
  overview.append(cards);

  root.append(overview);
  const nav=el("nav","ppw-staff-nav");
  nav.setAttribute("aria-label","Staff Office sections");
  for(const [key,label] of [
   ["MEETINGS","Meetings"],["TEAM","My Staff"],
   ["CONTRACTS","Contracts"],["MARKET","Staff Market"]
  ] as const){
   const tab=button(label,()=>{pane=key;render();});
   tab.setAttribute("aria-current",pane===key?"page":"false");
   nav.append(tab);
  }
  root.append(nav);
  const meeting=el("section","ppw-staff-panel ppw-staff-meetings");
  meeting.append(el("span","ppw-staff-kicker","STAFF MEETING"),
   el("h2","","Around the table"),
   el("p","ppw-staff-muted",
    "Nine departments. Advice from verified shows and available talent; vacancies retain basic house cover."));
  const attendees=el("div","ppw-staff-meeting-grid");
  for(const brief of view.meetings??[]){
   const slot=el("details","ppw-staff-meeting-brief");
   const lead=el("summary","");
   const caption=el("div","");
   caption.append(el("span","ppw-staff-kicker",roles(brief.role)),
    el("strong","",brief.staffName??"Position vacant · house cover"));
   lead.append(caption);slot.append(lead);
   slot.append(el("p","ppw-staff-muted",brief.message));
   if(brief.role==="SCOUT"&&view.scoutReport?.length){
    for(const prospect of view.scoutReport){
     const item=el("div","ppw-staff-scout-pick");
     item.append(el("strong","",prospect.name),
      el("small","",prospect.observation));
     slot.append(item);
    }
    if(port.openMarket)slot.append(button("Browse Talent Market",()=>port.openMarket?.()));
   }
   if(brief.staffName&&brief.personality)
    slot.append(el("small","ppw-staff-voice",
     brief.personality==="FRANK"?"A direct assessment from your department lead":
     brief.personality==="PATIENT"?"Measured advice from your department lead":
     brief.personality==="ECCENTRIC"?"An unconventional take from your department lead":
     brief.personality==="LOYAL"?"Advice grounded in team continuity":
     "An ambitious eye on the next opportunity"));
   if(brief.target==="contracts"&&port.openContracts)
    slot.append(button("Review contracts",()=>port.openContracts?.()));
   if(brief.target==="roster"&&port.openRoster)
    slot.append(button("Review roster",()=>port.openRoster?.()));
   if(brief.target==="programmes"&&port.openProgrammes)
    slot.append(button("Review programmes",()=>port.openProgrammes?.()));
   if(brief.target==="gorilla"&&port.openGorilla)
    slot.append(button("Open Gorilla Position",()=>port.openGorilla?.()));
   attendees.append(slot);
  }
  meeting.append(attendees);if(pane==="MEETINGS")root.append(meeting);
  if(port.saveGorilla){
   const gorilla=el("section","ppw-staff-panel ppw-gorilla-policy");
   gorilla.append(el("span","ppw-staff-kicker","GORILLA POSITION"),
    el("h2","","Showtime instructions"),
    el("p","ppw-staff-muted",
     "Choose your standing instruction before the one World Lock. Your Road Agent can respond to verified crowd, medical or timing incidents; scripted winners and finishes never change."));
   const choices=el("div","ppw-gorilla-choices");
   choices.setAttribute("role","group");
   choices.setAttribute("aria-label","Gorilla standing policy");
   const names:Record<GorillaPolicy,string>={
    STICK_TO_CARD:"Stick to the card",USE_JUDGEMENT:"Use judgement",
    FOLLOW_THE_CROWD:"Follow the crowd",PROTECT_KEY_PLANS:"Protect key plans"};
   for(const policy of GORILLA_POLICIES){
    const control=button(names[policy],()=>{gorillaPolicy=policy;render();},
     !view.canEdit||saving);
    control.setAttribute("aria-pressed",String(gorillaPolicy===policy));
    choices.append(control);
   }
   gorilla.append(choices,button("Save Gorilla instructions",
    ()=>void saveGorilla(),!view.canEdit||saving));
   if(port.openGorilla)gorilla.append(button("Prepare individual match contingencies →",
    ()=>port.openGorilla?.(),saving));
   if(!view.employees.some(e=>e.role==="ROAD_AGENT"))
    gorilla.append(el("p","ppw-staff-muted",
     "Basic house cover protects the script. Hire a Road Agent to delegate competent on-air adaptations."));
   if(pane==="MEETINGS")root.append(gorilla);
  }
  const team=el("section","ppw-staff-panel ppw-staff-team");
  team.append(el("span","ppw-staff-kicker","YOUR BACKSTAGE CREW"),
   el("h2","","Departments"),el("p","ppw-staff-muted",
    "One exclusive World employee per role. Vacancies have basic cover. Renewals replace the existing salary and remaining term immediately."));
  const teamRows=el("div","ppw-staff-team-list");
  for(const role of STAFF_ROLES){
   const member=view.employees.find(e=>e.role===role);
   if(pane==="CONTRACTS"&&!member)continue;
   const item=el("article","ppw-staff-role-row");
   item.append(el("span","ppw-staff-manager-avatar",member?
    member.name.split(" ").slice(0,2).map(w=>w[0]).join(""):"＋"));
   const detail=el("div","ppw-staff-role-info");
   detail.append(el("small","",roles(role).toUpperCase()),
    el("strong","",member?.name??"Position vacant"),
    el("span","",member?
     member.personality+" · "+member.specialism+" · "+money(member.weeklySalary)+"/wk":
     "Basic cover · no weekly staff wage"));
   if(member)detail.append(el("span","",
    "CRAFT "+member.craft+"  ·  PEOPLE "+member.people+
    "  ·  RELIABILITY "+member.reliability+
    "  ·  MORALE "+member.morale+"/100  ·  "+member.weeksRemaining+" weeks left"));
   item.append(detail);
   if(member){
    if(pane==="CONTRACTS"){
    const actions=el("div","ppw-staff-actions");
    if(member.weeksRemaining<=13){
     if(renewing===member.employmentId){
      const entry=salaryInput(member.employmentId,member.weeklySalary);
      actions.append(entry,button("Offer renewal",
       ()=>void act("RENEW",member.employmentId,Number(entry.value)),
       saving||!view.canEdit));
     }else actions.append(button("Renew",()=>{
      renewing=member.employmentId;offers.set(member.employmentId,member.weeklySalary);render();
     },saving||!view.canEdit));
    }
    if(confirming===member.employmentId){
     actions.append(el("span","ppw-staff-buyout",
      "Buyout "+money(member.buyoutCost)+" · exact remaining wages"),
      button("Confirm buyout",()=>void act("RELEASE",member.employmentId),
       saving||!view.canEdit||view.promotionCash<member.buyoutCost),
      button("Cancel",()=>{confirming="";render();}));
    }else actions.append(button("Release",()=>{confirming=member.employmentId;render();},
     saving||!view.canEdit));
    item.append(actions);
    }else item.append(staffDossier(member));
   }else item.append(button("Recruit",()=>{
    department=role;pane="MARKET";render();
   }));
   teamRows.append(item);
  }
  team.append(teamRows);
  if(pane==="CONTRACTS"){
   team.querySelector("h2")!.textContent="Staff contracts";
   team.querySelector(".ppw-staff-muted")!.textContent="Renew approaching terms or buy out an existing agreement. Staff wages are paid weekly.";
  }
  if(pane==="TEAM"||pane==="CONTRACTS")root.append(team);
  const market=el("section","ppw-staff-panel ppw-staff-market");
  market.id="ppw-staff-market";
  market.append(el("span","ppw-staff-kicker","SHARED WORLD TALENT"),
   el("h2","","Staff Market"),
   el("p","ppw-staff-muted",
    "Unique people, not generic upgrades. Offer a weekly wage and a one- or two-year agreement."));
  const departments=el("div","ppw-staff-departments");
   departments.setAttribute("role","group");
   departments.setAttribute("aria-label","Staff departments");
  for(const role of STAFF_ROLES){
   const tab=button(roles(role),()=>{department=role;render();});
   tab.setAttribute("aria-pressed",String(department===role));
   departments.append(tab);
  }
  market.append(departments);
  const duration=el("select","ppw-staff-term") as HTMLSelectElement;
  for(const [weeks,label] of [[52,"1 year"],[104,"2 years"]] as const){
   const option=document.createElement("option");
   option.value=String(weeks);option.textContent=label;duration.append(option);
  }
  duration.value=String(termWeeks);
  duration.onchange=()=>{termWeeks=Number(duration.value) as 52|104;};
  duration.setAttribute("aria-label","Contract length");
  const options=el("div","ppw-staff-term-options");
  options.append(el("strong","","Contract length"),duration);market.append(options);
  const candidates=el("div","ppw-staff-candidates");
  const available=view.market.filter(m=>m.role===department);
  if(!available.length)candidates.append(el("p","ppw-staff-muted",
   "No free candidates in this department. A rival may have hired them."));
  for(const candidate of available){
   const card=el("article","ppw-staff-candidate ppw-staff-market-card");
   const identity=el("div","");
   const former=view.employmentHistory.find(e=>e.staffId===candidate.staffId);
   identity.append(el("strong","",candidate.name),
    el("small","",candidate.personality+" · "+candidate.specialism),
    el("small","","CRAFT "+candidate.craft+" · PEOPLE "+candidate.people+
     " · RELIABILITY "+candidate.reliability),
    el("small","","ASKING "+money(candidate.weeklySalary)+"/week"));
   if(candidate.formerWrestlerId)identity.append(el("small","",
    "FORMER WRESTLER · "+(candidate.careerNote??"Verified career experience")));
   if(former)identity.append(el("small","",
    "PREVIOUSLY: "+former.promotionName+" · staff career record"));
   const amount=salaryInput(candidate.staffId,candidate.weeklySalary);
   const controls=el("div","ppw-staff-market-actions");
   controls.append(amount,button("Offer contract",
    ()=>void act("HIRE",candidate.staffId,Number(amount.value)),
    saving||!view.canEdit||view.employees.some(e=>e.role===department)));
   card.append(identity,staffDossier(candidate),controls);candidates.append(card);
  }
  market.append(candidates);if(pane==="MARKET")root.append(market);
  const continuity=el("section","ppw-staff-panel");
  continuity.append(el("h2","","Show cover and delegation"),
   toggle("Emergency cover for an unfinished show",
    "Staff can arrange a fallback if you miss World Lock; existing scripted finishes remain untouched.",
    fallback,v=>{fallback=v;},!view.canEdit||saving),
   toggle("Delegate same-terms wrestler renewals",
    "Your employed Talent Manager submits unchanged terms close to expiry. Wrestlers can refuse.",
    autoRenew,v=>{autoRenew=v;},!view.talentManager||!view.canEdit||saving),
   toggle("Permit scheduling assistance",
    "Staff may choose only dates and venues that you explicitly approve.",
    logistics,v=>{logistics=v;},!view.canEdit||saving));
  if(logistics){
   const weekdaysBlock=el("div","ppw-staff-picks");
   for(const [i,day] of weekdays.entries())weekdaysBlock.append(toggle(day,"",days.has(i+1),
    value=>{if(value)days.add(i+1);else days.delete(i+1);},!view.canEdit||saving));
   continuity.append(el("h3","","Approved show days"),weekdaysBlock);
   const venuesBlock=el("div","ppw-staff-picks");
   for(const venue of view.venues)venuesBlock.append(toggle(venue.name,
    venue.capacity===null?"Available hall":venue.capacity.toLocaleString("en-GB")+" seats",
    venues.has(venue.venueId),
    value=>{if(value)venues.add(venue.venueId);else venues.delete(venue.venueId);},
    !view.canEdit||saving));
   continuity.append(el("h3","","Approved venues"),venuesBlock);
  }
  if(view.lockedLogisticsDelegated)continuity.append(el("p","ppw-staff-muted",
   "This week's scheduling instructions are already frozen."));
  continuity.append(button(saving?"Saving…":"Save staff instructions",()=>void save(),
   !view.canEdit||saving||loading));
  if(pane==="MEETINGS")root.append(continuity);
 }
 function staffDossier(member:StaffView["market"][number]){
  const details=el("details","ppw-staff-dossier");
  details.append(el("summary","","View "+member.name+"'s dossier"));
  const profile=el("div","ppw-staff-dossier-body");
  const temperament:Record<typeof member.personality,string>={
   FRANK:"A forthright voice. Doesn't dress up uncomfortable advice.",
   PATIENT:"Calm under pressure and happier building steadily.",
   AMBITIOUS:"Focused on big opportunities and professional progress.",
   LOYAL:"Places trust, stable teams and relationships first.",
   ECCENTRIC:"Brings unusual ideas and an unconventional approach."
  };
  if(member.formerWrestlerId)profile.append(el("p","",
   "Former wrestler · "+(member.careerNote??"Verified career history")));
  profile.append(el("p","",temperament[member.personality]),
   el("p","",roles(member.role)+" specialist · "+member.specialism));
  const attributes=el("div","ppw-staff-attribute-list");
  for(const [name,score] of [["Craft",member.craft],
    ["People",member.people],["Reliability",member.reliability]] as const){
   const row=el("div","ppw-staff-attribute");
   const meter=el("meter","") as HTMLMeterElement;
   meter.min=0;meter.max=100;meter.value=score;
   meter.setAttribute("aria-label",name+" "+score+"/100");
   row.append(el("span","",name+" · "+score),meter);
   attributes.append(row);
  }
  profile.append(attributes);
  const history=view?.employmentHistory.filter(e=>e.staffId===member.staffId)??[];
  if(history.length){
   const career=el("div","ppw-staff-career");
   career.append(el("strong","","World employment history"));
   for(const job of history.slice(0,5)){
    career.append(el("p","",job.promotionName+" · "+roles(job.role)+
     " · Week "+(job.startedWeekIndex+1)+"–"+(job.endedWeekIndex+1)));
   }
   profile.append(career);
  }else profile.append(el("p","ppw-staff-muted",
   "No previous completed staff employment recorded in this World."));
  details.append(profile);return details;
 }
 function salaryInput(id:string,asking:number){
  const input=el("input","ppw-staff-salary") as HTMLInputElement;
  input.type="number";input.min="1";input.max="1000000";
  input.value=String(offers.get(id)??asking);
  input.setAttribute("aria-label","Weekly salary offer");
  input.oninput=()=>offers.set(id,Number(input.value));
  return input;
 }
 void refresh();
 return {refresh};
}
