/** Account-scoped earned Kayfabe Points. Never modifies game outcomes or talent stats.
 * A created wrestler enters the ordinary shared free-agent market, never the buyer's roster.
 */
import {createHash,randomUUID} from "node:crypto";
import {withWorldTransaction,type TransactionPool} from "./transaction.js";
import {withSqlClient} from "./postgres.js";
import type {SqlRows} from "./world-operations.js";
import {createKpWrestlerPersona,validateKpCreatedIdentity,kpWrestlerCreateOptions,
 type KpCreatedIdentity} from "../domain/kp-create-wrestler.js";
import {findLegend,LEGEND_TIER_PRICES} from "../domain/legends-catalogue.js";
import {promoterAchievementCountersSql} from "./promoter-achievement-sql.js";
import {derivePromoterAchievements,EMPTY_PROMOTER_COUNTERS,
 type PromoterAchievementCounters,type AchievementMetric}
 from "../domain/promoter-achievements.js";

export const KP_WEEKLY_AWARD=100;
export const KP_STAFF_ALIAS_COST=350;
export const KP_CREATE_TALENT_COST=3000;
export const KP_CATALOGUE=[
 {sku:"BRAND_CHROME",label:"Chrome promotion crest",price:200,kind:"BRAND"},
 {sku:"BRAND_NEON",label:"Neon promotion crest",price:350,kind:"BRAND"},
 {sku:"BRAND_GOLD",label:"Gold promotion crest",price:600,kind:"BRAND"},
 {sku:"BADGE_GOLD",label:"Gold achievement display",price:350,kind:"BADGE"},
 {sku:"BADGE_PLATINUM",label:"Platinum achievement display",price:650,kind:"BADGE"},
 {sku:"RESULTS_TERRITORY_TV",label:"Territory TV · vintage show results",price:1000,kind:"RESULTS_SKIN"},
 {sku:"RESULTS_FIGHT_NIGHT",label:"Fight Night · professional match reports",price:1000,kind:"RESULTS_SKIN"},
 {sku:"RESULTS_UNDERGROUND_ZINE",label:"Underground Zine · indie wrestling fanzine",price:1000,kind:"RESULTS_SKIN"}
] as const;
type BrandSku="BRAND_CHROME"|"BRAND_NEON"|"BRAND_GOLD";
type BadgeSku="BADGE_GOLD"|"BADGE_PLATINUM";
type ResultsSkinSku="RESULTS_TERRITORY_TV"|"RESULTS_FIGHT_NIGHT"|"RESULTS_UNDERGROUND_ZINE";
const resultsStyle=(sku:ResultsSkinSku):"TERRITORY_TV"|"FIGHT_NIGHT"|"UNDERGROUND_ZINE"=>
 sku==="RESULTS_FIGHT_NIGHT"?"FIGHT_NIGHT":
 sku==="RESULTS_UNDERGROUND_ZINE"?"UNDERGROUND_ZINE":"TERRITORY_TV";
export type KpSku=typeof KP_CATALOGUE[number]["sku"];
export type KpScope={worldId:string;promotionId:string;playerId:string};
export type KpAction=
 |{kind:"BUY";sku:KpSku;requestId:string}
 |{kind:"APPLY_BRAND";sku:BrandSku;requestId:string}
 |{kind:"APPLY_BADGE";sku:BadgeSku;requestId:string}
 |{kind:"CLEAR_BADGE";requestId:string}
 |{kind:"APPLY_RESULTS_SKIN";sku:ResultsSkinSku;requestId:string}
 |{kind:"CLEAR_RESULTS_SKIN";requestId:string}
 |{kind:"RENAME_STAFF";staffId:string;name:string;requestId:string}
 |({kind:"CREATE_WRESTLER";requestId:string}&KpCreatedIdentity)
 |{kind:"COLLECT_LEGEND";legendId:string;requestId:string};
const validId=(v:string)=>typeof v==="string"&&v.length>0&&v.length<=200;
function cleanName(value:string){
 if(typeof value!=="string")throw new Error("A name is required");
 const name=value.trim().replace(/\s+/g," ");
 if(name.length<3||name.length>48||!/^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u.test(name))
  throw new Error("Use a 3–48 character name with letters and ordinary punctuation");
 return name;
}
export const catalogueItem=(sku:string)=>KP_CATALOGUE.find(p=>p.sku===sku)??null;
export function validateKpAction(action:KpAction){
 if(!action||!validId(action.requestId))throw new Error("Invalid Kayfabe request");
 if(action.kind==="BUY"||action.kind==="APPLY_BRAND"||action.kind==="APPLY_BADGE"||action.kind==="APPLY_RESULTS_SKIN"){
  const item=catalogueItem(action.sku);
  if(!item||(action.kind==="APPLY_BRAND"&&item.kind!=="BRAND")||
   (action.kind==="APPLY_BADGE"&&item.kind!=="BADGE")||
   (action.kind==="APPLY_RESULTS_SKIN"&&item.kind!=="RESULTS_SKIN"))
   throw new Error("Unknown Kayfabe Points item");
 }else if(action.kind==="CLEAR_BADGE"||action.kind==="CLEAR_RESULTS_SKIN"){
  // The standard look is always available and costs nothing.
 }else if(action.kind==="RENAME_STAFF"){
  if(!validId(action.staffId))throw new Error("Unknown staff member");
  cleanName(action.name);
 }else if(action.kind==="CREATE_WRESTLER"){
  validateKpCreatedIdentity(action);
 }else if(action.kind==="COLLECT_LEGEND"){
  if(!findLegend(action.legendId))throw new Error("Unknown collectible legend");
 }else throw new Error("Unknown Kayfabe Points action");
 return action;
}
async function assertOwner(tx:SqlRows,s:KpScope){
 const rows=await tx.query<{year:number;week:number;can_edit:boolean;name:string}>(`
 SELECT w.year,w.week,p.name,
  (w.phase='OPEN' AND w.next_lock_at>clock_timestamp()) AS can_edit
 FROM ppw_worlds w JOIN ppw_promotion_controls c ON c.world_id=w.world_id
  AND c.player_id=$2 AND c.promotion_id=$3 AND c.active
 JOIN ppw_memberships m ON m.world_id=c.world_id AND m.player_id=c.player_id
  AND m.status='ACTIVE'
 JOIN ppw_promotions p ON p.world_id=c.world_id AND p.promotion_id=c.promotion_id
  AND p.lifecycle='ACTIVE'
 WHERE w.world_id=$1 LIMIT 1`,[s.worldId,s.playerId,s.promotionId]);
 if(rows.length!==1)throw new Error("Only your active promotion may use Kayfabe Points");
 return rows[0]!;
}
async function lockWallet(tx:SqlRows,id:string){
 await tx.query("INSERT INTO ppw_kp_wallets(player_id) VALUES($1) ON CONFLICT DO NOTHING",[id]);
 const r=await tx.query<{balance:string}>(`
  SELECT balance::text FROM ppw_kp_wallets WHERE player_id=$1 FOR UPDATE`,[id]);
 if(r.length!==1)throw new Error("Kayfabe wallet unavailable");
 return Number(r[0]!.balance);
}
/** One request over certified records, shared by the KP preview and full
 *  Trophy Room. Indexes remain World/promotion scoped; no per-card queries. */
async function queryPromoterCounters(tx:SqlRows,s:KpScope){
 const result=await tx.query<Record<AchievementMetric,string>&{badge_style:string|null}>(
  promoterAchievementCountersSql("$1","$2",
   "(SELECT style FROM ppw_kp_badge_styles WHERE player_id=$3) AS badge_style"),
  [s.worldId,s.promotionId,s.playerId]);
 const stats={...EMPTY_PROMOTER_COUNTERS};
 const row=result[0];
 for(const key of Object.keys(stats) as AchievementMetric[]){
  const value=Number(row?.[key]??0);
  stats[key]=Number.isFinite(value)&&value>=0?value:0;
 }
 return {stats,activeBadge:row?.badge_style??null};
}
/** Only executed when Trophy Room is deliberately opened. Never polls. */
export async function readPromoterAchievementWorkspace(pool:TransactionPool,s:KpScope){
 if(!Object.values(s).every(validId))throw new Error("Invalid achievements identity");
 return withSqlClient(pool,async tx=>{
  const world=await assertOwner(tx,s);
  const {stats,activeBadge}=await queryPromoterCounters(tx,s);
  return {...derivePromoterAchievements(stats),activeBadge,
   worldYear:world.year,week:world.week,promotionName:world.name};
 });
}

export async function readKayfabeWorkspace(pool:TransactionPool,s:KpScope){
 if(!Object.values(s).every(validId))throw new Error("Invalid Kayfabe identity");
 return withSqlClient(pool,async tx=>{
  const world=await assertOwner(tx,s);
  const balances=await tx.query<{balance:string;lifetime_earned:string;lifetime_spent:string;results_skin:string|null}>(`
   SELECT balance::text,lifetime_earned::text,lifetime_spent::text,
    (SELECT style FROM ppw_kp_results_skins WHERE player_id=$1) AS results_skin
   FROM ppw_kp_wallets WHERE player_id=$1`,[s.playerId]);
  const items=await tx.query<{sku:string}>(`
   SELECT sku FROM ppw_kp_entitlements WHERE player_id=$1 ORDER BY sku LIMIT 20`,[s.playerId]);
  const style=await tx.query<{style:string}>(`
   SELECT style FROM ppw_kp_promotion_styles WHERE world_id=$1 AND promotion_id=$2
   AND player_id=$3`,[s.worldId,s.promotionId,s.playerId]);
  const staff=await tx.query<{staff_id:string;alias:string|null}>(`
   SELECT e.staff_id,a.alias FROM ppw_staff_employments e
   LEFT JOIN ppw_kp_staff_aliases a ON a.world_id=e.world_id
    AND a.promotion_id=e.promotion_id AND a.staff_id=e.staff_id
    AND a.player_id=$3
   WHERE e.world_id=$1 AND e.promotion_id=$2 AND e.status='ACTIVE'
   ORDER BY e.role LIMIT 8`,[s.worldId,s.promotionId,s.playerId]);
  const achievementData=await queryPromoterCounters(tx,s);
  const weeks=await tx.query<{year:number;week:number;played:boolean;claimed:boolean;daily_claimed:boolean}>(`
   SELECT n.year,n.week,
    EXISTS(SELECT 1 FROM ppw_completed_shows c
     WHERE c.world_id=n.world_id AND c.promotion_id=$2
      AND c.year=n.year AND c.week=n.week) AS played,
    EXISTS(SELECT 1 FROM ppw_kp_week_grants g
     WHERE g.player_id=$3 AND g.world_id=n.world_id
      AND g.year=n.year AND g.week=n.week) AS claimed,
    EXISTS(SELECT 1 FROM ppw_kp_week_grants g
     WHERE g.player_id=$3 AND g.credited_on=timezone('utc',now())::date) AS daily_claimed
   FROM ppw_world_news_weeks n WHERE n.world_id=$1
   ORDER BY n.year DESC,n.week DESC LIMIT 1`,[s.worldId,s.promotionId,s.playerId]);
  const created=await tx.query<{person_id:string;name:string;created_year:number}>(`
   SELECT c.person_id,p.name,c.created_year FROM ppw_kp_created_talent c
   JOIN ppw_people p ON p.world_id=c.world_id AND p.person_id=c.person_id
   WHERE c.world_id=$1 AND c.creator_player_id=$2
   ORDER BY c.created_year DESC LIMIT 10`,[s.worldId,s.playerId]);
  const last=weeks[0],money=balances[0];
  return {balance:Number(money?.balance??0),lifetimeEarned:Number(money?.lifetime_earned??0),
   lifetimeSpent:Number(money?.lifetime_spent??0),worldYear:world.year,week:world.week,
   promotionName:world.name,weeklyAward:KP_WEEKLY_AWARD,
   claim:last?{year:last.year,week:last.week,played:last.played,
    eligible:last.played&&!last.claimed&&!last.daily_claimed,
    alreadyClaimed:last.claimed,dailyCapReached:last.daily_claimed}:null,
   entitlements:items.map(i=>i.sku),activeBrand:style[0]?.style??null,
   activeBadge:achievementData.activeBadge,
   activeResultsSkin:money?.results_skin==="TERRITORY_TV"||money?.results_skin==="FIGHT_NIGHT"||money?.results_skin==="UNDERGROUND_ZINE"?money.results_skin:null,
   staff:staff.map(x=>({staffId:x.staff_id,alias:x.alias})),
   achievements:derivePromoterAchievements(achievementData.stats).achievements,
   createdTalent:created.map(c=>({personId:c.person_id,name:c.name,year:c.created_year})),
   catalogue:KP_CATALOGUE,staffAliasPrice:KP_STAFF_ALIAS_COST,
   createTalentPrice:KP_CREATE_TALENT_COST,createOptions:kpWrestlerCreateOptions};
 });
}
export async function claimKayfabeWeek(pool:TransactionPool,s:KpScope){
 if(!Object.values(s).every(validId))throw new Error("Invalid Kayfabe identity");
 return withWorldTransaction(pool,async tx=>{
  await assertOwner(tx,s);
  const balance=await lockWallet(tx,s.playerId);
  const last=await tx.query<{year:number;week:number;played:boolean}>(`
   SELECT n.year,n.week,EXISTS(SELECT 1 FROM ppw_completed_shows c
    WHERE c.world_id=n.world_id AND c.promotion_id=$2
     AND c.year=n.year AND c.week=n.week) AS played
   FROM ppw_world_news_weeks n WHERE n.world_id=$1
   ORDER BY n.year DESC,n.week DESC LIMIT 1`,[s.worldId,s.promotionId]);
  if(!last[0]?.played)return {awarded:0,balance,reason:"No completed certified show for your promotion"};
  const grants=await tx.query<{amount:number}>(`
   INSERT INTO ppw_kp_week_grants(player_id,world_id,year,week,amount)
   VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING amount`,
   [s.playerId,s.worldId,last[0].year,last[0].week,KP_WEEKLY_AWARD]);
  if(!grants.length)return {awarded:0,balance,
   reason:"This week or UTC day has already received Kayfabe Points"};
  await tx.query(`
   UPDATE ppw_kp_wallets SET balance=balance+$2,lifetime_earned=lifetime_earned+$2
   WHERE player_id=$1`,[s.playerId,KP_WEEKLY_AWARD]);
  return {awarded:KP_WEEKLY_AWARD,balance:balance+KP_WEEKLY_AWARD,
   year:last[0].year,week:last[0].week};
 });
}
export async function applyKayfabeAction(pool:TransactionPool,s:KpScope,action:KpAction){
 if(!Object.values(s).every(validId))throw new Error("Invalid Kayfabe identity");
 validateKpAction(action);
 return withWorldTransaction(pool,async tx=>{
  const owner=await assertOwner(tx,s),balance=await lockWallet(tx,s.playerId);
  const hash=createHash("sha256").update(JSON.stringify(action)).digest("hex");
  const old=await tx.query<{kind:string;payload_hash:string;outcome:Record<string,unknown>}>(`
   SELECT kind,payload_hash,outcome FROM ppw_kp_receipts
   WHERE player_id=$1 AND request_id=$2`,[s.playerId,action.requestId]);
  if(old.length){
   if(old[0]!.kind!==action.kind||old[0]!.payload_hash!==hash)
    throw new Error("Kayfabe request ID was used for a different action");
   return {replayed:true,...old[0]!.outcome};
  }
  let price=0,outcome:Record<string,unknown>={};
  if(action.kind==="BUY"){
   const item=catalogueItem(action.sku)!;
   const exists=await tx.query<{sku:string}>(`
    SELECT sku FROM ppw_kp_entitlements WHERE player_id=$1 AND sku=$2`,
    [s.playerId,action.sku]);
   if(exists.length)throw new Error("You already own this style");
   price=item.price;
   await tx.query(`INSERT INTO ppw_kp_entitlements(player_id,sku) VALUES($1,$2)`,
    [s.playerId,action.sku]);
   if(item.kind==="BRAND")await tx.query(`
    INSERT INTO ppw_kp_promotion_styles(world_id,promotion_id,player_id,style)
    VALUES($1,$2,$3,$4) ON CONFLICT(world_id,promotion_id) DO UPDATE
    SET style=excluded.style,player_id=excluded.player_id`,
    [s.worldId,s.promotionId,s.playerId,action.sku.replace("BRAND_","")]);
   if(item.kind==="RESULTS_SKIN")await tx.query(`
    INSERT INTO ppw_kp_results_skins(player_id,style) VALUES($1,$2)
    ON CONFLICT(player_id) DO UPDATE SET style=excluded.style`,
    [s.playerId,resultsStyle(action.sku as ResultsSkinSku)]);
   if(item.kind==="BADGE")await tx.query(`
    INSERT INTO ppw_kp_badge_styles(player_id,style) VALUES($1,$2)
    ON CONFLICT(player_id) DO UPDATE SET style=excluded.style`,
    [s.playerId,action.sku.replace("BADGE_","")]);
   outcome={sku:action.sku,label:item.label};
  }else if(action.kind==="APPLY_BRAND"){
   const exists=await tx.query<{sku:string}>(`
    SELECT sku FROM ppw_kp_entitlements WHERE player_id=$1 AND sku=$2`,
    [s.playerId,action.sku]);
   if(!exists.length)throw new Error("Unlock this crest before applying it");
   await tx.query(`
    INSERT INTO ppw_kp_promotion_styles(world_id,promotion_id,player_id,style)
    VALUES($1,$2,$3,$4) ON CONFLICT(world_id,promotion_id) DO UPDATE
    SET style=excluded.style,player_id=excluded.player_id`,
    [s.worldId,s.promotionId,s.playerId,action.sku.replace("BRAND_","")]);
   outcome={style:action.sku};
  }else if(action.kind==="APPLY_BADGE"){
   const exists=await tx.query<{sku:string}>(
    "SELECT sku FROM ppw_kp_entitlements WHERE player_id=$1 AND sku=$2",
    [s.playerId,action.sku]);
   if(!exists.length)throw new Error("Unlock this badge frame before using it");
   await tx.query(`
    INSERT INTO ppw_kp_badge_styles(player_id,style) VALUES($1,$2)
    ON CONFLICT(player_id) DO UPDATE SET style=excluded.style`,
    [s.playerId,action.sku.replace("BADGE_","")]);
   outcome={style:action.sku};
  }else if(action.kind==="APPLY_RESULTS_SKIN"){
   const owns=await tx.query<{sku:string}>(
    "SELECT sku FROM ppw_kp_entitlements WHERE player_id=$1 AND sku=$2",
    [s.playerId,action.sku]);
   if(!owns.length)throw new Error("Unlock this results skin before applying it");
   await tx.query(`INSERT INTO ppw_kp_results_skins(player_id,style) VALUES($1,$2)
    ON CONFLICT(player_id) DO UPDATE SET style=excluded.style`,
    [s.playerId,resultsStyle(action.sku)]);
   outcome={style:resultsStyle(action.sku)};
  }else if(action.kind==="CLEAR_RESULTS_SKIN"){
   await tx.query("DELETE FROM ppw_kp_results_skins WHERE player_id=$1",[s.playerId]);
   outcome={style:null};
  }else if(action.kind==="CLEAR_BADGE"){
   await tx.query("DELETE FROM ppw_kp_badge_styles WHERE player_id=$1",[s.playerId]);
   outcome={style:null};
  }else if(action.kind==="RENAME_STAFF"){
   const name=cleanName(action.name);
   const hired=await tx.query<{staff_id:string}>(`
    SELECT staff_id FROM ppw_staff_employments
    WHERE world_id=$1 AND promotion_id=$2 AND staff_id=$3 AND status='ACTIVE' LIMIT 1`,
    [s.worldId,s.promotionId,action.staffId]);
   if(!hired.length)throw new Error("Only employed staff may be renamed");
   price=KP_STAFF_ALIAS_COST;
   await tx.query(`
    INSERT INTO ppw_kp_staff_aliases(world_id,promotion_id,staff_id,player_id,alias)
    VALUES($1,$2,$3,$4,$5) ON CONFLICT(world_id,promotion_id,staff_id) DO UPDATE
    SET alias=excluded.alias,player_id=excluded.player_id`,
    [s.worldId,s.promotionId,action.staffId,s.playerId,name]);
   outcome={staffId:action.staffId,name};
  }else if(action.kind==="COLLECT_LEGEND"){
   const legend=findLegend(action.legendId)!;
   if(legend.status!=="ACTIVE"||!legend.cardAsset)
    throw new Error("This card is not yet available. Premium artwork must be cleared first.");
   const announced=await tx.query<{legend_id:string}>(`
    SELECT legend_id FROM ppw_world_legend_unlocks
    WHERE world_id=$1 AND legend_id=$2
   `,[s.worldId,legend.id]);
   if(!announced.length)throw new Error("Legend must enter your World before the card can be collected");
   const owned=await tx.query<{legend_id:string}>(`
    SELECT legend_id FROM ppw_kp_legend_cards WHERE player_id=$1 AND legend_id=$2
   `,[s.playerId,legend.id]);
   if(owned.length)throw new Error("You already own this legend card");
   price=LEGEND_TIER_PRICES[legend.tier];
   await tx.query(`
    INSERT INTO ppw_kp_legend_cards(player_id,legend_id,first_unlocked_world_id)
    VALUES($1,$2,$3)
   `,[s.playerId,legend.id,s.worldId]);
   outcome={legendId:legend.id,name:legend.name,collected:true};
  }else if(action.kind==="CREATE_WRESTLER"){
   if(!owner.can_edit)throw new Error("The World must be open to introduce a wrestler");
   const locked=await tx.query<{year:number;week:number;can_edit:boolean}>(
    "SELECT year,week,(phase='OPEN' AND next_lock_at>clock_timestamp()) AS can_edit "+
    "FROM ppw_worlds WHERE world_id=$1 FOR UPDATE",[s.worldId]);
   if(locked.length!==1||!locked[0]!.can_edit||locked[0]!.year!==owner.year||
    locked[0]!.week!==owner.week)throw new Error("World booking deadline passed");
   const created=validateKpCreatedIdentity(action);
   const name=created.name;
   const persona=createKpWrestlerPersona(created);
   const same=await tx.query<{person_id:string}>(`
    SELECT person_id FROM ppw_people WHERE world_id=$1 AND lower(name)=lower($2)
    LIMIT 1`,[s.worldId,name]);
   if(same.length)throw new Error("That wrestler name already exists in this World");
   const quota=await tx.query<{person_id:string}>(`
    SELECT person_id FROM ppw_kp_created_talent WHERE world_id=$1
     AND creator_player_id=$2 AND created_year=$3 LIMIT 1`,
    [s.worldId,s.playerId,owner.year]);
   if(quota.length)throw new Error("One created wrestler per player per World year");
   price=KP_CREATE_TALENT_COST;
   const personId="kp-talent-"+randomUUID(),weekIndex=(owner.year-1)*52+owner.week-1;
   await tx.query(`
    INSERT INTO ppw_people(world_id,person_id,name,status,career_stage,
     recognition,popularity,momentum,fatigue,wear,morale,in_ring_quality,
     match_craft,presentation,stamina,safety,contract_priorities,
     biological_age,career_experience,development_aptitude,generated_talent,
     debut_week_index,booking_division,default_alignment,portable_gimmick_id)
    VALUES($1,$2,$3,'ACTIVE','PROSPECT',15,12,25,0,0,72,52,49,50,66,65,
     '{"money":65,"role":70,"prestige":50,"schedule":45,"loyalty":40,"exposure":60}'::jsonb,
     24,2,60,true,$4,$5,$6,$7)`,
    [s.worldId,personId,name,weekIndex,created.division,created.alignment,created.gimmickId]);
   await tx.query(`
    INSERT INTO ppw_portable_personas(world_id,person_id,revision,persona,provenance,introduced_week_index)
    VALUES($1,$2,1,$3::jsonb,'GAME_AUTHORED',$4)`,
    [s.worldId,personId,JSON.stringify(persona),weekIndex]);
   await tx.query(`
    INSERT INTO ppw_kp_created_talent(world_id,person_id,creator_player_id,created_year)
    VALUES($1,$2,$3,$4)`,[s.worldId,personId,s.playerId,owner.year]);
   outcome={personId,name,division:created.division,market:"FREE_AGENT"};
  }
  if(balance<price)throw new Error("Not enough Kayfabe Points");
  if(price)await tx.query(`
   UPDATE ppw_kp_wallets SET balance=balance-$2,lifetime_spent=lifetime_spent+$2
   WHERE player_id=$1 AND balance >=$2`,[s.playerId,price]);
  const receipt={...outcome,price,balance:balance-price};
  await tx.query(`
   INSERT INTO ppw_kp_receipts(player_id,request_id,kind,payload_hash,outcome)
   VALUES($1,$2,$3,$4,$5::jsonb)`,
   [s.playerId,action.requestId,action.kind,hash,JSON.stringify(receipt)]);
  return {replayed:false,...receipt};
 });
}
