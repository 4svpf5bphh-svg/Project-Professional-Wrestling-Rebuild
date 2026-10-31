/** Mobile PPW feud desk. Uses server-validated original programme sides.
 * No World-wide data, auto-submission, or mandatory flow.
 */
import type {readProgrammeWorkspace,ProgrammeDirectionChoice,ProgrammePayoff} from "../db/programme-workspace.js";
import {readProgrammeTrajectory} from "../domain/programme-trajectory.js";
import {readProgrammeContinuity} from "../domain/programme-continuity.js";
import type {ProgrammeRef} from "../domain/programme-lifecycle.js";
import {programmeOverlaps,availableProgrammeOption} from "../domain/programme-selector.js";
import {suggestProgrammeAdvice} from "./programme-staff-advice.js";
import {recommendProgrammeAngles} from "../domain/programme-angle-recommendations.js";
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
 openPlanner?():void;
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
 onBack?:()=>void){
 let view:ProgrammeView|null=null,working=false,error="",success="";

 let refsA:(ProgrammeRef|null)[]=[null],refsB:(ProgrammeRef|null)[]=[null];
 let titleId:string|null=null;
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
  working=true;error="";success="";
  // Do not reset an unrelated rivalry the booker may be setting up.
  try{
   const result=await port.chooseDirection({programmeId,showId,slotId,choice,
    requestId:crypto.randomUUID(),expectedRevision:view.worldRevision});
   if(result&&typeof result==="object"&&"status" in result&&
    (result as {status:unknown}).status==="STALE")
    throw new Error("Another decision was made. Review the latest rivalry before proceeding.");
   view=await port.load();
   success="The creative direction is recorded. Your next card is still yours to book.";
  }catch(e){error=e instanceof Error?e.message:"Could not save creative direction";}
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
 function render(){
  root.classList.add("ppw-editor","ppw-programme-desk");
  root.replaceChildren();
  const header=element("header","ppw-top");
  if(onBack)header.append(button("← Back to card",onBack));
  if(port.openArchive)header.append(button("Past results",port.openArchive));
  header.append(element("span","ppw-eyebrow","CREATIVE / STORYLINES"),
   element("h1","","Programmes"),
   element("p","ppw-muted","Turn grudges into rivalries. Choose the people involved, then build their story through matches and confrontations."));
  root.append(header);
  if(error)root.append(element("p","ppw-alert ppw-error",error));
  if(success)root.append(element("p","ppw-alert ppw-success",success));
  if(!view){root.append(button(working?"Loading…":"Retry",()=>{void reload();},working));return;}
  const active=view.programmes.filter(p=>p.status==="ACTIVE");
  const list=element("section","ppw-programme-list");
  list.append(element("h2","","Active rivalries · "+active.length));
  for(const p of active){
   const panel=element("article","ppw-programme-card");
   const header=element("div","ppw-programme-broadcast");
   const side=(members:typeof p.sideA)=>{
    const column=element("div","ppw-programme-broadcast-side");
    members.forEach((member,index)=>{
     if(index)column.append(element("span","ppw-programme-separator"," & "));
     if(member.kind==="PERSON"&&port.openWrestler){
      const open=button(member.name,()=>port.openWrestler?.(member.refId));
      open.className="ppw-programme-person-link";
      open.setAttribute("aria-label","Open "+member.name+"'s wrestler dossier");
      column.append(open);
     }else column.append(element("span","",member.name));
    });
    return column;
   };
   header.append(side(p.sideA),element("span","ppw-programme-versus","VS"),side(p.sideB));
   const heat=p.heat===null?null:Math.max(0,Math.min(100,p.heat));
   panel.dataset.storyHeat=heat===null?"unrated":heat>=75?"hot":heat>=45?"building":"developing";
    const pulse=element("div","ppw-programme-signals");
   for(const [caption,value,percent] of [
    ["HEAT",heat===null?"NOT RATED":Math.round(heat)+"/100",heat??0],
    ["REPETITION",Math.round(p.repetition).toString(),Math.max(0,Math.min(100,p.repetition))]
   ] as const){
    const tile=element("div","ppw-programme-signal");
    tile.append(element("small","",caption),element("strong","",value));
    const track=element("span","ppw-programme-signal-track");
    const bar=element("span","ppw-programme-signal-fill");
    bar.style.width=percent+"%";track.append(bar);tile.append(track);pulse.append(tile);
   }
   panel.append(element("span","ppw-programme-eyebrow",
    "STORIES IN MOTION · "+(heat===null?"AWAITING FIRST CROWD REACTION":
     heat>=75?"HOT PROGRAMME":heat>=45?"BUILDING MOMENTUM":"STORY DEVELOPING")),
    header,pulse);
   const record=element("div","ppw-programme-record");
   for(const [caption,n] of [
    [p.sideA.map(x=>x.name).join(" & ")+" WINS",p.sideAWins],
    [p.sideB.map(x=>x.name).join(" & ")+" WINS",p.sideBWins],
    ["MATCHES",p.matchCount],["ANGLES",p.segmentCount],
    ["DRAWS",p.draws],["BEATS",p.activityCount]
   ] as const){
    const tile=element("span","ppw-programme-record-item");
    tile.append(element("small","",caption),element("strong","",String(n)));
    record.append(tile);
   }
   panel.append(record);
   const trajectory=readProgrammeTrajectory({
    heat:p.heat,repetition:p.repetition,activityCount:p.activityCount,
    matchCount:p.matchCount,segmentCount:p.segmentCount,
    sideAWins:p.sideAWins,sideBWins:p.sideBWins
   });
   const chapter=element("section","ppw-programme-chapter");
   chapter.dataset.kind=trajectory.kind.toLowerCase();
   chapter.append(element("strong","",trajectory.title),
    element("p","",trajectory.summary));
   panel.append(chapter);
   // Put the next useful booking decision BEFORE the detailed records.
   // Only already-read programme facts contribute; no model/Neon request.
   const ideas=recommendProgrammeAngles(p);
   const next=element("section","ppw-programme-quick-next");
   next.append(element("span","ppw-programme-eyebrow","NEXT CHAPTER · CREATIVE SUGGESTION"),
    element("strong","",ideas[0]!.title+" · "+ideas[0]!.kind.replaceAll("_"," ").toLowerCase()),
    element("p","",ideas[0]!.reason));
   const scheduled=p.plannedActivity?.[0];
   const followThrough=element("div","ppw-programme-upcoming");
   followThrough.append(element("strong","",
    scheduled?"Already booked · "+scheduled.showName:
     "Not booked yet · Your next chapter is open"));
   if(scheduled)followThrough.append(element("span","",
    "Y"+scheduled.year+" W"+scheduled.week+" · "+
    (scheduled.kind==="MATCH"?"Match":"Angle")+" · "+
    (scheduled.status==="SUBMITTED"?"Confirmed card":"Draft card")));
   else followThrough.append(element("span","",
    "Use the suggested angle or book your own idea. Only certified shows advance the story."));
   next.append(followThrough);
   if((p.plannedActivity?.length??0)>1){
    const upcoming=document.createElement("details");
    upcoming.className="ppw-programme-upcoming-list";
    upcoming.append(element("summary","",
     "Other planned chapters · "+(p.plannedActivity.length-1)));
    for(const item of p.plannedActivity.slice(1))
     upcoming.append(element("p","",
      item.showName+" · Y"+item.year+" W"+item.week+
      " · "+(item.kind==="MATCH"?"Match":"Angle")+
      " · "+(item.status==="SUBMITTED"?"Confirmed":"Draft")));
    next.append(upcoming);
   }
   if(port.openPlanner)next.append(button(
    scheduled?"Review booked rivalry chapter →":"Choose a rivalry angle in the card →",
    port.openPlanner));
   next.append(element("small","ppw-muted",
    "Draft and confirmed cards aren't completed history. The show must resolve for the rivalry to advance."));
   panel.append(next);
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
   panel.append(payoffPanel);
   // The player's decisions and the verified match record form one visible
   // narrative. No suggested outcome is booked or written to the World.
   const continuity=readProgrammeContinuity({
    sideAName:p.sideA.map(x=>x.name).join(" & "),
    sideBName:p.sideB.map(x=>x.name).join(" & "),
    recentActivity:p.recentActivity,latestFollowUp:p.latestFollowUp
   });
   if(continuity.latestChapter){
    const latest=element("section","ppw-programme-last-chapter");
    latest.append(element("span","ppw-programme-eyebrow","PREVIOUSLY ON THIS RIVALRY"),
     element("strong","",continuity.latestChapter));
    if(continuity.lastBell)latest.append(element("p","",continuity.lastBell));
    panel.append(latest);
   }
   const weekIndex=(view.year-1)*52+view.week-1;
   const age=p.startedWeekIndex===null?null:Math.max(0,weekIndex-p.startedWeekIndex);
   panel.append(element("p","ppw-programme-age",
    (age===null?"Origin not recorded":age===0?"Launched this week":
      age+" week"+(age===1?"":"s")+" active")+
    (p.championshipId?" · Championship stakes":"")));
   if(p.recentActivity.length){
    const history=document.createElement("details");
    const header=document.createElement("summary");
    header.textContent="Recent show history · "+p.recentActivity.length;
    history.append(header);
    for(const activity of p.recentActivity){
     const week=Math.floor(activity.weekIndex/52)+1;
     const number=activity.weekIndex%52+1;
     const item=element("div","ppw-programme-history-entry");
     item.append(element("span","ppw-muted",
      "Year "+week+" · Week "+number+" · "+
      (activity.kind==="MATCH"?"Match":"Angle")+" · Crowd "+
      Math.round(activity.crowdResponse)+
      (activity.kind==="MATCH"&&activity.winnerSide==="A"?
       " · "+p.sideA.map(x=>x.name).join(" & ")+" won":
       activity.kind==="MATCH"&&activity.winnerSide==="B"?
       " · "+p.sideB.map(x=>x.name).join(" & ")+" won":"")));
     if(port.openResults)item.append(button("Open show results",()=>{
      port.openResults?.(activity.showId);
     },working));
     history.append(item);
    }
    panel.append(history);
   }
   // Optional creative guidance from the already-loaded immutable rivalry
   // record. Nothing is auto-booked or requested from the model.
   const advice=element("section","ppw-programme-staff");
   const ask=button(adviceOpen.has(p.programmeId)?"Hide creative notes":"Ask Creative · what next?",()=>{
    if(adviceOpen.has(p.programmeId))adviceOpen.delete(p.programmeId);
    else adviceOpen.add(p.programmeId);
    render();
   });
   ask.setAttribute("aria-expanded",String(adviceOpen.has(p.programmeId)));
   advice.append(ask);
   if(adviceOpen.has(p.programmeId)){
    const latest=[...p.recentActivity].sort((a,b)=>
     b.weekIndex-a.weekIndex||b.showId.localeCompare(a.showId))[0];
    const note=suggestProgrammeAdvice({heat:p.heat,repetition:p.repetition,
     activityCount:p.activityCount,matchCount:p.matchCount,
     segmentCount:p.segmentCount,sideAWins:p.sideAWins,
     sideBWins:p.sideBWins,championshipId:p.championshipId,
     sideAName:p.sideA.map(x=>x.name).join(" & "),
     sideBName:p.sideB.map(x=>x.name).join(" & "),
     direction:p.latestFollowUp?.choice??null,directionStatus:continuity.directionKind,
     recentKind:latest?.kind==="MATCH"?"MATCH":latest?.kind==="SEGMENT"?"SEGMENT":null});
    const sheet=element("div","ppw-programme-staff-note");
    sheet.append(element("span","ppw-programme-eyebrow","CREATIVE DESK · OPTIONAL"),
     element("h3","",note.headline),
     element("p","",note.observation),
     element("p","ppw-programme-staff-suggestion",
      note.suggestion),
     element("small","ppw-muted","From this rivalry's existing verified record. You control the booking."));
    const ideas=element("div","ppw-programme-booking-ideas");
    for(const idea of note.options){
     const item=element("article","ppw-programme-booking-idea");
     item.append(element("strong","",idea.label),element("p","",idea.plan));
     ideas.append(item);
    }
    sheet.append(element("span","ppw-programme-eyebrow","THREE NEXT-CARD OPTIONS"),ideas);
    if(port.openPlanner)sheet.append(button("Open show planner →",port.openPlanner));
    advice.append(sheet);
   }
   panel.append(advice);
   const latestMatch=[...p.recentActivity].filter(x=>x.kind==="MATCH").sort((a,b)=>
    b.weekIndex-a.weekIndex||b.showId.localeCompare(a.showId)||
    b.slotId.localeCompare(a.slotId))[0];
   if(latestMatch||p.latestFollowUp){
    const direction=element("section","ppw-programme-next");
    direction.append(element("span","ppw-programme-eyebrow","AFTER THE BELL"),
     element("h3","","Where does this rivalry go next?"));
    if(p.latestFollowUp){
     if(continuity.directionHeadline){
      const status=element("div","ppw-programme-follow-through");
      status.dataset.status=continuity.directionKind.toLowerCase();
      status.append(element("strong","",continuity.directionHeadline),
       element("p","",continuity.directionSummary??""));
      direction.append(status);
     }
     const label=p.latestFollowUp.choice==="PURSUE_REMATCH"?
      "Pursue a rematch":p.latestFollowUp.choice==="PLAN_RETALIATION"?
      "Plan retaliation":"Let the result stand";
     const chosen=element("p","ppw-programme-direction-chosen",
      "Last direction: "+label+" · Year "+
      (Math.floor(p.latestFollowUp.weekIndex/52)+1)+" Week "+
      (p.latestFollowUp.weekIndex%52+1));
     direction.append(chosen);
     if(latestMatch&&(p.latestFollowUp.showId!==latestMatch.showId||
      p.latestFollowUp.slotId!==latestMatch.slotId))
      direction.append(element("p","ppw-programme-direction-note",
       "A newer match has taken place. Decide whether to continue the issue or change course."));
    }
    if(p.latestFollowUp){
     const elapsed=Math.max(0,weekIndex-p.latestFollowUp.weekIndex);
     const pending=["PENDING_REMATCH","PENDING_RETALIATION","BUILDING_REMATCH"].includes(continuity.directionKind);
     direction.append(element("p","ppw-programme-direction-note",
      (pending?"Still open":"Progress recorded")+" · "+elapsed+" week"+(elapsed===1?"":"s")+
      " since your decision. "+(continuity.suggestion??"Choose a relevant next card.")));
    }else direction.append(element("p","ppw-programme-direction-note",
     "Your choice becomes a continuing creative thread; a future certified chapter records whether you followed through."));
    if(latestMatch&&view.canEdit){
     const choices=element("div","ppw-programme-directions");
     for(const [choice,title,note] of [
      ["PURSUE_REMATCH","Rematch","Set up a return bout"],
      ["PLAN_RETALIATION","Retaliation","Build toward a confrontation"],
      ["LET_STAND","Let it stand","Leave the finish as it was"]
     ] as const){
      const active=p.latestFollowUp?.choice===choice&&
       p.latestFollowUp.showId===latestMatch.showId&&
       p.latestFollowUp.slotId===latestMatch.slotId;
      const pick=button(title,()=>void saveDirection(p.programmeId,
       latestMatch.showId,latestMatch.slotId,choice),working);
      pick.setAttribute("aria-pressed",String(active));
      pick.title=note;
      choices.append(pick);
     }
     direction.append(choices);
    }else if(latestMatch&&!view.canEdit)
     direction.append(element("p","ppw-programme-direction-note",
      "The card deadline has passed. Creative decisions reopen next week."));
    direction.append(element("small","ppw-muted",
     "No bout or angle is booked for you. Choose and save the actual card separately."));
    if(port.openPlanner)direction.append(button("Plan the next show →",port.openPlanner));
    panel.append(direction);
   }
   if((p.eligibleCreativePeople?.length??0)||(p.creativeAgreements?.length??0)){
    const terms=element("section","ppw-programme-standing");
    terms.append(element("h3","","Match agreements"),
     element("p","ppw-muted",
      "Agree a short run of bouts without seeking fresh permission every week. The wrestlers keep their agreed protections."));
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
    panel.append(terms);
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
   panel.append(retire);
   list.append(panel);
  }
  if(!active.length)list.append(element("p","ppw-muted","No active rivalries. Start a story below."));
  root.append(list);
  if(view.canEdit){
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
   root.append(creation);
  }
  const concluded=view.programmes.filter(p=>p.status!=="ACTIVE").slice(0,15);
  if(concluded.length){
   const history=element("section","ppw-programme-history");
   history.append(element("h2","","Recently concluded"),
    element("p","ppw-muted","Completed feuds remain part of your promotion's story. Scores and chapters come from certified broadcasts."));
   for(const p of concluded){
    const aName=p.sideA.map(x=>x.name).join(" & ");
    const bName=p.sideB.map(x=>x.name).join(" & ");
    const archive=document.createElement("details");
    archive.className="ppw-programme-archive-card";
    const heading=document.createElement("summary");
    heading.append(element("strong","",aName+" vs "+bName),
     element("small","",p.endedWeekIndex==null?"Completed rivalry":
      "Closed · Year "+(Math.floor(p.endedWeekIndex/52)+1)+
      " Week "+(p.endedWeekIndex%52+1)));
    archive.append(heading);
    archive.append(element("p","ppw-programme-archive-score",
     aName+" "+p.sideAWins+" — "+p.sideBWins+" "+bName+
     (p.draws?" · "+p.draws+" draw"+(p.draws===1?"":"s"):"")),
     element("p","ppw-programme-archive-beats",
      p.matchCount+" in-ring "+(p.matchCount===1?"meeting":"meetings")+
      " · "+p.segmentCount+" on-screen "+(p.segmentCount===1?"chapter":"chapters")));
    const chapter=readProgrammeContinuity({sideAName:aName,sideBName:bName,
     recentActivity:p.recentActivity,latestFollowUp:p.latestFollowUp});
    if(chapter.lastBell)archive.append(element("p","",chapter.lastBell));
    if(chapter.latestChapter)archive.append(element("p","",chapter.latestChapter));
    const last=p.recentActivity[0];
    if(last&&port.openResults)archive.append(button("Revisit the final chapter →",()=>{
     port.openResults?.(last.showId);
    }));
    history.append(archive);
   }
   root.append(history);
  }
 }
 void reload();
 return {refresh:reload};
}
