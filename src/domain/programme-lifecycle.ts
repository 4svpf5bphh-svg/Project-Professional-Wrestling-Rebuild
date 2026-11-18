/** Original PPW rivalry identities remain symmetric and unchanged.
 * Creative Programme formats additionally support a solo road, a genuine
 * relationship/mentor story and a multi-person faction without inventing an
 * opposing side or modifying the original match/settlement rules.
 */
export interface ProgrammeRef{kind:"PERSON"|"TEAM";refId:string}
export interface ProgrammeSides{
 sideA:readonly ProgrammeRef[];sideB:readonly ProgrammeRef[]
}
export const PROGRAMME_FORMATS={
 RIVALRY:{label:"Rivalry",description:"Two opposing sides · singles, teams or groups",
  minimum:1,maximum:2},
 SOLO:{label:"Solo journey",description:"One wrestler's growth, reinvention or title pursuit",
  minimum:1,maximum:1},
 RELATIONSHIP:{label:"Relationship",description:"Two to four wrestlers · friendship, mentor or loyalty",
  minimum:2,maximum:4},
 FACTION:{label:"Faction story",description:"Three to five wrestlers · unity, ambition or a slow split",
  minimum:3,maximum:5}
} as const;
export type ProgrammeFormat=keyof typeof PROGRAMME_FORMATS;
export const validProgrammeFormat=(input:unknown):input is ProgrammeFormat=>
 typeof input==="string"&&Object.hasOwn(PROGRAMME_FORMATS,input);
const valid=(s:unknown):s is string=>typeof s==="string"&&s.trim().length>0&&s.length<=200;
export function validateProgrammeSides(input:ProgrammeSides,format:ProgrammeFormat="RIVALRY"){
 if(!validProgrammeFormat(format))throw new Error("Unknown Programme format");
 if(!input||!Array.isArray(input.sideA)||!Array.isArray(input.sideB))
  throw new Error("Invalid Programme cast");
 const rules=PROGRAMME_FORMATS[format];
 if(format==="RIVALRY"){
  if(input.sideA.length<1||input.sideB.length<1||
   input.sideA.length>2||input.sideB.length>2)
   throw new Error("A programme needs one or two participants on each side");
 }else if(input.sideA.length<rules.minimum||
  input.sideA.length>rules.maximum||input.sideB.length!==0)
  throw new Error(format==="SOLO"?"Solo journeys need one wrestler and no opponent":
   format==="RELATIONSHIP"?"Relationship stories need two to four wrestlers":
   "Faction stories need three to five wrestlers");
 const refs=[...input.sideA,...input.sideB];
 for(const x of refs){
  if(!x||!["PERSON","TEAM"].includes(x.kind)||!valid(x.refId))
   throw new Error("Invalid programme participant");
  if(format!=="RIVALRY"&&x.kind!=="PERSON")
   throw new Error("A non-rival story needs named individual wrestlers");
 }
 const keys=refs.map(x=>x.kind+":"+x.refId);
 if(new Set(keys).size!==keys.length)
  throw new Error("Programme cannot use the same participant twice");
 return {sideA:input.sideA.map(x=>({...x})),
  sideB:input.sideB.map(x=>({...x}))};
}
/** Preserve the existing rivalry unique keys for all saved Worlds. */
export function programmeIdentity(input:ProgrammeSides,
 format:ProgrammeFormat="RIVALRY"):string{
 const sides=validateProgrammeSides(input,format);
 const canonical=(refs:readonly ProgrammeRef[])=>
  refs.map(r=>r.kind+":"+r.refId).sort().join("|");
 const a=canonical(sides.sideA),b=canonical(sides.sideB);
 if(format!=="RIVALRY")return format+":"+a;
 return a<b?a+"<>"+b:b+"<>"+a;
}
