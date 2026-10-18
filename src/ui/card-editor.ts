/** Mobile-first PWA card editor, with no new runtime/framework dependency.
 * Host supplies authenticated RPC methods; browser cannot supply playerId.
 * Draws on the original PPW card's compact, expandable running-order design.
 */
import {newEditorMatch,restoreEditorMatch,assignPerformer,changeWinner,
 resizeMatch,moveElimination,moveRunningOrder,buildBookedMatch,assignedIds,
 editorMatchStyle,changeMatchIntent,changeMatchStyle,editorStyleLoad,bookedMatchHeadline,
 bookedStyleReadiness,type ConditionSnapshot,
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
import {matchCastingReadiness,angleCastingReadiness} from "./card-booking-readiness.js";
import {MATCH_STYLE_DIMENSIONS,type MatchStyleDimension} from "../simulation/legacy/match-style.js";
import {storyDirectionHint} from "./story-direction-hint.js";
import {initialCreativeBeat,supportsCreativeBeat,type SegmentCreativeBeat}
 from "../domain/segment-creative-beats.js";
import {creativeFields,creativeSummary} from "./segment-creative-options.js";
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
  division:string|null;available:boolean;reason:string}&Partial<ConditionSnapshot>>();
 let expanded:string|null=null;
 let picker:{slotId:string;side:number;member:number;role?:"actors"|"targets"|"RUN_IN";
  query:string;cursor:TalentPage["cursor"];items:TalentPage["talent"];
  sort:"POPULARITY"|"MOMENTUM"|"IN_RING"|"PRESENTATION"|"DATES"|"NAME";
  division:"ALL"|"MEN"|"WOMEN"}|null=null;
 let loading=false,saving=false,dirty=false,error="",success="";
 let pendingRequestId:string|null=null;
 let stableChoices:{stableId:string;name:string}[]|null=null;
 let stableChoicesLoading=false;
 let formatChoice:Format="SINGLES";
 let managementOpen=false;
 const openStyles=new Set<string>();
 const openRunIns=new Set<string>();
 const selectedName=(pick:PersonPick|null)=>!pick?"Choose wrestler":
  roster.get(pick.personId)?.name??pick.personId;
 const mutable=()=>view?.canEdit===true&&!saving;
 const errorText=(e:unknown)=>e instanceof Error?e.message:"Unable to load booking";
 const matchLabel=(m:EditorMatch)=>bookedMatchHeadline(m,selectedName);
 const matchSubtitle=(m:EditorMatch)=>{
  const fmt=FORMATS.find(x=>x.value===m.format)?.label??"Match";
  return fmt+" · "+assignedIds(m).length+" / "+
   m.teams.reduce((a,s)=>a+s.length,0)+" booked · "+
   m.plannedLengthMinutes+" min · "+nice(m.plannedFinish);
 };
 function markDirty(){dirty=true;pendingRequestId=null;error="";success="";}
 function setMatch(slotId:string,next:EditorMatch){
  matches.set(slotId,next);markDirty();render();
 }
 async function load(){
  loading=true;render();
  try{
   view=await port.load();
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
   for(const p of view.selectedPeople){
    const prior=roster.get(p.personId);
    roster.set(p.personId,{...prior,personId:p.personId,name:p.name,
     division:p.division,contractId:prior?.contractId??"",
     available:prior?.available??false,reason:prior?.reason??"BOOKED",
     inRingQuality:p.inRingQuality,matchCraft:p.matchCraft,presentation:p.presentation,
     stamina:p.stamina,safety:p.safety,fatigue:p.fatigue,wear:p.wear});
   }
   expanded=null;dirty=false;pendingRequestId=null;error="";success="";
  }catch(e){error=errorText(e);}
  finally{loading=false;render();}
 }
 async function findTalent(query:string,append=false){
  if(!picker)return;
  const request=picker;
  const cursor=append?request.cursor:null;
  try{
   const page=await port.talent(query,cursor);
   if(picker!==request)return;
   picker.query=query;picker.items=append?[...picker.items,...page.talent]:page.talent;
   picker.cursor=page.cursor;
   for(const p of page.talent)roster.set(p.personId,{...p});
   error="";render();
  }catch(e){error=errorText(e);render();}
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
  if(!mutable()||!view)return;
  try{
   const segmentPayloads=[...segments.values()].map(s=>({
    slotId:s.slotId,payload:buildEditorSegment(s),programmeId:s.programmeId}));
   const payloads=[...matches.values()].map(m=>({slotId:m.slotId,
    payload:buildBookedMatch(m)}));
   if(!payloads.length)throw new Error("Book at least one match");
   const all=payloads.flatMap(m=>m.payload.participants.map(p=>p.personId));
   if(new Set(all).size!==all.length)
    throw new Error("One wrestler cannot be in two matches");
   saving=true;error="";success="";render();
   const requestId=pendingRequestId??(pendingRequestId=crypto.randomUUID());
   const result=await port.save({requestId,expectedRevision:view.worldRevision,
    matches:payloads,segments:segmentPayloads,runningOrder:order});
   if(result.status==="STALE"){
    await load();
    error="The card has changed. Review the latest booking before saving.";
    return;
   }
   const previous=result.status;
   await load();
   success=previous==="REPLAYED"?"Booking already saved":"Show card saved";
  }catch(e){error=errorText(e);}
  finally{saving=false;render();}
 }
 async function confirm(){
  if(!mutable()||!view||dirty||view.ready||!port.confirmReady)return;
  saving=true;error="";success="";render();
  try{
   const response=await port.confirmReady({requestId:crypto.randomUUID(),
    expectedRevision:view.worldRevision});
   await load();
   if(response.status==="STALE")
    error="The show has changed. Review the latest lineup and confirm again.";
   else success="Your card is confirmed for the weekly deadline";
  }catch(e){error=errorText(e);}
  finally{saving=false;render();}
 }
 function render(){
  // Retain the focused editor's scroll position through controlled updates.
  // The underlying running order never needs reloading or re-querying.
  const priorModal=root.querySelector<HTMLElement>(".ppw-card-edit-sheet");
  const previousScroll=priorModal?.scrollTop??0;
  root.replaceChildren();
  root.classList.add("ppw-editor");
  root.classList.toggle("ppw-editing-card",expanded!==null);
  const top=el("header","ppw-top");
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
   el("span","",order.length+" card slots"),
   el("span","",castReady+" / "+order.length+" cast complete"),
   el("span","",dirty?"Unsaved changes":view.ready?"Show confirmed":"Not confirmed"));
  root.append(summary);
  // Match timing is already authored and available in memory. Present only a
  // truthful partial estimate: angles and entrances have their own air-time.
  const matchMinutes=[...matches.values()].reduce((n,m)=>n+m.plannedLengthMinutes,0);
  const airtime=el("section","ppw-card-airtime");
  const clock=el("div","ppw-card-airtime-heading");
  clock.append(el("span","ppw-eyebrow","MATCH TIME"),
   el("strong","",view.bookingClass==="REGULAR"?
    matchMinutes+" of 120 min TV guide":
    matchMinutes+" min of booked matches"));
  airtime.append(clock);
  if(view.bookingClass==="REGULAR"){
   const track=el("div","ppw-card-airtime-track");
   track.setAttribute("role","progressbar");
   track.setAttribute("aria-label","Booked match minutes against the television running-time guide");
   track.setAttribute("aria-valuemin","0");track.setAttribute("aria-valuemax","120");
   track.setAttribute("aria-valuenow",String(Math.min(120,matchMinutes)));
   const progress=el("span","ppw-card-airtime-fill");
   progress.style.width=Math.min(100,matchMinutes/120*100)+"%";
   if(matchMinutes>120)track.classList.add("ppw-card-airtime-overrun");
   track.append(progress);airtime.append(track);
  }
  airtime.append(el("small","",view.bookingClass==="REGULAR"?
   (matchMinutes>120?
    "Match time exceeds the TV guide. Review the card before adding entrances or angles.":
    "Angles, entrances and breaks need time too. Keep space for them."):
   "Entrances and angles are additional to these match minutes."));
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
  },!mutable()));
  const extras=el("div","ppw-management-links");
  if(port.openPlanner)
   extras.append(button("Show Planner",()=>port.openPlanner?.(),dirty||saving));
  if(port.openChampionships)
   extras.append(button("Championships",()=>port.openChampionships?.(),dirty||saving));
  if(port.openProgrammes)
   extras.append(button("Programmes",()=>port.openProgrammes?.(),dirty||saving));
  if(port.openTagTeams)
   extras.append(button("Tag teams",()=>port.openTagTeams?.(),dirty||saving));
  if(port.openContracts)
   extras.append(button("Contract Desk",()=>port.openContracts?.(),dirty||saving));
  if(port.openRoster)
   extras.append(button("My Roster",()=>port.openRoster?.(),dirty||saving));
  if(port.openMarket)
   extras.append(button("Talent Market",()=>port.openMarket?.(),dirty||saving));
  if(port.openBusiness)
   extras.append(button("Business",()=>port.openBusiness?.(),dirty||saving));
  if(port.openStaff)
   extras.append(button("Staff",()=>port.openStaff?.(),dirty||saving));
  if(port.openIndustry)
   extras.append(button("Industry",()=>port.openIndustry?.(),dirty||saving));
  if(port.openStables)
   extras.append(button("Stables",()=>port.openStables?.(),dirty||saving));
  if(port.openWorkingConnections)
   extras.append(button("Working connections",()=>port.openWorkingConnections?.(),dirty||saving));
  if(port.openPersona)
   extras.append(button("Wrestler identities",()=>port.openPersona?.(),dirty||saving));
  if(extras.childElementCount){
   const management=document.createElement("details");
   management.className="ppw-management-menu";management.open=managementOpen;
   management.ontoggle=()=>{managementOpen=management.open;};
   management.append(el("summary","","Management tools · Titles, Contracts & Roster"),extras);
   toolbar.append(management);
  }
  root.append(toolbar);
  const stories=view.programmes.filter(p=>p.latestFollowUp);
  if(stories.length){
   const continuity=document.createElement("details");
   continuity.className="ppw-card-continuity";
   const heading=el("summary","",
    "Rivalry follow-ups · "+stories.length+" "+(stories.length===1?"story":"stories"));
   continuity.append(heading);
   for(const story of stories){
    const note=story.latestFollowUp!;
    const item=el("article","ppw-card-continuity-story");
    item.append(el("strong","",story.label),
     el("p","",storyDirectionHint(note,"MATCH")),
     el("small","","After Year "+(Math.floor(note.weekIndex/52)+1)+
      " · Week "+(note.weekIndex%52+1)));
    continuity.append(item);
   }
   root.append(continuity);
  }
  const list=el("section","ppw-card-list");
  let editShade:HTMLElement|null=null;
  for(const [i,slotId] of order.entries()){
   const m=matches.get(slotId);
   const segment=segments.get(slotId);
   const card=el("article","ppw-card");
   const bar=el("div","ppw-card-bar");
   const label=el("div","");
   const angleName=segment?ANGLE_TYPES.find(x=>x.value===segment.kind)?.label??"Angle":"";
   const anglePeople=segment?[...segment.actors,...segment.targets]
    .map(person=>selectedName(person)).slice(0,3).join(" · "):"";
   const angleDetails=segment?creativeSummary(segment.creativeBeat):"";
   label.append(el("span","ppw-eyebrow","SLOT "+(i+1)+" · "+(m?"MATCH":"ANGLE")),
    el("strong","",m?matchLabel(m):angleName),
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
   bar.append(button(expanded===slotId?"▴":"▾",()=>{
    expanded=expanded===slotId?null:slotId;render();
   },false,"ppw-expand"),label);
   const arrows=el("div","ppw-actions");
   arrows.append(button("↑",()=>{order=moveRunningOrder(order,slotId,-1);markDirty();render();},
     !mutable()||i===0),
    button("↓",()=>{order=moveRunningOrder(order,slotId,1);markDirty();render();},
     !mutable()||i===order.length-1));
   bar.append(arrows);card.append(bar);
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
       ["INTERRUPTION","RESCUE","POST_MATCH_ASSAULT"].includes(kind)?
        initialCreativeBeat(kind):null,
      sourceMatchSlotId:segment.kind===kind?segment.sourceMatchSlotId:null,
      stableId:["STABLE_INVITATION","STABLE_EXIT","STABLE_RECONCILIATION"].includes(kind)?
       segment.stableId:null,
      stableDecision:["STABLE_INVITATION","STABLE_RECONCILIATION"].includes(kind)?
       segment.stableDecision:null,
      actors:LIMITED_ACTORS.has(kind)?segment.actors.slice(0,1):
       kind==="RESCUE"?segment.actors.slice(0,2):segment.actors,
      targets:["PROMO","INTERVIEW","CELEBRATION","CONTRACT_SIGNING","DEBUT"].includes(kind)?
       []:["INTERRUPTION","RESCUE","POST_MATCH_ASSAULT"].includes(kind)?
        segment.targets.slice(0,1):segment.targets});
    };
    const goal=angleGoalFor(segment.kind);
    controls.append(field("Creative direction",selector(goal,
     ANGLE_STORY_GOALS.map(x=>[x.value,x.label]),value=>
      setAngle(firstAngleFor(value as AngleGoal)),!mutable())));
    controls.append(field("Angle",selector(segment.kind,
     ANGLE_TYPES.filter(x=>anglesForGoal(goal).includes(x.value))
      .map(x=>[x.value,x.label]),value=>
      setAngle(value as EditorSegment["kind"]),!mutable())));
    controls.append(field("Scripted outcome",selector(segment.outcome,
     [["HAPPENS","Goes ahead"],["REFUSED","Refused"],["INTERRUPTED","Interrupted"]],
     v=>editSegment(segment,{outcome:v as EditorSegment["outcome"]}),!mutable())));
    if(supportsCreativeBeat(segment.kind)){
     if(!segment.creativeBeat){
      controls.append(button("Script the exact angle",()=>{
       editSegment(segment,{creativeBeat:initialCreativeBeat(segment.kind)});
      },!mutable(),"ppw-creative-detail-toggle"));
     }else{
      const beat=segment.creativeBeat;
      for(const option of creativeFields(segment.kind)){
       const value=(beat as unknown as Record<string,string>)[option.name]??"";
       controls.append(field(option.label,selector(value,
        option.options.map(x=>[x.value,x.label]),
        next=>editSegment(segment,{creativeBeat:{
         ...beat,[option.name]:next
        } as SegmentCreativeBeat}),!mutable())));
      }
      controls.append(button("Use a simple angle instead",()=>{
       editSegment(segment,{creativeBeat:null});
      },!mutable(),"ppw-creative-detail-toggle"));
     }
    }
    if(segment.kind==="POST_MATCH_ASSAULT"){
     const index=order.indexOf(slotId),victim=segment.targets[0]?.personId;
     const earlier=order.slice(0,index).flatMap(matchSlot=>{
      const match=matches.get(matchSlot);
      if(!match)return [];
      const people=match.teams.flat().filter((p):p is PersonPick=>p!==null);
      if(victim&&!people.some(p=>p.personId===victim))return [];
      return [[matchSlot,matchLabel(match)] as [string,string]];
     });
     controls.append(field("After which match?",selector(segment.sourceMatchSlotId??"",
      [["",earlier.length?"Choose the earlier match":"Book the match above this angle"],
       ...earlier],value=>editSegment(segment,{sourceMatchSlotId:value||null}),!mutable())));
     if(!earlier.some(([id])=>id===segment.sourceMatchSlotId))
      controls.append(el("p","ppw-angle-guidance",
       "Move this angle after the match and choose a wrestler from that bout."));
    }
    if(view.programmes.length)
     controls.append(field("Storyline / programme",selector(segment.programmeId??"",
      [["","None"],...view.programmes.map(p=>[
       p.programmeId,p.label+" · Heat "+(p.heat??"—")])],
      v=>editSegment(segment,{programmeId:v||null}),!mutable())));
    const linked=view.programmes.find(p=>p.programmeId===segment.programmeId);
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
    const direction=el("p","ppw-angle-guidance");
    direction.append(el("strong","",ANGLE_STORY_GOALS.find(x=>x.value===goal)!.label+" / "),
     el("span","",angleDirection(segment.kind)));
    body.append(direction);
    for(const role of ["actors","targets"] as const){
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
     const targetAllowed=!["PROMO","INTERVIEW","CELEBRATION","CONTRACT_SIGNING","DEBUT"].includes(segment.kind);
     if(role==="actors"||targetAllowed)
      section.append(button("+ Add "+(role==="actors"?
       specialist?(segment.actors.length?"rescuer":"attacker"):
        segment.kind==="INTERRUPTION"?"interrupter":
        segment.kind==="POST_MATCH_ASSAULT"?"attacker":"performer":
       specialist?"person being rescued":
        segment.kind==="INTERRUPTION"?"speaker":
        segment.kind==="POST_MATCH_ASSAULT"?"wrestler from the match":"target"),()=>{
       chooseSegmentTalent(slotId,role);
      },!mutable()||(role==="actors"&&
       (LIMITED_ACTORS.has(segment.kind)&&segment.actors.length===1||
        specialist&&segment.actors.length>=2))||
       role==="targets"&&["INTERRUPTION","RESCUE","POST_MATCH_ASSAULT"].includes(segment.kind)&&
        segment.targets.length>=1));
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
    const controls=el("div","ppw-control-grid");
    controls.append(field("Winner",selector(String(m.winnerSide),
     m.teams.map((_,index)=>[String(index),m.format==="BATTLE_ROYAL"?
      "Entrant "+(index+1):"Side "+sideLabel(index)]),
     v=>setMatch(slotId,changeWinner(m,Number(v))),!mutable())));
    controls.append(field("Intent",selector(m.intent,
     ["COMPETITIVE","SHOWCASE","DOMINANT","TECHNICAL","HIGH_RISK",
      "STORY","PROTECTIVE","EPIC"].map(x=>[x,nice(x)]),
      v=>setMatch(slotId,changeMatchIntent(m,v)),!mutable())));
    controls.append(field("Finish",selector(m.plannedFinish,
     (m.format==="BATTLE_ROYAL"?["OVER_THE_TOP_ROPE"]:
      m.format==="TRIPLE_THREAT"||m.format==="FOUR_WAY"?
      ["CLEAN_PIN","SUBMISSION","FLASH_PIN","PROTECTED_FINISH"]:
      ["CLEAN_PIN","SUBMISSION","FLASH_PIN","PROTECTED_FINISH",
       "DISQUALIFICATION","FOREIGN_OBJECT"]).map(x=>[x,nice(x)]),
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
     "SINGLES":m.format==="TAG"?"TAG":null;
    if(titleDivision){
     const choices:[string,string][]=[["","Non-title match"],
      ...view.championships.filter(c=>c.division===titleDivision)
       .map(c=>[c.championshipId,c.name+
        (c.vacant?" · VACANT":c.holderName?" · "+c.holderName:"")] as [string,string])];
     controls.append(field("Championship",selector(m.championshipId??"",choices,
      value=>edit(m,{championshipId:value||undefined}),!mutable())));
    }else if(m.championshipId){
     controls.append(el("p","ppw-alert ppw-error",
      "Championships require 2–4 singles wrestlers or a 2v2 tag match. Remove the title before saving."));
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
       value=>setMatch(slotId,resizeMatch(m,value)),!mutable())));
     if(m.format==="MULTI_TEAM")
      sizing.append(field("Wrestlers per team",
       numberField(m.teams[0]!.length,2,5,
        value=>setMatch(slotId,resizeMatch(m,m.teams.length,value)),!mutable())));
     body.append(sizing);
    }
    for(let side=0;side<m.teams.length;side++){
     const sideCard=el("div","ppw-side");
     sideCard.append(el("h3","",m.format==="BATTLE_ROYAL"?
      "Entrant "+(side+1):"Side "+sideLabel(side)));
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
  foot.append(el("p","ppw-muted","Save the card, then confirm your show before the booking deadline."),
   button(saving?"Saving…":"Save card",()=>{void save();},
    !mutable()||matches.size===0,"ppw-primary"));
  if(port.confirmReady)foot.append(button(
   view.ready?"Show confirmed":"Confirm this week’s card",
   ()=>{void confirm();},
   !mutable()||dirty||view.ready||matches.size===0,"ppw-confirm"));
  root.append(foot);
  if(editShade){
   root.append(editShade);
   if(!priorModal){
    editShade.querySelector<HTMLButtonElement>(".ppw-card-edit-close")?.focus();
   }
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
   const takenIds=new Set(current.role==="RUN_IN"?
    (matchForPicker?assignedIds(matchForPicker):[]):
    [...matches.values()].flatMap(m=>assignedIds(m)));
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
    const label=candidate.available?
     (candidate.remainingDates===null?"UNLIMITED DATES":
      candidate.remainingDates+" DATES REMAINING"):
      nice(candidate.reason);
    const entry=el("div","ppw-picker-wrestler");
    entry.append(createWrestlerCard({...candidate,name:candidate.name??candidate.personId,
     status:label},{
     context:"BOOKING",compact:true,label:taken?"ALREADY BOOKED":label,
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
   shade.append(sheet);root.append(shade);
  }
 }
 function sideLabel(index:number){return String.fromCharCode(65+index);}
 void load();
 return {reload:load,destroy:()=>{root.replaceChildren();root.classList.remove("ppw-editor");}};
}
