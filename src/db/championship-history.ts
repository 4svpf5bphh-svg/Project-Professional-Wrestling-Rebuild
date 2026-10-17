/** The original championship directory/lineage, rebuilt as two-query
 * bounded reads. World title history is shared; contracts and finances are not.
 * Neither endpoint loads a World snapshot or reads unbounded reign histories.
 */
import type {TransactionPool} from "./transaction.js";
import {withSqlClient} from "./postgres.js";

export interface ChampionshipCard {
 promotionId:string;championshipId:string;promotionName:string;name:string;
 division:"SINGLES"|"TAG";status:"ACTIVE"|"INACTIVE";prestige:number;
 currentReignId:string|null;holderId:string|null;holderType:"PERSON"|"TEAM"|null;
 holderName:string|null;defenses:number;
}
export interface ChampionshipDirectory {
 worldName:string;year:number;week:number;viewerPromotionId:string;
 titles:ChampionshipCard[];
}
export interface ReignCursor {startWeekIndex:number;reignId:string}
export interface ChampionshipReign {
 reignId:string;holderId:string;holderType:"PERSON"|"TEAM";holderName:string;
 status:"ACTIVE"|"ENDED";startWeekIndex:number;endedWeekIndex:number|null;
 defenses:number;isCurrent:boolean;
}
export interface ChampionshipHistory {
 championship:ChampionshipCard;reigns:ChampionshipReign[];
 nextCursor:ReignCursor|null;
}
const validId=(s:string)=>typeof s==="string"&&s.length>0&&s.length<=200;
const requireId=(s:string)=>{if(!validId(s))throw new Error("Invalid championship scope");};
const baseSelect=`
 SELECT c.promotion_id,c.championship_id,p.name AS promotion_name,
 c.name,c.division,c.status,c.prestige,c.current_reign_id,
 r.holder_type,COALESCE(r.person_id,r.team_id) AS holder_id,
 COALESCE(person.name,team.name) AS holder_name,
 COALESCE(r.defenses,0)::integer AS defenses
 FROM ppw_championships c
 JOIN ppw_promotions p ON p.world_id=c.world_id AND p.promotion_id=c.promotion_id
 LEFT JOIN ppw_championship_reigns r ON r.world_id=c.world_id
  AND r.promotion_id=c.promotion_id AND r.championship_id=c.championship_id
  AND r.reign_id=c.current_reign_id AND r.status='ACTIVE'
 LEFT JOIN ppw_people person ON person.world_id=r.world_id AND person.person_id=r.person_id
 LEFT JOIN ppw_tag_teams team ON team.world_id=r.world_id AND team.team_id=r.team_id
`;
type TitleRow={
 promotion_id:string;championship_id:string;promotion_name:string;name:string;
 division:"SINGLES"|"TAG";status:"ACTIVE"|"INACTIVE";prestige:number;
 current_reign_id:string|null;holder_type:"PERSON"|"TEAM"|null;
 holder_id:string|null;holder_name:string|null;defenses:number;
};
const card=(r:TitleRow):ChampionshipCard=>({
 promotionId:r.promotion_id,championshipId:r.championship_id,promotionName:r.promotion_name,
 name:r.name,division:r.division,status:r.status,prestige:r.prestige,
 currentReignId:r.current_reign_id,
 holderId:r.holder_id,holderType:r.holder_type,holderName:r.holder_name,
 defenses:r.defenses,
});
/** Verify active control once; the response contains only public World history. */
async function assertController(tx:{query<T extends Record<string,unknown>>(sql:string,
 params:readonly unknown[]):Promise<readonly T[]>},
 worldId:string,playerId:string,viewerPromotionId:string){
 const owner=await tx.query<{world_name:string;year:number;week:number}>(`
 SELECT w.name AS world_name,w.year,w.week FROM ppw_worlds w
 JOIN ppw_memberships m ON m.world_id=w.world_id
 JOIN ppw_promotion_controls pc ON pc.world_id=w.world_id AND pc.player_id=m.player_id
 JOIN ppw_promotions p ON p.world_id=pc.world_id AND p.promotion_id=pc.promotion_id
 WHERE w.world_id=$1 AND m.player_id=$2 AND m.status='ACTIVE'
 AND pc.promotion_id=$3 AND pc.active AND p.lifecycle='ACTIVE'`,
 [worldId,playerId,viewerPromotionId]);
 if(owner.length!==1)throw new Error("Championship history access denied");
 return owner[0]!;
}
export async function readChampionshipDirectory(pool:TransactionPool,
 worldId:string,playerId:string,viewerPromotionId:string):Promise<ChampionshipDirectory>{
 [worldId,playerId,viewerPromotionId].forEach(requireId);
 return withSqlClient(pool,async tx=>{
  const owner=await assertController(tx,worldId,playerId,viewerPromotionId);
  const rows=await tx.query<TitleRow>(baseSelect+`
 WHERE c.world_id=$1
 ORDER BY CASE WHEN c.status='ACTIVE' THEN 0 ELSE 1 END,
 c.prestige DESC,p.name,c.name,c.championship_id LIMIT 201`,[worldId]);
  if(rows.length>200)throw new Error("World championship directory exceeds safe page limit");
  return {worldName:owner.world_name,year:owner.year,week:owner.week,
   viewerPromotionId,titles:rows.map(card)};
 });
}
export async function readChampionshipHistory(pool:TransactionPool,
 worldId:string,playerId:string,viewerPromotionId:string,
 titlePromotionId:string,championshipId:string,cursor:ReignCursor|null=null,
):Promise<ChampionshipHistory>{
 [worldId,playerId,viewerPromotionId,titlePromotionId,championshipId].forEach(requireId);
 if(cursor&&(!Number.isSafeInteger(cursor.startWeekIndex)||cursor.startWeekIndex<0||
   !validId(cursor.reignId)))throw new Error("Invalid championship lineage cursor");
 return withSqlClient(pool,async tx=>{
  await assertController(tx,worldId,playerId,viewerPromotionId);
  const title=await tx.query<TitleRow>(baseSelect+`
 WHERE c.world_id=$1 AND c.promotion_id=$2 AND c.championship_id=$3`,
 [worldId,titlePromotionId,championshipId]);
  if(title.length!==1)throw new Error("Championship not found");
  const rows=await tx.query<{
   reign_id:string;holder_type:"PERSON"|"TEAM";holder_id:string;holder_name:string;
   status:"ACTIVE"|"ENDED";start_week_index:number;ended_week_index:number|null;defenses:number;
  }>(`
 SELECT r.reign_id,r.holder_type,COALESCE(r.person_id,r.team_id) AS holder_id,
 COALESCE(person.name,team.name,'Unknown wrestler or team') AS holder_name,
 r.status,r.start_week_index,r.ended_week_index,r.defenses
 FROM ppw_championship_reigns r
 LEFT JOIN ppw_people person ON person.world_id=r.world_id AND person.person_id=r.person_id
 LEFT JOIN ppw_tag_teams team ON team.world_id=r.world_id AND team.team_id=r.team_id
 WHERE r.world_id=$1 AND r.promotion_id=$2 AND r.championship_id=$3
 AND ($4::integer IS NULL OR
    (r.start_week_index,r.reign_id)<($4::integer,$5::text))
 ORDER BY r.start_week_index DESC,r.reign_id DESC LIMIT 16`,
 [worldId,titlePromotionId,championshipId,cursor?.startWeekIndex??null,cursor?.reignId??null]);
  const page=rows.slice(0,15);
  const last=page.at(-1);
  return {championship:card(title[0]!),reigns:page.map(r=>({
    reignId:r.reign_id,holderId:r.holder_id,holderType:r.holder_type,
    holderName:r.holder_name,status:r.status,startWeekIndex:r.start_week_index,
    endedWeekIndex:r.ended_week_index,defenses:r.defenses,
    isCurrent:r.reign_id===title[0]!.current_reign_id&&r.status==="ACTIVE"
  })),nextCursor:rows.length>15&&last?
    {startWeekIndex:last.start_week_index,reignId:last.reign_id}:null};
 });
}
