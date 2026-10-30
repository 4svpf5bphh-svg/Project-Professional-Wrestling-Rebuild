/** Certified, as-of-show wrestling programme context. The joined activity
 * record is authoritative. Previous meetings are limited to the preceding
 * twelve World weeks, not future results or an inferred storyline outcome.
 */
export interface VerifiedProgrammeBroadcast{
 programmeId:string;sideA:string;sideB:string;
 precedingMatches:number;precedingAngles:number;
 previousWinner:"A"|"B"|null;previousMatchWeek:number|null;
 currentWinner:"A"|"B"|null;
}
type RawProgramme={
 programmeId?:unknown;sideA?:unknown;sideB?:unknown;
 precedingMatches?:unknown;precedingAngles?:unknown;
 previousWinner?:unknown;previousMatchWeek?:unknown;currentWinner?:unknown;
};
export function parseVerifiedProgrammeBroadcast(raw:unknown):VerifiedProgrammeBroadcast{
 if(raw===null||typeof raw!=="object"||Array.isArray(raw))
  throw new Error("Invalid settled programme context");
 const p=raw as RawProgramme;
 const name=(x:unknown)=>typeof x==="string"&&x.length>0&&x.length<=300;
 const count=(x:unknown)=>typeof x==="number"&&Number.isSafeInteger(x)&&x>=0&&x<=500;
 const side=(x:unknown)=>x===null||x===undefined||x==="A"||x==="B";
 const week=(x:unknown)=>x===null||x===undefined||
  (typeof x==="number"&&Number.isSafeInteger(x)&&x>=0);
 if(!name(p.programmeId)||!name(p.sideA)||!name(p.sideB)||
  !count(p.precedingMatches)||!count(p.precedingAngles)||
  !side(p.previousWinner)||!side(p.currentWinner)||!week(p.previousMatchWeek))
  throw new Error("Invalid settled programme context");
 return {programmeId:p.programmeId as string,sideA:p.sideA as string,
  sideB:p.sideB as string,precedingMatches:p.precedingMatches as number,
  precedingAngles:p.precedingAngles as number,
  previousWinner:(p.previousWinner??null) as "A"|"B"|null,
  previousMatchWeek:(p.previousMatchWeek??null) as number|null,
  currentWinner:(p.currentWinner??null) as "A"|"B"|null};
}
const week=(index:number)=>"Year "+(Math.floor(index/52)+1)+
 ", Week "+(index%52+1);
export function programmeBroadcastRecap(
 p:VerifiedProgrammeBroadcast,kind:"MATCH"|"SEGMENT",
):string{
 const pairing=p.sideA+" vs "+p.sideB;
 const history=p.precedingMatches;
 const past=history?(
  " They had already met "+history+" "+
  (history===1?"time":"times")+" in the previous twelve weeks"+
  (p.previousMatchWeek!==null?
   "; the latest was "+week(p.previousMatchWeek):"")+
  (p.previousWinner==="A"?", won by "+p.sideA:
   p.previousWinner==="B"?", won by "+p.sideB:"")+"."
 ):" They had no previous recorded match in the last twelve weeks.";
 if(kind==="SEGMENT"){
  return "A new on-screen chapter in "+pairing+"."+
   past+" The scene is confirmed, but its intended confrontation is not automatically a match result.";
 }
 const outcome=p.currentWinner==="A"?" This chapter went to "+p.sideA+".":
  p.currentWinner==="B"?" This chapter went to "+p.sideB+".":
  " This chapter has no confirmed winning side.";
 const other=p.precedingAngles?" "+p.precedingAngles+
  (p.precedingAngles===1?" on-screen chapter":" on-screen chapters")+
  " also developed the issue in that period.":"";
 return pairing+" renewed their rivalry."+past+other+outcome;
}
export function programmeManagementNote(
 programmes:readonly VerifiedProgrammeBroadcast[],
):string|null{
 if(!programmes.length)return null;
 const distinct=[...new Map(programmes.map(p=>[p.programmeId,p])).values()];
 const established=distinct.filter(p=>p.precedingMatches>0||p.precedingAngles>0);
 if(!established.length)
  return distinct.length===1?
   "One rivalry had its first recorded chapter tonight. Give the audience a reason to remember its next one.":
   "Several rivalries began new chapters tonight. A clear next step for each will matter more than repeating the same scene.";
 if(established.length===1){
  const p=established[0]!;
  return p.sideA+" and "+p.sideB+
   " have history behind tonight's chapter. Review the actual finish or angle before deciding their next confrontation.";
 }
 return String(established.length)+" ongoing rivalries moved on tonight. Keep their next beats distinct rather than giving every feud another straight rematch.";
}
