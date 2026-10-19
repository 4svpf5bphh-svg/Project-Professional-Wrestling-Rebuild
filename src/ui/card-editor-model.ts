/** Browser-neutral card editor state, adapted from the original PPW card
 * running-order and wrestler-picker interactions. Server validates final saves.
 */
import {normalizeBookableMatch,type BookableMatch} from "../domain/bookable-match.js";
import {readCanonicalMatchLayout,sideIdAt} from "../domain/match-sides.js";
import {defaultMatchStyleForIntent,normalizeMatchStyle,evaluateMatchStyleLoad,
 assessMatchStyleReadiness,
 type MatchStyleDimension,type MatchStyleProfile} from "../simulation/legacy/match-style.js";
import type {MatchIntent} from "../simulation/legacy/types.js";
import {readBookedInterference,type BookedInterference} from "../simulation/legacy/match-interference.js";
export type Format="SINGLES"|"TRIPLE_THREAT"|"FOUR_WAY"|"TAG"|"TRIOS"|
 "FOUR_V_FOUR"|"FIVE_V_FIVE"|"MULTI_TEAM"|"BATTLE_ROYAL";
export type PersonPick={personId:string;contractId:string};
export interface EditorMatch{
 slotId:string;format:Format;
 teams:(PersonPick|null)[][];
 winnerSide:number;
 intent:string;plannedFinish:string;plannedLengthMinutes:number;
 elimination:boolean;eliminationOrder:number[];
 /** Existing optional booking metadata must survive an edit. */
 championshipId?:string;interference?:BookedInterference;style?:unknown;
 cheatingWrestlerId?:string;
}
export const FORMATS:readonly {value:Format;label:string}[]=[
 {value:"SINGLES",label:"Singles · 1v1"},
 {value:"TRIPLE_THREAT",label:"Triple threat"},
 {value:"FOUR_WAY",label:"Fatal four-way"},
 {value:"TAG",label:"Tag · 2v2"},
 {value:"TRIOS",label:"Trios · 3v3"},
 {value:"FOUR_V_FOUR",label:"Four on four"},
 {value:"FIVE_V_FIVE",label:"Five on five"},
 {value:"MULTI_TEAM",label:"Multi-team · 2–6 teams"},
 {value:"BATTLE_ROYAL",label:"Battle royal · 6–30 entrants"},
];
const isTeam=(format:Format)=>["TAG","TRIOS","FOUR_V_FOUR",
 "FIVE_V_FIVE","MULTI_TEAM"].includes(format);
function shape(format:Format):[number,number]{
 switch(format){
  case "SINGLES":return [2,1];
  case "TRIPLE_THREAT":return [3,1];
  case "FOUR_WAY":return [4,1];
  case "TAG":return [2,2];
  case "TRIOS":return [2,3];
  case "FOUR_V_FOUR":return [2,4];
  case "FIVE_V_FIVE":return [2,5];
  case "MULTI_TEAM":return [3,2];
  case "BATTLE_ROYAL":return [20,1];
 }
}
export function newEditorMatch(slotId:string,format:Format):EditorMatch{
 const [teams,size]=shape(format);
 return {slotId,format,teams:Array.from({length:teams},()=>
  Array.from({length:size},()=>null)),winnerSide:0,
  intent:"COMPETITIVE",plannedFinish:format==="BATTLE_ROYAL"?
   "OVER_THE_TOP_ROPE":"CLEAN_PIN",
  plannedLengthMinutes:format==="BATTLE_ROYAL"?30:18,
  elimination:format==="BATTLE_ROYAL",
  eliminationOrder:Array.from({length:teams-1},(_,i)=>i+1)};
}
export function restoreEditorMatch(slotId:string,payload:unknown):EditorMatch{
 const layout=readCanonicalMatchLayout(payload);
 const raw=payload as Record<string,unknown>;
 const [n,size]=[layout.sides.length,layout.sides[0]!.participants.length];
 const format:Format=layout.family==="INDIVIDUAL"?
  n===2?"SINGLES":n===3?"TRIPLE_THREAT":
   n===4?"FOUR_WAY":"BATTLE_ROYAL":
  n>2?"MULTI_TEAM":size===2?"TAG":size===3?"TRIOS":
   size===4?"FOUR_V_FOUR":"FIVE_V_FIVE";
 const sideIndex=layout.sides.findIndex(s=>s.sideId===layout.scriptedWinnerSide);
 return {...newEditorMatch(slotId,format),
  teams:layout.sides.map(s=>s.participants.map(x=>({...x}))),
  winnerSide:sideIndex,intent:typeof raw.intent==="string"?
   raw.intent:"COMPETITIVE",
  plannedFinish:typeof raw.plannedFinish==="string"?raw.plannedFinish:
   format==="BATTLE_ROYAL"?"OVER_THE_TOP_ROPE":"CLEAN_PIN",
  plannedLengthMinutes:typeof raw.plannedLengthMinutes==="number"?
   raw.plannedLengthMinutes:18,
  elimination:layout.ruleset==="ELIMINATION",
  eliminationOrder:layout.eliminationOrder.map(x=>
   layout.sides.findIndex(s=>s.sideId===x)),
  ...(typeof raw.championshipId==="string"?{championshipId:raw.championshipId}:{}),
  ...(raw.interference===undefined?{}:{interference:readBookedInterference(raw)??undefined}),
  ...(raw.style===undefined?{}:{style:raw.style}),
  ...(typeof raw.cheatingWrestlerId==="string"?
   {cheatingWrestlerId:raw.cheatingWrestlerId}:{})};
}
/** These are the existing match-scoring styles, not estimated new ratings. */
const matchIntents=new Set(["COMPETITIVE","SHOWCASE","DOMINANT","TECHNICAL",
 "HIGH_RISK","STORY","PROTECTIVE","EPIC"]);
export function editorMatchStyle(match:EditorMatch):MatchStyleProfile{
 const intent=matchIntents.has(match.intent)?match.intent as MatchIntent:"COMPETITIVE";
 return match.style===undefined?defaultMatchStyleForIntent(intent):
  normalizeMatchStyle(match.style as MatchStyleProfile);
}
export function changeMatchIntent(match:EditorMatch,intent:string):EditorMatch{
 if(!matchIntents.has(intent))throw new Error("Unknown match presentation");
 return {...match,intent,style:match.format==="SINGLES"?
  defaultMatchStyleForIntent(intent as MatchIntent):undefined};
}
export function changeMatchStyle(match:EditorMatch,key:MatchStyleDimension,value:number):EditorMatch{
 if(match.format!=="SINGLES")throw new Error("Detailed styles are limited to singles matches");
 if(!Number.isInteger(value)||value<0||value>100)throw new Error("Match style must be 0–100");
 return {...match,style:normalizeMatchStyle({...editorMatchStyle(match),[key]:value})};
}
export function editorStyleLoad(match:EditorMatch){
 return evaluateMatchStyleLoad(editorMatchStyle(match),match.plannedLengthMinutes);
}
/** The programme card should headline the performers, not merely a slot counter. */
export function bookedMatchHeadline(match:EditorMatch,
 nameFor:(participant:PersonPick|null)=>string):string{
 const teams=match.teams.map(side=>side.map(nameFor).join(" & "));
 if(match.format==="BATTLE_ROYAL")return "Battle royal · "+
  match.teams.filter(side=>side.every(Boolean)).length+
  " of "+match.teams.length+" entrants";
 if(teams.length>3)return teams.slice(0,2).join(" vs ")+" + "+
  (teams.length-2)+" more";
 return teams.join(" vs ");
}
export interface ConditionSnapshot{
 inRingQuality:number|null;matchCraft:number|null;presentation:number|null;
 stamina:number|null;safety:number|null;fatigue:number|null;wear:number|null;
}
export function bookedStyleReadiness(match:EditorMatch,
 byPerson:ReadonlyMap<string,ConditionSnapshot>){
 if(match.format!=="SINGLES")return {known:0,missing:0,reports:[]};
 const people=match.teams.flat().filter((p):p is PersonPick=>p!==null);
 const reports:{personId:string;status:"COMFORTABLE"|"CONCERNED"|"REFUSES";
  reasons:string[];physicalLoad:number}[]=[];
 let missing=0;
 for(const person of people){
  const p=byPerson.get(person.personId);
  if(!p||[p.inRingQuality,p.matchCraft,p.presentation,p.stamina,p.safety,
   p.fatigue,p.wear].some(x=>typeof x!=="number"||!Number.isFinite(x))){
   missing++;continue;
  }
  const result=assessMatchStyleReadiness(editorMatchStyle(match),{
   inRingQuality:p.inRingQuality!,matchCraft:p.matchCraft!,
   presentation:p.presentation!,stamina:p.stamina!,safety:p.safety!
  },match.plannedLengthMinutes,p.fatigue!,p.wear!);
  reports.push({personId:person.personId,status:result.status,
   reasons:[...result.reasons],physicalLoad:result.physicalLoad});
 }
 return {known:reports.length,missing,reports};
}
export function assignedIds(match:EditorMatch):string[]{
 return match.teams.flatMap(s=>s.flatMap(p=>p?[p.personId]:[]));
}
export function assignPerformer(match:EditorMatch,side:number,index:number,
 performer:PersonPick|null):EditorMatch{
 if(side<0||side>=match.teams.length||index<0||
  index>=match.teams[side]!.length)
  throw new Error("Unknown participant slot");
 if(performer&&(!performer.personId||!performer.contractId||
  assignedIds(match).some((id)=>id===performer.personId&&
   match.teams[side]![index]?.personId!==id)))
  throw new Error("Wrestler already used or missing contract");
 const teams=match.teams.map(s=>s.map(p=>p?{...p}:null));
 teams[side]![index]=performer?{...performer}:null;
 const interference=match.interference&&performer?.personId===match.interference.personId?
  undefined:match.interference;
 return {...match,teams,interference,cheatingWrestlerId:undefined};
}
export function changeWinner(match:EditorMatch,side:number):EditorMatch{
 if(side<0||side>=match.teams.length)throw new Error("Invalid winning side");
 if(side===match.winnerSide)return match;
 const eliminationOrder=[...match.eliminationOrder,match.winnerSide]
  .filter((x,i,a)=>x!==side&&a.indexOf(x)===i);
 return {...match,winnerSide:side,eliminationOrder,
  cheatingWrestlerId:undefined,
  ...(match.interference?.plannedOutcome==="SUCCESS"?{
   interference:{...match.interference,aidedSide:side===0?"A":"B"}
  }:{})};
}
export function resizeMatch(match:EditorMatch,count:number,size?:number):EditorMatch{
 if(match.format!=="BATTLE_ROYAL"&&match.format!=="MULTI_TEAM")
  throw new Error("Only variable match formations can be resized");
 if(!Number.isInteger(count)||count<(match.format==="BATTLE_ROYAL"?6:3)||
  count>(match.format==="BATTLE_ROYAL"?30:6))
  throw new Error("Participant/team count out of range");
 const teamSize=match.format==="BATTLE_ROYAL"?1:size??match.teams[0]!.length;
 if(!Number.isInteger(teamSize)||teamSize<1||teamSize>5||
  (match.format==="MULTI_TEAM"&&teamSize<2)||
  count*teamSize>30)throw new Error("Invalid team size");
 const displaced=match.teams.some((team,i)=>team.some((person,j)=>
  person!==null&&(i>=count||j>=teamSize)));
 if(displaced)throw new Error("Remove wrestlers from the affected positions before reducing the match size");
 const teams=Array.from({length:count},(_,i)=>
  Array.from({length:teamSize},(_,j)=>match.teams[i]?.[j]??null));
 const winnerSide=Math.min(match.winnerSide,count-1);
 return {...match,teams,winnerSide,
  eliminationOrder:[...match.eliminationOrder,match.winnerSide]
   .filter((x,i,a)=>x<count&&x!==winnerSide&&a.indexOf(x)===i)
   .concat(Array.from({length:count},(_,i)=>i)
    .filter(x=>x!==winnerSide&&!match.eliminationOrder.includes(x)&&
     x!==match.winnerSide))};
}
export function moveElimination(match:EditorMatch,index:number,delta:-1|1):EditorMatch{
 const target=index+delta;
 if(index<0||target<0||target>=match.eliminationOrder.length)
  return match;
 const values=[...match.eliminationOrder];
 [values[index],values[target]]=[values[target]!,values[index]!];
 return {...match,eliminationOrder:values};
}
export function moveRunningOrder(order:readonly string[],id:string,delta:-1|1){
 const index=order.indexOf(id),next=index+delta;
 if(index<0||next<0||next>=order.length)return [...order];
 const values=[...order];
 [values[index],values[next]]=[values[next]!,values[index]!];
 return values;
}
export function buildBookedMatch(match:EditorMatch):BookableMatch{
 if(match.teams.some(s=>s.some(p=>p===null)))
  throw new Error("Choose a wrestler in every match position");
 const participants=match.teams.flat() as PersonPick[];
 if(new Set(participants.map(x=>x.personId)).size!==participants.length)
  throw new Error("Wrestler cannot face themselves");
 const sides=match.teams.map((s,i)=>({sideId:sideIdAt(i),
  participants:s as PersonPick[]}));
 const family=isTeam(match.format)?"TEAMS":"INDIVIDUAL";
 const raw={
  matchType:match.format==="BATTLE_ROYAL"?"BATTLE_ROYAL":
   family==="TEAMS"?"TAG":"SINGLES",
  family,participants,sides,
  scriptedWinnerSide:sideIdAt(match.winnerSide),
  ...(match.elimination?{ruleset:"ELIMINATION",eliminationOrder:
   match.eliminationOrder.map(sideIdAt)}:{}),
  plannedFinish:match.plannedFinish,
  plannedLengthMinutes:match.plannedLengthMinutes,intent:match.intent,
  ...(match.championshipId?{championshipId:match.championshipId}:{}),
  ...(match.interference?{interference:match.interference}:{}),
  ...(match.style?{style:match.style}:{}),
  ...(match.cheatingWrestlerId?{cheatingWrestlerId:match.cheatingWrestlerId}:{}),
 };
 return normalizeBookableMatch(raw);
}
