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
 // Non-rival narratives deliberately have no opposing Programme side.
 // An explicit show match still tells us whether a story character won or
 // lost against an outsider. Two story characters facing each other have no
 // Programme-side winner: their personal result remains in the match receipt.
 if(!b.size){
  const linkedA=match.sideA.some(id=>a.has(id));
  const linkedB=match.sideB.some(id=>a.has(id));
  if(linkedA===linkedB)return null;
  const won=winnerSide===(linkedA?"A":"B");
  return won?"A":"B";
 }
 const subset=(ids:readonly string[],side:Set<string>)=>ids.length>0&&
  ids.every(id=>side.has(id));
 const direct=subset(match.sideA,a)&&subset(match.sideB,b);
 const reverse=subset(match.sideA,b)&&subset(match.sideB,a);
 if(direct===reverse)throw new Error("Ambiguous completed programme match sides");
 return winnerSide===(direct?"A":"B")?"A":"B";
}

/** Match sides and programme sides are separate identities. Explicit solo,
 * relationship and faction links accept any supported canonical match field.
 * Keep the original rival-v-rival inference strict; only a non-rival cast
 * occupying a single competing side can earn a clear story win/loss.
 */
export function programmeResultSideForLayout(
 match:{slotId:string;sides:readonly {sideId:string;participants:readonly {personId:string}[]}[]},
 participants:readonly ProgrammePersonSide[],programmeId:string,winnerSide:string|null,
):"A"|"B"|null{
 const sides=match.sides;
 if(sides.length<2)throw new Error("Linked match must have competing sides");
 if(winnerSide!==null&&!sides.some(s=>s.sideId===winnerSide))
  throw new Error("Linked match winner is not a booked side");
 if(sides.length===2)return programmeResultSide({slotId:match.slotId,
  sideA:sides[0]!.participants.map(p=>p.personId),
  sideB:sides[1]!.participants.map(p=>p.personId)},participants,programmeId,winnerSide);
 const members=participants.filter(p=>p.programmeId===programmeId);
 if(members.some(p=>p.side==="B"))
  throw new Error("Rivalry links require two opposing match sides");
 const cast=new Set(members.map(p=>p.personId));
 const linked=sides.filter(s=>s.participants.some(p=>cast.has(p.personId)));
 if(winnerSide===null||linked.length!==1)return null;
 return linked[0]!.sideId===winnerSide?"A":"B";
}
