/** Phone-sized tag pairing desk, World-portable roster identities. */
import type {readTagTeamWorkspace} from "../db/tag-team-workspace.js";
export type TagTeamView=Awaited<ReturnType<typeof readTagTeamWorkspace>>;
export interface TagTeamPort{
 load():Promise<TagTeamView>;
 create(input:{requestId:string;expectedRevision:number;name:string;personIds:string[]}):Promise<unknown>;
 rename?(input:{requestId:string;expectedRevision:number;teamId:string;name:string}):Promise<unknown>;
}
const el=(tag:string,cls="",text="")=>{
 const node=document.createElement(tag);node.className=cls;node.textContent=text;return node;};
const btn=(text:string,fn:()=>void)=>{
 const b=el("button","ppw-pair-button",text) as HTMLButtonElement;
 b.type="button";b.onclick=fn;return b;};
export function mountTagTeamDesk(root:HTMLElement,port:TagTeamPort,onBack?:()=>void){
 let view:TagTeamView|null=null,working=false,error="",success="";
 let name="",one="",two="",renaming="",renameValue="";
 function render(){
  root.classList.add("ppw-editor","ppw-tag-desk");root.replaceChildren();
  const head=el("header","ppw-pair-hero");
  if(onBack)head.append(btn("← Back to card",onBack));
  head.append(el("span","ppw-eyebrow","PPW / THE TAG DIVISION"),
   el("h1","","Tag Teams"),
   el("p","ppw-muted",
    "Two wrestlers, one World identity. Partnerships travel with talent to other promotions."));
  root.append(head);
  if(error)root.append(el("p","ppw-alert ppw-error",error));
  if(success)root.append(el("p","ppw-alert ppw-success",success));
  if(!view){root.append(btn(working?"Loading…":"Retry",()=>void load()));return;}
  const panel=el("section","ppw-pair-create");
  panel.append(el("h2","","Form a tag team"));
  const text=document.createElement("input");text.type="text";
  text.placeholder="Team name";text.maxLength=70;text.value=name;
  text.setAttribute("aria-label","Team name");
  text.oninput=()=>{name=text.value;};panel.append(text);
  function partner(which:"a"|"b"){
   const select=document.createElement("select");
   select.setAttribute("aria-label",which==="a"?"First wrestler":"Second wrestler");
   for(const option of [{personId:"",name:which==="a"?"Choose first wrestler":"Choose second wrestler"},
    ...view!.roster]){
    const o=document.createElement("option");o.value=option.personId;o.textContent=option.name;
    select.append(o);
   }
   select.value=which==="a"?one:two;
   select.onchange=()=>{if(which==="a")one=select.value;else two=select.value;};
   return select;
  }
  panel.append(partner("a"),partner("b"));
  const create=btn(working?"Forming team…":"Form team",()=>void createTeam());
  create.disabled=working||!view.canEdit||view.roster.length<2;
  panel.append(create);
  if(!view.canEdit)panel.append(el("p","ppw-muted","World Lock is closed."));
  root.append(panel);
  const section=el("section","ppw-pair-list");
  section.append(el("h2","","Your tag division"));
  if(!view.teams.length)section.append(el("p","ppw-muted",
   "No formed teams on your current roster. Create a partnership above."));
  for(const team of view.teams){
   const row=el("article","ppw-pair-card");
   row.append(el("strong","",team.name),
    el("p","ppw-muted",team.members.map(p=>p.name).join(" & ")));
   row.append(el("p","ppw-pair-stats",
    team.experience+" · "+team.matchesTogether+" matches together"+
    " · "+team.totalTitleReigns+" title reigns"));
   for(const title of team.currentTitles)
    row.append(el("p","ppw-pair-title",
     "🏆 "+title.name+" · "+title.promotionName+" · "+
     title.defenses+" defenses"));
   if(port.rename&&team.canRename&&view.canEdit){
    if(renaming===team.teamId){
     const edit=document.createElement("input");
     edit.type="text";edit.maxLength=70;edit.value=renameValue;
     edit.setAttribute("aria-label","New team name");
     edit.oninput=()=>{renameValue=edit.value;};
     row.append(edit,btn("Save name",()=>void renameTeam(team.teamId)),
      btn("Cancel",()=>{renaming="";render();}));
    }else row.append(btn("Rename",()=>{
     renaming=team.teamId;renameValue=team.name;render();
    }));
   }
   section.append(row);
  }
  root.append(section);
 }
 async function load(){
  working=true;render();
  try{view=await port.load();error="";}
  catch(e){error=e instanceof Error?e.message:"Unable to load tag division";}
  finally{working=false;render();}
 }
 async function renameTeam(teamId:string){
  if(!view||!port.rename||working)return;
  working=true;error="";success="";render();
  try{
   const result=await port.rename({requestId:crypto.randomUUID(),
    expectedRevision:view.worldRevision,teamId,name:renameValue});
   if(result&&typeof result==="object"&&"status" in result&&
    (result as {status:unknown}).status==="STALE")
    throw new Error("The World changed. Reload before renaming.");
   view=await port.load();renaming="";renameValue="";success="Team name saved.";
  }catch(e){error=e instanceof Error?e.message:"Team name was not saved";}
  finally{working=false;render();}
 }
 async function createTeam(){
  if(!view||working)return;
  const pair=[one,two];
  if(!name.trim()||pair.some(x=>!x)||one===two){
   error="Choose two different wrestlers and give the team a name.";render();return;
  }
  working=true;error="";success="";render();
  try{
   const result=await port.create({requestId:crypto.randomUUID(),
    expectedRevision:view.worldRevision,name,personIds:pair});
   if(result&&typeof result==="object"&&"status" in result&&
    (result as {status:unknown}).status==="STALE")
    throw new Error("The World changed. Reload before forming the team.");
   view=await port.load();name="";one="";two="";success="Tag team formed.";
  }catch(e){error=e instanceof Error?e.message:"Unable to form the tag team";}
  finally{working=false;render();}
 }
 void load();
}
