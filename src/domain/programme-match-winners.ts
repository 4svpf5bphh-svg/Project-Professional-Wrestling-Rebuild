/** Original feud result semantics: the match's A/B sides may be reversed. */
import type {ProgrammePersonSide,ProgrammeMatchInput} from "./programme-match-links.js";
export function programmeResultSide(
 match:ProgrammeMatchInput,participants:readonly ProgrammePersonSide[],
 programmeId:string,winnerSide:string|null,
):"A"|"B"|null{
 if(winnerSide===null)return null;
 if(winnerSide!=="A"&&winnerSide!=="B")
  throw new Error("Programme requires a two-sided resolved match");
 const members=participants.filter(x=>x.programmeId===programmeId);
 const a=new Set(members.filter(x=>x.side==="A").map(x=>x.personId));
 const b=new Set(members.filter(x=>x.side==="B").map(x=>x.personId));
 const subset=(ids:readonly string[],side:Set<string>)=>ids.length>0&&
  ids.every(id=>side.has(id));
 const direct=subset(match.sideA,a)&&subset(match.sideB,b);
 const reverse=subset(match.sideA,b)&&subset(match.sideB,a);
 if(direct===reverse)throw new Error("Ambiguous completed programme match sides");
 return winnerSide===(direct?"A":"B")?"A":"B";
}
