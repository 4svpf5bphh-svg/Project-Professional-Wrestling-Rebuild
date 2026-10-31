/** Stable, compact signature for certified feud repetition.
 * A verbal confrontation and an attack are different story chapters even
 * with identical wrestlers. Exactly repeating an angle can still grow stale.
 * MATCH signatures retain their original byte shape for historic continuity.
 */
import {createHash} from "node:crypto";
import {SEGMENT_BOOKING_RULES} from "./segment-booking.js";

export function certifiedProgrammeBeatSignature(input:{
 kind:"MATCH"|"SEGMENT";personIds:readonly string[];payload:unknown
}):string{
 const ids=[...new Set(input.personIds)].sort();
 if(ids.length===0||ids.length>30||ids.some(x=>!x||x.length>200))
  throw new Error("Invalid certified programme participants");
 let category:string=input.kind;
 if(input.kind==="SEGMENT"){
  if(!input.payload||typeof input.payload!=="object"||Array.isArray(input.payload))
   throw new Error("Missing certified angle identity");
  const angle=(input.payload as {kind?:unknown}).kind;
  if(typeof angle!=="string"||
     !Object.prototype.hasOwnProperty.call(SEGMENT_BOOKING_RULES,angle))
   throw new Error("Unknown certified angle kind");
  category+=":"+angle;
 }
 return category+":"+
  createHash("sha256").update(JSON.stringify(ids)).digest("hex");
}
