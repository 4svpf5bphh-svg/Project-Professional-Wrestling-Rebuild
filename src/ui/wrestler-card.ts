import {createWrestlerPortrait} from "./wrestler-portrait.js";
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
function metric(label:string,value:number|null|undefined){
 const metricNames:Record<string,string>={
  POP:"Popularity",REC:"Recognition",MOM:"Momentum",
  RING:"In-ring ability",CRAFT:"Match craft",PRES:"Presentation"
 };
 const item=document.createElement("span");item.className="ppw-wrestler-stat";
 item.dataset.ability=wrestlerAbilityBand(value);
 item.setAttribute("aria-label",(metricNames[label]??label)+": "+
  (value==null?"unrated":Math.round(value)+ " out of 100"));
 item.append(span("ppw-wrestler-stat-name",label),
  span("ppw-wrestler-stat-value",value==null?"—":Math.round(value).toString()));
 const track=span("ppw-wrestler-track","");
 const fill=span("ppw-wrestler-fill","");
 fill.style.width=(value==null?0:Math.max(0,Math.min(100,value)))+"%";
 track.append(fill);item.append(track);
 return item;
}
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
const photo=createWrestlerPortrait(p.ringName||p.name,options.compact?150:220)??(p.ringName?createWrestlerPortrait(p.name,options.compact?150:220):null);
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
 const stats=document.createElement("span");stats.className="ppw-wrestler-stats";
 const numbers:[string,number|null|undefined][]=[
  ["POP",p.popularity],["REC",p.recognition],["MOM",p.momentum],
  ["RING",p.inRingQuality],["CRAFT",p.matchCraft],["PRES",p.presentation]];
 for(const [key,n] of numbers)if(n!==undefined)stats.append(metric(key,n));
 copy.append(stats);
 if(p.signatureMove&&!options.compact)
  copy.append(span("ppw-wrestler-finisher","SIGNATURE  /  "+p.signatureMove));
 if(p.finisherMove&&(!options.compact||options.context==="BOOKING"))
  copy.append(span("ppw-wrestler-finisher","FINISHER  /  "+p.finisherMove));
 const footer=span("ppw-wrestler-status",options.label??p.status??"");
 footer.setAttribute("aria-live","off");
 if(options.context==="BOOKING"&&p.available===false)
  footer.classList.add("ppw-wrestler-status-blocked");
 if(p.reason&&p.available===false)footer.title=wrestlerLabel(p.reason);
 root.append(copy,footer);
 return root;
}
