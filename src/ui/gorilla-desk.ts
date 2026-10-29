/** Pre-show Gorilla clipboard. It never opens a second live booking deadline. */
import type {readGorillaWorkspace} from "../db/gorilla-workspace.js";
import type {GorillaMatchInstruction,GorillaCrowdDirective,GorillaTimingDirective}
 from "../domain/gorilla-position.js";
type View=Awaited<ReturnType<typeof readGorillaWorkspace>>;
export interface GorillaDeskPort{
 load():Promise<View>;
 save(input:{requestId:string;expectedRevision:number;showId:string;
  matches:GorillaMatchInstruction[]}):Promise<unknown>;
 back():void;
}
const el=(tag:string,cls="",text="")=>{
 const n=document.createElement(tag);n.className=cls;n.textContent=text;return n;
};
const btn=(name:string,action:()=>void,disabled=false)=>{
 const b=el("button","ppw-staff-button",name) as HTMLButtonElement;
 b.type="button";b.disabled=disabled;b.onclick=action;return b;
};
function select<T extends string>(label:string,options:readonly [T,string][],value:T,
 action:(v:T)=>void,disabled:boolean){
 const field=el("label","ppw-gorilla-field");field.append(el("strong","",label));
 const box=el("select","ppw-staff-term") as HTMLSelectElement;
 box.setAttribute("aria-label",label);box.disabled=disabled;
 for(const [value,name] of options){
  const option=document.createElement("option");option.value=value;
  option.textContent=name;box.append(option);
 }
 box.value=value;box.onchange=()=>action(box.value as T);field.append(box);
 return field;
}
export function mountGorillaDesk(root:HTMLElement,port:GorillaDeskPort){
 let view:View|null=null,showId="",busy=false,error="",notice="";
 // Local card-by-card edits must survive switching show tabs. They remain
 // client-only until the booker explicitly saves the selected show.
 const edits=new Map<string,Map<string,GorillaMatchInstruction>>();
 const baselines=new Map<string,string>();
 let choices=new Map<string,GorillaMatchInstruction>();
 let pendingSave:{fingerprint:string;requestId:string}|null=null;
 const snapshot=(values:Map<string,GorillaMatchInstruction>)=>
  JSON.stringify([...values.values()].sort((a,b)=>a.matchId.localeCompare(b.matchId)));
 const loadChoices=(id:string)=>{
  if(!edits.has(id)){
   const matches=view?.shows.find(s=>s.showId===id)?.matches??[];
   const values=new Map(matches.map(m=>[m.matchId,{matchId:m.matchId,
    protectScript:m.protectScript,crowdChoice:m.crowdChoice,
    timingChoice:m.timingChoice}]));
   edits.set(id,values);baselines.set(id,snapshot(values));
  }
  choices=edits.get(id)!;
 };
 const isDirty=(id:string)=>edits.has(id)&&snapshot(edits.get(id)!)!==baselines.get(id);
 const anyDirty=()=>[...edits.keys()].some(isDirty);
 const goBack=()=>{
  if(anyDirty()&&!window.confirm("Leave Gorilla Position? Your unsaved show instructions will be lost."))return;
  port.back();
 };
 async function reload(selected=""){
  busy=true;draw();
  try{
   view=await port.load();error="";
   edits.clear();baselines.clear();
   showId=view.shows.some(s=>s.showId===selected)?selected:view.shows[0]?.showId??"";
   loadChoices(showId);
  }catch(e){error=e instanceof Error?e.message:"Gorilla clipboard could not load";}
  finally{busy=false;draw();}
 }
 const edit=(id:string,values:Partial<GorillaMatchInstruction>)=>{
  const existing=choices.get(id);if(existing){
   choices.set(id,{...existing,...values});pendingSave=null;notice="";
  }
  draw();
 };
 async function save(){
  if(!view?.canEdit||!showId||busy||!isDirty(showId))return;
  const revision=view.worldRevision,target=showId;
  const matches=[...choices.values()].sort((a,b)=>a.matchId.localeCompare(b.matchId));
  const fingerprint=JSON.stringify({revision,target,matches});
  if(!pendingSave||pendingSave.fingerprint!==fingerprint)
   pendingSave={fingerprint,requestId:crypto.randomUUID()};
  const requestId=pendingSave.requestId;
  busy=true;error="";notice="";draw();
  try{
   const outcome=await port.save({requestId,expectedRevision:revision,
    showId:target,matches}) as {status?:string};
   if(outcome.status==="STALE"){
    pendingSave=null;
    throw Error("The World changed. Reload the clipboard and review your instructions before saving again.");
   }
   if(outcome.status!=="APPLIED"&&outcome.status!=="REPLAYED")
    throw Error("The save is not confirmed. Retry without changing these instructions.");
   // After a confirmed receipt, reload authoritative data. If that read
   // fails, the same request ID is retained for safe replay.
   await reload(target);
   pendingSave=null;notice="Gorilla contingencies saved before World Lock.";
  }catch(e){error=e instanceof Error?e.message:"Gorilla instructions were not saved";}
  finally{busy=false;draw();}
 }
 function draw(){
  root.classList.add("ppw-editor","ppw-staff","ppw-gorilla-desk");
  root.replaceChildren();
  const head=el("header","ppw-staff-head");
  head.append(btn("← Staff Office",goBack),
   el("span","ppw-staff-kicker","PPW / GORILLA POSITION"),
   el("h1","","At the curtain"),
   el("p","ppw-staff-muted",
    "Pre-authorise exceptional decisions. Scripted winners, finishes, running order and contracts remain protected. No live attendance is required."));
  root.append(head);
  if(error)root.append(el("p","ppw-alert ppw-error",error));
  if(notice)root.append(el("p","ppw-alert ppw-success",notice));
  if(!view){if(!busy)root.append(btn("Retry",()=>void reload()));return;}
  root.append(el("p","ppw-staff-muted","Year "+view.year+" · Week "+view.week+
   " · Standing policy: "+view.policy.replaceAll("_"," ")));
  if(anyDirty())root.append(el("p","ppw-gorilla-unsaved",
   "Unsaved production notes. Changes take effect only after you save them before World Lock."));
  if(!view.canEdit)root.append(el("p","ppw-staff-lock",
   "The World is locked; these instructions can only be changed during an open week."));
  if(!view.shows.length){root.append(el("p","ppw-staff-panel",
   "No scheduled show card is saved yet. Book a match in Planner first."));return;}
  const navigator=el("section","ppw-staff-panel");
  const tabs=el("div","ppw-gorilla-shows");
  for(const show of view.shows){
   const tab=btn("Y"+show.year+" W"+show.week+" · "+show.name+
    (isDirty(show.showId)?" · UNSAVED":""),()=>{
    showId=show.showId;loadChoices(showId);notice="";error="";pendingSave=null;draw();},busy);
   tab.setAttribute("aria-pressed",String(showId===show.showId));
   tabs.append(tab);
  }
  navigator.append(el("h2","","Upcoming cards"),tabs);root.append(navigator);
  const show=view.shows.find(s=>s.showId===showId);
  if(!show)return;
  const block=el("section","ppw-staff-panel");
  block.append(el("span","ppw-gorilla-eyebrow","SHOW PRODUCTION / "+
   (show.status==="SUBMITTED"?"PREPARED":"DRAFT CARD")),
   el("h2","",show.name+" · Production instructions"),
   el("p","ppw-staff-muted",
    "Only exceptional crowd reactions and serious overruns are handled here. "+
    "Booked winners, finishes, matches and injuries never change."));
  if(!show.matches.length)block.append(el("p","ppw-staff-muted",
   "No matches have been saved on this card yet."));
  const disabled=busy||!view.canEdit||!show.canEdit;
  for(const match of show.matches){
   const current=choices.get(match.matchId)??match;
   const card=el("article","ppw-gorilla-match");
   card.append(el("span","ppw-gorilla-match-number","MATCH "+(match.position+1)),
    el("strong","",(match.position+1)+". "+match.description));
   if(match.unavailable.length)card.append(el("p","ppw-staff-lock",
    "Medical concern: "+match.unavailable.join(", ")+
    " may be unavailable. Review this booking before the deadline. Staff cannot force an injured wrestler to compete."));
   const protect=el("label","ppw-gorilla-protect");
   const check=el("input") as HTMLInputElement;
   check.type="checkbox";check.checked=current.protectScript;check.disabled=disabled;
   check.onchange=()=>edit(match.matchId,{protectScript:check.checked});
   protect.append(check,el("span","","Protect this match's booked presentation"));
   card.append(protect);
   if(current.protectScript)card.append(el("p","ppw-gorilla-locked-note",
    "Protected: the crowd and timing contingencies below are held, not executed. "+
    "Untick protection to use them."));
   card.append(
    select<GorillaCrowdDirective>("Exceptional crowd response",[
     ["DELEGATE","Use the standing instruction"],
     ["PROTECT_SCRIPT","Stick to the booked broadcast"],
     ["RESET_COMMENTARY","Reset commentary if the crowd turns cold"],
     ["LET_CROWD_BREATHE","Let the crowd's big moment breathe"]
    ],current.crowdChoice,
    v=>edit(match.matchId,{crowdChoice:v}),disabled||current.protectScript),
    select<GorillaTimingDirective>("Verified major timing overrun",[
     ["DELEGATE","Use the standing instruction"],
     ["PROTECT_SCRIPT","Preserve all transitions"],
     ["TIGHTEN_TRANSITIONS","Tighten only unscripted transitions"]
    ],current.timingChoice,
    v=>edit(match.matchId,{timingChoice:v}),disabled||current.protectScript));
   block.append(card);
  }
  const actions=el("div","ppw-gorilla-actions");
  actions.append(btn(busy?"Saving…":"Save match contingencies",()=>void save(),
   disabled||!show.matches.length||!isDirty(showId)));
  if(isDirty(showId))actions.append(btn("Discard changes",()=>{
   if(!view)return;
   edits.delete(showId);baselines.delete(showId);loadChoices(showId);
   pendingSave=null;error="";notice="";draw();
  },disabled));
  block.append(actions);root.append(block);
 }
 void reload();
}
