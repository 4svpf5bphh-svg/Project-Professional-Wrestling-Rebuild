/** Original 643-person PPW character guide is a read-only fallback.
 * One persistent persona is wrestler-owned. A promotion cannot silently
 * overwrite the shared identity just by changing a local on-screen profile.
 */
import {fullRealRosterIdentityFor} from "../content/full-real-roster-identity-guide.js";
import {alternatePersonaReferencesFor} from "../content/verified-alternate-personas.js";
import {GIMMICK_CATALOG,gimmickDefinition,gimmickUsableBy}
 from "../content/gimmick-catalog.js";
import type {PortablePersona,PortableIdentityMove} from "./portable-identity-types.js";
export const WRESTLING_STYLES=[
 "ALL_ROUNDER","TECHNICAL","BRAWLER","HIGH_FLYER","POWERHOUSE",
 "STRIKER","SUBMISSION","LUCHA","STRONG_STYLE",
] as const;
export function originalPersonaBaseline(
 name:string,existingGimmickId:string|null,
):PortablePersona{
 if(typeof name!=="string"||!name.trim()||name.length>200)
  throw new Error("Invalid wrestler identity name");
 const guide=fullRealRosterIdentityFor(name);
 const explicit=existingGimmickId!==null&&existingGimmickId.trim().length>0;
 const gimmickId=explicit?existingGimmickId:guide?.gimmickArchetype??"AUTHENTIC";
 const source:PortablePersona["source"]=explicit?"LEGACY_MIGRATED":
  guide?"ROSTER_APPROXIMATION":"UNCURATED_BASELINE";
 return {personaName:name,gimmickId,
  primaryStyle:guide?.primaryStyle??null,
  secondaryStyle:guide?.secondaryStyle??null,
  signatureMoves:guide?.signatureMoves.map(x=>({...x}))??[],
  finishingMoves:guide?.finishingMoves.map(x=>({...x}))??[],source};
}
const categories=new Set(["STRIKE","GRAPPLE","SUBMISSION","AERIAL","POWER","OTHER"]);
function normalizedMoves(input:unknown,name:string):PortableIdentityMove[]{
 if(!Array.isArray(input)||input.length>12)
  throw new Error("Invalid "+name+" repertoire");
 const moves=input.map(v=>{
  if(!v||typeof v!=="object"||Array.isArray(v))throw new Error("Invalid "+name);
  const m=v as Record<string,unknown>;
  if(typeof m.name!=="string"||!m.name.trim()||m.name.length>80||
   !categories.has(String(m.category))||
   (m.source!==undefined&&!["VERIFIED","PPW_AUTHORED"].includes(String(m.source))))
   throw new Error("Invalid "+name+" move");
  return {name:m.name.trim(),category:m.category as PortableIdentityMove["category"],
   ...(m.source?{source:m.source as PortableIdentityMove["source"]}:{})};
 });
 if(new Set(moves.map(x=>x.name.toLocaleLowerCase("en-GB"))).size!==moves.length)
  throw new Error("Duplicate "+name+" move");
 return moves;
}
export function validatePortablePersona(
 value:unknown,realName:string,
):PortablePersona{
 if(!value||typeof value!=="object"||Array.isArray(value))
  throw new Error("Portable character must be an object");
 const p=value as Record<string,unknown>;
 if(typeof p.personaName!=="string"||!p.personaName.trim()||p.personaName.length>60||
  typeof p.gimmickId!=="string"||!gimmickUsableBy(p.gimmickId,realName)||
  !GIMMICK_CATALOG.some(g=>g.id===p.gimmickId)||
  !(p.primaryStyle===null||WRESTLING_STYLES.includes(p.primaryStyle as typeof WRESTLING_STYLES[number]))||
  !(p.secondaryStyle===null||WRESTLING_STYLES.includes(p.secondaryStyle as typeof WRESTLING_STYLES[number]))||
  p.primaryStyle!==null&&p.primaryStyle===p.secondaryStyle||
  !["CURATED","NEGOTIATED","LEGACY_MIGRATED","UNCURATED_BASELINE",
    "GAME_AUTHORED","ROSTER_APPROXIMATION"].includes(String(p.source)))
  throw new Error("Invalid or wrestler-owned portable character");
 return {personaName:p.personaName.trim(),gimmickId:p.gimmickId,
  primaryStyle:p.primaryStyle as PortablePersona["primaryStyle"],
  secondaryStyle:p.secondaryStyle as PortablePersona["secondaryStyle"],
  signatureMoves:normalizedMoves(p.signatureMoves,"signature"),
  finishingMoves:normalizedMoves(p.finishingMoves,"finishing"),
  source:p.source as PortablePersona["source"]};
}
/** Menu/options are static and never query Neon. Named iconic characters are
 * visibly attached to their owner, rather than offered as generic templates.
 */
export function wrestlerIdentityReference(realName:string){
 return {
  archetypes:GIMMICK_CATALOG.filter(x=>gimmickUsableBy(x.id,realName)).map(x=>({
   id:x.id,label:x.label,family:x.family,familyLabel:x.familyLabel,
   description:x.description,
  })),
  documentedAlternates:alternatePersonaReferencesFor(realName).map(x=>({...x})),
 };
}
export function activePersonaHeading(p:PortablePersona):string{
 return p.personaName+" · "+gimmickDefinition(p.gimmickId).label;
}
