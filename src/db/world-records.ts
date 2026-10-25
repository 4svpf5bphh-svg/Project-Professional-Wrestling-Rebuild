/** Public World talent rankings and career search, opened on demand from Industry.
 * Only certified match outcomes, rated show facts and public wrestler identity.
 * No opponent drafts, backstage records, salaries or hidden instructions.
 */
import type {TransactionPool} from "./transaction.js";
import {withSqlClient} from "./postgres.js";
export interface WorldRecordsScope{worldId:string;promotionId:string;playerId:string}
const valid=(s:string)=>typeof s==="string"&&s.length>0&&s.length<=200;
async function authorized(tx:{query<T extends Record<string,unknown>>(
 sql:string,params:readonly unknown[]):Promise<readonly T[]>},
 scope:WorldRecordsScope){
 const rows=await tx.query<{year:number;week:number}>(`
  SELECT w.year,w.week FROM ppw_worlds w
  JOIN ppw_promotion_controls c ON c.world_id=w.world_id
   AND c.promotion_id=$3 AND c.player_id=$2 AND c.active
  JOIN ppw_memberships m ON m.world_id=w.world_id AND m.player_id=$2
   AND m.status='ACTIVE'
  JOIN ppw_promotions p ON p.world_id=w.world_id
   AND p.promotion_id=$3 AND p.lifecycle='ACTIVE'
  WHERE w.world_id=$1`,[scope.worldId,scope.playerId,scope.promotionId]);
 if(rows.length!==1)throw new Error("World records access denied");
 return rows[0]!;
}
export async function readWorldTalentRankings(pool:TransactionPool,
 scope:WorldRecordsScope){
 if(!Object.values(scope).every(valid))throw new Error("Invalid World ranking viewer");
 return withSqlClient(pool,async tx=>{
  const clock=await authorized(tx,scope);
  const idx=(clock.year-1)*52+clock.week-1,lower=Math.max(0,idx-12);
  const rows=await tx.query<{person_id:string;name:string;division:string;
   matches:number;wins:number;average_stars:string|null;
   average_crowd:string|null;score:string;champion:boolean;
   position:number|string}>(`
  WITH recent AS MATERIALIZED (
   SELECT c.world_id,c.show_id,c.promotion_id,
    CASE p.tier WHEN 'GLOBAL' THEN 5 WHEN 'NATIONAL' THEN 4
     WHEN 'RISING' THEN 3 WHEN 'INDEPENDENT' THEN 2 ELSE 1 END AS competition
   FROM ppw_completed_shows c
   JOIN ppw_promotions p ON p.world_id=c.world_id
    AND p.promotion_id=c.promotion_id
   WHERE c.world_id=$1
    AND (c.year,c.week)>=($2::integer,$3::integer)
    AND (c.year,c.week)<($4::integer,$5::integer)
  ), bouts AS (
   SELECT recent.competition,m.actual_winner_side,
    m.crowd_response AS crowd,f.rating_stars AS stars,slot.payload
   FROM recent
   JOIN ppw_completed_show_matches m ON m.world_id=recent.world_id
    AND m.show_id=recent.show_id
   JOIN ppw_completed_match_report_facts f ON f.world_id=m.world_id
    AND f.show_id=m.show_id AND f.match_id=m.match_id
   JOIN ppw_card_slots slot ON slot.world_id=m.world_id
    AND slot.draft_id=m.show_id AND slot.slot_id=m.match_id
    AND slot.kind='MATCH'
  ), appearances AS (
   SELECT entrants.item->>'personId' AS person_id,b.stars,b.crowd,b.competition,
    CASE WHEN jsonb_typeof(b.payload->'sides')='array'
     THEN EXISTS (
      SELECT 1 FROM jsonb_array_elements(b.payload->'sides') side(item)
      CROSS JOIN LATERAL jsonb_array_elements(
       CASE WHEN jsonb_typeof(side.item->'participants')='array'
        THEN side.item->'participants' ELSE '[]'::jsonb END) member(item)
      WHERE side.item->>'sideId'=b.actual_winner_side
       AND member.item->>'personId'=entrants.item->>'personId'
     )
     ELSE (b.actual_winner_side=CASE entrants.ordinality WHEN 1 THEN 'A' ELSE 'B' END)
    END AS won
   FROM bouts b
   CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(b.payload->'participants')='array'
     THEN b.payload->'participants' ELSE '[]'::jsonb END)
    WITH ORDINALITY entrants(item,ordinality)
  ), performance AS (
   SELECT p.person_id,p.name,p.booking_division AS division,
    count(*)::integer AS matches,
    count(*) FILTER (WHERE a.won)::integer AS wins,
    avg(a.stars)::numeric AS stars,
    avg(a.crowd)::numeric AS crowd,
    avg(a.competition)::numeric AS competition,
    coalesce(p.momentum,0)::numeric AS momentum,
    EXISTS (
     SELECT 1 FROM ppw_championship_reigns reign
     JOIN ppw_championships title ON title.world_id=reign.world_id
      AND title.promotion_id=reign.promotion_id
      AND title.championship_id=reign.championship_id
      AND title.current_reign_id=reign.reign_id AND title.status='ACTIVE'
     WHERE reign.world_id=$1 AND reign.status='ACTIVE'
      AND (reign.person_id=p.person_id OR EXISTS(
       SELECT 1 FROM ppw_tag_team_members member
       WHERE member.world_id=reign.world_id AND member.team_id=reign.team_id
        AND member.person_id=p.person_id AND member.active))
    ) AS champion
   FROM appearances a JOIN ppw_people p ON p.world_id=$1
    AND p.person_id=a.person_id
   WHERE p.booking_division IN ('MEN','WOMEN') AND p.status='ACTIVE'
   GROUP BY p.world_id,p.person_id,p.name,p.booking_division,p.momentum
  ), scored AS (
   SELECT *,
    round((stars*10+crowd/10+
     20*wins::numeric/greatest(matches,1)+
     least(matches,8)*1.2+momentum/12+competition+
     CASE WHEN champion THEN 5 ELSE 0 END),2) AS score
   FROM performance
  ), ranked AS (
   SELECT *,
    row_number() OVER (PARTITION BY division
     ORDER BY score DESC,stars DESC,wins DESC,name ASC,person_id ASC) AS position
   FROM scored
  )
  SELECT person_id,name,division,matches,wins,
   round(stars,2)::text AS average_stars,
   round(crowd,1)::text AS average_crowd,score::text AS score,
   champion,position
  FROM ranked WHERE position<=20 ORDER BY division,position LIMIT 40
  `,[scope.worldId,Math.floor(lower/52)+1,lower%52+1,
   clock.year,clock.week]);
  return {windowWeeks:13,year:clock.year,week:clock.week,
   leaders:rows.map(x=>({personId:x.person_id,name:x.name,
    division:x.division,matches:x.matches,wins:x.wins,
    losses:x.matches-x.wins,averageStars:x.average_stars===null?null:
     Number(x.average_stars),averageCrowd:x.average_crowd===null?null:
     Number(x.average_crowd),score:Number(x.score),
    champion:x.champion,rank:Number(x.position)}))};
 });
}
export async function searchPublicWorldCareers(pool:TransactionPool,
 scope:WorldRecordsScope,term:string){
 if(!Object.values(scope).every(valid)||typeof term!=="string"||
  term.trim().length<2||term.trim().length>70)
  throw new Error("Enter 2–70 characters to search World careers");
 return withSqlClient(pool,async tx=>{
  const clock=await authorized(tx,scope);
  const escaped=term.trim().replace(/[\\%_]/g,"\\$&");
  const rows=await tx.query<{person_id:string;name:string;
   status:string;division:string|null;promotion_name:string|null}>(`
   SELECT p.person_id,p.name,p.status,p.booking_division AS division,
    signed.promotion_name
   FROM ppw_people p
   LEFT JOIN LATERAL (
    SELECT company.name AS promotion_name FROM ppw_contracts contract
    JOIN ppw_promotions company ON company.world_id=contract.world_id
     AND company.promotion_id=contract.promotion_id
    WHERE contract.world_id=p.world_id AND contract.person_id=p.person_id
     AND contract.status='SIGNED' AND company.lifecycle='ACTIVE'
     AND contract.start_week_index<=$3
     AND contract.expires_week_index>=$3
    ORDER BY company.name,company.promotion_id LIMIT 1
   ) signed ON TRUE
   WHERE p.world_id=$1 AND p.name ILIKE ('%' || $2 || '%') ESCAPE '\\'
   ORDER BY CASE WHEN lower(p.name)=lower($4) THEN 0 ELSE 1 END,
    p.name ASC,p.person_id ASC LIMIT 21
  `,[scope.worldId,escaped,(clock.year-1)*52+clock.week-1,term.trim()]);
  return {people:rows.slice(0,20).map(x=>({personId:x.person_id,name:x.name,
   status:x.status,division:x.division,promotionName:x.promotion_name})),
   hasMore:rows.length>20};
 });
}
