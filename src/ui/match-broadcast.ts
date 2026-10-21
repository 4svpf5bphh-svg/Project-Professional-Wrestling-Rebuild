/** Broadcast match cards are projections of the in-memory booking editor.
 * No fetch, no state mutation, no scripted-result override.
 */
import type {EditorMatch,PersonPick} from "./card-editor-model.js";
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
export function createMatchBroadcast(match:EditorMatch,
 nameFor:(person:PersonPick)=>string,titles:readonly Title[],
 context:{show:string;promotion:string;mainEvent:boolean;premium:boolean}):HTMLElement{
 const info=projectMatchGraphic(match,nameFor,titles,context);
 const holder=document.createElement("details");holder.className="ppw-broadcast-preview";
 holder.dataset.format=match.format;holder.dataset.eventMotif=info.motif;
 const opener=document.createElement("summary");
 opener.textContent="View match graphic ↗";opener.setAttribute("aria-label",
  "Preview broadcast graphic for "+info.format);holder.append(opener);
 const board=document.createElement("section");
 board.className="ppw-match-broadcast";
 board.dataset.matchFormat=match.format;board.dataset.eventMotif=info.motif;
 const header=span("ppw-broadcast-event",info.show);
 header.title=info.promotion;
 board.append(header,span("ppw-broadcast-promotion",info.promotion.toUpperCase()));
 const logo=createPromotionLogo(info.brand,110);
 if(logo){logo.classList.add("ppw-broadcast-company-logo");
  logo.onerror=()=>logo.remove();board.append(logo);}
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
   const visible=side.slice(0,match.format==="SINGLES"?1:2);
   for(const personName of visible){
    const photo=createWrestlerPortrait(personName,160);
    if(photo){photo.classList.add("ppw-broadcast-portrait");
     photo.onerror=()=>photo.remove();panel.append(photo);}
   }
   panel.append(span("ppw-broadcast-side-name",side.join(" & ")||"TBC"));
   line.append(panel);
   if(!multi&&i===0)line.append(span("ppw-broadcast-versus","VS"));
  }
 }
 board.append(line,span("ppw-broadcast-footer",
  info.premium?"PREMIUM EVENT · PPW":"LIVE FROM THE PPW WORLD"));
 // Only attach the broadcast contents when requested. This avoids extra image
 // requests and prevents duplicate hidden show names in the booking interface.
 holder.addEventListener("toggle",()=>{
  if(holder.open&&!board.isConnected)holder.append(board);
 });
 return holder;
}
