import type {SqlRows} from "./world-operations.js";
import type {CertifiedContenderResult} from "../domain/earned-contenders.js";
/** Targeted canonical title, programme and established-team context.
 * Five bounded reads are per WORLD stage, never per show/match.
 * Nothing is inferred from an absent championship or unknown programme.
 */
export interface AiBookingContext{
 programmes:Map<string,Array<{aId:string;bId:string;kind:"PROGRAMME";
  programmeId:string;heat:number}>>;
 championships:Map<string,Array<{championshipId:string;holderId:string|null;heat:number;bookingDivision:"MEN"|"WOMEN"|null}>>;
 partners:Map<string,string[]>;
 teams:readonly {teamId:string;aId:string;bId:string}[];
 tagChampionships:Map<string,Array<{championshipId:string;holderTeamId:string|null;heat:number;bookingDivision:"MEN"|"WOMEN"|null}>>;
 /** Verified 13-week singles evidence; one read shared among all AI clubs. */
 recentSingles:Map<string,CertifiedContenderResult[]>;
 recentTags:Map<string,CertifiedContenderResult[]>;
}
export async function readWorldAiBookingContext(
 tx:SqlRows,worldId:string,promotionIds:readonly string[],weekIndex:number,
):Promise<AiBookingContext>{
 if(!Number.isSafeInteger(weekIndex)||weekIndex<0||
  promotionIds.length>128||new Set(promotionIds).size!==promotionIds.length)
  throw new Error("Invalid AI booking context batch");
 const [programmeRows,titleRows,teamRows,tagTitleRows,formRows]=await Promise.all([
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
   // One indexed narrow query for the entire AI World batch, not per club.
   tx.query<{promotion_id:string;show_id:string;match_id:string;
    person_id:string;performer_side:string;won:boolean;week_index:number;
    format:"SINGLES"|"TAG";
    popularity_before:number;rating_stars:number|null;
    title_match:boolean;major_event:boolean}>(`
    SELECT s.promotion_id,s.show_id,e.match_id,e.person_id,
     e.performer_side,e.won,e.format,(s.year-1)*52+s.week-1 AS week_index,
     coalesce((e.before_stats->>'popularity')::double precision,50)
      AS popularity_before,
     f.rating_stars::double precision AS rating_stars,
     EXISTS(SELECT 1 FROM ppw_championship_contests t
      WHERE t.world_id=s.world_id AND t.show_id=s.show_id
       AND t.slot_id=e.match_id) AS title_match,
     coalesce(d.event_type='MAJOR',false) AS major_event
    FROM ppw_completed_shows s
    JOIN (
     SELECT world_id,show_id,match_id,person_id,performer_side,won,
      before_stats,'SINGLES'::text AS format
     FROM ppw_individual_field_career_effects
     UNION ALL
     SELECT world_id,show_id,match_id,person_id,performer_side,won,
      before_stats,'TAG'::text AS format
     FROM ppw_tag_match_career_effects
    ) e ON e.world_id=s.world_id AND e.show_id=s.show_id
    LEFT JOIN ppw_booking_drafts d ON d.world_id=s.world_id
     AND d.draft_id=s.show_id
    LEFT JOIN ppw_completed_match_report_facts f ON f.world_id=s.world_id
     AND f.show_id=s.show_id AND f.match_id=e.match_id
    WHERE s.world_id=$1 AND s.promotion_id=ANY($2::text[])
     AND (s.year-1)*52+s.week-1 BETWEEN $3 AND $4
    ORDER BY s.year DESC,s.week DESC,s.promotion_id,e.match_id,e.person_id
    LIMIT 4097`,
    [worldId,promotionIds,Math.max(0,weekIndex-13),weekIndex-1]),
 ]);
 if(programmeRows.length>256||titleRows.length>256||teamRows.length>512||
  tagTitleRows.length>256||formRows.length>4096)
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
 const recentSingles=new Map<string,CertifiedContenderResult[]>();
 const grouped=new Map<string,Array<(typeof formRows)[number]>>();
 for(const row of formRows){
  const key=row.promotion_id+"\u0000"+row.show_id+"\u0000"+row.match_id+"\u0000"+row.format;
  const group=grouped.get(key)??[];group.push(row);grouped.set(key,group);
 }
 for(const group of grouped.values())for(const row of group){
  if(row.format!=="SINGLES")continue;
  const rivals=group.filter(x=>x.performer_side!==row.performer_side);
  if(!rivals.length)continue;
  const entries=recentSingles.get(row.promotion_id)??[];
  entries.push({id:row.person_id,format:"SINGLES",
   weekIndex:Number(row.week_index),won:row.won,
   opponentStrength:rivals.reduce((sum,x)=>sum+Number(x.popularity_before),0)/rivals.length,
   ratingStars:row.rating_stars===null?null:Number(row.rating_stars),
   titleMatch:row.title_match,majorEvent:row.major_event});
  recentSingles.set(row.promotion_id,entries);
 }
 const recentTags=new Map<string,CertifiedContenderResult[]>();
 const keyFor=(a:string,b:string)=>a<b?a+"\u0000"+b:b+"\u0000"+a;
 const teamsByPair=new Map(teamRows.map(t=>[keyFor(t.person_a,t.person_b),t.team_id]));
 for(const group of grouped.values()){
  if(group[0]?.format!=="TAG")continue;
  for(const side of new Set(group.map(x=>x.performer_side))){
   const teammates=group.filter(x=>x.performer_side===side);
   if(teammates.length!==2||teammates[0]!.won!==teammates[1]!.won)continue;
   const teamId=teamsByPair.get(keyFor(teammates[0]!.person_id,
    teammates[1]!.person_id));
   if(!teamId)continue;
   const foes=group.filter(x=>x.performer_side!==side);
   if(!foes.length)continue;
   const first=teammates[0]!;
   const records=recentTags.get(first.promotion_id)??[];
   records.push({id:teamId,format:"TAG",weekIndex:Number(first.week_index),
    won:first.won,opponentStrength:foes.reduce((sum,x)=>
     sum+Number(x.popularity_before),0)/foes.length,
    ratingStars:first.rating_stars===null?null:Number(first.rating_stars),
    titleMatch:first.title_match,majorEvent:first.major_event});
   recentTags.set(first.promotion_id,records);
  }
 }
 return {programmes,championships,partners,
  teams:teamRows.map(r=>({teamId:r.team_id,aId:r.person_a,bId:r.person_b})),
  tagChampionships,recentSingles,recentTags};
}
