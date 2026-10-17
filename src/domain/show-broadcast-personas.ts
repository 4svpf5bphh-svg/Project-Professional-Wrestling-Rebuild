/** Character flavour for a resolved show, never a simulation modifier.
 * A wrestler's established PPW gimmick and repertoire are factual profile
 * details, not evidence that an unbooked move actually happened.
 */
import {originalPersonaBaseline,validatePortablePersona}
 from "./portable-persona.js";
import type {PortablePersona} from "./portable-identity-types.js";
export interface BroadcastPerformer{
 personId:string;name:string;portableGimmickId:string|null;
 personaRecord:unknown|null;
}
export interface BroadcastIdentity{
 personId:string;ringName:string;character:string;
 style:string|null;signatureMoves:readonly string[];
 finishingMoves:readonly string[];source:"WORLD_RECORD"|"ROSTER_GUIDE";
}
export function projectBroadcastIdentities(
 people:readonly BroadcastPerformer[]):Map<string,BroadcastIdentity>{
 const out=new Map<string,BroadcastIdentity>();
 for(const person of people){
  if(out.has(person.personId))throw new Error("Duplicate wrestler on results profile");
  const p:PortablePersona=person.personaRecord==null?
   originalPersonaBaseline(person.name,person.portableGimmickId??null):
   validatePortablePersona(person.personaRecord,person.name);
  out.set(person.personId,{
   personId:person.personId,ringName:p.personaName,
   character:p.gimmickId.replaceAll("_"," "),
   style:p.primaryStyle,
   signatureMoves:p.signatureMoves.map(m=>m.name),
   finishingMoves:p.finishingMoves.map(m=>m.name),
   source:person.personaRecord==null?"ROSTER_GUIDE":"WORLD_RECORD",
  });
 }
 return out;
}
/** A nameplate is a character identity, not a claim about match action. */
export function broadcastNameplate(
 id:string,identities:ReadonlyMap<string,BroadcastIdentity>,
 fallback:string):string{
 const person=identities.get(id);
 if(!person)return fallback;
 return person.ringName===fallback?fallback:
  person.ringName+" ("+fallback+")";
}
