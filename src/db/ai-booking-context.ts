import type {SqlRows} from "./world-operations.js";
/** Targeted canonical title, programme and established-team context.
 * The 4 bounded reads are per WORLD stage, never per show/match.
 * Nothing is inferred from an absent championship or unknown programme.
 */
export interface AiBookingContext{
 programmes:Map<string,Array<{aId:string;bId:string;kind:"PROGRAMME";
  programmeId:string;heat:number}>>;
 championships:Map<string,Array<{championshipId:string;holderId:string|null;heat:number;bookingDivision:"MEN"|"WOMEN"|null}>>;
 partners:Map<string,string[]>;
 teams:readonly {teamId:string;aId:string;bId:string}[];
 tagChampionships:Map<string,Array<{championshipId:string;holderTeamId:string|null;heat:number;bookingDivision:"MEN"|"WOMEN"|null}>>;
}
export async function readWorldAiBookingContext(
 tx:SqlRows,worldId:string,promotionIds:readonly string[],
):Promise<AiBookingContext>{
 if(promotionIds.length>128||new Set(promotionIds).size!==promotionIds.length)
  throw new Error("Invalid AI booking context batch");
 const [programmeRows,titleRows,teamRows,tagTitleRows]=await Promise.all([
  tx.query<{promotion_id:string;programme_id:string;heat:number;
    a_id:string;b_id:string}>(`
   SELECT p.promotion_id,p.programme_id,p.heat,
    max(CASE WHEN r.side='A' THEN r.person_id END) AS a_id,
    max(CASE WHEN r.side='B' THEN r.person_id END) AS b_id
   FROM ppw_programmes p
   JOIN ppw_programme_participants r ON r.world_id=p.world_id
    AND r.promotion_id=p.promotion_id AND r.programme_id=p.programme_id
   WHERE p.world_id=$1 AND p.promotion_id=ANY($2::text[])
    AND p.status='ACTIVE' AND p.heat IS NOT NULL
   GROUP BY p.promotion_id,p.programme_id,p.heat
   HAVING count(*)=2 AND count(*) FILTER(WHERE r.side='A')=1
     AND count(*) FILTER(WHERE r.side='B')=1
   ORDER BY p.promotion_id,p.heat DESC,p.programme_id LIMIT 257`,
   [worldId,promotionIds]),
  tx.query<{promotion_id:string;championship_id:string;person_id:string|null;prestige:number;booking_division:"MEN"|"WOMEN"|null}>(`
   SELECT c.promotion_id,c.championship_id,r.person_id,c.prestige,c.booking_division
    FROM ppw_championships c
    LEFT JOIN ppw_championship_reigns r ON r.world_id=c.world_id
     AND r.promotion_id=c.promotion_id
     AND r.championship_id=c.championship_id
     AND r.reign_id=c.current_reign_id
    WHERE c.world_id=$1 AND c.promotion_id=ANY($2::text[])
     AND c.status='ACTIVE' AND c.division='SINGLES'
     AND (c.current_reign_id IS NULL OR
      (r.status='ACTIVE' AND r.holder_type='PERSON' AND r.person_id IS NOT NULL))
   ORDER BY c.promotion_id,c.prestige DESC,c.championship_id LIMIT 257`,
   [worldId,promotionIds]),
  tx.query<{team_id:string;person_a:string;person_b:string}>(`
   SELECT g.team_id,min(t.person_id) AS person_a,max(t.person_id) AS person_b
   FROM ppw_tag_teams g
    JOIN ppw_tag_team_members t ON t.world_id=g.world_id
     AND t.team_id=g.team_id AND t.active
   WHERE g.world_id=$1 AND g.status='ACTIVE'
   GROUP BY g.team_id
   HAVING count(*)=2 ORDER BY g.team_id LIMIT 513`,[worldId]),
  tx.query<{promotion_id:string;championship_id:string;team_id:string|null;prestige:number;booking_division:"MEN"|"WOMEN"|null}>(`
   SELECT c.promotion_id,c.championship_id,r.team_id,c.prestige,c.booking_division
   FROM ppw_championships c LEFT JOIN ppw_championship_reigns r
     ON r.world_id=c.world_id AND r.promotion_id=c.promotion_id
    AND r.championship_id=c.championship_id
    AND r.reign_id=c.current_reign_id
   WHERE c.world_id=$1 AND c.promotion_id=ANY($2::text[])
    AND c.status='ACTIVE' AND c.division='TAG'
    AND (c.current_reign_id IS NULL OR
      (r.status='ACTIVE' AND r.holder_type='TEAM' AND r.team_id IS NOT NULL))
   ORDER BY c.promotion_id,c.prestige DESC,c.championship_id LIMIT 257`,
   [worldId,promotionIds]),
 ]);
 if(programmeRows.length>256||titleRows.length>256||teamRows.length>512||tagTitleRows.length>256)
  throw new Error("AI World booking context exceeds indexed bounds");
 const programmes=new Map<string,AiBookingContext["programmes"] extends Map<string,infer V>?V:never>();
 for(const row of programmeRows){
  const list=programmes.get(row.promotion_id)??[];
  list.push({aId:row.a_id,bId:row.b_id,kind:"PROGRAMME",
   programmeId:row.programme_id,heat:row.heat});
  programmes.set(row.promotion_id,list);
 }
 const championships=new Map<string,Array<{championshipId:string;holderId:string|null;heat:number;bookingDivision:"MEN"|"WOMEN"|null}>>();
 for(const row of titleRows){
  const list=championships.get(row.promotion_id)??[];
  list.push({championshipId:row.championship_id,holderId:row.person_id,heat:row.prestige,bookingDivision:row.booking_division});
  championships.set(row.promotion_id,list);
 }
 const partners=new Map<string,string[]>();
 for(const row of teamRows){
  const a=partners.get(row.person_a)??[],b=partners.get(row.person_b)??[];
  a.push(row.person_b);b.push(row.person_a);
  partners.set(row.person_a,a);partners.set(row.person_b,b);
 }
 const tagChampionships=new Map<string,Array<{championshipId:string;holderTeamId:string|null;heat:number;bookingDivision:"MEN"|"WOMEN"|null}>>();
 for(const row of tagTitleRows){
  const entries=tagChampionships.get(row.promotion_id)??[];
  entries.push({championshipId:row.championship_id,
   holderTeamId:row.team_id,heat:row.prestige,bookingDivision:row.booking_division});
  tagChampionships.set(row.promotion_id,entries);
 }
 return {programmes,championships,partners,
  teams:teamRows.map(r=>({teamId:r.team_id,aId:r.person_a,bId:r.person_b})),
  tagChampionships};
}
