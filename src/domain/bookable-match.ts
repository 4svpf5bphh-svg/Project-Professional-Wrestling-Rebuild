/** Canonical player-authored match booking. Scoring and UI share this
 * normalizer; never trust arbitrary browser fields as World match evidence.
 */
import {readCanonicalMatchLayout,requireSupportedScoringLayout,
 type MatchSideId} from "./match-sides.js";
import {isBookableMatchFinish} from "../simulation/legacy/match-finishes.js";
import {normalizeMatchStyle} from "../simulation/legacy/match-style.js";
import {readBookedInterference} from "../simulation/legacy/match-interference.js";

const intents=new Set(["COMPETITIVE","SHOWCASE","DOMINANT","TECHNICAL",
 "HIGH_RISK","STORY","PROTECTIVE","EPIC"]);
const multiFinishes=new Set(["CLEAN_PIN","FLASH_PIN","SUBMISSION","PROTECTED_FINISH"]);
export interface BookableMatch {
 matchType:"SINGLES"|"TAG"|"BATTLE_ROYAL";
 family:"INDIVIDUAL"|"TEAMS";
 sides:{sideId:MatchSideId;participants:{personId:string;contractId:string}[]}[];
 participants:{personId:string;contractId:string}[];
 scriptedWinnerSide:MatchSideId;
 scriptedWinner?:string;
 ruleset?:"ELIMINATION";
 eliminationOrder?:MatchSideId[];
 plannedFinish:string;
 plannedLengthMinutes:number;
 intent:string;
 championshipId?:string;
 interference?:unknown;
 style?:unknown;
 cheatingWrestlerId?:string;
}
export function normalizeBookableMatch(input:unknown):BookableMatch{
 if(!input||typeof input!=="object"||Array.isArray(input))
  throw new Error("Invalid authored match");
 const raw=input as Record<string,unknown>;
 const layout=readCanonicalMatchLayout(raw);
 const format=requireSupportedScoringLayout(layout);
 if(layout.participants.some(p=>p.personId.length>200||p.contractId.length>200))
  throw new Error("Invalid contracted wrestler identity");
 const length=raw.plannedLengthMinutes??(format==="BATTLE_ROYAL"?30:18);
 if(typeof length!=="number"||!Number.isInteger(length)||length<3||length>60)
  throw new Error("Match minutes must be between 3 and 60");
 const intent=raw.intent??"COMPETITIVE";
 if(typeof intent!=="string"||!intents.has(intent))
  throw new Error("Invalid match intent");
 const finish=raw.plannedFinish??(format==="BATTLE_ROYAL"?
  "OVER_THE_TOP_ROPE":"CLEAN_PIN");
 if(typeof finish!=="string"||!(format==="BATTLE_ROYAL"?
  finish==="OVER_THE_TOP_ROPE":format==="TRIPLE_THREAT"||format==="FOUR_WAY"?
  multiFinishes.has(finish):isBookableMatchFinish(finish)))
  throw new Error("Unsupported authored match finish");
 if((format!=="SINGLES"&&format!=="TAG")&&
  (raw.interference!==undefined||raw.style!==undefined||
   raw.cheatingWrestlerId!==undefined))
  throw new Error("Multi-side spots and styles need dedicated booking rules");
 if(format==="TAG"&&raw.style!==undefined)
  throw new Error("Tag styles not supported by scoring");
 if(raw.championshipId!==undefined&&
  (typeof raw.championshipId!=="string"||!raw.championshipId||
   raw.championshipId.length>200||format==="MULTI_TEAM"||
   format==="BATTLE_ROYAL"||
   (format==="TAG"&&layout.sides[0]!.participants.length!==2)))
  throw new Error("Unsupported championship format");
 const interference=raw.interference===undefined?null:readBookedInterference(raw);
 if(interference&&(layout.participants.some(p=>p.personId===interference.personId)||
  interference.plannedOutcome==="SUCCESS"&&interference.aidedSide!==layout.scriptedWinnerSide))
  throw new Error("Run-in must come from outside the match and successful help must support the winner");
 const winner=layout.sides.find(s=>s.sideId===layout.scriptedWinnerSide)!;
 const result:BookableMatch={
  family:layout.family,matchType:format==="BATTLE_ROYAL"?
   "BATTLE_ROYAL":layout.family==="TEAMS"?"TAG":"SINGLES",
  sides:layout.sides.map(s=>({sideId:s.sideId,
   participants:s.participants.map(p=>({...p}))})),
  participants:layout.participants.map(p=>({...p})),
  scriptedWinnerSide:layout.scriptedWinnerSide,
  ...(layout.family==="INDIVIDUAL"?{scriptedWinner:winner.participants[0]!.personId}:{}),
  ...(layout.ruleset==="ELIMINATION"?{
   ruleset:"ELIMINATION" as const,eliminationOrder:[...layout.eliminationOrder]}:{}),
  plannedFinish:finish,plannedLengthMinutes:length,intent,
  ...(raw.championshipId===undefined?{}:{championshipId:raw.championshipId as string}),
  ...(interference?{interference}:{}),
 };
 if(raw.style!==undefined)result.style=normalizeMatchStyle(raw.style as never);
 if(raw.cheatingWrestlerId!==undefined){
  const cheatingSide=finish==="FOREIGN_OBJECT"?layout.scriptedWinnerSide:
   finish==="DISQUALIFICATION"?
    layout.sides.find(s=>s.sideId!==layout.scriptedWinnerSide)!.sideId:null;
  if(format!=="SINGLES"||!cheatingSide||
   typeof raw.cheatingWrestlerId!=="string"||
   !layout.sides.find(s=>s.sideId===cheatingSide)!.participants.some(
    p=>p.personId===raw.cheatingWrestlerId))
   throw new Error("Choose the wrestler responsible for this finish");
  result.cheatingWrestlerId=raw.cheatingWrestlerId;
 }
 return result;
}
