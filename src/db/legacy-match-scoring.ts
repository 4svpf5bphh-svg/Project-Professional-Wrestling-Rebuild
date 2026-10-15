import type {TransactionPool} from "./transaction.js";
import {withWorldTransaction} from "./transaction.js";
import {readCardParticipants} from "../domain/card-participants.js";
import {adaptBookedSinglesMatch,type WrestlerSimReadiness}
  from "../simulation/booked-match-adapter.js";
import {scoreArchivedSinglesBeforeInjuries,type ScoredWrestler}
  from "../simulation/legacy/match-scoring.js";
import {DeterministicRng,deterministicSeedFromText}
  from "../simulation/legacy/rng.js";

export interface OriginalMatchScoringInput{worldId:string;promotionId:string;showId:string}
type PersonRow={
  person_id:string;status:string;booking_division:string|null;
  in_ring_quality:number|null;match_craft:number|null;presentation:number|null;
  stamina:number|null;safety:number|null;fatigue:number|null;wear:number|null;
  popularity:number|null;recognition:number|null;momentum:number|null;
};
type ChemistryRow={person_a_id:string;person_b_id:string;
  compatibility:string|number;familiarity:string|number;matches_together:number};
const pairKey=(a:string,b:string)=>a<b?a+"\\u0000"+b:b+"\\u0000"+a;
const pairIds=(a:string,b:string):[string,string]=>a<b?[a,b]:[b,a];
const assertStat=(v:unknown):v is number=>
  typeof v==="number"&&Number.isFinite(v)&&v>=0&&v<=100;
const readPerson=(r:PersonRow):ScoredWrestler=>{
  const all=[r.in_ring_quality,r.match_craft,r.presentation,r.stamina,
    r.safety,r.fatigue,r.wear,r.popularity,r.recognition,r.momentum];
  if(!all.every(assertStat))throw new Error("Original match scoring context is missing a wrestler attribute");
  return {skills:{
    inRingQuality:r.in_ring_quality!,matchCraft:r.match_craft!,
    presentation:r.presentation!,stamina:r.stamina!,safety:r.safety!,
  },fatigue:r.fatigue!,popularity:r.popularity!,
    recognition:r.recognition!,momentum:r.momentum!};
};

/** Reuses the original match and show rating equations with a bounded
 * current-week relational projection. This remains a non-mutating PREVIEW:
 * injuries, interference, fatigue consequences, World ledger and programme
 * flow must be integrated before publishing results.
 */
export async function previewArchivedShowMatchScores(pool:TransactionPool,input:OriginalMatchScoringInput){
  if(!input.worldId||!input.promotionId||!input.showId ||
    [input.worldId,input.promotionId,input.showId].some(v=>v.length>200))
    throw new Error("Invalid scoring scope");
  return withWorldTransaction(pool,async tx=>{
    const shows=await tx.query<{year:number;week:number;seed:string|number;
      event_importance:number|null}>(
      `SELECT d.year,d.week,w.seed,d.event_importance
        FROM ppw_booking_drafts d
        JOIN ppw_worlds w ON w.world_id=d.world_id
          AND w.year=d.year AND w.week=d.week AND w.phase='RESOLVING'
        JOIN ppw_promotions p ON p.world_id=d.world_id
          AND p.promotion_id=d.promotion_id AND p.lifecycle='ACTIVE'
        JOIN ppw_week_resource_clearances c ON c.world_id=d.world_id
          AND c.year=d.year AND c.week=d.week
        WHERE d.world_id=$1 AND d.promotion_id=$2 AND d.draft_id=$3
          AND d.status='SUBMITTED' FOR UPDATE OF w`,
      [input.worldId,input.promotionId,input.showId],
    );
    if(shows.length!==1)throw new Error("A cleared submitted resolving show is required");
    const show=shows[0]!;
    if(!assertStat(show.event_importance))
      throw new Error("Original event importance has not been migrated");
    const slots=await tx.query<{
      slot_id:string;position:number;kind:string;payload:unknown;
    }>(
      `SELECT slot_id,position,kind,payload FROM ppw_card_slots
        WHERE world_id=$1 AND draft_id=$2 ORDER BY position LIMIT 101`,
      [input.worldId,input.showId],
    );
    if(slots.length===0||slots.length>100)throw new Error("Invalid scored show card");
    const matches=slots.filter(s=>s.kind==="MATCH");
    if(matches.length===0)throw new Error("No matches on scored show");
    const appearances=new Set<string>();
    const pairMap=new Map<string,[string,string]>();
    for(const slot of matches){
      const ids=readCardParticipants(slot.payload);
      if(ids.length!==2||ids[0]!.personId===ids[1]!.personId)
        throw new Error("Original first-version scoring supports singles only");
      const [a,b]=pairIds(ids[0]!.personId,ids[1]!.personId);
      appearances.add(a);appearances.add(b);
      pairMap.set(pairKey(a,b),[a,b]);
    }
    if(appearances.size>100||pairMap.size>100)
      throw new Error("Original match scoring input too large");
    const persons=await tx.query<PersonRow>(
      `SELECT person_id,status,booking_division,in_ring_quality,match_craft,
        presentation,stamina,safety,fatigue,wear,popularity,recognition,momentum
         FROM ppw_people WHERE world_id=$1 AND person_id=ANY($2::text[])`,
      [input.worldId,[...appearances].sort()],
    );
    if(persons.length!==appearances.size)
      throw new Error("Scoring wrestler not found in World");
    const talent=new Map<string,ScoredWrestler>();
    const divisions=new Map<string,string>();
    for(const p of persons){
      if(p.status!=="ACTIVE")throw new Error("Inactive wrestler cannot be scored");
      if(p.booking_division!=="MEN"&&p.booking_division!=="WOMEN")
        throw new Error("Missing canonical booking division for scoring");
      talent.set(p.person_id,readPerson(p));divisions.set(p.person_id,p.booking_division);
    }
    const pairs=[...pairMap.values()].sort((a,b)=>
      pairKey(...a).localeCompare(pairKey(...b),"en"));
    const chemistry=await tx.query<ChemistryRow>(
      `SELECT c.person_a_id,c.person_b_id,c.compatibility,
            c.familiarity,c.matches_together
         FROM ppw_working_chemistry c
         JOIN unnest($2::text[],$3::text[]) AS asked(a,b)
           ON c.person_a_id=asked.a AND c.person_b_id=asked.b
        WHERE c.world_id=$1 AND c.context='SINGLES'`,
      [input.worldId,pairs.map(p=>p[0]),pairs.map(p=>p[1])],
    );
    if(chemistry.length>pairs.length)throw new Error("Duplicate chemistry records");
    const mutableChem=new Map<string,{compatibility:number;familiarity:number}>();
    for(const c of chemistry){
      const compatibility=Number(c.compatibility),familiarity=Number(c.familiarity);
      if(!Number.isFinite(compatibility)||compatibility < -12||compatibility>13||
        !assertStat(familiarity))throw new Error("Invalid historical chemistry record");
      mutableChem.set(pairKey(c.person_a_id,c.person_b_id),{compatibility,familiarity});
    }
    const worldSeed=String(show.seed);
    const readiness=new Map<string,WrestlerSimReadiness>(talent);
    const projections=matches.map((slot,index)=>{
      const match=adaptBookedSinglesMatch(slot.payload,readiness);
      if(divisions.get(match.personIds[0])!==divisions.get(match.personIds[1]))
        throw new Error("Mixed booking division cannot be scored as singles");
      const [a,b]=pairIds(match.personIds[0],match.personIds[1]);
      const key=pairKey(a,b);
      let chem=mutableChem.get(key);
      if(!chem){
        const rng=new DeterministicRng(deterministicSeedFromText(
          `${worldSeed}:chemistry:SINGLES:${a}:${b}`));
        chem={compatibility:Math.round(rng.float(-12,13)*10)/10,familiarity:0};
        mutableChem.set(key,chem);
      }
      // getOrCreateChemistry in original matches.ts applies current familiarity
      // THEN increments by 3. Mirror that in local memory for repeated bouts.
      const chemistryModifier=chem.compatibility*(0.45+chem.familiarity/180)+
        Math.min(5,chem.familiarity/10);
      chem.familiarity=Math.min(100,chem.familiarity+3);
      const score=scoreArchivedSinglesBeforeInjuries({
        worldSeed,matchId:`${input.showId}:${slot.slot_id}`,
        order:index+1,eventImportance:show.event_importance!,
        intent:match.intent,style:match.explicitStyle?match.style:null,
        plannedFinish:match.plannedFinish,
        plannedLengthMinutes:match.plannedLengthMinutes,chemistryModifier,
        people:[talent.get(match.personIds[0])!,talent.get(match.personIds[1])!],
      });
      return {slotId:slot.slot_id,position:slot.position,winnerId:match.winnerId,
        plannedFinish:match.plannedFinish,readiness:match.status,
        chemistryModifier:Math.round(chemistryModifier*1000)/1000,score};
    });
    return {worldId:input.worldId,promotionId:input.promotionId,showId:input.showId,
      year:show.year,week:show.week,stage:"PRE_INJURY_PRE_INTERFERENCE_PRE_SHOW_FLOW" as const,
      projections};
  });
}
