/** Broadcast match cards are projections of the in-memory booking editor.
 * No fetch, no state mutation, no scripted-result override.
 */
import type {EditorMatch,PersonPick} from "./card-editor-model.js";
import type {EditorSegment} from "./card-segment-model.js";
import {FORMATS} from "./card-editor-model.js";
import {eventDesign} from "./broadcast-identity.js";
import {createPromotionLogo} from "./promotion-logo.js";
import {createWrestlerPortrait} from "./wrestler-portrait.js";

type Title={championshipId:string;name:string;division:"SINGLES"|"TAG";holderName:string|null};
export interface BroadcastProjection{
 format:string;participants:string[][];entrants:number;totalEntrants:number;
 championship:string|null;show:string;promotion:string;mainEvent:boolean;
 elimination:boolean;motif:string;brand:string;premium:boolean;
}
export function projectMatchGraphic(match:EditorMatch,
 nameFor:(person:PersonPick)=>string,titles:readonly Title[],
 context:{show:string;promotion:string;mainEvent:boolean;premium:boolean}):BroadcastProjection{
 const participants=match.teams.map(team=>team.filter((p):p is PersonPick=>p!==null).map(nameFor));
 const design=eventDesign(context.show,context.promotion,context.premium);
 const title=titles.find(t=>t.championshipId===match.championshipId);
 return {participants,format:FORMATS.find(f=>f.value===match.format)?.label??match.format,
  entrants:participants.reduce((n,side)=>n+side.length,0),
  totalEntrants:match.teams.reduce((n,side)=>n+side.length,0),
  championship:title?.name??null,elimination:match.elimination,
  ...context,motif:design.motif,brand:design.brand};
}
const span=(cls:string,value:string)=>{
 const el=document.createElement("span");el.className=cls;el.textContent=value;return el;
};
/** Presentation-only control: the booking data and authored result never change. */
function allowExpandedGraphic(holder:HTMLElement,kind:"match"|"angle"){
 const toggle=document.createElement("button");
 toggle.type="button";
 toggle.className="ppw-broadcast-size-toggle";
 const set=(expanded:boolean)=>{
  holder.classList.toggle("ppw-broadcast-expanded",expanded);
  toggle.textContent=expanded?"↙":"↗";
  toggle.title=expanded?"Compact graphic":"Expand graphic";
  toggle.setAttribute("aria-label",(expanded?"Compact ":"Expand ")+kind+" graphic");
  toggle.setAttribute("aria-pressed",String(expanded));
 };
 set(false);
 toggle.onclick=event=>{event.stopPropagation();
  set(!holder.classList.contains("ppw-broadcast-expanded"));};
 holder.append(toggle);return holder;
}
export function createMatchBroadcast(match:EditorMatch,
 nameFor:(person:PersonPick)=>string,titles:readonly Title[],
 context:{show:string;promotion:string;mainEvent:boolean;premium:boolean}):HTMLElement{
 const info=projectMatchGraphic(match,nameFor,titles,context);
 const dense=match.format==="BATTLE_ROYAL"||info.entrants>4;
 const holder=document.createElement("section");holder.className="ppw-broadcast-preview";
 holder.dataset.format=match.format;holder.dataset.eventMotif=info.motif;
 // Artwork is immediately part of the card ticket, not a hidden preview.
 {
 const board=document.createElement("section");
 board.className="ppw-match-broadcast";
 board.dataset.matchFormat=match.format;board.dataset.eventMotif=info.motif;
 const header=span("ppw-broadcast-event",info.show);
 header.title=info.promotion;
 board.append(header,span("ppw-broadcast-promotion",info.promotion.toUpperCase()));
 const brandMark=span("ppw-broadcast-brand-mark",info.brand.toUpperCase());
 const logo=createPromotionLogo(info.brand,110);
 if(logo&&info.brand!=="njpw"&&info.brand!=="cmll"){
  logo.classList.add("ppw-broadcast-company-logo");
  logo.onload=()=>{brandMark.dataset.logoReady="true";};
  logo.onerror=()=>{logo.remove();delete brandMark.dataset.logoReady;};
  brandMark.append(logo);
 }
 board.append(brandMark);
 if(info.mainEvent)board.append(span("ppw-broadcast-main","★ MAIN EVENT"));
 if(info.championship)board.append(span("ppw-broadcast-championship",
  "★ "+info.championship.toUpperCase()+" · CHAMPIONSHIP MATCH"));
 board.append(span("ppw-broadcast-format",info.format+
  (info.elimination?" · ELIMINATION":"")));
 const line=document.createElement("div");line.className="ppw-broadcast-lineup";
 if(match.format==="BATTLE_ROYAL"){
  line.classList.add("ppw-broadcast-battle-royal");
  const headline=span("ppw-broadcast-battle-label","BATTLE ROYAL");
  const total=span("ppw-broadcast-battle-count",
   info.entrants+" / "+info.totalEntrants+" ENTRANTS BOOKED");
  line.append(headline,total);
  const people=span("ppw-broadcast-battle-entrants",
   info.participants.flat().slice(0,8).join("  ·  ")+
    (info.entrants>8?"  ·  +"+(info.entrants-8)+" MORE":""));
  line.append(people);
 }else{
  const multi=info.participants.length>2;
  line.classList.toggle("ppw-broadcast-multi",multi);
  for(const [i,side] of info.participants.entries()){
   const panel=document.createElement("div");panel.className="ppw-broadcast-side";
   panel.dataset.side=String(i+1);
   // Only a handful of on-screen portraits, even for large teams.
   const visible=side.slice(0,dense?2:side.length);
   const portraitRow=document.createElement("div");portraitRow.className="ppw-broadcast-portraits";
   for(const personName of visible){
    const photo=createWrestlerPortrait(personName,160);
    if(photo){photo.loading="lazy";photo.classList.add("ppw-broadcast-portrait");
     photo.onerror=()=>photo.remove();portraitRow.append(photo);}
   }
   panel.append(portraitRow,span("ppw-broadcast-side-name",side.join(" & ")||"TBC"));
   line.append(panel);
   if(!multi&&i===0)line.append(span("ppw-broadcast-versus","VS"));
  }
 }
 board.append(line,span("ppw-broadcast-footer",
  info.premium?"PREMIUM EVENT · PPW":"LIVE FROM THE PPW WORLD"));
 holder.append(board);
 }
 return dense?allowExpandedGraphic(holder,"match"):holder;
}
/** The same broadcast art system for angles, without placeholder asset packs. */
export function createAngleBroadcast(segment:EditorSegment,
 nameFor:(person:PersonPick)=>string,
 context:{show:string;promotion:string;premium:boolean}):HTMLElement{
 const design=eventDesign(context.show,context.promotion,context.premium);
 const frame=document.createElement("section");frame.className="ppw-broadcast-preview";
 const board=document.createElement("section");
 board.className="ppw-match-broadcast ppw-angle-broadcast";
 board.dataset.eventMotif=design.motif;
 board.append(span("ppw-broadcast-event",context.show),
  span("ppw-broadcast-promotion",context.promotion.toUpperCase()));
 const brand=span("ppw-broadcast-brand-mark",design.brand.toUpperCase());
 const logo=createPromotionLogo(design.brand,110);
 if(logo&&design.brand!=="njpw"&&design.brand!=="cmll"){
  logo.classList.add("ppw-broadcast-company-logo");
  logo.onload=()=>{brand.dataset.logoReady="true";};
  logo.onerror=()=>{logo.remove();delete brand.dataset.logoReady;};
  brand.append(logo);
 }
 board.append(brand,span("ppw-broadcast-format","LIVE SEGMENT · "+segment.kind.replaceAll("_"," ")));
 const headline=document.createElement("div");
 headline.className="ppw-angle-broadcast-spotlight";
 const booked=[...segment.actors,...segment.targets].filter((x):x is PersonPick=>x!==null);
 for(const person of booked.slice(0,4)){
  const name=nameFor(person);
  const performer=document.createElement("div");
  performer.className="ppw-angle-broadcast-person";
  const photo=createWrestlerPortrait(name,160);
  if(photo){photo.loading="lazy";photo.classList.add("ppw-broadcast-portrait");
   photo.onerror=()=>photo.remove();performer.append(photo);}
  performer.append(span("ppw-broadcast-side-name",name));headline.append(performer);
 }
 if(!booked.length)headline.append(span("ppw-angle-broadcast-placeholder","CAST TO BE ANNOUNCED"));
 board.append(headline,span("ppw-broadcast-footer",
  context.premium?"PREMIUM EVENT · PPW":"LIVE FROM THE PPW WORLD"));
 frame.append(board);return booked.length>4?allowExpandedGraphic(frame,"angle"):frame;
}
