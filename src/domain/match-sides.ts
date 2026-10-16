/** Canonical match side structure. One identity per performer, arbitrary
 * side size at the representation layer; supported RULESETS are gated.
 * Flat participants are retained for contract/resource clearance.
 */
import {readCardParticipants,type CardParticipant} from "./card-participants.js";
export type MatchFamily="INDIVIDUAL"|"TEAMS";
export type MatchSideId="A"|"B"|"C"|"D"|"E"|"F";
export interface CanonicalMatchSide{sideId:MatchSideId;participants:readonly CardParticipant[]}
export interface CanonicalMatchLayout{
 family:MatchFamily;
 sides:readonly CanonicalMatchSide[];
 participants:readonly CardParticipant[];
 scriptedWinnerSide:MatchSideId;
}
const allowedSides=new Set<MatchSideId>(["A","B","C","D","E","F"]);
function obj(value:unknown):Record<string,unknown>{
 if(!value||typeof value!=="object"||Array.isArray(value))
  throw new Error("Invalid match sides");
 return value as Record<string,unknown>;
}
export function readCanonicalMatchLayout(payload:unknown):CanonicalMatchLayout{
 const p=obj(payload),flat=readCardParticipants(payload);
 if(flat.length<2||flat.length>30||
  new Set(flat.map(x=>x.personId)).size!==flat.length)
  throw new Error("Invalid or repeated match performer");
 // Backwards-compatible original singles card.
 if(p.sides===undefined){
  if(p.matchType!==undefined&&p.matchType!=="SINGLES"||flat.length!==2)
   throw new Error("Legacy adapter requires two distinct singles wrestlers");
  if(typeof p.scriptedWinner!=="string"||
   !flat.some(x=>x.personId===p.scriptedWinner))
   throw new Error("Player-authored scripted winner required");
  return {family:"INDIVIDUAL",participants:flat,
   sides:flat.map((x,i)=>({sideId:(i===0?"A":"B") as MatchSideId,participants:[x]})),
   scriptedWinnerSide:flat[0]!.personId===p.scriptedWinner?"A":"B"};
 }
 if(!Array.isArray(p.sides)||p.sides.length<2||p.sides.length>6)
  throw new Error("Invalid match side count");
 const sides=p.sides.map((side,i)=>{
  const raw=obj(side);
  if(typeof raw.sideId!=="string"||!allowedSides.has(raw.sideId as MatchSideId)||
   raw.sideId!==String.fromCharCode(65+i)||!Array.isArray(raw.participants))
   throw new Error("Invalid canonical match side");
  if(raw.participants.length<1||raw.participants.length>5)
   throw new Error("Invalid side roster size");
  const people=raw.participants.map(x=>{
   const r=obj(x);
   if(typeof r.personId!=="string"||!r.personId||
    typeof r.contractId!=="string"||!r.contractId)
    throw new Error("Invalid team participant contract");
   return {personId:r.personId,contractId:r.contractId};
  });
  return {sideId:raw.sideId as MatchSideId,participants:people};
 });
 const all=sides.flatMap(s=>s.participants);
 if(JSON.stringify(flat)!==JSON.stringify(all)||
    new Set(all.map(x=>x.personId)).size!==all.length)
  throw new Error("Match sides disagree with contracted participants");
 const family=p.family;
 if(family!=="INDIVIDUAL"&&family!=="TEAMS")
  throw new Error("Missing match family");
 if(family==="INDIVIDUAL"&&sides.some(s=>s.participants.length!==1))
  throw new Error("Individual matches cannot contain grouped participants");
 if(family==="TEAMS"&&
  (sides.some(s=>s.participants.length<2)||
   sides.some(s=>s.participants.length!==sides[0]!.participants.length)))
  throw new Error("Team match requires evenly sized sides");
 if(typeof p.scriptedWinnerSide!=="string"||
  !sides.some(s=>s.sideId===p.scriptedWinnerSide))
  throw new Error("Match outcome must name a booked side");
 // The result/scoring layer is expanding in controlled format slices.
 // Do NOT silently call a 3-way or a battle royal a 1v1.
 if(family==="INDIVIDUAL"&&sides.length===2&&
  (p.matchType==="SINGLES"||p.matchType===undefined)){
  const winner=all.find((x,i)=>sides[i]!.sideId===p.scriptedWinnerSide);
  if(p.scriptedWinner!==undefined&&p.scriptedWinner!==winner?.personId)
   throw new Error("Scripted winner and winner side disagree");
 }else if(family==="TEAMS"&&p.matchType!=="TAG")
  throw new Error("Team match must declare TAG rules");
 return {family,sides,participants:all,
  scriptedWinnerSide:p.scriptedWinnerSide as MatchSideId};
}
export function requireSupportedScoringLayout(layout:CanonicalMatchLayout):
 "SINGLES"|"TAG"{
 if(layout.family==="INDIVIDUAL"&&layout.sides.length===2)return "SINGLES";
 if(layout.family==="TEAMS"&&layout.sides.length===2&&
  layout.sides.every(x=>x.participants.length===2))return "TAG";
 throw new Error("Match formation awaits the approved scoring rules");
}
