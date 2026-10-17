/** Restore original PPW's automatic match-to-programme association.
 * A two-sided booked match fits only when both sides unambiguously belong
 * to the opposite sides of one active promotion-owned storyline.
 */
export interface ProgrammePersonSide{programmeId:string;personId:string;side:"A"|"B"}
export interface ProgrammeMatchInput{slotId:string;sideA:readonly string[];sideB:readonly string[]}
export interface ProgrammeMatchLink{slotId:string;programmeId:string}
export function inferProgrammeMatchLinks(
 matches:readonly ProgrammeMatchInput[],
 participants:readonly ProgrammePersonSide[],
):ProgrammeMatchLink[]{
 if(matches.length>100||participants.length>400)throw new Error("Programme link input too large");
 const story=new Map<string,{A:Set<string>;B:Set<string>}>();
 for(const person of participants){
  if(!person.programmeId||!person.personId||!["A","B"].includes(person.side))
   throw new Error("Invalid programme member");
  const sides=story.get(person.programmeId)??{A:new Set<string>(),B:new Set<string>()};
  sides[person.side].add(person.personId);story.set(person.programmeId,sides);
 }
 const seen=new Set<string>();
 const links:ProgrammeMatchLink[]=[];
 for(const match of matches){
  if(!match.slotId||seen.has(match.slotId))throw new Error("Duplicate match identity");
  seen.add(match.slotId);
  const a=new Set(match.sideA),b=new Set(match.sideB);
  if(!a.size||!b.size||a.size!==match.sideA.length||
   b.size!==match.sideB.length||[...a].some(x=>b.has(x)))
   throw new Error("Invalid bookable programme match");
  for(const [id,sides] of story){
   const subset=(people:Set<string>,allowed:Set<string>)=>
    [...people].every(id=>allowed.has(id));
   const direct=subset(a,sides.A)&&subset(b,sides.B);
   const reverse=subset(a,sides.B)&&subset(b,sides.A);
   if(direct!==reverse)links.push({slotId:match.slotId,programmeId:id});
  }
 }
 return links;
}
