/** Player-authenticated, on-demand Legends Vault.
 * An unloaded Vault produces zero queries and no hidden progress polling.
 */
import {withSqlClient} from "./postgres.js";
import {withWorldTransaction,type TransactionPool} from "./transaction.js";
import {LEGENDS_CATALOGUE,LEGEND_TIER_PRICES} from "../domain/legends-catalogue.js";
import type {SqlRows} from "./world-operations.js";

export type LegendVaultScope={worldId:string;promotionId:string;playerId:string};
const valid=(s:string)=>typeof s==="string"&&s.length>0&&s.length<=200;
async function assertVaultMember(tx:SqlRows,s:LegendVaultScope){
 const rows=await tx.query<{year:number;week:number}>(`
  SELECT w.year,w.week FROM ppw_worlds w
  JOIN ppw_promotion_controls c ON c.world_id=w.world_id
   AND c.player_id=$2 AND c.promotion_id=$3 AND c.active
  JOIN ppw_memberships m ON m.world_id=w.world_id AND m.player_id=c.player_id
   AND m.status='ACTIVE'
  JOIN ppw_promotions p ON p.world_id=w.world_id AND p.promotion_id=c.promotion_id
   AND p.lifecycle='ACTIVE'
  WHERE w.world_id=$1
 `,[s.worldId,s.playerId,s.promotionId]);
 if(rows.length!==1)throw new Error("Legends Vault access denied");
 return rows[0]!;
}
export async function readLegendsVault(pool:TransactionPool,scope:LegendVaultScope){
 if(!Object.values(scope).every(valid))throw new Error("Invalid Vault identity");
 return withSqlClient(pool,async tx=>{
  const world=await assertVaultMember(tx,scope);
  const [metrics,arrived,cards]=await Promise.all([
   tx.query<{metric:string;value:number}>(`
    SELECT metric,value FROM ppw_legend_metrics WHERE world_id=$1
   `,[scope.worldId]),
   tx.query<{legend_id:string;year:number;week:number;person_ids:string[];
    evidence_value:number;seen:boolean}>(`
    SELECT u.legend_id,u.year,u.week,u.person_ids,u.evidence_value,
     (s.legend_id IS NOT NULL) AS seen
    FROM ppw_world_legend_unlocks u
    LEFT JOIN ppw_legend_reveals_seen s ON s.world_id=u.world_id
     AND s.legend_id=u.legend_id AND s.player_id=$2
    WHERE u.world_id=$1 ORDER BY u.year DESC,u.week DESC,u.legend_id LIMIT 64
   `,[scope.worldId,scope.playerId]),
   tx.query<{legend_id:string}>(`
    SELECT legend_id FROM ppw_kp_legend_cards WHERE player_id=$1
   `,[scope.playerId])
  ]);
  const progress=new Map(metrics.map(m=>[m.metric,Number(m.value)]));
  const unlocked=new Map(arrived.map(x=>[x.legend_id,x]));
  const collected=new Set(cards.map(x=>x.legend_id));
  return {worldYear:world.year,worldWeek:world.week,
   curated:LEGENDS_CATALOGUE.length,
   entries:LEGENDS_CATALOGUE.filter(d=>d.status==="ACTIVE").map(d=>{
    const record=unlocked.get(d.id),isUnlocked=Boolean(record);
    const name=isUnlocked||d.visibility==="KNOWN"?d.name:null;
    const actual=d.metric?Number(progress.get(d.metric)??0):0;
    const target=d.target??0;
    return {
     id:d.id,tier:d.tier,division:d.division,
     name,tradition:isUnlocked?d.tradition:null,
     visibility:d.visibility,clue:d.clue,
     achievement:isUnlocked||d.visibility==="KNOWN"?d.achievement:null,
     progress:target?Math.round(Math.min(100,actual/target*100)):0,
     exactProgress:d.visibility==="KNOWN"||isUnlocked?Math.min(actual,target):null,
     target:d.visibility==="KNOWN"||isUnlocked?target:null,
     unlocked:isUnlocked,year:record?.year??null,week:record?.week??null,
     personIds:record?.person_ids??[],
     revealSeen:record?.seen??false,
     collected:collected.has(d.id),
     collectibleReady:Boolean(d.cardAsset),
     cardAsset:isUnlocked?d.cardAsset:null,
     price:LEGEND_TIER_PRICES[d.tier],
    };
   })}
 });
}
export async function markLegendRevealSeen(
 pool:TransactionPool,scope:LegendVaultScope,legendId:string,
){
 if(!Object.values(scope).every(valid)||!valid(legendId))
  throw new Error("Invalid reveal");
 return withWorldTransaction(pool,async tx=>{
  await assertVaultMember(tx,scope);
  const row=await tx.query<{legend_id:string}>(`
   INSERT INTO ppw_legend_reveals_seen(world_id,legend_id,player_id)
   SELECT u.world_id,u.legend_id,$3 FROM ppw_world_legend_unlocks u
   WHERE u.world_id=$1 AND u.legend_id=$2
   ON CONFLICT DO NOTHING RETURNING legend_id
  `,[scope.worldId,legendId,scope.playerId]);
  if(!row.length){
   const existing=await tx.query<{legend_id:string}>(`
    SELECT legend_id FROM ppw_legend_reveals_seen
    WHERE world_id=$1 AND legend_id=$2 AND player_id=$3
   `,[scope.worldId,legendId,scope.playerId]);
   if(!existing.length)throw new Error("Legend not unlocked in this World");
  }
  return {seen:true,legendId};
 });
}
