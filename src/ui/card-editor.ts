/** Mobile-first PWA card editor, with no new runtime/framework dependency.
 * Host supplies authenticated RPC methods; browser cannot supply playerId.
 * Draws on the original PPW card's compact, expandable running-order design.
 */
import {newEditorMatch,restoreEditorMatch,assignPerformer,changeWinner,
 resizeMatch,moveElimination,buildBookedMatch,assignedIds,assignBookedTeam,
 editorMatchStyle,changeMatchIntent,changeMatchStyle,changeMatchStipulation,editorStyleLoad,bookedMatchHeadline,
 bookedStyleReadiness,bookedConditionReport,type ConditionSnapshot,
 FORMATS,type EditorMatch,type Format,type PersonPick}
 from "./card-editor-model.js";
import {ANGLE_TYPES,VIDEO_PURPOSES,REQUIRED_TARGETS,LIMITED_ACTORS,newEditorSegment,
 restoreEditorSegment,addSegmentPerson,buildEditorSegment,type EditorSegment}
 from "./card-segment-model.js";
import {ANGLE_STORY_GOALS,angleGoalFor,anglesForGoal,firstAngleFor,angleDirection,
 type AngleGoal} from "./angle-story-goals.js";
import type {readShowCardEditor,readBookableCardTalent,
 saveShowCardMatches} from "../db/show-card-editor.js";
import type {markPreparedShowReady} from "../db/ready-prepared-show.js";
import {createWrestlerCard} from "./wrestler-card.js";
import {createTalentFilterFrame} from "./talent-filter-controls.js";
import {SEGMENT_BOOKING_RULES} from "../domain/segment-booking.js";
import {tournamentBoutLabel} from "../domain/tournament-bracket.js";
import {matchCastingReadiness,angleCastingReadiness,angleCastStageReadiness,reservedPickerPeople} from "./card-booking-readiness.js";
import {MATCH_STYLE_DIMENSIONS,type MatchStyleDimension} from "../simulation/legacy/match-style.js";
import {MATCH_STIPULATIONS,compatibleStipulations,
 permittedStipulationFinishes,stipulationInjuryRisk,
 stipulationMinimumMinutes,type MatchStipulation}
 from "../domain/match-stipulations.js";
import {storyDirectionHint} from "./story-direction-hint.js";
import {initialCreativeBeat,supportsCreativeBeat,type SegmentCreativeBeat}
 from "../domain/segment-creative-beats.js";
import {creativeFields,creativeSummary} from "./segment-creative-options.js";
import {SPECIAL_MOMENTS,specialMomentBySku} from "../domain/special-moments.js";
import {initialAngleScene,ANGLE_LOCATION_AREAS,ANGLE_VISUALS,ANGLE_INTENSITIES,angleLocationsFor,anglePurposesFor,angleLocationArea,angleSceneLabel} from "../domain/angle-scene.js";
import {recommendProgrammeAngles,type ProgrammeAngleIdea} from "../domain/programme-angle-recommendations.js";
import {creativeForSlot,consentRebookingAdvice} from "./card-creative-review.js";
import {previewMatchCreativeTerms} from "./card-creative-term-preview.js";
import {forecastBookingAirtime} from "./card-airtime-preview.js";
import {bookingChoiceAdvice,applyBookingAdjustment} from "../domain/booking-choice-advice.js";
import {hasConcurrentCardChange} from "./card-draft-conflict.js";
import {forecastCardAppearanceFees,forecastIncrementalAppearanceFees} from "../domain/card-appearance-forecast.js";
import {bookingFinanceBrief} from "../domain/booking-financial-brief.js";
import {matchStaffNotes,angleStaffNotes,showWorkloadNotes,crossShowWorkloadNotes,matchPartnershipNotes,type StaffNote,type AdvisorPerson} from "../domain/staff-context-advice.js";
import type {StaffRole} from "../domain/world-staff.js";
import {broadcastPackageClass} from "../domain/broadcast-packages.js";
import {reconcileDraftAgreements} from "./card-contract-reconciliation.js";
import {moveLinkedRunningOrder,dropLinkedRunningOrder,attachPostMatchAngle} from "./card-running-order.js";
import {isQuickBookField} from "./quick-book.js";
import {programmeMatchStarter,programmeAngleIdeaStarter,programmeAngleCastStarter}
 from "./programme-booking-starter.js";
type View=Awaited<ReturnType<typeof readShowCardEditor>>;
type TalentPage=Awaited<ReturnType<typeof readBookableCardTalent>>;
type SaveResult=Awaited<ReturnType<typeof saveShowCardMatches>>;
type ReadyResult=Awaited<ReturnType<typeof markPreparedShowReady>>;
export interface CardEditorPort{
 load():Promise<View>;
 /** Transient on-page focus from the Programme Desk, not a saved game command. */
 focusProgrammeId?:string;
 focusProgrammeIdeaKind?:ProgrammeAngleIdea["kind"];
 /** One-shot dossier route. Must re-check signed rights for the selected show. */
 focusWrestler?:{personId:string;name:string};
 focusTitleChallenge?:{championshipId:string;holderId:string;holderName:string;
  challengerId:string;challengerName:string};
 talent(search:string,cursor:TalentPage["cursor"]):Promise<TalentPage>;
 save(input:{requestId:string;expectedRevision:number;
  matches:{slotId:string;payload:unknown}[];
  segments:{slotId:string;payload:unknown}[];runningOrder:string[]}):Promise<SaveResult>;
 confirmReady?(input:{requestId:string;expectedRevision:number}):Promise<ReadyResult>;
 requestCreativeConsent?(input:{requestId:string;expectedRevision:number;
  slotId:string;personId:string;proposedMatch?:unknown}):Promise<unknown>;
 /** Notify the host only when the active editor has locally unsaved authorship. */
 onDraftChange?(dirty:boolean):void;
 openPlanner?():void;
 openProgrammes?():void;
 openChampionships?():void;
 openTagTeams?():void;
 openContracts?():void;
 openRoster?():void;
 openMarket?():void;
 openBusiness?():void;
 openStaff?():void;
 openIndustry?():void;
 openStables?():void;
 openWorkingConnections?():void;
 openPersona?():void;
 openProfile?(personId:string,holder:HTMLElement,onClose:()=>void):void;
 specialMoments?():Promise<readonly string[]>;
 openKayfabe?():void;
 stableChoices?():Promise<{stableId:string;name:string;members?:{
  personId:string;contractId:string;name:string}[]}[]>;
}
const el=(tag:string,className="",label?:string):HTMLElement=>{
 const node=document.createElement(tag);
 if(className)node.className=className;
 if(label!==undefined)node.textContent=label;
 return node;
};
function button(label:string,callback:()=>void,disabled=false,className=""){
 const b=el("button",className,label) as HTMLButtonElement;
 b.type="button";b.disabled=disabled;b.onclick=callback;return b;
}
function option(value:string,label:string,selected=false){
 const o=document.createElement("option");
 o.value=value;o.textContent=label;o.selected=selected;return o;
}
function selector(value:string,choices:readonly string[][],
 change:(value:string)=>void,disabled=false){
 const select=document.createElement("select");select.disabled=disabled;
 // The surrounding field supplies the label. Standalone selects are named individually.
 for(const [v,label] of choices)select.append(option(v,label,v===value));
 select.value=value;select.onchange=()=>change(select.value);
 return select;
}
function numberField(value:number,min:number,max:number,
 change:(value:number)=>void,disabled=false){
 const input=document.createElement("input");
 input.type="number";input.inputMode="numeric";input.min=String(min);
 input.max=String(max);input.value=String(value);input.disabled=disabled;
 input.onchange=()=>{const n=Number(input.value);
  if(Number.isInteger(n)&&n>=min&&n<=max)change(n);
  else input.value=String(value);};
 return input;
}
function field(label:string,control:HTMLElement){
 // Explicit accessible name survives nested option text and re-rendered iPhone dialogs.
 control.setAttribute("aria-label",label);
 const wrapper=el("label","ppw-field");
 wrapper.append(el("span","",label),control);return wrapper;
}
function nice(value:string){return value.replaceAll("_"," ").toLowerCase()
 .replace(/(^|\s)\S/g,x=>x.toUpperCase());}
export function mountCardEditor(root:HTMLElement,port:CardEditorPort){
 let view:View|null=null;
 let matches=new Map<string,EditorMatch>();
 let segments=new Map<string,EditorSegment>();
 let order:string[]=[];
 let roster=new Map<string,{personId:string;contractId:string;name:string|null;
  division:string|null;alignment?:string|null;available:boolean;reason:string;appearanceFee?:number|null;creativeControl?:string|null;
  workingConnections?:AdvisorPerson["workingConnections"]}&Partial<ConditionSnapshot>>();
 let expanded:string|null=null;
 let picker:{slotId:string;side:number;member:number;role?:"actors"|"targets"|"RUN_IN";
  query:string;cursor:TalentPage["cursor"];items:TalentPage["talent"];
  sort:"POPULARITY"|"MOMENTUM"|"IN_RING"|"PRESENTATION"|"DATES"|"NAME";
  division:"ALL"|"MEN"|"WOMEN";showOther?:boolean;
  source?:"ALL"|"FEUDS"|"TEAMS"|"TRIOS"|"FACTIONS";
  sourceId?:string;chipsBySide?:Map<number,Set<string>>;
  divisionBySide?:Map<number,"ALL"|"MEN"|"WOMEN">}|null=null;
 let loading=false,saving=false,dirty=false,error="",success="";
 const draftConsentFeedback=new Map<string,{name:string;text:string;failed:boolean}>();
 let talentRequestSequence=0;
 let pendingRequestId:string|null=null;
 let needsRevisionRefresh=false;
 let stableChoices:{stableId:string;name:string;members?:{
  personId:string;contractId:string;name:string}[]}[]|null=null;
 let stableChoicesLoading=false;
 let specialOwned:readonly string[]|null=null,specialBusy=false;
 let focusedPerson=port.focusWrestler??null,focusBusy=false;
 let focusedChallenge=port.focusTitleChallenge??null;
 let formatChoice:Format="SINGLES";
 let focusedRivalryId:string|null=port.focusProgrammeId??null;
 let rivalryIdeasOpen=Boolean(port.focusProgrammeId);
 let initialProgrammeFocusDone=false;
 const openStyles=new Set<string>();
 const openRunIns=new Set<string>();
 const slotBookingModes=new Map<string,"QUICK"|"ADVANCED">();
 const slotBookingSteps=new Map<string,"SETUP"|"CAST"|"OUTCOME"|"REVIEW">();
 const guidedPickerSlots=new Set<string>();
 // A new booking is only added to the working card at the final step.
 // Closing earlier discards this wizard's local slot and restores the
 // existing unsaved-card state. Already saved slots are never discarded.
 const inProgressWizards=new Map<string,{wasDirty:boolean}>();
 const openQuickExtras=new Set<string>();
 let resetGuideScroll=false;
 const selectedName=(pick:PersonPick|null)=>!pick?"Choose wrestler":
  roster.get(pick.personId)?.name??pick.personId;
 const mutable=()=>view?.canEdit===true&&!saving;
 const errorText=(e:unknown)=>e instanceof Error?e.message:"Unable to load booking";
 const matchLabel=(m:EditorMatch)=>bookedMatchHeadline(m,selectedName);
 const eligibleTeams=()=>view?.bookableTeams??[];
 const eligibleTrios=()=>view?.bookableTrios??[];
 const team=()=>new Set<StaffRole>((view?.advisers??[]).map(x=>x.role as StaffRole));
 const advisorPeople=():AdvisorPerson[]=>[...roster.values()].map(x=>({
  personId:x.personId,name:x.name??x.personId,inRingQuality:x.inRingQuality,
  matchCraft:x.matchCraft,presentation:x.presentation,stamina:x.stamina,
  safety:x.safety,fatigue:x.fatigue,wear:x.wear,
  workingConnections:x.workingConnections
 }));
 function slotNotes(slotId:string):StaffNote[]{
  const match=matches.get(slotId),segment=segments.get(slotId);
  if(!match&&!segment)return [];
  // Count completed tickets plus the booking being edited. Other unfinished
  // wizards are not yet on the card and cannot create false staff warnings.
  const activeMatches=[...matches.values()].filter(m=>
   m.slotId===slotId||!inProgressWizards.has(m.slotId));
  const activeSegments=[...segments.values()].filter(s=>
   s.slotId===slotId||!inProgressWizards.has(s.slotId));
  const people=advisorPeople(),staffed=team();
  const workload=showWorkloadNotes(slotId,(match??segment)!,activeMatches,
   activeSegments,people,staffed);
  const otherWeek=crossShowWorkloadNotes((match??segment)!,
   view?.otherShowWorkloads??[],people,staffed);
  if(match){
   const all=[...otherWeek,...workload,...matchStaffNotes(match,people,staffed),
    ...matchPartnershipNotes(match,people,staffed)];
   return [...all.filter(n=>n.level==="WATCH"),...all.filter(n=>n.level==="INFO")].slice(0,6);
  }
  const cast=view?.programmes.find(p=>p.programmeId===segment!.programmeId)?.cast??[];
  return [...otherWeek,...workload,...angleStaffNotes(segment!,people,staffed,
   cast.map(p=>p.personId))].slice(0,5);
 }
 /** One optional next action at a time, using the same locally authored
  * card and already-loaded named crew. Reopen/revision re-evaluates it.
  * A staff suggestion never applies by itself or calls Neon.
  */
 function bookingChoicePanel(slotId:string):HTMLElement|null{
  const current=matches.get(slotId)??segments.get(slotId);
  if(!current)return null;
  const programme="teams" in current?null:
   view?.programmes.find(p=>p.programmeId===current.programmeId);
  const suggestion=bookingChoiceAdvice(current,advisorPeople(),team(),{
   programmeCast:programme?.cast?.map(p=>p.personId)??[],
   hasProgrammes:Boolean(view?.programmes.length)
  });
  if(!suggestion)return null;
  const colleague=view?.advisers?.find(p=>p.role===suggestion.role);
  const panel=el("section","ppw-booking-choice-panel");
  panel.dataset.level=suggestion.level.toLowerCase();
  panel.append(el("span","ppw-booking-choice-role",
   colleague?.name??(suggestion.role==="HOUSE"?"House safety":
    nice(suggestion.role))),
   el("strong","",suggestion.title),
   el("p","",suggestion.message));
  panel.append(button(suggestion.actionLabel,()=>{
   if(!mutable())return;
   if(suggestion.adjustment.kind==="BACK_TO_CAST"){
    slotBookingSteps.set(slotId,"CAST");
    resetGuideScroll=true;render();return;
   }
   const latest=matches.get(slotId)??segments.get(slotId);
   if(!latest)return;
   try{
    const updated=applyBookingAdjustment(latest,suggestion.adjustment);
    if("teams" in updated)setMatch(slotId,updated);
    else editSegment(latest as EditorSegment,updated);
   }catch(e){error=errorText(e);render();}
  },!mutable(),"ppw-booking-choice-action"));
  return panel;
 }
 function selectTrioForMatch(match:EditorMatch,side:number,trioId:string){
  const trio=eligibleTrios().find(t=>t.trioId===trioId);
  if(!trio||match.format!=="TRIOS")return;
  const occupied=new Set([...matches.values()].filter(m=>m.slotId!==match.slotId)
   .flatMap(assignedIds));
  if(trio.members.some(m=>occupied.has(m.personId))){
   error="One or more trio partners already have a match on this card";render();return;
  }
  try{setMatch(match.slotId,assignBookedTeam(match,side,trio.members));}
  catch(e){error=errorText(e);render();}
 }
 function selectTeamForMatch(match:EditorMatch,side:number,teamId:string){
  const team=eligibleTeams().find(x=>x.teamId===teamId);
  if(!team)return;
  const otherMatches=[...matches.values()].filter(x=>x.slotId!==match.slotId);
  const occupied=new Set(otherMatches.flatMap(assignedIds));
  if(team.members.some(x=>occupied.has(x.personId))){
   error="One or more team members already have a match on this card";render();return;
  }
  try{setMatch(match.slotId,assignBookedTeam(match,side,team.members));}
  catch(e){error=errorText(e);render();}
 }
 function castAngleGroup(segment:EditorSegment,role:"actors"|"targets",choice:string){
  const groups=[
   ...(view?.bookableTeams??[]).map(t=>({id:"team:"+t.teamId,members:t.members})),
   ...(view?.bookableTrios??[]).map(t=>({id:"trio:"+t.trioId,members:t.members})),
   ...(stableChoices??[]).map(t=>({id:"stable:"+t.stableId,members:t.members??[]}))
  ];
  const group=groups.find(g=>g.id===choice);
  if(!group||!group.members.length)return;
  try{
   let next=segment;
   for(const member of group.members){
    if(next[role].some(p=>p.personId===member.personId))continue;
    next=addSegmentPerson(next,role,{personId:member.personId,contractId:member.contractId});
    if(!roster.has(member.personId))
     roster.set(member.personId,{personId:member.personId,contractId:member.contractId,
      name:member.name,division:null,available:true,reason:"AVAILABLE"});
   }
   editSegment(segment,{[role]:next[role]});
  }catch(err){error=errorText(err);render();}
 }
 function selectTeamForTurn(segment:EditorSegment,teamId:string){
  const team=eligibleTeams().find(x=>x.teamId===teamId);
  if(!team)return;
  if(team.members.some(p=>segment.targets.some(t=>t.personId===p.personId))){
   error="A turning wrestler cannot also be a target";render();return;
  }
  editSegment(segment,{actors:team.members.map(p=>({...p}))});
 }
 const matchSubtitle=(m:EditorMatch)=>{
  const fmt=FORMATS.find(x=>x.value===m.format)?.label??"Match";
  const cast=assignedIds(m).length;
  const needed=m.teams.reduce((a,s)=>a+s.length,0);
  // Once the cast is complete, the readiness count adds no useful detail.
  return fmt+(cast<needed?" · "+cast+" / "+needed+" cast":"")+
   " · "+m.plannedLengthMinutes+" min · "+nice(m.plannedFinish);
 };
 function markDirty(){dirty=true;pendingRequestId=null;error="";success="";
  port.onDraftChange?.(true);}
 function startWizard(slotId:string){
  inProgressWizards.set(slotId,{wasDirty:dirty});
  markDirty();render();
 }
 function endWizard(slotId:string){
  inProgressWizards.delete(slotId);
  expanded=null;render();
  // On iPhone, new running-order slots usually appear below the fold.
  // Bring the exact completed ticket into view *after* the wizard closes;
  // never scroll a cancelled booking or change saved World state.
  const ticket=[...root.querySelectorAll<HTMLElement>(
   ".ppw-card[data-booking-slot-id]")].find(node=>node.dataset.bookingSlotId===slotId);
  ticket?.scrollIntoView({block:"center",inline:"nearest",behavior:"auto"});
 }
 function closeWizard(slotId:string){
  const pending=inProgressWizards.get(slotId);
  if(!pending){expanded=null;render();return;}
  const match=matches.get(slotId),angle=segments.get(slotId);
  const hasParticipants=match?assignedIds(match).length>0:
   Boolean(angle?.actors.length||angle?.targets.length);
  if(hasParticipants&&!window.confirm(
   "Discard this unfinished "+(match?"match":"angle")+
   "? It has not been added to your card yet."))return;
  matches.delete(slotId);segments.delete(slotId);
  order=order.filter(id=>id!==slotId);
  inProgressWizards.delete(slotId);
  slotBookingSteps.delete(slotId);
  guidedPickerSlots.delete(slotId);
  dirty=pending.wasDirty;pendingRequestId=null;error="";success="";
  port.onDraftChange?.(dirty);expanded=null;render();
 }
 function setMatch(slotId:string,next:EditorMatch){
  matches.set(slotId,next);markDirty();render();
 }
 function changeSize(match:EditorMatch,count:number,size?:number){
  try{setMatch(match.slotId,resizeMatch(match,count,size));}
  catch(e){error=errorText(e);render();}
 }
 async function load(){
  loading=true;render();
  try{
   view=await port.load();
   stableChoices=null;
   specialOwned=null;
    // A new World week may activate signed renewals; discard stale contract IDs.
    roster.clear();
    matches=new Map();segments=new Map();
   order=view.slots.map(x=>x.slotId);
   for(const slot of view.slots){
    if(slot.kind==="MATCH")
     matches.set(slot.slotId,restoreEditorMatch(slot.slotId,slot.payload));
    else segments.set(slot.slotId,{
     ...restoreEditorSegment(slot.slotId,slot.payload),
     programmeId:view.programmeLinks.find(x=>x.slotId===slot.slotId)?.programmeId??null,
    });
   }
   // Selecting an established team must show actual wrestler names without
   // two extra talent queries; the canonical card continues storing IDs.
   for(const team of [...(view.bookableTeams??[]),...(view.bookableTrios??[])]){
    for(const member of team.members){
     const old=roster.get(member.personId);
     roster.set(member.personId,{...old,personId:member.personId,
      contractId:member.contractId,name:member.name,
      division:old?.division??null,available:true,reason:"AVAILABLE",
      appearanceFee:member.appearanceFee,creativeControl:member.creativeControl,
      workingConnections:member.workingConnections??old?.workingConnections});
    }
   }
   for(const bout of view.tournamentBouts??[]){
    for(const side of [bout.personA,bout.personB]){
     const old=roster.get(side.personId);
     roster.set(side.personId,{...old,personId:side.personId,
      contractId:side.contractId,name:side.name,
      division:old?.division??null,available:true,reason:"AVAILABLE",
      appearanceFee:side.appearanceFee,creativeControl:side.creativeControl});
    }
   }
   // Rights were verified for this show week by the existing programme read.
   // Reuse them in the editor; never invent a contract for an unavailable rival.
   for(const feud of view.programmes??[]){
    for(const person of feud.cast??[]){
     if(!person.contractId)continue;
     const prior=roster.get(person.personId);
     roster.set(person.personId,{...prior,personId:person.personId,
      name:person.name,contractId:person.contractId,
      division:prior?.division??null,available:true,reason:"AVAILABLE",
      appearanceFee:person.appearanceFee??prior?.appearanceFee??null,
      creativeControl:person.creativeControl??prior?.creativeControl??null});
    }
   }
   for(const p of view.selectedPeople){
    const prior=roster.get(p.personId);
    roster.set(p.personId,{...prior,personId:p.personId,name:p.name,
     division:p.division,alignment:p.alignment??prior?.alignment??null,
     contractId:p.contractId??prior?.contractId??"",appearanceFee:p.appearanceFee,
     creativeControl:p.creativeControl,
     available:prior?.available??false,reason:prior?.reason??"BOOKED",
     inRingQuality:p.inRingQuality,matchCraft:p.matchCraft,presentation:p.presentation,
     stamina:p.stamina,safety:p.safety,fatigue:p.fatigue,wear:p.wear,
     workingConnections:p.workingConnections??prior?.workingConnections});
   }
   expanded=null;dirty=false;needsRevisionRefresh=false;
   pendingRequestId=null;error="";success="";
   port.onDraftChange?.(false);
   if(!initialProgrammeFocusDone){
    initialProgrammeFocusDone=true;
    const selected=view.programmes.find(p=>p.programmeId===port.focusProgrammeId);
    if(selected&&view.canEdit&&port.focusProgrammeIdeaKind){
     const recommended=recommendProgrammeAngles(selected).find(idea=>
      idea.kind===port.focusProgrammeIdeaKind);
     if(recommended){
      const slotId="angle-"+crypto.randomUUID();
      segments.set(slotId,programmeAngleIdeaStarter(selected,slotId,recommended));
      slotBookingSteps.set(slotId,"CAST");
      order.push(slotId);expanded=slotId;startWizard(slotId);
     }
    }
   }
   return true;
  }catch(e){error=errorText(e);return false;}
  finally{loading=false;render();}
 }
 async function findTalent(query:string,append=false){
  if(!picker)return;
  const request=picker;
  const sequence=++talentRequestSequence;
  const cursor=append?request.cursor:null;
  try{
   const page=await port.talent(query,cursor);
   if(picker!==request||sequence!==talentRequestSequence)return;
   picker.query=query;picker.items=append?[...picker.items,...page.talent]:page.talent;
   picker.cursor=page.cursor;
   for(const p of page.talent)roster.set(p.personId,{...p});
   error="";render();
  }catch(e){
   if(picker===request&&sequence===talentRequestSequence){error=errorText(e);render();}
  }
 }
 function pickFor(slotId:string,side:number,member:number){
  picker={slotId,side,member,query:"",cursor:null,items:[],sort:"POPULARITY",division:"ALL"};
  render();
  void findTalent("");
 }
 async function startFocusedBooking(kind:"MATCH"|"ANGLE"){
  if(!focusedPerson||!view?.canEdit||saving||focusBusy)return;
  const person=focusedPerson;
  focusBusy=true;error="";render();
  try{
   // A dossier describes today's World, not necessarily the show's week.
   // The canonical show-scoped talent RPC verifies exact signed rights.
   const result=await port.talent(person.name,null);
   const eligible=result.talent.find(p=>p.personId===person.personId);
   if(!eligible||!eligible.available){
    error=person.name+" cannot be booked for this show's week. Check "+
     "contract dates, medical clearance and the show schedule.";
    return;
   }
   if(kind==="MATCH"&&[...matches.values()].some(m=>
    assignedIds(m).includes(person.personId))){
    error=person.name+" is already in a match on this card.";
    return;
   }
   const pick={personId:eligible.personId,contractId:eligible.contractId};
   roster.set(eligible.personId,{...eligible});
   const id=(kind==="MATCH"?"match-":"angle-")+crypto.randomUUID();
   if(kind==="MATCH"){
    matches.set(id,assignPerformer(newEditorMatch(id,"SINGLES"),0,0,pick));
    guidedPickerSlots.add(id);
   }else{
    // A promo starts with a verified speaker; the booker still scripts it.
    segments.set(id,addSegmentPerson(newEditorSegment(id,"PROMO"),"actors",pick));
   }
   focusedPerson=null;order.push(id);expanded=id;
   slotBookingSteps.set(id,"CAST");
   resetGuideScroll=true;startWizard(id);
  }catch(e){error=errorText(e);}
  finally{focusBusy=false;render();}
 }
 async function startEarnedTitleChallenge(){
  if(!focusedChallenge||!view?.canEdit||saving||focusBusy)return;
  const focus=focusedChallenge;focusBusy=true;error="";render();
  try{
   const title=view.championships.find(t=>
    t.championshipId===focus.championshipId&&t.division==="SINGLES");
   if(!title||title.vacant||title.holderId!==focus.holderId){
    error="The championship holder changed. Reopen My Champions to "+
     "check the real current challenger and title status.";
    return;
   }
   if([focus.holderId,focus.challengerId].some(personId=>
     [...matches.values()].some(m=>assignedIds(m).includes(personId)))){
    error="One of these wrestlers is already in a match on this card.";
    return;
   }
   // A ranking never grants booking rights. Revalidate the actual signed
   // agreements and medical clearance for this selected show's week.
   const pages=await Promise.all([focus.holderName,focus.challengerName]
    .map(name=>port.talent(name,null)));
   const ids=[focus.holderId,focus.challengerId];
   const selected=pages.map((page,i)=>page.talent.find(x=>
    x.personId===ids[i]&&x.available));
   if(selected.some(x=>!x)){
    error="The champion or challenger is unavailable for this show's week. "+
     "Check contract dates and medical clearance.";
    return;
   }
   const [champ,challenger]=selected;
   if(!champ||!challenger||champ.division!==challenger.division||
      title.bookingDivision&&title.bookingDivision!==champ.division){
    error="These wrestlers cannot challenge for the same championship division.";
    return;
   }
   roster.set(champ.personId,{...champ});
   roster.set(challenger.personId,{...challenger});
   const id="match-"+crypto.randomUUID();
   let match=newEditorMatch(id,"SINGLES");
   match=assignPerformer(match,0,0,{personId:champ.personId,contractId:champ.contractId});
   match=assignPerformer(match,1,0,{personId:challenger.personId,contractId:challenger.contractId});
   matches.set(id,{...match,championshipId:focus.championshipId});
   guidedPickerSlots.add(id);
   focusedChallenge=null;order.push(id);expanded=id;
   slotBookingSteps.set(id,"CAST");resetGuideScroll=true;startWizard(id);
   // Only the manager's final confirmation and Save may persist this match.
  }catch(e){error=errorText(e);}
  finally{focusBusy=false;render();}
 }
 function chooseTalent(p:TalentPage["talent"][number]){
  if(!picker||!p.available)return;
  if(picker.role==="RUN_IN"){
   const match=matches.get(picker.slotId);
   if(!match)return;
   if(assignedIds(match).includes(p.personId)){
    error="A run-in needs someone outside the match.";render();return;
   }
   setMatch(match.slotId,{...match,interference:{
    personId:p.personId,contractId:p.contractId,
    aidedSide:match.winnerSide===0?"A":"B",plannedOutcome:"SUCCESS"
   }});
   picker=null;render();return;
  }
  if(picker.role){
   const current=segments.get(picker.slotId);
   if(!current)return;
   try{
    segments.set(current.slotId,addSegmentPerson(current,picker.role,{
     personId:p.personId,contractId:p.contractId}));
    picker=null;markDirty();render();
   }catch(e){error=errorText(e);render();}
   return;
  }
  const target=matches.get(picker.slotId);
  if(!target)return;
  const current=target.teams[picker.side]?.[picker.member];
  const used=[...matches.values()].flatMap(m=>assignedIds(m));
  if(used.includes(p.personId)&&current?.personId!==p.personId){
   error="A wrestler can only compete in one match per show";render();return;
  }
  try{
   const updated=assignPerformer(target,picker.side,picker.member,{
    personId:p.personId,contractId:p.contractId});
   if(guidedPickerSlots.has(picker.slotId)){
    // The WGM-inspired selector stays open while the booker fills both
    // sides; switching tabs never reloads the same bounded roster page.
    const next=updated.teams.flatMap((team,side)=>team.map((member,index)=>
     member?null:{side,index})).find(x=>x!==null);
    if(next){picker.side=next.side;picker.member=next.index;}
    else picker=null;
   }else picker=null;
   matches.set(target.slotId,updated);markDirty();render();
  }catch(e){error=errorText(e);render();}
 }
 function chooseRunInTalent(slotId:string){
  picker={slotId,side:0,member:0,role:"RUN_IN",query:"",cursor:null,items:[],
   sort:"POPULARITY",division:"ALL"};
  render();void findTalent("");
 }
 function chooseSegmentTalent(slotId:string,role:"actors"|"targets"){
  picker={slotId,side:role==="actors"?0:1,member:0,role,query:"",cursor:null,
   items:[],sort:"POPULARITY",division:"ALL"};
  const linked=view?.programmes.find(p=>p.programmeId===segments.get(slotId)?.programmeId);
  picker.showOther=!linked||!linked.cast?.length;
  render();if(!linked)void findTalent("");
 }
 async function loadStableChoices(){
  if(stableChoices!==null||stableChoicesLoading||!port.stableChoices)return;
  stableChoicesLoading=true;
  try{
   stableChoices=await port.stableChoices();
   for(const stable of stableChoices)for(const member of stable.members??[]){
    const old=roster.get(member.personId);
    roster.set(member.personId,{...old,personId:member.personId,
     name:member.name,contractId:member.contractId,
     division:old?.division??null,available:true,reason:"AVAILABLE"});
   }
  }catch(e){error=errorText(e);stableChoices=[];}
  finally{stableChoicesLoading=false;render();}
 }
 async function loadSpecialMoments(){
  if(specialOwned!==null||specialBusy||!port.specialMoments)return;
  specialBusy=true;render();
  try{specialOwned=await port.specialMoments();error="";}
  catch(e){error=errorText(e);}
  finally{specialBusy=false;render();}
 }
 function editSegment(s:EditorSegment,patch:Partial<EditorSegment>){
  segments.set(s.slotId,{...s,...patch});markDirty();render();
 }
 function edit(match:EditorMatch,patch:Partial<EditorMatch>){
  setMatch(match.slotId,{...match,...patch});
 }
 async function save(){
  if(!mutable()||!view||needsRevisionRefresh)return;
  try{
   if(inProgressWizards.size)
    throw new Error("Complete or cancel the open booking before saving the running order.");
   const incomplete=order.map((slotId,index)=>({index,slotId,match:matches.get(slotId),angle:segments.get(slotId)}))
    .find(x=>x.match&&!matchCastingReadiness(x.match).complete||
     x.angle&&!angleCastingReadiness(x.angle).complete);
   if(incomplete){
    throw new Error("Slot "+(incomplete.index+1)+": "+
     (incomplete.match?matchCastingReadiness(incomplete.match).hint:
      angleCastingReadiness(incomplete.angle!).hint));
   }
   const segmentPayloads=[...segments.values()].map(s=>{
    try{return {slotId:s.slotId,payload:buildEditorSegment(s),programmeId:s.programmeId};}
    catch(e){throw new Error("Slot "+(order.indexOf(s.slotId)+1)+" (angle): "+errorText(e));}
   });
   const payloads=[...matches.values()].map(m=>{
    try{return {slotId:m.slotId,payload:buildBookedMatch(m)};}
    catch(e){throw new Error("Slot "+(order.indexOf(m.slotId)+1)+" (match): "+errorText(e));}
   });
   if(!payloads.length)throw new Error("Book at least one match");
   const usedMinutes=payloads.reduce((n,m)=>n+m.payload.plannedLengthMinutes,0)+
    segmentPayloads.reduce((n,a)=>n+(a.payload.durationMinutes??5),0);
   if(view.bookingClass==="REGULAR"&&usedMinutes>120)
    throw new Error("Your card needs "+usedMinutes+" minutes but only has 120. Reduce match or angle durations.");
   const all=payloads.flatMap(m=>m.payload.participants.map(p=>p.personId));
   if(new Set(all).size!==all.length)
    throw new Error("One wrestler cannot be in two matches");
   saving=true;error="";success="";render();
   const requestId=pendingRequestId??(pendingRequestId=crypto.randomUUID());
   const result=await port.save({requestId,expectedRevision:view.worldRevision,
    matches:payloads,segments:segmentPayloads,runningOrder:order});
   if(result.status==="STALE"){
    // World revision is shared between promotions. Never discard a player's
    // locally authored card just because a rival negotiated a contract.
    pendingRequestId=null;
    needsRevisionRefresh=true;
    await refreshRevisionKeepingDraft();
    return;
   }
   if(result.status!=="APPLIED"&&result.status!=="REPLAYED")
    throw new Error("The booking command was not confirmed. Keep your draft and retry.");
   const previous=result.status;
   if(await load())
    success=previous==="REPLAYED"?"Booking already saved":"Show card saved";
   else
    error="The booking was accepted, but its refreshed card could not load. Retry without changing your selections.";
  }catch(e){error=errorText(e);}
  finally{saving=false;render();}
 }
 async function refreshRevisionKeepingDraft(){
  if(!view||!dirty||!needsRevisionRefresh)return;
  const prior=view;
  try{
   const fresh=await port.load();
   const changed=hasConcurrentCardChange(prior,fresh);
   view=fresh;
   for(const person of fresh.selectedPeople){
    const existing=roster.get(person.personId);
    roster.set(person.personId,{...existing,personId:person.personId,
     name:person.name,division:person.division,alignment:person.alignment??existing?.alignment??null,
     contractId:person.contractId??existing?.contractId??"",
     appearanceFee:person.appearanceFee??existing?.appearanceFee,
     creativeControl:person.creativeControl??existing?.creativeControl,
     available:existing?.available??false,
     reason:existing?.reason??"BOOKED",
     inRingQuality:person.inRingQuality,matchCraft:person.matchCraft,
     presentation:person.presentation,stamina:person.stamina,
     safety:person.safety,fatigue:person.fatigue,wear:person.wear});
   }
   needsRevisionRefresh=false;
   error=changed?
    "This show's saved card changed elsewhere. Your unsaved booking is still here. Review it before choosing Save card to replace the latest version.":
    "Another manager changed the World. Your unsaved booking is preserved. Review it and choose Save card again.";
   port.onDraftChange?.(true);
  }catch(e){
   error="Could not check the new World revision. Your unsaved booking is preserved. "+
    errorText(e);
  }finally{render();}
 }
 async function requestAgreement(slotId:string,personId:string){
  if(!mutable()||!view||dirty||view.ready||!port.requestCreativeConsent)return;
  saving=true;error="";success="";render();
  try{
   const response=await port.requestCreativeConsent({
    slotId,personId,requestId:crypto.randomUUID(),
    expectedRevision:view.worldRevision
   }) as {status?:string;result?:{decision?:string}};
   const current=await load();
   if(response.status==="STALE")
    error="The card has changed. Review the latest terms before asking again.";
   else if(!current)
    error="Consent reply received but the card could not be refreshed. Reload before proceeding.";
   else if(response.status!=="APPLIED"&&response.status!=="REPLAYED")
    error="Consent was not confirmed. Review the latest terms.";
   else success=response.result?.decision==="DECLINED"?
    "The wrestler declined these terms. You can change the proposed match.":
    "The wrestler has agreed to the match as written.";
  }catch(e){error=errorText(e);}
  finally{saving=false;render();}
 }
 async function requestDraftAgreement(m:EditorMatch,personId:string){
  const feedbackKey=m.slotId+":"+personId;
  const name=roster.get(personId)?.name??personId;
  const record=(text:string,failed:boolean)=>{
   draftConsentFeedback.set(feedbackKey,{name,text,failed});
   error="";success="";render();
  };
  if(!view||!dirty||!mutable()||view.ready||!port.requestCreativeConsent){
   error="The draft cannot be discussed now. Review the current card and try again.";
   record(error,true);return;
  }
  if(!matchCastingReadiness(m).complete){
   error="Complete the match before requesting approval.";record(error,true);return;
  }
  let proposedMatch:ReturnType<typeof buildBookedMatch>;
  try{proposedMatch=buildBookedMatch(m);}
  catch(e){error=errorText(e);record(error,true);return;}
  draftConsentFeedback.delete(feedbackKey);
  saving=true;error="";success="";render();
  try{
   const response=await port.requestCreativeConsent({
    slotId:m.slotId,personId,proposedMatch,requestId:crypto.randomUUID(),
    expectedRevision:view.worldRevision
   }) as {status?:string;result?:{decision?:string}};
   // The consent command advances the World revision. Preserve the complete
   // unsaved booking, including unrelated segments, on a revision refresh.
   needsRevisionRefresh=true;await refreshRevisionKeepingDraft();
   if(response.status==="STALE")
    error="The World changed. Your draft is intact; review before asking again.";
   else if(response.status!=="APPLIED"&&response.status!=="REPLAYED")
    error="Agreement was not confirmed. Your draft is preserved.";
   else{
    error="";
    success=response.result?.decision==="DECLINED"?
     "Wrestler declined this exact script. Try another finish or opponent.":
     "Wrestler agreed to this draft. Save the exact match to keep approval.";
   }
  }catch(e){error=errorText(e);}
  finally{
   saving=false;
   const response=error||success||"Consent was not confirmed. Review the match.";
   record(response,Boolean(error)||response.toLowerCase().includes("declined"));
  }
 }
 async function confirm(){
  if(!mutable()||!view||dirty||view.ready||!port.confirmReady)return;
  saving=true;error="";success="";render();
  try{
   const response=await port.confirmReady({requestId:crypto.randomUUID(),
    expectedRevision:view.worldRevision});
   const loaded=await load();
   if(response.status==="STALE")
    error="The show has changed. Review the latest lineup and confirm again.";
   else if(!loaded)
    error="Confirmation response received but the card could not refresh. Reload and verify readiness.";
   else if(response.status==="APPLIED"||response.status==="REPLAYED")
    success="Your card is confirmed for the weekly deadline";
   else error="The show was not confirmed. Review and try again.";
  }catch(e){error=errorText(e);}
  finally{saving=false;render();}
 }
 let activeEditShade:HTMLElement|null=null;
 let activePickerShade:HTMLElement|null=null;
 function render(){
  // Keep one modal per mounted editor. Foreground sheets are portalled out
  // of the scrolling card and its animated containing block.
  const priorModal=activeEditShade?.querySelector<HTMLElement>(".ppw-card-edit-sheet")??null;
  const previousScroll=resetGuideScroll?0:priorModal?.scrollTop??0;
  resetGuideScroll=false;
  activeEditShade?.remove();activeEditShade=null;
  activePickerShade?.remove();activePickerShade=null;
  root.replaceChildren();
  root.classList.add("ppw-editor","ppw-card-booking");
  root.dataset.broadcastPackage=broadcastPackageClass(view?.broadcastPackage);
  root.classList.toggle("ppw-editing-card",expanded!==null);
  const top=el("header","ppw-top");
  if(port.openPlanner)top.append(button("← Planner",()=>port.openPlanner?.(),
   dirty||saving,"ppw-card-back"));
  if(dirty&&needsRevisionRefresh&&!saving)
   top.append(button("Refresh booking status (keep edits)",()=>{
    void refreshRevisionKeepingDraft();
   },false,"ppw-card-retry-status"));
  if(dirty&&!saving)top.append(button("Discard unsaved edits",()=>{
   if(window.confirm("Discard the changes you have not saved to this show?"))
    void load();
  },false,"ppw-card-discard"));
  top.append(el("div","ppw-eyebrow","CREATIVE / SHOW BOOKING"),
   el("h1","","The Card"));
  const headline=el("p","ppw-muted",loading?"Loading your show…":
   view?"Year "+view.year+" · Week "+view.week+" · "+
    (view.canEdit?"Booking open":"Read only"):"Your next show");
  top.append(headline);
  if(view){
   const spotlight=el("div","ppw-card-show-identity");
   const marquee=el("div","ppw-card-show-copy");
   marquee.append(el("span","ppw-eyebrow",view.bookingClass==="PREMIUM"?
    "PREMIUM EVENT":"THIS WEEK'S SHOW"),
    el("strong","",view.showName??(view.bookingClass==="PREMIUM"?
     "Premium event":"Weekly show")),
    el("span","",view.promotionName));
   const location=el("div","ppw-card-show-location");
   location.append(el("span","",view.venueName??"Venue not selected"),
    el("span","",view.marketName??"Market to be confirmed"),
    el("span","",view.day===null?"Show day pending":
     ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"][view.day-1]??"Show day pending"));
   spotlight.append(marquee,location);top.append(spotlight);
  }
  root.append(top);
  if(error&&expanded===null)root.append(el("p","ppw-alert ppw-error",error));
  if(success&&expanded===null)root.append(el("p","ppw-alert ppw-success",success));
  if(!view){
   if(!loading)root.append(button("Retry",()=>{void load();}));
   return;
  }
  // A wizard is not on the card until Complete. Its provisional selections
  // must not silently change visible slot counts, show-time or payroll.
  const committedOrder=order.filter(id=>!inProgressWizards.has(id));
  const committedMatches=committedOrder.flatMap(id=>
   matches.has(id)?[matches.get(id)!]:[]);
  const committedSegments=committedOrder.flatMap(id=>
   segments.has(id)?[segments.get(id)!]:[]);
  const castReady=committedMatches.filter(x=>matchCastingReadiness(x).complete).length+
   committedSegments.filter(x=>angleCastingReadiness(x).complete).length;
  // The run-down already shows match/angle minutes. Repeating six pill counters
  // adds noise on an iPhone. Show only the state that affects the next action.
  const state=el("p","ppw-card-status-line");
  const missing=Math.max(0,committedOrder.length-castReady);
  state.dataset.state=dirty?"UNSAVED":view.ready?"CONFIRMED":
   missing?"NEEDS_ATTENTION":"READY";
  state.append(el("strong","",dirty?"Unsaved changes":
   view.ready?"Show confirmed":
   !committedOrder.length?"Start building your card":
   missing?missing+" slot"+(missing===1?" needs":"s need")+" attention":
   "Card ready to confirm"));
  if(dirty||missing)state.append(el("span","",dirty&&missing?
   " · "+missing+" slot"+(missing===1?" needs":"s need")+" attention":
   dirty?" · Save before confirming":" · Finish casting to continue"));
  root.append(state);
  // Signed renewals can become effective after a future show was drafted.
  // The manager must explicitly update local picks and save again; no hidden
  // World command or change to a certified historical card is permitted.
  const currentRights=reconcileDraftAgreements([...matches.values()],
   [...segments.values()],view.selectedPeople);
  if(currentRights.changedPersonIds.length&&view.canEdit&&!view.ready){
   const notice=el("section","ppw-card-contract-refresh");
   notice.append(el("strong","","Updated signed agreements"),
    el("p","",currentRights.changedPersonIds.length+" wrestler"+
     (currentRights.changedPersonIds.length===1?" has":"s have")+
     " a different eligible agreement for this show's week."));
   notice.append(button("Use current signed agreements",()=>{
    for(const match of currentRights.matches)matches.set(match.slotId,match);
    for(const segment of currentRights.segments)segments.set(segment.slotId,segment);
    for(const personId of currentRights.changedPersonIds){
     const selected=view?.selectedPeople.find(p=>p.personId===personId);
     const previous=roster.get(personId);
     if(selected?.contractId&&previous)roster.set(personId,{
      ...previous,contractId:selected.contractId,
      appearanceFee:selected.appearanceFee??previous.appearanceFee,
      creativeControl:selected.creativeControl??previous.creativeControl});
    }
    markDirty();render();
   },saving||needsRevisionRefresh,"ppw-primary ppw-refresh-agreements"));
   notice.append(el("small","","Your opponents, finishes and angles stay the same. Save the card to commit these changes; any creative approval must be rechecked."));
   root.append(notice);
  }
  if(focusedPerson){
   const focus=el("section","ppw-card-wrestler-focus");
   focus.append(el("span","ppw-eyebrow","FROM THE WRESTLER DOSSIER"),
    el("strong","",focusedPerson.name),
    el("p","","Choose a match or a promo. The wrestler's actual show-week "+
     "availability is checked before creating an unsaved slot."));
   const actions=el("div","ppw-card-wrestler-actions");
   actions.append(button(focusBusy?"Checking wrestler…":"Start a match",()=>{
    void startFocusedBooking("MATCH");
   },!mutable()||focusBusy,"ppw-primary"),
    button("Start a promo",()=>void startFocusedBooking("ANGLE"),
     !mutable()||focusBusy));
   focus.append(actions);root.append(focus);
  }
  if(focusedChallenge){
   const choice=focusedChallenge;
   const focus=el("section","ppw-card-wrestler-focus ppw-card-title-focus");
   focus.append(el("span","ppw-eyebrow","EARNED TITLE CHALLENGE"),
    el("strong","",choice.holderName+" vs "+choice.challengerName),
    el("p","","The title and signed match rights will be checked for this "+
     "show. You script the finish and choose when to save."));
   const actions=el("div","ppw-card-wrestler-actions");
   actions.append(button(focusBusy?"Checking booking rights…":"Start title match",
    ()=>void startEarnedTitleChallenge(),!mutable()||focusBusy,"ppw-primary"),
    button("Not now",()=>{focusedChallenge=null;render();},focusBusy));
   focus.append(actions);root.append(focus);
  }
  // Staff advice lives in the final booking briefing, not on the running order.
  const concerns=view.creativeConcerns??[];
  if(concerns.length){
   const desk=el("section","ppw-card-creative");
   const pending=concerns.filter(c=>c.requiresConsent&&c.decision!=="APPROVED");
   desk.append(el("span","ppw-eyebrow","WRESTLER AGREEMENTS"),
    el("h3","",pending.length?
     pending.length+" match approval"+(pending.length===1?"":"s")+" to resolve":
     "Your wrestlers' creative terms"));
   if(dirty)desk.append(el("p","ppw-card-creative-advice",
    "These creative decisions apply to the last saved version. Save the revised card to reassess them."));
   for(const c of concerns){
    const box=el("div","ppw-card-creative-item");
    const reason=c.reason==="MATCH_APPROVAL"?
     "Contractual say over this match":
     c.reason==="PROTECTED_LOSS"?
      "A clean or submission loss needs agreement":
      "The wrestler has asked to be consulted";
    const label=dirty?"RECHECK AFTER SAVE":
     c.decision==="APPROVED"?"AGREED":
     c.decision==="DECLINED"?"DECLINED":
     c.requiresConsent?"AWAITING ANSWER":"CONSULTATION";
    const wrestler=el("strong","",c.name);
    const state=el("span","ppw-card-creative-state",label);
    state.dataset.status=dirty?"NOT_REQUESTED":c.decision;
    box.append(wrestler,state,el("p","",reason));
    const match=matches.get(c.slotId);
    const slotNumber=order.indexOf(c.slotId)+1;
    box.append(el("small","ppw-card-creative-match-ref",
     (slotNumber>0?"Slot "+slotNumber+" · ":"")+
     (match?matchLabel(match):"Previously saved match")));
    if(!dirty&&c.decision==="APPROVED"&&c.approvalSource==="STANDING_PROGRAMME")
     box.append(el("small","","Covered by an active Programme agreement."));
    if(!dirty&&c.decision==="APPROVED"&&c.approvalSource==="EXACT_MATCH")
     box.append(el("small","","Approved for the exact saved match."));
    if(match)box.append(button("Edit this match",()=>{
     expanded=c.slotId;render();
    },false,"ppw-card-creative-edit"));
    if(!dirty&&c.requiresConsent&&c.decision==="NOT_REQUESTED"&&
     port.requestCreativeConsent&&view.canEdit&&!view.ready)
     box.append(button("Ask "+c.name,()=>void requestAgreement(c.slotId,c.personId),
      saving,"ppw-card-creative-ask"));
    if(c.decision==="DECLINED")
     box.append(el("small","",
      "They won't agree to this version. Reconsider the finish, opponents or assignment."));
    desk.append(box);
   }
   root.append(desk);
  }
  // Match timing is already authored and available in memory. Present only a
  // truthful partial estimate: angles and entrances have their own air-time.
  const matchMinutes=committedMatches.reduce((n,m)=>n+m.plannedLengthMinutes,0);
  const angleMinutes=committedSegments.reduce((n,a)=>n+a.durationMinutes,0);
  const usedMinutes=matchMinutes+angleMinutes;
  const airtime=el("section","ppw-card-airtime");
  const clock=el("div","ppw-card-airtime-heading");
  clock.append(el("span","ppw-eyebrow","SHOW RUNDOWN"),
   el("strong","",view.bookingClass==="REGULAR"?
    usedMinutes+" / 120 min":
    usedMinutes+" min booked"));
  airtime.append(clock);
  if(view.bookingClass==="REGULAR"){
   const track=el("div","ppw-card-airtime-track");
   track.setAttribute("role","progressbar");
   track.setAttribute("aria-label","Total match and angle minutes against the television running-time guide");
   track.setAttribute("aria-valuemin","0");track.setAttribute("aria-valuemax","120");
   track.setAttribute("aria-valuenow",String(Math.min(120,usedMinutes)));
   const progress=el("span","ppw-card-airtime-fill");
   progress.style.width=Math.min(100,usedMinutes/120*100)+"%";
   if(usedMinutes>120)track.classList.add("ppw-card-airtime-overrun");
   track.append(progress);airtime.append(track);
  }
  airtime.append(el("small","",matchMinutes+" min matches · "+angleMinutes+" min angles"+
   (view.bookingClass==="REGULAR"?" · "+Math.max(0,120-usedMinutes)+" min unallocated":"")));
  if(view.bookingClass==="REGULAR"&&usedMinutes>110)
   airtime.append(el("small","ppw-card-time-warning",usedMinutes>120?
    "Over the TV limit — shorten your booking to save.":
    "Very little time left for entrances, breaks and commentary."));
  root.append(airtime);
   const participation=[
    ...committedMatches.flatMap(m=>[
     ...m.teams.flatMap(side=>side.flatMap(person=>person?[person.personId]:[])),
     ...(m.interference?[m.interference.personId]:[])
    ]),
    ...committedSegments.filter(s=>s.kind!=="VIDEO_PACKAGE")
     .flatMap(s=>[...s.actors,...s.targets].map(p=>p.personId))
   ];
   const feeEstimate=forecastCardAppearanceFees(participation,roster);
   const finance=bookingFinanceBrief(view.bookingFinancials,feeEstimate,
    (view.year-1)*52+view.week-1);
   if(feeEstimate.performers||finance){
    const money=(n:number)=>"$"+Math.round(n).toLocaleString("en-GB");
    const costs=el("details","ppw-card-appearance-cost") as HTMLDetailsElement;
    costs.append(el("summary","","Show talent fees · "+money(feeEstimate.amount)+
     (feeEstimate.complete?"":" + unknown")));
    costs.append(el("p","",feeEstimate.performers+" wrestlers · "+
     (feeEstimate.complete?"All fees known":feeEstimate.unknown+" fees unknown")+
     ". Live match, angle and run-in appearances count once per show."));
    if(finance){
     const briefing=el("div","ppw-card-financial-baseline");
     const row=(title:string,value:string)=>{
      const line=el("div","ppw-card-financial-line");
      line.append(el("span","",title),el("strong","",value));return line;
     };
     if(finance.talentLimit!==null)
      briefing.append(row("Show talent limit",money(finance.talentLimit)));
     briefing.append(row("Wages + staff / week",money(finance.weeklyGuaranteedOutgoings)));
     if(finance.weeklyFixedMargin!==null){
      briefing.append(row("4-week baseline",money(finance.fourWeeks!)),
       row("8-week baseline",money(finance.eightWeeks!)));
     }
     if(finance.breachesTalentLimit)
      briefing.append(el("p","ppw-card-financial-warning",
       "Known fees exceed the show talent limit. Review the cast or the spending plan in Finances."));
     else if(finance.mayBreachTalentLimit)
      briefing.append(el("p","ppw-card-financial-warning",
       "An unknown appearance fee could exceed the show talent limit."));
     if(finance.projectedBelowReserve)
      briefing.append(el("p","ppw-card-financial-warning",
       "Known show fees would leave less than the selected cash reserve before ticket income."));
     briefing.append(el("small","",
      "Scenario, not a cash forecast: current balance, flat income, wages, staff and overhead. "+
      "This card's fees count once within its show week. "+
      "Excludes tickets, venues, production, travel, other shows and future contract changes."));
     costs.append(briefing);
    }
    root.append(costs);
   }
  const toolbar=el("div","ppw-toolbar");
  // Match size and rules belong to the first guided screen, not a dropdown
  // taking up room above the actual running order.
  // One authoritative booking editor. There are no competing Quick/Advanced forms.
  const actions=el("div","ppw-experience-actions");
  actions.append(button("+ Add match",()=>{
   const id="match-"+crypto.randomUUID();
   matches.set(id,newEditorMatch(id,formatChoice));
   guidedPickerSlots.add(id);
   slotBookingSteps.set(id,"SETUP");
   order.push(id);expanded=id;startWizard(id);
  },!mutable(),"ppw-primary ppw-action-match"),
   button("+ Add angle",()=>{
    const id="angle-"+crypto.randomUUID();
    segments.set(id,newEditorSegment(id));
    slotBookingSteps.set(id,"SETUP");
    order.push(id);expanded=id;startWizard(id);
    if(specialOwned===null&&port.specialMoments)void loadSpecialMoments();
   },!mutable(),"ppw-add-angle ppw-action-angle"));
  toolbar.append(actions);root.append(toolbar);
  const tournamentFixtures=(view.tournamentBouts??[]).filter(b=>
   ![...matches.values()].some(m=>m.tournamentId===b.tournamentId&&
    m.tournamentBoutNo===b.boutNo));
  if(tournamentFixtures.length&&mutable()){
   const tournament=el("section","ppw-card-tournament");
   const heading=el("div","ppw-card-tournament-heading");
   heading.append(el("strong","","Tournament fixtures"),
    el("span","",tournamentFixtures.length+" ready to book"));
   tournament.append(heading);
   for(const bout of tournamentFixtures){
    const row=el("div","ppw-card-tournament-fixture");
    const label=el("div","ppw-card-tournament-names");
    label.append(el("small","",bout.tournamentName+" · "+
     tournamentBoutLabel(bout.entrantsCount,bout.boutNo)),
     el("strong","",bout.personA.name+" vs "+bout.personB.name));
    row.append(label,button("Book bout",()=>{
     if([...matches.values()].some(m=>assignedIds(m).some(id=>
      id===bout.personA.personId||id===bout.personB.personId))){
      error="These tournament wrestlers are already booked on the card.";render();return;
     }
     const id="match-"+crypto.randomUUID();
     matches.set(id,{...newEditorMatch(id,"SINGLES"),
      teams:[[{personId:bout.personA.personId,contractId:bout.personA.contractId}],
       [{personId:bout.personB.personId,contractId:bout.personB.contractId}]],
      tournamentId:bout.tournamentId,
      tournamentBoutNo:bout.boutNo as 1|2|3|4|5|6|7,
      ...(bout.championshipId?{championshipId:bout.championshipId}:{})});
     order.push(id);expanded=id;slotBookingSteps.set(id,"OUTCOME");startWizard(id);
    },!mutable(),"ppw-card-tournament-book"));
    tournament.append(row);
   }
   root.append(tournament);
  }
  // One optional feud picker. It must not compete with the core Add Match /
  // Add Angle buttons or repeat the Programme Desk's long creative reports.
  if(view.programmes.length){
   const suggestions=el("section","ppw-card-rivalry-launch");
   const head=el("div","ppw-card-rivalry-launch-head");
   head.append(el("strong","","Add a rivalry chapter"));
   if(port.openProgrammes)head.append(button("Manage stories",()=>{
    port.openProgrammes?.();
   },false,"ppw-card-rivalry-manage"));
   suggestions.append(head);
   const selected=view.programmes.find(p=>p.programmeId===focusedRivalryId)??
    view.programmes[0]!;
   focusedRivalryId=selected.programmeId;
   const picks=el("div","ppw-card-rivalry-picks");
   picks.setAttribute("role","group");
   picks.setAttribute("aria-label","Choose a rivalry to book");
   for(const feud of view.programmes){
    const pick=button(feud.label,()=>{
     focusedRivalryId=feud.programmeId;render();
    },false,"ppw-card-rivalry-pick");
    pick.setAttribute("aria-pressed",String(feud.programmeId===selected.programmeId));
    picks.append(pick);
   }
   suggestions.append(picks);
   const actions=el("div","ppw-card-rivalry-shortcuts");
   const occupied=new Set([...matches.values()].flatMap(assignedIds));
   const matchReady=programmeMatchStarter(selected,"preview",occupied);
   if(matchReady.ok){
    actions.append(button("Book rivalry match",()=>{
     const id="match-"+crypto.randomUUID();
     const start=programmeMatchStarter(selected,id,
      new Set([...matches.values()].flatMap(assignedIds)));
     if(!start.ok){error=start.reason;render();return;}
     matches.set(id,start.value);order.push(id);expanded=id;
     slotBookingModes.set(id,"QUICK");slotBookingSteps.set(id,"OUTCOME");
     startWizard(id);
    },!mutable(),"ppw-card-rivalry-match"));
   }
   for(const idea of recommendProgrammeAngles(selected).slice(0,3)){
    const action=button(idea.title,()=>{
     const id="angle-"+crypto.randomUUID();
     segments.set(id,programmeAngleIdeaStarter(selected,id,idea));
     if(selected.cast?.some(x=>x.side==="A")&&
      selected.cast?.some(x=>x.side==="B")){
      slotBookingModes.set(id,"QUICK");slotBookingSteps.set(id,"CAST");
     }
     order.push(id);expanded=id;startWizard(id);
    },!mutable(),"ppw-card-rivalry-add");
    action.title=idea.kind.replaceAll("_"," ").toLowerCase()+" · "+idea.reason;
    actions.append(action);
   }
   if(!matchReady.ok&&actions.childElementCount===0)
    suggestions.append(el("p","ppw-card-story-availability","Book the cast manually."));
   suggestions.append(actions);
   root.append(suggestions);
  }
  const list=el("section","ppw-card-list");
  let editShade:HTMLElement|null=null;
  for(const [i,slotId] of order.entries()){
   const m=matches.get(slotId);
   const segment=segments.get(slotId);
   const card=el("article","ppw-card "+(m?"ppw-match-card":"ppw-angle-card"));
   card.dataset.slot=String(i+1).padStart(2,"0");
   card.dataset.bookingSlotId=slotId;
   const bar=el("div","ppw-card-bar");
   const label=el("div","");
   if(m&&committedOrder.slice(committedOrder.indexOf(slotId)+1)
    .every(id=>!matches.has(id)))card.classList.add("ppw-main-event");
   const angleName=segment?(segment.kind==="INTERFERENCE"?"Ringside disruption":
    ANGLE_TYPES.find(x=>x.value===segment.kind)?.label??"Angle"):"";
   const anglePeople=segment?[
    segment.actors.length?
     (segment.kind==="RESCUE"?"Attacker / rescuer: ":
      ["ATTACK","POST_MATCH_ASSAULT"].includes(segment.kind)?"Attacker: ":
      segment.kind==="INTERRUPTION"?"Interrupter: ":"Featuring: ")+
      segment.actors.map(selectedName).join(", "):"",
    segment.targets.length?
     (segment.kind==="RESCUE"?"Rescued: ":
      ["ATTACK","POST_MATCH_ASSAULT"].includes(segment.kind)?"Victim: ":
      segment.kind==="INTERRUPTION"?"Interrupted: ":
      segment.kind==="CHALLENGE"?"Challenged: ":
      segment.kind==="STABLE_INVITATION"?"Invited: ":
      segment.kind==="STABLE_RECONCILIATION"?"Reconciliation with: ":
      segment.kind==="INTERFERENCE"?"Affected wrestler: ":"Target: ")+
      segment.targets.map(selectedName).join(", "):""
   ].filter(Boolean).join(" · "):"";
   const selectedSpectacle=segment?.specialMoment?
    specialMomentBySku(segment.specialMoment):null;
   const angleDetails=segment?[
    ...(selectedSpectacle?["SPECIAL · "+selectedSpectacle.label]:[]),
    creativeSummary(segment.creativeBeat)].filter(Boolean).join(" · "):"";
   const headline=m?(m.stipulation&&m.stipulation!=="STANDARD"?
    MATCH_STIPULATIONS.find(s=>s.value===m.stipulation)?.label??"Match":
    FORMATS.find(f=>f.value===m.format)?.label??"Match"):angleName;
   label.append(el("span","ppw-eyebrow","SLOT "+(i+1)+" · "+(m?"MATCH":"ANGLE")),
    el("strong","",headline),
    ...(m&&card.classList.contains("ppw-main-event")?[el("span","ppw-main-event-flag","MAIN EVENT")]:[]));
   const lineup=el("small","ppw-card-lineup");
   if(m)lineup.append(el("span","ppw-card-lineup-context",matchSubtitle(m)));
   else{
    lineup.append(el("span","ppw-card-lineup-names",
     anglePeople||"Choose the wrestlers for this moment"));
    lineup.append(el("span","ppw-card-lineup-context",[
     segment?.scene?angleSceneLabel(segment.scene.location):"",
     segment?.scene?angleSceneLabel(segment.scene.purpose):"",
     ...angleDetails.split(" · ").filter(Boolean),
     segment?.durationMinutes+" min"
    ].filter(Boolean).join(" · ")));
   }
   label.append(lineup);
   const status=m?matchCastingReadiness(m):segment?angleCastingReadiness(segment):null;
   if(status&&!status.complete){
    const indicator=el("span","ppw-booking-readiness",status.label);
    indicator.dataset.complete=String(status.complete);
    indicator.title=status.hint;
    label.append(indicator);
   }
   if(m){
    const review=creativeForSlot(slotId,concerns,dirty);
    if(review.required||review.consultation){
     const badge=el("span","ppw-card-match-creative",review.label);
     badge.dataset.state=review.needsSavedReview?"UNSAVED":
      review.declined?"DECLINED":review.unanswered?"REQUIRED":
      review.required?"APPROVED":"CONSULTATION";
     label.append(badge);
    }
   }
   const toggleBooking=()=>{
    expanded=expanded===slotId?null:slotId;render();
    if(segment&&expanded===slotId&&specialOwned===null&&port.specialMoments)
     void loadSpecialMoments();
   };
   // The full text summary is a touch target: players should not have to
   // hit a tiny chevron to edit the completed match or angle.
   label.classList.add("ppw-card-open-zone");
   label.setAttribute("role","button");
   label.setAttribute("tabindex","0");
   label.setAttribute("aria-label","Edit "+(m?"match":"angle")+" in slot "+(i+1)+
    " · "+headline);
   label.onclick=toggleBooking;
   label.onkeydown=event=>{
    if(event.key==="Enter"||event.key===" "){
     event.preventDefault();toggleBooking();
    }
   };
   bar.append(button(expanded===slotId?"▴":"▾",toggleBooking,
    false,"ppw-expand"),label);
   const arrows=el("div","ppw-actions");
   arrows.setAttribute("role","group");
   arrows.setAttribute("aria-label","Reorder "+(m?"match":"angle")+" in slot "+(i+1));
   const linked=[...segments.values()].map(s=>({slotId:s.slotId,
    kind:s.kind,sourceMatchSlotId:s.sourceMatchSlotId}));
   const up=moveLinkedRunningOrder(order,slotId,-1,linked);
   const down=moveLinkedRunningOrder(order,slotId,1,linked);
   const move=(next:string[]|null)=>()=>{
    if(!next||!mutable())return;
    order=next;markDirty();render();
   };
   const earlier=button("↑",move(up),!mutable()||!up,"ppw-reorder-accessible");
   const later=button("↓",move(down),!mutable()||!down,"ppw-reorder-accessible");
   earlier.setAttribute("aria-label","Move "+(m?"match":"angle")+" in slot "+(i+1)+" earlier");
   later.setAttribute("aria-label","Move "+(m?"match":"angle")+" in slot "+(i+1)+" later");
   earlier.title="Move earlier";later.title="Move later";
   // Touch/Pen/Mouse drag handle, while labelled arrows remain the accessible
   // keyboard alternative. No item moves or saves until pointer release.
   const grip=el("span","ppw-card-grip","");
   grip.title="Drag to change running order. Keyboard: focus handle then use Up or Down.";
   grip.setAttribute("role","button");
   grip.setAttribute("tabindex","0");
   grip.setAttribute("aria-label","Reorder "+(m?"match":"angle")+" in slot "+(i+1)+
    " with Up and Down arrow keys");
   grip.onkeydown=event=>{
    if(!mutable())return;
    if(event.key==="ArrowUp"&&up){event.preventDefault();move(up)();}
    if(event.key==="ArrowDown"&&down){event.preventDefault();move(down)();}
   };
   let dragPointer:number|null=null,dragStartY=0,dragging=false,dropId=slotId;
   let pointerX=0,pointerY=0,edgeSpeed=0,edgeFrame=0;
   const chooseTarget=()=>{
    // Coordinate hit testing remains reliable during pointer capture, even
    // when an iPhone browser has lifted the dragged grip above other elements.
    const candidate=[...root.querySelectorAll<HTMLElement>(
     ".ppw-card[data-booking-slot-id]")].find(node=>{
      const box=node.getBoundingClientRect();
      // The dragged handle is narrower than the ticket on mobile. Hit-test
      // vertically against the entire ticket rather than requiring its X span.
      return pointerY>=box.top&&pointerY<=box.bottom;
     });
    const id=candidate?.dataset.bookingSlotId;
    if(!id||id===dropId)return;
    root.querySelector(".ppw-card-drop-target")?.classList.remove("ppw-card-drop-target");
    dropId=id;
    if(dropId!==slotId)candidate?.classList.add("ppw-card-drop-target");
   };
   // Continuous edge scroll exists only while a touch is held near a boundary.
   // It works on long iPhone cards without scrolling or mutating saved World data.
   const edgeStep=()=>{
    edgeFrame=0;
    if(!dragging||dragPointer===null||edgeSpeed===0)return;
    window.scrollBy(0,edgeSpeed);chooseTarget();
    edgeFrame=window.requestAnimationFrame(edgeStep);
   };
   const clearDrag=()=>{
    if(edgeFrame)window.cancelAnimationFrame(edgeFrame);
    edgeFrame=0;edgeSpeed=0;
    root.querySelector(".ppw-card-drop-target")?.classList.remove("ppw-card-drop-target");
    grip.classList.remove("ppw-card-grip-active");
    document.removeEventListener("pointermove",dragMove);
    document.removeEventListener("pointerup",dragFinish);
    document.removeEventListener("pointercancel",clearDrag);
    if(dragPointer!==null&&grip.hasPointerCapture(dragPointer))
     grip.releasePointerCapture(dragPointer);
    dragPointer=null;dragging=false;
   };
   grip.onpointerdown=event=>{
    if(!mutable()||event.button!==0||dragPointer!==null)return;
    grip.dataset.ppwDown=String(event.pointerId);
    event.preventDefault();dragPointer=event.pointerId;dragStartY=event.clientY;
    dropId=slotId;pointerX=event.clientX;pointerY=event.clientY;
    grip.setPointerCapture(event.pointerId);
    document.addEventListener("pointermove",dragMove);
    document.addEventListener("pointerup",dragFinish);
    document.addEventListener("pointercancel",clearDrag);
   };
   const dragMove=(event:PointerEvent)=>{
    grip.dataset.ppwMove=String(event.pointerId)+":"+event.clientY;
    if(dragPointer!==event.pointerId)return;
    pointerX=event.clientX;pointerY=event.clientY;
    if(!dragging&&Math.abs(event.clientY-dragStartY)<9)return;
    dragging=true;grip.classList.add("ppw-card-grip-active");
    chooseTarget();
    const bottom=window.innerHeight-125;
    edgeSpeed=event.clientY<78?-12:event.clientY>bottom?12:0;
    if(edgeSpeed&&!edgeFrame)edgeFrame=window.requestAnimationFrame(edgeStep);
    else if(!edgeSpeed&&edgeFrame){
     window.cancelAnimationFrame(edgeFrame);edgeFrame=0;
    }
   };
   const dragFinish=(event:PointerEvent)=>{
    if(dragPointer!==event.pointerId)return;
    const target=dropId,wasDragging=dragging;
    clearDrag();
    if(!wasDragging||target===slotId||!mutable())return;
    const next=dropLinkedRunningOrder(order,slotId,target,linked);
    if(!next)return;
    order=next;markDirty();render();
   };
   grip.onpointermove=dragMove;
   grip.onpointerup=dragFinish;
   grip.onpointercancel=clearDrag;
   arrows.append(grip,earlier,later);
   if(segment?.kind==="POST_MATCH_ASSAULT"&&segment.sourceMatchSlotId&&
    order[i-1]===segment.sourceMatchSlotId)
    label.append(el("small","ppw-card-linked","Follows its match · moves together"));
   bar.append(arrows);card.append(bar);
   if(m&&m.teams.flat().some(Boolean)){
    const matchup=el("div","ppw-card-matchup");
    if(m.teams.length<=2)for(const [sideIndex,side] of m.teams.entries()){
     if(sideIndex)matchup.append(el("span","ppw-card-versus","VS"));
     const group=el("div","ppw-card-matchup-side");
     // A trio is short enough to name all its wrestlers. Larger squads stay
     // condensed rather than creating an endless running-order ticket.
     for(const person of side.slice(0,3))if(person)group.append(cardIdentity(person));
     if(side.length>3)group.append(el("span","ppw-card-extra-people",
      "+"+(side.length-3)+" more"));
     if(!side.some(Boolean))group.append(el("span","ppw-muted","Choose wrestlers"));
     matchup.append(group);
    }else{
     const entrants=m.teams.map(side=>side.filter((p):p is PersonPick=>p!==null)
      .map(selectedName).join(" & ")).filter(Boolean);
     matchup.append(el("span","ppw-card-multi-lineup",
      m.format==="BATTLE_ROYAL"?
       entrants.slice(0,4).join(" · ")+
        (entrants.length>4?" · +"+(entrants.length-4)+" more entrants":""):
       entrants.join("  VS  ")));
    }
    card.append(matchup);
   }
   if((m&&matchCastingReadiness(m).complete)||
    (segment&&angleCastingReadiness(segment).complete&&Boolean(segment.programmeId))){
    const facts=el("div","ppw-card-booked-facts");
    if(m){
     const winner=m.teams[m.winnerSide]?.filter(
      (person):person is PersonPick=>person!==null).map(selectedName).join(" & ");
     if(winner)facts.append(el("span","","Planned winner · "+winner));
     if(m.championshipId){
      const title=view.championships.find(c=>c.championshipId===m.championshipId);
      facts.append(el("span","","Title match · "+(title?.name??"Championship")));
     }
     if(m.tournamentId)facts.append(el("span","","Tournament bout"));
    }
    if(segment?.programmeId){
     const feud=view.programmes.find(x=>x.programmeId===segment.programmeId);
     if(feud)facts.append(el("span","","Storyline · "+feud.label));
    }
    if(facts.childElementCount)card.append(facts);
   }
   // Broadcast treatments belong to the results/presentation experience,
   // not the working booking card.
   // The movable card remains text-only. Portraits are reserved for the
   // completed Ringside results presentation.
   if(segment&&expanded===slotId){
    const body=el("div","ppw-card-body");
    const readiness=angleCastingReadiness(segment);
    body.append(el("p","ppw-booking-hint",readiness.hint));
    const controls=el("div","ppw-control-grid ppw-angle-controls");
    const setAngle=(kind:EditorSegment["kind"])=>{
     if(["STABLE_INVITATION","STABLE_EXIT","STABLE_RECONCILIATION"].includes(kind))
      void loadStableChoices();
     editSegment(segment,{kind,
      creativeBeat:segment.kind===kind?segment.creativeBeat:
       initialCreativeBeat(kind),
      scene:segment.kind===kind?segment.scene:initialAngleScene(kind),
      specialMoment:null,
      sourceMatchSlotId:segment.kind===kind?segment.sourceMatchSlotId:null,
      stableId:["STABLE_INVITATION","STABLE_EXIT","STABLE_RECONCILIATION"].includes(kind)?
       segment.stableId:null,
      stableDecision:["STABLE_INVITATION","STABLE_RECONCILIATION"].includes(kind)?
       segment.stableDecision:null,
      actors:LIMITED_ACTORS.has(kind)?segment.actors.slice(0,1):
       (kind==="RESCUE"||kind==="TURN")?segment.actors.slice(0,2):segment.actors,
      targets:["CELEBRATION","CONTRACT_SIGNING","DEBUT"].includes(kind)?
       []:["INTERRUPTION","RESCUE","POST_MATCH_ASSAULT"].includes(kind)?
        segment.targets.slice(0,1):segment.targets});
    };
    const goal=angleGoalFor(segment.kind);
    controls.append(el("h3","ppw-angle-workflow-title","2 · What happens?"));
    controls.append(field("Creative direction",selector(goal,
     ANGLE_STORY_GOALS.map(x=>[x.value,x.label]),value=>
      setAngle(firstAngleFor(value as AngleGoal)),!mutable())));
    // Unlocked special moments live alongside ordinary angle types.
    const usual=ANGLE_TYPES.filter(x=>anglesForGoal(goal).includes(x.value));
    const unlocked=SPECIAL_MOMENTS.filter(x=>specialOwned?.includes(x.sku)&&
     anglesForGoal(goal).includes(x.kind));
    if(usual.length||unlocked.length){
     const options:[string,string][]=[...usual.map(x=>[x.value,x.label] as [string,string]),
      ...unlocked.map(x=>[x.sku,"★ "+x.label] as [string,string])];
     controls.append(field("Angle type",selector(segment.specialMoment??segment.kind,
      options,value=>{
       const moment=specialMomentBySku(value);
       if(moment){const scene=segment.kind===moment.kind?
        segment.scene??initialAngleScene(moment.kind):initialAngleScene(moment.kind);
        editSegment(segment,{kind:moment.kind,specialMoment:moment.sku,
         scene:{...scene,location:moment.locations[0]},
         creativeBeat:initialCreativeBeat(moment.kind)});
       }else setAngle(value as EditorSegment["kind"]);
      },!mutable())));
    }
     controls.append(field("Angle duration (minutes)",selector(String(segment.durationMinutes),
     [2,3,4,5,6,8,10,12,15,20,25,30].map(n=>[String(n),n+" min"]),
     value=>editSegment(segment,{durationMinutes:Number(value)}),!mutable())));
    if(supportsCreativeBeat(segment.kind)){
     const beat=segment.creativeBeat??initialCreativeBeat(segment.kind)!;
     for(const option of creativeFields(segment.kind)){
      if(segment.kind==="ATTACK"&&option.name==="objective")continue;
      const value=(beat as unknown as Record<string,string>)[option.name]??"";
      controls.append(field(option.label,selector(value,
       option.options.map(x=>[x.value,x.label]),
       next=>editSegment(segment,{creativeBeat:{
        ...beat,[option.name]:next
       } as SegmentCreativeBeat}),!mutable())));
     }
    }
    if(["STABLE_INVITATION","STABLE_EXIT","STABLE_RECONCILIATION"].includes(segment.kind)){
     if(stableChoices===null&&!stableChoicesLoading)void loadStableChoices();
     controls.append(field("Faction",selector(segment.stableId??"",
      [["",stableChoicesLoading?"Loading stables…":"Choose a stable"],
       ...(stableChoices??[]).map(x=>[x.stableId,x.name])],
      v=>editSegment(segment,{stableId:v||null}),!mutable()||stableChoices===null)));
    }
    if(["STABLE_INVITATION","STABLE_RECONCILIATION"].includes(segment.kind))
     controls.append(field(segment.kind==="STABLE_INVITATION"?
      "Invitation decision":"Reconciliation decision",
      selector(segment.stableDecision??"",
      [["","Choose scripted decision"],["ACCEPTED",
       segment.kind==="STABLE_INVITATION"?"Joins faction":"Reconciles"],
       ["REJECTED",segment.kind==="STABLE_INVITATION"?"Rejects invitation":"Rebuffs the offer"]],
      v=>editSegment(segment,{stableDecision:
       v?v as "ACCEPTED"|"REJECTED":null}),!mutable())));
    if(segment.kind==="TURN"&&eligibleTeams().length){
     const selectedTeam=eligibleTeams().find(t=>t.members.length===segment.actors.length&&
      t.members.every(p=>segment.actors.some(a=>a.personId===p.personId)));
     controls.append(field("Turn a complete tag team",selector(selectedTeam?.teamId??"",
      [["","Choose an established team"],...eligibleTeams().map(t=>[t.teamId,t.name])],
      id=>selectTeamForTurn(segment,id),!mutable())));
    }
    if(segment.kind==="TURN")
     controls.append(field("New alignment",selector(segment.turnTargetAlignment??"",
      [["","No alignment change"],["FACE","Face"],["HEEL","Heel"],
       ["TWEENER","Tweener"]],
      v=>editSegment(segment,{turnTargetAlignment:
       v?v as "FACE"|"HEEL"|"TWEENER":null}),!mutable())));
    if(segment.kind==="VIDEO_PACKAGE")
     controls.append(field("Video purpose",selector(segment.videoPurpose,
      VIDEO_PURPOSES.map(v=>[v,nice(v)]),
      v=>editSegment(segment,{videoPurpose:v as EditorSegment["videoPurpose"]}),!mutable())));
    if(segment.kind==="POST_MATCH_ASSAULT"){
     const eligible=order.flatMap(matchSlot=>{
      const match=matches.get(matchSlot);
      if(!match)return [];
      return [[matchSlot,matchLabel(match)] as [string,string]];
     });
     controls.append(field("After which match?",selector(segment.sourceMatchSlotId??"",
      [["",eligible.length?"Choose the match":"Add a match for this angle"],
       ...eligible],value=>{
        const next=value?attachPostMatchAngle(order,slotId,value):null;
        const selected=value?matches.get(value):null;
        const candidates=new Set(selected?.teams.flat().flatMap(p=>p?[p.personId]:[])??[]);
        segments.set(slotId,{...segment,sourceMatchSlotId:value||null,
         targets:value?segment.targets.filter(p=>candidates.has(p.personId)):
          segment.targets});
        if(next)order=next;
        markDirty();render();
       },!mutable())));
      controls.append(el("p","ppw-angle-guidance",
       "Selecting a match moves this angle immediately after it. If the victim did not compete in that match, choose a new victim."));
     if(!eligible.some(([id])=>id===segment.sourceMatchSlotId))
      controls.append(el("p","ppw-angle-guidance",
       "Choose a wrestler who appeared in the selected match."));
    }
    if(segment.scene){
     const scene=segment.scene;
     // Interview presentation follows its actual stage rather than exposing a
     // second contradictory "Interview setting" picker under What.
     const moveScene=(place:typeof scene.location)=>{
      const beat=segment.creativeBeat;
      const nextBeat=segment.kind==="INTERVIEW"&&beat?.kind==="INTERVIEW"?{
       ...beat,format:(place==="IN_RING"?"IN_RING":
        ["OFFICE","HOTEL_LOBBY"].includes(place)?"SIT_DOWN":"BACKSTAGE") as typeof beat.format
      }:beat;
      editSegment(segment,{scene:{...scene,location:place},creativeBeat:nextBeat});
     };
     controls.append(el("h3","ppw-angle-workflow-title","3 · Where does it happen?"));
     // New scenes use appropriate places. Previously saved locations stay
     // available to edit; changing the angle type starts a fresh scene.
     const selectedSpecial=segment.specialMoment?
      specialMomentBySku(segment.specialMoment):null;
     const suggestedLocations=selectedSpecial?.locations??angleLocationsFor(segment.kind);
     const permitted=(suggestedLocations as readonly string[]).includes(scene.location)?
      suggestedLocations:[...suggestedLocations,scene.location];
     const areas=Object.keys(ANGLE_LOCATION_AREAS).filter(area=>
      permitted.some(place=>angleLocationArea(place)===area)) as
       (keyof typeof ANGLE_LOCATION_AREAS)[];
     if(segment.kind==="VIDEO_PACKAGE"&&scene.location==="VIDEO_SCREEN")
      controls.append(el("p","ppw-angle-guidance ppw-angle-direct-target",
       "Broadcast on the arena screens and television. Select the footage style under What."));
     else controls.append(field("Area",
      selector(angleLocationArea(scene.location),
       areas.map(area=>[area,angleSceneLabel(area)]),
       value=>{
        const area=value as keyof typeof ANGLE_LOCATION_AREAS;
        const first=permitted.find(place=>angleLocationArea(place)===area)!;
        moveScene(first);
       },!mutable())));
     if(segment.kind!=="VIDEO_PACKAGE"||scene.location!=="VIDEO_SCREEN")
      controls.append(field("Exact location",selector(scene.location,
      permitted.filter(place=>angleLocationArea(place)===
       angleLocationArea(scene.location)).map(place=>[place,angleSceneLabel(place)]),
      value=>moveScene(value as typeof scene.location),!mutable())));
     if(segment.kind==="ATTACK"||segment.kind==="POST_MATCH_ASSAULT"){
      controls.append(field("Attack intensity",selector(scene.intensity??"BEATDOWN",
       ANGLE_INTENSITIES.map(v=>[v,angleSceneLabel(v)]),
       value=>{
        const intensity=value as NonNullable<typeof scene.intensity>;
        editSegment(segment,{scene:{...scene,intensity,
         visual:intensity==="WARNING"&&scene.visual==="BLOODIED"?"NONE":scene.visual}});
       },!mutable())));
      controls.append(field("Visible aftermath",selector(scene.visual,
       ANGLE_VISUALS.filter(v=>scene.intensity!=="WARNING"||v!=="BLOODIED")
        .map(v=>[v,angleSceneLabel(v)]),
       value=>editSegment(segment,{scene:{...scene,
        visual:value as typeof scene.visual}}),!mutable())));
     }
     controls.append(el("h3","ppw-angle-workflow-title","4 · Why is this on the show?"));
     const suggestedPurposes=anglePurposesFor(segment.kind);
     const purposes=suggestedPurposes.includes(scene.purpose)?suggestedPurposes:
      [...suggestedPurposes,scene.purpose];
     controls.append(field("Storytelling purpose",selector(scene.purpose,
      purposes.map(v=>[v,angleSceneLabel(v)]),
      value=>{
       const why=value as typeof scene.purpose;
       const beat=segment.creativeBeat;
       const creativeBeat=beat?.kind==="ATTACK"?{...beat,objective:
        (why==="BUILD_TARGET_SYMPATHY"?"BUILD_SYMPATHY":
         why==="BUILD_RIVALRY"?"ESCALATE_RIVALRY":"GENERATE_HEAT") as
          typeof beat.objective}:
        beat?.kind==="DEBUT"?{...beat,objective:
         (why==="BUILD_ANTICIPATION"?"BUILD_EXCITEMENT":
          why==="UNSETTLE_RIVAL"?"UNSETTLE_RIVAL":
          why==="INTRODUCE_WRESTLER"?"ESTABLISH_STAR":"CREATE_MYSTERY") as
           typeof beat.objective}:beat;
       editSegment(segment,{scene:{...scene,purpose:why},creativeBeat});
      },!mutable())));
     controls.append(el("p","ppw-angle-guidance ppw-angle-purpose-disclaimer",
      "This is the booker's intention, not a guaranteed reaction or result."));
    }
    if(view.programmes.length)
     body.append(field("Storyline (optional)",selector(segment.programmeId??"",
      [["","None"],...view.programmes.map(p=>[
       p.programmeId,p.label+" · Heat "+(p.heat??"—")])],
      v=>editSegment(segment,{programmeId:v||null}),!mutable())));
    const linked=view.programmes.find(p=>p.programmeId===segment.programmeId);

    if(linked?.latestFollowUp){
     const followUp=el("p","ppw-card-angle-continuity",
      storyDirectionHint(linked.latestFollowUp,"SEGMENT"));
     body.append(followUp);
    }
    if(!SEGMENT_BOOKING_RULES[segment.kind].allowTargets)
     body.append(el("p","ppw-angle-guidance ppw-angle-direct-target",
      "Want someone to be confronted or called out? Set Creative direction to Challenge or Confrontation, then choose the rival under Targets. A standalone promo or interview has no on-screen target."));

    body.append(el("h3","ppw-angle-workflow-title","1 · Who is involved?"));
    for(const role of ["actors","targets"] as const){
     if(role==="targets"&&!SEGMENT_BOOKING_RULES[segment.kind].allowTargets)continue;
     const section=el("div","ppw-side");
     const specialist=segment.kind==="RESCUE";
     const heading=specialist?role==="actors"?
      "Attacker first · rescuer second":"Wrestler being rescued":
      segment.kind==="INTERRUPTION"?role==="actors"?"Interrupter":"Speaker interrupted":
      segment.kind==="POST_MATCH_ASSAULT"?role==="actors"?"Attacker":"Victim from the match":
      role==="actors"?segment.kind==="INTERVIEW"?"Speaker":
       ["ATTACK","POST_MATCH_ASSAULT"].includes(segment.kind)?"Attacker":
       segment.kind==="CHALLENGE"?"Challenger":"Initiator / featured wrestler":
       segment.kind==="STABLE_EXIT"&&segment.creativeBeat?.kind==="STABLE_EXIT"&&
        ["EXPULSION_SCENE","BEATDOWN"].includes(segment.creativeBeat.departure)?
         "Member being expelled":
       segment.kind==="INTERVIEW"?"Subject (optional)":
       segment.kind==="PROMO"?"Wrestler being discussed (optional)":
       ["ATTACK","POST_MATCH_ASSAULT"].includes(segment.kind)?
        "Target / victim":"Other person involved";
     section.append(el("h3","",heading));
     for(const person of segment[role]){
      const line=el("div","ppw-elimination-row");
      line.append(el("span","",selectedName(person)),
       button("×",()=>editSegment(segment,{[role]:segment[role].filter(p=>p.personId!==person.personId)}),
        !mutable()));
      section.append(line);
     }
     const targetAllowed=SEGMENT_BOOKING_RULES[segment.kind].allowTargets;
     if(role==="actors"||targetAllowed)
      section.append(button("+ Add "+(role==="actors"?
       specialist?(segment.actors.length?"rescuer":"attacker"):
        segment.kind==="INTERRUPTION"?"interrupter":
        ["ATTACK","POST_MATCH_ASSAULT"].includes(segment.kind)?"attacker":
        segment.kind==="INTERVIEW"?"speaker":"performer":
       specialist?"person being rescued":
        segment.kind==="INTERRUPTION"?"speaker":
        segment.kind==="POST_MATCH_ASSAULT"?"wrestler from the match":
        segment.kind==="INTERVIEW"?"subject":"target"),()=>{
       chooseSegmentTalent(slotId,role);
      },!mutable()||segment.actors.length+segment.targets.length>=30||
       (role==="actors"&&segment.actors.length>=SEGMENT_BOOKING_RULES[segment.kind].maxActors)||
       (role==="targets"&&["RESCUE","POST_MATCH_ASSAULT"].includes(segment.kind)&&
        segment.targets.length>=1),"ppw-angle-cast-button"));
     // Existing 2v2/3v3 units are already available from the card projection.
     // Faction members are looked up once, only if the user requests them.
     // Whole-unit shortcuts are for ensemble scenes, not individual
     // membership commands: faction invitation/exit/reconciliation settle
     // one authored wrestler per story beat.
     const ensemble=!["STABLE_INVITATION","STABLE_EXIT",
      "STABLE_RECONCILIATION"].includes(segment.kind);
     const groupRole=ensemble&&(role==="actors"?
      SEGMENT_BOOKING_RULES[segment.kind].maxActors>=3||segment.kind==="TURN":
      !["RESCUE","POST_MATCH_ASSAULT"].includes(segment.kind));
     if(groupRole){
      const groups=[
       ...(view.bookableTeams??[]).map(t=>["team:"+t.teamId,"Team · "+t.name]),
       ...(segment.kind==="TURN"&&role==="actors"?[]:
        (view.bookableTrios??[]).map(t=>["trio:"+t.trioId,"Trio · "+t.name])),
       ...(segment.kind==="TURN"&&role==="actors"?[]:
        (stableChoices??[]).filter(t=>(t.members?.length??0)>0)
         .map(t=>["stable:"+t.stableId,"Faction · "+t.name]))
      ];
      if(groups.length)section.append(field(segment.kind==="TURN"&&role==="targets"?
       "Cast a target group":"Cast a team, trio or faction",
       selector("",[["","Choose a group"],...groups],v=>
        castAngleGroup(segment,role,v),!mutable())));
      if(stableChoices===null&&port.stableChoices&&
       !(segment.kind==="TURN"&&role==="actors"))
       section.append(button(stableChoicesLoading?"Loading factions…":
        "+ Include factions",()=>void loadStableChoices(),!mutable()||stableChoicesLoading,
        "ppw-angle-cast-faction"));
     }
     if(role==="targets"&&REQUIRED_TARGETS.has(segment.kind)&&segment.targets.length===0)
      section.append(el("p","ppw-muted","This angle needs a target."));
     body.append(section);
    }
    body.append(controls);
    body.append(button("Remove angle",()=>{
     segments.delete(slotId);order=order.filter(x=>x!==slotId);
     inProgressWizards.delete(slotId);
     expanded=null;markDirty();render();
    },!mutable(),"ppw-remove"));
    card.append(body);
   }else if(m&&expanded===slotId){
    const body=el("div","ppw-card-body");
    const readiness=matchCastingReadiness(m);
    body.append(el("p","ppw-booking-hint",readiness.hint));
    if(m.tournamentId){
     const bracket=view.tournamentBouts?.find(b=>
      b.tournamentId===m.tournamentId&&b.boutNo===m.tournamentBoutNo);
     const tag=el("div","ppw-tournament-match-note");
     tag.append(el("strong","","Tournament · "+(bracket?.tournamentName??"Bracket")+
      " · "+tournamentBoutLabel(bracket?.entrantsCount??4,m.tournamentBoutNo??0)),
      el("small","","The wrestlers must match the bracket; the selected winner remains yours to script."));
     if(mutable())tag.append(button("Make this a regular match",()=>{
      edit(m,{tournamentId:undefined,tournamentBoutNo:undefined,
       championshipId:undefined});
     }));
     body.append(tag);
    }
    const matchConcerns=concerns.filter(x=>x.slotId===slotId);
    if(matchConcerns.length){
     const review=el("section","ppw-card-match-consents");
     review.append(el("h3","","Creative agreement for this match"));
     if(dirty)review.append(el("p","ppw-card-creative-advice",
      "The current agreements apply to the last saved version. Save to check these edits."));
     for(const issue of matchConcerns){
      const row=el("p","ppw-card-match-consent");
      const status=dirty?"Recheck needed":
       issue.reason==="CONSULTATION_REQUESTED"?"Consultation only":
       issue.decision==="APPROVED"?
        issue.approvalSource==="STANDING_PROGRAMME"?"Programme agreement":
         "Exact match agreed":
       issue.decision==="DECLINED"?"Declined":
       "Approval needed";
      row.append(el("strong","",issue.name+" · "),el("span","",status));
      review.append(row);
      if(!dirty&&issue.requiresConsent&&issue.decision==="NOT_REQUESTED"&&
       port.requestCreativeConsent&&view.canEdit&&!view.ready)
       review.append(button("Ask "+issue.name,()=>{
        expanded=null;void requestAgreement(slotId,issue.personId);
       },saving,"ppw-card-creative-ask"));
      if(!dirty&&issue.decision==="DECLINED"){
       const advice=consentRebookingAdvice(issue,m.plannedFinish);
       if(advice)review.append(el("p","ppw-card-creative-advice",advice));
       if(issue.reason==="PROTECTED_LOSS"&&
        ["CLEAN_PIN","SUBMISSION"].includes(m.plannedFinish)&&view.canEdit&&!view.ready)
        review.append(button("Try a protected finish",()=>{
         edit(m,{plannedFinish:"PROTECTED_FINISH",cheatingWrestlerId:undefined});
        },saving,"ppw-card-creative-edit"));
      }
     }
     body.append(review);
    }
    // A fully cast draft can be discussed before Save Card. No approval
    // is assumed: the server checks the contract, proposed slot and signature.
    if(dirty&&view.canEdit&&!view.ready&&port.requestCreativeConsent&&
      matchCastingReadiness(m).complete){
     const actions=el("section","ppw-card-match-consents ppw-card-draft-consents");
     actions.append(el("h3","","Creative control decisions"));
     const buttons=el("div","ppw-card-consent-buttons");
     const replies=el("div","ppw-card-consent-replies");
     replies.setAttribute("aria-live","polite");
     const offered=new Set<string>();
     for(const [sideNo,side] of m.teams.entries())for(const wrestler of side){
      if(!wrestler||offered.has(wrestler.personId))continue;
      const person=roster.get(wrestler.personId);
      const requires=person?.creativeControl==="FULL_APPROVAL"||
       person?.creativeControl==="PROTECTED_FINISHES"&&sideNo!==m.winnerSide&&
       ["CLEAN_PIN","SUBMISSION"].includes(m.plannedFinish);
      if(!requires)continue;
      offered.add(wrestler.personId);
      const name=person?.name??wrestler.personId;
      buttons.append(button("Ask "+name+" about this draft",
       ()=>void requestDraftAgreement(m,wrestler.personId),saving,"ppw-card-creative-ask"));
      const feedback=draftConsentFeedback.get(m.slotId+":"+wrestler.personId);
      if(feedback){
       const item=el("p","ppw-card-consent-response",feedback.name+" · "+feedback.text);
       item.dataset.level=feedback.failed?"error":"confirmed";
       item.setAttribute("role",feedback.failed?"alert":"status");
       replies.append(item);
      }
     }
     if(offered.size){
      actions.append(buttons);
      if(replies.childElementCount)actions.append(replies);
      body.append(actions);
     }
    }
     const controls=el("div","ppw-control-grid");
    const winnerPicker=el("fieldset","ppw-winner-picker");
    winnerPicker.append(el("legend","","Choose winner"));
    if(m.teams.length>6){
     const select=selector(String(m.winnerSide),m.teams.map((side,index)=>[
      String(index),side.filter((p):p is PersonPick=>p!==null)
       .map(selectedName).join(" & ")||"Entrant "+(index+1)]),
      v=>setMatch(slotId,changeWinner(m,Number(v))),!mutable());
     select.setAttribute("aria-label","Choose winner");
     winnerPicker.append(select);
    }else for(const [sideIndex,side] of m.teams.entries()){
     const names=side.filter((p):p is PersonPick=>p!==null).map(selectedName);
     const label=names.join(" & ")||(m.format==="BATTLE_ROYAL"?
      "Entrant "+(sideIndex+1):"Side "+sideLabel(sideIndex));
     const active=sideIndex===m.winnerSide;
     const choice=button(label,()=>setMatch(slotId,changeWinner(m,sideIndex)),
      !mutable(),"ppw-winner-choice"+(active?" ppw-winner-selected":""));
     choice.setAttribute("aria-pressed",String(active));
     winnerPicker.append(choice);
    }
    controls.append(winnerPicker);
    controls.append(field("Intent",selector(m.intent,
     ["COMPETITIVE","SHOWCASE","DOMINANT","TECHNICAL","HIGH_RISK",
      "STORY","PROTECTIVE","EPIC"].map(x=>[x,nice(x)]),
      v=>setMatch(slotId,changeMatchIntent(m,v)),!mutable())));
    const simFormat=m.format==="MULTI_TEAM"?"MULTI_TEAM":
     ["TRIOS","FOUR_V_FOUR","FIVE_V_FIVE"].includes(m.format)?"LARGE_TEAM":m.format;
    controls.append(field("Stipulation",selector(m.stipulation??"STANDARD",
     compatibleStipulations(simFormat).map(code=>[
      code,MATCH_STIPULATIONS.find(x=>x.value===code)!.label]),
     v=>setMatch(slotId,changeMatchStipulation(m,v as MatchStipulation)),!mutable())));
    const stip=m.stipulation??"STANDARD";
    const impact=stip==="STANDARD"?null:(()=>{
     const detail=MATCH_STIPULATIONS.find(x=>x.value===stip)!;
     const safety=stipulationInjuryRisk(stip);
     const risk=safety>=1.3?"HIGH":safety>=1.15?"ELEVATED":"MODERATE";
     const note=el("p","ppw-angle-guidance ppw-stipulation-impact",
      detail.summary+" · "+risk+" injury exposure"+
      " · Performance depends on wrestler suitability, fitness and match length. No automatic star bonus.");
     return note;
    })();
    controls.append(field("Finish",selector(m.plannedFinish,
     permittedStipulationFinishes(m.stipulation??"STANDARD",simFormat)
      .map(x=>[x,nice(x)]),
      v=>edit(m,{plannedFinish:v,cheatingWrestlerId:undefined}),!mutable())));
    const cheatingSide=m.plannedFinish==="FOREIGN_OBJECT"?m.winnerSide:
     m.plannedFinish==="DISQUALIFICATION"?1-m.winnerSide:-1;
    if(m.format==="SINGLES"&&cheatingSide>=0){
     const cheaters=m.teams[cheatingSide]!.filter((p):p is PersonPick=>p!==null);
     controls.append(field(m.plannedFinish==="DISQUALIFICATION"?
      "Who gets caught cheating?":"Who uses the foreign object?",
      selector(m.cheatingWrestlerId??"",
       [["","Choose wrestler"],...cheaters.map(p=>[p.personId,selectedName(p)])],
       v=>edit(m,{cheatingWrestlerId:v||undefined}),!mutable())));
    }
    const titleDivision=["SINGLES","TRIPLE_THREAT","FOUR_WAY"].includes(m.format)?
     "SINGLES":m.format==="TAG"||
      m.format==="MULTI_TEAM"&&m.teams.every(team=>team.length===2)?"TAG":null;
    if(titleDivision){
     const choices:[string,string][]=[["","Non-title match"],
      ...view.championships.filter(c=>{
        if(c.division!==titleDivision)return false;
        const people=m.teams.flat().filter((x):x is PersonPick=>x!==null);
        const picked=new Set(people.map(x=>roster.get(x.personId)?.division));
        return !c.bookingDivision||!people.length||
         picked.size===1&&picked.has(c.bookingDivision);
       })
       .map(c=>[c.championshipId,c.name+
        (c.vacant?" · VACANT":c.holderName?" · "+c.holderName:"")] as [string,string])];
     controls.append(field("Championship",selector(m.championshipId??"",choices,
      value=>edit(m,{championshipId:value||undefined}),!mutable())));
    }else if(m.championshipId){
     controls.append(el("p","ppw-alert ppw-error",
      "Championships require 2–4 singles wrestlers or teams of two in a tag match. Remove the title before saving."));
    }
    controls.append(field("Minutes",numberField(m.plannedLengthMinutes,
     stipulationMinimumMinutes(m.stipulation??"STANDARD"),60,
     v=>edit(m,{plannedLengthMinutes:v}),!mutable())));
    if(impact)controls.append(impact);
    body.append(controls);
    // One direct run-in choice in Script, never another nested accordion.
    // An existing authored run-in always exposes its fields on reopening.
    if(m.format==="SINGLES"||m.format==="TAG"){
     const run=el("section","ppw-run-in");
     const active=Boolean(m.interference)||openRunIns.has(slotId);
     const heading=el("div","ppw-run-in-header");
     heading.append(el("strong","","Match run-in"));
     if(!active)heading.append(button("+ Add run-in",()=>{
      openRunIns.add(slotId);render();
     },!mutable(),"ppw-run-in-toggle"));
     else if(!m.interference)heading.append(button("Cancel",()=>{
      openRunIns.delete(slotId);render();
     },false,"ppw-run-in-toggle"));
     run.append(heading);
     if(active){
      run.append(button(m.interference?
       "Change wrestler · "+(roster.get(m.interference.personId)?.name??"Selected wrestler"):
       "Choose run-in wrestler",()=>chooseRunInTalent(slotId),!mutable(),"ppw-run-in-person"));
      if(m.interference){
       const spot=m.interference;
       const support=el("div","ppw-run-in-choices");
       support.setAttribute("role","group");
       support.setAttribute("aria-label","Which side?");
       for(const [value,label] of [["A","Help Side A"],["B","Help Side B"]] as const){
        const action=button(label,()=>edit(m,{interference:{...spot,
         aidedSide:value,plannedOutcome:value===(m.winnerSide===0?"A":"B")?
          spot.plannedOutcome:"THWARTED"}}),!mutable(),"ppw-run-in-option");
        action.setAttribute("aria-pressed",String(spot.aidedSide===value));
        support.append(action);
       }
       run.append(el("strong","ppw-run-in-subhead","Supports"),support);
       const result=el("div","ppw-run-in-choices");
       result.setAttribute("role","group");
       result.setAttribute("aria-label","What happens?");
       for(const [value,label] of [["SUCCESS","Run-in succeeds"],
        ["THWARTED","Run-in thwarted"]] as const){
        const action=button(label,()=>edit(m,{interference:{...spot,
         plannedOutcome:value,
         aidedSide:value==="SUCCESS"?(m.winnerSide===0?"A":"B"):spot.aidedSide
        }}),!mutable(),"ppw-run-in-option");
        action.setAttribute("aria-pressed",String(spot.plannedOutcome===value));
        result.append(action);
       }
       run.append(el("strong","ppw-run-in-subhead","Outcome"),result);
       run.append(button("Remove run-in",()=>{
        openRunIns.delete(slotId);edit(m,{interference:undefined});
       },!mutable(),"ppw-run-in-clear"));
      }
     }
     body.append(run);
    }
    if(m.format!=="SINGLES"){
     const snapshots=new Map<string,ConditionSnapshot>();
     for(const [personId,profile] of roster)
      snapshots.set(personId,{inRingQuality:profile.inRingQuality??null,
       matchCraft:profile.matchCraft??null,presentation:profile.presentation??null,
       stamina:profile.stamina??null,safety:profile.safety??null,
       fatigue:profile.fatigue??null,wear:profile.wear??null});
     const condition=bookedConditionReport(m,snapshots);
     if(condition.length){
      const sheet=document.createElement("details");
      sheet.className="ppw-match-style";
      sheet.append(el("summary","","Wrestler condition · all competitors"));
      sheet.append(el("p","ppw-match-style-fineprint",
       "Review the current condition of every booked wrestler. These figures do not confirm medical clearance or creative approval."));
      for(const person of condition){
       const line=el("p","ppw-match-style-fitness-row");
       line.append(el("strong","",roster.get(person.personId)?.name??person.personId),
        el("span","",person.known?
         "Stamina "+person.stamina+" · Safety "+person.safety+
         " · Fatigue "+person.fatigue+" · Wear "+person.wear:
         "Current condition unavailable"));
       sheet.append(line);
      }
      body.append(sheet);
     }
    }
    if(m.format==="SINGLES"){
     const sheet=el("section","ppw-match-style");
     sheet.append(el("h4","","Detailed match direction"));
     const style=editorMatchStyle(m),load=editorStyleLoad(m);
     const dims=el("div","ppw-match-style-grid");
     const names:Record<MatchStyleDimension,string>={
      competitiveness:"Competition",technical:"Technical wrestling",
      story:"Storytelling",intensity:"Intensity",risk:"Risk",epic:"Big-match spectacle"};
     for(const key of MATCH_STYLE_DIMENSIONS){
      const label=el("label","ppw-match-style-control");
      const top=el("span","ppw-match-style-control-top");
      top.append(el("strong","",names[key]),el("output","",String(style[key])));
      const range=document.createElement("input");
      range.type="range";range.min="0";range.max="100";range.step="1";
      range.value=String(style[key]);range.disabled=!mutable();
      range.setAttribute("aria-label",names[key]);
      range.onchange=()=>setMatch(slotId,changeMatchStyle(m,key,Number(range.value)));
      label.append(top,range);dims.append(label);
     }
     sheet.append(dims);
     const workload=el("p","ppw-match-style-load");
     workload.dataset.load=load.band;
     workload.append(el("strong","","Expected workload · "+nice(load.band)),
      el("span","","Physical "+Math.round(load.physical)+" · Creative "+Math.round(load.creative)));
     sheet.append(workload);
     body.append(sheet);
    }
    if(m.format==="BATTLE_ROYAL"||m.format==="MULTI_TEAM"){
     const sizing=el("div","ppw-sizing");
     sizing.append(field(m.format==="BATTLE_ROYAL"?"Entrants":"Teams",
      numberField(m.teams.length,m.format==="BATTLE_ROYAL"?6:3,
       m.format==="BATTLE_ROYAL"?30:6,
       value=>changeSize(m,value),!mutable())));
     if(m.format==="MULTI_TEAM")
      sizing.append(field("Wrestlers per team",
       numberField(m.teams[0]!.length,2,5,
        value=>changeSize(m,m.teams.length,value),!mutable())));
     body.append(sizing);
    }
    for(let side=0;side<m.teams.length;side++){
     const sideCard=el("div","ppw-side");
     sideCard.append(el("h3","",m.format==="BATTLE_ROYAL"?
      "Entrant "+(side+1):"Side "+sideLabel(side)));
     if(m.format==="TRIOS"&&m.teams[side]!.length===3&&eligibleTrios().length){
      const booked=eligibleTrios().find(t=>
       t.members.every(p=>m.teams[side]!.some(chosen=>chosen?.personId===p.personId)));
      sideCard.append(field("Choose trio",selector(booked?.trioId??"",
       [["","Select a complete trio"],...eligibleTrios().map(t=>[t.trioId,t.name])],
       id=>selectTrioForMatch(m,side,id),!mutable())));
     }
     if(m.teams[side]!.length===2&&eligibleTeams().length){
      const booked=eligibleTeams().find(t=>t.members.length===2&&
       t.members.every(p=>m.teams[side]!.some(chosen=>chosen?.personId===p.personId)));
      sideCard.append(field("Choose tag team",selector(booked?.teamId??"",
       [["","Select a complete team"],...eligibleTeams().map(t=>[t.teamId,t.name])],
       id=>selectTeamForMatch(m,side,id),!mutable())));
     }
     for(let member=0;member<m.teams[side]!.length;member++){
      const picked=m.teams[side]![member];
      sideCard.append(button(selectedName(picked),()=>{
       pickFor(slotId,side,member);
      },!mutable(),"ppw-picker-button"));
     }
     body.append(sideCard);
    }
    const elimination=el("div","ppw-elimination");
    if(m.format!=="BATTLE_ROYAL"){
     const label=el("label","ppw-check");
     const check=document.createElement("input");
     check.type="checkbox";check.checked=m.elimination;check.disabled=!mutable();
     check.onchange=()=>edit(m,{elimination:check.checked});
     label.append(check,el("span","","Elimination rules"));
     elimination.append(label);
    }
    if(m.elimination){
     const fold=el("details","ppw-elimination-details");
     const header=document.createElement("summary");
     header.textContent="Elimination order · "+m.eliminationOrder.length+" sides";
     fold.append(header);
     for(const [index,side] of m.eliminationOrder.entries()){
      const line=el("div","ppw-elimination-row");
      line.append(el("span","","#"+(index+1)+" · "+
       (m.format==="BATTLE_ROYAL"?selectedName(m.teams[side]?.[0]??null):
        "Side "+sideLabel(side))));
      line.append(button("↑",()=>setMatch(slotId,moveElimination(m,index,-1)),
       !mutable()||index===0),
       button("↓",()=>setMatch(slotId,moveElimination(m,index,1)),
       !mutable()||index===m.eliminationOrder.length-1));
      fold.append(line);
     }
     elimination.append(fold);
    }
    body.append(elimination);
    body.append(button("Remove match",()=>{
     matches.delete(slotId);order=order.filter(x=>x!==slotId);
     inProgressWizards.delete(slotId);
     for(const [angleId,angle] of segments){
      if(angle.kind==="POST_MATCH_ASSAULT"&&angle.sourceMatchSlotId===slotId)
       segments.set(angleId,{...angle,sourceMatchSlotId:null,targets:[]});
     }
     expanded=null;markDirty();render();
    },!mutable(),"ppw-remove"));
    card.append(body);
   }
   // The original running order stays compact: move only its *existing*
   // match/angle editor into a foreground sheet, never build a second form.
   if(expanded===slotId){
    const body=card.querySelector<HTMLElement>(":scope > .ppw-card-body");
    if(body){
     // Both booking approaches edit the same typed models and submit through
     // the existing save, World revision, eligibility and consent pipeline.
     const readiness=m?matchCastingReadiness(m):angleCastingReadiness(segment!);
     const stage=slotBookingSteps.get(slotId)??(readiness.complete?"OUTCOME":"CAST");
     const castReadiness=stage==="CAST"&&!m?
      angleCastStageReadiness(segment!):readiness;
     const guide=el("section","ppw-guide-booking");
     guide.dataset.step=stage;
     const stepIndex=stage==="SETUP"?1:stage==="CAST"?2:stage==="OUTCOME"?3:4;
     guide.append(el("span","ppw-eyebrow",
      "STEP "+stepIndex+" OF 4 · "+(stage==="SETUP"?"SETUP":
       stage==="CAST"?"CAST":stage==="OUTCOME"?"SCRIPT":"REVIEW")));
     const progress=el("div","ppw-guide-progress");
     progress.setAttribute("role","progressbar");
     progress.setAttribute("aria-label","Booking step");
     progress.setAttribute("aria-valuemin","1");
     progress.setAttribute("aria-valuemax","4");
     progress.setAttribute("aria-valuenow",String(stepIndex));
     for(let n=1;n<=4;n++){
      const dot=el("span","ppw-guide-progress-dot");
      dot.dataset.done=String(n<=stepIndex);progress.append(dot);
     }
     guide.append(progress);
     if(error||success){
      const response=el("p","ppw-guide-consent-response"+(error?" ppw-error":""),
       error||success);
      response.setAttribute("role",error?"alert":"status");
      guide.append(response);
     }
     guide.append(el("h3","",stage==="SETUP"?
      m?"What kind of match?":"What kind of scene?":
      stage==="CAST"?"Who is involved?":
      stage==="OUTCOME"?m?"Decide the match outcome":"Set the scene and outcome":
      "Staff briefing · Review the booking"));
     if(m&&stage==="OUTCOME"&&view.programmes.some(p=>
      p.cast?.some(x=>x.side==="A")&&p.cast.some(x=>x.side==="B")&&
      p.cast.every(x=>assignedIds(m).includes(x.personId))))
      guide.append(el("p","ppw-guide-feud-warning",
       "Rivalry cast selected · You still choose the winner."));
      const cast=[...body.children].filter(node=>node.classList.contains("ppw-side")||
       node.classList.contains("ppw-sizing"));
      const controlGrid=body.querySelector<HTMLElement>(":scope > .ppw-control-grid");
      const essentials=el("div","ppw-control-grid ppw-guide-essentials");
      const advancedFields=el("div","ppw-control-grid ppw-guide-advanced-fields");
      if(controlGrid)for(const child of [...controlGrid.children]){
       const label=child.querySelector("[aria-label]")?.getAttribute("aria-label")??"";
       if(child.classList.contains("ppw-winner-picker")||
        child.classList.contains("ppw-stipulation-impact")||
        (!m&&child.classList.contains("ppw-field"))||
        isQuickBookField(m?"MATCH":"ANGLE",label))
        essentials.append(child);
       else advancedFields.append(child);
      }
      const storyline=!m?[...body.children].find(node=>
       node.querySelector("[aria-label='Storyline (optional)']")):undefined;
      const remove=body.querySelector<HTMLElement>(":scope > .ppw-remove");
      const other=[...body.children].filter(node=>node!==controlGrid&&
       node!==remove&&node!==storyline&&!cast.includes(node)&&
       !node.classList.contains("ppw-angle-workflow-title"));
      const extra=el("details","ppw-guide-extra") as HTMLDetailsElement;
      extra.open=openQuickExtras.has(slotId);
      extra.ontoggle=()=>{
       if(!extra.isConnected)return;
       if(extra.open)openQuickExtras.add(slotId);
       else openQuickExtras.delete(slotId);
      };
      const extraSummary=el("summary","","Advanced match settings");
      // Avoid collapsing advanced choices on a fast iPhone selection. Native
      // <details> toggle events can arrive after edit() has re-rendered the
      // entire modal, so capture the click before that replacement.
      extraSummary.onclick=()=>{
       if(!extra.isConnected)return;
       if(!extra.open)openQuickExtras.add(slotId);
       else openQuickExtras.delete(slotId);
      };
      extra.append(extraSummary);
      if(advancedFields.childElementCount)extra.append(advancedFields);
      const extraContent=el("div","ppw-guide-extra-content");
      for(const node of other)if(!node.classList.contains("ppw-card-match-consents")&&
       !node.classList.contains("ppw-card-advisor-notes"))extraContent.append(node);
      if(extraContent.childElementCount)extra.append(extraContent);
      if(stage==="SETUP"){
       if(m){
        // All nine original formats visible together on a small iPhone.
        const formats=FORMATS;
        const formatGrid=el("div","ppw-guide-format-grid");
        for(const option of formats){
         const selected=m.format===option.value;
         const tile=button(option.label,()=>{
          if(option.value===m.format)return;
          if(assignedIds(m).length&&
           !window.confirm("Changing match size will clear your selected wrestlers. Continue?"))
           return;
          matches.set(slotId,newEditorMatch(slotId,option.value));
          formatChoice=option.value;markDirty();resetGuideScroll=true;render();
         },!mutable(),"ppw-guide-format-tile");
         tile.setAttribute("aria-pressed",String(selected));
         formatGrid.append(tile);
        }
        guide.append(el("strong","ppw-guide-section-label","Match size"),formatGrid);
        const supported=compatibleStipulations(
         m.format==="MULTI_TEAM"?"MULTI_TEAM":
         ["TRIOS","FOUR_V_FOUR","FIVE_V_FIVE"].includes(m.format)?"LARGE_TEAM":m.format);
         const stipulationGrid=el("div","ppw-guide-stipulation-grid");
        const addStipulation=(container:HTMLElement,kind:MatchStipulation)=>{
         const spec=MATCH_STIPULATIONS.find(x=>x.value===kind)!;
         const selected=(m.stipulation??"STANDARD")===kind;
         const choice=button(spec.label,()=>{
          if(selected)return;
          setMatch(slotId,changeMatchStipulation(m,kind));
          resetGuideScroll=false;
         },!mutable(),"ppw-guide-stipulation-tile");
         choice.setAttribute("aria-pressed",String(selected));
         container.append(choice);
        };
        supported.forEach(s=>addStipulation(stipulationGrid,s));
        guide.append(el("strong","ppw-guide-section-label","Match rules"),stipulationGrid);
        const spec=MATCH_STIPULATIONS.find(x=>x.value===(m.stipulation??"STANDARD"))!;
        const risk=stipulationInjuryRisk(spec.value);
        const context=el("div","ppw-guide-rules-brief");
        context.dataset.level=risk>=1.25?"watch":"info";
        context.append(el("strong","",risk>=1.25?
         "Higher physical risk":risk>1?"Elevated physical risk":"Standard physical risk"),
         el("p","",spec.summary));
        guide.append(context);
       }else{
        const angleSetup=el("div","ppw-guide-angle-setup");
        // Preserve the original validated selectors as handlers, but show
        // only tappable categories and scene choices to the player.
        const goalSelect=essentials.querySelector<HTMLSelectElement>(
         '[aria-label="Creative direction"]');
        const typeSelect=essentials.querySelector<HTMLSelectElement>(
         '[aria-label="Angle type"]');
        const goal=angleGoalFor(segment!.kind);
        const categories=el("div","ppw-angle-category-tiles");
        const categoryLabels:Record<AngleGoal,string>={
         CHARACTER:"Promos & interviews",RIVALRY:"Conflict & attacks",
         CHALLENGE:"Challenges",FACTION:"Alliances",TURN:"Turns",
         ARRIVAL:"Debuts",VIDEO:"Video packages"
        };
        for(const category of ANGLE_STORY_GOALS){
         const tile=button(categoryLabels[category.value],()=>{
          if(!goalSelect||category.value===goal)return;
          goalSelect.value=category.value;
          goalSelect.dispatchEvent(new Event("change",{bubbles:true}));
         },!mutable(),"ppw-angle-category-tile");
         tile.setAttribute("aria-pressed",String(category.value===goal));
         categories.append(tile);
        }
        angleSetup.append(categories);
        if(typeSelect){
         const tiles=el("div","ppw-angle-type-tiles");
         for(const item of [...typeSelect.options]){
          const choice=button(item.value==="INTERFERENCE"?"Ringside disruption":
           item.textContent??item.value,()=>{
           typeSelect.value=item.value;
           typeSelect.dispatchEvent(new Event("change",{bubbles:true}));
          },!mutable(),"ppw-angle-type-tile");
          choice.setAttribute("aria-pressed",String(item.value===
           (segment!.specialMoment??segment!.kind)));
          tiles.append(choice);
         }
         angleSetup.append(el("strong","ppw-guide-section-label",
          "Choose a scene"),tiles);
        }
        guide.append(angleSetup);
       }
       guide.append(button("Continue · Select wrestlers",()=>{
        slotBookingSteps.set(slotId,"CAST");resetGuideScroll=true;render();
       },!mutable(),"ppw-primary ppw-guide-next"));
      }else if(stage==="CAST"){
       if(!m){
        // The player already made the What choice on screen one. Show a
        // concise reminder instead of repeating those dropdowns.
        const context=el("div","ppw-guide-angle-context");
        context.append(el("strong","",angleName));
        guide.append(context);
        const castingOptions=el("div","ppw-control-grid ppw-guide-casting-options");
        for(const candidate of [...essentials.children]){
         const label=candidate.querySelector("[aria-label]")?.getAttribute("aria-label");
         if(["Turn a complete tag team","After which match?","Faction"].includes(label??""))
          castingOptions.append(candidate);
        }
        if(storyline)castingOptions.append(storyline);
        if(castingOptions.childElementCount)guide.append(castingOptions);
        const linkedFeud=view.programmes.find(p=>p.programmeId===segment?.programmeId);
        if(linkedFeud&&linkedFeud.cast?.some(x=>x.side==="A")&&
         linkedFeud.cast.some(x=>x.side==="B")){
         const fastCast=el("section","ppw-guide-feud-cast");
         fastCast.append(el("strong","","CAST YOUR RIVALRY"),
          el("p","",linkedFeud.label+
           " · Choose which side initiates the scene. This does not decide the result."));
         const castActions=el("div","ppw-guide-feud-cast-buttons");
         for(const [side,label] of [["A","Side A initiates"],["B","Side B initiates"]] as const){
          const control=button(label,()=>{
           const started=programmeAngleCastStarter(linkedFeud,segment!,side);
           if(!started.ok){error=started.reason;render();return;}
           editSegment(segment!,{
            actors:started.value.actors,targets:started.value.targets
           });
          },!mutable(),"ppw-guide-feud-cast-button");
          castActions.append(control);
         }
         fastCast.append(castActions);
         guide.append(fastCast);
        }
       }
       const hint=el("p","ppw-booking-hint",castReadiness.hint);
       guide.append(hint,...cast);
       guide.append(button("← Match or scene type",()=>{
        slotBookingSteps.set(slotId,"SETUP");resetGuideScroll=true;render();
       },false,"ppw-guide-back"));
       guide.append(button("Next · Script outcome",()=>{
        slotBookingSteps.set(slotId,"OUTCOME");
        resetGuideScroll=true;render();
       },!mutable()||!castReadiness.complete,"ppw-primary ppw-guide-next"));
      }else if(stage==="OUTCOME"){
       if(m){
        // A stipulation is already chosen on Setup; don't ask again.
        for(const child of [...essentials.children]){
         const label=child.querySelector("[aria-label]")?.getAttribute("aria-label")??"";
         if(label==="Stipulation"||child.classList.contains("ppw-stipulation-impact"))
          child.remove();
        }
        const directions:[string,string][]=[
         ["COMPETITIVE","Competitive"],["TECHNICAL","Technical"],
         ["DOMINANT","Dominant"],["STORY","Storytelling"],
         ["HIGH_RISK","Spectacle"],["SHOWCASE","Showcase"],
         ["PROTECTIVE","Protective"],["EPIC","Epic"]
        ];
        // Eight existing simulation profiles are now editable by tap.
        // The old duplicate Intent dropdown no longer belongs in Advanced.
        extra.querySelector<HTMLElement>('[aria-label="Intent"]')
         ?.closest(".ppw-field")?.remove();
        const direction=el("div","ppw-guide-direction");
        direction.append(el("strong","ppw-guide-section-label","Match direction"));
        const choices=el("div","ppw-guide-direction-tiles");
        for(const [value,label] of directions){
         const pick=button(label,()=>setMatch(slotId,
          changeMatchIntent(m,value as typeof m.intent)),!mutable(),
          "ppw-guide-direction-tile");
         pick.setAttribute("aria-pressed",String(m.intent===value));
         choices.append(pick);
        }
        direction.append(choices);
        const finish=essentials.querySelector<HTMLSelectElement>('select[aria-label="Finish"]');
        if(finish){
         const parent=finish.closest(".ppw-field");
         const panel=el("section","ppw-guide-finish");
         panel.append(el("strong","ppw-guide-section-label","Finish"));
         const grid=el("div","ppw-guide-finish-tiles");
         for(const option of [...finish.options]){
          const tile=button(option.textContent??option.value,()=>{
           finish.value=option.value;
           finish.dispatchEvent(new Event("change",{bubbles:true}));
          },!mutable(),"ppw-guide-finish-tile");
          tile.setAttribute("aria-pressed",String(option.value===m.plannedFinish));
          grid.append(tile);
         }
         panel.append(grid);parent?.replaceWith(panel);
        }
        guide.append(essentials,direction);
       }else{
        // The original angle fields and server-validated callbacks are
        // preserved, but no longer appear as one undifferentiated form.
        // What and Who were chosen earlier. This screen is Where, Why
        // and how the scripted scene plays out.
        const existing=!inProgressWizards.has(slotId);
        const what=el("section","ppw-guide-angle-section ppw-control-grid");
        const where=el("section","ppw-guide-angle-section ppw-control-grid");
        const why=el("section","ppw-guide-angle-section ppw-control-grid");
        const how=el("section","ppw-guide-angle-section ppw-control-grid");
        if(existing)what.append(el("h4","","What is the scene?"));
        where.append(el("h4","","Where does it happen?"));
        why.append(el("h4","","Why is this on the show?"));
        how.append(el("h4","","How does it unfold?"));
        const physical=segment!.kind==="ATTACK"||
         segment!.kind==="POST_MATCH_ASSAULT";
        // Keep original validated event handlers; both new and reopened angles
        // present their Where/Why/How choices as one-tap iPhone tiles.
        const tileFields=new Set(["Area","Exact location","Attack style",
         "Attack intensity","Visible aftermath","Storytelling purpose",
         "How it ends","New alignment","How the turn is shown","The message"]);
        const asTileField=(child:Element,label:string):Element=>{
         if(!tileFields.has(label))return child;
         const select=child.querySelector<HTMLSelectElement>("select");
         if(!select||select.options.length<2||select.options.length>16)return child;
         const panel=el("section","ppw-guide-script-choice");
         panel.dataset.field=label;
         panel.append(el("strong","ppw-guide-section-label",label));
         const grid=el("div","ppw-guide-script-tiles");
         grid.setAttribute("role","group");
         grid.setAttribute("aria-label",label+" choices");
         for(const option of [...select.options]){
          if(option.disabled||option.hidden)continue;
          const tile=button(option.textContent??option.value,()=>{
           select.value=option.value;
           select.dispatchEvent(new Event("change",{bubbles:true}));
          },!mutable(),"ppw-guide-script-tile");
          tile.dataset.value=option.value;
          tile.setAttribute("aria-pressed",String(option.value===select.value));
          grid.append(tile);
         }
         if(!grid.childElementCount)return child;
         panel.append(grid);
         const native=el("div","ppw-guide-native-choice");
         // An invisible native change-dispatcher is not a second screen-reader
         // control competing with the visible, keyboard-operable tile group.
         native.setAttribute("aria-hidden","true");
         select.tabIndex=-1;
         native.append(child);panel.append(native);
         return panel;
        };
        for(const child of [...essentials.children]){
         const label=child.querySelector("[aria-label]")?.getAttribute("aria-label")??"";
         if(label==="Creative direction"||label==="Angle type")continue;
         if(["Turn a complete tag team","After which match?","Faction"].includes(label)){
          if(existing)what.append(child);
          continue;
         }
         const control=asTileField(child,label);
         if(["Area","Exact location","Attack intensity","Visible aftermath"].includes(label))
          where.append(control);
         else if(label==="Storytelling purpose"||child.classList.contains("ppw-angle-purpose-disclaimer"))
          why.append(control);
         else if(!child.classList.contains("ppw-angle-workflow-title"))
          how.append(control);
        }
         if(segment!.programmeId){
         const linked=view.programmes.find(p=>p.programmeId===segment!.programmeId);
         if(linked)why.append(el("p","ppw-guide-angle-feud",
          "Continuing "+linked.label));
        }
        for(const block of [what,where,why,how]){
         if(block.childElementCount>1)guide.append(block);
        }
       }
       if(m&&view.programmes.some(p=>p.cast?.length&&
        p.cast.every(person=>assignedIds(m).includes(person.personId))))
        guide.append(el("p","ppw-guide-winner-reminder",
         "The default winner is not a creative recommendation. Choose who wins."));
       if(m){
        const runIn=extraContent.querySelector<HTMLElement>(".ppw-run-in");
        if(runIn)guide.append(runIn);
        if(extra.childElementCount>1){
         const open=openQuickExtras.has(slotId);
         const control=button(open?"Hide detailed match direction":"Fine-tune match",
          ()=>{if(open)openQuickExtras.delete(slotId);else openQuickExtras.add(slotId);
           resetGuideScroll=false;render();},false,"ppw-guide-tuning-toggle");
         control.setAttribute("aria-expanded",String(open));
         guide.append(control);
         if(open){
          const tuning=el("section","ppw-guide-tuning");
          for(const child of [...extra.children]){
           if(child.tagName!=="SUMMARY")tuning.append(child);
          }
          guide.append(tuning);
         }
        }
       }else if(extraContent.childElementCount){
        // No generic Additional Options trap for authored angles.
        guide.append(extraContent);
       }
       // A saved match approval is not an advanced preference. Keep the
       // authoritative consent action in sight alongside its result.
       if(m)for(const issue of other.filter(node=>
        node.classList.contains("ppw-card-match-consents")))
        guide.append(issue);
       const actions=el("div","ppw-guide-actions");
       actions.append(button("← Change cast",()=>{
        slotBookingSteps.set(slotId,"CAST");
        resetGuideScroll=true;render();
       },false,"ppw-guide-back"));
       actions.append(button("Next · Staff briefing",()=>{
        slotBookingSteps.set(slotId,"REVIEW");resetGuideScroll=true;render();
       },!mutable()||!readiness.complete,"ppw-primary ppw-booking-done"));
       guide.append(actions);
      }else{
       const brief=el("section","ppw-guide-staff-review");
        const overview=el("div","ppw-guide-booking-summary");
       if(m){
        overview.append(el("strong","",matchLabel(m)),
         el("p","",nice(m.plannedFinish)+" · "+
          MATCH_STIPULATIONS.find(s=>s.value===(m.stipulation??"STANDARD"))!.label+
          " · "+m.plannedLengthMinutes+" min"),
         el("p","","Winner · "+m.teams[m.winnerSide]!
          .filter((p):p is PersonPick=>p!==null).map(selectedName).join(" & ")));
        if(m.championshipId){
         const title=view.championships.find(c=>c.championshipId===m.championshipId);
         overview.append(el("p","","Championship · "+(title?.name??"Selected championship")));
        }
       }else{
        overview.append(el("strong","",angleName),
         el("p","",segment!.actors.map(selectedName).join(", ")+
          (segment!.targets.length?" with "+segment!.targets.map(selectedName).join(", "):"")),
         el("p","",segment!.durationMinutes+" min"+
          (segment!.scene?" · "+angleSceneLabel(segment!.scene.location)+
           " · "+angleSceneLabel(segment!.scene.purpose):"")));
       }
       brief.append(overview);
       const projected=forecastBookingAirtime(slotId,(m??segment)!,
        committedMatches,committedSegments,view.bookingClass);
       const airtime=el("p","ppw-guide-airtime-note",
        "Show airtime with this booking · "+projected.total+
        (projected.limit===null?" min": " / "+projected.limit+" min")+
        (projected.overBy?
         " · Over by "+projected.overBy+
         " min. Shorten this or another slot before saving.":
         projected.limit!==null&&projected.remaining!<=10?
         " · Very little time left for entrances and breaks.":""));
       if(projected.overBy)airtime.dataset.level="watch";
       brief.append(airtime);
       const staff=slotNotes(slotId);
       brief.append(el("h4","","Your staff's assessment"));
       if(staff.length){
        for(const finding of staff){
         const item=el("div","ppw-guide-review-note");
         item.dataset.level=finding.level.toLowerCase();
         const colleague=view.advisers?.find(x=>x.role===finding.role);
         item.append(el("span","",finding.role==="HOUSE"?"House safety":
          (colleague?.name?colleague.name+" · ":"")+
           nice(finding.role)),
          el("strong","",finding.title),
          el("p","",finding.message));
         brief.append(item);
        }
       }else brief.append(el("p","ppw-guide-reviewed-clear",
        "No specific staff concerns on this booking."));
       // Keep the direct fix next to its staff diagnosis, above the statistics.
       const decision=bookingChoicePanel(slotId);
       if(decision)brief.append(decision);
       // The review must show the *actual* selected wrestlers' condition
       // readings, not only a generic staff warning. This uses the same
       // show-week talent snapshot already loaded by the booking editor.
       const reviewedIds=[...new Set(m?assignedIds(m):
        [...segment!.actors,...segment!.targets].map(p=>p.personId))];
       const conditions=reviewedIds.map(id=>roster.get(id))
        .filter((p):p is NonNullable<typeof p>=>Boolean(p))
        .map(p=>({
         person:p,
         readings:([
          ["Fatigue",p.fatigue],["Wear",p.wear],
          ["Stamina",p.stamina],["Safety",p.safety]
         ] as const).filter(([,value])=>typeof value==="number"&&Number.isFinite(value)),
         watch:typeof p.fatigue==="number"&&p.fatigue>=65||
          typeof p.wear==="number"&&p.wear>=72
        })).filter(item=>item.readings.length>0)
        .sort((a,b)=>Number(b.watch)-Number(a.watch)||
         Math.max(b.person.fatigue??0,b.person.wear??0)-
         Math.max(a.person.fatigue??0,a.person.wear??0));
       if(conditions.length){
        brief.append(el("h4","","Wrestler condition"));
        const makeCondition=(item:typeof conditions[number])=>{
         const line=el("div","ppw-guide-condition-row");
         line.dataset.level=item.watch?"watch":"normal";
         line.append(el("strong","",item.person.name??item.person.personId),
          el("span","",item.readings.map(([name,value])=>
           name+" "+Math.round(Number(value))+"/100").join(" · ")));
         return line;
        };
        const visible=el("div","ppw-guide-condition-list");
        for(const item of conditions.slice(0,4))visible.append(makeCondition(item));
        brief.append(visible);
        if(conditions.length>4){
         const more=document.createElement("details");
         more.className="ppw-guide-more-conditions";
         more.append(el("summary","","Show "+(conditions.length-4)+
          " more wrestler"+(conditions.length===5?"":"s")));
         const rest=el("div","ppw-guide-condition-list");
         for(const item of conditions.slice(4))rest.append(makeCondition(item));
         more.append(rest);brief.append(more);
        }
        }
       if(m&&m.format==="SINGLES"){
        const snapshots=new Map<string,ConditionSnapshot>();
        for(const [id,person] of roster){
         snapshots.set(id,{inRingQuality:person.inRingQuality??null,
          matchCraft:person.matchCraft??null,presentation:person.presentation??null,
          stamina:person.stamina??null,safety:person.safety??null,
          fatigue:person.fatigue??null,wear:person.wear??null});
        }
        const readiness=bookedStyleReadiness(m,snapshots);
        if(readiness.reports.length){
         brief.append(el("h4","","Performer readiness"));
         const reports=el("div","ppw-guide-readiness");
         for(const report of readiness.reports){
          const item=el("div","ppw-guide-readiness-person");
          item.dataset.status=report.status;
          item.append(el("strong","",roster.get(report.personId)?.name??report.personId),
           el("span","",report.status==="COMFORTABLE"?"Ready":
            report.status==="CONCERNED"?"Has concerns":"Likely to refuse"));
          if(report.reasons.length)item.append(el("small","",
           report.reasons.map(nice).join(" · ")));
          reports.append(item);
         }
         brief.append(reports);
        }
       }
       if(m){
        const ids=new Set(assignedIds(m));
        const worked=view.programmes.filter(p=>{
         const cast=p.cast??[];
         return cast.some(x=>x.side==="A"&&ids.has(x.personId))&&
          cast.some(x=>x.side==="B"&&ids.has(x.personId));
        });
        brief.append(el("h4","","Relationships & concerns"));
        const contractTerms=previewMatchCreativeTerms(m,roster);
        for(const term of contractTerms.slice(0,3))
         brief.append(el("p","ppw-guide-creative-alert",term.message));
        if(contractTerms.length>3)
         brief.append(el("p","ppw-guide-creative-alert",
          "+"+(contractTerms.length-3)+" more contract terms need review."));
        if(worked.length)
         brief.append(el("p","",worked.map(p=>"Active rivalry · "+p.label).join(" · ")));
        else brief.append(el("p","","No active rivalry between these opponents."));
        const relevant=concerns.filter(c=>c.slotId===slotId);
        for(const issue of relevant)
         brief.append(el("p","ppw-guide-creative-alert",
          issue.name+" · "+(dirty?"Creative permission must be rechecked after saving":
           issue.decision==="APPROVED"?"Agreed to the saved version":
           issue.decision==="DECLINED"?"Declined this booking":
           "Creative approval requires attention")));
       }else if(segment?.programmeId){
        const story=view.programmes.find(p=>p.programmeId===segment.programmeId);
        if(story){
         brief.append(el("h4","","Storyline connection"));
         const members=new Set((story.cast??[]).map(p=>p.personId));
         const involved=reviewedIds.filter(id=>members.has(id));
         brief.append(el("p","",story.label+" · "+
          (involved.length?involved.length+" feud participant"+
           (involved.length===1?"":"s")+" in this scene":
           "none of the listed feud's participants is cast in this scene")));
        }
       }
       // Count appearance costs once per completed show, not once per
       // booking screen. Match participants and run-ins are live; videos
       // are pre-recorded. Other unfinished wizards aren't on the card.
       const ids=m?[...assignedIds(m),...(m.interference?[m.interference.personId]:[])]:
        segment!.kind==="VIDEO_PACKAGE"?[]:
        [...segment!.actors,...segment!.targets].map(p=>p.personId);
       const existingAppearances=[
        ...[...matches.values()].filter(other=>other.slotId!==slotId&&
         !inProgressWizards.has(other.slotId)).flatMap(other=>
         [...assignedIds(other),...(other.interference?[other.interference.personId]:[])]),
        ...[...segments.values()].filter(other=>other.slotId!==slotId&&
         !inProgressWizards.has(other.slotId)&&other.kind!=="VIDEO_PACKAGE")
         .flatMap(other=>[...other.actors,...other.targets].map(p=>p.personId))
       ];
       const fees=forecastIncrementalAppearanceFees(ids,existingAppearances,roster);
       const allFees=forecastCardAppearanceFees([...existingAppearances,...ids],roster);
       const cash=bookingFinanceBrief(view.bookingFinancials,allFees,
        (view.year-1)*52+view.week-1);
       if(cash&&(cash.breachesTalentLimit||cash.mayBreachTalentLimit||
        cash.projectedBelowReserve)){
        brief.append(el("p","ppw-guide-financial-warning",
         cash.breachesTalentLimit?
          "Known show talent fees exceed your spending cap. Review the cast or update Finances.":
         cash.mayBreachTalentLimit?
          "One or more appearance fees are unknown. The show cap cannot be confirmed.":
          "Known fees would place the chosen cash reserve at risk before ticket income."));
       }
       if(segment?.kind==="VIDEO_PACKAGE")
        brief.append(el("p","ppw-guide-fee-note",
         "Pre-recorded video · No live appearance fees for this segment."));
       else if(fees.performers)
        brief.append(el("p","ppw-guide-fee-note",
         "Additional appearance fees · $"+fees.amount.toLocaleString("en-GB")+
         (fees.complete?"":" known, with "+fees.unknown+
          " additional fee"+(fees.unknown===1?"":"s")+" not yet known")+
         " · "+fees.performers+" new wrestler"+(fees.performers===1?"":"s")+
         (fees.alreadyBooked?" · "+fees.alreadyBooked+
          " already counted on the card":"")+
         ". Each wrestler incurs at most one appearance fee for the show."));
       else if(fees.alreadyBooked)
        brief.append(el("p","ppw-guide-fee-note",
         "No additional appearance fees · "+fees.alreadyBooked+
         " wrestler"+(fees.alreadyBooked===1?" is":"s are")+
         " already counted on this show's live card."));
       guide.append(brief);
       const actions=el("div","ppw-guide-actions");
       actions.append(button("← Revise script",()=>{
        slotBookingSteps.set(slotId,"OUTCOME");resetGuideScroll=true;render();
       },false,"ppw-guide-back"));
       actions.append(button(m?"Complete match":"Complete angle",()=>{
        endWizard(slotId);
       },!mutable()||!readiness.complete,"ppw-primary ppw-booking-done"));
       guide.append(actions);
      }
      if(remove)guide.append(remove);
      body.replaceChildren(guide);
     body.remove();
     const shade=el("div","ppw-card-edit-shade");
     const sheet=el("section","ppw-card-edit-sheet");
     sheet.setAttribute("role","dialog");
     sheet.setAttribute("aria-modal","true");
     sheet.setAttribute("aria-label",m?"Edit match":"Edit angle");
     const head=el("header","ppw-card-edit-head");
     const label=el("div","ppw-card-edit-label");
     label.append(el("span","ppw-eyebrow","SLOT "+(i+1)+" / "+(m?"MATCH":"ANGLE")),
      el("strong","",m?matchLabel(m):angleName));
     head.append(label,button("×",()=>closeWizard(slotId),
      false,"ppw-card-edit-close"));
     const close=head.querySelector<HTMLButtonElement>(".ppw-card-edit-close");
     close?.setAttribute("aria-label","Close card editor");
     sheet.append(head,body);
     sheet.scrollTop=previousScroll;
     sheet.onkeydown=event=>{
      if(event.key==="Escape"){
       if(picker)return;
       event.preventDefault();closeWizard(slotId);return;
      }
      if(event.key!=="Tab")return;
      const focusable=[...sheet.querySelectorAll<HTMLElement>(
       "button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary")];
      if(!focusable.length)return;
      const first=focusable[0]!,last=focusable[focusable.length-1]!;
      if(event.shiftKey&&document.activeElement===first){
       event.preventDefault();last.focus();
      }else if(!event.shiftKey&&document.activeElement===last){
       event.preventDefault();first.focus();
      }
     };
     shade.append(sheet);
     shade.onclick=event=>{
      if(event.target===shade)closeWizard(slotId);
     };
     editShade=shade;
    }
   }
   // Incomplete wizard slots are intentionally absent from the running
   // order until Complete is pressed. Modal remains mounted independently.
   if(!inProgressWizards.has(slotId))list.append(card);
  }
  root.append(list);
  const foot=el("div","ppw-save");
  foot.setAttribute("role","group");
  foot.setAttribute("aria-label","Save and confirm show");
  const needsMatch=committedMatches.length===0;
  const wizardOpen=inProgressWizards.size>0;
  foot.append(button(saving?"Saving…":dirty?"Save changes":"Save card",()=>{void save();},
    !mutable()||needsRevisionRefresh||needsMatch||wizardOpen,"ppw-primary"));
  if(port.confirmReady)foot.append(button(
   view.ready?"Confirmed":"Confirm show",
   ()=>{void confirm();},
   !mutable()||dirty||view.ready||needsMatch||wizardOpen,"ppw-confirm"));
  if(needsMatch&&committedSegments.length){
   const guidance=el("small","ppw-card-save-hint",
    "Add and complete a match to enable saving. An angle-only show cannot be submitted.");
   foot.append(guidance);
  }
  if(error){
   const notice=el("small","ppw-save-status ppw-save-error",error);
   notice.setAttribute("role","alert");
   foot.append(notice);
  }else foot.append(el("small","ppw-save-status",dirty?"Edits not saved":
   view.ready?"Show confirmed for Week "+view.week:"Save first, then confirm"));
  root.append(foot);
  if(editShade){
   activeEditShade=editShade;
   // Controlled form changes redraw the same sheet. Keep its scroll and
   // skip the opening animation; only genuinely opening a card animates.
   if(priorModal)editShade.classList.add("ppw-card-edit-retained");
   (root.isConnected?document.body:root).append(editShade);
   if(priorModal){
    const scroll=editShade.querySelector<HTMLElement>(".ppw-card-edit-sheet");
    if(scroll)scroll.scrollTop=previousScroll;
   }else editShade.querySelector<HTMLButtonElement>(".ppw-card-edit-close")?.focus();
  }
  if(picker){
   const current=picker;
   const shade=el("div","ppw-sheet-shade");
   shade.onclick=e=>{if(e.target===shade){picker=null;render();}};
   const sheet=el("div","ppw-sheet");
   sheet.setAttribute("role","dialog");sheet.setAttribute("aria-modal","true");
   sheet.setAttribute("aria-label","Choose wrestler");
   const heading=el("div","ppw-sheet-head");
   heading.append(el("h2","",current.role==="RUN_IN"?"Choose a run-in wrestler":"Choose wrestler"),
    button("×",()=>{picker=null;render();}));
   sheet.append(heading);
   const focusedStory=(current.role==="actors"||current.role==="targets")?
    view?.programmes.find(x=>x.programmeId===segments.get(current.slotId)?.programmeId):null;
   if(focusedStory&&!current.showOther){
    const storyBox=el("section","ppw-picker-storyline");
    storyBox.append(el("strong","","CAST FROM YOUR STORYLINE"),
     el("p","ppw-muted","Choose a name to check their availability for this show's date."));
    for(const person of [...(focusedStory.cast??[])].sort((a,b)=>a.name.localeCompare(b.name)))
     storyBox.append(button(person.name,()=>void findTalent(person.name),false,"ppw-picker-story-person"));
    storyBox.append(button("Search everyone instead",()=>{
     current.showOther=true;void findTalent("");
    },false,"ppw-picker-story-other"));
    sheet.append(storyBox);
   }
   const matchPicker=matches.get(current.slotId);
   const anglePicker=(current.role==="actors"||current.role==="targets")?
    segments.get(current.slotId):undefined;
   if(anglePicker){
    const roles=el("div","ppw-picker-side-tabs");
    roles.setAttribute("role","group");
    roles.setAttribute("aria-label","Select angle role");
    const options=(SEGMENT_BOOKING_RULES[anglePicker.kind].allowTargets?
     ["actors","targets"]:["actors"]) as ("actors"|"targets")[];
    for(const role of options){
     const assigned=anglePicker[role].length;
     // Keep the visible role short enough for the smallest iPhone. The
     // detailed cast headings provide the angle-specific responsibilities.
     const roleName=role==="targets"?"Target":
      anglePicker.kind==="RESCUE"?"Actors":
      SEGMENT_BOOKING_RULES[anglePicker.kind].allowTargets?"Initiator":"Featured";
     const tab=button(roleName+" · "+assigned,()=>{
      current.role=role;current.side=role==="actors"?0:1;render();
     },false,"ppw-picker-side-tab");
     tab.title=role==="targets"?"Target / recipient wrestler":
      anglePicker.kind==="RESCUE"?"Attacker first, rescuer second":
      "Initiator / featured wrestler";
     tab.setAttribute("aria-pressed",String(current.role===role));roles.append(tab);
    }
    sheet.append(roles);
    const sources=el("div","ppw-picker-source-tabs");
    for(const [key,title] of [
     ["ALL","Roster"],["FEUDS","Feuds"],["TEAMS","Teams"],
     ["TRIOS","Trios"],["FACTIONS","Factions"]
    ] as const){
     const tab=button(title,()=>{
      current.source=key;current.sourceId=undefined;
      if(key==="FACTIONS")void loadStableChoices();
      render();
     },false,"ppw-picker-source-tab");
     tab.setAttribute("aria-pressed",String((current.source??"ALL")===key));
     sources.append(tab);
    }
    sheet.append(sources);
    const source=current.source??"ALL";
    if(source!=="ALL"){
     const units=el("div","ppw-picker-unit-list");
     const options=source==="FEUDS"?
      (view?.programmes??[]).filter(p=>p.cast?.length)
       .map(p=>[p.programmeId,p.label] as const):
      source==="TEAMS"?eligibleTeams().map(t=>[t.teamId,t.name] as const):
      source==="TRIOS"?eligibleTrios().map(t=>[t.trioId,t.name] as const):
      (stableChoices??[]).map(t=>[t.stableId,t.name] as const);
     for(const [id,name] of options){
      const option=button(name,()=>{
       current.sourceId=current.sourceId===id?undefined:id;render();
      },false,"ppw-picker-unit");
      option.setAttribute("aria-pressed",String(current.sourceId===id));
      units.append(option);
     }
     if(!options.length)units.append(el("p","ppw-muted",
      source==="FACTIONS"&&stableChoices===null?
       "Loading factions only when requested…":
       "No eligible "+source.toLowerCase()+" are available to filter by."));
     sheet.append(units);
    }
   }
   if(matchPicker&&!current.role){
    const sides=el("div","ppw-picker-side-tabs");
    sides.setAttribute("role","group");
    sides.setAttribute("aria-label","Select booking side");
    for(const [side,members] of matchPicker.teams.entries()){
     const complete=members.filter(Boolean).length;
     const tab=button((matchPicker.format==="BATTLE_ROYAL"?"Entrant ":"Side ")+
      sideLabel(side)+" · "+complete+"/"+members.length,()=>{
      current.side=side;
      const next=members.findIndex(x=>x===null);
      current.member=next<0?0:next;render();
     },false,"ppw-picker-side-tab");
     tab.setAttribute("aria-pressed",String(current.side===side));
     sides.append(tab);
    }
    if(matchPicker.teams.length<=6)sheet.append(sides);
    const sources=el("div","ppw-picker-source-tabs");
    const source=current.source??"ALL";
    for(const [key,label] of [
     ["ALL","Roster"],["FEUDS","Feuds"],["TEAMS","Teams"],
     ["TRIOS","Trios"],["FACTIONS","Factions"]
    ] as const){
     const tab=button(label,()=>{
      current.source=key;current.sourceId=undefined;render();
      if(key==="FACTIONS")void loadStableChoices();
     },false,"ppw-picker-source-tab");
     tab.setAttribute("aria-pressed",String(source===key));sources.append(tab);
    }
    sheet.append(sources);
    if(source==="FEUDS"){
     const groups=el("div","ppw-picker-unit-list");
     for(const feud of view?.programmes??[]){
      if(!feud.cast?.length)continue;
      const item=button(feud.label,()=>{
       current.sourceId=current.sourceId===feud.programmeId?
        undefined:feud.programmeId;render();
      },false,"ppw-picker-unit");
      item.setAttribute("aria-pressed",String(current.sourceId===feud.programmeId));
      groups.append(item);
     }
     if(!groups.childElementCount)groups.append(el("p","ppw-muted",
      "No active feuds have a bookable cast on this show."));
     sheet.append(groups);
    }
    if(source==="TEAMS"||source==="TRIOS"){
     const groups=el("div","ppw-picker-unit-list");
     const requestedSize=matchPicker.teams[current.side]?.length??0;
     const eligible=source==="TEAMS"?eligibleTeams():eligibleTrios();
     for(const group of eligible){
      const canUse=group.members.length===requestedSize&&requestedSize>=2&&
       matchPicker.format!=="BATTLE_ROYAL";
      const item=button(group.name+" · "+group.members.map(p=>p.name).join(" & "),()=>{
       if(!canUse)return;
       if("teamId" in group)
        selectTeamForMatch(matchPicker,current.side,group.teamId);
       else selectTrioForMatch(matchPicker,current.side,group.trioId);
       // Completion in the same sheet; the existing group-assign functions
       // check match/card duplicates and retain the actual contract IDs.
       const newest=matches.get(matchPicker.slotId)!;
       const next=newest.teams.findIndex((members,index)=>
        index!==current.side&&members.some(p=>p===null));
       if(next>=0){current.side=next;current.member=
        Math.max(0,newest.teams[next]!.findIndex(p=>p===null));}
       else if(newest.teams.every(m=>m.every(Boolean)))picker=null;
       render();
      },!canUse,"ppw-picker-unit");
      groups.append(item);
     }
     if(!groups.childElementCount)groups.append(el("p","ppw-muted",
      "No established, eligible groups are available for this show."));
     sheet.append(groups);
    }
    if(source==="FACTIONS"){
     const groups=el("div","ppw-picker-unit-list");
     if(stableChoices===null)groups.append(el("p","ppw-muted",
      "Loading factions on request…"));
     for(const unit of stableChoices??[]){
      const item=button(unit.name,()=>{
       current.sourceId=current.sourceId===unit.stableId?
        undefined:unit.stableId;render();
      },false,"ppw-picker-unit");
      item.setAttribute("aria-pressed",String(current.sourceId===unit.stableId));
      groups.append(item);
     }
     sheet.append(groups);
    }
   }
   const form=document.createElement("form");form.className="ppw-search";
   const search=document.createElement("input");
   search.type="search";search.placeholder="Search your roster";
   search.value=current.query;search.setAttribute("aria-label","Search wrestlers");
   form.append(search);
   const submit=document.createElement("button");submit.type="submit";
   submit.textContent="Search";form.append(submit);
   form.onsubmit=e=>{e.preventDefault();void findTalent(search.value.trim());};
   const tools=el("div","ppw-picker-filters");
   const sort=selector(current.sort,[
    ["POPULARITY","Popularity"],["MOMENTUM","Momentum"],["IN_RING","In-ring"],
    ["PRESENTATION","Presentation"],["DATES","Dates left"],["NAME","Name"]],
    value=>{current.sort=value as typeof current.sort;render();});
   sort.setAttribute("aria-label","Sort loaded wrestlers");
   // Each side remembers its own roster filters. A heel selected for Side A
   // must not leave Side B accidentally restricted to heels too.
   const matchDivision=Boolean((matchPicker&&!current.role)||anglePicker);
   const currentDivision=matchDivision?
    current.divisionBySide?.get(current.side)??"ALL":current.division;
   const setDivision=(value:"ALL"|"MEN"|"WOMEN")=>{
    if(matchDivision){
     const bySide=current.divisionBySide??new Map<number,"ALL"|"MEN"|"WOMEN">();
     bySide.set(current.side,value);current.divisionBySide=bySide;
    }else current.division=value;
    render();
   };
   const division=selector(currentDivision,[
    ["ALL","All divisions"],["MEN","Men"],["WOMEN","Women"]],
    value=>setDivision(value as "ALL"|"MEN"|"WOMEN"));
   division.setAttribute("aria-label","Filter loaded wrestlers by division");
   tools.append(sort,division);
   const chips=el("div","ppw-picker-chips");
   if((matchPicker&&!current.role)||anglePicker){
    const flags=current.chipsBySide?.get(current.side)??new Set<string>();
    for(const [key,label,conflict] of [
     ["AVAILABLE","Available",""],
     ["MEN","Men","WOMEN"],["WOMEN","Women","MEN"],
     ["FACE","Face","HEEL"],["HEEL","Heel","FACE"],
     ["RESTED","Rested","FATIGUED"],["FATIGUED","Fatigued 65+","RESTED"],
     ["POPULAR","Popular 75+",""],["DATES","Has dates",""]
    ] as const){
     const chip=button(label,()=>{
      if(key==="MEN"||key==="WOMEN"){
       setDivision(currentDivision===key?"ALL":key);
       return;
      }
      const currentFlags=new Set(current.chipsBySide?.get(current.side)??[]);
      if(currentFlags.has(key))currentFlags.delete(key);
      else{currentFlags.add(key);if(conflict)currentFlags.delete(conflict);}
      const bySide=current.chipsBySide??new Map<number,Set<string>>();
      bySide.set(current.side,currentFlags);current.chipsBySide=bySide;render();
     },false,"ppw-picker-filter-chip");
     chip.setAttribute("aria-pressed",String(key==="MEN"||key==="WOMEN"?
      currentDivision===key:flags.has(key)));chips.append(chip);
    }
   }
   sheet.append(createTalentFilterFrame(form,tools,chips));

   const matchForPicker=matches.get(current.slotId);
   const chosen=current.role==="RUN_IN"?null:
    matchForPicker?.teams[current.side]?.[current.member]??null;
   if(chosen)sheet.append(button("Clear position",()=>{
    const item=matches.get(current.slotId)!;
    setMatch(current.slotId,assignPerformer(item,current.side,current.member,null));
    picker=null;render();
   }));
   const rows=el("div","ppw-talent-rows");
   const sceneForPicker=segments.get(current.slotId);
   const takenIds=reservedPickerPeople(current.role,
    [...matches.values()].flatMap(m=>assignedIds(m)),
    matchForPicker?assignedIds(matchForPicker):[],
    sceneForPicker?[...sceneForPicker.actors,...sceneForPicker.targets].map(p=>p.personId):[]);
   const source=current.source??"ALL";
   const selectedProgramme=view?.programmes.find(p=>p.programmeId===current.sourceId);
   const selectedFaction=stableChoices?.find(p=>p.stableId===current.sourceId);
   const groupMembers=new Set<string>(source==="FEUDS"?
    (selectedProgramme?.cast??view?.programmes.flatMap(p=>p.cast??[])??[])
     .map(p=>p.personId):
    source==="TEAMS"?eligibleTeams().filter(t=>!current.sourceId||
     t.teamId===current.sourceId).flatMap(t=>t.members.map(p=>p.personId)):
    source==="TRIOS"?eligibleTrios().filter(t=>!current.sourceId||
     t.trioId===current.sourceId).flatMap(t=>t.members.map(p=>p.personId)):
    source==="FACTIONS"?(selectedFaction?.members??stableChoices?.flatMap(x=>x.members??[])??[])
     .map(p=>p.personId):[]);
   const flags=current.chipsBySide?.get(current.side)??new Set<string>();
   const sorted=current.items
    .filter(p=>(!focusedStory||current.showOther||
     focusedStory.cast?.some(member=>member.personId===p.personId))&&
     (currentDivision==="ALL"||p.division===currentDivision)&&
     (source==="ALL"||groupMembers.has(p.personId))&&
     (!flags.has("AVAILABLE")||p.available)&&
     (!flags.has("FACE")||p.alignment==="FACE")&&
     (!flags.has("HEEL")||p.alignment==="HEEL")&&
     (!flags.has("RESTED")||typeof p.fatigue==="number"&&p.fatigue<35)&&
     (!flags.has("FATIGUED")||typeof p.fatigue==="number"&&p.fatigue>=65)&&
     (!flags.has("POPULAR")||typeof p.popularity==="number"&&p.popularity>=75)&&
     (!flags.has("DATES")||(p.remainingDates??1)>0))
    .sort((a,b)=>{
     const unavailable=(p:TalentPage["talent"][number])=>
      Number(!p.available||takenIds.has(p.personId)&&
       chosen?.personId!==p.personId);
     if(unavailable(a)!==unavailable(b))return unavailable(a)-unavailable(b);
     const measure=(p:TalentPage["talent"][number])=>
      current.sort==="MOMENTUM"?p.momentum??-1:
      current.sort==="IN_RING"?p.inRingQuality??-1:
      current.sort==="PRESENTATION"?p.presentation??-1:
      current.sort==="DATES"?p.remainingDates??9999:p.popularity??-1;
     return current.sort==="NAME"?
      (a.name??"").localeCompare(b.name??""):
      measure(b)-measure(a)||(a.name??"").localeCompare(b.name??"");
    });
   sheet.append(el("p","ppw-picker-note",
    sorted.length+" of "+current.items.length+" loaded · Filters organise "+
    "this loaded page only. Use search to find someone anywhere on your roster."));
   if(!sorted.length)rows.append(el("p","ppw-muted",current.cursor?
    "No match yet. Load more to search additional wrestlers.":
    "No wrestlers match the current selection."));
   for(const candidate of sorted){
    const taken=takenIds.has(candidate.personId)&&
     chosen?.personId!==candidate.personId;
    const label=candidate.reason==="INJURED"?
     "INJURED · "+(candidate.medicalWeeksRemaining??"?")+" WEEKS":
     candidate.available?
     (candidate.remainingDates===null?"UNLIMITED DATES":
      candidate.remainingDates+" DATES REMAINING"):
      nice(candidate.reason);
    const entry=el("div","ppw-picker-wrestler");
    entry.append(createWrestlerCard({...candidate,name:candidate.name??candidate.personId,
     status:label},{
     context:"BOOKING",compact:true,label:taken?
      (current.role==="actors"||current.role==="targets"?"ALREADY IN SCENE":
       current.role==="RUN_IN"?"IN THIS MATCH":"ALREADY BOOKED"):label,
     disabled:!candidate.available||taken,onSelect:()=>chooseTalent(candidate)}));
    if(anglePicker&&candidate.available&&!taken){
     // Scene casting is intentionally allowed after a match. Make that
     // freedom clear before the user selects the performer, without
     // inventing another fee or silently removing an existing booking.
     const inMatch=[...matches.values()].some(m=>
      !inProgressWizards.has(m.slotId)&&
      [...assignedIds(m),...(m.interference?[m.interference.personId]:[])]
       .includes(candidate.personId));
     const inScene=[...segments.values()].some(s=>s.slotId!==anglePicker.slotId&&
      !inProgressWizards.has(s.slotId)&&s.kind!=="VIDEO_PACKAGE"&&
      [...s.actors,...s.targets].some(p=>p.personId===candidate.personId));
     if(inMatch||inScene)
      entry.append(el("p","ppw-picker-overlap",
       inMatch?"Already in a match on this card · Can also work this scene. "+
        "Appearance fee counted once; physical workload reviewed by staff.":
        "Already in another live scene · You can book another scene; "+
        "physical workload will be reviewed by staff."));
    }
    if(port.openProfile)entry.append(button("View full wrestler profile",()=>{
     const overlay=el("div","ppw-profile-overlay");
     overlay.setAttribute("role","dialog");
     overlay.setAttribute("aria-modal","true");
     overlay.setAttribute("aria-label","Wrestler profile");
     shade.append(overlay);
     port.openProfile?.(candidate.personId,overlay,()=>overlay.remove());
    }));
    rows.append(entry);

   }
   sheet.append(rows);
   if(current.cursor)sheet.append(button("Load more",()=>{void findTalent(current.query,true);}));
   shade.append(sheet);
   activePickerShade=shade;
   (root.isConnected?document.body:root).append(shade);
  }
 }
 function cardIdentity(pick:PersonPick):HTMLElement{
  // The booking card is an editable running order, not the Ringside results.
  // Keep the full name legible instead of competing miniature portraits.
  return el("span","ppw-card-person",selectedName(pick));
 }
 function sideLabel(index:number){return String.fromCharCode(65+index);}
 void load();
 return {reload:load,destroy:()=>{
  activeEditShade?.remove();activePickerShade?.remove();
  root.replaceChildren();delete root.dataset.broadcastPackage;
   root.classList.remove("ppw-editor","ppw-card-booking");
 }};
}
