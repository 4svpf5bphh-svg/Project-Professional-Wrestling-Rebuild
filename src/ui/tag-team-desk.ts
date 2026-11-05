/** Mobile tag-team roster: searchable performers, portable identity and
 * original PPW's earned familiarity and championship history.
 */
import type {readTagTeamWorkspace} from "../db/tag-team-workspace.js";
import {createWrestlerCard} from "./wrestler-card.js";
export type TagTeamView=Awaited<ReturnType<typeof readTagTeamWorkspace>>;
export interface TagTeamPort {
 load():Promise<TagTeamView>;
 create(input:{requestId:string;expectedRevision:number;name:string;personIds:string[]}):Promise<unknown>;
 rename?(input:{requestId:string;expectedRevision:number;teamId:string;name:string}):Promise<unknown>;
 createTrio?(input:{requestId:string;expectedRevision:number;name:string;personIds:string[]}):Promise<unknown>;
 openWrestler?(personId:string):void;
}
const el=(tag:string,cls="",text="")=>{
 const node=document.createElement(tag);node.className=cls;node.textContent=text;return node;};
const btn=(text:string,fn:()=>void,disabled=false)=>{
 const b=el("button","ppw-pair-button",text) as HTMLButtonElement;
 b.type="button";b.onclick=fn;b.disabled=disabled;return b;};
export function mountTagTeamDesk(root:HTMLElement,port:TagTeamPort,onBack?:()=>void,
 initialWorkspace:"TEAMS"|"TRIOS"="TEAMS",backLabel="← Back to booking"){
 let workspace:"TEAMS"|"TRIOS"=initialWorkspace;
 let view:TagTeamView|null=null,working=false,error="",success="";
 let name="",one="",two="",rosterSearch="",teamSearch="";
 let trioName="",trioMembers=["","",""],trioRequest:string|null=null;
 let trioSearch="",trioDivision:"ALL"|"MEN"|"WOMEN"="ALL";
 let partnerDivision:"ALL"|"MEN"|"WOMEN"="ALL";
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
    throw new Error("Plans have changed. Review the latest team details before trying again.");
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
  await apply(()=>port.rename!(input),"Team renamed.");
 }
 async function formTrio(){
  if(!view||!editable()||!port.createTrio)return;
  const ids=[...trioMembers];
  if(trioName.trim().length<2||new Set(ids).size!==3||ids.some(x=>!x)){
   error="Name your trio and select three different wrestlers.";render();return;
  }
  const selected=ids.map(id=>view!.roster.find(p=>p.personId===id));
  if(selected.some(x=>!x||x.division!==selected[0]?.division)){
   error="All three trio partners must be in the same division.";render();return;
  }
  const input={requestId:trioRequest??(trioRequest=crypto.randomUUID()),
   expectedRevision:view.worldRevision,name:trioName,personIds:ids};
  await apply(()=>port.createTrio!(input),"Your three-person team is official.");
  if(!error){trioName="";trioMembers=["","",""];trioRequest=null;render();}
 }
 function render(){
  root.classList.add("ppw-editor","ppw-tag-desk");root.replaceChildren();
  const head=el("header","ppw-pair-hero");
  if(onBack)head.append(btn(backLabel,onBack,working));
  head.append(el("span","ppw-eyebrow","ROSTER / TEAMS"),
   el("h1","",workspace==="TRIOS"?"Trios":"Tag Teams"),
   el("p","ppw-muted",workspace==="TRIOS"?
    "Form three-person units and keep your trio identities together.":
    "Build partnerships, earn chemistry and chase championship gold."));
  root.append(head);
  if(error)root.append(el("p","ppw-alert ppw-error",error));
  if(success)root.append(el("p","ppw-alert ppw-success",success));
  if(!view){root.append(btn(working?"Loading…":"Retry",()=>void load(),working));return;}
  const workspaceTabs=el("nav","ppw-team-workspace-tabs");
  workspaceTabs.setAttribute("aria-label","Team workspaces");
  for(const [kind,title] of [["TEAMS","Tag Teams"],["TRIOS","Trios"]] as const){
   const tab=btn(title,()=>{workspace=kind;render();});
   tab.setAttribute("aria-pressed",String(workspace===kind));
   workspaceTabs.append(tab);
  }
  root.append(workspaceTabs);
  const overview=el("div","ppw-pair-overview");
  const titles=view.teams.reduce((total,t)=>total+t.currentTitles.length,0);
  const stats=workspace==="TRIOS"?
   [["NAMED TRIOS",(view.trios??[]).length],["ROSTER TALENT",view.roster.length]] as const:
   [["ROSTER TEAMS",view.teams.length],["TAG BELTS",titles]] as const;
  for(const [word,n] of stats){
   const tile=el("div","ppw-pair-stat");
   tile.append(el("span","",word),el("strong","",String(n)));overview.append(tile);
  }
  root.append(overview);
  if(workspace==="TEAMS"){
  const create=el("section","ppw-pair-create");
  create.append(el("h2","","Form a team"),
   el("p","ppw-muted","Pick two wrestlers. The team name carries between promotions."));
  const nameInput=document.createElement("input");
  nameInput.type="text";nameInput.maxLength=70;
  nameInput.value=name;nameInput.placeholder="Name this team";
  nameInput.setAttribute("aria-label","New tag team name");nameInput.disabled=!editable();
  nameInput.oninput=()=>{name=nameInput.value;resetCreate();submit.disabled=!canForm();};
  create.append(nameInput);
  const selected=el("div","ppw-pair-selected");
  selected.append(el("span","",one?"1. "+pickName(one):"1. First partner"),
   el("span","",two?"2. "+pickName(two):"2. Second partner"));
  create.append(selected);
  const canForm=()=>editable()&&name.trim().length>0&&!!one&&!!two&&one!==two&&
   view!.roster.find(x=>x.personId===one)?.division===
   view!.roster.find(x=>x.personId===two)?.division;
  const submit=btn(working?"Forming…":"✓ Form this team",()=>void form(),!canForm());
  submit.classList.add("ppw-pair-submit");
  create.append(submit,el("p","ppw-pair-instruction",
   one&&two?"Partners selected. Name the team to make it official.":"Tap two compatible wrestlers below."));
  const find=document.createElement("input");
  find.type="search";find.value=rosterSearch;
  find.placeholder="Find a wrestler…";
  find.setAttribute("aria-label","Filter wrestler picker");create.append(find);
  const divisionFilters=el("div","ppw-pair-division-filters");
  for(const [value,title] of [["ALL","All"],["MEN","Men"],["WOMEN","Women"]] as const){
   const tab=btn(title,()=>{partnerDivision=value;render();});
   tab.setAttribute("aria-pressed",String(partnerDivision===value));
   divisionFilters.append(tab);
  }
  create.append(divisionFilters);
  const choices=el("div","ppw-pair-picks");create.append(choices);
  const paintChoices=()=>{
   choices.replaceChildren();
   const all=view!.roster.filter(p=>
    p.name.toLowerCase().includes(rosterSearch.trim().toLowerCase())&&
    (partnerDivision==="ALL"||p.division===partnerDivision));
   const first=one?view!.roster.find(p=>p.personId===one):null;
   for(const person of all.slice(0,35)){
    const active=person.personId===one||person.personId===two;
    const incompatible=!!first&&person.division!==first.division&&!active;
    const card=createWrestlerCard({
     ...person,status:active?"SELECTED":incompatible?"DIFFERENT DIVISION":"SELECT PARTNER",
     available:!incompatible
    },{context:"BOOKING",compact:true,
     label:active?"✓ SELECTED":incompatible?"DIFFERENT DIVISION":"SELECT PARTNER",
     disabled:!editable()||incompatible,onSelect:()=>{
      if(person.personId===one)one="";
      else if(person.personId===two)two="";
      else if(!one)one=person.personId;
      else two=person.personId;
      resetCreate();render();
     }});
    card.classList.add("ppw-pair-wrestler");
    card.setAttribute("aria-pressed",String(active));
    const row=el("div","ppw-pair-choice");
    row.append(card);
    if(port.openWrestler){
     const inspect=btn("View "+person.name+"'s dossier ↗",
      ()=>port.openWrestler?.(person.personId));
     inspect.classList.add("ppw-pair-scout");
     row.append(inspect);
    }
    choices.append(row);
   }
   if(!all.length)choices.append(el("p","ppw-muted","No wrestlers match your search and division."));
   else if(all.length>35)choices.append(el("p","ppw-pair-limit-note",
    "Showing 35 of "+all.length+" wrestlers. Narrow your search to find a partner."));
  };
  find.oninput=()=>{rosterSearch=find.value;paintChoices();};
  paintChoices();
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
      (("historicalPartnership" in team && team.historicalPartnership)?
       " · Pre-World partners · ":" · ")+
      team.matchesTogether+" World matches"));
    if(team.currentTitles.length)
     heading.append(el("span","ppw-pair-belt",
      team.currentTitles.map(t=>t.name).join(" · ")));
    article.append(heading);
    const body=el("div","ppw-pair-details");
    if(port.openWrestler){
     const partnerLinks=el("div","ppw-pair-partner-links");
     for(const member of team.members){
      const file=btn(member.name+" · Dossier ↗",()=>port.openWrestler?.(member.personId));
      file.classList.add("ppw-pair-partner-file");partnerLinks.append(file);
     }
     body.append(partnerLinks);
    }
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
  if(workspace==="TRIOS"){
  const trioSection=el("section","ppw-pair-create ppw-trio-workspace");
  trioSection.append(el("span","ppw-eyebrow","THREE AS ONE"),
   el("h2","","Named Trios"),
   el("p","ppw-muted","A trio is a permanent three-person unit, separate from two-person tag teams and larger factions. Book all three together in a 3v3 match."));
  const three=view.trios??[];
  if(port.createTrio){
   const input=document.createElement("input");
   input.type="text";input.maxLength=70;input.value=trioName;
   input.placeholder="Name your trio";
   input.setAttribute("aria-label","New trio name");
   input.disabled=!editable();
   input.oninput=()=>{trioName=input.value;trioRequest=null;};
   trioSection.append(input);
   // The team and booking flows already use genuine talent portrait cards.
   // Select trio members the same way, not through three cramped iPhone selects.
   const selected=el("div","ppw-trio-selected");
   selected.setAttribute("role","group");
   selected.setAttribute("aria-label","Chosen trio members");
   for(let index=0;index<3;index++){
    const personId=trioMembers[index];
    const name=personId?pickName(personId):"Member "+(index+1);
    const choice=btn((index+1)+". "+name+(personId?" ×":""),
     ()=>{trioMembers[index]="";trioRequest=null;render();},!editable()||!personId);
    choice.setAttribute("aria-label",personId?"Remove "+name+" from trio":"Empty trio member "+(index+1));
    selected.append(choice);
   }
   trioSection.append(selected);
   const formButton=btn("✓ Form this trio",()=>void formTrio(),!editable()||
    trioName.trim().length<2||trioMembers.some(x=>!x)||
    new Set(trioMembers).size!==3);
   formButton.classList.add("ppw-pair-submit");
   trioSection.append(formButton);
   const hint=el("p","ppw-pair-instruction",
    "Tap three wrestlers from the same division. Tap a selected card to remove them.");
   trioSection.append(hint);
   const find=document.createElement("input");
   find.type="search";find.value=trioSearch;find.placeholder="Search trio wrestlers";
   find.setAttribute("aria-label","Search trio wrestlers");
   trioSection.append(find);
   const divisionFilters=el("div","ppw-pair-division-filters");
   for(const [value,title] of [["ALL","All"],["MEN","Men"],["WOMEN","Women"]] as const){
    const tab=btn(title,()=>{trioDivision=value;render();});
    tab.setAttribute("aria-pressed",String(trioDivision===value));
    divisionFilters.append(tab);
   }
   trioSection.append(divisionFilters);
   const picks=el("div","ppw-pair-picks ppw-trio-picks");
   picks.setAttribute("aria-label","Choose trio members");
   trioSection.append(picks);
   const paintChoices=()=>{
    picks.replaceChildren();
    const division=trioMembers.map(id=>view!.roster.find(p=>p.personId===id)?.division)
     .find(Boolean);
    const all=view!.roster.filter(p=>
     (trioDivision==="ALL"||p.division===trioDivision)&&
     p.name.toLowerCase().includes(trioSearch.trim().toLowerCase()));
    for(const person of all.slice(0,35)){
     const active=trioMembers.includes(person.personId);
     const incompatible=Boolean(division&&person.division!==division&&!active);
     const full=trioMembers.every(Boolean)&&!active;
     const status=active?"✓ SELECTED":incompatible?"DIFFERENT DIVISION":
      full?"THREE SELECTED":"ADD TO TRIO";
     const card=createWrestlerCard({...person,status,available:!incompatible&&!full},
      {context:"BOOKING",compact:true,label:status,
       disabled:!editable()||incompatible||full,
       onSelect:()=>{
        if(active){
         trioMembers[trioMembers.indexOf(person.personId)]="";
        }else{
         const index=trioMembers.indexOf("");
         if(index<0)return;
         trioMembers[index]=person.personId;
        }
        trioRequest=null;render();
       }});
     card.setAttribute("aria-pressed",String(active));
     picks.append(card);
    }
    if(!all.length)picks.append(el("p","ppw-muted","No wrestlers match this search."));
    else if(all.length>35)picks.append(el("p","ppw-pair-limit-note",
     "Showing 35 of "+all.length+" wrestlers. Search to find another member."));
   };
   find.oninput=()=>{trioSearch=find.value;paintChoices();};
   paintChoices();
  }
  const listOfTrios=el("div","ppw-trio-list");
  for(const t of three){
   const card=el("article","ppw-pair-card ppw-trio-card");
   card.append(el("strong","",t.name),
    el("span","ppw-pair-members",t.members.map(m=>m.name).join(" · ")));
   if(port.openWrestler){
    const links=el("div","ppw-pair-partner-links");
    for(const member of t.members)links.append(btn(member.name+" · Dossier ↗",
     ()=>port.openWrestler?.(member.personId)));
    card.append(links);
   }
   listOfTrios.append(card);
  }
  if(!three.length)listOfTrios.append(el("p","ppw-muted",
   "No named three-person units yet. Create one without altering existing tag partnerships."));
  trioSection.append(listOfTrios);root.append(trioSection);
  }
 }
 async function load(){
  working=true;render();
  try{view=await port.load();error="";}
  catch(e){error=e instanceof Error?e.message:"Unable to load tag teams";}
  finally{working=false;render();}
 }
 void load();
}
