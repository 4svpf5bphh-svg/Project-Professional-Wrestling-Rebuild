import { applyWorldCommand, type CommandResult } from "./world-commands.js";
import { claimPromotion, type ClaimOutcome } from "./world-operations.js";
import type { TransactionPool } from "./transaction.js";

export interface ClaimPromotionCommand {
  worldId: string;
  playerId: string;
  promotionId: string;
  requestId: string;
  expectedRevision: number;
}

/** Authenticated caller identity must be bound by the API, not trusted from
 * client JSON. A rejected claim is still an idempotent command receipt.
 */
export async function submitPromotionClaim(
  pool: TransactionPool, input: ClaimPromotionCommand,
): Promise<CommandResult<ClaimOutcome>> {
  if (!input.promotionId || input.promotionId.length > 200) throw new Error("Invalid promotion");
  return applyWorldCommand(pool, {
    worldId:input.worldId,
    playerId:input.playerId,
    requestId:input.requestId,
    expectedRevision:input.expectedRevision,
    commandType:"CLAIM_PROMOTION",
    execute:tx=>claimPromotion(tx,input.worldId,input.playerId,input.promotionId),
  });
}
