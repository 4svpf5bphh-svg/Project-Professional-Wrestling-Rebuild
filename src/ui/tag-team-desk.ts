/** Mobile tag-team roster: searchable performers, portable identity and
 * original PPW's earned familiarity and championship history.
 */
import type {readTagTeamWorkspace} from "../db/tag-team-workspace.js";
export type TagTeamView=Awaited<ReturnType<typeof readTagTeamWorkspace>>;
export interface TagTeamPort {
 load():Promise<TagTeamView>;
 create(input:{requestId:string;expectedRevision:number;name:string;personIds:string[]}):Promise<unknown>;
 rename?(input:{requestId:string;expectedRevision:number;teamId:string;name:string}):Promise<unknown>;
}
const el=(tag:string,cls="",text="")=>{
 const node=document.createElement(tag);node.className=cls;node.textContent=text;return node;};
const btn=(text:string,fn:()=>void,disabled=false)=>{
 const b=el("button","ppw-pair-button",text) as HTMLButtonElement;
 b.type="button";b.onclick=fn;b.disabled=disabled;return b;};
export function mountTagTeamDesk(root:HTMLElement,port:TagTeamPort,onBack?:()=>void){
 let view:TagTeamView|null=null,working=false,error="",success="";
 let name="",one="",two="",rosterSearch="",teamSearch="";
 let renaming="",renameValue="",createRequest:string|null=null,renameRequest:string|null=null;
 const label=(s:string)=>s.replaceAll("_"," ").toLowerCase()
  .replace(/(^|\s)\S/g,x=>x.toUpperCase());
 const editable=()=>view?.canEdit===true&&!working;
 const pickName=(personId:string)=>view?.roster.find(p=>p.personId===personId)?.name??personId;
 const resetCreate=()=>{createRequest=null;error="";success="";};
 async function apply(action:()=>Promise<unknown>,message:string){
  if(working)return;
  working=true;error="";success="";render();
  try{
   const result=await action();
   if(result&&typeof result==="object"&&"status" in result&&
    (result as {status:unknown}).status==="STALE")
    throw new Error("The World changed. Refresh before changing your team.");
   view=await port.load();success=message;
   name="";one="";two="";renaming="";renameValue="";
   createRequest=null;renameRequest=null;
  }catch(e){error=e instanceof Error?e.message:"Tag team update failed";}
  finally{working=false;render();}
 }
 async function form(){
  if(!view||!editable())return;
  if(!name.trim()||!one||!two||one===two){
   error="Choose two different wrestlers and name the team.";render();return;
  }
  const a=view.roster.find(x=>x.personId===one);
  const b=view.roster.find(x=>x.personId===two);
  if(!a||!b||a.division!==b.division){
   error="Tag partners must be from the same division.";render();return;
  }
  const input={requestId:createRequest??(createRequest=crypto.randomUUID()),
   expectedRevision:view.worldRevision,name,personIds:[one,two]};
  await apply(()=>port.create(input),"The team is official. Chemistry grows through completed matches.");
 }
 async function rename(teamId:string){
  if(!view||!editable()||!port.rename)return;
  const input={requestId:renameRequest??(renameRequest=crypto.randomUUID()),
   expectedRevision:view.worldRevision,teamId,name:renameValue};
  await apply(()=>port.rename!(input),"The shared World team name has changed.");
 }
 function render(){
  root.classList.add("ppw-editor","ppw-tag-desk");root.replaceChildren();
  const head=el("header","ppw-pair-hero");
  if(onBack)head.append(btn("← Back to booking",onBack,working));
  head.append(el("span","ppw-eyebrow","ROSTER / TAG DIVISION"),
   el("h1","","Tag Teams"),
   el("p","ppw-muted","Portable tag identities, real match-earned chemistry and championship history."));
  root.append(head);
  if(error)root.append(el("p","ppw-alert ppw-error",error));
  if(success)root.append(el("p","ppw-alert ppw-success",success));
  if(!view){root.append(btn(working?"Loading…":"Retry",()=>void load(),working));return;}
  const overview=el("div","ppw-pair-overview");
  const titles=view.teams.reduce((total,t)=>total+t.currentTitles.length,0);
  for(const [word,n] of [["ROSTER TEAMS",view.teams.length],["TAG BELTS",titles]] as const){
   const tile=el("div","ppw-pair-stat");
   tile.append(el("span","",word),el("strong","",String(n)));overview.append(tile);
  }
  root.append(overview);
  const create=el("section","ppw-pair-create");
  create.append(el("h2","","Form a team"),
   el("p","ppw-muted","Pick two wrestlers. The team name carries between promotions."));
  const nameInput=document.createElement("input");
  nameInput.type="text";nameInput.maxLength=70;
  nameInput.value=name;nameInput.placeholder="Name this team";
  nameInput.setAttribute("aria-label","New tag team name");nameInput.disabled=!editable();
  nameInput.oninput=()=>{name=nameInput.value;resetCreate();};
  create.append(nameInput);
  const selected=el("div","ppw-pair-selected");
  selected.append(el("span","",one?"1. "+pickName(one):"1. First partner"),
   el("span","",two?"2. "+pickName(two):"2. Second partner"));
  create.append(selected);
  const find=document.createElement("input");
  find.type="search";find.value=rosterSearch;
  find.placeholder="Find a wrestler…";
  find.setAttribute("aria-label","Filter wrestler picker");create.append(find);
  const choices=el("div","ppw-pair-picks");create.append(choices);
  const paintChoices=()=>{
   choices.replaceChildren();
   const list=view!.roster.filter(p=>p.name.toLowerCase().includes(
    rosterSearch.trim().toLowerCase()));
   for(const person of list){
    const active=person.personId===one||person.personId===two;
    const chip=btn((active?"✓ ":"")+person.name+" · "+label(person.division),()=>{
     if(person.personId===one)one="";
     else if(person.personId===two)two="";
     else if(!one)one=person.personId;
     else two=person.personId;
     resetCreate();render();
    },!editable());
    chip.classList.add("ppw-pair-pick");
    chip.setAttribute("aria-pressed",String(active));
    choices.append(chip);
   }
   if(!list.length)choices.append(el("p","ppw-muted","No wrestlers match that search."));
  };
  find.oninput=()=>{rosterSearch=find.value;paintChoices();};
  paintChoices();
  create.append(btn(working?"Forming…":"Form team",()=>void form(),!editable()));
  if(!view.canEdit)create.append(el("p","ppw-muted","The weekly deadline has passed. Team changes reopen next week."));
  root.append(create);
  const section=el("section","ppw-pair-list");
  section.append(el("h2","","Your tag division"));
  const search=document.createElement("input");
  search.type="search";search.value=teamSearch;
  search.placeholder="Search teams and partners";
  search.setAttribute("aria-label","Search your tag teams");
  section.append(search);
  const list=el("div","");section.append(list);
  const paintTeams=()=>{
   list.replaceChildren();
   const rows=view!.teams.filter(t=>!teamSearch||
    [t.name,...t.members.map(p=>p.name)].some(x=>
     x.toLowerCase().includes(teamSearch.trim().toLowerCase())));
   for(const team of rows){
    const article=document.createElement("details");
    article.className="ppw-pair-card";
    article.open=renaming===team.teamId;
    const heading=document.createElement("summary");
    heading.append(el("strong","",team.name),
     el("span","ppw-pair-members",team.members.map(p=>p.name).join(" & ")),
     el("span","ppw-pair-meta",label(team.experience)+
      " · "+team.matchesTogether+" matches together"));
    if(team.currentTitles.length)
     heading.append(el("span","ppw-pair-belt",
      team.currentTitles.map(t=>t.name).join(" · ")));
    article.append(heading);
    const body=el("div","ppw-pair-details");
    body.append(el("p","ppw-muted","Familiarity "+Math.round(team.familiarity)+
     " · "+team.totalTitleReigns+" title reigns · "+
     team.totalTitleDefenses+" defenses"));
    if(team.formedWeekIndex!==null)
     body.append(el("p","ppw-muted","Formed Year "+
      (Math.floor(team.formedWeekIndex/52)+1)+", Week "+(team.formedWeekIndex%52+1)));
    for(const belt of team.currentTitles)body.append(el("p","ppw-pair-belt",
     belt.name+" · "+belt.promotionName+" · "+belt.defenses+" defenses"));
    if(port.rename&&team.canRename&&view!.canEdit){
     if(renaming===team.teamId){
      const edit=document.createElement("input");edit.type="text";edit.maxLength=70;
      edit.value=renameValue;edit.setAttribute("aria-label","Rename "+team.name);
      edit.oninput=()=>{renameValue=edit.value;renameRequest=null;};
      body.append(edit,btn(working?"Saving…":"Save name",()=>void rename(team.teamId),working),
       btn("Cancel",()=>{renaming="";render();},working));
     }else body.append(btn("Rename team",()=>{
      renaming=team.teamId;renameValue=team.name;renameRequest=null;render();
     },working));
    }
    article.append(body);list.append(article);
   }
   if(!rows.length)list.append(el("p","ppw-muted",
    view!.teams.length?"No team matches.":"No formed tag team has both partners on your active roster."));
  };
  search.oninput=()=>{teamSearch=search.value;paintTeams();};
  paintTeams();root.append(section);
 }
 async function load(){
  working=true;render();
  try{view=await port.load();error="";}
  catch(e){error=e instanceof Error?e.message:"Unable to load tag teams";}
  finally{working=false;render();}
 }
 void load();
}
