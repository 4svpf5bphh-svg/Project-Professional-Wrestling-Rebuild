import type {TransactionPool} from "./transaction.js";
import type {SqlRows} from "./world-operations.js";
import {withWorldTransaction} from "./transaction.js";
import {readCardParticipants,appearancesFromSlots} from "../domain/card-participants.js";
import {readCanonicalMatchLayout,requireSupportedScoringLayout} from "../domain/match-sides.js";
import {simulateBookedTagMatch} from "../simulation/tag-match-simulation.js";
import {simulateMultiIndividualMatch} from "../simulation/multi-individual-match.js";
import {isBookableMatchFinish,type MatchFinish} from "../simulation/legacy/match-finishes.js";
import type {MatchIntent} from "../simulation/legacy/types.js";
import {adaptBookedSinglesMatch,type WrestlerSimReadiness}
  from "../simulation/booked-match-adapter.js";
import {scoreArchivedSinglesBeforeInjuries,type ScoredWrestler}
  from "../simulation/legacy/match-scoring.js";
import {previewArchivedInjuryStoppage} from "../simulation/legacy/match-injuries.js";
import {readBookedInterference,previewArchivedInterference}
  from "../simulation/legacy/match-interference.js";
import {previewArchivedMatchConsequences}
  from "../simulation/legacy/match-consequences.js";
import {evaluateArchivedMatchPacing,type PacingMatch}
  from "../simulation/legacy/show-pacing.js";
import {evaluateArchivedShowAlignments,combineArchivedPacingAndAlignments,
 type WrestlerAlignment,type AlignmentChangeMethod}
 from "../simulation/legacy/show-alignment.js";
import {evaluateArchivedProgrammeReactions} from "../simulation/legacy/show-programmes.js";
import {combineArchivedShowMatchContext} from "../simulation/legacy/show-context.js";
import {evaluateArchivedFinishReactions,type FinishedCheatingMatch,
 type HistoricalDirtyFinish} from "../simulation/legacy/show-finishes.js";
import {DeterministicRng,deterministicSeedFromText}
  from "../simulation/legacy/rng.js";

export interface OriginalMatchScoringInput{worldId:string;promotionId:string;showId:string}
type PersonRow={
  person_id:string;status:string;booking_division:string|null;
  in_ring_quality:number|null;match_craft:number|null;presentation:number|null;
  stamina:number|null;safety:number|null;fatigue:number|null;wear:number|null;
  popularity:number|null;recognition:number|null;momentum:number|null;
  default_alignment:WrestlerAlignment|null;
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
    recognition:r.recognition!,momentum:r.momentum!,wear:r.wear!};
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
  return withWorldTransaction(pool,tx=>previewArchivedShowMatchScoresInTransaction(tx,input));
}
export async function previewArchivedShowMatchScoresInTransaction(
 tx:SqlRows,input:OriginalMatchScoringInput,
){
    const shows=await tx.query<{year:number;week:number;seed:string|number;
      event_importance:number|null;injury_rate_multiplier:string|number|null;
      media_reach:number|null;alignment_history_loaded:boolean;programme_history_loaded:boolean;
      dirty_finish_history_loaded:boolean;linked_programme_matches:boolean}>(
      `SELECT d.year,d.week,w.seed,d.event_importance,w.injury_rate_multiplier,
          w.alignment_history_loaded,w.programme_history_loaded,
          w.dirty_finish_history_loaded,p.media_reach,
          EXISTS(SELECT 1 FROM ppw_programme_match_activities a
            WHERE a.world_id=d.world_id AND a.draft_id=d.draft_id
              AND a.promotion_id=d.promotion_id AND a.kind='MATCH')
          AS linked_programme_matches
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
    const interferers=new Set<string>();
    const bookedForShow=new Set<string>();
    // A contracted run-in is a genuine appearance, even without an extra
    // angle. Existing participant and run-in contracts were checked together
    // before World resource clearance. No extra wrestler query.
    for(const p of appearancesFromSlots(slots.map(s=>s.payload)))
      bookedForShow.add(p.personId);
    const pairMap=new Map<string,[string,string]>();
    const tagPairs=new Map<string,[string,string]>();
    const layouts=matches.map(m=>readCanonicalMatchLayout(m.payload));
    for(const [i,slot] of matches.entries()){
      const layout=layouts[i]!;
      const kind=requireSupportedScoringLayout(layout);
      const interruption=readBookedInterference(slot.payload);
      if(interruption)interferers.add(interruption.personId);
      const ids=readCardParticipants(slot.payload);
      for(const p of ids)appearances.add(p.personId);
      if(kind==="SINGLES"){
        const [a,b]=pairIds(ids[0]!.personId,ids[1]!.personId);
        pairMap.set(pairKey(a,b),[a,b]);
      }else if(kind==="TAG"){
        for(const side of layout.sides){
          for(let i=0;i<side.participants.length;i++){
            for(let j=i+1;j<side.participants.length;j++){
              const [a,b]=pairIds(side.participants[i]!.personId,
                side.participants[j]!.personId);
              tagPairs.set(pairKey(a,b),[a,b]);
            }
          }
        }
      }
    }
    if(appearances.size>100||pairMap.size>100||
       tagPairs.size>500||interferers.size>100)
      throw new Error("Original match scoring input too large");
    const allPeople=[...new Set([...appearances,...interferers])].sort();
    if(allPeople.length>200)throw new Error("World-scoped scoring roster exceeds batch limit");
    const persons=await tx.query<PersonRow>(
      `SELECT person_id,status,booking_division,in_ring_quality,match_craft,
        presentation,stamina,safety,fatigue,wear,popularity,recognition,momentum,
        default_alignment
         FROM ppw_people WHERE world_id=$1 AND person_id=ANY($2::text[])`,
      [input.worldId,allPeople],
    );
    if(persons.filter(p=>appearances.has(p.person_id)).length!==appearances.size)
      throw new Error("Scoring wrestler not found in World");
    const interfererProfiles=new Map(persons.map(p=>[p.person_id,p]));
    const talent=new Map<string,ScoredWrestler>();
    const divisions=new Map<string,string>();
    const baseAlignments=new Map<string,WrestlerAlignment|null>();
    for(const p of persons){
      baseAlignments.set(p.person_id,p.default_alignment);
      if(!appearances.has(p.person_id))continue;
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
    const tags=[...tagPairs.values()].sort((a,b)=>
      pairKey(...a).localeCompare(pairKey(...b),"en"));
    const tagChemistry=tags.length?await tx.query<ChemistryRow>(`
      SELECT c.person_a_id,c.person_b_id,c.compatibility,
       c.familiarity,c.matches_together FROM ppw_working_chemistry c
      JOIN unnest($2::text[],$3::text[]) AS asked(a,b)
       ON c.person_a_id=asked.a AND c.person_b_id=asked.b
      WHERE c.world_id=$1 AND c.context='TAG'`,
      [input.worldId,tags.map(x=>x[0]),tags.map(x=>x[1])]):[];
    if(tagChemistry.length>tags.length)throw new Error("Duplicate tag chemistry");
    const mutableTagChem=new Map<string,{compatibility:number;familiarity:number}>();
    for(const c of tagChemistry){
      const compatibility=Number(c.compatibility),familiarity=Number(c.familiarity);
      if(!Number.isFinite(compatibility)||compatibility< -12||compatibility>13||
       !assertStat(familiarity))throw new Error("Invalid team chemistry");
      mutableTagChem.set(pairKey(c.person_a_id,c.person_b_id),{compatibility,familiarity});
    }
    const worldSeed=String(show.seed);
    const readiness=new Map<string,WrestlerSimReadiness>(talent);
    const projections=matches.map((slot,index)=>{
      const layout=layouts[index]!;
      const format=requireSupportedScoringLayout(layout);
      if(format==="TRIPLE_THREAT"||format==="FOUR_WAY"||format==="BATTLE_ROYAL"){
        const raw=slot.payload as Record<string,unknown>;
        const intent=raw.intent??"COMPETITIVE";
        const finish=raw.plannedFinish??(format==="BATTLE_ROYAL"?
          "OVER_THE_TOP_ROPE":"CLEAN_PIN");
        const length=raw.plannedLengthMinutes??18;
        if(!["COMPETITIVE","SHOWCASE","DOMINANT","TECHNICAL",
         "HIGH_RISK","STORY","PROTECTIVE","EPIC"].includes(String(intent))||
          !(format==="BATTLE_ROYAL"?finish==="OVER_THE_TOP_ROPE":
            ["CLEAN_PIN","FLASH_PIN","SUBMISSION","PROTECTED_FINISH"].includes(String(finish)))||
          raw.interference!==undefined||raw.style!==undefined||
          typeof length!=="number"||!Number.isInteger(length)||length<3||length>60)
         throw new Error("Unsupported multi-person intent, finish, run-in or length");
        const ids=layout.participants.map(x=>x.personId);
        if(new Set(ids.map(id=>divisions.get(id))).size!==1)
         throw new Error("Mixed booking divisions are not supported in multi-person matches");
        if(show.injury_rate_multiplier===null||show.media_reach===null||
          !Number.isFinite(Number(show.injury_rate_multiplier))||
          !Number.isFinite(show.media_reach))
         throw new Error("Canonical multi-person injury or media ruleset missing");
        const result=simulateMultiIndividualMatch({
          layout,wrestlers:talent,worldSeed:String(show.seed),
          matchId:`${input.showId}:${slot.slot_id}`,
          order:index+1,eventImportance:show.event_importance!,
          intent:intent as MatchIntent,plannedFinish:
           (format==="BATTLE_ROYAL"?"CLEAN_PIN":finish) as
           "CLEAN_PIN"|"FLASH_PIN"|"SUBMISSION"|"PROTECTED_FINISH",
          plannedLengthMinutes:length,
          injuryRateMultiplier:Number(show.injury_rate_multiplier),
          mediaReach:show.media_reach,isMainEvent:index===matches.length-1,
        });
        const winningIndex=layout.sides.findIndex(x=>
         x.sideId===layout.scriptedWinnerSide);
        return {multi:{layout,result},tag:null,
         slotId:slot.slot_id,position:slot.position,
         winnerId:ids[winningIndex]!,
         personIds:[ids[0]!,ids[1]!] as [string,string],
         plannedFinish:finish as "CLEAN_PIN"|"FLASH_PIN"|"SUBMISSION"|"PROTECTED_FINISH",
         finishCheaterId:null,readiness:"READY" as const,chemistryModifier:0,
         score:result.score,injuryPreview:null,interferencePreview:{
          crowdResponse:result.score.crowdResponse,actualFinish:result.actualFinish,
          actualWinnerId:ids[layout.sides.findIndex(s=>s.sideId===result.actualWinnerSide)]!,
          injuryStoppage:result.injuryStoppage,
          plannedWinnerId:ids[winningIndex]!,plannedFinish:finish,
          interference:null,stage:"POST_INTERFERENCE_PRE_SHOW_FLOW" as const,
         },consequencesPreview:null};
      }
      if(format==="TAG"||format==="MULTI_TEAM"){
        const participantIds=layout.participants.map(x=>x.personId);
        if(new Set(participantIds.map(id=>divisions.get(id))).size!==1)
          throw new Error("Mixed booking divisions cannot form a team match");
        const raw=slot.payload as Record<string,unknown>;
        const allowed=["COMPETITIVE","SHOWCASE","DOMINANT","TECHNICAL",
          "HIGH_RISK","STORY","PROTECTIVE","EPIC"];
        const intent=raw.intent??"COMPETITIVE";
        const plannedFinish=raw.plannedFinish??"CLEAN_PIN";
        const length=raw.plannedLengthMinutes??18;
        if(typeof intent!=="string"||!allowed.includes(intent)||
          !isBookableMatchFinish(plannedFinish)||
          typeof length!=="number"||!Number.isInteger(length)||
          length<3||length>60||raw.style!==undefined)
          throw new Error("Unsupported tag match intent, duration, finish or style");
        let modifier=0;
        for(const side of layout.sides){
          let sideSum=0,pairCount=0;
          for(let i=0;i<side.participants.length;i++){
           for(let j=i+1;j<side.participants.length;j++){
            const [a,b]=pairIds(side.participants[i]!.personId,
              side.participants[j]!.personId);
            const key=pairKey(a,b);
            let chem=mutableTagChem.get(key);
            if(!chem){
              const rng=new DeterministicRng(deterministicSeedFromText(
                `${worldSeed}:chemistry:TAG:${a}:${b}`));
              chem={compatibility:Math.round(rng.float(-12,13)*10)/10,
                familiarity:0};
              mutableTagChem.set(key,chem);
            }
            sideSum+=chem.compatibility*.55+chem.familiarity*.04;
            chem.familiarity=Math.min(100,chem.familiarity+4);
            pairCount++;
           }
          }
          // Normalise each side by its pairs: 5v5 must not earn 10 times
          // as much chemistry simply for having 10 teammate pairs.
          modifier+=sideSum/pairCount*2/layout.sides.length;
        }
        const interruption=readBookedInterference(slot.payload);
        if(format==="MULTI_TEAM"&&interruption)
          throw new Error("Multi-team interference is not yet bookable");
        const profile=interruption?interfererProfiles.get(interruption.personId):null;
        const rate=show.injury_rate_multiplier===null?null:
          Number(show.injury_rate_multiplier);
        // Strictly refuse unresolved injury settings; never fabricate them.
        if(rate===null)throw new Error("Tag medical ruleset not imported");
        if(typeof show.media_reach!=="number"||
          !Number.isFinite(show.media_reach))
          throw new Error("Tag wrestler career progression requires imported promotion media reach");
        const result=simulateBookedTagMatch({
          layout,wrestlers:talent,worldSeed,
          matchId:`${input.showId}:${slot.slot_id}`,order:index+1,
          eventImportance:show.event_importance!,
          intent:intent as MatchIntent,plannedFinish,
          plannedLengthMinutes:length,chemistryModifier:modifier,
          injuryRateMultiplier:rate,mediaReach:show.media_reach,
          isMainEvent:index===matches.length-1,
          interference:interruption,
          interferer:profile?{
            active:profile.status==="ACTIVE",
            appearanceCommitted:bookedForShow.has(interruption!.personId),
            presentation:profile.presentation}:null,
        });
        return {multi:null,tag:{layout,result},slotId:slot.slot_id,position:slot.position,
          winnerId:result.injury.plannedWinnerId,
          personIds:[layout.sides[0]!.participants[0]!.personId,
            layout.sides[1]!.participants[0]!.personId] as [string,string],
          finishCheaterId:null,plannedFinish,readiness:"READY" as const,
          chemistryModifier:Math.round(modifier*1000)/1000,
          score:result.score,injuryPreview:result.injury,
          interferencePreview:result.final,
          consequencesPreview:null};
      }
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
      const scoringInput={
        worldSeed,matchId:`${input.showId}:${slot.slot_id}`,
        order:index+1,eventImportance:show.event_importance!,
        intent:match.intent,style:match.explicitStyle?match.style:null,
        plannedFinish:match.plannedFinish,
        plannedLengthMinutes:match.plannedLengthMinutes,chemistryModifier,
        people:[talent.get(match.personIds[0])!,talent.get(match.personIds[1])!] as
          [ScoredWrestler,ScoredWrestler],
      };
      const score=scoreArchivedSinglesBeforeInjuries(scoringInput);
      const injuryRate=show.injury_rate_multiplier===null?null:
        Number(show.injury_rate_multiplier);
      const injuryPreview=injuryRate===null?null:previewArchivedInjuryStoppage({
        ...scoringInput,personIds:match.personIds,bookedWinnerId:match.winnerId,
        injuryRateMultiplier:injuryRate,
      });
      // Can't process run-ins until the injury outcome is known: medical
      // stoppages always supersede scripted interference.
      const interruption=readBookedInterference(slot.payload);
      const profile=interruption?interfererProfiles.get(interruption.personId):null;
      const interferencePreview=injuryPreview===null?null:previewArchivedInterference(
        injuryPreview,interruption,profile?{
          active:profile.status==="ACTIVE",
          appearanceCommitted:bookedForShow.has(interruption!.personId),
          presentation:profile.presentation,
        }:null);
      const mediaReach=show.media_reach;
      const hasMediaReach=typeof mediaReach==="number" &&
        Number.isFinite(mediaReach) && mediaReach>=0 && mediaReach<=1000000;
      const consequencesPreview=interferencePreview!==null &&
        hasMediaReach ? previewArchivedMatchConsequences({
          booked:{...scoringInput,personIds:match.personIds,
            bookedWinnerId:match.winnerId,injuryRateMultiplier:injuryRate!},
          injury:injuryPreview!,final:interferencePreview,
          mediaReach:mediaReach!,isMainEvent:index===matches.length-1,
        }):null;
      return {multi:null,tag:null,slotId:slot.slot_id,position:slot.position,winnerId:match.winnerId,
        personIds:match.personIds,finishCheaterId:match.finishCheaterId,
        plannedFinish:match.plannedFinish,readiness:match.status,
        chemistryModifier:Math.round(chemistryModifier*1000)/1000,score,injuryPreview,interferencePreview,consequencesPreview};
    });
    // All match crowd reactions must exist before inferring the card's pacing.
    // A missing injury ruleset, segment resolution or storyline context must
    // never be mistaken for an official completed show score.
    const readyForPacing=projections.every(match=>match.interferencePreview!==null);
    const pacingCard:PacingMatch[]=readyForPacing?projections.map((match,index)=>{
      const original=matches[index]!.payload as Record<string,unknown>;
      const intent=original.intent===undefined?"COMPETITIVE":original.intent;
      return {matchId:match.slotId,position:match.position,
        intent:intent as PacingMatch["intent"],
        style:original.style===undefined?undefined:
          (original.style as PacingMatch["style"]),
        crowdResponse:match.interferencePreview!.crowdResponse};
    }):[];
    const showPacingPreview=readyForPacing?
      evaluateArchivedMatchPacing(pacingCard):null;
    // Never interpret an unimported archive as zero prior turns. The
    // canonical promotion override and 8-week changed-history are batch
    // projected only after confirmed historical coverage and match scoring.
    let showAlignmentPreview:ReturnType<typeof combineArchivedPacingAndAlignments>|null=null;
    if(showPacingPreview!==null && show.alignment_history_loaded &&
       projections.every(p=>p.tag===null&&p.multi===null)){
      const ids=[...appearances].sort();
      const overrides=await tx.query<{person_id:string;alignment:WrestlerAlignment}>(
        `SELECT person_id,alignment FROM ppw_promotion_wrestler_alignments
           WHERE world_id=$1 AND promotion_id=$2
             AND person_id=ANY($3::text[])
             AND wrestler_approved=true AND approval_receipt_id IS NOT NULL
             AND starts_week_index<=$4 AND expires_week_index>=$4`,
        [input.worldId,input.promotionId,ids,(show.year-1)*52+show.week-1],
      );
      const actual=new Map(baseAlignments);
      for(const o of overrides)actual.set(o.person_id,o.alignment);
      if([...appearances].every(id=>actual.get(id)!==null && actual.has(id))){
        const currentWeekIndex=(show.year-1)*52+show.week-1;
        const history=await tx.query<{person_id:string;year:number;week:number;
           method:AlignmentChangeMethod;changed:boolean}>(
          `SELECT person_id,year,week,method,changed
             FROM ppw_promotion_alignment_changes
            WHERE world_id=$1 AND promotion_id=$2
              AND person_id=ANY($3::text[])
              AND ((year-1)*52+week-1) BETWEEN $4 AND $5
            ORDER BY year,week,change_id LIMIT 4097`,
          [input.worldId,input.promotionId,ids,Math.max(0,currentWeekIndex-7),currentWeekIndex],
        );
        if(history.length>4096)throw new Error("Alignment history exceeds bounded projection");
        const alignmentFor=(id:string):WrestlerAlignment=>{
          const value=actual.get(id);
          if(!value)throw new Error("Missing canonical match alignment");
          return value;
        };
        const alignments=evaluateArchivedShowAlignments(matches.map(slot=>{
          const [a,b]=readCardParticipants(slot.payload);
          return {matchId:slot.slot_id,position:slot.position,
            aId:a!.personId,bId:b!.personId,
            aAlignment:alignmentFor(a!.personId),
            bAlignment:alignmentFor(b!.personId)};
        }),history.map(c=>({personId:c.person_id,weekIndex:(c.year-1)*52+c.week-1,
          method:c.method,changed:c.changed})),currentWeekIndex);
        showAlignmentPreview=combineArchivedPacingAndAlignments(showPacingPreview,alignments);
      }
    }
    let showProgrammePreview:ReturnType<typeof evaluateArchivedProgrammeReactions>|null=null;
    // A genuinely booked rivalry has its own canonical history even when
    // historical Genesis imports are incomplete. Unlinked shows remain neutral.
    if(showPacingPreview!==null&&
      (show.programme_history_loaded||show.linked_programme_matches)){
      const links=await tx.query<{slot_id:string;programme_id:string}>(
        `SELECT a.slot_id,a.programme_id
         FROM ppw_programme_match_activities a
         WHERE a.world_id=$1 AND a.promotion_id=$2
           AND a.draft_id=$3 AND a.kind='MATCH'
           AND a.slot_id=ANY($4::text[])
         ORDER BY a.slot_id,a.programme_id LIMIT 10001`,
        [input.worldId,input.promotionId,input.showId,matches.map(x=>x.slot_id)],
      );
      if(links.length>10000)throw new Error("Programme links exceed bounded show scope");
      const ids=[...new Set(links.map(x=>x.programme_id))].sort();
      if(ids.length>500)throw new Error("Programme context exceeds bounded show scope");
      const programmes=ids.length===0?[]:await tx.query<{
        programme_id:string;promotion_id:string;status:"ACTIVE"|"INACTIVE"|"COMPLETED";
        heat:number|null;repetition:number;
      }>(
        `SELECT programme_id,promotion_id,status,heat,repetition
           FROM ppw_programmes WHERE world_id=$1 AND promotion_id=$2
             AND programme_id=ANY($3::text[])`,
        [input.worldId,input.promotionId,ids],
      );
      if(programmes.length!==ids.length)throw new Error("Missing linked canonical programme");
      const byMatch=new Map<string,string[]>();
      for(const link of links){
        const arr=byMatch.get(link.slot_id)??[];
        arr.push(link.programme_id);byMatch.set(link.slot_id,arr);
      }
      showProgrammePreview=evaluateArchivedProgrammeReactions(
        matches.map(m=>({matchId:m.slot_id,promotionId:input.promotionId,
          linkedProgrammeIds:byMatch.get(m.slot_id)??[]})),
        programmes.map(x=>({programmeId:x.programme_id,promotionId:x.promotion_id,
          status:x.status,heat:x.heat,repetition:x.repetition})),
      );
    }
    let showFinishPreview:ReturnType<typeof evaluateArchivedFinishReactions>|null=null;
    // Actual, post-medical and post-interference finishes are authoritative
    // inputs. No guessed alignment or invented zero historical cheating.
    if(showPacingPreview!==null&&projections.every(p=>p.tag===null)&&
       show.dirty_finish_history_loaded&&
       show.alignment_history_loaded&&showAlignmentPreview!==null){
      const currentWeekIndex=(show.year-1)*52+show.week-1;
      const history=await tx.query<{promotion_id:string;week_index:number;
        actual_finish:"DISQUALIFICATION"|"FOREIGN_OBJECT";
        cheater_person_id:string;participant_ids:string[]}>(
        `SELECT promotion_id,week_index,actual_finish,cheater_person_id,participant_ids
           FROM ppw_completed_dirty_finishes
          WHERE world_id=$1 AND promotion_id=$2
            AND week_index BETWEEN $3 AND $4
          ORDER BY week_index,match_id LIMIT 10001`,
        [input.worldId,input.promotionId,Math.max(0,currentWeekIndex-8),currentWeekIndex-1],
      );
      if(history.length>10000)throw new Error("Dirty finish history exceeds bounded show scope");
      const overrides=await tx.query<{person_id:string;alignment:WrestlerAlignment}>(
        `SELECT person_id,alignment FROM ppw_promotion_wrestler_alignments
           WHERE world_id=$1 AND promotion_id=$2
             AND person_id=ANY($3::text[])
             AND wrestler_approved=true AND approval_receipt_id IS NOT NULL
             AND starts_week_index<=$4 AND expires_week_index>=$4`,
        [input.worldId,input.promotionId,[...appearances],currentWeekIndex],
      );
      const alignments=new Map(baseAlignments);
      for(const o of overrides)alignments.set(o.person_id,o.alignment);
      const booked=matches.map((slot,index):FinishedCheatingMatch=>{
        const projection=projections[index]!;
        if(projection.multi||projection.tag)throw new Error("Dirty-finish history supports singles only");
        const resolved=projection.interferencePreview!;
        const ids=projection.personIds;
        const actualWinnerSide=resolved.actualWinnerId===ids[0]?"A":
          resolved.actualWinnerId===ids[1]?"B":null;
        if(!actualWinnerSide)throw new Error("Unrecognized actual match winner");
        return {matchId:slot.slot_id,promotionId:input.promotionId,
          weekIndex:currentWeekIndex,actualFinish:resolved.actualFinish as MatchFinish,
          actualWinnerSide,finishCheaterPersonId:
            resolved.actualFinish==="DISQUALIFICATION"||
            resolved.actualFinish==="FOREIGN_OBJECT"?
              projection.finishCheaterId:null,
          participants:ids.map((id,i)=>({personId:id,side:i===0?"A" as const:"B" as const,
            alignment:alignments.get(id)!})),linkedProgramme:
              showProgrammePreview?.[index]?.linkedActiveProgrammeCount!==0 &&
              showProgrammePreview?.[index]!==undefined};
      });
      if(booked.some(m=>m.participants.some(p=>!p.alignment)))
        throw new Error("Missing canonical cheating alignment");
      showFinishPreview=evaluateArchivedFinishReactions(booked,
        history.map((h):HistoricalDirtyFinish=>({
          promotionId:h.promotion_id,weekIndex:h.week_index,
          actualFinish:h.actual_finish,cheaterPersonId:h.cheater_person_id,
          participantIds:h.participant_ids,completed:true,
        })));
    }
    const showMatchContextPreview=showPacingPreview!==null&&
      showAlignmentPreview!==null&&showProgrammePreview!==null&&
      showFinishPreview!==null?
      combineArchivedShowMatchContext(showPacingPreview,
        showAlignmentPreview.matches,showProgrammePreview,showFinishPreview):null;
    const tagTitleBookings=matches.flatMap((slot,index)=>{
      const payload=slot.payload as Record<string,unknown>;
      if(payload.championshipId===undefined ||
        requireSupportedScoringLayout(layouts[index]!)!=="TAG")return [];
      if(typeof payload.championshipId!=="string"||
        !payload.championshipId||payload.championshipId.length>200)
       throw new Error("Invalid canonical tag championship");
      const layout=layouts[index]!;
      if(layout.sides[0]!.participants.length!==2)
        throw new Error("Only a 2v2 title uses an existing tag-team reign; larger-team titles need their own identity");
      return [{slotId:slot.slot_id,championshipId:payload.championshipId,
       sides:layout.sides.map(side=>({sideId:side.sideId,
        personIds:side.participants.map(x=>x.personId)})) as
          [{sideId:"A";personIds:string[]},{sideId:"B";personIds:string[]}]}];
    });
    const titleBookings=matches.flatMap((slot,index)=>{
      const kind=requireSupportedScoringLayout(layouts[index]!);
      if(kind==="TAG"||kind==="MULTI_TEAM"){
       if((matches[index]!.payload as Record<string,unknown>).championshipId!==undefined &&
        kind==="MULTI_TEAM")throw new Error("Multi-team title rules not yet supported");
       return [];
      }
      const payload=slot.payload as Record<string,unknown>;
      if(payload.championshipId===undefined)return [];
      if(typeof payload.championshipId!=="string"||
       !payload.championshipId||payload.championshipId.length>200)
       throw new Error("Invalid singles championship booking");
      const ids=readCardParticipants(slot.payload);
      if(![2,3,4].includes(ids.length))
        throw new Error("Battle royal title changes need explicit championship rules");
      return [{slotId:slot.slot_id,championshipId:payload.championshipId,
       participants:ids.map(x=>x.personId)}];
    });
    return {titleBookings,tagTitleBookings,eventImportance:show.event_importance,
     worldId:input.worldId,promotionId:input.promotionId,showId:input.showId,
      year:show.year,week:show.week,stage:"PRE_INJURY_PRE_INTERFERENCE_PRE_SHOW_FLOW" as const,
      projections,showPacingPreview,showAlignmentPreview,showProgrammePreview,showFinishPreview,showMatchContextPreview};
}