/** Ref-based original programme semantics: two sides, one or two people/teams
 * per side, no self-feuds or symmetrical duplicate active rivalries.
 */
export interface ProgrammeRef {kind:"PERSON"|"TEAM";refId:string}
export interface ProgrammeSides {sideA:readonly ProgrammeRef[];sideB:readonly ProgrammeRef[]}
const valid=(s:unknown):s is string=>typeof s==="string"&&s.trim().length>0&&s.length<=200;
export function validateProgrammeSides(input:ProgrammeSides){
 if(!input||!Array.isArray(input.sideA)||!Array.isArray(input.sideB)||
  input.sideA.length<1||input.sideB.length<1||
  input.sideA.length>2||input.sideB.length>2)
  throw new Error("A programme needs one or two participants on each side");
 const refs=[...input.sideA,...input.sideB];
 for(const x of refs){
  if(!x||!["PERSON","TEAM"].includes(x.kind)||!valid(x.refId))
   throw new Error("Invalid programme participant");
 }
 const keys=refs.map(x=>x.kind+":"+x.refId);
 if(new Set(keys).size!==keys.length)
  throw new Error("Programme cannot use the same participant twice");
 return {sideA:input.sideA.map(x=>({...x})),sideB:input.sideB.map(x=>({...x}))};
}
export function programmeIdentity(input:ProgrammeSides):string{
 const sides=validateProgrammeSides(input);
 const canonical=(refs:readonly ProgrammeRef[])=>refs.map(r=>r.kind+":"+r.refId).sort().join("|");
 const a=canonical(sides.sideA),b=canonical(sides.sideB);
 return a<b?a+"<>"+b:b+"<>"+a;
}
