import pg from "pg";
import type { SqlRows } from "./world-operations.js";
import type { TransactionPool } from "./transaction.js";

/** Narrow adapter: each transaction pins one physical client.
 * Never log SQL parameters: they may contain private player data.
 */
export function postgresPool(connectionString: string, max = 4): { pool: TransactionPool; close(): Promise<void> } {
  if (!connectionString) throw new Error("Database connection string required");
  if (!Number.isSafeInteger(max) || max < 1 || max > 16) throw new Error("Invalid pool size");
  const raw = new pg.Pool({ connectionString, max, idleTimeoutMillis: 5000, connectionTimeoutMillis: 10000 });
  return {
    pool: {
      async connect() {
        const client = await raw.connect();
        return {
          async query<T extends Record<string, unknown>>(sql: string, params: readonly unknown[]) {
            const result = await client.query(sql, [...params]);
            return result.rows as T[];
          },
          release() { client.release(); },
        };
      },
    },
    close: () => raw.end(),
  };
}

/** For migrations/fixtures only; production commands use withWorldTransaction. */
export async function withSqlClient<T>(pool: TransactionPool, work: (db: SqlRows) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try { return await work(client); } finally { client.release(); }
}
