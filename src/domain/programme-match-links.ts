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

/** An explicitly attached story must feature at least one wrestler from that
 * active programme. A solo speech can advance a rivalry without both sides
 * being present, but unrelated cast cannot borrow another feud's momentum.
 */
export function validateProgrammeAngleLinks(
 angles:readonly {slotId:string;programmeId:string;personIds:readonly string[]}[],
 members:readonly ProgrammePersonSide[],
):void{
 if(angles.length>100||members.length>400)
  throw new Error("Programme angle input too large");
 const byProgramme=new Map<string,Set<string>>();
 for(const member of members){
  const people=byProgramme.get(member.programmeId)??new Set<string>();
  people.add(member.personId);byProgramme.set(member.programmeId,people);
 }
 const linkedSlots=new Set<string>();
 for(const angle of angles){
  if(!angle.slotId||!angle.programmeId||linkedSlots.has(angle.slotId))
   throw new Error("Invalid or repeated angle story link");
  linkedSlots.add(angle.slotId);
  const people=byProgramme.get(angle.programmeId);
  if(!people||!angle.personIds.some(id=>people.has(id)))
   throw new Error("Choose a wrestler from the linked rivalry before adding this angle");
 }
}
