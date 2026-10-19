/** Server commands may be APPLIED while their *business outcome* is a
 * rejected promotion takeover. Never treat a write receipt as ownership.
 */
export function requireSuccessfulPromotionClaim(response:unknown):void{
 if(!response||typeof response!=="object"||Array.isArray(response))
  throw new Error("Promotion ownership could not be verified. Refresh World.");
 const r=response as Record<string,unknown>;
 if(r.status==="STALE")
  throw new Error("The World changed before your claim. Refresh available promotions.");
 if(r.status!=="APPLIED"&&r.status!=="REPLAYED")
  throw new Error("The company is not under your control. Refresh available promotions.");
 const outcome=r.result;
 if(!outcome||typeof outcome!=="object"||Array.isArray(outcome))
  throw new Error("Company ownership was not confirmed. Refresh available promotions.");
 const c=outcome as Record<string,unknown>;
 if(c.claimed===true)return;
 if(c.reason==="PROMOTION_TAKEN")
  throw new Error("Another manager may have taken this company. Refresh the available promotions.");
 if(c.reason==="PLAYER_HAS_PROMOTION")
  throw new Error("You already manage another promotion. Refresh the World.");
 if(c.reason==="NOT_MEMBER")
  throw new Error("Join the World before taking over a promotion.");
 throw new Error("The company was not assigned to you. Refresh available promotions.");
}
