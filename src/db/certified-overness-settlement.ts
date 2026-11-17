/** One bounded SQL write for the participants of one certified show.
 * Called ONLY after successful completed-show insert within the same locked
 * World transaction. A retry never reaches this path; no extra ledger or
 * table is needed. Reading a roster or profile never updates overness.
 */
import type {SqlRows} from "./world-operations.js";
import type {EarnedOvernessChange} from "../domain/certified-overness.js";
export async function settleCertifiedTalentOvernessInTransaction(
 tx:SqlRows,worldId:string,changes:readonly EarnedOvernessChange[],
):Promise<number>{
 if(!worldId||worldId.length>200||changes.length>400||
  new Set(changes.map(x=>x.personId)).size!==changes.length||
  changes.some(x=>!x.personId||x.personId.length>200||
   !Number.isFinite(x.overnessDelta)||Math.abs(x.overnessDelta)>3.5||
   !Number.isFinite(x.gimmickDelta)||Math.abs(x.gimmickDelta)>3.5))
  throw new Error("Invalid certified overness settlement");
 if(changes.length===0)return 0;
 const rows=await tx.query<{person_id:string}>(String.raw`
  UPDATE ppw_people person SET
   overness=LEAST(100,GREATEST(0,ROUND((
    COALESCE(person.overness,
     COALESCE(person.popularity,50)*0.55+
     COALESCE(person.momentum,50)*0.45)+earned.overness_delta
   )::numeric,2)))::double precision,
   gimmick_reception=LEAST(100,GREATEST(0,ROUND((
    COALESCE(person.gimmick_reception,50)+earned.gimmick_delta
   )::numeric,2)))::double precision
  FROM jsonb_to_recordset($2::jsonb) AS earned(
   person_id text,overness_delta double precision,
   gimmick_delta double precision)
  WHERE person.world_id=$1 AND person.person_id=earned.person_id
  RETURNING person.person_id
 `,[worldId,JSON.stringify(changes.map(x=>({
  person_id:x.personId,overness_delta:x.overnessDelta,
  gimmick_delta:x.gimmickDelta
 })))]);
 if(rows.length!==changes.length)
  throw new Error("Certified overness performer missing; roll back World");
 return rows.length;
}
