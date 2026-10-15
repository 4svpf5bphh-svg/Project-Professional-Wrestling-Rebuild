import type { SqlRows } from "./world-operations.js";
import { applyWorldCommand, type CommandResult } from "./world-commands.js";
import type { TransactionPool } from "./transaction.js";

export interface JoinWorldInput {
  worldId: string;
  playerId: string;
  requestId: string;
  expectedRevision: number;
}

/** The player identity is authenticated by the API layer; never trust a
 * playerId supplied by an untrusted browser request without verification.
 * Joining creates no promotion claim and confers no scheduling advantage.
 */
export async function joinWorld(
  pool: TransactionPool, input: JoinWorldInput,
): Promise<CommandResult<{joined:boolean}>> {
  return applyWorldCommand(pool,{
    ...input, commandType:"JOIN_WORLD",
    async execute(tx:SqlRows) {
      await tx.query("INSERT INTO ppw_players(player_id) VALUES ($1) ON CONFLICT DO NOTHING",[input.playerId]);
      const rows=await tx.query<{status:string}>(
        "SELECT status FROM ppw_memberships WHERE world_id=$1 AND player_id=$2",
        [input.worldId,input.playerId],
      );
      if (rows.length) {
        if (rows[0]!.status !== "ACTIVE") throw new Error("Inactive membership requires explicit reactivation");
        return {joined:false};
      }
      await tx.query(
        "INSERT INTO ppw_memberships(world_id,player_id,status) VALUES ($1,$2,'ACTIVE')",
        [input.worldId,input.playerId],
      );
      return {joined:true};
    },
  });
}
