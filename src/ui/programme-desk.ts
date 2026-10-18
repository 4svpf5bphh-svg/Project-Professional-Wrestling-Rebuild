/** Mobile PPW feud desk. Uses server-validated original programme sides.
 * No World-wide data, auto-submission, or mandatory flow.
 */
import type {readProgrammeWorkspace} from "../db/programme-workspace.js";
import type {ProgrammeRef} from "../domain/programme-lifecycle.js";
import {programmeOverlaps,availableProgrammeOption} from "../domain/programme-selector.js";
export type ProgrammeView=Awaited<ReturnType<typeof readProgrammeWorkspace>>;
export interface ProgrammeDeskPort{
 load():Promise<ProgrammeView>;
 start(input:{requestId:string;expectedRevision:number;
  sideA:ProgrammeRef[];sideB:ProgrammeRef[];championshipId:string|null}):Promise<unknown>;
 end(input:{requestId:string;expectedRevision:number;programmeId:string}):Promise<unknown>;
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
    throw new Error("The World changed. Check the updated rivalries.");
   view=await port.load();success=result;refsA=[null];refsB=[null];titleId=null;
  }catch(e){error=e instanceof Error?e.message:"Programme change failed";}
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
    ["SIDE A WINS",p.sideAWins],["SIDE B WINS",p.sideBWins],
    ["MATCHES",p.matchCount],["ANGLES",p.segmentCount],
    ["DRAWS",p.draws],["BEATS",p.activityCount]
   ] as const){
    const tile=element("span","ppw-programme-record-item");
    tile.append(element("small","",caption),element("strong","",String(n)));
    record.append(tile);
   }
   panel.append(record);
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
      Math.round(activity.crowdResponse)));
     if(port.openResults)item.append(button("Open show results",()=>{
      port.openResults?.(activity.showId);
     },working));
     history.append(item);
    }
    panel.append(history);
   }
   panel.append(button("End programme",()=>{
    void run(()=>port.end({requestId:crypto.randomUUID(),
     expectedRevision:view!.worldRevision,programmeId:p.programmeId}),
     "Rivalry concluded");
   },working||!view.canEdit));
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
  const recent=view.programmes.filter(p=>p.status!=="ACTIVE").slice(0,15);
  if(recent.length){
   const history=element("section","ppw-programme-history");
   history.append(element("h2","","Recently concluded"));
   for(const p of recent)history.append(element("p","",p.sideA.map(x=>x.name).join(" & ")+
    " vs "+p.sideB.map(x=>x.name).join(" & ")));
   root.append(history);
  }
 }
 void reload();
 return {refresh:reload};
}
