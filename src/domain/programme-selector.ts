/** Local conflict rules for the Programme composer.
 * Team membership comes from the already fetched authenticated workspace.
 * The authoritative server repeats the validation before creating a rivalry.
 */
import type {ProgrammeRef} from "./programme-lifecycle.js";
export function participants(ref:ProgrammeRef,
 teams:ReadonlyMap<string,readonly string[]>):readonly string[]{
 return ref.kind==="PERSON"?[ref.refId]:teams.get(ref.refId)??[];
}
export function programmeOverlaps(refs:readonly ProgrammeRef[],
 teams:ReadonlyMap<string,readonly string[]>):boolean{
 const known=new Set<string>();
 for(const ref of refs)for(const id of participants(ref,teams)){
  if(known.has(id))return true;
  known.add(id);
 }
 return false;
}
export function availableProgrammeOption(candidate:ProgrammeRef,
 otherSelections:readonly ProgrammeRef[],
 teams:ReadonlyMap<string,readonly string[]>):boolean{
 const occupied=new Set(otherSelections.flatMap(x=>[...participants(x,teams)]));
 return participants(candidate,teams).every(id=>!occupied.has(id));
}
