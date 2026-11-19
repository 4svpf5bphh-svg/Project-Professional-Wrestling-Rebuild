/** A real-booking composer. All callbacks change the existing EditorSegment;
 * the original show-card save validates and persists the structured actions. */
import type {EditorSegment} from "./card-segment-model.js";
import {angleActionsFor,angleActionNeedsTarget,angleActionNeedsPresentTarget,
 angleSequenceRoles,ANGLE_SEQUENCE_LABELS,isAuthoredAngleSequence,
 describeAngleSequenceStep,type AuthoredAngleAction,type AngleActionKind}
 from "../domain/angle-sequence.js";

type Update=(change:(current:AuthoredAngleAction[])=>AuthoredAngleAction[],
 redraw:boolean)=>void;
const dom=(tag:string,className="",text="")=>{
 const e=document.createElement(tag);e.className=className;e.textContent=text;return e;
};
const select=(value:string,options:readonly (readonly [string,string])[],
 onChange:(value:string)=>void,disabled:boolean,label:string)=>{
 const e=document.createElement("select");e.value=value;e.disabled=disabled;
 e.setAttribute("aria-label",label);
 for(const [key,name] of options){
  const o=document.createElement("option");o.value=key;o.textContent=name;e.append(o);
 }
 e.value=value;e.onchange=()=>onChange(e.value);return e;
};
const field=(label:string,control:HTMLElement)=>{
 const wrapper=dom("label","ppw-angle-sequence-field");
 wrapper.append(dom("span","",label),control);return wrapper;
};
const actionButton=(text:string,label:string,onClick:()=>void,disabled:boolean)=>{
 const b=document.createElement("button");b.type="button";b.textContent=text;
 b.setAttribute("aria-label",label);b.disabled=disabled;b.onclick=onClick;return b;
};
export function createAngleSequenceEditor(
 segment:EditorSegment,name:(id:string)=>string,canEdit:boolean,update:Update
):HTMLElement{
 const section=dom("section","ppw-angle-sequence");
 const heading=dom("header","ppw-angle-sequence-title");
 heading.append(dom("strong","","Direct the action, beat by beat"),
  dom("small","","Combine dialogue, reactions and physical moments inside this one scene. The actual wrestlers and original result rules still apply."));
 section.append(heading);
 const context={kind:segment.kind,
  actorIds:segment.actors.map(p=>p.personId),
  targetIds:segment.targets.map(p=>p.personId),
  targetPresence:segment.targetPresence};
 const {visible,mentioned}=angleSequenceRoles(context);
 const max=6;
 for(const [i,step] of segment.scriptedActions.entries()){
  const box=dom("section","ppw-angle-sequence-step");
  box.setAttribute("data-moment",String(i+1));
  const head=dom("header","ppw-angle-sequence-step-head");
  head.append(dom("strong","","MOMENT "+(i+1)));
  const tools=dom("div","ppw-angle-sequence-step-tools");
  const swap=(dir:number)=>update(list=>{
   const next=[...list],j=i+dir;
   if(j>=0&&j<next.length)[next[i],next[j]]=[next[j]!,next[i]!];
   return next;
  },true);
  tools.append(
   actionButton("↑","Move moment "+(i+1)+" earlier",()=>swap(-1),
    !canEdit||i===0),
   actionButton("↓","Move moment "+(i+1)+" later",()=>swap(1),
    !canEdit||i===segment.scriptedActions.length-1),
   actionButton("×","Remove moment "+(i+1),
    ()=>update(list=>list.filter((_,j)=>i!==j),true),!canEdit));
  head.append(tools);box.append(head);
  const controls=dom("div","ppw-angle-sequence-controls");
  controls.append(field("Action",select(step.action,
   angleActionsFor(segment.kind).map(a=>[a,ANGLE_SEQUENCE_LABELS[a]]),
   raw=>{
    const action=raw as AngleActionKind;
    const targets=[...visible,...(angleActionNeedsPresentTarget(action)?[]:mentioned)]
     .filter(id=>id!==step.by);
    update(list=>list.map((item,j)=>{
     if(j!==i)return item;
     const to=angleActionNeedsTarget(action)?targets[0]:
      (action==="WALK_AWAY"?undefined:item.to);
     const {to:_prior,...rest}=item;
     return {...rest,action,...(to?{to}:{})};
    }),true);
   },!canEdit,"Moment "+(i+1)+" action")));
  controls.append(field("Performer",select(step.by,visible.map(id=>[id,name(id)]),
   by=>update(list=>list.map((item,j)=>{
    if(j!==i)return item;
    const other=[...visible,...(angleActionNeedsPresentTarget(item.action)?[]:mentioned)]
     .filter(id=>id!==by);
    const {to:_prior,...rest}=item;
    const to=item.to===by?other[0]:item.to;
    return {...rest,by,...(to?{to}:{})};
   }),true),!canEdit,"Moment "+(i+1)+" performer")));
  if(step.action!=="WALK_AWAY"){
   const targetOptions=[...visible,
    ...(angleActionNeedsPresentTarget(step.action)?[]:mentioned)]
    .filter(id=>id!==step.by);
   const options:readonly (readonly [string,string])[]=[
    ...(!angleActionNeedsTarget(step.action)?[["","No recipient"] as const]:[]),
    ...targetOptions.map(id=>[id,name(id)] as const)];
   controls.append(field(angleActionNeedsTarget(step.action)?
    "Recipient":"Addressed to (optional)",select(step.to??"",options,
    raw=>update(list=>list.map((item,j)=>{
     if(j!==i)return item;
     const {to:_old,...rest}=item;
     return {...rest,...(raw?{to:raw}:{})};
    }),true),!canEdit,"Moment "+(i+1)+" recipient")));
  }
  box.append(controls);
  const note=dom("label","ppw-angle-sequence-note");
  note.append(dom("span","","Optional dialogue or stage direction"));
  const input=document.createElement("textarea");input.rows=2;input.maxLength=160;
  input.value=step.line??"";input.disabled=!canEdit;
  input.placeholder="Exact words or stage detail (optional)";
  input.setAttribute("aria-label","Moment "+(i+1)+" dialogue or detail");
  // Update the actual working draft without stealing iPhone keyboard focus.
  input.oninput=()=>update(list=>list.map((item,j)=>{
   if(i!==j)return item;
   const {line:_old,...rest}=item;
   const line=input.value.trim();
   return {...rest,...(line?{line}:{})};
  }),false);
  note.append(input);box.append(note);section.append(box);
 }
 const footer=dom("div","ppw-angle-sequence-footer");
 footer.append(actionButton("+ Add moment","Add scripted moment",()=>{
  const by=visible[0];if(by)update(list=>[...list,{action:"SPEAK",by}],true);
 },!canEdit||segment.scriptedActions.length>=max||visible.length===0));
 footer.append(dom("small","",segment.scriptedActions.length+" / 6 moments"));
 section.append(footer);
 if(!segment.scriptedActions.length)section.append(dom("p","ppw-angle-sequence-hint",
  "Optional. Leave empty for a traditional single-action angle, or add a response, escalation and finish."));
 else if(!isAuthoredAngleSequence(segment.scriptedActions,context)){
  const warning=dom("p","ppw-angle-sequence-warning",
   "A scripted moment no longer fits the selected wrestlers or angle. Change its performer, recipient or action before continuing.");
  warning.setAttribute("role","alert");section.append(warning);
 }
 return section;
}
export function createAngleSequenceReview(segment:EditorSegment,
 name:(id:string)=>string):HTMLElement|null{
 if(!segment.scriptedActions.length)return null;
 const section=dom("section","ppw-angle-sequence-review");
 section.append(dom("strong","","How the scene plays out"));
 const names=new Map([...segment.actors,...segment.targets].map(p=>[p.personId,name(p.personId)]));
 segment.scriptedActions.forEach((step,i)=>{
  section.append(dom("p","",(i+1)+". "+describeAngleSequenceStep(step,names)));
 });
 return section;
}
