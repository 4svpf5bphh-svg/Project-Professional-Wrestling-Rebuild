import type {readStaffWorkspace} from "../db/staff-workspace.js";
export type StaffView=Awaited<ReturnType<typeof readStaffWorkspace>>;
export interface StaffPort{
 load():Promise<StaffView>;
 save(input:{requestId:string;expectedRevision:number;
  allowUnfinishedFallback:boolean;allowLogisticsFallback:boolean;
  permittedDays:number[];permittedVenueIds:string[]}):Promise<unknown>;
 back?():void;
}
const el=(tag:string,cls="",content="")=>{
 const x=document.createElement(tag);x.className=cls;x.textContent=content;return x;
};
const button=(content:string,click:()=>void,disabled=false)=>{
 const b=el("button","ppw-staff-button",content) as HTMLButtonElement;
 b.type="button";b.disabled=disabled;b.onclick=click;return b;
};
const weekdays=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
/** Every permission opt-in is explicit, revocable before World Lock and
 * guarded by the same verified actor and revision as booking decisions. */
export function mountStaffDesk(root:HTMLElement,port:StaffPort){
 let view:StaffView|null=null,loading=false,saving=false,error="",notice="";
 let unfinished=false,logistics=false,days=new Set<number>(),
  venues=new Set<string>(),requestId="";
 const changed=()=>{requestId="";};
 const hydrate=(next:StaffView)=>{
  view=next;unfinished=next.allowUnfinishedFallback;
  logistics=next.allowLogisticsFallback;days=new Set(next.permittedDays);
  venues=new Set(next.permittedVenueIds);
 };
 async function refresh(){
  loading=true;render();
  try{hydrate(await port.load());error="";}
  catch(e){error=e instanceof Error?e.message:"Staff settings could not load";}
  finally{loading=false;render();}
 }
 async function save(){
  if(!view?.canEdit||saving)return;
  if(logistics&&(!days.size||!venues.size)){
   error="Choose at least one day and one venue for logistics delegation.";
   render();return;
  }
  const id=requestId||(requestId=crypto.randomUUID());
  saving=true;error="";notice="";render();
  try{
   const result=await port.save({
    requestId:id,expectedRevision:view.worldRevision,
    allowUnfinishedFallback:unfinished,allowLogisticsFallback:logistics,
    permittedDays:logistics?[...days].sort():[],
    permittedVenueIds:logistics?[...venues].sort():[]
   });
   if(result&&typeof result==="object"&&"status" in result&&
     (result as {status:unknown}).status==="STALE")
    throw new Error("World changed. Reload Staff permissions to review this choice.");
   hydrate(await port.load());requestId="";
   notice="Staff permissions saved for future World Lock decisions.";
  }catch(e){error=e instanceof Error?e.message:"Staff permissions were not saved";}
  finally{saving=false;render();}
 }
 function toggle(text:string,description:string,value:boolean,
  onChange:(next:boolean)=>void,disabled=false){
  const row=el("label","ppw-staff-toggle");
  const input=document.createElement("input");input.type="checkbox";
  input.checked=value;input.disabled=disabled;input.onchange=()=>{
   onChange(input.checked);changed();render();
  };
  row.append(input,el("strong","",text),el("span","",description));
  return row;
 }
 function render(){
  root.classList.add("ppw-editor","ppw-staff");root.replaceChildren();
  const head=el("header","ppw-staff-head");
  if(port.back)head.append(button("← Back",()=>port.back?.()));
  head.append(el("span","ppw-staff-kicker","PPW / THE OFFICE"),
   el("h1","","Staff"),
   el("p","ppw-staff-muted",
    view?"Year "+view.year+" · Week "+view.week:
     "Delegate administrative fallbacks without surrendering creative control."));
  root.append(head);
  if(error)root.append(el("p","ppw-alert ppw-error",error));
  if(notice)root.append(el("p","ppw-alert ppw-success",notice));
  if(!view){if(!loading)root.append(button("Retry",()=>void refresh()));return;}
  if(!view.canEdit)root.append(el("p","ppw-staff-lock",
   "World Lock is closed. Settings are view-only; this week's permissions were frozen."));
  const fallback=el("section","ppw-staff-panel");
  fallback.append(el("h2","","Emergency show cover"),
   toggle("Allow unfinished-card fallback",
    "Only when your show is missing or incomplete at the deadline. Staff never changes a player-scripted winner.",
    unfinished,v=>{unfinished=v;},!view.canEdit||saving));
  root.append(fallback);
  const support=el("section","ppw-staff-panel");
  support.append(el("h2","","Logistics authority"),
   toggle("Permit scheduling assistance",
    "A separate opt-in for bounded venue/day recovery. It cannot edit wrestlers, matches or finishes.",
    logistics,v=>{logistics=v;},!view.canEdit||saving));
  const choices=el("div","ppw-staff-choices");
  choices.append(el("h3","","Permitted show days"));
  const dayList=el("div","ppw-staff-picks");
  weekdays.forEach((day,i)=>{
   const index=i+1;
   dayList.append(toggle(day,"",days.has(index),checked=>{
    if(checked)days.add(index);else days.delete(index);
   },!view!.canEdit||saving||!logistics));
  });
  choices.append(dayList,el("h3","","Permitted venues"));
  const venueList=el("div","ppw-staff-picks");
  for(const venue of view.venues){
   venueList.append(toggle(venue.name,
    venue.capacity===null?"Available arena":
     venue.capacity.toLocaleString("en-GB")+" capacity"+
      (venue.weeklyHireCost===null?"":" · $"+
       venue.weeklyHireCost.toLocaleString("en-GB")+" hire"),
    venues.has(venue.venueId),checked=>{
     if(checked)venues.add(venue.venueId);else venues.delete(venue.venueId);
    },!view.canEdit||saving||!logistics));
  }
  if(!view.venues.length)venueList.append(el("p","ppw-staff-muted",
   "No eligible venues are configured in this World."));
  choices.append(venueList);support.append(choices);root.append(support);
  const footer=el("section","ppw-staff-panel");
  footer.append(el("h2","","What staff cannot do"),
   el("p","ppw-staff-muted",
    "Staff may not change a booked winner, author your storylines, sign wrestlers, spend contract dates without a resolved show, or gain authority because you were offline."));
  if(view.lockedLogisticsDelegated)footer.append(el("p","ppw-staff-muted",
   "This week's frozen World Lock includes scheduling permission."));
  footer.append(button(saving?"Saving…":"Save Staff permissions",()=>void save(),
   !view.canEdit||saving||loading));
  root.append(footer);
 }
 void refresh();
 return {refresh};
}
