/** Staff Office — mobile-first private promotion dashboard.
 * No extra bottom navigation. Only the controlling player can sign staff.
 */
import type {readStaffWorkspace} from "../db/staff-workspace.js";
import {STAFF_ROLES,type StaffRole} from "../domain/world-staff.js";
export type StaffView=Awaited<ReturnType<typeof readStaffWorkspace>>;
export interface StaffPort{
 load():Promise<StaffView>;
 save(input:{requestId:string;expectedRevision:number;
  allowUnfinishedFallback:boolean;allowLogisticsFallback:boolean;
  autoRenewSameTerms:boolean;
  permittedDays:number[];permittedVenueIds:string[]}):Promise<unknown>;
 hire(input:{requestId:string;expectedRevision:number;staffId:string;
  weeklySalary:number;termWeeks:52|104}):Promise<unknown>;
 release(input:{requestId:string;expectedRevision:number;employmentId:string}):Promise<unknown>;
 renew(input:{requestId:string;expectedRevision:number;employmentId:string;
  weeklySalary:number;termWeeks:52|104}):Promise<unknown>;
 openContracts?():void;openProgrammes?():void;openRoster?():void;back?():void;
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
 let days=new Set<number>(),venues=new Set<string>(),requestId="";
 let department:StaffRole="ROAD_AGENT",termWeeks:52|104=52;
 let confirming="",renewing="";
 const offers=new Map<string,number>();
 const hydrate=(v:StaffView)=>{
  view=v;fallback=v.allowUnfinishedFallback;logistics=v.allowLogisticsFallback;
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
    view?"Year "+view.year+" · Week "+view.week+" · Eight departments":
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
   [view.employees.length+"/8","DEPARTMENTS"],
   [money(view.weeklyPayroll),"WEEKLY PAYROLL"],
   [money(view.promotionCash),"CASH AVAILABLE"]
  ] as const){
   const card=el("div","ppw-staff-overview-metric");
   card.append(el("strong","",value),el("small","",label));cards.append(card);
  }
  overview.append(cards);
  if(view.notices.length){
   const notes=el("div","ppw-staff-advice");
   notes.append(el("h2","","From your team"));
   for(const info of view.notices){
    const card=el("article","ppw-staff-note");
    card.append(el("strong","",info.department),el("p","",info.message));
    const employee=view.employees.find(e=>info.department.startsWith(e.name));
    const tone=employee?.personality==="FRANK"?"I'll be direct. ":
     employee?.personality==="ECCENTRIC"?"My clipboard has a theory. ":
     employee?.personality==="PATIENT"?"I think it's worth considering. ":
     employee?.personality==="LOYAL"?"For the good of our roster, ":
     employee?.personality==="AMBITIOUS"?"Here's where we can get ahead. ":"";
    const chat=el("details","ppw-staff-conversation");
    chat.append(el("summary","","Talk to "+(employee?.name??"the department")));
    chat.append(el("p","",tone+info.message));
    card.append(chat);
    if(info.target!=="staff")
     card.append(button("Open "+info.target+" ↗",
      ()=>info.target==="contracts"?port.openContracts?.():
       info.target==="roster"?port.openRoster?.():port.openProgrammes?.()));
    notes.append(card);
   }
   overview.append(notes);
  }
  root.append(overview);
  const team=el("section","ppw-staff-panel ppw-staff-team");
  team.append(el("span","ppw-staff-kicker","YOUR BACKSTAGE CREW"),
   el("h2","","Departments"),el("p","ppw-staff-muted",
    "One exclusive World employee per role. Vacancies have basic cover. Renewals replace the existing salary and remaining term immediately."));
  const teamRows=el("div","ppw-staff-team-list");
  for(const role of STAFF_ROLES){
   const member=view.employees.find(e=>e.role===role);
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
    item.append(actions,staffDossier(member));
   }else item.append(button("Recruit",()=>{
    department=role;render();root.querySelector("#ppw-staff-market")?.scrollIntoView({block:"start"});
   }));
   teamRows.append(item);
  }
  team.append(teamRows);root.append(team);
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
   if(former)identity.append(el("small","",
    "PREVIOUSLY: "+former.promotionName+" · staff career record"));
   const amount=salaryInput(candidate.staffId,candidate.weeklySalary);
   const controls=el("div","ppw-staff-market-actions");
   controls.append(amount,button("Offer contract",
    ()=>void act("HIRE",candidate.staffId,Number(amount.value)),
    saving||!view.canEdit||view.employees.some(e=>e.role===department)));
   card.append(identity,staffDossier(candidate),controls);candidates.append(card);
  }
  market.append(candidates);root.append(market);
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
  root.append(continuity);
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
