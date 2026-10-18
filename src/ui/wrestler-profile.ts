/** Shared expanded profile for roster, market and booking inspection.
 * Loaded explicitly on open; quick cards use their existing bounded pages.
 */
import {createWrestlerCard,wrestlerLabel} from "./wrestler-card.js";
import type {readWrestlerProfile} from "../db/wrestler-profile.js";
import type {editWrestlerRepertoire} from "../db/wrestler-profile.js";
import {WRESTLING_STYLES} from "../domain/portable-persona.js";
type View=Awaited<ReturnType<typeof readWrestlerProfile>>;
type Save=Awaited<ReturnType<typeof editWrestlerRepertoire>>;
export interface WrestlerProfilePort{
 load(personId:string):Promise<View>;
 save(input:{personId:string;requestId:string;expectedRevision:number;
  primaryStyle:string|null;secondaryStyle:string|null;
  signatureMoves:string[];finishingMoves:string[]}):Promise<Save>;
 openBackstage?(personId:string):void;
 openContracts?():void;
}
const el=(tag:string,cls="",text="")=>{
 const e=document.createElement(tag);e.className=cls;e.textContent=text;return e;
};
const button=(label:string,cb:()=>void,disabled=false)=>{
 const b=el("button","ppw-profile-action",label) as HTMLButtonElement;
 b.type="button";b.disabled=disabled;b.onclick=cb;return b;
};
const fmt=(n:number|null|undefined)=>n==null?"—":Math.round(n).toString();
function stat(label:string,value:number|null|undefined){
 const node=el("div","ppw-profile-stat");
 node.append(el("span","",label),el("strong","",fmt(value)));
 if(value!=null){
  const track=el("span","ppw-profile-meter");
  const bar=el("span","ppw-profile-meter-fill");
  bar.style.width=Math.max(0,Math.min(100,value))+"%";
  track.append(bar);node.append(track);
 }
 return node;
}
export function mountWrestlerProfile(root:HTMLElement,port:WrestlerProfilePort,
 personId:string,onBack?:()=>void){
 let view:View|null=null,loading=false,saving=false,error="",success="";
 const names=(moves:View["persona"]["signatureMoves"])=>moves.map(m=>m.name).join("\n");
 async function load(){
  loading=true;render();
  try{view=await port.load(personId);error="";}
  catch(e){error=e instanceof Error?e.message:"Wrestler profile unavailable";}
  finally{loading=false;render();}
 }
 async function save(signature:string,finisher:string,primary:string|null,secondary:string|null){
  if(!view||!view.canEdit||saving)return;
  const parse=(x:string)=>x.split(/\r?\n/).map(n=>n.trim()).filter(Boolean);
  saving=true;error="";success="";
  try{
   const result=await port.save({personId,requestId:crypto.randomUUID(),
    expectedRevision:view.worldRevision,
    primaryStyle:primary,secondaryStyle:secondary,
    signatureMoves:parse(signature),finishingMoves:parse(finisher)});
   if(result.status==="STALE")
    throw new Error("The World changed. Reload the profile before editing.");
   success="Wrestler repertoire updated for the shared World.";
   view=await port.load(personId);
  }catch(e){error=e instanceof Error?e.message:"Unable to update move names";}
  finally{saving=false;render();}
 }
 function section(title:string,description?:string){
  const x=el("section","ppw-profile-section");
  x.append(el("h2","",title));
  if(description)x.append(el("p","ppw-profile-muted",description));
  return x;
 }
 function render(){
  root.replaceChildren();root.classList.add("ppw-wrestler-profile");
  const heading=el("header","ppw-profile-header");
  if(onBack)heading.append(button("‹ Back",onBack));
  heading.append(el("span","ppw-profile-kicker","PPW  /  WRESTLER DOSSIER"));
  root.append(heading);
  if(error)root.append(el("p","ppw-profile-message ppw-profile-error",error));
  if(!view){root.append(el("p","ppw-profile-muted",loading?
   "Opening wrestler dossier…":"Profile not available."));return;}
  if(success)root.append(el("p","ppw-profile-message",success));
  root.append(createWrestlerCard({
   personId:view.personId,name:view.name,ringName:view.persona.personaName,
   division:view.division,alignment:view.alignment,
   gimmickId:view.persona.gimmickId,primaryStyle:view.persona.primaryStyle,
   popularity:view.popularity,recognition:view.recognition,momentum:view.momentum,
   inRingQuality:view.inRingQuality,matchCraft:view.matchCraft,presentation:view.presentation,
   signatureMove:view.persona.signatureMoves[0]?.name,
   finisherMove:view.persona.finishingMoves[0]?.name,
   status:view.onYourRoster?"SIGNED TO YOUR PROMOTION":"WORLD TALENT"
  },{context:view.onYourRoster?"ROSTER":"MARKET",
   label:view.onYourRoster?"SIGNED TO YOUR PROMOTION":"NOT ON YOUR ROSTER"}));
  const attrs=section("Performance & standing");
  const grid=el("div","ppw-profile-statgrid");
  for(const [label,number] of [
   ["Popularity",view.popularity],["Recognition",view.recognition],
   ["Momentum",view.momentum],["In-ring",view.inRingQuality],
   ["Match craft",view.matchCraft],["Presentation",view.presentation],
   ["Stamina",view.stamina],["Safety",view.safety],
   ["Morale",view.morale],["Fatigue",view.fatigue],["Wear",view.wear]
  ] as const)grid.append(stat(label,number));
  attrs.append(grid);root.append(attrs);
  const character=section("Character & repertoire",
   "This identity follows the wrestler across the PPW World. Gimmick changes require a wrestler's agreement.");
  character.append(el("p","ppw-profile-info",
   "Character · "+wrestlerLabel(view.persona.gimmickId)+"  /  "+
   "Style · "+wrestlerLabel(view.persona.primaryStyle)+
   (view.persona.secondaryStyle?" / "+wrestlerLabel(view.persona.secondaryStyle):"")));
  const styleInputs=el("div","ppw-profile-style-inputs");
  const makeStyle=(title:string,current:string|null)=>{
   const box=el("label","ppw-profile-style");
   box.append(el("span","",title));
   const select=document.createElement("select");
   select.setAttribute("aria-label",title);select.disabled=!view!.canEdit||saving;
   const choices=[["","Not documented"],...WRESTLING_STYLES.map(x=>[x,wrestlerLabel(x)])];
   for(const [key,label] of choices){
    const opt=document.createElement("option");opt.value=key;opt.textContent=label;
    select.append(opt);
   }
   select.value=current??"";box.append(select);styleInputs.append(box);return select;
  };
  const primaryStyle=makeStyle("Primary style",view.persona.primaryStyle);
  const secondaryStyle=makeStyle("Secondary style",view.persona.secondaryStyle);
  character.append(styleInputs);
  const editor=el("div","ppw-profile-moves");
  const moveInputs:{signature?:HTMLTextAreaElement;finisher?:HTMLTextAreaElement}={};
  for(const [key,title,moves] of [
   ["signature","Signature moves",view.persona.signatureMoves],
   ["finisher","Finishers",view.persona.finishingMoves]
  ] as const){
   const group=el("label","ppw-profile-move-group");
   group.append(el("strong","",title));
   const input=document.createElement("textarea");
   input.rows=Math.max(2,Math.min(5,moves.length+1));
   input.value=names(moves);input.disabled=!view.canEdit||saving;
   input.placeholder="Not documented";input.maxLength=1000;
   input.setAttribute("aria-label",title+" (one move per line)");
   moveInputs[key]=input;group.append(input);editor.append(group);
  }
  character.append(editor);
  if(view.canEdit)character.append(button(saving?"Saving…":"Save move names",
   ()=>void save(moveInputs.signature!.value,moveInputs.finisher!.value,
    primaryStyle.value||null,secondaryStyle.value||null),saving));
  else character.append(el("p","ppw-profile-locked",
   !view.onYourRoster?"Available to inspect · editing requires a signed roster wrestler.":
    view.sharedHuman?"Editing requires agreement from all human employers.":
     "Editing unavailable while World Lock is closed."));
  if(view.onYourRoster&&port.openBackstage)character.append(button(
   "Discuss a gimmick change in Backstage",()=>port.openBackstage?.(personId)));
  root.append(character);
  const contract=section("Contract & availability");
  const ownContract=view.contracts.find(c=>c.isYours);
  if(ownContract){
   const c=ownContract;
   contract.append(el("p","ppw-profile-info",
    wrestlerLabel(c.family)+"  ·  "+wrestlerLabel(c.role)+
    "  ·  "+(c.remainingDates===null?"Unlimited dates":c.remainingDates+" dates left")+
    "  ·  "+(c.expiresWeekIndex-view.currentWeekIndex+1)+" weeks remaining"+
    (c.startWeekIndex>view.currentWeekIndex?
     " · starts in "+(c.startWeekIndex-view.currentWeekIndex)+" weeks":"")));
   contract.append(el("p","ppw-profile-muted",
    "Creative control · "+wrestlerLabel(c.creativeControl)+
    " · Weekly guarantee $"+Number(c.weeklyGuarantee??0).toLocaleString("en-GB")));
   if(view.onYourRoster&&port.openContracts)contract.append(button(
    "Manage contract",()=>port.openContracts?.()));
  }else contract.append(el("p","ppw-profile-muted",
   "Not signed to your promotion. Review current availability in Talent Market."));
  if(view.contracts.length){
   const other=view.contracts.filter(c=>!c.isYours);
   if(other.length)contract.append(el("p","ppw-profile-muted",
    "Also appearing for · "+other.map(c=>c.promotion+" ("+
     wrestlerLabel(c.family)+")").join(" · ")));
  }
  root.append(contract);
  const connections=section("Alliances & chemistry");
  const list=(title:string,values:string[])=>{
   const wrap=el("div","ppw-profile-affiliation");
   wrap.append(el("strong","",title),el("p","",values.join(" · ")||"None recorded"));
   return wrap;
  };
  connections.append(list("Tag teams",view.teams.map(t=>t.name)),
   list("Stables in your promotion",view.stables.map(t=>t.name)));
  if(view.connections.length)
   connections.append(list("Working relationships",view.connections.map(r=>
    r.name+" · Trust "+fmt(r.professionalTrust)+" · Familiarity "+fmt(r.familiarity))));
  root.append(connections);
  const history=section("Career & character timeline");
  history.append(el("p","ppw-profile-info","Career stage · "+
   wrestlerLabel(view.careerStage)+" · Active identity · "+view.persona.personaName));
  for(const era of view.history){
   history.append(el("p","ppw-profile-history",
    "Y"+(Math.floor(era.from/52)+1)+" W"+(era.from%52+1)+
    " – Y"+(Math.floor(era.to/52)+1)+" W"+(era.to%52+1)+
    "  /  "+era.persona.personaName+" · "+wrestlerLabel(era.persona.gimmickId)));
  }
  if(!view.history.length)history.append(el("p","ppw-profile-muted",
   "No previous PPW persona era recorded. Historical real-world characters are not invented as simulated PPW career events."));
  root.append(history);
 }
 void load();return {reload:load};
}
