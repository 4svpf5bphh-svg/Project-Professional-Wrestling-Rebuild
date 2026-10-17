/** A successful, player-authored segment affects only explicitly linked,
 * active promotion programmes. Does not invent stable membership changes,
 * contract acceptances or a turn direction. No World-wide scans.
 */
import type {SqlRows} from "./world-operations.js";
import type {CompletedShowReceipt} from "../domain/completed-show-receipt.js";
export async function settleCanonicalSegmentProgrammeEffects(
 tx:SqlRows,input:{worldId:string;promotionId:string;showId:string},
 receipt:CompletedShowReceipt,
):Promise<{programmes:number;activities:number}>{
 const successes=receipt.segments.filter(s=>s.outcome==="HAPPENS");
 if(!successes.length)return {programmes:0,activities:0};
 const bySlot=new Map(successes.map(s=>[s.slotId,s.crowdResponse]));
 const links=await tx.query<{programme_id:string;slot_id:string}>(\`
  SELECT a.programme_id,a.slot_id FROM ppw_programme_match_activities a
  JOIN ppw_programmes p ON p.world_id=a.world_id
   AND p.promotion_id=a.promotion_id AND p.programme_id=a.programme_id
  WHERE a.world_id=$1 AND a.promotion_id=$2 AND a.draft_id=$3
   AND a.kind='SEGMENT' AND a.slot_id=ANY($4::text[])
   AND p.status='ACTIVE' ORDER BY a.programme_id,a.slot_id LIMIT 1001\`,
  [input.worldId,input.promotionId,input.showId,[...bySlot.keys()]]);
 if(links.length>1000)throw new Error("Excess linked programme activities");
 const changes=new Map<string,{delta:number;count:number}>();
 for(const link of links){
  const crowd=bySlot.get(link.slot_id);
  if(crowd===undefined)throw new Error("Unknown resolved programme activity");
  const prior=changes.get(link.programme_id)??{delta:0,count:0};
  // Only audience reception is simulated. The authored angle still happens.
  prior.delta+=Math.max(-2,Math.min(3,(crowd-50)/22));
  prior.count++;
  changes.set(link.programme_id,prior);
 }
 if(!changes.size)return {programmes:0,activities:0};
 const rows=[...changes].map(([programme_id,c])=>({
  programme_id,delta:Math.round(c.delta*100)/100,count:c.count}));
 const updated=await tx.query<{programme_id:string}>(\`
  UPDATE ppw_programmes p SET
   heat=CASE WHEN p.heat IS NULL THEN NULL
     ELSE LEAST(100,GREATEST(0,p.heat+x.delta)) END,
   repetition=LEAST(100000,p.repetition+x.activity_count)
  FROM jsonb_to_recordset($3::jsonb) AS x(
   programme_id text,delta double precision,activity_count integer)
  WHERE p.world_id=$1 AND p.promotion_id=$2 AND p.programme_id=x.programme_id
   AND p.status='ACTIVE' RETURNING p.programme_id\`,
  [input.worldId,input.promotionId,JSON.stringify(rows.map(x=>({
   programme_id:x.programme_id,delta:x.delta,activity_count:x.count})))]);
 if(updated.length!==changes.size)throw new Error("Programme changed during angle resolution");
 return {programmes:updated.length,activities:links.length};
}
