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
 let choices=new Map<string,GorillaMatchInstruction>();
 const loadChoices=(id:string)=>{
  const matches=view?.shows.find(s=>s.showId===id)?.matches??[];
  choices=new Map(matches.map(m=>[m.matchId,{matchId:m.matchId,
   protectScript:m.protectScript,crowdChoice:m.crowdChoice,timingChoice:m.timingChoice}]));
 };
 async function reload(selected=""){
  busy=true;draw();
  try{
   view=await port.load();error="";
   showId=view.shows.some(s=>s.showId===selected)?selected:view.shows[0]?.showId??"";
   loadChoices(showId);
  }catch(e){error=e instanceof Error?e.message:"Gorilla clipboard could not load";}
  finally{busy=false;draw();}
 }
 const edit=(id:string,values:Partial<GorillaMatchInstruction>)=>{
  const existing=choices.get(id);if(existing)choices.set(id,{...existing,...values});
  draw();
 };
 async function save(){
  if(!view?.canEdit||!showId||busy)return;
  const revision=view.worldRevision,requestId=crypto.randomUUID(),target=showId;
  const matches=[...choices.values()];
  busy=true;error="";notice="";draw();
  try{
   const outcome=await port.save({requestId,expectedRevision:revision,
    showId:target,matches}) as {status?:string};
   if(outcome.status==="STALE")throw Error("The World changed. Reload and save again.");
   await reload(target);notice="Gorilla contingencies saved before World Lock.";
  }catch(e){error=e instanceof Error?e.message:"Gorilla instructions were not saved";}
  finally{busy=false;draw();}
 }
 function draw(){
  root.classList.add("ppw-editor","ppw-staff","ppw-gorilla-desk");
  root.replaceChildren();
  const head=el("header","ppw-staff-head");
  head.append(btn("← Staff Office",port.back),
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
  if(!view.canEdit)root.append(el("p","ppw-staff-lock",
   "The World is locked; these instructions can only be changed during an open week."));
  if(!view.shows.length){root.append(el("p","ppw-staff-panel",
   "No scheduled show card is saved yet. Book a match in Planner first."));return;}
  const navigator=el("section","ppw-staff-panel");
  const tabs=el("div","ppw-gorilla-shows");
  for(const show of view.shows){
   const tab=btn("Y"+show.year+" W"+show.week+" · "+show.name,()=>{
    showId=show.showId;loadChoices(showId);notice="";draw();},busy);
   tab.setAttribute("aria-pressed",String(showId===show.showId));
   tabs.append(tab);
  }
  navigator.append(el("h2","","Upcoming cards"),tabs);root.append(navigator);
  const show=view.shows.find(s=>s.showId===showId);
  if(!show)return;
  const block=el("section","ppw-staff-panel");
  block.append(el("h2","",show.name+" · Production instructions"));
  if(!show.matches.length)block.append(el("p","ppw-staff-muted",
   "No matches have been saved on this card yet."));
  const disabled=busy||!view.canEdit||!show.canEdit;
  for(const match of show.matches){
   const current=choices.get(match.matchId)??match;
   const card=el("article","ppw-gorilla-match");
   card.append(el("strong","",(match.position+1)+". "+match.description));
   if(match.unavailable.length)card.append(el("p","ppw-staff-lock",
    "Medical concern: "+match.unavailable.join(", ")+
    " may be unavailable. Review this booking before the deadline. Staff cannot force an injured wrestler to compete."));
   const protect=el("label","ppw-gorilla-protect");
   const check=el("input") as HTMLInputElement;
   check.type="checkbox";check.checked=current.protectScript;check.disabled=disabled;
   check.onchange=()=>edit(match.matchId,{protectScript:check.checked});
   protect.append(check,el("span","","Protect this match's booked presentation"));
   card.append(protect,
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
  block.append(btn("Save match contingencies",()=>void save(),
   disabled||!show.matches.length));root.append(block);
 }
 void reload();
}
