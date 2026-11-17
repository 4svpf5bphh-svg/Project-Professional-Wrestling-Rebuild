/** Owner-authored intention is not a certified fact or a booked result. */
import {storyBlueprint} from "./story-blueprints.js";
export interface ProgrammeCreativeIntent{
 blueprintId:string;motivation:string;audienceGoal:string;destination:string;
}
const validText=(text:unknown):text is string=>
 typeof text==="string"&&text.length<=180&&
 !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text);
export function parseProgrammeCreativeIntent(value:unknown):ProgrammeCreativeIntent|null{
 if(value===null)return null;
 if(!value||typeof value!=="object"||Array.isArray(value))
  throw new Error("Story direction must be a supported object");
 const p=value as Record<string,unknown>;
 if(typeof p.blueprintId!=="string"||
  (p.blueprintId!=="CUSTOM"&&!storyBlueprint(p.blueprintId))||
  !validText(p.motivation)||!validText(p.audienceGoal)||
  !validText(p.destination))
  throw new Error("Choose a valid story blueprint and short, safe creative intentions");
 return {blueprintId:p.blueprintId,motivation:p.motivation.trim(),
  audienceGoal:p.audienceGoal.trim(),destination:p.destination.trim()};
}
export function defaultProgrammeCreativeIntent():ProgrammeCreativeIntent{
 return {blueprintId:"CUSTOM",motivation:"",audienceGoal:"",destination:""};
}
