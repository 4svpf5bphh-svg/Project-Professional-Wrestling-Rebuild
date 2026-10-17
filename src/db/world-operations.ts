/** Minimal persistence surface: no aggregate loading and no hidden reads. */
export interface SqlRows {
  query<T extends Record<string, unknown>>(sql: string, params: readonly unknown[]): Promise<readonly T[]>;
}
export interface WorldInput { id: string; name: string; seed: number; rulesetVersion: string }
export interface PromotionInput { id: string; name: string; tier: string }
export interface ClaimOutcome { claimed: boolean; reason?: "PLAYER_HAS_PROMOTION" | "PROMOTION_TAKEN" | "NOT_MEMBER" }

export async function createWorld(sql: SqlRows, world: WorldInput): Promise<void> {
  if (!world.id || !world.name || !Number.isSafeInteger(world.seed)) throw new Error("invalid World");
  await sql.query("INSERT INTO ppw_worlds(world_id,name,seed,ruleset_version) VALUES ($1,$2,$3,$4)", [world.id,world.name,world.seed,world.rulesetVersion]);
}

export async function addPromotion(sql: SqlRows, worldId: string, promotion: PromotionInput): Promise<void> {
  await sql.query("INSERT INTO ppw_promotions(world_id,promotion_id,name,tier) VALUES ($1,$2,$3,$4)", [worldId,promotion.id,promotion.name,promotion.tier]);
}

/** Caller must wrap this entire function in a DB transaction. The World row
 * lock serializes claims and protects uniqueness across simultaneous players. */
export async function claimPromotion(
  sql: SqlRows, worldId: string, playerId: string, promotionId: string,
): Promise<ClaimOutcome> {
  const lock = await sql.query<{ world_id: string }>(
    "SELECT world_id FROM ppw_worlds WHERE world_id=$1 FOR UPDATE", [worldId],
  );
  if (lock.length !== 1) throw new Error("World not found");
  const membership = await sql.query<{ player_id: string }>(
    "SELECT player_id FROM ppw_memberships WHERE world_id=$1 AND player_id=$2 AND status='ACTIVE'",
    [worldId,playerId],
  );
  if (!membership.length) return { claimed: false, reason: "NOT_MEMBER" };
  const existing = await sql.query<{ player_id: string; promotion_id: string }>(
    "SELECT player_id,promotion_id FROM ppw_promotion_controls WHERE world_id=$1 AND active=true AND (player_id=$2 OR promotion_id=$3)",
    [worldId,playerId,promotionId],
  );
  if (existing.some(row => row.player_id === playerId)) return { claimed:false, reason:"PLAYER_HAS_PROMOTION" };
  if (existing.length) return { claimed:false, reason:"PROMOTION_TAKEN" };
  const result = await sql.query<{ promotion_id: string }>(
    "INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id) SELECT $1,$2,promotion_id FROM ppw_promotions WHERE world_id=$1 AND promotion_id=$3 AND takeover_eligibility='STANDARD' AND lifecycle='ACTIVE' RETURNING promotion_id",
    [worldId,playerId,promotionId],
  );
  if (!result.length) throw new Error("Promotion not found");
  return { claimed:true };
}
