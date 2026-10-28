/** An idempotent operator-only top-up for testing the cosmetics shop.
 * The HTTP caller must have passed manualPlaytestEnabled and a signed CSRF check.
 * This module independently verifies that the operator controls a promotion in
 * the configured World; the client never supplies a target player or amount.
 */
import {withWorldTransaction,type TransactionPool} from "./transaction.js";
import {withSqlClient} from "./postgres.js";

const TARGET=50000;
export async function readPlaytestKp(pool:TransactionPool,worldId:string,playerId:string){
 if(!worldId||!playerId)throw new Error("Invalid playtest scope");
 return withSqlClient(pool,async tx=>{
  const rows=await tx.query<{balance:string;granted:boolean}>(`
   SELECT COALESCE(w.balance,0)::text AS balance,
    EXISTS(SELECT 1 FROM ppw_kp_playtest_grants g
      WHERE g.world_id=$1 AND g.player_id=$2) AS granted
   FROM ppw_promotion_controls c
   JOIN ppw_memberships m ON m.world_id=c.world_id
    AND m.player_id=c.player_id AND m.status='ACTIVE'
   LEFT JOIN ppw_kp_wallets w ON w.player_id=c.player_id
   WHERE c.world_id=$1 AND c.player_id=$2 AND c.active LIMIT 1`,[worldId,playerId]);
  if(rows.length!==1)throw new Error("An active promotion owner is required");
  return {balance:Number(rows[0]!.balance),granted:rows[0]!.granted,target:TARGET};
 });
}
export async function grantPlaytestKp(pool:TransactionPool,worldId:string,playerId:string){
 if(!worldId||!playerId)throw new Error("Invalid playtest scope");
 return withWorldTransaction(pool,async tx=>{
  const controls=await tx.query<{player_id:string}>(`
   SELECT c.player_id FROM ppw_promotion_controls c
   JOIN ppw_memberships m ON m.world_id=c.world_id
    AND m.player_id=c.player_id AND m.status='ACTIVE'
   WHERE c.world_id=$1 AND c.player_id=$2 AND c.active LIMIT 1`,[worldId,playerId]);
  if(controls.length!==1)throw new Error("An active promotion owner is required");
  await tx.query("INSERT INTO ppw_kp_wallets(player_id) VALUES($1) ON CONFLICT DO NOTHING",[playerId]);
  const current=await tx.query<{balance:string}>(`
   SELECT balance::text FROM ppw_kp_wallets WHERE player_id=$1 FOR UPDATE`,[playerId]);
  const balance=Number(current[0]?.balance);
  if(!Number.isSafeInteger(balance)||balance<0)throw new Error("Invalid wallet");
  const receipt=await tx.query<{amount:string}>(`
   SELECT amount::text FROM ppw_kp_playtest_grants
   WHERE world_id=$1 AND player_id=$2`,[worldId,playerId]);
  if(receipt.length)return {balance,credited:0,alreadyGranted:true,target:TARGET};
  const credited=Math.max(0,TARGET-balance);
  await tx.query(`
   INSERT INTO ppw_kp_playtest_grants(world_id,player_id,previous_balance,amount)
   VALUES($1,$2,$3,$4)`,[worldId,playerId,balance,credited]);
  if(credited)await tx.query(`
   UPDATE ppw_kp_wallets
   SET balance=balance+$2,lifetime_earned=lifetime_earned+$2
   WHERE player_id=$1`,[playerId,credited]);
  return {balance:balance+credited,credited,alreadyGranted:false,target:TARGET};
 });
}
