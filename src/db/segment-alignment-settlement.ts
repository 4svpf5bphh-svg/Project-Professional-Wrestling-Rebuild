
/** Perform only an expressly authored successful TURN with explicit direction.
 * World identity is portable; never invent a promotion-only alter ego.
 * The caller owns the World transaction, receipt, and idempotency boundary.
 */
import type {SqlRows} from "./world-operations.js";
import type {SegmentCrowdContext} from "../simulation/legacy/segment-crowd.js";
type Alignment="FACE"|"HEEL"|"TWEENER";
export async function settleCanonicalAuthoredTurns(
 tx:SqlRows,input:{worldId:string;promotionId:string;year:number;week:number},
 contexts:readonly SegmentCrowdContext[],
):Promise<{changed:number}>{
 const targets=contexts.flatMap(({segment})=>
  segment.kind==="TURN"&&segment.outcome==="HAPPENS"&&segment.turnTargetAlignment?
   [{personId:segment.actorIds[0]!,to:segment.turnTargetAlignment}]:[]);
 if(!targets.length)return {changed:0};
 if(targets.length>100||new Set(targets.map(t=>t.personId)).size!==targets.length)
  throw new Error("Multiple or excessive turns for the same wrestler");
 const ids=targets.map(x=>x.personId);
 const before=await tx.query<{person_id:string;default_alignment:Alignment|null}>(
  "SELECT person_id,default_alignment FROM ppw_people"+
  " WHERE world_id=$1 AND person_id=ANY($2::text[]) AND status='ACTIVE' FOR UPDATE",
  [input.worldId,ids]);
 if(before.length!==ids.length)throw new Error("Missing active wrestler for scripted turn");
 const byId=new Map(before.map(p=>[p.person_id,p.default_alignment]));
 const changes=targets.flatMap(t=>{
  if(!byId.has(t.personId))throw new Error("Unknown wrestler alignment baseline");
  const prior=byId.get(t.personId)!;
  return prior===t.to?[]:[{person_id:t.personId,
   prior_alignment:prior,next_alignment:t.to}];
 });
 if(!changes.length)return {changed:0};
 const updated=await tx.query<{person_id:string}>([
  "UPDATE ppw_people p SET default_alignment=x.next_alignment",
  "FROM jsonb_to_recordset($2::jsonb) AS x(",
  "person_id text,prior_alignment text,next_alignment text)",
  "WHERE p.world_id=$1 AND p.person_id=x.person_id AND p.status='ACTIVE'",
  "AND p.default_alignment IS NOT DISTINCT FROM x.prior_alignment",
  "RETURNING p.person_id"
 ].join(" "),[input.worldId,JSON.stringify(changes)]);
 if(updated.length!==changes.length)
  throw new Error("Scripted turn alignment changed during resolution");
 const logged=await tx.query<{person_id:string}>([
  "INSERT INTO ppw_promotion_alignment_changes",
  "(world_id,promotion_id,person_id,year,week,method,changed)",
  "SELECT $1,$2,x.person_id,$3,$4,'TURN',true",
  "FROM jsonb_to_recordset($5::jsonb) AS x(person_id text)",
  "RETURNING person_id"
 ].join(" "),[input.worldId,input.promotionId,input.year,input.week,
  JSON.stringify(changes.map(({person_id})=>({person_id})))]);
 if(logged.length!==changes.length)throw new Error("Incomplete scripted turn history");
 return {changed:changes.length};
}
