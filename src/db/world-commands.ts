import type { SqlRows } from "./world-operations.js";
import { withWorldTransaction, type TransactionPool } from "./transaction.js";

export interface WorldCommand<T> {
  worldId: string;
  playerId: string;
  requestId: string;
  commandType: string;
  expectedRevision: number;
  execute(tx: SqlRows, revision: number): Promise<T>;
}
export type CommandResult<T> =
  | { status: "APPLIED"; revision: number; result: T }
  | { status: "REPLAYED"; revision: number; result: T }
  | { status: "STALE"; revision: number };

function assertCommand<T>(command: WorldCommand<T>): void {
  if (![command.worldId, command.playerId, command.requestId, command.commandType].every(s => s && s.length <= 200)) {
    throw new Error("Invalid command identity");
  }
  if (!Number.isSafeInteger(command.expectedRevision) || command.expectedRevision < 0) throw new Error("Invalid expected revision");
}

/** A single World lock serializes commands. Receipt lookup comes before stale
 * revision rejection so a retried successful request can return its result.
 * The caller must supply a stable requestId for retries.
 */
export async function applyWorldCommand<T>(pool: TransactionPool, command: WorldCommand<T>): Promise<CommandResult<T>> {
  assertCommand(command);
  return withWorldTransaction(pool, async tx => {
    const worlds = await tx.query<{ revision: string | number }>(
      "SELECT revision FROM ppw_worlds WHERE world_id=$1 FOR UPDATE", [command.worldId],
    );
    if (worlds.length !== 1) throw new Error("World not found");
    const revision = Number(worlds[0]!.revision);
    if (!Number.isSafeInteger(revision)) throw new Error("Invalid World revision");
    const receipts = await tx.query<{ player_id: string; command_type: string; committed_revision: string | number; result: T }>(
      "SELECT player_id,command_type,committed_revision,result FROM ppw_command_receipts WHERE world_id=$1 AND request_id=$2",
      [command.worldId,command.requestId],
    );
    if (receipts.length) {
      const prior = receipts[0]!;
      if (prior.player_id !== command.playerId || prior.command_type !== command.commandType) throw new Error("Request ID collision");
      return { status: "REPLAYED", revision: Number(prior.committed_revision), result: prior.result };
    }
    if (revision !== command.expectedRevision) return { status: "STALE", revision };
    const result = await command.execute(tx, revision);
    const next = revision + 1;
    if (!Number.isSafeInteger(next)) throw new Error("World revision overflow");
    await tx.query("UPDATE ppw_worlds SET revision=$2 WHERE world_id=$1", [command.worldId,next]);
    await tx.query(
      "INSERT INTO ppw_command_receipts(world_id,request_id,player_id,command_type,result,committed_revision) VALUES ($1,$2,$3,$4,$5::jsonb,$6)",
      [command.worldId,command.requestId,command.playerId,command.commandType,JSON.stringify(result),next],
    );
    return { status: "APPLIED", revision: next, result };
  });
}
