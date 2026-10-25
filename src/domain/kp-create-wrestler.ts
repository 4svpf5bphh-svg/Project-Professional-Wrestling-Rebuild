/** Restricted creative choices for a player-authored rookie.
 * Changing a character's identity never changes their fixed prospect stats.
 */
import {WRESTLING_STYLES,validatePortablePersona}
 from "./portable-persona.js";
import {gimmickUsableBy,GIMMICK_CATALOG} from "../content/gimmick-catalog.js";
import type {PortablePersona,MoveCategory} from "./portable-identity-types.js";

export const KP_CREATE_STYLES=WRESTLING_STYLES;
export const KP_CREATE_GIMMICKS=[
 "AUTHENTIC","HERO","VILLAIN","FAN_FAVOURITE","UNDERDOG","ANTI_HERO",
 "BULLY","COWARDLY_HEEL","OPPORTUNIST","REDEMPTION_SEEKER",
 "FAMILY_DYNASTY","YOUNG_LION","CHAOS_AGENT"
] as const;
export const KP_CREATE_ALIGNMENTS=["FACE","HEEL","TWEENER"] as const;
export type KpCreateStyle=typeof KP_CREATE_STYLES[number];
export type KpCreateGimmick=typeof KP_CREATE_GIMMICKS[number];
export type KpCreateAlignment=typeof KP_CREATE_ALIGNMENTS[number];
export interface KpCreatedIdentity{
 name:string;division:"MEN"|"WOMEN";primaryStyle:KpCreateStyle;
 gimmickId:KpCreateGimmick;alignment:KpCreateAlignment;
 signatureMove:string;finishingMove:string;
}
function textName(v:unknown,kind:string,min:number,max:number):string{
 if(typeof v!=="string")throw new Error("Invalid "+kind);
 const cleaned=v.trim().replace(/\s+/g," ");
 if(cleaned.length<min||cleaned.length>max||/[<>{}\u0000-\u001f]/u.test(cleaned))
  throw new Error("Invalid "+kind+" length or characters");
 return cleaned;
}
export function validateKpCreatedIdentity(input:KpCreatedIdentity):KpCreatedIdentity{
 if(!input||typeof input!=="object")throw new Error("Invalid new wrestler identity");
 const name=textName(input.name,"wrestler name",3,48);
 if(!/^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u.test(name))
  throw new Error("Invalid wrestler name");
 if(!["MEN","WOMEN"].includes(input.division))throw new Error("Invalid wrestling division");
 if(!KP_CREATE_STYLES.includes(input.primaryStyle))throw new Error("Invalid wrestling style");
 if(!KP_CREATE_GIMMICKS.includes(input.gimmickId)||
  !GIMMICK_CATALOG.some(x=>x.id===input.gimmickId)||
  !gimmickUsableBy(input.gimmickId,name))
  throw new Error("Use a generic character, not another wrestler's unique persona");
 if(!KP_CREATE_ALIGNMENTS.includes(input.alignment))throw new Error("Invalid ring alignment");
 const signatureMove=textName(input.signatureMove,"signature move",3,70);
 const finishingMove=textName(input.finishingMove,"finishing move",3,70);
 if(signatureMove.toLocaleLowerCase("en-GB")===finishingMove.toLocaleLowerCase("en-GB"))
  throw new Error("Signature and finishing moves must have different names");
 return {name,division:input.division,primaryStyle:input.primaryStyle,
  gimmickId:input.gimmickId,alignment:input.alignment,signatureMove,finishingMove};
}
function category(style:KpCreateStyle):MoveCategory{
 switch(style){
  case "STRIKER":return "STRIKE";
  case "HIGH_FLYER":case "LUCHA":return "AERIAL";
  case "POWERHOUSE":return "POWER";
  case "SUBMISSION":return "SUBMISSION";
  case "TECHNICAL":case "BRAWLER":case "STRONG_STYLE":return "GRAPPLE";
  default:return "OTHER";
 }
}
export function createKpWrestlerPersona(input:KpCreatedIdentity):PortablePersona{
 const v=validateKpCreatedIdentity(input);
 return validatePortablePersona({
  personaName:v.name,gimmickId:v.gimmickId,primaryStyle:v.primaryStyle,
  secondaryStyle:null,
  signatureMoves:[{name:v.signatureMove,category:category(v.primaryStyle),source:"PPW_AUTHORED"}],
  finishingMoves:[{name:v.finishingMove,category:category(v.primaryStyle),source:"PPW_AUTHORED"}],
  source:"GAME_AUTHORED"
 },v.name);
}
export const kpWrestlerCreateOptions={
 styles:KP_CREATE_STYLES.map(value=>({id:value,label:value.replaceAll("_"," ").toLowerCase()
  .replace(/(^|\s)\S/g,c=>c.toUpperCase())})),
 gimmicks:GIMMICK_CATALOG.filter(x=>
  KP_CREATE_GIMMICKS.some(id=>id===x.id)).map(x=>({id:x.id,label:x.label})),
 alignments:KP_CREATE_ALIGNMENTS
};
