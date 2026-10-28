/** A manager's public owner name is separate from their authenticated invite ID.
 * Promotion names may change, but IDs, booked cards, contracts and historical
 * certified reports remain unchanged and existing promotion ownership is enforced.
 */
import {withWorldTransaction,type TransactionPool} from "./transaction.js";
import {withSqlClient} from "./postgres.js";
export function normaliseOwnerName(raw:unknown):string{
 if(typeof raw!=="string")throw new Error("Enter your manager name");
 const name=raw.trim().replace(/\s+/g," ");
 if(name.length<3||name.length>48||
  !/^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u.test(name))
  throw new Error("Manager name must be 3–48 letters with ordinary punctuation");
 return name;
}
export function normalisePromotionName(raw:unknown):string{
 if(typeof raw!=="string")throw new Error("Enter a promotion name");
 const name=raw.trim().replace(/\s+/g," ");
 if(name.length<3||name.length>56||
  !/^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} &'.,!\-]*$/u.test(name))
  throw new Error("Promotion name must be 3–56 characters");
 return name;
}
export async function getOwnerDisplayName(pool:TransactionPool,playerId:string){
 if(!playerId||playerId.length>200)throw new Error("Invalid manager identity");
 return withSqlClient(pool,async tx=>{
  const rows=await tx.query<{display_name:string}>(`
   SELECT display_name FROM ppw_player_profiles WHERE player_id=$1`,[playerId]);
  return rows[0]?.display_name??null;
 });
}
export async function saveOwnerDisplayName(pool:TransactionPool,playerId:string,name:unknown){
 if(!playerId||playerId.length>200)throw new Error("Invalid manager identity");
 const displayName=normaliseOwnerName(name);
 return withWorldTransaction(pool,async tx=>{
  await tx.query("INSERT INTO ppw_players(player_id) VALUES($1) ON CONFLICT DO NOTHING",[playerId]);
  await tx.query(`
   INSERT INTO ppw_player_profiles(player_id,display_name)
   VALUES($1,$2) ON CONFLICT(player_id) DO UPDATE SET
    display_name=excluded.display_name,updated_at=now()`,[playerId,displayName]);
  return {displayName};
 });
}
export async function renameOwnedPromotion(pool:TransactionPool,scope:{
 worldId:string;playerId:string;promotionId:string;name:unknown
}){
 const {worldId,playerId,promotionId}=scope;
 if(!worldId||worldId.length>200||!playerId||playerId.length>200||
    !promotionId||promotionId.length>200)throw new Error("Invalid promotion identity");
 const name=normalisePromotionName(scope.name);
 return withWorldTransaction(pool,async tx=>{
  const owners=await tx.query<{name:string;year:number;week:number}>(`
   SELECT p.name,w.year,w.week FROM ppw_promotion_controls c
   JOIN ppw_memberships m ON m.world_id=c.world_id
    AND m.player_id=c.player_id AND m.status='ACTIVE'
   JOIN ppw_worlds w ON w.world_id=c.world_id
   JOIN ppw_promotions p ON p.world_id=c.world_id
    AND p.promotion_id=c.promotion_id AND p.lifecycle='ACTIVE'
   WHERE c.world_id=$1 AND c.player_id=$2 AND c.promotion_id=$3 AND c.active
   FOR UPDATE OF p`,[worldId,playerId,promotionId]);
  const owned=owners[0];
  if(!owned||owners.length!==1)throw new Error("Only the current owner can rename a promotion");
  if(name===owned.name)return {name,previousName:owned.name,changed:false};
  const existing=await tx.query<{promotion_id:string}>(`
   SELECT promotion_id FROM ppw_promotions
   WHERE world_id=$1 AND lower(name)=lower($2) AND promotion_id<>$3 LIMIT 1`,
   [worldId,name,promotionId]);
  if(existing.length)throw new Error("Another promotion already uses that name");
  await tx.query(`
   UPDATE ppw_promotions SET name=$4
   WHERE world_id=$1 AND promotion_id=$2 AND name=$3`,
   [worldId,promotionId,owned.name,name]);
  await tx.query(`
   INSERT INTO ppw_promotion_name_history(world_id,promotion_id,player_id,
    previous_name,new_name,year,week)
   VALUES($1,$2,$3,$4,$5,$6,$7)`,
   [worldId,promotionId,playerId,owned.name,name,owned.year,owned.week]);
  return {name,previousName:owned.name,changed:true};
 });
}
/** Deterministic AI proprietor identity until a human claims the promotion.
 * Stable between sessions with no DB writes, polling or invented news receipts.
 */
const given=["Morgan","Alex","Casey","Riley","Jordan","Drew","Taylor","Harper",
 "Sam","Cameron","Ash","Blake","Jamie","Frankie","Ellis","Robin"];
const family=["Mercer","Dawson","Vale","Hayes","Sinclair","Brooks","Sutton","Hart",
 "Carver","Mason","Wolfe","Sterling","Rowe","Quinn","Fletcher","Archer"];
export function fictionalPromotionOwner(promotionId:string):string{
 let hash=2166136261;
 for(const c of promotionId)hash=Math.imul(hash^c.charCodeAt(0),16777619)>>>0;
 const a=given[hash%given.length]!,b=family[Math.floor(hash/given.length)%family.length]!;
 return a+" "+b;
}
