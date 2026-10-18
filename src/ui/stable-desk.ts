/** Mobile faction desk from original PPW, not a tag-team editor.
 * Every membership change is explicit and World-authoritative.
 */
import type {readStableWorkspace} from "../db/stable-workspace.js";
import {createWrestlerCard} from "./wrestler-card.js";
export type StableDeskView=Awaited<ReturnType<typeof readStableWorkspace>>;
type Mutation={requestId:string;expectedRevision:number};
export interface StableDeskPort {
 load():Promise<StableDeskView>;
 create(input:Mutation&{name:string;personIds:string[]}):Promise<unknown>;
 add(input:Mutation&{stableId:string;personId:string}):Promise<unknown>;
 remove(input:Mutation&{stableId:string;personId:string}):Promise<unknown>;
 disband(input:Mutation&{stableId:string}):Promise<unknown>;
 openWrestler?(personId:string):void;
}
const el=(tag:string,cls="",value="")=>{
 const node=document.createElement(tag);node.className=cls;node.textContent=value;return node;
};
const btn=(label:string,onClick:()=>void,disabled=false)=>{
 const node=el("button","ppw-stable-action",label) as HTMLButtonElement;
 node.type="button";node.disabled=disabled;node.onclick=onClick;return node;
};
export function mountStableDesk(root:HTMLElement,port:StableDeskPort,onBack?:()=>void){
 let view:StableDeskView|null=null,working=false,error="",success="";
 let name="",selected=new Set<string>(),newMember=new Map<string,string>();
 let founderSearch="";
 const request=()=>({requestId:crypto.randomUUID(),expectedRevision:view!.worldRevision});
 async function load(){
  working=true;render();
  try{view=await port.load();error="";}
  catch(e){error=e instanceof Error?e.message:"Unable to load factions";}
  finally{working=false;render();}
 }
 async function run(action:()=>Promise<unknown>,message:string){
  if(working)return;
  working=true;error="";success="";render();
  try{
   const result=await action();
   if(result&&typeof result==="object"&&"status" in result&&
    (result as {status:unknown}).status==="STALE")
    throw new Error("The World changed. Reload before modifying factions.");
   view=await port.load();success=message;
   selected=new Set();name="";
  }catch(e){error=e instanceof Error?e.message:"The faction could not be changed";}
  finally{working=false;render();}
 }
 function selector(options:readonly {value:string;label:string}[],
  value:string,change:(v:string)=>void):HTMLElement{
  const control=document.createElement("select");
  control.setAttribute("aria-label","Select wrestler");
  control.disabled=working||!view?.canEdit;
  for(const item of options){
   const o=document.createElement("option");o.value=item.value;
   o.textContent=item.label;control.append(o);
  }
  control.value=value;control.onchange=()=>change(control.value);
  return control;
 }
 function render(){
  root.classList.add("ppw-editor","ppw-stable-desk");
  root.replaceChildren();
  const header=el("header","ppw-stable-header");
  if(onBack)header.append(btn("← Back to booking",onBack));
  header.append(el("span","ppw-eyebrow","THE LOCKER ROOM / FACTIONS"),
   el("h1","","Stables"),
   el("p","ppw-muted",
    "Build your factions and settle who belongs. On-screen breakups and reunions are yours to make official."));
  root.append(header);
  if(error)root.append(el("p","ppw-alert ppw-error",error));
  if(success)root.append(el("p","ppw-alert ppw-success",success));
  if(!view){root.append(btn(working?"Loading…":"Retry",()=>void load(),working));return;}
  if(view.storyFollowThrough.length){
   const follow=el("section","ppw-stable-followthrough");
   follow.append(el("h2","","Storyline follow-through"));
   follow.append(el("p","ppw-muted",
    "These angles already happened on-screen. You choose when to change the roster."));
   for(const task of view.storyFollowThrough){
    const card=el("article","ppw-stable-task");
    const desc=task.action==="ADD"?"Invite into":"Remove from";
    card.append(el("strong","",task.personName+" · "+desc+" "+task.stableName),
     el("p","ppw-muted","Show week "+(task.weekIndex%52+1)+
      " · "+(task.status==="READY"?"Ready for your decision":
      task.status.replaceAll("_"," ").toLowerCase())));
    if(task.status==="READY"&&view.canEdit){
     card.append(btn(task.action==="ADD"?"Add to stable":"Confirm departure",
      ()=>void run(()=>task.action==="ADD"?
       port.add({...request(),stableId:task.stableId,personId:task.personId}):
       port.remove({...request(),stableId:task.stableId,personId:task.personId}),
      "Storyline roster change confirmed"),working));
    }
    follow.append(card);
   }
   root.append(follow);
  }
  const active=view.stables.filter(s=>s.status==="ACTIVE");
  const list=el("section","ppw-stable-list");
  list.append(el("h2","","Your factions · "+active.length));
  for(const stable of active){
   const card=el("article","ppw-stable-card");
   card.append(el("h3","",stable.name),
    el("p","ppw-muted",stable.currentMembers.length+" members · Formed Y"+
      (Math.floor(stable.formedWeekIndex/52)+1)+" W"+(stable.formedWeekIndex%52+1)));
   for(const member of stable.currentMembers){
    const line=el("div","ppw-stable-member");
    if(port.openWrestler){
     const file=btn(member.name+" ↗",()=>port.openWrestler?.(member.personId));
     file.classList.add("ppw-stable-member-profile");
     file.setAttribute("aria-label","Open "+member.name+"'s wrestler dossier");
     line.append(file);
    }else line.append(el("span","",member.name));
    line.append(btn("Remove",()=>void run(()=>port.remove({...request(),
      stableId:stable.stableId,personId:member.personId}),"Wrestler left the faction"),
     working||!view.canEdit));
    card.append(line);
   }
   if(view.canEdit&&stable.currentMembers.length<12){
    const options=view.roster.filter(p=>p.stableId===null);
    const current=newMember.get(stable.stableId)??"";
    const field=el("div","ppw-stable-join");
    field.append(selector([{value:"",label:"Choose a wrestler to invite"},
     ...options.map(p=>({value:p.personId,label:p.name}))],
      current,v=>{newMember.set(stable.stableId,v);}),
     btn("Add member",()=>{
      const personId=newMember.get(stable.stableId);
      if(!personId)return;
      void run(()=>port.add({...request(),stableId:stable.stableId,
       personId}),"Wrestler joined the faction");
     },working||!options.length));
    card.append(field);
   }
   const history=document.createElement("details");
   history.append(el("summary","","Membership history · "+stable.memberHistory.length));
   for(const member of stable.memberHistory){
    const departure=member.leftWeekIndex===null?"Current":
     "Left W"+(member.leftWeekIndex%52+1)+", Y"+
     (Math.floor(member.leftWeekIndex/52)+1);
    history.append(el("p","ppw-muted",member.name+" · "+
     "Joined W"+(member.joinedWeekIndex%52+1)+" · "+departure));
   }
   card.append(history);
   card.append(btn("Disband faction",()=>{
    // Confirmation belongs to the human author; never allow accidental disband.
    if(typeof window!=="undefined"&&!window.confirm(
      "Disband "+stable.name+"? This ends every active membership."))return;
    void run(()=>port.disband({...request(),stableId:stable.stableId}),
     "Faction disbanded");
   },working||!view.canEdit));
   list.append(card);
  }
  if(!active.length)list.append(el("p","ppw-muted","No active factions."));
  root.append(list);
  if(view.canEdit){
   const builder=el("section","ppw-stable-create");
   builder.append(el("h2","","Form a new faction"),
    el("p","ppw-muted","Choose a name and 3–12 available wrestlers."));
   const input=document.createElement("input");input.type="text";
   input.maxLength=60;input.placeholder="Faction name";input.value=name;
   input.setAttribute("aria-label","Faction name");
   input.oninput=()=>{name=input.value;};
   builder.append(input);
   const options=view.roster.filter(x=>x.stableId===null);
   const search=document.createElement("input");
   search.type="search";search.value=founderSearch;
   search.placeholder="Find an available wrestler";
   search.setAttribute("aria-label","Search faction founders");builder.append(search);
   const count=el("p","ppw-stable-selection-count");
   const picker=el("div","ppw-stable-picker");
   const create=btn("Form faction",()=>void run(()=>port.create({
    ...request(),name,personIds:[...selected]}),"New faction created"),true);
   const paint=()=>{
    picker.replaceChildren();
    const phrase=founderSearch.trim().toLowerCase();
    const matching=options.filter(p=>!phrase||p.name.toLowerCase().includes(phrase)||
     p.ringName.toLowerCase().includes(phrase));
    for(const person of matching.slice(0,40)){
     const picked=selected.has(person.personId);
     const card=createWrestlerCard({...person,
      status:picked?"SELECTED":"AVAILABLE"},{context:"BOOKING",compact:true,
      label:picked?"✓ FACTION FOUNDER":"ADD TO FACTION",
      disabled:!picked&&selected.size>=12,
      onSelect:()=>{
       if(picked)selected.delete(person.personId);
       else if(selected.size<12)selected.add(person.personId);
       paint();
      }});
     card.classList.add("ppw-stable-founder-card");
     card.setAttribute("aria-pressed",String(picked));
     const row=el("div","ppw-stable-founder-choice");
     row.append(card);
     if(port.openWrestler){
      const scout=btn("View "+person.name+"'s dossier ↗",
       ()=>port.openWrestler?.(person.personId));
      scout.classList.add("ppw-stable-founder-scout");
      row.append(scout);
     }
     picker.append(row);
    }
    if(!matching.length)picker.append(el("p","ppw-muted","No available wrestlers match your search."));
    else if(matching.length>40)picker.append(el("p","ppw-muted",
     "Showing 40 of "+matching.length+" wrestlers. Narrow your search to find someone else."));
    count.textContent=selected.size+" of 12 chosen · at least 3 members required";
    create.disabled=working||selected.size<3;
   };
   search.oninput=()=>{founderSearch=search.value;paint();};
   paint();builder.append(count,picker,create);
   root.append(builder);
  }
  const ended=view.stables.filter(s=>s.status==="DISBANDED");
  if(ended.length){
   const history=el("section","ppw-stable-archive");
   history.append(el("h2","","Disbanded factions"));
   for(const stable of ended)history.append(el("p","ppw-muted",
    stable.name+" · "+stable.memberHistory.length+" historical memberships"));
   root.append(history);
  }
 }
 void load();
 return {refresh:load};
}
