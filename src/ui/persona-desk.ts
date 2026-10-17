/** The wrestler owns their character. Edits are proposals, not overrides.
 * Compact phone-like conversation shows the actual wrestler's response.
 */
import type {readPortablePersonaWorkspace}
 from "../db/portable-persona-workspace.js";
type View=Awaited<ReturnType<typeof readPortablePersonaWorkspace>>;
export interface PersonaDeskPort{
 load(personId?:string):Promise<View>;
 request(input:{personId:string;gimmickId:string;
  requestId:string;expectedRevision:number}):Promise<unknown>;
}
const el=(tag:string,cls="",label="")=>{
 const n=document.createElement(tag);n.className=cls;n.textContent=label;return n;
};
const button=(title:string,action:()=>void,disabled=false)=>{
 const x=el("button","ppw-persona-button",title) as HTMLButtonElement;
 x.type="button";x.onclick=action;x.disabled=disabled;return x;
};
export function mountPersonaDesk(root:HTMLElement,
 port:PersonaDeskPort,onBack?:()=>void){
 let view:View|null=null,loading=false,error="",chosen:string|null=null,
 search="",answer:string|null=null,personId:string|undefined;
 async function load(id?:string){
  personId=id;loading=true;render();
  try{view=await port.load(id);chosen=null;search="";error="";}
  catch(e){error=e instanceof Error?e.message:"Unable to load wrestler identity";}
  finally{loading=false;render();}
 }
 async function request(){
  if(loading||!view?.personId||!chosen||view.worldRevision===null)return;
  const name=view.personId,gimmick=chosen;loading=true;error="";answer=null;render();
  try{
   const outcome=await port.request({personId:name,gimmickId:gimmick,
    requestId:crypto.randomUUID(),expectedRevision:view.worldRevision});
   if(!outcome||typeof outcome!=="object"||!("result" in outcome))
    throw new Error("Wrestler did not respond");
   const result=(outcome as {result:{accepted:boolean;reason:string}}).result;
   view=await port.load(name);chosen=null;answer=null;
  }catch(e){error=e instanceof Error?e.message:"Proposal could not be reviewed";}
  finally{loading=false;render();}
 }
 function render(){
  root.classList.add("ppw-editor","ppw-persona-desk");root.replaceChildren();
  const head=el("header","ppw-persona-header");
  if(onBack)head.append(button("← Back to card",onBack));
  head.append(el("span","ppw-eyebrow","PPW · WRESTLER DIRECTORY"),
   el("h1","","Character & identity"),
   el("p","ppw-muted",
    "One wrestler. One portable identity. Their gimmick follows them across every promotion."));
  root.append(head);
  if(error)root.append(el("p","ppw-alert ppw-error",error));
  if(!view){root.append(button(loading?"Loading…":"Retry",()=>void load(personId),loading));return;}
  if(!view.personId||!view.persona){
   root.append(el("p","ppw-muted","There are no current roster identities to inspect."));return;
  }
  const choice=el("label","ppw-field");
  choice.append(el("span","","Select a roster wrestler"));
  const select=document.createElement("select");
  select.disabled=loading;select.setAttribute("aria-label","Select wrestler profile");
  for(const p of view.roster){
   const o=document.createElement("option");o.value=p.personId;o.textContent=p.name;
   select.append(o);
  }
  select.value=view.personId;select.onchange=()=>void load(select.value);
  choice.append(select);root.append(choice);
  const persona=view.persona;
  const live=el("section","ppw-persona-active");
  live.append(el("span","ppw-eyebrow","CURRENT WRESTLER-OWNED CHARACTER"),
   el("h2","",persona.personaName),
   el("strong","ppw-persona-gimmick",persona.gimmickId.replaceAll("_"," ")),
   el("p","ppw-muted",persona.primaryStyle?
    "Style · "+persona.primaryStyle.replaceAll("_"," ")+
     (persona.secondaryStyle?" / "+persona.secondaryStyle.replaceAll("_"," "):""):
    "Wrestling style not documented yet"));
  for(const [title,moves] of [["Signature moves",persona.signatureMoves],
   ["Finishers",persona.finishingMoves]] as const){
   const section=el("div","ppw-persona-moves");
   section.append(el("h3","",title));
   if(!moves.length)section.append(el("p","ppw-muted","Not documented"));
   else for(const move of moves){
    const row=el("p","",move.name+" · "+move.category.toLowerCase());
    if(move.source==="PPW_AUTHORED")row.append(
     el("small","ppw-muted"," · PPW editorial approximation"));
    section.append(row);
   }
   live.append(section);
  }
  root.append(live);
  if(view.documentedAlternates.length){
   const alt=el("section","ppw-persona-alternates");
   alt.append(el("h2","","Documented real-world personas"),
    el("p","ppw-muted","Historical references only — not PPW career eras."));
   for(const p of view.documentedAlternates)
    alt.append(el("p","",p.personaName+" · "+p.gimmickId.replaceAll("_"," ")));
   root.append(alt);
  }
  if(view.history.length){
   const history=el("section","ppw-persona-history");
   history.append(el("h2","","PPW identity history"));
   for(const row of view.history){
    const a=row.persona;
    history.append(el("p","",a.personaName+" · "+
     a.gimmickId.replaceAll("_"," ")+" · "+ "Y"+
     (Math.floor(row.startedWeekIndex/52)+1)+" W"+(row.startedWeekIndex%52+1)+
     " – Y"+(Math.floor(row.endedWeekIndex/52)+1)+
     " W"+(row.endedWeekIndex%52+1)));
   }
   root.append(history);
  }
  const chat=el("section","ppw-persona-chat");
  chat.append(el("h2","","Character conversation"),
   el("p","ppw-muted",
    "You may suggest a new gimmick. The wrestler can say no. An accepted proposal changes their World-wide character, but never their moves or match results."));
  for(const p of [...view.recentRequests].reverse()){
   const out=el("div","ppw-persona-bubble ppw-persona-out",
    "How about a "+p.requested_gimmick_id.replaceAll("_"," ")+
    " character?");
   const response=el("div","ppw-persona-bubble ppw-persona-in",
    p.status==="ACCEPTED"?"Yes — I'll make it mine.":
    p.reason==="ICONIC_PERSONA_PROTECTED"?
     "This character is my legacy. I'm not walking away from it.":
    p.reason==="CREATIVE_APPROVAL_WITHHELD"?
     "My creative approval matters. I won't agree to that change.":
     "I'd rather keep the character that I've built.");
   chat.append(out,response);
  }
  if(answer)chat.append(el("div","ppw-persona-bubble ppw-persona-in",answer));
  const now=(view.worldYear-1)*52+view.worldWeek-1;
  const cooldown=view.nextPitchWeek>now;
  if(cooldown)chat.append(el("p","ppw-muted",
   "Reconsideration available in "+(view.nextPitchWeek-now)+" PPW weeks."));
  if(view.canEdit&&!cooldown){
   chat.append(el("h3","","Suggest a character change"));
   const filter=document.createElement("input");
   filter.type="search";filter.placeholder="Search gimmicks or families";
   filter.value=search;filter.setAttribute("aria-label","Search gimmick archetypes");
   const options=el("div","ppw-persona-options");
   const availableArchetypes=view.archetypes;
   const refreshOptions=()=>{
    options.replaceChildren();
    const matches=availableArchetypes.filter(x=>x.id!==persona.gimmickId&&(
     !search||[x.label,x.familyLabel,x.description].some(y=>
      y.toLowerCase().includes(search.trim().toLowerCase())))).slice(0,24);
    for(const p of matches){
     const item=button(p.label+" · "+p.familyLabel,()=>{
      chosen=p.id;render();},loading);
     if(chosen===p.id)item.classList.add("ppw-persona-selected");
     item.title=p.description;options.append(item);
    }
    if(!matches.length)options.append(el("p","ppw-muted","No matching gimmicks."));
   };
   // Keep the actual input node mounted while searching. Replacing the page
   // on every keystroke dismisses the keyboard in iPhone standalone PWAs.
   filter.oninput=()=>{search=filter.value;refreshOptions();};
   chat.append(filter);
   refreshOptions();chat.append(options);
   if(chosen)chat.append(el("p","ppw-muted",
    "Selected · "+view.archetypes.find(x=>x.id===chosen)?.label));
   chat.append(button(loading?"Asking wrestler…":"Suggest gimmick",()=>{
    void request();},loading||!chosen));
  }
  root.append(chat);
 }
 void load();
 return {refresh:()=>load(personId)};
}
