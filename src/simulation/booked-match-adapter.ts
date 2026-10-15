import {readCardParticipants} from "../domain/card-participants.js";
import {
  defaultMatchStyleForIntent,evaluateMatchStyleExecution,assessMatchStyleReadiness,
  normalizeMatchStyle,type MatchStyleSkillProfile,
} from "./legacy/match-style.js";
import {
  defaultPlannedFinishForIntent,isBookableMatchFinish,resolveBookedFinishCheater,
  type MatchFinish,
} from "./legacy/match-finishes.js";
import type {MatchIntent,MatchStyleProfile} from "./legacy/types.js";

const INTENTS=new Set<MatchIntent>([
  "COMPETITIVE","SHOWCASE","DOMINANT","TECHNICAL","HIGH_RISK","STORY","PROTECTIVE","EPIC",
]);
export interface WrestlerSimReadiness {
  skills:MatchStyleSkillProfile;fatigue:number;wear:number;
}
export interface AdaptedBookedMatch {
  personIds:[string,string];contractIds:[string,string];winnerId:string;
  intent:MatchIntent;style:MatchStyleProfile;explicitStyle:boolean;plannedFinish:MatchFinish;
  finishCheaterId:string|null;plannedLengthMinutes:number;
  styleEvaluations:ReturnType<typeof evaluateMatchStyleExecution>[];
  readiness:ReturnType<typeof assessMatchStyleReadiness>[];
  status:"READY"|"NEEDS_STYLE_REVIEW";
}
/** Pure adapter: translates the new card payload into legacy match evaluation.
 * It NEVER decides a winner, writes a result, charges a date or loads a World.
 * First slice handles singles only; tag/segment adapters are future work.
 */
export function adaptBookedSinglesMatch(payload:unknown,
  talent:ReadonlyMap<string,WrestlerSimReadiness>):AdaptedBookedMatch {
  if(!payload||typeof payload!=="object"||Array.isArray(payload))
    throw new Error("Invalid booked match");
  const p=payload as Record<string,unknown>;
  const people=readCardParticipants(payload);
  if(people.length!==2||people[0]!.personId===people[1]!.personId ||
    (p.matchType!==undefined&&p.matchType!=="SINGLES"))
    throw new Error("Legacy adapter currently requires two distinct singles wrestlers");
  const ids=[people[0]!.personId,people[1]!.personId] as [string,string];
  if(typeof p.scriptedWinner!=="string"||!ids.includes(p.scriptedWinner))
    throw new Error("Player-authored scripted winner required; simulation may not choose it");
  const intent=p.intent===undefined?"COMPETITIVE":p.intent;
  if(typeof intent!=="string"||!INTENTS.has(intent as MatchIntent))
    throw new Error("Unknown legacy match intent");
  const typedIntent=intent as MatchIntent;
  const length=p.plannedLengthMinutes===undefined?15:p.plannedLengthMinutes;
  if(typeof length!=="number"||!Number.isInteger(length)||length<3||length>60)
    throw new Error("Invalid match length");
  const style=p.style===undefined?defaultMatchStyleForIntent(typedIntent):
    normalizeMatchStyle(p.style as MatchStyleProfile);
  const finish=p.plannedFinish===undefined?defaultPlannedFinishForIntent(typedIntent):
    p.plannedFinish;
  if(!isBookableMatchFinish(finish))
    throw new Error("Only original bookable finishes may be planned");
  const winnerSide=p.scriptedWinner===ids[0]?"A":"B";
  const cheater=resolveBookedFinishCheater(finish,winnerSide,[ids[0]],[ids[1]],
    typeof p.cheatingWrestlerId==="string"?p.cheatingWrestlerId:null);
  const records=ids.map(id=>{
    const record=talent.get(id);
    if(!record)throw new Error("Missing wrestler skills for legacy match projection");
    for(const field of ["inRingQuality","matchCraft","presentation","stamina","safety"] as const){
      const v=record.skills[field];
      if(typeof v!=="number"||!Number.isFinite(v)||v<0||v>100)
        throw new Error("Invalid wrestler skill: "+field);
    }
    if(!Number.isFinite(record.fatigue)||!Number.isFinite(record.wear))
      throw new Error("Invalid wrestler readiness");
    return record;
  });
  const evaluations=records.map(r=>evaluateMatchStyleExecution(style,r.skills,length));
  const readiness=records.map(r=>assessMatchStyleReadiness(style,r.skills,length,r.fatigue,r.wear));
  return {
    personIds:ids,contractIds:[people[0]!.contractId,people[1]!.contractId],
    winnerId:p.scriptedWinner,intent:typedIntent,style,explicitStyle:p.style!==undefined,plannedFinish:finish,
    finishCheaterId:cheater,plannedLengthMinutes:length,
    styleEvaluations:evaluations,readiness,
    status:readiness.some(x=>x.status==="REFUSES")?"NEEDS_STYLE_REVIEW":"READY",
  };
}
