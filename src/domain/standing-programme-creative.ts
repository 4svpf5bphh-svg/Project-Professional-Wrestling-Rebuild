import type {BookableMatch} from "./bookable-match.js";
export type StandingOutcome="WIN_ONLY"|"WIN_OR_PROTECTED_LOSS";
export interface StandingTerms{
 showId:string;slotId:string;personId:string;contractId:string;
 startWeekIndex:number;expiresWeekIndex:number;matchType:"SINGLES"|"TAG";
 permittedOutcome:StandingOutcome;ownPeople:readonly string[];
 opponentPeople:readonly string[];currentOwn:readonly string[];
 currentOpponents:readonly string[];approved:boolean;
}
const sorted=(ids:readonly string[])=>[...ids].sort().join("\u0001");
export function standingTermsCoverMatch(
 terms:StandingTerms,match:BookableMatch,weekIndex:number):boolean{
 if(!terms.approved||weekIndex<terms.startWeekIndex||
  weekIndex>=terms.expiresWeekIndex||
  sorted(terms.ownPeople)!==sorted(terms.currentOwn)||
  sorted(terms.opponentPeople)!==sorted(terms.currentOpponents)||
  match.sides.length!==2||
  (terms.matchType==="SINGLES"?
   match.family!=="INDIVIDUAL"||match.sides.some(x=>x.participants.length!==1):
   match.family!=="TEAMS"||match.sides.some(x=>x.participants.length!==2))||
  match.interference!==undefined)return false;
 const own=match.sides.find(x=>x.participants.some(p=>p.personId===terms.personId));
 if(!own)return false;
 const other=match.sides.find(x=>x.sideId!==own.sideId);
 if(!other||!own.participants.every(x=>terms.ownPeople.includes(x.personId))||
  !other.participants.every(x=>terms.opponentPeople.includes(x.personId)))
  return false;
 if(match.scriptedWinnerSide===own.sideId)return true;
 return terms.permittedOutcome==="WIN_OR_PROTECTED_LOSS"&&
  ["PROTECTED_FINISH","FLASH_PIN"].includes(match.plannedFinish);
}
