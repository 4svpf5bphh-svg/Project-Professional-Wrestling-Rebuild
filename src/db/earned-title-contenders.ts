/** Owner-only contender evidence from canonical career receipts.
 * Three indexed, bounded reads on the already-open Championships page;
 * no archive hydration, no background polling, no per-belt request.
 */
import type {SqlRows} from "./world-operations.js";
import {rankEarnedContenders,type ContenderCandidate,
 type CertifiedContenderResult,type EarnedContender} from "../domain/earned-contenders.js";
import type {ChampionshipCard} from "./championship-history.js";

type RosterRow={person_id:string;name:string;booking_division:"MEN"|"WOMEN";
 status:string;
 momentum:number;popularity:number};
type TeamRow={team_id:string;name:string;members:string[]};
type EvidenceRow={
 show_id:string;match_id:string;family:"INDIVIDUAL"|"TAG";
 person_id:string;performer_side:string;won:boolean;week_index:number;
 popularity_before:number;rating_stars:number|string|null;
 title_match:boolean;major_event:boolean;
};
const teamKey=(members:readonly string[])=>[...members].sort().join("\u0000");
export async function readEarnedTitleContendersInTransaction(
 tx:SqlRows,worldId:string,promotionId:string,currentWeekIndex:number,
 titles:readonly ChampionshipCard[],
):Promise<Record<string,EarnedContender[]>>{
 if(!worldId||!promotionId||!Number.isSafeInteger(currentWeekIndex)||
  currentWeekIndex<0||titles.length>200)
  throw new Error("Invalid earned-contender scope");
 const roster=await tx.query<RosterRow>(`
  SELECT DISTINCT ON (p.person_id) p.person_id,p.name,p.booking_division,p.status,
   p.momentum,p.popularity
  FROM ppw_people p JOIN ppw_contracts c ON c.world_id=p.world_id
    AND c.person_id=p.person_id AND c.promotion_id=$2
  WHERE p.world_id=$1 AND (p.status='ACTIVE' OR p.person_id=ANY($4::text[]))
    AND p.booking_division IN ('MEN','WOMEN')
    AND c.status='SIGNED' AND c.start_week_index<=$3
    AND c.expires_week_index>=$3
    AND (c.remaining_dates>0 OR
      (c.family='EXCLUSIVE' AND c.remaining_dates IS NULL))
  ORDER BY p.person_id,c.start_week_index DESC,c.contract_id
  LIMIT 257`,[worldId,promotionId,currentWeekIndex,
   titles.filter(t=>t.promotionId===promotionId).map(t=>t.holderId)
    .filter((x):x is string=>x!==null)]);
 if(roster.length>256)throw new Error("Contender signed roster limit exceeded");
 const own=new Map(roster.map(p=>[p.person_id,p]));
 const teams=await tx.query<TeamRow>(`
  SELECT t.team_id,t.name,
   array_agg(m.person_id ORDER BY m.person_id) AS members
  FROM ppw_tag_teams t
  JOIN ppw_tag_team_members m ON m.world_id=t.world_id
    AND m.team_id=t.team_id AND m.active
  WHERE t.world_id=$1 AND t.status='ACTIVE'
   AND m.person_id=ANY($2::text[])
  GROUP BY t.world_id,t.team_id,t.name
  HAVING count(*)=2 AND count(*)=(
   SELECT count(*) FROM ppw_tag_team_members allm
   WHERE allm.world_id=t.world_id AND allm.team_id=t.team_id
    AND allm.active)
  ORDER BY t.team_id LIMIT 257`,[worldId,roster.map(p=>p.person_id)]);
 if(teams.length>256)throw new Error("Contender tag-team limit exceeded");
 const pairToTeam=new Map<string,TeamRow>();
 const candidates:ContenderCandidate[]=roster.filter(p=>p.status==="ACTIVE").map(p=>({
  id:p.person_id,name:p.name,format:"SINGLES",division:p.booking_division,
  momentum:Number(p.momentum),popularity:Number(p.popularity)
 }));
 for(const team of teams){
  const people=team.members.map(id=>own.get(id));
  if(people.length!==2||people.some(p=>!p||p.status!=="ACTIVE")||
   people[0]!.booking_division!==
   people[1]!.booking_division)continue;
  const key=teamKey(team.members);
  if(pairToTeam.has(key))continue;
  pairToTeam.set(key,team);
  candidates.push({id:team.team_id,name:team.name,format:"TAG",
   division:people[0]!.booking_division,
   momentum:(Number(people[0]!.momentum)+Number(people[1]!.momentum))/2,
   popularity:(Number(people[0]!.popularity)+Number(people[1]!.popularity))/2});
 }
 const history=await tx.query<EvidenceRow>(`
 WITH completed AS (
  SELECT s.world_id,s.show_id,(s.year-1)*52+s.week-1 AS week_index,
   (d.event_type='MAJOR') AS major_event
  FROM ppw_completed_shows s
  LEFT JOIN ppw_booking_drafts d ON d.world_id=s.world_id
   AND d.draft_id=s.show_id
  WHERE s.world_id=$1 AND s.promotion_id=$2
    AND (s.year-1)*52+s.week-1 BETWEEN $3 AND $4
  ORDER BY s.year DESC,s.week DESC,s.show_id LIMIT 110
 ), career AS (
  SELECT s.world_id,s.show_id,s.week_index,s.major_event,
   e.match_id,e.person_id,e.performer_side,e.won,e.before_stats,
   'INDIVIDUAL'::text AS family
  FROM completed s JOIN ppw_individual_field_career_effects e
   ON e.world_id=s.world_id AND e.show_id=s.show_id
  UNION ALL
  SELECT s.world_id,s.show_id,s.week_index,s.major_event,
   e.match_id,e.person_id,e.performer_side,e.won,e.before_stats,
   'TAG'::text AS family
  FROM completed s JOIN ppw_tag_match_career_effects e
   ON e.world_id=s.world_id AND e.show_id=s.show_id
 )
 SELECT e.show_id,e.match_id,e.family,e.person_id,e.performer_side,e.won,
  e.week_index,coalesce((e.before_stats->>'popularity')::double precision,50)
    AS popularity_before,
  f.rating_stars::double precision AS rating_stars,
  EXISTS(SELECT 1 FROM ppw_championship_contests c
   WHERE c.world_id=e.world_id AND c.show_id=e.show_id
     AND c.slot_id=e.match_id) AS title_match,
  coalesce(e.major_event,false) AS major_event
 FROM career e LEFT JOIN ppw_completed_match_report_facts f
   ON f.world_id=e.world_id AND f.show_id=e.show_id
   AND f.match_id=e.match_id
 ORDER BY e.week_index DESC,e.show_id,e.match_id,e.family,e.person_id
 LIMIT 2001`,
  [worldId,promotionId,Math.max(0,currentWeekIndex-25),currentWeekIndex]);
 if(history.length>2000)
  throw new Error("Contender certified history exceeds bounded window");
 const matches=new Map<string,EvidenceRow[]>();
 for(const h of history){
  const key=h.family+"\u0000"+h.show_id+"\u0000"+h.match_id;
  const group=matches.get(key)??[];group.push(h);matches.set(key,group);
 }
 const results:CertifiedContenderResult[]=[];
 for(const group of matches.values()){
  const exemplar=group[0]!,weekIndex=Number(exemplar.week_index);
  const rating=exemplar.rating_stars===null?null:Number(exemplar.rating_stars);
  const strength=(foes:EvidenceRow[])=>foes.reduce((sum,p)=>
   sum+Number(p.popularity_before),0)/foes.length;
  if(exemplar.family==="INDIVIDUAL"){
   for(const p of group){
    if(!own.has(p.person_id))continue;
    const opponents=group.filter(x=>x.performer_side!==p.performer_side);
    if(!opponents.length)continue;
    results.push({id:p.person_id,format:"SINGLES",weekIndex,won:p.won,
     opponentStrength:strength(opponents),ratingStars:rating,
     titleMatch:p.title_match,majorEvent:p.major_event});
   }
  }else{
   for(const side of new Set(group.map(p=>p.performer_side))){
    const members=group.filter(p=>p.performer_side===side);
    if(members.length!==2)continue; // A 3v3 is not a recognised 2v2 tag result.
    const team=pairToTeam.get(teamKey(members.map(x=>x.person_id)));
    if(!team||!members.every(p=>p.won===members[0]!.won))continue;
    const foes=group.filter(p=>p.performer_side!==side);
    if(!foes.length)continue;
    results.push({id:team.team_id,format:"TAG",weekIndex,
     won:members[0]!.won,opponentStrength:strength(foes),
     ratingStars:rating,titleMatch:members[0]!.title_match,
     majorEvent:members[0]!.major_event});
   }
  }
 }
 const earned:Record<string,EarnedContender[]>={};
 for(const title of titles){
  if(title.promotionId!==promotionId||title.status!=="ACTIVE")continue;
  // Titles predating PPW's gender divisions have booking_division NULL.
  // A held legacy belt follows its *real* champion's division. Vacant open
  // belts compare both eligible pools without forging a gender or holder.
  const holderPerson=title.division==="SINGLES"&&title.holderId?
   own.get(title.holderId):undefined;
  const holderTeam=title.division==="TAG"&&title.holderId?
   teams.find(t=>t.team_id===title.holderId):undefined;
  const holderTeamPeople=holderTeam?.members.map(id=>own.get(id))??[];
  const holderTeamDivision=holderTeamPeople.length===2&&
   holderTeamPeople[0]?.booking_division===holderTeamPeople[1]?.booking_division?
    holderTeamPeople[0]?.booking_division:undefined;
  // A medically absent reigning champion still defines an unassigned belt's
  // division. An open vacant belt can consider either eligible division.
  const division=title.bookingDivision??holderPerson?.booking_division??
   holderTeamDivision;
  const divisions:readonly ("MEN"|"WOMEN")[]=division?[division]:["MEN","WOMEN"];
  const board=divisions.flatMap(division=>rankEarnedContenders({
   candidates,results,currentWeekIndex,limit:5,
   format:title.division,division,championId:title.holderId}));
  earned[title.championshipId]=board.sort((a,b)=>b.score-a.score||
   b.wins-a.wins||a.name.localeCompare(b.name,"en")||
   a.id.localeCompare(b.id,"en"))
   .slice(0,5).map((x,i)=>({...x,rank:i+1}));
 }
 return earned;
}
