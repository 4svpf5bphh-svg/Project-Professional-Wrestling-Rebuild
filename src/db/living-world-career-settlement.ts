/** Restored original main career.ts. Only certified match evidence enters this
 * set-based World-owned settlement. Runs INSIDE the locked week publication;
 * never on reads, clocks, cron, player commands or an AI result. */
import type {SqlRows} from "./world-operations.js";
import {originalCareerWeek,type CareerStage,type CareerState,type CareerStatus}
 from "../domain/living-career.js";
import {originalGeneratedProspect} from "../domain/generated-prospect.js";
import {publishRetiredStaffCandidates} from "./retired-staff-succession.js";
import {DeterministicRng,deterministicSeedFromText} from "../simulation/legacy/rng.js";
type Row={person_id:string;name:string;status:CareerStatus;career_stage:CareerStage|null;
 biological_age:number|null;career_experience:number|null;
 development_aptitude:number|null;wear:number|null;
 recognition:number|null;popularity:number|null;in_ring_quality:number|null;
 match_craft:number|null;safety:number|null;stamina:number|null;
 presentation:number|null;matches:number;stars:string|number|null};
const finite=(x:unknown)=>typeof x==="number"&&Number.isFinite(x);
export async function settleLivingWrestlerCareers(tx:SqlRows,worldId:string,year:number,week:number){
 if(!worldId||worldId.length>200||!Number.isSafeInteger(year)||year<1||
  !Number.isSafeInteger(week)||week<1||week>52)throw new Error("Invalid career World week");
 const weekIndex=(year-1)*52+week-1;
 const clocks=await tx.query<{seed:string|number;talent_population_target:number|null}>(`
 SELECT seed,talent_population_target FROM ppw_worlds WHERE world_id=$1`,[worldId]);
 if(clocks.length!==1)throw new Error("Missing career World");
 const people=await tx.query<Row>(`
 WITH done AS (
  SELECT show_id FROM ppw_completed_shows
  WHERE world_id=$1 AND year=$2 AND week=$3
 ), bouts AS (
  -- Singles matches previously had no normalized career-effect child rows:
  -- derive ONLY the two verified card participants from an immutable
  -- completed-match report. This also handles legacy two-person card layouts.
  SELECT fighter.item->>'personId' AS person_id,
   f.rating_stars::double precision AS stars
  FROM done d
  JOIN ppw_card_slots card ON card.world_id=$1 AND card.draft_id=d.show_id
   AND card.kind='MATCH'
  JOIN ppw_completed_show_matches match ON match.world_id=card.world_id
   AND match.show_id=d.show_id AND match.match_id=card.slot_id
  JOIN ppw_completed_match_report_facts f ON f.world_id=match.world_id
   AND f.show_id=match.show_id AND f.match_id=match.match_id
  CROSS JOIN LATERAL jsonb_array_elements(card.payload->'participants')
   AS fighter(item)
  WHERE jsonb_typeof(card.payload->'participants')='array'
   AND jsonb_array_length(card.payload->'participants')=2
   AND (card.payload->'sides' IS NULL OR
    (jsonb_typeof(card.payload->'sides')='array' AND
     jsonb_array_length(card.payload->'sides')=2 AND
     (SELECT count(*) FROM jsonb_array_elements(card.payload->'sides') side
       WHERE jsonb_typeof(side->'participants')='array'
        AND jsonb_array_length(side->'participants')=1)=2))
   AND fighter.item->>'personId' IS NOT NULL
  UNION ALL
  SELECT e.person_id,f.rating_stars::double precision AS stars
  FROM done d JOIN ppw_individual_field_career_effects e
   ON e.world_id=$1 AND e.show_id=d.show_id
  JOIN ppw_completed_match_report_facts f ON f.world_id=e.world_id
   AND f.show_id=e.show_id AND f.match_id=e.match_id
  UNION ALL
  SELECT e.person_id,f.rating_stars::double precision AS stars
  FROM done d JOIN ppw_tag_match_career_effects e
   ON e.world_id=$1 AND e.show_id=d.show_id
  JOIN ppw_completed_match_report_facts f ON f.world_id=e.world_id
   AND f.show_id=e.show_id AND f.match_id=e.match_id
 ), matches AS (
  SELECT person_id,count(*)::integer AS matches,avg(stars) AS stars
  FROM bouts GROUP BY person_id
 )
 SELECT p.person_id,p.name,p.status,p.career_stage,p.biological_age,
  p.career_experience,p.development_aptitude,p.wear,p.recognition,
  p.popularity,p.in_ring_quality,p.match_craft,p.safety,p.stamina,
  p.presentation,coalesce(m.matches,0) AS matches,m.stars
 FROM ppw_people p LEFT JOIN matches m ON m.person_id=p.person_id
 WHERE p.world_id=$1 ORDER BY p.person_id LIMIT 2501`,[worldId,year,week]);
 if(people.length>2500)throw new Error("Career population exceeded original World bound");
 const saved:{
  person_id:string;before_age:number;age:number;experience:number;
  career_stage:CareerStage;ring:number;craft:number;safety:number;
  stamina:number;presentation:number;retire:boolean;from_stage:CareerStage
 }[]=[];
 let missingOriginal=0;
 for(const p of people){
  if(p.status==="RETIRED")continue;
  if(p.career_stage===null||!finite(p.biological_age)||
   !finite(p.career_experience)||!finite(p.development_aptitude)||
   !finite(p.wear)||!finite(p.popularity)||!finite(p.recognition)||
   !finite(p.in_ring_quality)||!finite(p.match_craft)||!finite(p.safety)||
   !finite(p.stamina)||!finite(p.presentation)){
   missingOriginal++;continue;
  }
  const previous:CareerState={
   biologicalAge:p.biological_age!,careerExperience:p.career_experience!,
   developmentAptitude:p.development_aptitude!,careerStage:p.career_stage,
   status:p.status,wear:p.wear!,popularity:p.popularity!,recognition:p.recognition!,
   skills:{inRingQuality:p.in_ring_quality!,matchCraft:p.match_craft!,
    safety:p.safety!,stamina:p.stamina!,presentation:p.presentation!}};
  const change=originalCareerWeek(previous,p.matches,
   p.stars===null?0:Number(p.stars));
  const rng=new DeterministicRng(deterministicSeedFromText(
   `${clocks[0]!.seed}:${weekIndex}:${p.person_id}:retirement`));
  const retired=change.retirementProbability>0&&rng.chance(change.retirementProbability);
  saved.push({person_id:p.person_id,before_age:p.biological_age!,
   age:change.next.biologicalAge,experience:change.next.careerExperience,
   career_stage:change.next.careerStage,ring:change.next.skills.inRingQuality,
   craft:change.next.skills.matchCraft,safety:change.next.skills.safety,
   stamina:change.next.skills.stamina,presentation:change.next.skills.presentation,
   retire:retired,from_stage:p.career_stage});
 }
 if(saved.length){
  const updated=await tx.query<{person_id:string}>(`
   UPDATE ppw_people p SET biological_age=x.age,
    career_experience=x.experience,career_stage=x.career_stage,
    in_ring_quality=x.ring,match_craft=x.craft,safety=x.safety,
    stamina=x.stamina,presentation=x.presentation,
    status=CASE WHEN x.retire THEN 'RETIRED' ELSE p.status END,
    fatigue=CASE WHEN x.retire THEN 0 ELSE p.fatigue END
   FROM jsonb_to_recordset($2::jsonb) x(
    person_id text,before_age double precision,age double precision,
    experience double precision,career_stage text,ring double precision,
    craft double precision,safety double precision,stamina double precision,
    presentation double precision,retire boolean,from_stage text)
   WHERE p.world_id=$1 AND p.person_id=x.person_id
    AND p.status<>'RETIRED' AND p.biological_age=x.before_age
   RETURNING p.person_id`,[worldId,JSON.stringify(saved)]);
  if(updated.length!==saved.length)throw new Error("Career baseline changed during World settlement");
  const stage=saved.filter(x=>x.from_stage!==x.career_stage);
  if(stage.length)await tx.query(`
   INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)
   SELECT $1,$3,$4,'CAREER_STAGE_CHANGED',
    jsonb_build_object('personId',x.person_id,'from',x.from_stage,
     'to',x.career_stage,'age',round(x.age::numeric,1),
     'significance',CASE WHEN x.career_stage='SPECIAL_ATTRACTION'
      THEN 'NOTABLE' ELSE 'ROUTINE' END)
   FROM jsonb_to_recordset($2::jsonb) x(person_id text,
    from_stage text,career_stage text,age double precision)
   `,[worldId,JSON.stringify(stage),year,week]);
 }
 const retired=saved.filter(x=>x.retire).map(x=>x.person_id);
 if(retired.length){
  const retiredRows=people.filter(p=>retired.includes(p.person_id));
  // Contract and pending negotiation consequences are authoritative; a
  // retirement may never rewrite the already certified scripted match.
  await tx.query(`UPDATE ppw_contracts SET status='TERMINATED',revision=revision+1
   WHERE world_id=$1 AND person_id=ANY($2::text[]) AND status='SIGNED'`,
   [worldId,retired]);
  await tx.query(`UPDATE ppw_contract_offers SET status='WITHDRAWN',
   rejection_reason='wrestler retired'
   WHERE world_id=$1 AND person_id=ANY($2::text[]) AND status='PENDING'`,
   [worldId,retired]);
  await tx.query(`UPDATE ppw_contract_renewal_proposals SET status='WITHDRAWN'
   WHERE world_id=$1 AND person_id=ANY($2::text[])
    AND status IN ('PENDING','ACCEPTED')`,[worldId,retired]);
  await tx.query(`UPDATE ppw_medical_absences SET status='RECOVERED'
   WHERE world_id=$1 AND person_id=ANY($2::text[]) AND status='ACTIVE'`,
   [worldId,retired]);
  // Vacate singles or affected active-team reigns; preserve immutable reigns.
  const vacated=await tx.query<{promotion_id:string;championship_id:string;reign_id:string}>(`
   SELECT r.promotion_id,r.championship_id,r.reign_id
   FROM ppw_championship_reigns r
   JOIN ppw_championships c ON c.world_id=r.world_id
    AND c.promotion_id=r.promotion_id
    AND c.championship_id=r.championship_id AND c.current_reign_id=r.reign_id
   WHERE r.world_id=$1 AND r.status='ACTIVE'
    AND (r.person_id=ANY($2::text[])
     OR (r.holder_type='TEAM' AND EXISTS(
      SELECT 1 FROM ppw_tag_team_members member
      WHERE member.world_id=r.world_id AND member.team_id=r.team_id
       AND member.person_id=ANY($2::text[]) AND member.active)))`,
   [worldId,retired]);
  if(vacated.length){
   await tx.query(`
    UPDATE ppw_championship_reigns r SET status='ENDED',ended_week_index=$3
    FROM jsonb_to_recordset($2::jsonb) x(
     promotion_id text,championship_id text,reign_id text)
    WHERE r.world_id=$1 AND r.promotion_id=x.promotion_id
     AND r.championship_id=x.championship_id AND r.reign_id=x.reign_id
     AND r.status='ACTIVE'`,[worldId,JSON.stringify(vacated),weekIndex]);
   await tx.query(`
    UPDATE ppw_championships c SET current_reign_id=NULL
    FROM jsonb_to_recordset($2::jsonb) x(
     promotion_id text,championship_id text,reign_id text)
    WHERE c.world_id=$1 AND c.promotion_id=x.promotion_id
     AND c.championship_id=x.championship_id
     AND c.current_reign_id=x.reign_id`,[worldId,JSON.stringify(vacated)]);
  }
  await tx.query(`UPDATE ppw_tag_team_members SET active=false
   WHERE world_id=$1 AND person_id=ANY($2::text[]) AND active`,[worldId,retired]);
  await tx.query(`INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)
   SELECT $1,$3,$4,'WRESTLER_RETIRED',
    jsonb_build_object('personId',x.person_id,'name',x.name,
     'age',round(x.biological_age::numeric,1),'wear',x.wear,
     'reason',CASE WHEN x.wear>=88 THEN 'physical wear' ELSE 'career timing' END,
     'significance',CASE WHEN greatest(x.popularity,x.recognition)>=75
      THEN 'MAJOR' ELSE 'NOTABLE' END)
   FROM jsonb_to_recordset($2::jsonb) x(
    person_id text,name text,biological_age double precision,
    wear double precision,popularity double precision,recognition double precision)`,
   [worldId,JSON.stringify(retiredRows),year,week]);
  await publishRetiredStaffCandidates(tx,worldId,retired,weekIndex);
 }
 let generated=0;
 const target=clocks[0]!.talent_population_target;
 // No invented population target for legacy fixtures: genuine Genesis
 // has the exact original target on its World row.
 if(target!==null){
  const alive=people.length-people.filter(p=>p.status==="RETIRED").length-retired.length;
  const floor=Math.ceil(target*.96);
  if(alive<floor){
   generated=Math.min(2,target-alive,2500-people.length);
   if(generated<0)generated=0;
  }
 }
 if(generated>0){
  const market=await tx.query<{market_id:string}>(`
   SELECT market_id FROM ppw_markets WHERE world_id=$1 ORDER BY market_id LIMIT 129`,
   [worldId]);
  if(market.length===0||market.length>128)throw new Error("Cannot locate original prospect territories");
  const generatedPeople=Array.from({length:generated},(_,i)=>{
   const seq=weekIndex*2+i+1;
   return originalGeneratedProspect({seed:clocks[0]!.seed,weekIndex,sequence:seq,
    personId:`generated-${weekIndex}-${i+1}`,
    marketIds:market.map(x=>x.market_id)});
  });
  const inserted=await tx.query<{person_id:string}>(`
   INSERT INTO ppw_people(world_id,person_id,name,status,career_stage,
    biological_age,career_experience,development_aptitude,
    generated_talent,debut_week_index,home_market_id,
    recognition,popularity,momentum,fatigue,wear,morale,
    in_ring_quality,match_craft,safety,stamina,presentation,
    contract_priorities,booking_division,default_alignment,portable_gimmick_id)
   SELECT $1,x.id,x.name,'ACTIVE','PROSPECT',x.age,x.experience,
    x.aptitude,true,$3,x.market,x.recognition,x.popularity,x.momentum,
    x.fatigue,x.wear,x.morale,x.ring,x.craft,x.safety,x.stamina,
    x.presentation,x.priorities,x.division,x.alignment,x.gimmick
   FROM jsonb_to_recordset($2::jsonb) x(
    id text,name text,age double precision,experience double precision,
    aptitude double precision,market text,recognition double precision,
    popularity double precision,momentum double precision,fatigue double precision,
    wear double precision,morale double precision,ring double precision,
    craft double precision,safety double precision,stamina double precision,
    presentation double precision,priorities jsonb,division text,alignment text,gimmick text)
   RETURNING person_id`,[worldId,JSON.stringify(generatedPeople.map(p=>({
    id:p.id,name:p.name,age:p.biologicalAge,experience:p.careerExperience,
    aptitude:p.developmentAptitude,market:p.homeMarketId,
    recognition:p.recognition,popularity:p.popularity,momentum:p.momentum,
    fatigue:p.fatigue,wear:p.wear,morale:p.morale,
    ring:p.skills.inRingQuality,craft:p.skills.matchCraft,safety:p.skills.safety,
    stamina:p.skills.stamina,presentation:p.skills.presentation,
    priorities:p.priorities,division:p.division,alignment:p.alignment,
    gimmick:p.persona.gimmickId
   }))),weekIndex]);
  if(inserted.length!==generated)throw new Error("Unsettled new wrestling generation");
  const identities=await tx.query<{person_id:string}>(`
   INSERT INTO ppw_portable_personas(world_id,person_id,revision,persona,
    provenance,introduced_week_index)
   SELECT $1,x.id,1,x.persona,'GAME_AUTHORED',$3
   FROM jsonb_to_recordset($2::jsonb) x(id text,persona jsonb)
   RETURNING person_id`,
   [worldId,JSON.stringify(generatedPeople.map(p=>({id:p.id,persona:p.persona}))),weekIndex]);
  if(identities.length!==generated)throw new Error("Generated prospect lacks real portable identity");
  await tx.query(`INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)
   SELECT $1,$3,$4,'WRESTLER_DEBUTED',
    jsonb_build_object('personId',x.id,'name',x.name,'age',x.age,
     'homeMarketId',x.market,'generatedTalent',true,'significance',
      CASE WHEN x.aptitude>=90 THEN 'NOTABLE' ELSE 'ROUTINE' END)
   FROM jsonb_to_recordset($2::jsonb) x(id text,name text,
    age double precision,market text,aptitude double precision)`,
   [worldId,JSON.stringify(generatedPeople.map(p=>({
    id:p.id,name:p.name,age:p.biologicalAge,market:p.homeMarketId,
    aptitude:p.developmentAptitude}))),year,week]);
 }
 return {evolved:saved.length,missingOriginal,retired:retired.length,generated};
}
