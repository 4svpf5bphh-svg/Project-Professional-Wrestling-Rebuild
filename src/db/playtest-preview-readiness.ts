/** A one-off, read-only preview gate. This never reads private cards, asks
 * for wrestler rows, advances time, or changes a production World.
 */
import type {TransactionPool} from "./transaction.js";
import {withWorldTransaction} from "./transaction.js";

export interface PreviewPopulation{
 worldId:string;year:number;week:number;phase:string;
 promotions:number;activePromotions:number;wrestlers:number;
 signedContracts:number;venues:number;markets:number;championships:number;
 availableTakeovers:number;controlledPromotions:number;humanManagers:number;
 women:number;protectedRealPromotions:number;activeTagTeams:number;
 activePersonas:number;genesisImports:number;
}
export interface PreviewReadiness{
 ready:boolean;issues:string[];counts:PreviewPopulation;
}
export function assessPlaytestPopulation(counts:PreviewPopulation):PreviewReadiness{
 const issues:string[]=[];
 if(counts.year<1||counts.week<1||counts.week>52||counts.phase!=="OPEN")
  issues.push("The World must be open for player bookings");
 if(counts.promotions<13||counts.activePromotions<13)
  issues.push("The promotion ecosystem is incomplete");
 if(counts.wrestlers<643)
  issues.push("The starting wrestler pool is incomplete");
 if(counts.signedContracts<200)
  issues.push("The starting contract market is incomplete");
 if(counts.venues<16||counts.markets<4)
  issues.push("The live-show venue and market map is incomplete");
 if(counts.championships<counts.activePromotions*2)
  issues.push("World championship foundations are incomplete");
 if(counts.women<150)
  issues.push("The original women's division is incomplete");
 if(counts.protectedRealPromotions<8)
  issues.push("The eight protected real promotion identities are missing");
 if(counts.activeTagTeams<10)
  issues.push("Original seeded tag partnerships are incomplete");
 if(counts.activePersonas<counts.wrestlers)
  issues.push("Original wrestler-owned moves and character identities are incomplete");
 if(counts.genesisImports!==1)
  issues.push("Exactly one verified original Genesis import is required");
 if(counts.controlledPromotions+counts.availableTakeovers<2)
  issues.push("Fewer than two distinct promotions are available for managers");
 if(counts.controlledPromotions>0&&counts.humanManagers<counts.controlledPromotions)
  issues.push("One manager controls more than one promotion");
 return {ready:issues.length===0,issues,counts};
}
/** Fixed-size result (one row) and one indexed, World-keyed statement. */
export async function inspectPlaytestPopulation(
 pool:TransactionPool,worldId:string,
):Promise<PreviewReadiness>{
 if(typeof worldId!=="string"||!worldId.trim()||worldId.length>100)
  throw new Error("Invalid World scope");
 const rows=await withWorldTransaction(pool,tx=>tx.query<{
  world_id:string;year:number;week:number;phase:string;
  promotions:number;active_promotions:number;wrestlers:number;
  signed_contracts:number;venues:number;markets:number;championships:number;
  available_takeovers:number;controlled_promotions:number;human_managers:number;
  women:number;protected_real_promotions:number;active_tag_teams:number;
  active_personas:number;genesis_imports:number;
 }>(`
  SELECT w.world_id,w.year,w.week,w.phase,
   (SELECT count(*)::integer FROM ppw_promotions p WHERE p.world_id=w.world_id)
    AS promotions,
   (SELECT count(*)::integer FROM ppw_promotions p
    WHERE p.world_id=w.world_id AND p.lifecycle='ACTIVE') AS active_promotions,
   (SELECT count(*)::integer FROM ppw_people p WHERE p.world_id=w.world_id)
    AS wrestlers,
   (SELECT count(*)::integer FROM ppw_contracts c
    WHERE c.world_id=w.world_id AND c.status='SIGNED') AS signed_contracts,
   (SELECT count(*)::integer FROM ppw_venues v WHERE v.world_id=w.world_id)
    AS venues,
   (SELECT count(*)::integer FROM ppw_markets m WHERE m.world_id=w.world_id)
    AS markets,
   (SELECT count(*)::integer FROM ppw_championships c
    WHERE c.world_id=w.world_id AND c.status='ACTIVE') AS championships,
   (SELECT count(*)::integer FROM ppw_promotions p
    WHERE p.world_id=w.world_id AND p.lifecycle='ACTIVE'
     AND p.takeover_eligibility='STANDARD'
     AND NOT EXISTS (SELECT 1 FROM ppw_promotion_controls c
      WHERE c.world_id=p.world_id AND c.promotion_id=p.promotion_id
       AND c.active)) AS available_takeovers,
   (SELECT count(*)::integer FROM ppw_promotion_controls c
    WHERE c.world_id=w.world_id AND c.active) AS controlled_promotions,
   (SELECT count(DISTINCT player_id)::integer FROM ppw_promotion_controls c
    WHERE c.world_id=w.world_id AND c.active) AS human_managers,
   (SELECT count(*)::integer FROM ppw_people p WHERE p.world_id=w.world_id
    AND p.booking_division='WOMEN') AS women,
   (SELECT count(*)::integer FROM ppw_promotions p WHERE p.world_id=w.world_id
    AND p.takeover_eligibility='LOCKED'
    AND p.name=ANY(ARRAY['WWE','AEW','NJPW','NXT','TNA Wrestling',
     'CMLL','ROH','STARDOM']::text[])) AS protected_real_promotions,
   (SELECT count(*)::integer FROM ppw_tag_teams t
    WHERE t.world_id=w.world_id AND t.status='ACTIVE') AS active_tag_teams,
   (SELECT count(*)::integer FROM ppw_portable_personas p
    WHERE p.world_id=w.world_id) AS active_personas,
   (SELECT count(*)::integer FROM ppw_ledger_events l
    WHERE l.world_id=w.world_id AND l.event_type='WORLD_GENESIS_IMPORTED')
    AS genesis_imports
  FROM ppw_worlds w WHERE w.world_id=$1
 `,[worldId]));
 if(rows.length!==1)throw new Error("The selected World is not available");
 const r=rows[0]!;
 return assessPlaytestPopulation({
  worldId:r.world_id,year:r.year,week:r.week,phase:r.phase,
  promotions:r.promotions,activePromotions:r.active_promotions,
  wrestlers:r.wrestlers,signedContracts:r.signed_contracts,
  venues:r.venues,markets:r.markets,championships:r.championships,
  availableTakeovers:r.available_takeovers,controlledPromotions:r.controlled_promotions,
  humanManagers:r.human_managers,
  women:r.women,protectedRealPromotions:r.protected_real_promotions,
  activeTagTeams:r.active_tag_teams,activePersonas:r.active_personas,
  genesisImports:r.genesis_imports
 });
}
