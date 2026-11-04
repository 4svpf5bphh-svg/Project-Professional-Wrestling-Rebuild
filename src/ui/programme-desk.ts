/** Mobile PPW feud desk. Uses server-validated original programme sides.
 * No World-wide data, auto-submission, or mandatory flow.
 */
import type {readProgrammeWorkspace,ProgrammeDirectionChoice,ProgrammePayoff} from "../db/programme-workspace.js";
import {readProgrammeContinuity} from "../domain/programme-continuity.js";
import type {ProgrammeRef} from "../domain/programme-lifecycle.js";
import {programmeOverlaps,availableProgrammeOption} from "../domain/programme-selector.js";
import {evaluateProgrammeReview} from "../domain/programme-review.js";
import {suggestProgrammeAdvice} from "./programme-staff-advice.js";
import {recommendProgrammeAngles,type ProgrammeAngleIdea} from "../domain/programme-angle-recommendations.js";
import {describeProgrammeChapter} from "./programme-chapter-summary.js";
import {createWrestlerPortrait} from "./wrestler-portrait.js";
import {wrestlerInitials} from "./wrestler-card.js";
export type ProgrammeView=Awaited<ReturnType<typeof readProgrammeWorkspace>>;
export interface ProgrammeDeskPort{
 load():Promise<ProgrammeView>;
 start(input:{requestId:string;expectedRevision:number;
  sideA:ProgrammeRef[];sideB:ProgrammeRef[];championshipId:string|null}):Promise<unknown>;
 end(input:{requestId:string;expectedRevision:number;programmeId:string}):Promise<unknown>;
 planFinale(input:{requestId:string;expectedRevision:number;programmeId:string;
  showId:string|null;slotId:string|null;payoff:ProgrammePayoff|null}):Promise<unknown>;
 chooseDirection(input:{requestId:string;expectedRevision:number;programmeId:string;
  showId:string;slotId:string;choice:ProgrammeDirectionChoice}):Promise<unknown>;
 standingConsent(input:{requestId:string;expectedRevision:number;programmeId:string;
  personId:string;matchType:"SINGLES"|"TAG";
  permittedOutcome:"WIN_ONLY"|"WIN_OR_PROTECTED_LOSS";termWeeks:number}):Promise<unknown>;
 openPlanner?(programmeId?:string,ideaKind?:ProgrammeAngleIdea["kind"]):void;
 openResults?(showId:string):void;
 openArchive?():void;
 openWrestler?(personId:string):void;
}
const element=(tag:string,cls:string,text="")=>{
 const x=document.createElement(tag);x.className=cls;x.textContent=text;return x;};
const button=(title:string,click:()=>void,disabled=false)=>{
 const x=element("button","ppw-programme-action",title) as HTMLButtonElement;
 x.type="button";x.disabled=disabled;x.onclick=click;return x;
};
export function mountProgrammeDesk(root:HTMLElement,port:ProgrammeDeskPort,
 onBack?:()=>void,focusPersonId?:string){
 let view:ProgrammeView|null=null,working=false,error="",success="";

 let refsA:(ProgrammeRef|null)[]=[null],refsB:(ProgrammeRef|null)[]=[null];
 let titleId:string|null=null;
 let selectedProgrammeId:string|null=null;
 let activeLane:"PAYOFF"|"HISTORY"|"STORY"|"PLAN"="STORY";
 let selectedArchiveId:string|null=null;
 let archiveView=false;
 let creationOpen=false,focusResolved=false;
 const adviceOpen=new Set<string>();
 const finaleChoices=new Map<string,{slotKey:string;payoff:ProgrammePayoff}>();
 const standing=new Map<string,{matchType:"SINGLES"|"TAG";
  permittedOutcome:"WIN_ONLY"|"WIN_OR_PROTECTED_LOSS";termWeeks:number}>();
 function rosterOptions(){
  return view?[...view.people,...view.teams]:[];
 }
 const teamMembers=()=>new Map((view?.teams??[]).map(t=>[t.refId,t.memberIds]));
 const allSelected=()=>[...refsA,...refsB].filter((r):r is ProgrammeRef=>r!==null);
 const name=(p:ProgrammeRef)=>rosterOptions().find(x=>
  x.kind===p.kind&&x.refId===p.refId)?.name??p.refId;
 async function reload(){
  working=true;render();
  try{view=await port.load();error="";}catch(e){
   error=e instanceof Error?e.message:"Unable to load rivalries";
  }finally{working=false;render();}
 }
 async function run(action:()=>Promise<unknown>,result:string){
  if(working)return;
  working=true;error="";success="";render();
  try{
   const response=await action();
   if(response&&typeof response==="object"&&"status" in response&&
    (response as {status:unknown}).status==="STALE")
    throw new Error("A rivalry has changed. Review the latest details before continuing.");
   view=await port.load();success=result;refsA=[null];refsB=[null];titleId=null;
  }catch(e){error=e instanceof Error?e.message:"Programme change failed";}
  finally{working=false;render();}
 }
 async function saveDirection(programmeId:string,showId:string,slotId:string,
  choice:ProgrammeDirectionChoice){
  if(!view||working)return;
  working=true;error="";success="";render();
  try{
   const response=await port.chooseDirection({programmeId,showId,slotId,choice,
    requestId:crypto.randomUUID(),expectedRevision:view.worldRevision});
   if(response&&typeof response==="object"&&"status" in response&&
    (response as {status:unknown}).status==="STALE")
    throw new Error("The rivalry changed. Check the latest result before deciding again.");
   view=await port.load();
   success="Decision recorded. You can now book the next chapter.";
  }catch(e){error=e instanceof Error?e.message:"Unable to save this decision";}
  finally{working=false;render();}
 }
 function selector(options:readonly {key:string;label:string}[],
  selected:string,change:(value:string)=>void,
  forbidden:ReadonlySet<string>=new Set()):HTMLSelectElement{
  const x=document.createElement("select");x.disabled=working||!view?.canEdit;
  x.setAttribute("aria-label","Choose rivalry participant");
  for(const o of options){
   const item=document.createElement("option");item.value=o.key;
   item.textContent=o.label;item.selected=o.key===selected;
   item.disabled=forbidden.has(o.key)&&o.key!==selected;x.append(item);
  }
  x.value=selected;x.onchange=()=>change(x.value);return x;
 }
 function sideControl(side:"A"|"B",values:(ProgrammeRef|null)[]){
  const wrap=element("div","ppw-programme-side");
  wrap.append(element("h3","",side==="A"?"Side A":"Side B"));
  for(const [i,ref] of values.entries()){
   const selected=ref?ref.kind+":"+ref.refId:"";
   const choices=[{key:"",label:"Choose wrestler or team"},...rosterOptions().map(p=>({
    key:p.kind+":"+p.refId,label:p.kind==="TEAM"?"TEAM · "+p.name+" ("+
     (view?.teams.find(t=>t.refId===p.refId)?.memberIds??[])
      .map(id=>view?.people.find(person=>person.refId===id)?.name??"Unknown")
      .join(" & ")+")":p.name}))];
   const others=[...refsA.flatMap((value,index)=>side==="A"&&index===i||!value?[]:[value]),
    ...refsB.flatMap((value,index)=>side==="B"&&index===i||!value?[]:[value])];
   const forbidden=new Set(rosterOptions().filter(p=>!availableProgrammeOption({kind:p.kind,refId:p.refId},others,teamMembers()))
    .map(p=>p.kind+":"+p.refId));
   wrap.append(selector(choices,selected,value=>{
    const found=rosterOptions().find(p=>p.kind+":"+p.refId===value);
    values[i]=found?{kind:found.kind,refId:found.refId}:null;render();
   },forbidden));
   if(ref?.kind==="PERSON"&&port.openWrestler){
    const open=button("View "+name(ref)+"'s dossier ↗",
     ()=>port.openWrestler?.(ref.refId));
    open.className="ppw-programme-file-link";
    wrap.append(open);
   }
  }
  wrap.append(button(values.length===2?"− Remove extra":"+ Add another",()=>{
   if(values.length===2)values.pop();else values.push(null);
   render();
  },working||!view?.canEdit));
  return wrap;
 }
 function face(name:string,personId:string|null):HTMLElement{
  const holder=element("span","ppw-programme-portrait",wrestlerInitials(name));
  if(personId){
   const image=createWrestlerPortrait(name,100,personId);
   if(image){image.alt="";image.loading="lazy";image.onerror=()=>image.remove();
    holder.append(image);}
  }
  return holder;
 }
 function render(){
  root.classList.add("ppw-editor","ppw-programme-desk");
  root.replaceChildren();
  const header=element("header","ppw-top");
  if(onBack)header.append(button("← Back to card",onBack));
  if(port.openArchive)header.append(button("Past results",port.openArchive));
  header.append(element("span","ppw-eyebrow","CREATIVE / STORYLINES"),
   element("h1","",selectedArchiveId?"Rivalry retrospective":
    archiveView?"Past rivalries":"Programmes"));
  root.append(header);
  if(error)root.append(element("p","ppw-alert ppw-error",error));
  if(success)root.append(element("p","ppw-alert ppw-success",success));
  if(!view){root.append(button(working?"Loading…":"Retry",()=>{void reload();},working));return;}
  const active=view.programmes.filter(p=>p.status==="ACTIVE");
  // A dossier route selects the wrestler's real feud, including team
  // participation, rather than displaying the first unrelated programme.
  if(focusPersonId&&!focusResolved){
   focusResolved=true;
   const teams=new Set(view.teams.filter(t=>t.memberIds.includes(focusPersonId))
    .map(t=>t.refId));
   const related=active.find(p=>[...p.sideA,...p.sideB].some(member=>
    (member.kind==="PERSON"&&member.refId===focusPersonId)||
    (member.kind==="TEAM"&&teams.has(member.refId))));
   if(related)selectedProgrammeId=related.programmeId;
   else if(view.canEdit&&view.people.some(p=>p.kind==="PERSON"&&
    p.refId===focusPersonId)){
    refsA=[{kind:"PERSON",refId:focusPersonId}];
    refsB=[null];creationOpen=true;
   }
  }
  const list=element("section","ppw-programme-list");
  if(focusPersonId){
   const wrestler=view.people.find(p=>p.refId===focusPersonId)?.name??
    active.flatMap(p=>[...p.sideA,...p.sideB]).find(p=>
     p.kind==="PERSON"&&p.refId===focusPersonId)?.name;
   if(wrestler)list.append(element("p","ppw-programme-eyebrow",
    "FROM "+wrestler.toUpperCase()+"'S WRESTLER DOSSIER"));
  }
  list.append(element("h2","","Active rivalries · "+active.length));
  if(!active.some(p=>p.programmeId===selectedProgrammeId))
   selectedProgrammeId=active[0]?.programmeId??null;
  // One-tap feud navigation, not four complete rivalry dossiers stacked.
  const overview=element("nav","ppw-programme-switcher");
  overview.setAttribute("aria-label","Choose a feud to manage");
  for(const item of active){
   const name=item.sideA.map(x=>x.name).join(" & ")+" vs "+
    item.sideB.map(x=>x.name).join(" & ");
   const planned=item.plannedActivity?.[0];
   const note=item.finale?.resolvedWeekIndex===null?"Finale planned":
    planned?"Booked · "+planned.showName:
    item.repetition>=55?"Needs a fresh beat":"Next chapter open";
   const pick=button("",()=>{
    selectedProgrammeId=item.programmeId;activeLane="STORY";render();
   },working);
   pick.className="ppw-programme-switch";
   const faces=element("span","ppw-programme-switch-faces");
   for(const member of [item.sideA[0],item.sideB[0]])if(member){
    faces.append(face(member.name,member.kind==="PERSON"?member.refId:null));
   }
   pick.append(faces,element("strong","",name),
    element("span","ppw-programme-switch-sub",
     "Heat "+(item.heat===null?"—":Math.round(item.heat))+" · "+note));
   pick.setAttribute("aria-pressed",String(item.programmeId===selectedProgrammeId));
   pick.setAttribute("aria-label","Manage "+name);
   overview.append(pick);
  }
  list.append(overview);
  for(const p of active.filter(p=>p.programmeId===selectedProgrammeId)){
   const panel=element("article","ppw-programme-card ppw-programme-focused");
   const finaleLane=element("div","ppw-programme-lane");
   const historyLane=element("div","ppw-programme-lane");
   const creativeLane=element("div","ppw-programme-lane");
   const planLane=element("div","ppw-programme-lane");
   const header=element("div","ppw-programme-broadcast");
   const side=(members:typeof p.sideA)=>{
    const column=element("div","ppw-programme-broadcast-side");
    for(const member of members){
     const person=element("div","ppw-programme-hero-person");
     person.append(face(member.name,member.kind==="PERSON"?member.refId:null));
     if(member.kind==="PERSON"&&port.openWrestler){
      const open=button(member.name,()=>port.openWrestler?.(member.refId));
      open.className="ppw-programme-person-link";
      open.setAttribute("aria-label","Open "+member.name+"'s wrestler dossier");
      person.append(open);
     }else person.append(element("span","ppw-programme-person-link",member.name));
     column.append(person);
    }
    return column;
   };
   header.append(side(p.sideA),element("span","ppw-programme-versus","VS"),side(p.sideB));
   const heat=p.heat===null?null:Math.max(0,Math.min(100,p.heat));
   panel.dataset.storyHeat=heat===null?"unrated":heat>=75?"hot":heat>=45?"building":"developing";
   const pulse=element("div","ppw-programme-heat");
   pulse.append(element("span","","RIVALRY HEAT"),
    element("strong","",heat===null?"—":Math.round(heat)+"/100"));
   const track=element("span","ppw-programme-signal-track");
   const fill=element("span","ppw-programme-signal-fill");
   fill.style.width=(heat??0)+"%";track.append(fill);pulse.append(track);
   panel.append(header,pulse);
   // An at-a-glance rivalry briefing, before choosing a management tab.
   // Everything comes from the existing certified workspace projection.
   const glance=element("section","ppw-programme-glance");
   const currentIndex=(view.year-1)*52+view.week-1;
   const ageNow=p.startedWeekIndex===null?null:Math.max(0,currentIndex-p.startedWeekIndex);
   const latestBeat=p.recentActivity[0];
   const lastCertifiedMatch=p.recentActivity.find(x=>x.kind==="MATCH");
   const sideAName=p.sideA.map(x=>x.name).join(" & ");
   const sideBName=p.sideB.map(x=>x.name).join(" & ");
   const latestLabel=latestBeat?describeProgrammeChapter(latestBeat,sideAName,sideBName):null;
   glance.append(element("small","ppw-programme-glance-age",
    (ageNow===null?"Active rivalry":ageNow+" weeks active")+
    (p.championshipId?" · Championship stakes":"")));
   if(latestBeat&&latestLabel){
    const y=Math.floor(latestBeat.weekIndex/52)+1,w=latestBeat.weekIndex%52+1;
    glance.append(element("span","ppw-programme-eyebrow","PREVIOUSLY · Y"+y+" W"+w),
     element("strong","ppw-programme-glance-headline",latestLabel.headline));
   }else glance.append(element("strong","ppw-programme-glance-headline",
    "Opening chapter yet to be booked"));
   const scheduled=p.plannedActivity?.[0];
   if(scheduled)glance.append(element("span","ppw-programme-upcoming-compact",
    "Next · "+(scheduled.kind==="MATCH"?"Match":"Angle")+" on "+scheduled.showName+
    " · "+(scheduled.status==="SUBMITTED"?"Confirmed":"Draft")));
   if(port.openPlanner&&view.canEdit)glance.append(button(
    scheduled?"Review booked chapter":"Book next chapter",()=>port.openPlanner?.(p.programmeId)));
   creativeLane.append(glance);
   const record=element("div","ppw-programme-record");
   for(const [caption,n] of [
    [p.sideA.map(x=>x.name).join(" & ")+" WINS",p.sideAWins],
    [p.sideB.map(x=>x.name).join(" & ")+" WINS",p.sideBWins],
    ["DRAWS",p.draws],["CHAPTERS",p.activityCount]
   ] as const){
    const tile=element("span","ppw-programme-record-item");
    tile.append(element("small","",caption),element("strong","",String(n)));
    record.append(tile);
   }
   historyLane.append(record);
   const payoffPanel=element("section","ppw-programme-finale");
   payoffPanel.append(element("span","ppw-programme-eyebrow","ON-SCREEN RIVALRY PAYOFF"));
   const planned=p.plannedActivity??[];
   const variants=(chapter:typeof planned[number]):{value:ProgrammePayoff;label:string}[]=>{
    if(chapter.kind==="MATCH")return [
     {value:"DECISIVE_MATCH",label:"Decisive final match"},
     ...(chapter.titleMatch?[{value:"TITLE_SHOWDOWN" as const,
      label:"Championship showdown"}]:[]),
     ...(chapter.stipulationMatch?[{value:"STIPULATION_SHOWDOWN" as const,
      label:"Final stipulation match"}]:[])];
    if(["TURN","ATTACK","STABLE_EXIT"].includes(chapter.segmentKind??""))
     return [{value:"BETRAYAL",label:"Betrayal / final attack"}];
    if(chapter.segmentKind==="STABLE_RECONCILIATION")
     return [{value:"RECONCILIATION",label:"Reconciliation"}];
    if(["CONFRONTATION","CHALLENGE","CONTRACT_SIGNING","INTERRUPTION"]
     .includes(chapter.segmentKind??""))
     return [{value:"FINAL_CONFRONTATION",label:"Final confrontation"}];
    return [];
   };
   const eligible=planned.filter(chapter=>variants(chapter).length>0);
   const existing=p.finale;
   if(existing){
    const chosen=planned.find(x=>x.showId===existing.showId&&x.slotId===existing.slotId);
    payoffPanel.append(element("strong","ppw-programme-finale-current",
     existing.resolvedWeekIndex!==null?"Finale delivered":
     "Finale planned · "+(chosen?.showName??"Previously booked show")),
     element("p","ppw-muted",
      existing.payoff.replaceAll("_"," ").toLowerCase()+
      (existing.resolvedWeekIndex===null?
       " · This rivalry remains active until the booked scene is certified.":
       " · Certified and included in your rivalry history.")));
    if(existing.resolvedWeekIndex===null&&!chosen)
     payoffPanel.append(element("p","ppw-programme-finale-warning",
      "The selected chapter is no longer booked in your next six weeks. Choose another, or remove this finale plan."));
   }else payoffPanel.append(element("p","ppw-muted",
    "Choose a specific booked match or angle to end this rivalry on screen. A plan alone never closes the feud."));
   if(view.canEdit&&eligible.length){
    const available=eligible.map(x=>({chapter:x,key:x.showId+"::"+x.slotId}));
    const defaultChapter=available.find(x=>x.chapter.showId===existing?.showId&&
      x.chapter.slotId===existing?.slotId)??available[0]!;
    const prior=finaleChoices.get(p.programmeId);
    const choice=available.find(x=>x.key===prior?.slotKey)??defaultChapter;
    const choices=variants(choice.chapter);
    const payoff=choices.find(x=>x.value===prior?.payoff)?.value??
     (choices.find(x=>x.value===existing?.payoff)?.value??choices[0]!.value);
    const edit={slotKey:choice.key,payoff};finaleChoices.set(p.programmeId,edit);
    const chapterPicker=element("label","ppw-programme-finale-field");
    chapterPicker.append(element("span","","Final chapter"));
    const chapterSelect=document.createElement("select");
    chapterSelect.setAttribute("aria-label","Choose finale chapter for "+
      p.sideA.map(x=>x.name).join(" & ")+" vs "+p.sideB.map(x=>x.name).join(" & "));
    for(const x of available){
     const opt=document.createElement("option");opt.value=x.key;
     opt.textContent=x.chapter.showName+" · Y"+x.chapter.year+
      " W"+x.chapter.week+" · "+(x.chapter.kind==="MATCH"?"Match":
      (x.chapter.segmentKind??"Angle").replaceAll("_"," ").toLowerCase());
     chapterSelect.append(opt);
    }
    chapterSelect.value=choice.key;
    chapterSelect.onchange=()=>{
     const selected=available.find(x=>x.key===chapterSelect.value);
     if(!selected)return;
     finaleChoices.set(p.programmeId,{slotKey:selected.key,
      payoff:variants(selected.chapter)[0]!.value});render();
    };
    chapterPicker.append(chapterSelect);payoffPanel.append(chapterPicker);
    const payoffField=element("label","ppw-programme-finale-field");
    payoffField.append(element("span","","Payoff"));
    const payoffSelect=document.createElement("select");
    payoffSelect.setAttribute("aria-label","Choose rivalry payoff");
    for(const x of choices){
     const opt=document.createElement("option");opt.value=x.value;
     opt.textContent=x.label;payoffSelect.append(opt);
    }
    payoffSelect.value=payoff;
    payoffSelect.onchange=()=>{edit.payoff=payoffSelect.value as ProgrammePayoff;};
    payoffField.append(payoffSelect);payoffPanel.append(payoffField);
    payoffPanel.append(button(existing?"Change finale plan":"Plan on-screen finale",()=>{
     const chosen=available.find(x=>x.key===edit.slotKey);
     if(!chosen)return;
     void run(()=>port.planFinale({requestId:crypto.randomUUID(),
      expectedRevision:view!.worldRevision,programmeId:p.programmeId,
      showId:chosen.chapter.showId,slotId:chosen.chapter.slotId,
      payoff:edit.payoff}),
      "Finale planned. Only the certified event can end this rivalry.");
    },working));
   }else if(view.canEdit)payoffPanel.append(element("p","ppw-muted",
    "No eligible finale booked. Add a match, confrontation, attack, turn or reconciliation to your card first."));
   if(view.canEdit&&existing?.resolvedWeekIndex===null)
    payoffPanel.append(button("Remove planned finale",()=>{
     void run(()=>port.planFinale({requestId:crypto.randomUUID(),
      expectedRevision:view!.worldRevision,programmeId:p.programmeId,
      showId:null,slotId:null,payoff:null}),
      "Finale plan removed. Rivalry remains active.");
    },working));
   finaleLane.append(payoffPanel);
   // The player's decisions and the verified match record form one visible
   // narrative. No suggested outcome is booked or written to the World.
   const continuity=readProgrammeContinuity({
    sideAName:p.sideA.map(x=>x.name).join(" & "),
    sideBName:p.sideB.map(x=>x.name).join(" & "),
    recentActivity:p.recentActivity,latestFollowUp:p.latestFollowUp
   });
   const weekIndex=(view.year-1)*52+view.week-1;
   if(p.recentActivity.length){
    const history=document.createElement("details");
    history.className="ppw-programme-history-timeline";
    history.open=true;
    history.append(element("summary","","Story timeline · "+p.recentActivity.length+" certified chapters"));
    const entries=element("div","ppw-programme-timeline");
    for(const activity of p.recentActivity){
     const year=Math.floor(activity.weekIndex/52)+1;
     const week=activity.weekIndex%52+1;
     const item=element("div","ppw-programme-history-entry");
     const details=element("div","ppw-programme-history-detail");
     const chapter=describeProgrammeChapter(activity,sideAName,sideBName);
     item.dataset.chapter=chapter.kind;
     details.append(element("small","","YEAR "+year+" · WEEK "+week),
      element("strong","",chapter.headline),element("span","",
       chapter.detail+" · Crowd "+Math.round(activity.crowdResponse)));
     item.append(details);
     if(port.openResults){const open=button("View show",()=>port.openResults?.(activity.showId),working);
      open.setAttribute("aria-label","View show for Year "+year+" Week "+week);
      item.append(open);}
     entries.append(item);
    }
    history.append(entries);historyLane.append(history);
   }
   const advice=element("section","ppw-programme-story-actions");
   if(p.plannedActivity?.length)
    advice.append(element("p","ppw-programme-booked-short",
     "Already booked · "+p.plannedActivity[0]!.showName));
   else{
    advice.append(element("h3","","Next chapter"));
    for(const idea of recommendProgrammeAngles(p).slice(0,3)){
     const pick=button(idea.title,()=>port.openPlanner?.(p.programmeId,idea.kind),working);
     advice.append(pick);
    }
   }
   planLane.append(advice);
   const latestMatch=[...p.recentActivity].filter(a=>a.kind==="MATCH").sort((a,b)=>
    b.weekIndex-a.weekIndex||b.showId.localeCompare(a.showId)||
    b.slotId.localeCompare(a.slotId))[0];
   // Retain the original server-authoritative after-match decision, but
   // surface concrete next intentions instead of a nested 'Creative direction'.
   if(latestMatch&&view.canEdit){
    const suggested=suggestProgrammeAdvice({
     heat:p.heat,repetition:p.repetition,activityCount:p.activityCount,
     matchCount:p.matchCount,segmentCount:p.segmentCount,
     sideAWins:p.sideAWins,sideBWins:p.sideBWins,
     championshipId:p.championshipId,sideAName,sideBName,
     direction:p.latestFollowUp?.choice??null,
     directionStatus:continuity.directionKind,
     recentKind:p.recentActivity[0]?.kind==="MATCH"?"MATCH":"SEGMENT",
     recentWinnerSide:latestMatch.winnerSide
    });
    const next=element("section","ppw-programme-decisions");
    next.append(element("h3","","After the Bell"),
     element("p","","Choose what comes next. Your card remains yours to book."));
    const options=element("div","ppw-programme-decision-actions");
    for(const idea of suggested.options){
     const selected=p.latestFollowUp?.choice===idea.choice&&
      p.latestFollowUp.showId===latestMatch.showId&&
      p.latestFollowUp.slotId===latestMatch.slotId;
     const choice=element("div","ppw-programme-decision");
     const action=button(idea.label,()=>void saveDirection(p.programmeId,
      latestMatch.showId,latestMatch.slotId,idea.choice),working||selected);
     action.setAttribute("aria-pressed",String(selected));
     choice.append(action);
     if(selected)choice.append(element("small","ppw-programme-decision-current",
      "Selected"));
     else choice.append(element("small","",idea.plan));
     options.append(choice);
    }
    next.append(options);planLane.append(next);
   }
   if(p.latestFollowUp&&continuity.directionHeadline){
    const record=element("p","ppw-programme-direction-record",
     "Previously: "+continuity.directionHeadline);
    planLane.append(record);
   }
   if((p.eligibleCreativePeople?.length??0)||(p.creativeAgreements?.length??0)){
    const terms=element("details","ppw-programme-standing") as HTMLDetailsElement;
    terms.open=adviceOpen.has(p.programmeId);
    terms.ontoggle=()=>{if(terms.open)adviceOpen.add(p.programmeId);
     else adviceOpen.delete(p.programmeId);};
    terms.append(element("summary","","Creative agreements"));
    for(const person of p.eligibleCreativePeople??[]){
     const prior=p.creativeAgreements?.find(x=>x.personId===person.personId);
     const item=element("div","ppw-programme-standing-row");
     item.append(element("strong","",person.name));
     if(prior){
      // The stored expiry week is EXCLUSIVE: do not advertise a week of
      // permission that the wrestler never granted.
      const finalWeek=prior.expiresWeekIndex-1;
      const when=prior.expiresWeekIndex<=weekIndex?" · Expired":
       " · Through Y"+(Math.floor(finalWeek/52)+1)+
       " W"+(finalWeek%52+1);
      item.append(element("small","",
       (prior.approved?"Agreed":"Declined")+when),
       element("p","ppw-muted",prior.matchType==="SINGLES"?
        "Singles matches":"Tag matches"));
     }else if(view.canEdit){
      const key=p.programmeId+":"+person.personId;
      const proposal=standing.get(key)??{matchType:"SINGLES" as const,
       permittedOutcome:"WIN_ONLY" as const,termWeeks:3};
      standing.set(key,proposal);
      const choose=<T extends string>(label:string,values:readonly T[],
       current:T,onChange:(v:T)=>void)=>{
       const field=element("label","ppw-programme-standing-field");
       field.append(element("span","",label));
       const input=document.createElement("select");
       input.setAttribute("aria-label",label+" for "+person.name);
       input.disabled=working;
       for(const v of values){
        const option=document.createElement("option");
        option.value=v;option.textContent=v==="WIN_ONLY"?"Wins only":
         v==="WIN_OR_PROTECTED_LOSS"?"Wins or protected losses":
         v==="SINGLES"?"Singles":"Tag";
        input.append(option);
       }
       input.value=current;input.onchange=()=>{onChange(input.value as T);};
       field.append(input);return field;
      };
      item.append(choose("Match format",["SINGLES","TAG"] as const,
       proposal.matchType,v=>{proposal.matchType=v;}),
       choose("Permitted finish",["WIN_ONLY","WIN_OR_PROTECTED_LOSS"] as const,
       proposal.permittedOutcome,v=>{proposal.permittedOutcome=v;}));
      const duration=element("label","ppw-programme-standing-field");
      duration.append(element("span","","Agreement weeks"));
      const weeks=document.createElement("input");
      weeks.type="number";weeks.min="1";weeks.max="6";weeks.inputMode="numeric";
      weeks.value=String(proposal.termWeeks);
      weeks.setAttribute("aria-label","Agreement weeks for "+person.name);
      weeks.onchange=()=>{
       const next=Number(weeks.value);
       if(Number.isInteger(next)&&next>=1&&next<=6)proposal.termWeeks=next;
       else weeks.value=String(proposal.termWeeks);
      };
      duration.append(weeks);item.append(duration);
      item.append(button("Ask "+person.name+" about the rivalry",()=>{
       void run(()=>port.standingConsent({
        programmeId:p.programmeId,personId:person.personId,
        matchType:proposal.matchType,
        permittedOutcome:proposal.permittedOutcome,termWeeks:proposal.termWeeks,
        requestId:crypto.randomUUID(),expectedRevision:view!.worldRevision
       }),"The wrestler has considered the proposed rivalry terms.");
      },working));
     }
     terms.append(item);
    }
    for(const prior of (p.creativeAgreements??[]).filter(x=>
     !(p.eligibleCreativePeople??[]).some(y=>y.personId===x.personId))){
     const item=element("p","ppw-programme-standing-note",
      (prior.approved?"Previously agreed":"Previously declined")+
      " · Agreement recorded for a former participant");
     terms.append(item);
    }
    creativeLane.append(terms);
   }
   const retire=document.createElement("details");
   retire.className="ppw-programme-close-without-payoff";
   retire.append(element("summary","","Close without an on-screen payoff"));
   retire.append(element("p","ppw-muted",
    "This archives the rivalry immediately without a final match or scene. For a satisfying ending, plan an on-screen finale instead."));
   retire.append(button("End programme",()=>{
    void run(()=>port.end({requestId:crypto.randomUUID(),
     expectedRevision:view!.worldRevision,programmeId:p.programmeId}),
     "Rivalry concluded");
   },working||!view.canEdit));
   finaleLane.append(retire);
   const views=[
    {key:"STORY",label:"Story",node:creativeLane},
    {key:"PLAN",label:"Plan",node:planLane},
    {key:"PAYOFF",label:p.finale?"Payoff ●":"Payoff",node:finaleLane},
    {key:"HISTORY",label:"History",node:historyLane}
   ] as const;
   const tabs=element("nav","ppw-programme-view-tabs");
   tabs.setAttribute("aria-label","Rivalry workspace");
   for(const lane of views){
    const pick=button(lane.label,()=>{activeLane=lane.key;render();},working);
    pick.className="ppw-programme-view-tab";
    pick.setAttribute("aria-current",activeLane===lane.key?"page":"false");
    tabs.append(pick);
   }
   panel.append(tabs,views.find(x=>x.key===activeLane)!.node);
   list.append(panel);
  }
  if(!active.length)list.append(element("p","ppw-muted","No active rivalries. Start a story below."));
  if(!archiveView)root.append(list);
  if(view.canEdit&&!archiveView){
   const creation=element("section","ppw-programme-create");
   creation.append(element("h2","","Start a programme"),
    element("p","ppw-muted","Choose one or two wrestlers or teams on each side."));
   creation.append(sideControl("A",refsA),sideControl("B",refsB));
   if(view.championships.length){
    const box=element("label","ppw-field");
    box.append(element("span","","Championship (optional)"),
     selector([{key:"",label:"No championship"},
      ...view.championships.map(t=>({key:t.championshipId,label:t.name}))],
      titleId??"",x=>{titleId=x||null;render();}));
    creation.append(box);
   }
   const a=refsA.filter((x):x is ProgrammeRef=>!!x);
   const b=refsB.filter((x):x is ProgrammeRef=>!!x);
   const overlap=programmeOverlaps(allSelected(),teamMembers());
   if(overlap)creation.append(element("p","ppw-alert ppw-error",
    "This rivalry uses a wrestler more than once. Check singles and established team selections."));
   creation.append(button(working?"Saving…":"Start rivalry",()=>{
    void run(()=>port.start({requestId:crypto.randomUUID(),
     expectedRevision:view!.worldRevision,sideA:a,sideB:b,
     championshipId:titleId}),"New programme started");
   },working||overlap||a.length!==refsA.length||b.length!==refsB.length||
      !a.length||!b.length));
   const createDetails=document.createElement("details");
   createDetails.className="ppw-programme-create-fold";
   createDetails.open=creationOpen;
   createDetails.ontoggle=()=>{
    if(createDetails.isConnected)creationOpen=createDetails.open;
   };
   const title=element("summary","","+ Start a new rivalry");
   // Record the open state before a selection re-renders the creation form.
   // Native details.toggle is asynchronous and may not fire until after the
   // original element has been detached on the first roster selection.
   title.onclick=()=>{creationOpen=!createDetails.open;};
   createDetails.append(title,creation);
   root.append(createDetails);
  }
  const concluded=view.programmes.filter(p=>p.status!=="ACTIVE");
  if(concluded.length&&!archiveView){
   const portal=button("Past rivalries · "+concluded.length,()=>{
    archiveView=true;selectedArchiveId=null;render();
   },working);
   portal.className="ppw-programme-past-entry";
   root.append(portal);
  }
  if(archiveView){
   const history=element("section","ppw-programme-history");
   history.append(button(selectedArchiveId?"← Past rivalries":"← Active rivalries",()=>{
    if(selectedArchiveId)selectedArchiveId=null;
    else archiveView=false;
    render();
   },working));
   if(selectedArchiveId){
    history.classList.add("ppw-programme-retrospective");
   }else{
    history.append(element("h2","","Past rivalries · "+concluded.length));
    for(const item of concluded){
     const label=item.sideA.map(x=>x.name).join(" & ")+" vs "+
      item.sideB.map(x=>x.name).join(" & ");
     const open=button(label,()=>{
      selectedArchiveId=item.programmeId;render();
     },working);
     open.className="ppw-programme-archive-open";
     open.append(element("small","",item.endedWeekIndex===null?"Concluded":
      "Closed · Year "+(Math.floor(item.endedWeekIndex/52)+1)+
      " Week "+(item.endedWeekIndex%52+1)));
     history.append(open);
    }
   }
   for(const p of concluded.filter(x=>x.programmeId===selectedArchiveId)){
    const aName=p.sideA.map(x=>x.name).join(" & ");
    const bName=p.sideB.map(x=>x.name).join(" & ");
    const archive=document.createElement("article");
    archive.className="ppw-programme-archive-card";
    const heading=element("header","ppw-programme-archive-hero");
    const duel=element("div","ppw-programme-archive-duel");
    const side=(members:typeof p.sideA,names:string)=>{
     const group=element("div","ppw-programme-archive-side");
     const faces=element("div","ppw-programme-archive-faces");
     for(const member of members.slice(0,3))
      faces.append(face(member.name,member.kind==="PERSON"?member.refId:null));
     group.append(faces,element("strong","",names));
     return group;
    };
    duel.append(side(p.sideA,aName),element("span","ppw-programme-archive-vs","VS"),
     side(p.sideB,bName));
    heading.append(duel,element("small","",p.endedWeekIndex==null?
     "Concluded rivalry":"Ended · Year "+(Math.floor(p.endedWeekIndex/52)+1)+
      " Week "+(p.endedWeekIndex%52+1)));
    archive.append(heading);
    const rating=evaluateProgrammeReview({heat:p.heat,
     repetition:p.repetition,matchCount:p.matchCount,
     segmentCount:p.segmentCount,finaleCompleted:p.finale?.resolvedWeekIndex!=null,
     finaleCrowd:p.finale?.resolvedCrowdResponse??null});
    const stars=Math.max(1,Math.min(5,Math.round(rating.score/20)));
    const review=element("div","ppw-programme-feud-review");
    const graphic=element("strong","ppw-programme-feud-stars","★".repeat(stars)+"☆".repeat(5-stars));
    graphic.setAttribute("aria-label",stars+" out of five stars");
    review.append(graphic,element("span","",stars+"/5 · Grade "+rating.grade),element("small","",rating.verdict));
    archive.append(review);
    if((p.wrestlerChanges?.length??0)>0){
     const impact=element("div","ppw-programme-impact");
     for(const person of p.wrestlerChanges){
      const change=(before:number|null,after:number|null)=>before===null||after===null?
       "Not recorded":before+" → "+after+" ("+(after-before>=0?"+":"")+
        Math.round(after-before)+")";
      impact.append(element("p","",
       person.name+" · Popularity "+change(person.beforePopularity,person.afterPopularity)+
       " · Momentum "+change(person.beforeMomentum,person.afterMomentum)));
     }
     archive.append(impact);
    }else archive.append(element("small","ppw-muted",
     "Starting wrestler attributes were not recorded for this older feud."));
    archive.append(element("p","ppw-programme-archive-score",
     aName+" "+p.sideAWins+" — "+p.sideBWins+" "+bName+
     (p.draws?" · "+p.draws+" draw"+(p.draws===1?"":"s"):"")),
     element("p","ppw-programme-archive-beats",
      p.matchCount+" in-ring "+(p.matchCount===1?"meeting":"meetings")+
      " · "+p.segmentCount+" on-screen "+(p.segmentCount===1?"chapter":"chapters")));
    const outcome=readProgrammeContinuity({sideAName:aName,sideBName:bName,
     recentActivity:p.recentActivity,latestFollowUp:p.latestFollowUp});
    if(outcome.lastBell)
     archive.append(element("p","ppw-programme-archive-final-bell",outcome.lastBell));
    if(p.finale?.resolvedWeekIndex!=null){
     const f=p.finale;
     const week=f.resolvedWeekIndex!;
     const when="Year "+(Math.floor(week/52)+1)+
      " · Week "+(week%52+1);
     archive.append(element("p","ppw-programme-archive-payoff",
      "ON-SCREEN PAYOFF · "+f.payoff.replaceAll("_"," ")+
      " · "+when+
      (f.resolvedWinnerSide?" · Side "+f.resolvedWinnerSide+" prevailed":"")));
    }
    if(p.recentActivity.length){
     archive.append(element("h3","","On-screen history"));
     const timeline=element("div","ppw-programme-archive-timeline");
     for(const activity of [...p.recentActivity].reverse()){
      const item=element("div","ppw-programme-archive-event");
      const description=describeProgrammeChapter(activity,aName,bName);
      const when="Y"+(Math.floor(activity.weekIndex/52)+1)+
       " W"+(activity.weekIndex%52+1);
      item.append(element("small","",when+" · "+
       (activity.kind==="MATCH"?"Match":"Angle")),
       element("strong","",description.headline),
       element("span","",description.detail+" · Crowd "+Math.round(activity.crowdResponse)));
      if(port.openResults)item.append(button("View show",()=>port.openResults?.(activity.showId)));
      timeline.append(item);
     }
     archive.append(timeline);
     if(p.activityCount>p.recentActivity.length)
      archive.append(element("small","ppw-programme-archive-limit",
       "Showing the latest "+p.recentActivity.length+" recorded chapters."));
    }
    history.append(archive);
   }
   root.append(history);
  }
 }
 void reload();
 return {refresh:reload};
}
