import type { TransactionPool } from "./transaction.js";
import { withSqlClient } from "./postgres.js";

export interface TalentAvailability {
  id:string; name:string;
  exclusiveToPromotionId:string|null;
  signedContracts:number;
  signedNonExclusiveContracts:number;
}

/** Availability is an indexed, bounded read model, not an offer approval.
 * Caller must verify dates, term, promotion policy and creative terms before
 * signing. Exclusive conflicts require server-authoritative transactional checks.
 */
export async function listTalentAvailability(
  pool:TransactionPool,worldId:string,afterName:string|null=null,afterId:string|null=null,limit=25,
):Promise<TalentAvailability[]> {
  if (!Number.isSafeInteger(limit)||limit<1||limit>50) throw new Error("Invalid page size");
  if ((afterName===null)!==(afterId===null)) throw new Error("Both cursor fields required");
  return withSqlClient(pool,async tx=>{
    const rows=await tx.query<{
      person_id:string;name:string;exclusive_to:string|null;
      signed_contracts:string|number;nonexclusive_contracts:string|number;
    }>(
      `SELECT p.person_id,p.name,
        (SELECT c.promotion_id FROM ppw_contracts c
          WHERE c.world_id=p.world_id AND c.person_id=p.person_id
          AND c.status='SIGNED' AND c.family='EXCLUSIVE'
          ORDER BY c.contract_id LIMIT 1) AS exclusive_to,
        (SELECT count(*) FROM ppw_contracts c
          WHERE c.world_id=p.world_id AND c.person_id=p.person_id
          AND c.status='SIGNED') AS signed_contracts,
        (SELECT count(*) FROM ppw_contracts c
          WHERE c.world_id=p.world_id AND c.person_id=p.person_id
          AND c.status='SIGNED' AND c.family='LIMITED_NON_EXCLUSIVE') AS nonexclusive_contracts
       FROM ppw_people p
       WHERE p.world_id=$1 AND p.status='ACTIVE'
         AND ($2::text IS NULL OR (p.name,p.person_id)>($2::text,$3::text))
       ORDER BY p.name,p.person_id LIMIT $4`,
      [worldId,afterName,afterId,limit],
    );
    return rows.map(r=>({
      id:r.person_id,name:r.name,exclusiveToPromotionId:r.exclusive_to,
      signedContracts:Number(r.signed_contracts),
      signedNonExclusiveContracts:Number(r.nonexclusive_contracts),
    }));
  });
}
