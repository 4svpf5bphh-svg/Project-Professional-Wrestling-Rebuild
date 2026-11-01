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
import {SEGMENT_BOOKING_RULES} from "../domain/segment-booking.js";
import {tournamentBoutLabel} from "../domain/tournament-bracket.js";
import {matchCastingReadiness,angleCastingReadiness,reservedPickerPeople} from "./card-booking-readiness.js";
import {MATCH_STYLE_DIMENSIONS,type MatchStyleDimension} from "../simulation/legacy/match-style.js";
import {MATCH_STIPULATIONS,compatibleStipulations,
 permittedStipulationFinishes,type MatchStipulation}
 from "../domain/match-stipulations.js";
import {storyDirectionHint} from "./story-direction-hint.js";
import {initialCreativeBeat,supportsCreativeBeat,type SegmentCreativeBeat}
 from "../domain/segment-creative-beats.js";
import {creativeFields,creativeSummary} from "./segment-creative-options.js";
import {recommendProgrammeAngles} from "../domain/programme-angle-recommendations.js";
import {creativeForSlot,consentRebookingAdvice} from "./card-creative-review.js";
import {hasConcurrentCardChange} from "./card-draft-conflict.js";
import {broadcastPackageClass} from "../domain/broadcast-packages.js";
import {createBroadcastPackageFrame} from "./broadcast-package-frame.js";
import {moveLinkedRunningOrder,dropLinkedRunningOrder,attachPostMatchAngle} from "./card-running-order.js";
type View=Awaited<ReturnType<typeof readShowCardEditor>>;
type TalentPage=Awaited<ReturnType<typeof readBookableCardTalent>>;
type SaveResult=Awaited<ReturnType<typeof saveShowCardMatches>>;
type ReadyResult=Awaited<ReturnType<typeof markPreparedShowReady>>;
export interface CardEditorPort{
 load():Promise<View>;
 talent(search:string,cursor:TalentPage["cursor"]):Promise<TalentPage>;
 save(input:{requestId:string;expectedRevision:number;
  matches:{slotId:string;payload:unknown}[];
  segments:{slotId:string;payload:unknown}[];runningOrder:string[]}):Promise<SaveResult>;
 confirmReady?(input:{requestId:string;expectedRevision:number}):Promise<ReadyResult>;
 requestCreativeConsent?(input:{requestId:string;expectedRevision:number;
  slotId:string;personId:string}):Promise<unknown>;
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
 stableChoices?():Promise<{stableId:string;name:string}[]>;
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
  division:string|null;alignment?:string|null;available:boolean;reason:string}&Partial<ConditionSnapshot>>();
 let expanded:string|null=null;
 let picker:{slotId:string;side:number;member:number;role?:"actors"|"targets"|"RUN_IN";
  query:string;cursor:TalentPage["cursor"];items:TalentPage["talent"];
  sort:"POPULARITY"|"MOMENTUM"|"IN_RING"|"PRESENTATION"|"DATES"|"NAME";
  division:"ALL"|"MEN"|"WOMEN"}|null=null;
 let loading=false,saving=false,dirty=false,error="",success="";
 let talentRequestSequence=0;
 let pendingRequestId:string|null=null;
 let needsRevisionRefresh=false;
 let stableChoices:{stableId:string;name:string}[]|null=null;
 let stableChoicesLoading=false;
 let formatChoice:Format="SINGLES";
 let focusedRivalryId:string|null=null;
 let rivalryIdeasOpen=false;
 const openStyles=new Set<string>();
 const openRunIns=new Set<string>();
 const selectedName=(pick:PersonPick|null)=>!pick?"Choose wrestler":
  roster.get(pick.personId)?.name??pick.personId;
 const mutable=()=>view?.canEdit===true&&!saving;
 const errorText=(e:unknown)=>e instanceof Error?e.message:"Unable to load booking";
 const matchLabel=(m:EditorMatch)=>bookedMatchHeadline(m,selectedName);
 const eligibleTeams=()=>view?.bookableTeams??[];
 const eligibleTrios=()=>view?.bookableTrios??[];
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
  return fmt+" · "+assignedIds(m).length+" / "+
   m.teams.reduce((a,s)=>a+s.length,0)+" booked · "+
   m.plannedLengthMinutes+" min · "+nice(m.plannedFinish);
 };
 function markDirty(){dirty=true;pendingRequestId=null;error="";success="";
  port.onDraftChange?.(true);}
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
      division:old?.division??null,available:true,reason:"AVAILABLE"});
    }
   }
   for(const bout of view.tournamentBouts??[]){
    for(const side of [bout.personA,bout.personB]){
     const old=roster.get(side.personId);
     roster.set(side.personId,{...old,personId:side.personId,
      contractId:side.contractId,name:side.name,
      division:old?.division??null,available:true,reason:"AVAILABLE"});
    }
   }
   for(const p of view.selectedPeople){
    const prior=roster.get(p.personId);
    roster.set(p.personId,{...prior,personId:p.personId,name:p.name,
     division:p.division,alignment:p.alignment??prior?.alignment??null,contractId:prior?.contractId??"",
     available:prior?.available??false,reason:prior?.reason??"BOOKED",
     inRingQuality:p.inRingQuality,matchCraft:p.matchCraft,presentation:p.presentation,
     stamina:p.stamina,safety:p.safety,fatigue:p.fatigue,wear:p.wear});
   }
   expanded=null;dirty=false;needsRevisionRefresh=false;
   pendingRequestId=null;error="";success="";
   port.onDraftChange?.(false);
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
   setMatch(picker.slotId,assignPerformer(target,picker.side,picker.member,{
    personId:p.personId,contractId:p.contractId}));
   picker=null;render();
  }catch(e){error=errorText(e);render();}
 }
 function chooseRunInTalent(slotId:string){
  picker={slotId,side:0,member:0,role:"RUN_IN",query:"",cursor:null,items:[],
   sort:"POPULARITY",division:"ALL"};
  render();void findTalent("");
 }
 function chooseSegmentTalent(slotId:string,role:"actors"|"targets"){
  picker={slotId,side:0,member:0,role,query:"",cursor:null,items:[],sort:"POPULARITY",division:"ALL"};
  render();void findTalent("");
 }
 async function loadStableChoices(){
  if(stableChoices!==null||stableChoicesLoading||!port.stableChoices)return;
  stableChoicesLoading=true;
  try{stableChoices=await port.stableChoices();}
  catch(e){error=errorText(e);stableChoices=[];}
  finally{stableChoicesLoading=false;render();}
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
     contractId:existing?.contractId??"",
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
  const previousScroll=priorModal?.scrollTop??0;
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
  if(error)root.append(el("p","ppw-alert ppw-error",error));
  if(success)root.append(el("p","ppw-alert ppw-success",success));
  if(!view){
   if(!loading)root.append(button("Retry",()=>{void load();}));
   return;
  }
  const summary=el("div","ppw-summary");
  const castReady=[...matches.values()].filter(x=>matchCastingReadiness(x).complete).length+
   [...segments.values()].filter(x=>angleCastingReadiness(x).complete).length;
  summary.append(el("span","",matches.size+" matches"),
   el("span","",segments.size+" angles"),
   el("span","",[...matches.values()].reduce((n,m)=>n+m.plannedLengthMinutes,0)+
    " match minutes · "+[...segments.values()].reduce((n,a)=>n+a.durationMinutes,0)+" angle minutes"),
   el("span","",order.length+" card slots"),
   el("span","",castReady+" / "+order.length+" ready to book"),
   el("span","",dirty?"Unsaved changes":view.ready?"Show confirmed":"Not confirmed"));
  root.append(summary);
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
  const matchMinutes=[...matches.values()].reduce((n,m)=>n+m.plannedLengthMinutes,0);
  const angleMinutes=[...segments.values()].reduce((n,a)=>n+a.durationMinutes,0);
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
  airtime.append(el("small","",matchMinutes+" min wrestling + "+angleMinutes+" min angles"+
   (view.bookingClass==="REGULAR"?" · "+Math.max(0,120-usedMinutes)+" min left for entrances, breaks and commentary":
   " · add venue production time separately")));
  if(view.bookingClass==="REGULAR"&&usedMinutes>110)
   airtime.append(el("small","ppw-card-time-warning",usedMinutes>120?
    "Over the TV limit — shorten your booking to save.":
    "Very little time left for entrances, breaks and commentary."));
  root.append(airtime);
  const toolbar=el("div","ppw-toolbar");
  const matchFormat=selector(formatChoice,FORMATS.map(f=>[f.value,f.label]),
   v=>{formatChoice=v as Format;render();},!mutable());
  matchFormat.setAttribute("aria-label","Match format");
  toolbar.append(matchFormat);
  toolbar.append(button("+ Add match",()=>{
   const id="match-"+crypto.randomUUID();
   matches.set(id,newEditorMatch(id,formatChoice));
   order.push(id);expanded=id;markDirty();render();
  },!mutable(),"ppw-primary"));
  toolbar.append(button("+ Add angle",()=>{
   const id="angle-"+crypto.randomUUID();
   segments.set(id,newEditorSegment(id));
   order.push(id);expanded=id;markDirty();render();
  },!mutable(),"ppw-add-angle"));
  const tournamentFixtures=(view.tournamentBouts??[]).filter(b=>
   ![...matches.values()].some(m=>m.tournamentId===b.tournamentId&&
    m.tournamentBoutNo===b.boutNo));
  if(tournamentFixtures.length&&mutable()){
   const tournament=el("section","ppw-card-continuity");
   tournament.append(el("strong","","TOURNAMENT BOOKING"),
    el("p","ppw-muted","Book the next available round on this card. Only certified match winners advance."));
   for(const bout of tournamentFixtures){
    const row=el("div","ppw-tournament-booking-row");
    row.append(el("span","",bout.tournamentName+" · "+
     tournamentBoutLabel(bout.entrantsCount,bout.boutNo).toUpperCase()+
     " · "+bout.personA.name+" vs "+bout.personB.name),
     button("+ Add tournament bout",()=>{
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
      order.push(id);expanded=id;markDirty();render();
     }));
    tournament.append(row);
   }
   root.append(tournament);
  }
  root.append(toolbar);
  // One optional feud picker. It must not compete with the core Add Match /
  // Add Angle buttons or repeat the Programme Desk's long creative reports.
  if(view.programmes.length){
   const suggestions=document.createElement("details");
   suggestions.className="ppw-card-rivalry-ideas";
   suggestions.open=rivalryIdeasOpen;
   suggestions.ontoggle=()=>{
    if(suggestions.isConnected)rivalryIdeasOpen=suggestions.open;
   };
   suggestions.append(el("summary","","Book a rivalry chapter · "+view.programmes.length+
    (view.programmes.length===1?" active feud":" active feuds")));
   const selected=view.programmes.find(p=>p.programmeId===focusedRivalryId)??
    view.programmes[0]!;
   focusedRivalryId=selected.programmeId;
   const select=selector(selected.programmeId,
    view.programmes.map(p=>[p.programmeId,p.label]),id=>{
     focusedRivalryId=id;rivalryIdeasOpen=true;render();
    },!mutable());
   select.setAttribute("aria-label","Choose a rivalry to book");
   suggestions.append(field("Rivalry",select));
   const choices=recommendProgrammeAngles(selected).slice(0,3);
   const actions=el("div","ppw-card-rivalry-shortcuts");
   for(const idea of choices){
    const action=button("+ "+idea.kind.replaceAll("_"," ").toLowerCase(),
     ()=>{
      const id="angle-"+crypto.randomUUID();
      const segment={...newEditorSegment(id,idea.kind),
       programmeId:selected.programmeId,durationMinutes:idea.minutes,
       ...(idea.kind==="VIDEO_PACKAGE"?{videoPurpose:"FEUD_RECAP" as const}:{})};
      segments.set(id,segment);order.push(id);expanded=id;
      markDirty();render();
     },!mutable(),"ppw-card-rivalry-add");
    action.setAttribute("aria-label","Add "+idea.kind.replaceAll("_"," ").toLowerCase()+
     " for "+selected.label);
    action.title=idea.title+" · "+idea.reason;
    actions.append(action);
   }
   suggestions.append(actions);
   suggestions.append(el("small","ppw-muted",
    "Suggestions are optional. The wrestlers, angle ending and show remain yours to book."));
   root.append(suggestions);
  }
  // Opening title art is collapsible and does not affect booking or results.
  if(view.broadcastPackage){
   const intro=createBroadcastPackageFrame({
    style:view.broadcastPackage,kind:"OPEN",promotion:view.promotionName,
    show:view.showName??"Weekly show",compact:true});
   if(intro){
    const reveal=el("details","ppw-card-broadcast-studio");
    reveal.append(el("summary","","View opening titles"),intro);
    root.append(reveal);
   }
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
   if(m&&order.slice(i+1).every(id=>!matches.has(id)))card.classList.add("ppw-main-event");
   const angleName=segment?ANGLE_TYPES.find(x=>x.value===segment.kind)?.label??"Angle":"";
   const anglePeople=segment?[...segment.actors,...segment.targets]
    .map(person=>selectedName(person)).slice(0,3).join(" · "):"";
   const angleDetails=segment?creativeSummary(segment.creativeBeat):"";
   label.append(el("span","ppw-eyebrow","SLOT "+(i+1)+" · "+(m?"MATCH":"ANGLE")),
    el("strong","",m?matchLabel(m):angleName),
    ...(m&&card.classList.contains("ppw-main-event")?[el("span","ppw-main-event-flag","MAIN EVENT")]:[]),
    el("small","ppw-card-lineup",m?matchSubtitle(m):
      [anglePeople,angleDetails].filter(Boolean).join(" · ")||
       "Choose the wrestlers for this moment"));
   const status=m?matchCastingReadiness(m):segment?angleCastingReadiness(segment):null;
   if(status){
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
   bar.append(button(expanded===slotId?"▴":"▾",()=>{
    expanded=expanded===slotId?null:slotId;render();
   },false,"ppw-expand"),label);
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
   // The booking list stays compact. Players may expand a real, text-only
   // match/segment broadcast graphic without opening its editing form.
   if(view.broadcastPackage){
    const activeView=view;
    const graphic=el("details","ppw-card-broadcast-studio ppw-card-broadcast-slot") as HTMLDetailsElement;
    const text=m?"TV match graphic":"TV segment graphic";
    graphic.append(el("summary","",text));
    graphic.ontoggle=()=>{
     if(!graphic.open||graphic.querySelector(".ppw-tv-frame"))return;
     const preview=m?createBroadcastPackageFrame({
      style:activeView.broadcastPackage,kind:"MATCH",promotion:activeView.promotionName,
      show:activeView.showName??"Weekly show",compact:true,
      sideA:m.teams[0]?.filter((p):p is PersonPick=>p!==null).map(selectedName).join(" & "),
      sideB:m.teams.slice(1).flat().filter((p):p is PersonPick=>p!==null).map(selectedName).join(" & ")
     }):createBroadcastPackageFrame({
      style:activeView.broadcastPackage,kind:"SEGMENT",promotion:activeView.promotionName,
      show:activeView.showName??"Weekly show",compact:true,
      segmentLabel:angleName,
      segmentPerson:segment?[...segment.actors,...segment.targets]
       .filter((p):p is PersonPick=>p!==null).map(selectedName).join(" · "):undefined});
     if(preview)graphic.append(preview);
    };
    card.append(graphic);
   }
   // The movable card remains text-only. Portraits are reserved for the
   // completed Ringside results presentation.
   if(segment&&expanded===slotId){
    const body=el("div","ppw-card-body");
    const readiness=angleCastingReadiness(segment);
    body.append(el("p","ppw-booking-hint",readiness.hint));
    const controls=el("div","ppw-control-grid");
    const setAngle=(kind:EditorSegment["kind"])=>{
     if(["STABLE_INVITATION","STABLE_EXIT","STABLE_RECONCILIATION"].includes(kind))
      void loadStableChoices();
     editSegment(segment,{kind,
      creativeBeat:segment.kind===kind?segment.creativeBeat:
       initialCreativeBeat(kind),
      sourceMatchSlotId:segment.kind===kind?segment.sourceMatchSlotId:null,
      stableId:["STABLE_INVITATION","STABLE_EXIT","STABLE_RECONCILIATION"].includes(kind)?
       segment.stableId:null,
      stableDecision:["STABLE_INVITATION","STABLE_RECONCILIATION"].includes(kind)?
       segment.stableDecision:null,
      actors:LIMITED_ACTORS.has(kind)?segment.actors.slice(0,1):
       (kind==="RESCUE"||kind==="TURN")?segment.actors.slice(0,2):segment.actors,
      targets:["PROMO","INTERVIEW","CELEBRATION","CONTRACT_SIGNING","DEBUT"].includes(kind)?
       []:["INTERRUPTION","RESCUE","POST_MATCH_ASSAULT"].includes(kind)?
        segment.targets.slice(0,1):segment.targets});
    };
    const goal=angleGoalFor(segment.kind);
    controls.append(field("Creative direction",selector(goal,
     ANGLE_STORY_GOALS.map(x=>[x.value,x.label]),value=>
      setAngle(firstAngleFor(value as AngleGoal)),!mutable())));
    // A dedicated wrestler turn already defines its angle type.
    // Show the second selector only where it offers a real choice.
    if(anglesForGoal(goal).length>1)
     controls.append(field("Angle type",selector(segment.kind,
      ANGLE_TYPES.filter(x=>anglesForGoal(goal).includes(x.value))
       .map(x=>[x.value,x.label]),value=>
       setAngle(value as EditorSegment["kind"]),!mutable())));
     controls.append(field("Angle duration (minutes)",selector(String(segment.durationMinutes),
     [2,3,4,5,6,8,10,12,15,20,25,30].map(n=>[String(n),n+" min"]),
     value=>editSegment(segment,{durationMinutes:Number(value)}),!mutable())));
    if(supportsCreativeBeat(segment.kind)){
     const beat=segment.creativeBeat??initialCreativeBeat(segment.kind)!;
     for(const option of creativeFields(segment.kind)){
      const value=(beat as unknown as Record<string,string>)[option.name]??"";
      controls.append(field(option.label,selector(value,
       option.options.map(x=>[x.value,x.label]),
       next=>editSegment(segment,{creativeBeat:{
        ...beat,[option.name]:next
       } as SegmentCreativeBeat}),!mutable())));
     }
    }
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
    if(view.programmes.length)
     controls.append(field("Storyline / programme",selector(segment.programmeId??"",
      [["","None"],...view.programmes.map(p=>[
       p.programmeId,p.label+" · Heat "+(p.heat??"—")])],
      v=>editSegment(segment,{programmeId:v||null}),!mutable())));
    const linked=view.programmes.find(p=>p.programmeId===segment.programmeId);
    if(linked)controls.append(el("p","ppw-angle-guidance",
     "Feature at least one wrestler from this rivalry. The story will only advance when its own wrestlers take part."));
    if(linked?.latestFollowUp){
     const followUp=el("p","ppw-card-angle-continuity",
      storyDirectionHint(linked.latestFollowUp,"SEGMENT"));
     controls.append(followUp);
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
    body.append(controls);
    if(!SEGMENT_BOOKING_RULES[segment.kind].allowTargets)
     body.append(el("p","ppw-angle-guidance ppw-angle-direct-target",
      "Want someone to be confronted or called out? Set Creative direction to Challenge or Confrontation, then choose the rival under Targets. A standalone promo or interview has no on-screen target."));
    const direction=el("p","ppw-angle-guidance");
    direction.append(el("strong","",ANGLE_STORY_GOALS.find(x=>x.value===goal)!.label+" / "),
     el("span","",angleDirection(segment.kind)));
    body.append(direction);
    for(const role of ["actors","targets"] as const){
     if(role==="targets"&&!SEGMENT_BOOKING_RULES[segment.kind].allowTargets)continue;
     const section=el("div","ppw-side");
     const specialist=segment.kind==="RESCUE";
     const heading=specialist?role==="actors"?
      "Attacker first · rescuer second":"Wrestler being rescued":
      segment.kind==="INTERRUPTION"?role==="actors"?"Interrupter":"Speaker interrupted":
      segment.kind==="POST_MATCH_ASSAULT"?role==="actors"?"Attacker":"Victim from the match":
      role==="actors"?"On-screen talent / initiators":"Targets / rivals";
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
        segment.kind==="POST_MATCH_ASSAULT"?"attacker":"performer":
       specialist?"person being rescued":
        segment.kind==="INTERRUPTION"?"speaker":
        segment.kind==="POST_MATCH_ASSAULT"?"wrestler from the match":"target"),()=>{
       chooseSegmentTalent(slotId,role);
      },!mutable()||segment.actors.length+segment.targets.length>=30||
       (role==="actors"&&segment.actors.length>=SEGMENT_BOOKING_RULES[segment.kind].maxActors)||
       (role==="targets"&&["INTERRUPTION","RESCUE","POST_MATCH_ASSAULT"].includes(segment.kind)&&
        segment.targets.length>=1)));
     if(role==="targets"&&REQUIRED_TARGETS.has(segment.kind)&&segment.targets.length===0)
      section.append(el("p","ppw-muted","This angle needs a target."));
     body.append(section);
    }
    body.append(button("Remove angle",()=>{
     segments.delete(slotId);order=order.filter(x=>x!==slotId);
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
     const controls=el("div","ppw-control-grid");
    controls.append(field("Winner",selector(String(m.winnerSide),
     m.teams.map((_,index)=>[String(index),m.format==="BATTLE_ROYAL"?
      "Entrant "+(index+1):"Side "+sideLabel(index)]),
     v=>setMatch(slotId,changeWinner(m,Number(v))),!mutable())));
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
    controls.append(field("Minutes",numberField(m.plannedLengthMinutes,3,60,
     v=>edit(m,{plannedLengthMinutes:v}),!mutable())));
    body.append(controls);
    if(m.format==="SINGLES"||m.format==="TAG"){
     const run=document.createElement("details");run.className="ppw-run-in";
     run.open=openRunIns.has(slotId);
     run.ontoggle=()=>{
      if(!run.isConnected)return;
      if(run.open)openRunIns.add(slotId);else openRunIns.delete(slotId);
     };
     run.append(el("summary","","Run-in / match interference"+
      (m.interference?" · "+(roster.get(m.interference.personId)?.name??"Selected wrestler"):" · optional")));
     run.append(el("p","ppw-run-in-help",
      "Bring someone from outside the match to ringside. Choose which side they support and whether the run-in succeeds. The winner is still your decision."));
     run.append(button(m.interference?
      "Change wrestler · "+(roster.get(m.interference.personId)?.name??"Selected wrestler"):
      "Choose run-in wrestler",()=>chooseRunInTalent(slotId),!mutable(),"ppw-run-in-person"));
     if(m.interference){
      const spot=m.interference;
      const sideChoices=m.teams.map((_,i)=>[i===0?"A":"B",
       "Help "+(i===0?"Side A":"Side B")] as string[]);
      run.append(field("Which side?",selector(spot.aidedSide,sideChoices,
       v=>edit(m,{interference:{...spot,aidedSide:v as "A"|"B",
        plannedOutcome:v===(m.winnerSide===0?"A":"B")?
         spot.plannedOutcome:"THWARTED"}}),!mutable())));
      run.append(field("What happens?",selector(spot.plannedOutcome,[
       ["SUCCESS","Run-in succeeds"],["THWARTED","Run-in is thwarted"]],
       v=>edit(m,{interference:{...spot,plannedOutcome:v as "SUCCESS"|"THWARTED",
        aidedSide:v==="SUCCESS"?(m.winnerSide===0?"A":"B"):spot.aidedSide}}),!mutable())));
      run.append(button("Remove run-in",()=>edit(m,{interference:undefined}),
       !mutable(),"ppw-run-in-clear"));
      if(spot.plannedOutcome==="SUCCESS")
       run.append(el("p","ppw-run-in-hint",
        "A successful run-in supports the wrestler or team you've selected to win."));
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
     const sheet=document.createElement("details");
     sheet.className="ppw-match-style";
     sheet.open=openStyles.has(slotId);
     sheet.ontoggle=()=>{
      if(!sheet.isConnected)return;
      if(sheet.open)openStyles.add(slotId);else openStyles.delete(slotId);
     };
     sheet.append(el("summary","","Match presentation · pace, story & risk"));
     const style=editorMatchStyle(m),load=editorStyleLoad(m);
     sheet.append(el("p","ppw-match-style-intro",
      "Direct the feel of the bout. A demanding performance can stretch your wrestlers, and bold ideas don't always pay off."));
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
     const conditions=new Map<string,ConditionSnapshot>();
     for(const [personId,profile] of roster){
      conditions.set(personId,{inRingQuality:profile.inRingQuality??null,
       matchCraft:profile.matchCraft??null,presentation:profile.presentation??null,
       stamina:profile.stamina??null,safety:profile.safety??null,
       fatigue:profile.fatigue??null,wear:profile.wear??null});
     }
     const assessments=bookedStyleReadiness(m,conditions);
     const fitness=el("div","ppw-match-style-fitness");
     fitness.append(el("h4","","Performer readiness"));
     if(!assessments.known)fitness.append(el("p","ppw-match-style-fineprint",
      "Choose wrestlers to see how comfortable they are with these demands."));
     for(const report of assessments.reports){
      const item=el("p","ppw-match-style-fitness-row");
      item.dataset.status=report.status;
      item.append(el("strong","",roster.get(report.personId)?.name??report.personId),
       el("span","",report.status==="COMFORTABLE"?"Comfortable":
        report.status==="CONCERNED"?"Has concerns":"Likely to refuse"),
       el("small","",report.reasons.length?
        report.reasons.map(nice).join(" · "):"No immediate concerns"));
      fitness.append(item);
     }
     if(assessments.missing&&assessments.known)
      fitness.append(el("p","ppw-match-style-fineprint",
       "Some wrestlers still need a current fitness report."));
     sheet.append(fitness,el("p","ppw-match-style-fineprint",
      "An early warning from your roster's current condition. Speak to the wrestler or adjust the bout if concerns arise; no winner or outcome changes here."));
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
     head.append(label,button("×",()=>{
      expanded=null;render();
     },false,"ppw-card-edit-close"));
     const close=head.querySelector<HTMLButtonElement>(".ppw-card-edit-close");
     close?.setAttribute("aria-label","Close card editor");
     sheet.append(head,body);
     sheet.scrollTop=previousScroll;
     sheet.onkeydown=event=>{
      if(event.key==="Escape"){
       if(picker)return;
       event.preventDefault();expanded=null;render();return;
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
      if(event.target===shade){expanded=null;render();}
     };
     editShade=shade;
    }
   }
   list.append(card);
  }
  root.append(list);
  const foot=el("div","ppw-save");
  foot.setAttribute("role","group");
  foot.setAttribute("aria-label","Save and confirm show");
  foot.append(button(saving?"Saving…":dirty?"Save changes":"Save card",()=>{void save();},
    !mutable()||needsRevisionRefresh||matches.size===0,"ppw-primary"));
  if(port.confirmReady)foot.append(button(
   view.ready?"Confirmed":"Confirm show",
   ()=>{void confirm();},
   !mutable()||dirty||view.ready||matches.size===0,"ppw-confirm"));
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
   const form=document.createElement("form");form.className="ppw-search";
   const search=document.createElement("input");
   search.type="search";search.placeholder="Search your roster";
   search.value=current.query;search.setAttribute("aria-label","Search wrestlers");
   form.append(search);
   const submit=document.createElement("button");submit.type="submit";
   submit.textContent="Search";form.append(submit);
   form.onsubmit=e=>{e.preventDefault();void findTalent(search.value.trim());};
   sheet.append(form);
   const tools=el("div","ppw-picker-filters");
   const sort=selector(current.sort,[
    ["POPULARITY","Popularity"],["MOMENTUM","Momentum"],["IN_RING","In-ring"],
    ["PRESENTATION","Presentation"],["DATES","Dates left"],["NAME","Name"]],
    value=>{current.sort=value as typeof current.sort;render();});
   sort.setAttribute("aria-label","Sort loaded wrestlers");
   const division=selector(current.division,[
    ["ALL","All divisions"],["MEN","Men"],["WOMEN","Women"]],
    value=>{current.division=value as typeof current.division;render();});
   division.setAttribute("aria-label","Filter loaded wrestlers by division");
   tools.append(sort,division);sheet.append(tools);

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
   const sorted=current.items
    .filter(p=>current.division==="ALL"||p.division===current.division)
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
    sorted.length+" of "+current.items.length+" loaded · Search covers the full roster. Sort and division organise loaded results."));
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
 function sideLabel(index:number){return String.fromCharCode(65+index);}
 void load();
 return {reload:load,destroy:()=>{
  activeEditShade?.remove();activePickerShade?.remove();
  root.replaceChildren();delete root.dataset.broadcastPackage;
   root.classList.remove("ppw-editor","ppw-card-booking");
 }};
}
