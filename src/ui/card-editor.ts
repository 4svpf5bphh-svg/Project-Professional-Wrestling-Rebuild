/** Mobile-first PWA card editor, with no new runtime/framework dependency.
 * Host supplies authenticated RPC methods; browser cannot supply playerId.
 * Draws on the original PPW card's compact, expandable running-order design.
 */
import {newEditorMatch,restoreEditorMatch,assignPerformer,changeWinner,
 resizeMatch,moveElimination,moveRunningOrder,buildBookedMatch,assignedIds,
 FORMATS,type EditorMatch,type Format,type PersonPick}
 from "./card-editor-model.js";
import {ANGLE_TYPES,VIDEO_PURPOSES,REQUIRED_TARGETS,LIMITED_ACTORS,newEditorSegment,
 restoreEditorSegment,addSegmentPerson,buildEditorSegment,type EditorSegment}
 from "./card-segment-model.js";
import type {readShowCardEditor,readBookableCardTalent,
 saveShowCardMatches} from "../db/show-card-editor.js";
import type {markPreparedShowReady} from "../db/ready-prepared-show.js";
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
 openStables?():void;
 openWorkingConnections?():void;
 openPersona?():void;
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
 select.setAttribute("aria-label","Booking choice");
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
  division:string|null;available:boolean;reason:string}>();
 let expanded:string|null=null;
 let picker:{slotId:string;side:number;member:number;role?:"actors"|"targets";
  query:string;cursor:TalentPage["cursor"];items:TalentPage["talent"] }|null=null;
 let loading=false,saving=false,dirty=false,error="",success="";
 let pendingRequestId:string|null=null;
 let stableChoices:{stableId:string;name:string}[]|null=null;
 let stableChoicesLoading=false;
 let formatChoice:Format="SINGLES";
 let managementOpen=false;
 const selectedName=(pick:PersonPick|null)=>!pick?"Choose wrestler":
  roster.get(pick.personId)?.name??pick.personId;
 const mutable=()=>view?.canEdit===true&&!saving;
 const errorText=(e:unknown)=>e instanceof Error?e.message:"Unable to load booking";
 const matchLabel=(m:EditorMatch)=>{
  const fmt=FORMATS.find(x=>x.value===m.format)?.label??"Match";
  return fmt+" · "+assignedIds(m).length+" / "+
   m.teams.reduce((a,s)=>a+s.length,0)+" booked";
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
   for(const p of (view as View&{selectedPeople?:{
    personId:string;name:string;division:string}[]}).selectedPeople??[]){
    if(!roster.has(p.personId))
     roster.set(p.personId,{personId:p.personId,name:p.name,division:p.division,
      contractId:"",available:false,reason:"BOOKED"});
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
  picker={slotId,side,member,query:"",cursor:null,items:[]};
  render();
  void findTalent("");
 }
 function chooseTalent(p:TalentPage["talent"][number]){
  if(!picker||!p.available)return;
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
 function chooseSegmentTalent(slotId:string,role:"actors"|"targets"){
  picker={slotId,side:0,member:0,role,query:"",cursor:null,items:[]};
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
    error="The World changed; review the reloaded booking before saving.";
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
    error="The World changed. Recheck your show and confirm again.";
   else success="Show confirmed for the next World Lock";
  }catch(e){error=errorText(e);}
  finally{saving=false;render();}
 }
 function render(){
  root.replaceChildren();
  root.classList.add("ppw-editor");
  const top=el("header","ppw-top");
  top.append(el("div","ppw-eyebrow","PPW  /  BOOKING"),
   el("h1","","The Card"));
  const headline=el("p","ppw-muted",loading?"Loading your show…":
   view?"Year "+view.year+" · Week "+view.week+" · "+
    (view.canEdit?"Booking open":"Read only"):"Your next show");
  top.append(headline);
  root.append(top);
  if(error)root.append(el("p","ppw-alert ppw-error",error));
  if(success)root.append(el("p","ppw-alert ppw-success",success));
  if(!view){
   if(!loading)root.append(button("Retry",()=>{void load();}));
   return;
  }
  const summary=el("div","ppw-summary");
  summary.append(el("span","",matches.size+" matches"),
    el("span","",segments.size+" angles"),
   el("span","",order.length+" card slots"),
   el("span","",dirty?"Unsaved changes":view.ready?"Ready for World Lock":"Not confirmed"));
  root.append(summary);
  const toolbar=el("div","ppw-toolbar");
  toolbar.append(selector(formatChoice,FORMATS.map(f=>[f.value,f.label]),
   v=>{formatChoice=v as Format;render();},!mutable()));
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
  const list=el("section","ppw-card-list");
  for(const [i,slotId] of order.entries()){
   const m=matches.get(slotId);
   const segment=segments.get(slotId);
   const card=el("article","ppw-card");
   const bar=el("div","ppw-card-bar");
   const label=el("div","");
   label.append(el("span","ppw-eyebrow","SLOT "+(i+1)+" · "+(m?"MATCH":"SEGMENT")),
    el("strong","",m?matchLabel(m):segment?ANGLE_TYPES.find(x=>x.value===segment.kind)?.label??"Angle":"Angle"));
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
    const controls=el("div","ppw-control-grid");
    controls.append(field("Angle",selector(segment.kind,
     ANGLE_TYPES.map(x=>[x.value,x.label]),v=>{
      const kind=v as EditorSegment["kind"];
      if(["STABLE_INVITATION","STABLE_EXIT","STABLE_RECONCILIATION"].includes(kind))
       void loadStableChoices();
      editSegment(segment,{kind,
       stableId:["STABLE_INVITATION","STABLE_EXIT","STABLE_RECONCILIATION"].includes(kind)?
        segment.stableId:null,
       actors:LIMITED_ACTORS.has(kind)?segment.actors.slice(0,1):segment.actors,
       targets:["PROMO","INTERVIEW","CELEBRATION","CONTRACT_SIGNING","DEBUT"].includes(kind)?[]:segment.targets});
     },!mutable())));
    controls.append(field("Scripted outcome",selector(segment.outcome,
     [["HAPPENS","Goes ahead"],["REFUSED","Refused"],["INTERRUPTED","Interrupted"]],
     v=>editSegment(segment,{outcome:v as EditorSegment["outcome"]}),!mutable())));
    if(view.programmes.length)
     controls.append(field("Storyline / programme",selector(segment.programmeId??"",
      [["","None"],...view.programmes.map(p=>[
       p.programmeId,p.label+" · Heat "+(p.heat??"—")])],
      v=>editSegment(segment,{programmeId:v||null}),!mutable())));
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
    for(const role of ["actors","targets"] as const){
     const section=el("div","ppw-side");
     section.append(el("h3","",role==="actors"?"On-screen talent / initiators":"Targets / rivals"));
     for(const person of segment[role]){
      const line=el("div","ppw-elimination-row");
      line.append(el("span","",selectedName(person)),
       button("×",()=>editSegment(segment,{[role]:segment[role].filter(p=>p.personId!==person.personId)}),
        !mutable()));
      section.append(line);
     }
     const targetAllowed=!["PROMO","INTERVIEW","CELEBRATION","CONTRACT_SIGNING","DEBUT"].includes(segment.kind);
     if(role==="actors"||targetAllowed)
      section.append(button("+ Add "+(role==="actors"?"performer":"target"),()=>{
       chooseSegmentTalent(slotId,role);
      },!mutable()||(role==="actors"&&LIMITED_ACTORS.has(segment.kind)&&segment.actors.length===1)));
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
    const controls=el("div","ppw-control-grid");
    controls.append(field("Winner",selector(String(m.winnerSide),
     m.teams.map((_,index)=>[String(index),m.format==="BATTLE_ROYAL"?
      "Entrant "+(index+1):"Side "+sideLabel(index)]),
     v=>setMatch(slotId,changeWinner(m,Number(v))),!mutable())));
    controls.append(field("Intent",selector(m.intent,
     ["COMPETITIVE","SHOWCASE","DOMINANT","TECHNICAL","HIGH_RISK",
      "STORY","PROTECTIVE","EPIC"].map(x=>[x,nice(x)]),
      v=>edit(m,{intent:v}),!mutable())));
    controls.append(field("Finish",selector(m.plannedFinish,
     (m.format==="BATTLE_ROYAL"?["OVER_THE_TOP_ROPE"]:
      m.format==="TRIPLE_THREAT"||m.format==="FOUR_WAY"?
      ["CLEAN_PIN","SUBMISSION","FLASH_PIN","PROTECTED_FINISH"]:
      ["CLEAN_PIN","SUBMISSION","FLASH_PIN","PROTECTED_FINISH",
       "DISQUALIFICATION","FOREIGN_OBJECT"]).map(x=>[x,nice(x)]),
      v=>edit(m,{plannedFinish:v}),!mutable())));
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
   list.append(card);
  }
  root.append(list);
  const foot=el("div","ppw-save");
  foot.append(el("p","ppw-muted","Booking saves your choices only. It never advances World time."),
   button(saving?"Saving…":"Save card",()=>{void save();},
    !mutable()||matches.size===0,"ppw-primary"));
  if(port.confirmReady)foot.append(button(
   view.ready?"Show confirmed":"Confirm ready for World Lock",
   ()=>{void confirm();},
   !mutable()||dirty||view.ready||matches.size===0,"ppw-confirm"));
  root.append(foot);
  if(picker){
   const current=picker;
   const shade=el("div","ppw-sheet-shade");
   shade.onclick=e=>{if(e.target===shade){picker=null;render();}};
   const sheet=el("div","ppw-sheet");
   sheet.setAttribute("role","dialog");sheet.setAttribute("aria-modal","true");
   sheet.setAttribute("aria-label","Choose wrestler");
   const heading=el("div","ppw-sheet-head");
   heading.append(el("h2","","Choose wrestler"),
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
   const chosen=matches.get(current.slotId)?.teams[current.side]?.[current.member]??null;
   if(chosen)sheet.append(button("Clear position",()=>{
    const item=matches.get(current.slotId)!;
    setMatch(current.slotId,assignPerformer(item,current.side,current.member,null));
    picker=null;render();
   }));
   const rows=el("div","ppw-talent-rows");
   for(const candidate of current.items){
    const taken=[...matches.values()].flatMap(x=>assignedIds(x)).includes(candidate.personId)&&
     chosen?.personId!==candidate.personId;
    const realName=candidate.name??candidate.personId;
    const name=candidate.ringName&&candidate.ringName!==realName?
     candidate.ringName+" ("+realName+")":realName;
    const character=candidate.gimmickId?
     " · "+candidate.gimmickId.replaceAll("_"," ").toLowerCase():"";
    rows.append(button(name+character+" · "+(candidate.division??"Unknown division")+
     (candidate.available?" · "+(candidate.remainingDates===null?
      "Unlimited dates":candidate.remainingDates+" dates"):" · "+candidate.reason),
     ()=>chooseTalent(candidate),!candidate.available||taken,"ppw-talent"));
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
