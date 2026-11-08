/** Player-confirmed reconciliation of old booked contract IDs with
 * already verified show-week rights. Never mutates the saved show.
 */
import type {EditorMatch} from "./card-editor-model.js";
import type {EditorSegment} from "./card-segment-model.js";
type Pick={personId:string;contractId:string};
type Eligible={personId:string;contractId:string|null};
export function reconcileDraftAgreements(
 matches:readonly EditorMatch[],segments:readonly EditorSegment[],
 eligible:readonly Eligible[]
){
 const current=new Map(eligible.filter((p):p is Pick=>
  Boolean(p.personId)&&typeof p.contractId==="string"&&Boolean(p.contractId))
  .map(p=>[p.personId,p.contractId] as const));
 const changed=new Set<string>();
 const refreshRunIn=(p:NonNullable<EditorMatch["interference"]>)=>{
  const contractId=current.get(p.personId);
  if(!contractId||contractId===p.contractId)return p;
  changed.add(p.personId);
  return {...p,contractId};
 };
 const refresh=(p:Pick):Pick=>{
  const contractId=current.get(p.personId);
  if(!contractId||contractId===p.contractId)return p;
  changed.add(p.personId);
  return {...p,contractId};
 };
 return {matches:matches.map(m=>({...m,
   teams:m.teams.map(side=>side.map(p=>p?refresh(p):null)),
   ...(m.interference?{interference:refreshRunIn(m.interference)}:{})
  })),
  segments:segments.map(s=>({...s,
   actors:s.actors.map(refresh),targets:s.targets.map(refresh)
  })),
  changedPersonIds:[...changed].sort()
 };
}
