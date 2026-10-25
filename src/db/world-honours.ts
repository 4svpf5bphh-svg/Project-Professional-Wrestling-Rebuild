/** Public historic honours. Fed ONLY by completed, certified World weeks.
 * Nothing here grants currency, a playable legend or a competitive advantage.
 */
import type {SqlRows} from "./world-operations.js";
import type {WorldNewsStory,WeeklyAward} from "./world-news.js";
import type {TransactionPool} from "./transaction.js";
import {withSqlClient} from "./postgres.js";

export interface WorldMoment{
 key:string;kind:"CLASSIC"|"TITLE"|"TURN"|"EVENT";
 headline:string;description:string;promotionName:string;showId:string;
}
export function chooseWorldMoments(
 awards:readonly WeeklyAward[],stories:readonly WorldNewsStory[]):WorldMoment[]{
 const found:WorldMoment[]=[];
 const add=(key:string,kind:WorldMoment["kind"],headline:string,
  description:string,promotionName:string,showId:string)=>{
  if(found.some(x=>x.key===key))return;
  found.push({key,kind,headline:headline.slice(0,240),
   description:description.slice(0,500),promotionName,showId});
 };
 for(const item of stories.filter(s=>s.desk==="OFFICIAL"&&s.sourceKind==="TITLE")
  .sort((a,b)=>a.key.localeCompare(b.key))){
  add(item.key,"TITLE",item.title,item.summary,item.promotionName,item.showId);
 }
 for(const a of awards.filter(a=>a.kind==="MATCH"&&a.rating>=4.75)
  .sort((a,b)=>b.rating-a.rating||a.showId.localeCompare(b.showId))){
  add("classic:"+a.showId+":"+a.slotId,"CLASSIC",
   a.title+" delivers a World classic",
   a.rating.toFixed(2)+" stars at "+a.showName+".",
   a.promotionName,a.showId);
 }
 for(const item of stories.filter(s=>s.desk==="OFFICIAL"&&
  s.sourceKind==="ANGLE"&&/\bturn\b/i.test(s.title))
  .sort((a,b)=>a.key.localeCompare(b.key))){
  add(item.key,"TURN",item.title,item.summary,item.promotionName,item.showId);
 }
 for(const item of stories.filter(s=>s.desk==="OFFICIAL"&&
  s.sourceKind==="EVENT").sort((a,b)=>a.key.localeCompare(b.key))){
  add(item.key,"EVENT",item.title,item.summary,item.promotionName,item.showId);
 }
 return found.slice(0,4);
}

export async function publishCertifiedWorldHeritage(tx:SqlRows,worldId:string,
 year:number,week:number,awards:readonly WeeklyAward[],
 stories:readonly WorldNewsStory[]){
 const moments=chooseWorldMoments(awards,stories);
 if(moments.length)await tx.query(`
  INSERT INTO ppw_world_moments(world_id,year,week,moment_key,kind,
   headline,description,promotion_name,show_id)
  SELECT $1,$2,$3,x.key,x.kind,x.headline,x.description,
   x.promotion_name,x.show_id FROM jsonb_to_recordset($4::jsonb) AS x(
    key text,kind text,headline text,description text,promotion_name text,show_id text)
  ON CONFLICT DO NOTHING`,[worldId,year,week,JSON.stringify(moments.map(x=>({
   key:x.key,kind:x.kind,headline:x.headline,description:x.description,
   promotion_name:x.promotionName,show_id:x.showId
  })))]);
 if(week!==52)return {moments:moments.length,annual:0,inducted:0};
 // A migrated World that began recording midyear cannot claim full-year
 // awards or confer induction on incomplete public history.
 const checkpoint=await tx.query<{n:string}>(`
  SELECT count(*)::text AS n FROM ppw_world_news_weeks
  WHERE world_id=$1 AND year=$2`,[worldId,year]);
 if(Number(checkpoint[0]?.n)!==52)
  return {moments:moments.length,annual:0,inducted:0};
 let annual=0;
 // MATCH and ANGLE annual trophies are chosen from actual weekly winners,
 // not calculated from private cards or based on an unfinished World year.
 const winners=await tx.query<{kind:"MATCH"|"ANGLE";week:number;slot_id:string;
  title:string;promotion_id:string;promotion_name:string;rating:string}>(`
  SELECT DISTINCT ON(kind) kind,week,slot_id,title,promotion_id,promotion_name,
   rating::text FROM ppw_world_news_awards
  WHERE world_id=$1 AND year=$2 ORDER BY kind,rating DESC,week,
   promotion_id,show_id,slot_id`,[worldId,year]);
 for(const winner of winners){
  await tx.query(`
   INSERT INTO ppw_world_year_honours(world_id,year,category,subject_id,
    subject_name,promotion_id,promotion_name,citation,source_week)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING`,
   [worldId,year,winner.kind,winner.slot_id,winner.title,
    winner.promotion_id,winner.promotion_name,
    winner.kind==="MATCH"?Number(winner.rating).toFixed(2)+" certified stars":
     Math.round(Number(winner.rating))+"/100 crowd reaction",winner.week]);
  annual++;
 }
 // Actual outcome career effects are authoritative and already cover
 // singles/multis and tag sides. Weight skill and victories with sensible
 // sample-size protection. No popularity or hidden ability is an award vote.
 const wrestlers=await tx.query<{division:"MEN"|"WOMEN";
  person_id:string;name:string;matches:number;wins:number;
  average_stars:string;score:string}>(`
  WITH activity AS (
   SELECT world_id,show_id,match_id,person_id,won
    FROM ppw_individual_field_career_effects WHERE world_id=$1
   UNION ALL
   SELECT world_id,show_id,match_id,person_id,won
    FROM ppw_tag_match_career_effects WHERE world_id=$1
  ), scored AS (
   SELECT p.booking_division AS division,p.person_id,p.name,
    count(*)::integer AS matches,
    count(*) FILTER(WHERE a.won)::integer AS wins,
    round(avg(f.rating_stars),2)::text AS average_stars,
    round(avg(f.rating_stars)*20+
     20*count(*) FILTER(WHERE a.won)::numeric/greatest(count(*),1)+
     least(count(*),24)*0.65,3)::text AS score
   FROM activity a
   JOIN ppw_completed_shows c ON c.world_id=a.world_id AND c.show_id=a.show_id
   JOIN ppw_people p ON p.world_id=a.world_id AND p.person_id=a.person_id
   JOIN ppw_completed_match_report_facts f ON f.world_id=a.world_id
    AND f.show_id=a.show_id AND f.match_id=a.match_id
   WHERE c.year=$2 AND p.booking_division IN ('MEN','WOMEN')
    AND f.rating_stars IS NOT NULL
   GROUP BY p.booking_division,p.person_id,p.name
   HAVING count(*)>=3
  ), winners AS (
   SELECT *,row_number() OVER(PARTITION BY division
    ORDER BY score::numeric DESC,average_stars::numeric DESC,
     wins DESC,matches DESC,name,person_id) AS position
   FROM scored
  )
  SELECT division,person_id,name,matches,wins,average_stars,score
  FROM winners WHERE position=1 ORDER BY division`,[worldId,year]);
 for(const w of wrestlers){
  await tx.query(`
   INSERT INTO ppw_world_year_honours(world_id,year,category,subject_id,
    subject_name,citation)
   VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
   [worldId,year,"WRESTLER_"+w.division,w.person_id,w.name,
    w.wins+" wins in "+w.matches+" matches · "+
    Number(w.average_stars).toFixed(2)+" average stars"]);
  annual++;
 }
 const promotions=await tx.query<{promotion_id:string;name:string;
  events:number;avg_crowd:string;avg_stars:string|null}>(`
  WITH events AS (
   SELECT promotion_id,count(*)::integer AS events,
    avg(crowd_response)::numeric AS crowd
   FROM ppw_completed_shows WHERE world_id=$1 AND year=$2
   GROUP BY promotion_id HAVING count(*)>=3
  ), ratings AS (
   SELECT c.promotion_id,avg(f.rating_stars)::numeric AS stars
   FROM ppw_completed_shows c
   JOIN ppw_completed_match_report_facts f
    ON f.world_id=c.world_id AND f.show_id=c.show_id
   WHERE c.world_id=$1 AND c.year=$2 GROUP BY c.promotion_id
  )
  SELECT p.promotion_id,p.name,e.events,round(e.crowd,1)::text AS avg_crowd,
   round(r.stars,2)::text AS avg_stars FROM events e
  JOIN ppw_promotions p ON p.world_id=$1 AND p.promotion_id=e.promotion_id
  LEFT JOIN ratings r ON r.promotion_id=e.promotion_id
  ORDER BY (e.crowd+coalesce(r.stars,0)*7+least(e.events,24)*0.3) DESC,
   e.crowd DESC,e.events DESC,p.name,p.promotion_id LIMIT 1
  `,[worldId,year]);
 const company=promotions[0];
 if(company){
  await tx.query(`
   INSERT INTO ppw_world_year_honours(world_id,year,category,subject_id,
    subject_name,promotion_id,promotion_name,citation)
   VALUES($1,$2,'PROMOTION',$3,$4,$3,$4,$5) ON CONFLICT DO NOTHING`,
   [worldId,year,company.promotion_id,company.name,
    company.events+" completed shows · "+
    Number(company.avg_crowd).toFixed(1)+"/100 average crowd"]);
  annual++;
 }
 return {moments:moments.length,annual};
}

/** Run AFTER living-career settlement in the SAME rollover transaction.
 * Week-52 retirements must be eligible for their actual graduating class.
 */
export async function publishYearEndHallOfFame(tx:SqlRows,worldId:string,
 year:number,week:number){
 if(week!==52)return 0;
 const check=await tx.query<{n:string}>(`
  SELECT count(*)::text AS n FROM ppw_world_news_weeks
  WHERE world_id=$1 AND year=$2`,[worldId,year]);
 if(Number(check[0]?.n)!==52)return 0;
 // A historical Hall of Fame is harder to earn than a weekly feature.
 // Induct retirees who have PROVEN careers, up to three per annual class.
 // Not connected to playable legends or points; no player can nominate self.
 const candidates=await tx.query<{person_id:string;name:string;
  division:"MEN"|"WOMEN";matches:number;wins:number;
  best_stars:string;average_stars:string}>(`
  WITH retirees AS (
   SELECT DISTINCT e.payload->>'personId' AS person_id
   FROM ppw_ledger_events e WHERE e.world_id=$1 AND e.year=$2
    AND e.event_type='WRESTLER_RETIRED'
  ), career AS (
   SELECT world_id,show_id,match_id,person_id,won
    FROM ppw_individual_field_career_effects WHERE world_id=$1
   UNION ALL
   SELECT world_id,show_id,match_id,person_id,won
    FROM ppw_tag_match_career_effects WHERE world_id=$1
  )
  SELECT p.person_id,p.name,p.booking_division AS division,
   count(*)::integer AS matches,
   count(*) FILTER(WHERE a.won)::integer AS wins,
   max(f.rating_stars)::text AS best_stars,
   round(avg(f.rating_stars),2)::text AS average_stars
  FROM retirees r
  JOIN ppw_people p ON p.world_id=$1 AND p.person_id=r.person_id
  JOIN career a ON a.world_id=p.world_id AND a.person_id=p.person_id
  JOIN ppw_completed_match_report_facts f
   ON f.world_id=a.world_id AND f.show_id=a.show_id AND f.match_id=a.match_id
  WHERE p.status='RETIRED' AND p.booking_division IN ('MEN','WOMEN')
   AND f.rating_stars IS NOT NULL
   AND NOT EXISTS(SELECT 1 FROM ppw_world_hall_of_fame hall
    WHERE hall.world_id=$1 AND hall.person_id=p.person_id)
  GROUP BY p.person_id,p.name,p.booking_division
  HAVING count(*)>=24 AND count(*) FILTER(WHERE a.won)>=12
   AND max(f.rating_stars)>=4.25
  ORDER BY count(*) DESC,max(f.rating_stars) DESC,p.name,p.person_id LIMIT 3
  `,[worldId,year]);
 for(const c of candidates){
  await tx.query(`
   INSERT INTO ppw_world_hall_of_fame(world_id,person_id,wrestler_name,
    division,inducted_year,career_matches,career_wins,best_stars)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING`,
   [worldId,c.person_id,c.name,c.division,year,c.matches,c.wins,
    Number(c.best_stars)]);
 }
 return candidates.length;
}

export async function readWorldHeritage(pool:TransactionPool,
 scope:{worldId:string;promotionId:string;playerId:string}){
 if(!Object.values(scope).every(s=>typeof s==="string"&&s.length>0&&s.length<=200))
  throw new Error("Invalid World history viewer");
 return withSqlClient(pool,async tx=>{
  const allowed=await tx.query<{year:number;week:number}>(`
   SELECT w.year,w.week FROM ppw_worlds w
   JOIN ppw_promotion_controls c ON c.world_id=w.world_id
    AND c.promotion_id=$3 AND c.player_id=$2 AND c.active
   JOIN ppw_memberships m ON m.world_id=w.world_id AND m.player_id=$2
    AND m.status='ACTIVE'
   JOIN ppw_promotions p ON p.world_id=w.world_id
    AND p.promotion_id=$3 AND p.lifecycle='ACTIVE'
   WHERE w.world_id=$1`,[scope.worldId,scope.playerId,scope.promotionId]);
  if(allowed.length!==1)throw new Error("World history access denied");
  const [honours,hall,moments]=await Promise.all([
   tx.query<{year:number;category:string;subject_id:string;subject_name:string;
    promotion_name:string|null;citation:string;source_week:number|null}>(`
    SELECT year,category,subject_id,subject_name,promotion_name,
     citation,source_week FROM ppw_world_year_honours
    WHERE world_id=$1 ORDER BY year DESC,category LIMIT 40`,[scope.worldId]),
   tx.query<{person_id:string;wrestler_name:string;division:string;
    inducted_year:number;career_matches:number;career_wins:number;
    best_stars:string}>(`
    SELECT person_id,wrestler_name,division,inducted_year,
     career_matches,career_wins,best_stars::text
    FROM ppw_world_hall_of_fame WHERE world_id=$1
    ORDER BY inducted_year DESC,career_matches DESC,wrestler_name,person_id
    LIMIT 48`,[scope.worldId]),
   tx.query<{year:number;week:number;moment_key:string;kind:WorldMoment["kind"];
    headline:string;description:string;promotion_name:string;show_id:string}>(`
    SELECT year,week,moment_key,kind,headline,description,promotion_name,show_id
    FROM ppw_world_moments WHERE world_id=$1
    ORDER BY year DESC,week DESC,
     CASE kind WHEN 'TITLE' THEN 0 WHEN 'CLASSIC' THEN 1
      WHEN 'TURN' THEN 2 ELSE 3 END,moment_key LIMIT 40`,[scope.worldId])
  ]);
  return {
   honours:honours.map(h=>({year:h.year,category:h.category,
    subjectId:h.subject_id,name:h.subject_name,promotionName:h.promotion_name,
    citation:h.citation,week:h.source_week})),
   hall:hall.map(h=>({personId:h.person_id,name:h.wrestler_name,
    division:h.division,year:h.inducted_year,matches:h.career_matches,
    wins:h.career_wins,bestStars:Number(h.best_stars)})),
   moments:moments.map(m=>({id:m.moment_key,year:m.year,week:m.week,
    kind:m.kind,title:m.headline,description:m.description,
    promotionName:m.promotion_name,showId:m.show_id}))
  };
 });
}
