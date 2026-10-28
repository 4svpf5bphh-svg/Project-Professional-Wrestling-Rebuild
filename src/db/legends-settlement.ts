/** Legends awaken from immutable certified results during the EXISTING rollover.
 * Exactly one bounded week scan; progress is incremental rather than rescanning
 * the entire career archive. One processed-week row guards every side effect.
 */
import type {SqlRows} from "./world-operations.js";
import {readCardParticipants} from "../domain/card-participants.js";
import {validatePortablePersona} from "../domain/portable-persona.js";
import {LIVE_LEGENDS,legendUnlockEligible,type LegendMetric,type PrimeLegend,type LegendDefinition}
 from "../domain/legends-catalogue.js";
import {planCertifiedLegendReleases} from "../domain/legend-release-cadence.js";

interface MatchRow extends Record<string,unknown> {
 match_id:string;position:number;last_position:number;
 rating_stars:string|null;booking_class:string;payload:unknown;
 actual_finish?:string;crowd_response?:number;
 evidence_json:{booking?:{family?:string}}|null;
}
const emptyMetrics=():Record<LegendMetric,number>=>({
 CLASSICS:0,HOT_ANGLES:0,DIRTY_FINISHES:0,MASTERPIECES:0,
 WOMENS_CLASSICS:0,TAG_CLASSICS:0,TITLE_CHANGES:0,LONGEST_REIGN:0,
 PREMIUM_MAIN_EVENTS:0,HARDCORE_CLASSICS:0,HARDCORE_MATCHES:0,
 SUBMISSIONS:0,WEEKLY_CLASSICS:0,BIG_REACTIONS:0,
 TAG_MASTERPIECES:0,WOMENS_MASTERPIECES:0,PREMIUM_CLASSICS:0,
 MAIN_EVENT_CLASSICS:0,FIVE_STARS:0,STIPULATED_CLASSICS:0
});
export function computeCertifiedLegendMatchMetrics(
 bouts:readonly MatchRow[],divisions:ReadonlyMap<string,string>,
):Record<LegendMetric,number>{
 const metric=emptyMetrics();
 const danger=new Set(["HARDCORE","STEEL_CAGE","LADDER","TABLES","TLC","LAST_MAN_STANDING"]);
 const stipulated=new Set([...danger,"SUBMISSION"]);
 for(const m of bouts){
  const stars=m.rating_stars===null?NaN:Number(m.rating_stars);
  if(!Number.isFinite(stars)||stars<0||stars>5)continue;
  const cast=readCardParticipants(m.payload).map(x=>x.personId);
  if(cast.length<2)continue;
  if(stars>=4.25)metric.CLASSICS++;
  if(stars>=4.75)metric.MASTERPIECES++;
  if(stars>=4&&cast.every(id=>divisions.get(id)==="WOMEN"))
   metric.WOMENS_CLASSICS++;
  if(stars>=4.25&&m.evidence_json?.booking?.family==="TEAMS")
   metric.TAG_CLASSICS++;
  if(stars>=4.25&&m.booking_class==="PREMIUM"&&m.position===m.last_position)
   metric.PREMIUM_MAIN_EVENTS++;
  const raw=m.payload as Record<string,unknown>;
  const stip=typeof raw.stipulation==="string"?raw.stipulation:"STANDARD";
  if(stipulated.has(stip)&&stars>=4.25)metric.STIPULATED_CLASSICS++;
  if(danger.has(stip)){
   metric.HARDCORE_MATCHES++;
   if(stars>=4)metric.HARDCORE_CLASSICS++;
  }
  if(m.actual_finish==="SUBMISSION")metric.SUBMISSIONS++;
  if(m.booking_class==="REGULAR"&&stars>=4)metric.WEEKLY_CLASSICS++;
  if(stars>=4.25&&m.booking_class==="PREMIUM")metric.PREMIUM_CLASSICS++;
  if(m.position===m.last_position&&stars>=4.5)metric.MAIN_EVENT_CLASSICS++;
  if(stars>=4.99)metric.FIVE_STARS++;
  if(Number(m.crowd_response)>=90)metric.BIG_REACTIONS++;
  if(stars>=4.75&&cast.every(id=>divisions.get(id)==="WOMEN"))
   metric.WOMENS_MASTERPIECES++;
  if(stars>=4.75&&m.evidence_json?.booking?.family==="TEAMS")
   metric.TAG_MASTERPIECES++;
 }
 return metric;
}
function moves(p:PrimeLegend){
 const category=p.style==="POWERHOUSE"?"POWER":
  p.style==="LUCHA"?"AERIAL":p.style==="TECHNICAL"?"GRAPPLE":
  p.style==="SUBMISSION"?"SUBMISSION":p.style==="STRIKER"?"STRIKE":"OTHER";
 return validatePortablePersona({
  personaName:p.name,gimmickId:p.gimmickId,primaryStyle:p.style,
  secondaryStyle:null,signatureMoves:[{name:p.signature,category,source:"VERIFIED"}],
  finishingMoves:[{name:p.finisher,category,source:"VERIFIED"}],source:"CURATED"
 },p.name);
}
const priorities={money:65,role:75,prestige:70,schedule:50,loyalty:55,exposure:60};
export async function settleCertifiedWorldLegends(
 tx:SqlRows,worldId:string,year:number,week:number,
 /** Trusted integration-test override only: Production always uses LIVE_LEGENDS. */
 eligibleCatalogue:readonly LegendDefinition[]=LIVE_LEGENDS,
){
 if(!worldId||!Number.isSafeInteger(year)||year<1||
  !Number.isSafeInteger(week)||week<1||week>52)
  throw new Error("Invalid certified legend week");
 const seal=await tx.query<{certified_promotions:number}>(`
  SELECT s.certified_promotions FROM ppw_week_resolution_seals s
  JOIN ppw_world_news_weeks n ON n.world_id=s.world_id
   AND n.year=s.year AND n.week=s.week
  WHERE s.world_id=$1 AND s.year=$2 AND s.week=$3
 `,[worldId,year,week]);
 if(!seal.length||seal[0]!.certified_promotions<1)
  throw new Error("Legends cannot be evaluated before certified World results");
 const claimed=await tx.query<{world_id:string}>(`
  INSERT INTO ppw_legend_processed_weeks(world_id,year,week)
  VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING world_id
 `,[worldId,year,week]);
 if(!claimed.length)return {processed:false,unlocked:[] as string[]};
 const currentIndex=(year-1)*52+week-1;
 const matches=await tx.query<MatchRow>(`
  SELECT m.match_id,m.position,
    max(m.position) OVER (PARTITION BY m.show_id) AS last_position,
    f.rating_stars::text,d.booking_class,slot.payload,e.evidence_json,
    m.actual_finish,m.crowd_response
  FROM ppw_completed_shows s
  JOIN ppw_completed_show_matches m ON m.world_id=s.world_id AND m.show_id=s.show_id
  JOIN ppw_completed_match_report_facts f ON f.world_id=m.world_id
   AND f.show_id=m.show_id AND f.match_id=m.match_id
  JOIN ppw_booking_drafts d ON d.world_id=s.world_id AND d.draft_id=s.show_id
  JOIN ppw_card_slots slot ON slot.world_id=m.world_id
   AND slot.draft_id=m.show_id AND slot.slot_id=m.match_id
  JOIN ppw_completed_match_evidence e ON e.world_id=m.world_id
   AND e.show_id=m.show_id AND e.match_id=m.match_id
  WHERE s.world_id=$1 AND s.year=$2 AND s.week=$3
  ORDER BY s.show_id,m.position LIMIT 3001
 `,[worldId,year,week]);
 if(matches.length>3000)throw new Error("Legend match evidence exceeded World safety bound");
 const ids=[...new Set(matches.flatMap(m=>readCardParticipants(m.payload).map(x=>x.personId)))];
 const people=ids.length?await tx.query<{person_id:string;booking_division:string|null}>(`
  SELECT person_id,booking_division FROM ppw_people
  WHERE world_id=$1 AND person_id=ANY($2::text[])
 `,[worldId,ids]):[];
 const divisions=new Map(people.map(x=>[x.person_id,x.booking_division??""]));
 const metric=emptyMetrics();
 Object.assign(metric,computeCertifiedLegendMatchMetrics(matches,divisions));
 const [segments,dirty,contests,reign]=await Promise.all([
  tx.query<{count:string}>(`
   SELECT count(*)::text AS count FROM ppw_completed_show_segments a
   JOIN ppw_completed_shows s ON s.world_id=a.world_id AND s.show_id=a.show_id
   WHERE s.world_id=$1 AND s.year=$2 AND s.week=$3
    AND a.authored_outcome='HAPPENS' AND a.crowd_response>=88
  `,[worldId,year,week]),
  tx.query<{count:string}>(`
   SELECT count(*)::text AS count FROM ppw_completed_dirty_finishes
   WHERE world_id=$1 AND week_index=$2
  `,[worldId,currentIndex]),
  tx.query<{count:string}>(`
   SELECT count(*)::text AS count FROM ppw_championship_contests t
   JOIN ppw_completed_shows s ON s.world_id=t.world_id AND s.show_id=t.show_id
   WHERE s.world_id=$1 AND s.year=$2 AND s.week=$3 AND t.title_changed
  `,[worldId,year,week]),
  tx.query<{longest:number|null}>(`
   SELECT max(GREATEST(0,coalesce(ended_week_index,$2)-start_week_index))::integer AS longest
   FROM ppw_championship_reigns WHERE world_id=$1 AND start_week_index<=$2
  `,[worldId,currentIndex])
 ]);
 metric.HOT_ANGLES=Number(segments[0]?.count??0);
 metric.DIRTY_FINISHES=Number(dirty[0]?.count??0);
 metric.TITLE_CHANGES=Number(contests[0]?.count??0);
 metric.LONGEST_REIGN=Math.max(0,Number(reign[0]?.longest??0));
 const totals=await tx.query<{metric:LegendMetric;value:number}>(`
  INSERT INTO ppw_legend_metrics AS existing(world_id,metric,value)
  SELECT $1,x.metric,x.value FROM jsonb_to_recordset($2::jsonb) x(metric text,value integer)
  ON CONFLICT(world_id,metric) DO UPDATE SET value=
   CASE WHEN excluded.metric='LONGEST_REIGN'
    THEN greatest(existing.value,excluded.value)
    ELSE existing.value+excluded.value END
  RETURNING metric,value
 `,[worldId,JSON.stringify(Object.entries(metric).map(([k,v])=>({metric:k,value:v})))]);
 const total=Object.fromEntries(totals.map(x=>[x.metric,x.value])) as Record<LegendMetric,number>;
 // A one-off authorised test fires only after THIS operator's actual regular
 // completed show has been certified. An AI show, draft or off-week cannot fire.
 const pilots=await tx.query<{promotion_id:string}>(`
  SELECT p.promotion_id FROM ppw_legend_reveal_pilots p
  WHERE p.world_id=$1 AND p.status='ARMED'
   AND ((p.armed_year-1)*52+p.armed_week) <= (($2-1)*52+$3)
   AND EXISTS (
    SELECT 1 FROM ppw_completed_shows s
    JOIN ppw_booking_drafts d ON d.world_id=s.world_id
     AND d.draft_id=s.show_id AND d.booking_class='REGULAR'
    WHERE s.world_id=p.world_id AND s.promotion_id=p.promotion_id
     AND s.year=$2 AND s.week=$3
   ) FOR UPDATE OF p
 `,[worldId,year,week]);
 const pilotReady=pilots.length===1;
 const winners=[...eligibleCatalogue.filter(x=>legendUnlockEligible(x,total))];
 if(pilotReady&&!winners.some(x=>x.id==="undertaker")){
  const testLegend=eligibleCatalogue.find(x=>x.id==="undertaker");
  if(testLegend)winners.push(testLegend);
 }
 if(!winners.length)return {processed:true,unlocked:[] as string[]};
 const old=await tx.query<{legend_id:string;year:number;week:number}>(`
  SELECT legend_id,year,week FROM ppw_world_legend_unlocks WHERE world_id=$1
  `,[worldId]);
 const done=new Set(old.map(x=>x.legend_id));
 const candidate=winners.filter(x=>!done.has(x.id));
 if(!candidate.length)return {processed:true,unlocked:[] as string[]};
 const nameKeys=[...new Set(candidate.flatMap(x=>x.roster.map(p=>p.name.toLowerCase())))];
 const duplicates=await tx.query<{name:string}>(`
  SELECT name FROM ppw_people WHERE world_id=$1 AND lower(name)=ANY($2::text[])
 `,[worldId,nameKeys]);
 const reserved=new Set(duplicates.map(x=>x.name.toLowerCase()));
 const possible=candidate.filter(x=>x.roster.every(p=>!reserved.has(p.name.toLowerCase())));
 // Earned milestones may queue; one ordinary reveal/market arrival per three
 // certified World weeks. An explicitly armed test pilot consumes its own week.
 const plan=planCertifiedLegendReleases(possible,old.map(r=>({
  id:r.legend_id,year:r.year,week:r.week
 })),year,week,total,pilotReady?"undertaker":null);
 const accepted=plan.selected;
 const arrived:string[]=[];
 for(const legend of accepted){
  // Keep the same stable identifiers on replay and across all promotions.
  const people=legend.roster.map((p,i)=>({
   id:"legend:"+legend.id+":"+i,
   name:p.name,age:p.age,ring:p.ring,craft:p.craft,
   recognition:p.recognition,popularity:p.popularity,presentation:p.presentation,
   stamina:p.stamina,safety:p.safety,division:p.division,alignment:p.alignment,
   gimmick:p.gimmickId,persona:moves(p),priorities
  }));
  const existing=await tx.query<{person_id:string}>(`
   SELECT person_id FROM ppw_people WHERE world_id=$1 AND person_id=ANY($2::text[])
  `,[worldId,people.map(p=>p.id)]);
  if(existing.length)continue;
  const added=await tx.query<{person_id:string}>(`
   INSERT INTO ppw_people(world_id,person_id,name,status,career_stage,
    biological_age,career_experience,development_aptitude,generated_talent,
    debut_week_index,recognition,popularity,momentum,fatigue,wear,morale,
    in_ring_quality,match_craft,presentation,stamina,safety,
    contract_priorities,booking_division,default_alignment,portable_gimmick_id)
   SELECT $1,x.id,x.name,'ACTIVE','PRIME',x.age,14,70,false,$3,
    x.recognition,x.popularity,70,0,0,82,x.ring,x.craft,x.presentation,
    x.stamina,x.safety,x.priorities,x.division,x.alignment,x.gimmick
   FROM jsonb_to_recordset($2::jsonb) x(
    id text,name text,age double precision,recognition smallint,popularity smallint,
    ring smallint,craft smallint,presentation smallint,stamina smallint,safety smallint,
    priorities jsonb,division text,alignment text,gimmick text)
   RETURNING person_id
  `,[worldId,JSON.stringify(people),currentIndex+1]);
  if(added.length!==people.length)throw new Error("Partial Legend arrival prevented");
  await tx.query(`
   INSERT INTO ppw_portable_personas(world_id,person_id,revision,persona,provenance,introduced_week_index)
   SELECT $1,x.id,1,x.persona,'CURATED',$3
   FROM jsonb_to_recordset($2::jsonb) x(id text,persona jsonb)
  `,[worldId,JSON.stringify(people),currentIndex+1]);
  if(legend.roster.length>1){
   const teamId="legend-team:"+legend.id;
   await tx.query(`
    INSERT INTO ppw_tag_teams(world_id,team_id,name,status) VALUES($1,$2,$3,'ACTIVE')
   `,[worldId,teamId,legend.name]);
   await tx.query(`
    INSERT INTO ppw_tag_team_members(world_id,team_id,person_id,active)
    SELECT $1,$2,unnest($3::text[]),true
   `,[worldId,teamId,people.map(p=>p.id)]);
  }
  await tx.query(`
   INSERT INTO ppw_world_legend_unlocks(world_id,legend_id,year,week,
    metric,evidence_value,person_ids,ai_eligible_from_week_index)
   VALUES($1,$2,$3,$4,$5,$6,$7::text[],$8)
  `,[worldId,legend.id,year,week,
   pilotReady&&legend.id==="undertaker"?"PILOT_WEEKLY_SHOW":legend.metric,
   pilotReady&&legend.id==="undertaker"?1:total[legend.metric!],
   people.map(p=>p.id),currentIndex+1]);
  await tx.query(`
   INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)
   VALUES($1,$2,$3,'LEGEND_ARRIVED',$4::jsonb)
  `,[worldId,year,week,JSON.stringify({
    legendId:legend.id,name:legend.name,tier:legend.tier,
    personIds:people.map(p=>p.id),market:"FREE_AGENT"
   })]);
  if(pilotReady&&legend.id==="undertaker")await tx.query(`
   UPDATE ppw_legend_reveal_pilots SET status='CONSUMED',
    consumed_year=$2,consumed_week=$3 WHERE world_id=$1 AND status='ARMED'
  `,[worldId,year,week]);
  arrived.push(legend.id);
 }
 return {processed:true,unlocked:arrived};
}
