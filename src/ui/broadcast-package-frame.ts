/** Actual PPW broadcast graphic, reusable in KP preview and completed shows.
 * Text is always DOM textContent, never generated images or unsafe HTML. */
import {broadcastPackageClass} from "../domain/broadcast-packages.js";
import "./broadcast-packages.css";
export interface BroadcastPackageFrameInput{
 style:string|null|undefined;kind:"OPEN"|"MATCH"|"SEGMENT";
 promotion:string;show:string;sideA?:string;sideB?:string;
 segmentPerson?:string;segmentLabel?:string;compact?:boolean;
}
const el=(tag:string,cls:string,content="")=>{
 const x=document.createElement(tag);x.className=cls;x.textContent=content;return x;
};
export function createBroadcastPackageFrame(input:BroadcastPackageFrameInput):HTMLElement|null{
 const style=broadcastPackageClass(input.style);
 if(style==="standard")return null;
 const frame=el("section","ppw-tv-frame");
 frame.dataset.broadcastPackage=style;
 frame.dataset.kind=input.kind.toLowerCase();
 frame.dataset.compact=String(!!input.compact);
 frame.setAttribute("aria-label",input.kind==="OPEN"?
  input.show+" opening titles":input.kind==="MATCH"?
   "Match introduction "+(input.sideA??"TBC")+" versus "+(input.sideB??"TBC"):
   "On-screen segment graphic "+(input.segmentPerson??""));
 const motion=el("div","ppw-tv-motion");motion.setAttribute("aria-hidden","true");
 const top=el("div","ppw-tv-top");
 top.append(el("strong","ppw-tv-promotion",input.promotion),
  el("span","ppw-tv-broadcast-label","PPW TELEVISION"));
 const centre=el("div","ppw-tv-centre");
 if(input.kind==="OPEN"){
  centre.append(el("span","ppw-tv-red-label","LIVE BROADCAST"),
   el("strong","ppw-tv-title",input.show),
   el("span","ppw-tv-caption","THE NEXT CHAPTER STARTS HERE"));
 }else if(input.kind==="MATCH"){
  centre.append(el("span","ppw-tv-red-label","UP NEXT · MATCH"));
  const fight=el("div","ppw-tv-fighters");
  fight.append(el("strong","ppw-tv-fighter",input.sideA||"TO BE ANNOUNCED"),
   el("b","ppw-tv-vs","VS"),el("strong","ppw-tv-fighter",input.sideB||"TO BE ANNOUNCED"));
  centre.append(fight);
 }else{
  centre.append(el("span","ppw-tv-red-label",input.segmentLabel||"IN-RING SEGMENT"));
  const lower=el("div","ppw-tv-lower");
  lower.append(el("strong","ppw-tv-lower-name",input.segmentPerson||"TO BE ANNOUNCED"),
   el("small","ppw-tv-lower-show",input.show));
  centre.append(lower);
 }
 const footer=el("div","ppw-tv-footer");
 footer.append(el("span","",input.show),el("span","","PPW / ON AIR"));
 frame.append(motion,top,centre,footer);
 return frame;
}
