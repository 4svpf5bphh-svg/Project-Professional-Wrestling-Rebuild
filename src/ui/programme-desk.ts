import {createChoiceDialog} from "./choice-dialog.js";
import {activateWorkspaceRoot} from "./workspace-root.js";
/** Mobile PPW feud desk. Uses server-validated original programme sides.
 * No World-wide data, auto-submission, or mandatory flow.
 */
import type {readProgrammeWorkspace,ProgrammeDirectionChoice,ProgrammePayoff} from "../db/programme-workspace.js";
import {readProgrammeContinuity} from "../domain/programme-continuity.js";
import {STORY_BLUEPRINTS,type BlueprintFamily} from "../domain/story-blueprints.js";
import {STORY_FOLLOW_UPS,storyFollowUpBrief} from "../domain/programme-story-follow-up.js";
import {defaultProgrammeCreativeIntent,type ProgrammeCreativeIntent}
 from "../domain/programme-creative-intent.js";
import {eligibleProgrammePayoffs,PROGRAMME_PAYOFFS}
 from "../domain/programme-finales.js";
import {PROGRAMME_FORMATS,type ProgrammeRef,type ProgrammeFormat}
 from "../domain/programme-lifecycle.js";
import {programmeOverlaps,availableProgrammeOption} from "../domain/programme-selector.js";
import {evaluateProgrammeReview} from "../domain/programme-review.js";
import {suggestProgrammeAdvice} from "./programme-staff-advice.js";
import {recommendProgrammeAngles,type ProgrammeAngleIdea} from "../domain/programme-angle-recommendations.js";
import {describeProgrammeChapter} from "./programme-chapter-summary.js";
import {readProgrammeCrowdTrend} from "../domain/programme-crowd-trend.js";
import {recommendProgrammeBlueprintBeat}
 from "../domain/programme-blueprint-advice.js";
import {describeWrestlerStory} from "../domain/programme-story-spine.js";
import {createWrestlerPortrait} from "./wrestler-portrait.js";
import {wrestlerInitials} from "./wrestler-card.js";
export type ProgrammeView=Awaited<ReturnType<typeof readProgrammeWorkspace>>;
export interface ProgrammeDeskPort{
 load():Promise<ProgrammeView>;
 start(input:{requestId:string;expectedRevision:number;
  sideA:ProgrammeRef[];sideB:ProgrammeRef[];programmeFormat:ProgrammeFormat;
  championshipId:string|null}):Promise<unknown>;
 end(input:{requestId:string;expectedRevision:number;programmeId:string}):Promise<unknown>;
 saveCreativeIntent(input:{requestId:string;expectedRevision:number;
  programmeId:string;creativeIntent:ProgrammeCreativeIntent|null}):Promise<unknown>;
 planFinale(input:{requestId:string;expectedRevision:number;programmeId:string;
  showId:string|null;slotId:string|null;payoff:ProgrammePayoff|null}):Promise<unknown>;
 chooseDirection(input:{requestId:string;expectedRevision:number;programmeId:string;
  showId:string;slotId:string;choice:ProgrammeDirectionChoice}):Promise<unknown>;
 standingConsent(input:{requestId:string;expectedRevision:number;programmeId:string;
  personId:string;matchType:"SINGLES"|"TAG";
  permittedOutcome:"WIN_ONLY"|"WIN_OR_PROTECTED_LOSS";termWeeks:number}):Promise<unknown>;
 openPlanner?(programmeId?:string,ideaKind?:ProgrammeAngleIdea["kind"],
  blueprintBeat?:{blueprintId:string;beatId:string},
  bookedDraft?:{draftId:string;year:number;week:number}):void;
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
 onBack?:()=>void,focusPersonId?:string,focusOpponentId?:string,focusProgrammeId?:string,
 focusLane?:"PLAN"){
 let view:ProgrammeView|null=null,working=false,error="",success="";

 let refsA:(ProgrammeRef|null)[]=[null],refsB:(ProgrammeRef|null)[]=[null];
 let newFormat:ProgrammeFormat="RIVALRY";
 let titleId:string|null=null;
 let selectedProgrammeId:string|null=null;
 let activeLane:"PAYOFF"|"HISTORY"|"STORY"|"PLAN"="STORY";
 let selectedArchiveId:string|null=null;
 let archiveView=false;
 let creationOpen=false,focusResolved=false,focusWarning="";
 const adviceOpen=new Set<string>();
 const storyDrafts=new Map<string,ProgrammeCreativeIntent>();
 const storyPickerOpen=new Set<string>();
 const finaleChoices=new Map<string,{slotKey:string;payoff:ProgrammePayoff}>();
 const standing=new Map<string,{matchType:"SINGLES"|"TAG";
  permittedOutcome:"WIN_ONLY"|"WIN_OR_PROTECTED_LOSS";termWeeks:number}>();
 function rosterOptions(){
  return view?[...view.people,...view.teams]:[];
 }
 const teamMembers=()=>new Map((view?.teams??[]).map(t=>[t.refId,t.memberIds]));
 const storyKind=(p:ProgrammeView["programmes"][number])=>p.programmeFormat??"RIVALRY";
 const storyLabel=(p:ProgrammeView["programmes"][number])=>{
  const a=p.sideA.map(x=>x.name).join(" & ");
  return storyKind(p)==="RIVALRY"?a+" vs "+p.sideB.map(x=>x.name).join(" & "):
   a+" · "+PROGRAMME_FORMATS[storyKind(p)].label;
 };
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
   view=await port.load();success=result;refsA=[null];refsB=[null];
   newFormat="RIVALRY";titleId=null;
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
 function sideControl(side:"A"|"B",values:(ProgrammeRef|null)[]){
  const wrap=element("div","ppw-programme-side");
  wrap.append(element("h3","",newFormat==="RIVALRY"?
   side==="A"?"Side A":"Side B":"Characters in this story"));
  for(const [i,ref] of values.entries()){
   const selected=ref?ref.kind+":"+ref.refId:"";
   const choices=[{key:"",label:newFormat==="RIVALRY"?
    "Choose wrestler or team":"Choose wrestler"},
    ...rosterOptions().filter(p=>newFormat==="RIVALRY"||p.kind==="PERSON").map(p=>({
    key:p.kind+":"+p.refId,label:p.kind==="TEAM"?"TEAM · "+p.name+" ("+
     (view?.teams.find(t=>t.refId===p.refId)?.memberIds??[])
      .map(id=>view?.people.find(person=>person.refId===id)?.name??"Unknown")
      .join(" & ")+")":p.name}))];
   const others=[...refsA.flatMap((value,index)=>side==="A"&&index===i||!value?[]:[value]),
    ...refsB.flatMap((value,index)=>side==="B"&&index===i||!value?[]:[value])];
   const forbidden=new Set(rosterOptions().filter(p=>!availableProgrammeOption({kind:p.kind,refId:p.refId},others,teamMembers()))
    .map(p=>p.kind+":"+p.refId));
   const label=newFormat==="RIVALRY"?"Side "+side+" participant "+(i+1):
    "Story participant "+(i+1);
   wrap.append(createChoiceDialog(label,selected,choices.map(choice=>({
    value:choice.key,label:choice.label,
    disabled:forbidden.has(choice.key)&&choice.key!==selected
   })),value=>{
    const found=rosterOptions().find(p=>p.kind+":"+p.refId===value);
    values[i]=found?{kind:found.kind,refId:found.refId}:null;render();
    const trigger=[...root.querySelectorAll<HTMLButtonElement>(".ppw-choice-trigger")]
     .find(button=>button.getAttribute("aria-label")?.startsWith(label+" · "));
    trigger?.focus({preventScroll:true});
   },working||!view?.canEdit));
   if(ref?.kind==="PERSON"&&port.openWrestler){
    const open=button("View "+name(ref)+"'s dossier ↗",
     ()=>port.openWrestler?.(ref.refId));
    open.className="ppw-programme-file-link";
    wrap.append(open);
   }
  }
  const {minimum,maximum}=PROGRAMME_FORMATS[newFormat];
  // A multi-character story is not forced to use the maximum cast. Players
  // must be able to ADD or REMOVE at intermediate counts, before saving.
  if(values.length<maximum)wrap.append(button("+ Add another",()=>{
   values.push(null);render();
  },working||!view?.canEdit));
  if(values.length>minimum)wrap.append(button("− Remove extra",()=>{
   values.pop();render();
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
  activateWorkspaceRoot(root,"ppw-programme-desk");
  root.replaceChildren();
  const header=element("header","ppw-top");
  if(onBack)header.append(button("← Back to card",onBack));
  if(port.openArchive)header.append(button("Past results",port.openArchive));
  header.append(element("span","ppw-eyebrow","CREATIVE / STORYLINES"),
   element("h1","",selectedArchiveId?(
    view?.programmes.some(p=>p.programmeId===selectedArchiveId&&
     (p.programmeFormat??"RIVALRY")!=="RIVALRY")?
     "Story retrospective":"Rivalry retrospective"):
    archiveView?"Past stories":"Programmes"));
  root.append(header);
  if(error)root.append(element("p","ppw-alert ppw-error",error));
  if(success)root.append(element("p","ppw-alert ppw-success",success));
  if(!view){root.append(button(working?"Loading…":"Retry",()=>{void reload();},working));return;}
  const active=view.programmes.filter(p=>p.status==="ACTIVE");
  // A dossier route selects the wrestler's real feud, including team
  // participation, rather than displaying the first unrelated programme.
  if(focusProgrammeId&&!focusResolved){
    focusResolved=true;
    const actual=view.programmes.find(p=>p.programmeId===focusProgrammeId);
    if(actual?.status==="ACTIVE"){
     selectedProgrammeId=actual.programmeId;activeLane=focusLane??"STORY";
    }else if(actual){
     selectedArchiveId=actual.programmeId;archiveView=true;
    }else focusWarning="That storyline is no longer available in your company.";
   }else if(focusPersonId&&!focusResolved){
   focusResolved=true;
   const available=(id:string)=>view!.people.some(p=>
    p.kind==="PERSON"&&p.refId===id);
   if(focusOpponentId){
    // A wrestler's approved pitch is specific to this exact pair.
    // Prefer a real ongoing feud over generating a duplicate form.
    const samePair=active.find(p=>
     (p.sideA.some(a=>a.kind==="PERSON"&&a.refId===focusPersonId)&&
      p.sideB.some(b=>b.kind==="PERSON"&&b.refId===focusOpponentId))||
     (p.sideB.some(b=>b.kind==="PERSON"&&b.refId===focusPersonId)&&
      p.sideA.some(a=>a.kind==="PERSON"&&a.refId===focusOpponentId)));
    if(samePair)selectedProgrammeId=samePair.programmeId;
    else if(view.canEdit&&focusPersonId!==focusOpponentId&&
     available(focusPersonId)&&available(focusOpponentId)){
     refsA=[{kind:"PERSON",refId:focusPersonId}];
     refsB=[{kind:"PERSON",refId:focusOpponentId}];
     creationOpen=true;
    }else{
     focusWarning="A proposed wrestler is no longer available."+
      " Review your roster before creating this rivalry.";
    }
   }else{
    const teams=new Set(view.teams.filter(t=>t.memberIds.includes(focusPersonId))
     .map(t=>t.refId));
    const related=active.find(p=>[...p.sideA,...p.sideB].some(member=>
     (member.kind==="PERSON"&&member.refId===focusPersonId)||
     (member.kind==="TEAM"&&teams.has(member.refId))));
    if(related)selectedProgrammeId=related.programmeId;
    else if(view.canEdit&&available(focusPersonId)){
     refsA=[{kind:"PERSON",refId:focusPersonId}];
     refsB=[null];creationOpen=true;
    }
   }
  }
  const list=element("section","ppw-programme-list");
  if(focusPersonId){
   const wrestler=view.people.find(p=>p.refId===focusPersonId)?.name??
    active.flatMap(p=>[...p.sideA,...p.sideB]).find(p=>
     p.kind==="PERSON"&&p.refId===focusPersonId)?.name;
   if(wrestler)list.append(element("p","ppw-programme-eyebrow",
    focusOpponentId?"FROM BACKSTAGE · "+wrestler.toUpperCase():
     "FROM "+wrestler.toUpperCase()+"'S WRESTLER DOSSIER"));
   if(focusWarning)list.append(element("p","ppw-alert ppw-error",focusWarning));
  }
  if(focusWarning&&!focusPersonId)list.append(element("p","ppw-alert ppw-error",focusWarning));
   const rivalryOnly=active.every(p=>storyKind(p)==="RIVALRY");
  list.append(element("h2","",(rivalryOnly?"Active rivalries":"Active stories")+
   " · "+active.length));
  if(!active.some(p=>p.programmeId===selectedProgrammeId))
   selectedProgrammeId=active[0]?.programmeId??null;
  // One-tap feud navigation, not four complete rivalry dossiers stacked.
  const overview=element("nav","ppw-programme-switcher");
  overview.setAttribute("aria-label","Choose a Programme to manage");
  for(const item of active){
   const name=storyLabel(item);
   const planned=item.plannedActivity?.[0];
   const note=item.finale?.resolvedWeekIndex===null?"Finale planned":
    planned?"Booked · "+planned.showName:
    item.repetition>=55?"Needs a fresh beat":"Next chapter open";
   const pick=button("",()=>{
    selectedProgrammeId=item.programmeId;activeLane="STORY";render();
   },working);
   pick.className="ppw-programme-switch";
   const faces=element("span","ppw-programme-switch-faces");
   for(const member of (storyKind(item)==="RIVALRY"?
    [item.sideA[0],item.sideB[0]]:item.sideA.slice(0,3)))if(member){
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
   header.append(side(p.sideA));
   if(storyKind(p)==="RIVALRY")header.append(
    element("span","ppw-programme-versus","VS"),side(p.sideB));
   else header.append(element("span","ppw-programme-story-type",
    PROGRAMME_FORMATS[storyKind(p)].label));
   const heat=p.heat===null?null:Math.max(0,Math.min(100,p.heat));
   panel.dataset.storyHeat=heat===null?"unrated":heat>=75?"hot":heat>=45?"building":"developing";
   const pulse=element("div","ppw-programme-heat");
   pulse.append(element("span","",storyKind(p)==="RIVALRY"?
    "RIVALRY HEAT":"STORY HEAT"),
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
   const crowdTrend=readProgrammeCrowdTrend(p.recentActivity);
   if(crowdTrend){
    const row=element("div","ppw-programme-crowd-trend");
    row.dataset.direction=crowdTrend.direction.toLowerCase();
    row.append(element("strong","",
     "Crowd connection · "+crowdTrend.latestCrowd+"/100"));
    const trajectory=crowdTrend.delta===null?
     "First certified show · More weeks needed for a trend":
     crowdTrend.direction==="RISING"?
      "Getting over · +"+crowdTrend.delta+" vs previous recorded week":
     crowdTrend.direction==="COOLING"?
      "Cooling · "+crowdTrend.delta+" vs previous recorded week":
      "Holding steady · "+(crowdTrend.delta>0?"+":"")+
       crowdTrend.delta+" vs previous recorded week";
    row.append(element("span","",trajectory));
    row.title="Certified crowd response grouped by show week, separate from rivalry heat";
    glance.append(row);
   }
   const lastCertifiedMatch=p.recentActivity.find(x=>x.kind==="MATCH");
   const sideAName=p.sideA.map(x=>x.name).join(" & ");
   const sideBName=p.sideB.map(x=>x.name).join(" & ");
   const latestLabel=latestBeat?describeProgrammeChapter(latestBeat,sideAName,sideBName,storyKind(p)):null;
   glance.append(element("small","ppw-programme-glance-age",
    (ageNow===null?"Active story":ageNow+" weeks active")+
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
   if(p.wrestlerOrigin){
    const origin=p.wrestlerOrigin;
    const people=[...p.sideA,...p.sideB];
    const initiator=people.find(x=>x.refId===origin.initiatorId);
    const opponent=people.find(x=>x.refId===origin.opponentId);
    const spine=describeWrestlerStory({origin,
     initiatorName:initiator?.name??"The wrestler",
     opponentName:opponent?.name??"their opponent",
     activityCount:p.activityCount,plannedShows:p.plannedActivity??[],
     resolvedFinaleWeekIndex:p.finale?.resolvedWeekIndex??null});
    const note=element("div","ppw-programme-wrestler-idea");
    note.dataset.storyStage=spine.stage;
    note.append(element("small","","FROM BACKSTAGE · WRESTLER IDEA"),
     element("strong","",spine.headline),element("span","",spine.detail));
    glance.append(note);
   }
   if((p.medicalHolds??[]).length){
    const hold=element("div","ppw-programme-medical-hold");
    hold.append(element("strong","","Medical hold · in-ring plans affected"));
    for(const person of p.medicalHolds){
     const expected=person.clearedWeekIndex===null?"pending medical clearance":
      "expected clearance Y"+(Math.floor(person.clearedWeekIndex/52)+1)+
      " W"+(person.clearedWeekIndex%52+1);
     hold.append(element("span","",person.name+" · "+expected));
    }
    hold.append(element("small","",
     "A draft match is not an appearance. Review medical clearance before booking; no result has been assumed."));
    glance.append(hold);
   }
   if(port.openPlanner&&view.canEdit)glance.append(button(
    scheduled?"Review booked chapter":(p.medicalHolds??[]).length?
     "Review safe next steps":"Book next chapter",()=>port.openPlanner?.(p.programmeId)));
   const chosen=p.creativeIntent?.followUp;
    if(chosen&&storyKind(p)!=="RIVALRY"){
     const brief=storyFollowUpBrief(chosen.choice,
      storyKind(p) as "SOLO"|"RELATIONSHIP"|"FACTION");
     const note=element("section","ppw-programme-story-follow-up");
     note.dataset.storyChoice=chosen.choice.toLowerCase();
     note.append(element("small","ppw-programme-eyebrow","BACKSTAGE · YOUR NEXT CHAPTER"),
      element("strong","",STORY_FOLLOW_UPS[chosen.choice].label),
      element("p","",brief.direction),
      element("small","","Based on certified Year "+
       (Math.floor(chosen.sourceWeekIndex/52)+1)+" · Week "+
       (chosen.sourceWeekIndex%52+1)+". This is direction, not a booked event."));
     glance.append(note);
    }
    creativeLane.append(glance);
   // Story direction is optional manager-authored context. No choice here can
   // set alignment, create an alliance, book a match or alter history.
   const story=element("section","ppw-programme-creative-intent");
   story.append(element("span","ppw-programme-eyebrow","YOUR STORY DIRECTION"),
    element("h3","","What is this story really about?"),
    element("p","ppw-muted","Pick a familiar wrestling story, then make it your own. Only booked and certified moments change the World."));
   const draft=storyDrafts.get(p.programmeId)??{
    ...(p.creativeIntent??defaultProgrammeCreativeIntent())};
   storyDrafts.set(p.programmeId,draft);
   const currentBlueprint=STORY_BLUEPRINTS.find(b=>b.id===draft.blueprintId);
   story.append(element("strong","ppw-story-current-blueprint",
    currentBlueprint?.name??"Custom story"));
   if(view.canEdit){
    const picker=document.createElement("details");
    picker.className="ppw-story-blueprint-picker";
    picker.open=storyPickerOpen.has(p.programmeId);
    picker.ontoggle=()=>{
     if(!picker.isConnected)return;
     if(picker.open)storyPickerOpen.add(p.programmeId);
     else storyPickerOpen.delete(p.programmeId);
    };
    picker.append(element("summary","","Choose or change story blueprint"));
    const choices=element("div","ppw-story-blueprint-choices");
    const families:[BlueprintFamily,string][]=[
     ["RISE","Rise"],["FALL","Fall"],["RELATIONSHIPS","Relationships"],
     ["CONFLICT","Conflict"]];
    const custom=button("Custom story",()=>{
     draft.blueprintId="CUSTOM";render();},working);
    custom.className="ppw-story-blueprint-option";
    custom.setAttribute("aria-pressed",String(draft.blueprintId==="CUSTOM"));
    choices.append(custom);
    for(const [family,name] of families){
     choices.append(element("span","ppw-story-family",name));
     for(const blueprint of STORY_BLUEPRINTS.filter(b=>b.family===family)){
      const choice=button(blueprint.name,()=>{
       draft.blueprintId=blueprint.id;
       draft.motivation=blueprint.motivation;
       draft.audienceGoal=blueprint.desiredFeeling;
       render();
      },working);
      choice.className="ppw-story-blueprint-option";
      choice.setAttribute("aria-pressed",String(draft.blueprintId===blueprint.id));
      choices.append(choice);
     }
    }
    picker.append(choices);story.append(picker);
   }
   const storyField=(label:string,key:"motivation"|"audienceGoal"|"destination",
    placeholder:string)=>{
    const field=element("label","ppw-story-creative-field");
    field.append(element("span","",label));
    const input=document.createElement("textarea");
    input.maxLength=180;input.rows=2;input.value=draft[key];
    input.placeholder=placeholder;input.disabled=!view!.canEdit;
    input.setAttribute("aria-label",label);
    input.oninput=()=>{draft[key]=input.value;};
    field.append(input);return field;
   };
   story.append(storyField("Why does this matter?","motivation",
    "A challenge, insecurity, a betrayal waiting to happen…"),
    storyField("What should fans feel?","audienceGoal",
     "Sympathy, anticipation, outrage, respect…"),
    storyField("Where is this heading? (optional)","destination",
     "An event, confrontation, turning point…"));
   if(view.canEdit){
    story.append(button(working?"Saving direction…":"Save story direction",()=>{
     void run(()=>port.saveCreativeIntent({requestId:crypto.randomUUID(),
      expectedRevision:view!.worldRevision,programmeId:p.programmeId,
      creativeIntent:{...draft}}),
      "Story direction saved. Book real matches and angles to develop it.");
    },working));
    if(p.creativeIntent)story.append(button(p.creativeIntent.followUp?"Clear story notes":"Clear story direction",()=>{
     storyDrafts.delete(p.programmeId);
     void run(()=>port.saveCreativeIntent({requestId:crypto.randomUUID(),
      expectedRevision:view!.worldRevision,programmeId:p.programmeId,creativeIntent:null}),
      p.creativeIntent?.followUp?"Story notes cleared; your certified Backstage decision remains on record.":
       "Story direction cleared. Booked and certified history stays intact.");
    },working));
   }else story.append(element("p","ppw-muted",
    "Creative changes reopen with the next booking window."));
   creativeLane.append(story);
   const record=element("div","ppw-programme-record");
   for(const [caption,n] of (storyKind(p)==="RIVALRY"?[
    [p.sideA.map(x=>x.name).join(" & ")+" WINS",p.sideAWins],
    [p.sideB.map(x=>x.name).join(" & ")+" WINS",p.sideBWins],
    ["DRAWS",p.draws],["CHAPTERS",p.activityCount]
   ]:[
    ["ON-SCREEN CHAPTERS",p.activityCount],
    ["PERFORMED SCENES",p.segmentCount],
    ["LINKED MATCHES",p.matchCount]
   ]) as [string,number][]){
    const tile=element("span","ppw-programme-record-item");
    tile.append(element("small","",caption),element("strong","",String(n)));
    record.append(tile);
   }
   historyLane.append(record);
   const payoffPanel=element("section","ppw-programme-finale");
   payoffPanel.append(element("span","ppw-programme-eyebrow",
    storyKind(p)==="RIVALRY"?"ON-SCREEN RIVALRY PAYOFF":"ON-SCREEN STORY ENDING"));
   const planned=p.plannedActivity??[];
   const variants=(chapter:typeof planned[number]):{value:ProgrammePayoff;label:string}[]=>{
    if(chapter.kind==="MATCH")return [
     {value:"DECISIVE_MATCH",label:"Decisive final match"},
     ...(chapter.titleMatch?[{value:"TITLE_SHOWDOWN" as const,
      label:"Championship showdown"}]:[]),
     ...(chapter.stipulationMatch?[{value:"STIPULATION_SHOWDOWN" as const,
      label:"Final stipulation match"}]:[])];
    // The same canonical eligibility drives the Card Editor, Programme Desk
    // and final show certification; the booker need not force an attack.
    return eligibleProgrammePayoffs("SEGMENT",{kind:chapter.segmentKind})
     .map(value=>({value,label:PROGRAMME_PAYOFFS[value]}));
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
       (storyKind(p)==="RIVALRY"?" · This rivalry":" · This story")+
        " remains active until the booked scene is certified.":
       " · Certified and included in your story history.")));
    if(existing.resolvedWeekIndex===null&&!chosen)
     payoffPanel.append(element("p","ppw-programme-finale-warning",
      "The selected chapter is no longer booked in your next six weeks. Choose another, or remove this finale plan."));
   }else payoffPanel.append(element("p","ppw-muted",
    "Choose a specific booked match or angle to end this story on screen. A plan alone cannot finish it."));
   if(view.canEdit&&eligible.length){
    const available=eligible.map(x=>({chapter:x,key:x.showId+"::"+x.slotId}));
    const defaultChapter=available.find(x=>x.chapter.showId===existing?.showId&&
      x.chapter.slotId===existing?.slotId)??
      available.find(x=>x.chapter.premium)??available[0]!;
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
      storyLabel(p));
    for(const x of available){
     const opt=document.createElement("option");opt.value=x.key;
     opt.textContent=x.chapter.showName+(x.chapter.premium?" · PPV":"")+" · Y"+x.chapter.year+
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
    payoffSelect.setAttribute("aria-label",storyKind(p)==="RIVALRY"?
     "Choose rivalry payoff":"Choose story ending");
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
      "Finale planned. Only an on-screen chapter can finish this story.");
    },working));
   }else if(view.canEdit)payoffPanel.append(element("p","ppw-muted",
    "No finale chapter booked yet. Link any real match or angle to this storyline and save its card first."));
   if(view.canEdit&&existing?.resolvedWeekIndex===null)
    payoffPanel.append(button("Remove planned finale",()=>{
     void run(()=>port.planFinale({requestId:crypto.randomUUID(),
      expectedRevision:view!.worldRevision,programmeId:p.programmeId,
      showId:null,slotId:null,payoff:null}),
      "Finale plan removed. The story remains active.");
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
     const chapter=describeProgrammeChapter(activity,sideAName,sideBName,storyKind(p));
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
   advice.append(element("h3","","Next chapter"));
    if(p.creativeIntent?.followUp&&storyKind(p)!=="RIVALRY"){
     const follow=p.creativeIntent.followUp;
     const brief=storyFollowUpBrief(follow.choice,
      storyKind(p) as "SOLO"|"RELATIONSHIP"|"FACTION");
     advice.append(element("p","ppw-programme-story-cue",
      "YOUR BACKSTAGE DECISION · "+brief.next));
    }
   // Each saved Blueprint proposes optional real booking scenes, in any
   // order. These are not results, relationship flags or automatic turns.
   const savedBlueprint=STORY_BLUEPRINTS.find(x=>
    x.id===p.creativeIntent?.blueprintId);
   if(savedBlueprint){
    const beats=element("section","ppw-programme-next-beats");
    const progress=p.blueprintProgress?.blueprintId===savedBlueprint.id?
     p.blueprintProgress:null;
    beats.append(element("h4","","From your story · "+savedBlueprint.name));
    const cue=progress?recommendProgrammeBlueprintBeat({
     blueprint:savedBlueprint,progress,heat:p.heat,repetition:p.repetition,
     crowdTrend,medicalHolds:(p.medicalHolds??[]).length,
     latestChapter:p.recentActivity[0]??null,
     latestFollowUp:p.latestFollowUp
    }):null;
    if(cue){
     beats.dataset.cueSignal=cue.signal.toLowerCase();
     beats.append(element("p","ppw-story-beat-cue",
      "CREATIVE CUE · "+cue.reason));
    }
    if(progress){
     beats.append(element("p","ppw-story-beat-tally",
      progress.played+" performed · "+progress.booked+" booked · "+
      progress.available+" still to explore"));
     if(progress.played===savedBlueprint.beats.length)
      beats.append(element("p","ppw-story-beat-message",
       "Every scene has happened on screen. Consider a payoff, a twist, or a new direction. The ending stays yours."));
     else if(progress.played||progress.booked)
      beats.append(element("p","ppw-story-beat-message",
       "These are optional story directions, not a required order. The next scene stays your choice."));
     else beats.append(element("p","ppw-muted",
      "Select any beat to start an editable scene. A saved draft is not a performed chapter."));
    }else beats.append(element("p","ppw-muted",
     "Choose any beat to begin an editable angle. Nothing is booked until you finish and save the card."));
    const ordered=[...savedBlueprint.beats].sort((a,b)=>{
     const rank=(id:string)=>{
      const state=progress?.beats.find(x=>x.beatId===id)?.status;
      if(state==="AVAILABLE"&&cue?.beatId===id)return 0;
      return state==="AVAILABLE"?1:state==="BOOKED"?2:3;
     };
     return rank(a.id)-rank(b.id);
    });
    for(const beat of ordered){
     const proof=progress?.beats.find(x=>x.beatId===beat.id);
     const status=proof?.status??"AVAILABLE";
     const isBooked=status==="BOOKED";
     const action=button(beat.title,()=>{
      if(isBooked)port.openPlanner?.(p.programmeId,undefined,undefined,
       proof?.bookedAt?{draftId:proof.bookedAt.draftId,
        year:proof.bookedAt.year,week:proof.bookedAt.week}:undefined);
      else port.openPlanner?.(p.programmeId,undefined,
       {blueprintId:savedBlueprint.id,beatId:beat.id});
     },working||!view.canEdit||!port.openPlanner);
     action.className="ppw-programme-beat-action";
     action.dataset.beatStatus=status.toLowerCase();
     action.dataset.beatId=beat.id;
     const state=element("span","ppw-programme-beat-state",
      status==="PLAYED"?"PERFORMED":
      status==="BOOKED"?"ON THE CARD":
      cue?.beatId===beat.id?"SUGGESTED NEXT":"AVAILABLE");
     action.prepend(state);
     action.append(element("small","",beat.intention));
     if(status==="PLAYED"&&proof?.playedWeekIndex!==null&&
      proof?.playedWeekIndex!==undefined){
      const year=Math.floor(proof.playedWeekIndex/52)+1;
      const week=proof.playedWeekIndex%52+1;
      action.append(element("small","ppw-programme-beat-proof",
       "Performed Y"+year+" W"+week+
       (proof.crowdResponse!==null?" · Crowd "+Math.round(proof.crowdResponse!)+"/100":"")+
       " · You can revisit with a new scene"));
     }
     if(isBooked&&proof?.bookedAt)action.append(element("small","ppw-programme-beat-proof",
      (proof.bookedAt.submitted?"Submitted":"Draft")+" · "+
      proof.bookedAt.showName+" · Y"+proof.bookedAt.year+
      " W"+proof.bookedAt.week+" · Open booked show card"));
     beats.append(action);
    }
    advice.append(beats);
   }
   if(p.plannedActivity?.length)
    advice.append(element("p","ppw-programme-booked-short",
     "Already booked · "+p.plannedActivity[0]!.showName));
   else if((p.medicalHolds??[]).length)
    advice.append(element("p","ppw-programme-booked-short",
     "A wrestler is medically unavailable. Revisit the plan after clearance or choose a safe alternative; a match cannot be assumed."));
   else if(!savedBlueprint){
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
   if(latestMatch&&view.canEdit&&storyKind(p)==="RIVALRY"){
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
    next.append(element("h4","","Result fallout"),
     element("p","","Choose how the last result shapes the rivalry."));
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
    next.append(options);advice.append(next);
   }
   if(p.latestFollowUp&&continuity.directionHeadline){
    const label=p.latestFollowUp.choice==="PURSUE_REMATCH"?
     "Pursue a rematch":p.latestFollowUp.choice==="PLAN_RETALIATION"?
     "Plan retaliation":"Let the result stand";
    const record=element("p","ppw-programme-direction-record",
     "Last choice: "+label+" · "+continuity.directionHeadline);
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
    "This archives the story immediately without a final match or scene. For a satisfying ending, plan an on-screen finale instead."));
   retire.append(button("End programme",()=>{
    void run(()=>port.end({requestId:crypto.randomUUID(),
     expectedRevision:view!.worldRevision,programmeId:p.programmeId}),
     "Story concluded");
   },working||!view.canEdit));
   finaleLane.append(retire);
   const views=[
    {key:"STORY",label:"Story",node:creativeLane},
    {key:"PLAN",label:"Plan",node:planLane},
    {key:"PAYOFF",label:p.finale?"Payoff ●":"Payoff",node:finaleLane},
    {key:"HISTORY",label:"History",node:historyLane}
   ] as const;
   const tabs=element("nav","ppw-programme-view-tabs");
   tabs.setAttribute("aria-label","Story workspace");
   for(const lane of views){
    const pick=button(lane.label,()=>{activeLane=lane.key;render();},working);
    pick.className="ppw-programme-view-tab";
    pick.setAttribute("aria-current",activeLane===lane.key?"page":"false");
    tabs.append(pick);
   }
   panel.append(tabs,views.find(x=>x.key===activeLane)!.node);
   list.append(panel);
  }
  if(!active.length)list.append(element("p","ppw-muted",
   "No active rivalries. Start a story below."));
  if(!archiveView)root.append(list);
  if(view.canEdit&&!archiveView){
   const creation=element("section","ppw-programme-create");
   creation.append(element("h2","","Start a story"),
    element("p","ppw-muted",
     "Choose the cast and type of story. Only genuine booked chapters affect the World."));
   const formats=element("div","ppw-programme-format-choices");
   formats.setAttribute("role","group");
   formats.setAttribute("aria-label","Programme story format");
   for(const format of Object.keys(PROGRAMME_FORMATS) as ProgrammeFormat[]){
    const spec=PROGRAMME_FORMATS[format];
    const choose=button(spec.label,()=>{
     if(format===newFormat)return;
     newFormat=format;titleId=null;
     refsA=Array.from({length:spec.minimum},()=>null);
     refsB=format==="RIVALRY"?[null]:[];render();
    },working);
    choose.className="ppw-programme-format-option";
    choose.setAttribute("aria-pressed",String(format===newFormat));
    choose.append(element("small","",spec.description));formats.append(choose);
   }
   creation.append(formats,sideControl("A",refsA));
   if(newFormat==="RIVALRY")creation.append(sideControl("B",refsB));
   if(view.championships.length)creation.append(createChoiceDialog(
    "Championship (optional)",titleId??"",[{value:"",label:"No championship"},
     ...view.championships.map(t=>({value:t.championshipId,label:t.name}))],
    value=>{titleId=value||null;render();},working||!view?.canEdit));
   const a=refsA.filter((x):x is ProgrammeRef=>!!x);
   const b=refsB.filter((x):x is ProgrammeRef=>!!x);
   const overlap=programmeOverlaps(allSelected(),teamMembers());
   if(overlap)creation.append(element("p","ppw-alert ppw-error",
    "This story uses a wrestler more than once. Pick distinct participants."));
   const requirements=PROGRAMME_FORMATS[newFormat];
   const castReady=a.length===refsA.length&&b.length===refsB.length&&
    a.length>=requirements.minimum&&a.length<=requirements.maximum&&
    (newFormat==="RIVALRY"?b.length>=1&&b.length<=2:b.length===0);
   creation.append(button(working?"Saving…":"Start "+
    (newFormat==="RIVALRY"?"rivalry":"story"),()=>{
    void run(()=>port.start({requestId:crypto.randomUUID(),
     expectedRevision:view!.worldRevision,sideA:a,sideB:b,
     programmeFormat:newFormat,championshipId:titleId}),
     "New "+(newFormat==="RIVALRY"?"rivalry":"story")+" started");
   },working||overlap||!castReady));
   const createDetails=document.createElement("details");
   createDetails.className="ppw-programme-create-fold";
   createDetails.open=creationOpen;
   createDetails.ontoggle=()=>{
    if(createDetails.isConnected)creationOpen=createDetails.open;
   };
   const title=element("summary","","+ Start a new "+
    (newFormat==="RIVALRY"?"rivalry":"story"));
   // Record the open state before a selection re-renders the creation form.
   // Native details.toggle is asynchronous and may not fire until after the
   // original element has been detached on the first roster selection.
   title.onclick=()=>{creationOpen=!createDetails.open;};
   createDetails.append(title,creation);
   // Approved wrestler-originated feud takes priority over a long existing
   // programme list; the explicit Start button remains the only mutation.
   if(focusOpponentId&&creationOpen)
    root.insertBefore(createDetails,list);
   else root.append(createDetails);
  }
  const concluded=view.programmes.filter(p=>p.status!=="ACTIVE");
  const rivalryArchiveOnly=concluded.every(p=>storyKind(p)==="RIVALRY");
  const archiveLabel=rivalryArchiveOnly?"Past rivalries":"Past stories";
  if(concluded.length&&!archiveView){
   const portal=button(archiveLabel+" · "+concluded.length,()=>{
    archiveView=true;selectedArchiveId=null;render();
   },working);
   portal.className="ppw-programme-past-entry";
   root.append(portal);
  }
  if(archiveView){
   const history=element("section","ppw-programme-history");
   history.append(button(selectedArchiveId?"← "+archiveLabel:
    "← "+(rivalryArchiveOnly?"Active rivalries":"Active stories"),()=>{
    if(selectedArchiveId)selectedArchiveId=null;
    else archiveView=false;
    render();
   },working));
   if(selectedArchiveId){
    history.classList.add("ppw-programme-retrospective");
   }else{
    history.append(element("h2","",archiveLabel+" · "+concluded.length));
    for(const item of concluded){
     const label=storyLabel(item);
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
    duel.append(side(p.sideA,aName));
    if(storyKind(p)==="RIVALRY")duel.append(
     element("span","ppw-programme-archive-vs","VS"),side(p.sideB,bName));
    else duel.append(element("span","ppw-programme-story-type",
     PROGRAMME_FORMATS[storyKind(p)].label));
    heading.append(duel,element("small","",p.endedWeekIndex==null?
     "Concluded story":"Ended · Year "+(Math.floor(p.endedWeekIndex/52)+1)+
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
    review.append(graphic,element("span","",stars+"/5 · Grade "+rating.grade),element("small","",storyKind(p)==="RIVALRY"?rating.verdict:
      rating.verdict.replaceAll("feud","story").replaceAll("rivalry","story")));
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
     storyKind(p)==="RIVALRY"?
      aName+" "+p.sideAWins+" — "+p.sideBWins+" "+bName+
      (p.draws?" · "+p.draws+" draw"+(p.draws===1?"":"s"):""):
      storyLabel(p)+" · "+p.activityCount+" certified chapters"),
     element("p","ppw-programme-archive-beats",
      p.matchCount+" in-ring "+(p.matchCount===1?"meeting":"meetings")+
      " · "+p.segmentCount+" on-screen "+(p.segmentCount===1?"chapter":"chapters")));
    const outcome=readProgrammeContinuity({sideAName:aName,sideBName:bName,
     recentActivity:p.recentActivity,latestFollowUp:p.latestFollowUp});
    if(storyKind(p)==="RIVALRY"&&outcome.lastBell)
     archive.append(element("p","ppw-programme-archive-final-bell",outcome.lastBell));
    if(p.finale?.resolvedWeekIndex!=null){
     const f=p.finale;
     const week=f.resolvedWeekIndex!;
     const when="Year "+(Math.floor(week/52)+1)+
      " · Week "+(week%52+1);
     archive.append(element("p","ppw-programme-archive-payoff",
      "ON-SCREEN PAYOFF · "+f.payoff.replaceAll("_"," ")+
      " · "+when+
      (storyKind(p)==="RIVALRY"&&f.resolvedWinnerSide?
       " · Side "+f.resolvedWinnerSide+" prevailed":"")));
    }
    if(p.recentActivity.length){
     archive.append(element("h3","","On-screen history"));
     const timeline=element("div","ppw-programme-archive-timeline");
     for(const activity of [...p.recentActivity].reverse()){
      const item=element("div","ppw-programme-archive-event");
      const description=describeProgrammeChapter(activity,aName,bName,storyKind(p));
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
