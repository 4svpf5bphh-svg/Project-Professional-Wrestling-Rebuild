/** Mobile faction desk from original PPW, not a tag-team editor.
 * Every membership change is explicit and World-authoritative.
 */
import type {readStableWorkspace} from "../db/stable-workspace.js";
export type StableDeskView=Awaited<ReturnType<typeof readStableWorkspace>>;
type Mutation={requestId:string;expectedRevision:number};
export interface StableDeskPort {
 load():Promise<StableDeskView>;
 create(input:Mutation&{name:string;personIds:string[]}):Promise<unknown>;
 add(input:Mutation&{stableId:string;personId:string}):Promise<unknown>;
 remove(input:Mutation&{stableId:string;personId:string}):Promise<unknown>;
 disband(input:Mutation&{stableId:string}):Promise<unknown>;
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
  header.append(el("span","ppw-eyebrow","PPW • LOCKER ROOM"),
   el("h1","","Stables"),
   el("p","ppw-muted",
    "Build and manage factions. A scripted exit or reconciliation never silently changes this roster."));
  root.append(header);
  if(error)root.append(el("p","ppw-alert ppw-error",error));
  if(success)root.append(el("p","ppw-alert ppw-success",success));
  if(!view){root.append(btn(working?"Loading…":"Retry",()=>void load(),working));return;}
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
    line.append(el("span","",member.name),
     btn("Remove",()=>void run(()=>port.remove({...request(),
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
   const picker=el("div","ppw-stable-picker");
   for(const person of options){
    const row=el("label","ppw-stable-pick");
    const box=document.createElement("input");
    box.type="checkbox";box.checked=selected.has(person.personId);
    box.onchange=()=>{
     if(box.checked&&selected.size>=12){box.checked=false;return;}
     if(box.checked)selected.add(person.personId);else selected.delete(person.personId);
    };
    row.append(box,el("span","",person.name));picker.append(row);
   }
   builder.append(picker);
   builder.append(btn("Create stable",()=>{
    void run(()=>port.create({...request(),name,personIds:[...selected]}),
     "New faction created");
   },working||options.length<3));
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
