import {createWrestlerPortrait} from "./wrestler-portrait.js";
import {estimateWrestlerFans,compactFanEstimate,wrestlerSpotlightTrait}
 from "../domain/fan-following.js";
/** One presentation contract across roster, recruitment and the booking sheet.
 * Caller owns selection/permission decisions; visual cards never query Neon.
 */
export interface WrestlerCardModel{
 personId:string;name:string;ringName?:string|null;
 division?:string|null;promotion?:string|null;status?:string|null;
 alignment?:string|null;gimmickId?:string|null;primaryStyle?:string|null;
 signatureMove?:string|null;finisherMove?:string|null;
 popularity?:number|null;recognition?:number|null;momentum?:number|null;
 inRingQuality?:number|null;matchCraft?:number|null;presentation?:number|null;
 remainingDates?:number|null;available?:boolean;reason?:string|null;
 championships?:readonly string[]|null;
}
export function wrestlerLabel(value:string|null|undefined):string{
 return value?value.replaceAll("_"," ").toLowerCase()
  .replace(/(^|\s)\S/g,x=>x.toUpperCase()):"Not yet documented";
}
export function wrestlerInitials(name:string):string{
 return name.trim().split(/\s+/).slice(0,2).map(x=>x[0]?.toUpperCase()??"").join("")||"PP";
}
/** Performance ratings are current levels, not predictions or week-on-week trends. */
export function wrestlerAbilityBand(value:number|null|undefined){
 if(value==null)return "unknown" as const;
 return value>=85?"outstanding" as const:value>=70?"strong" as const:
  value<40?"developing" as const:"steady" as const;
}
const span=(className:string,label:string)=>{
 const node=document.createElement("span");node.className=className;node.textContent=label;
 return node;
};
export function createWrestlerCard(p:WrestlerCardModel,options:{
 context:"ROSTER"|"MARKET"|"BOOKING";
 label?:string;onSelect?:()=>void;disabled?:boolean;
 compact?:boolean;
}):HTMLElement{
 const selectable=!!options.onSelect;
 const root=document.createElement(selectable?"button":"div");
 root.className="ppw-wrestler-card ppw-wrestler-"+options.context.toLowerCase()+
  (options.compact?" ppw-wrestler-compact":"")+
  (options.disabled?" ppw-wrestler-unavailable":"");
 if(selectable){
  const button=root as HTMLButtonElement;button.type="button";
  button.disabled=!!options.disabled;button.onclick=options.onSelect!;
 }
 root.setAttribute("aria-label",(p.ringName||p.name)+
  (p.division?" · "+wrestlerLabel(p.division):"")+
  (p.alignment?" · "+wrestlerLabel(p.alignment):"")+
  (p.championships?.length?" · Current champion: "+p.championships.join(", "):"")+
  (options.label?" · "+options.label:""));
 if(p.alignment)root.dataset.alignment=p.alignment.toUpperCase();
 if(p.championships?.length){root.dataset.champion="true";root.dataset.titleCount=String(p.championships.length);}

 // Keep a genuine, fixed-size art well even with no verified photograph.
const media=span("ppw-wrestler-media","");
media.setAttribute("aria-hidden","true");
media.append(span("ppw-wrestler-media-mark",wrestlerInitials(p.ringName||p.name)));
const photo=createWrestlerPortrait(p.ringName||p.name,options.compact?150:220,p.personId)??
  (p.ringName?createWrestlerPortrait(p.name,options.compact?150:220,p.personId):null);
if(photo){
 root.dataset.hasPhoto="true";
 photo.onerror=()=>{photo.remove();delete root.dataset.hasPhoto;root.dataset.portrait="unavailable";};
 media.append(photo);
}else root.dataset.portrait="unavailable";
root.append(media);
const copy=document.createElement("span");copy.className="ppw-wrestler-copy";
 const badges=span("ppw-wrestler-badges","");
 const divisionBadge=span("ppw-wrestler-division",p.division==="WOMEN"?
  "WOMEN":p.division==="MEN"?"MEN":"ROSTER");
 divisionBadge.dataset.division=p.division??"UNKNOWN";badges.append(divisionBadge);
 if(p.alignment){
  const badge=span("ppw-wrestler-alignment",p.alignment.toUpperCase()==="FACE"?
   "FACE":p.alignment.toUpperCase()==="HEEL"?"HEEL":
    p.alignment.toUpperCase()==="TWEENER"?"TWEENER":wrestlerLabel(p.alignment).toUpperCase());
  badges.append(badge);
 }
 if(p.promotion)badges.append(span("ppw-wrestler-promotion",p.promotion));
 if(p.championships?.length){
  const crown=span("ppw-wrestler-champion",p.championships.length===1?"CHAMPION":p.championships.length+"× CHAMPION");
  crown.title=p.championships.join(" · ");
  badges.append(crown);
 }
 copy.append(badges,span("ppw-wrestler-name",p.ringName||p.name));
 if(p.ringName&&p.ringName!==p.name)
  copy.append(span("ppw-wrestler-real-name",p.name));
 const identity=[p.gimmickId?wrestlerLabel(p.gimmickId):null,
  p.primaryStyle?wrestlerLabel(p.primaryStyle):null].filter(Boolean);
 if(identity.length)copy.append(span("ppw-wrestler-identity",identity.join(" · ")));
 if(p.championships?.length){
  const belts=span("ppw-wrestler-championship-titles",p.championships.join(" · "));
  belts.title="Current championships";
  copy.append(belts);
 }
 {
  const audience=compactFanEstimate(estimateWrestlerFans(
   p.popularity,p.recognition,p.momentum));
  if(audience){
   const following=span("ppw-wrestler-fans",audience);
   following.title="Estimated following based on popularity, recognition and momentum; not a social-account count.";
   const symbol=document.createElementNS("http://www.w3.org/2000/svg","svg");
   symbol.setAttribute("viewBox","0 0 24 24");
   symbol.setAttribute("aria-hidden","true");
   symbol.setAttribute("class","ppw-wrestler-fans-icon");
   symbol.setAttribute("fill","none");symbol.setAttribute("stroke","currentColor");
   symbol.setAttribute("stroke-width","2");
   symbol.setAttribute("stroke-linecap","round");symbol.setAttribute("stroke-linejoin","round");
   for(const d of ["M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2",
    "M9 11a4 4 0 1 0 0-8a4 4 0 0 0 0 8",
    "M22 21v-2a4 4 0 0 0-3-3.87",
    "M16 3.13a4 4 0 0 1 0 7.75"]){
    const path=document.createElementNS("http://www.w3.org/2000/svg","path");
    path.setAttribute("d",d);symbol.append(path);
   }
   following.prepend(symbol);copy.append(following);
  }
  const trait=wrestlerSpotlightTrait(p);
  if(trait)copy.append(span("ppw-wrestler-trait",trait));
 }
 // Compact visual identity is shared across booking, roster and market.
 // Full scouting ratings, signature and finisher live in the wrestler dossier.
 const footer=span("ppw-wrestler-status",options.label??p.status??"");
 footer.setAttribute("aria-live","off");
 if(p.reason&&p.available===false)footer.title=wrestlerLabel(p.reason);
 if((options.label??p.status)?.trim()){
  badges.append(footer);
  if(options.context==="BOOKING"&&p.available===false)
   footer.classList.add("ppw-wrestler-status-blocked");
 }
 root.append(copy);
 if(options.context==="ROSTER"&&selectable)
  root.append(span("ppw-wrestler-chevron","›"));
 return root;
}
