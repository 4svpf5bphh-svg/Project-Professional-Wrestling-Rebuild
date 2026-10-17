/** Original PPW wrestler working-connections view. Only controlled current
 * roster can be inspected, but wrestler professional trust is World-wide.
 * Three bounded indexed reads; no World JSON state, no mutation on viewing.
 */
import {withSqlClient} from "./postgres.js";
import type {TransactionPool} from "./transaction.js";
export interface WorkingConnectionScope{
 worldId:string;promotionId:string;playerId:string;personId?:string;
}
export async function readWorkingConnections(pool:TransactionPool,s:WorkingConnectionScope){
 if(!s.worldId||!s.promotionId||!s.playerId||
  [s.worldId,s.promotionId,s.playerId].some(x=>x.length>200)||
  s.personId!==undefined&&(!s.personId||s.personId.length>200))
  throw new Error("Invalid roster working connections");
 return withSqlClient(pool,async tx=>{
  const roster=await tx.query<{person_id:string;name:string;year:number;week:number}>([
   "SELECT DISTINCT p.person_id,p.name,w.year,w.week FROM ppw_people p",
   "JOIN ppw_contracts c ON c.world_id=p.world_id AND c.person_id=p.person_id",
   "JOIN ppw_worlds w ON w.world_id=p.world_id",
   "JOIN ppw_promotion_controls control ON control.world_id=p.world_id",
   "AND control.promotion_id=c.promotion_id",
   "JOIN ppw_memberships member ON member.world_id=control.world_id",
   "AND member.player_id=control.player_id",
   "JOIN ppw_promotions promo ON promo.world_id=c.world_id",
   "AND promo.promotion_id=c.promotion_id",
   "WHERE p.world_id=$1 AND c.promotion_id=$2 AND control.player_id=$3",
   "AND control.active AND member.status='ACTIVE' AND promo.lifecycle='ACTIVE'",
   "AND p.status='ACTIVE' AND c.status='SIGNED'",
   "AND c.start_week_index <=(w.year-1)*52+w.week-1",
   "AND c.expires_week_index >=(w.year-1)*52+w.week-1",
   "ORDER BY p.name,p.person_id,w.year,w.week LIMIT 501"
  ].join(" "),[s.worldId,s.promotionId,s.playerId]);
  if(roster.length>500)throw new Error("Roster connections exceed bounded capacity");
  if(roster.length===0){
   // An empty roster must still prove control, not leak other World existence.
   const owns=await tx.query<{promotion_id:string}>([
    "SELECT c.promotion_id FROM ppw_promotion_controls c",
    "JOIN ppw_memberships m ON m.world_id=c.world_id AND m.player_id=c.player_id",
    "JOIN ppw_promotions p ON p.world_id=c.world_id AND p.promotion_id=c.promotion_id",
    "WHERE c.world_id=$1 AND c.promotion_id=$2 AND c.player_id=$3",
    "AND c.active AND m.status='ACTIVE' AND p.lifecycle='ACTIVE'"
   ].join(" "),[s.worldId,s.promotionId,s.playerId]);
   if(owns.length!==1)throw new Error("Roster connection access denied");
   return {roster:[],selectedPersonId:null,connections:[]};
  }
  const personId=s.personId??roster[0]!.person_id;
  if(!roster.some(x=>x.person_id===personId))
   throw new Error("Only the current roster can be inspected");
  const now=(roster[0]!.year-1)*52+roster[0]!.week-1;
  const relationships=await tx.query<{other_id:string;name:string;
   professional_trust:number;affinity:number;familiarity:number;
   rivalry_heat:number;tags:unknown;last_change_type:string|null;
   last_change_week_index:number|null}>([
   "SELECT CASE WHEN r.person_a_id=$2 THEN r.person_b_id ELSE r.person_a_id END AS other_id,",
   "p.name,r.professional_trust,r.affinity,r.familiarity,r.rivalry_heat,",
   "r.tags,r.last_change_type,r.last_change_week_index",
   "FROM ppw_wrestler_relationships r JOIN ppw_people p",
   "ON p.world_id=r.world_id AND p.person_id=CASE",
   "WHEN r.person_a_id=$2 THEN r.person_b_id ELSE r.person_a_id END",
   "WHERE r.world_id=$1 AND (r.person_a_id=$2 OR r.person_b_id=$2)",
   "ORDER BY r.familiarity DESC,r.person_a_id,r.person_b_id LIMIT 101"
  ].join(" "),[s.worldId,personId]);
  if(relationships.length>100)throw new Error("Too many working connections");
  const appearances=await tx.query<{other_id:string;name:string;
   tag_matches:string|number;last_shared_week_index:number}>([
   "SELECT CASE WHEN a.person_a_id=$2 THEN a.person_b_id",
   "ELSE a.person_a_id END AS other_id,p.name,",
   "count(DISTINCT a.show_id)::integer AS tag_matches,",
   "max(a.week_index)::integer AS last_shared_week_index",
   "FROM ppw_tag_working_pair_appearances a JOIN ppw_people p",
   "ON p.world_id=a.world_id AND p.person_id=CASE",
   "WHEN a.person_a_id=$2 THEN a.person_b_id ELSE a.person_a_id END",
   "WHERE a.world_id=$1 AND (a.person_a_id=$2 OR a.person_b_id=$2)",
   "AND a.week_index BETWEEN $3 AND $4",
   "GROUP BY other_id,p.name ORDER BY tag_matches DESC,other_id LIMIT 101"
  ].join(" "),[s.worldId,personId,Math.max(0,now-11),now]);
  if(appearances.length>100)throw new Error("Too many recent working partners");
  const byId=new Map(relationships.map(x=>[x.other_id,{
   personId:x.other_id,name:x.name,
   professionalTrust:x.professional_trust,affinity:x.affinity,
   familiarity:x.familiarity,rivalryHeat:x.rivalry_heat,
   tags:Array.isArray(x.tags)?x.tags.filter((t):t is string=>typeof t==="string"):[],
   lastDevelopment:x.last_change_type&&x.last_change_week_index!==null?
    {kind:x.last_change_type,weekIndex:x.last_change_week_index}:null,
   recentTagMatches:0,latestSharedWeekIndex:null as number|null,
   established:true,
  }]));
  for(const p of appearances){
   const known=byId.get(p.other_id);
   if(known){
    known.recentTagMatches=Number(p.tag_matches);
    known.latestSharedWeekIndex=p.last_shared_week_index;
   }else{
    byId.set(p.other_id,{
     personId:p.other_id,name:p.name,
     professionalTrust:0,affinity:0,familiarity:0,rivalryHeat:0,
     tags:[],lastDevelopment:null,
     recentTagMatches:Number(p.tag_matches),
     latestSharedWeekIndex:p.last_shared_week_index,
     established:false,
    });
   }
  }
  const connections=[...byId.values()].sort((a,b)=>
   b.recentTagMatches-a.recentTagMatches||b.familiarity-a.familiarity||
   a.name.localeCompare(b.name)).slice(0,8);
  return {roster:roster.map(x=>({personId:x.person_id,name:x.name})),
   selectedPersonId:personId,connections,worldYear:roster[0]!.year,
   worldWeek:roster[0]!.week};
 });
}
