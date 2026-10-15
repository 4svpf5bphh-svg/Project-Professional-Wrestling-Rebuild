/** Transaction boundary for server-authoritative World commands.
 * All calls use a single acquired connection. Never use independent pooled
 * queries for the lock and subsequent writes.
 */
import type { SqlRows } from "./world-operations.js";

export interface TransactionConnection extends SqlRows {
  release(): void;
}
export interface TransactionPool {
  connect(): Promise<TransactionConnection>;
}

export async function withWorldTransaction<T>(
  pool: TransactionPool,
  work: (tx: SqlRows) => Promise<T>,
): Promise<T> {
  const connection = await pool.connect();
  let began = false;
  try {
    await connection.query("BEGIN", []);
    began = true;
    const result = await work(connection);
    await connection.query("COMMIT", []);
    began = false;
    return result;
  } catch (error) {
    if (began) {
      try {
        await connection.query("ROLLBACK", []);
      } catch (rollbackError) {
        throw new AggregateError([error, rollbackError], "World transaction and rollback both failed");
      }
    }
    throw error;
  } finally {
    connection.release();
  }
}
