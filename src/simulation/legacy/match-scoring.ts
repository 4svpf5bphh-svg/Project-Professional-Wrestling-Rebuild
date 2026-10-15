/** Exact pre-injury and pre-show-flow scoring from PPW archived matches.ts.
 * Functions carrying 'original' use the same calculation terms/order.
 * This PURE stage does not advance wrestlers, resolve injuries or reroll finishes.
 */
import type {MatchIntent,MatchStyleProfile} from "./types.js";
import type {MatchFinish} from "./match-finishes.js";
import {DeterministicRng,deterministicSeedFromText} from "./rng.js";
import {evaluateMatchStyleExecution,type MatchStyleExecutionEvaluation,type MatchStyleSkillProfile} from "./match-style.js";
type ScoringMatch={intent:MatchIntent;style?:MatchStyleProfile};
export interface ScoredWrestler {
  skills:MatchStyleSkillProfile;
  popularity:number;recognition:number;momentum:number;fatigue:number;wear:number;
}
export interface ScoringInput {
  worldSeed:string|number;matchId:string;order:number;eventImportance:number;
  intent:MatchIntent;style:MatchStyleProfile|null;
  plannedFinish:MatchFinish;plannedLengthMinutes:number;
  /** The existing singles compatibility/familiarity modifier, NOT random noise. */
  chemistryModifier:number;
  people:readonly [ScoredWrestler,ScoredWrestler];
}
export interface PreliminaryMatchScore {
  stage:"PRE_INJURY_PRE_INTERFERENCE_PRE_SHOW_FLOW";
  executionQuality:number;criticalRatingStars:number;crowdResponse:number;
  actualLengthMinutes:number;styleResolver:"DIMENSIONAL"|"INTENT";
}
function clamp(value:number,min:number,max:number):number {
  return Math.max(min,Math.min(max,value));
}
function finishExecutionModifier(intent: MatchIntent, finish: MatchFinish): number {
  if (finish === "CLEAN_PIN") return intent === "DOMINANT" || intent === "SHOWCASE" || intent === "COMPETITIVE" ? 1 : 0;
  if (finish === "SUBMISSION") {
    if (intent === "TECHNICAL") return 2.5;
    if (intent === "EPIC") return 1.2;
    if (intent === "COMPETITIVE") return 0.5;
    return 0;
  }
  if (finish === "FLASH_PIN") {
    if (intent === "PROTECTIVE" || intent === "STORY") return 1.2;
    if (intent === "COMPETITIVE") return 0.4;
    if (intent === "DOMINANT") return -2.2;
    if (intent === "EPIC") return -1.2;
    return 0;
  }
  if (finish === "DISQUALIFICATION") return intent === "STORY" || intent === "PROTECTIVE" ? -0.5 : -2.8;
  if (finish === "FOREIGN_OBJECT") return intent === "STORY" || intent === "PROTECTIVE" ? 0.7 : -1.4;
  if (finish === "PROTECTED_FINISH") {
    if (intent === "PROTECTIVE" || intent === "STORY") return 1.8;
    if (intent === "HIGH_RISK") return 0.6;
    if (intent === "COMPETITIVE") return -0.8;
    if (intent === "TECHNICAL") return -1.8;
    if (intent === "EPIC") return -2.2;
    if (intent === "DOMINANT") return -2.5;
    return -1;
  }
  return -4;
}

function finishCrowdModifier(intent: MatchIntent, finish: MatchFinish): number {
  if (finish === "CLEAN_PIN") return intent === "DOMINANT" || intent === "SHOWCASE" ? 1 : 0.4;
  if (finish === "SUBMISSION") return intent === "TECHNICAL" ? 1.8 : intent === "EPIC" ? 1 : 0.2;
  if (finish === "FLASH_PIN") return intent === "STORY" || intent === "PROTECTIVE" ? 1.8 : 0.5;
  if (finish === "DISQUALIFICATION") return intent === "STORY" || intent === "PROTECTIVE" ? 0.5 : -3.2;
  if (finish === "FOREIGN_OBJECT") return intent === "STORY" || intent === "PROTECTIVE" ? 1.2 : -2.0;
  if (finish === "PROTECTED_FINISH") return intent === "STORY" || intent === "PROTECTIVE" ? 2 : -2.5;
  return -4;
}

function styledFinishExecutionModifier(match: ScoringMatch, finish: MatchFinish): number {
  const style = match.style!;
  if (finish === "DISQUALIFICATION") return clamp((style.story - 50) * 0.024 - 1.6, -3.5, 1);
  if (finish === "FOREIGN_OBJECT") return clamp((style.story - 50) * 0.03 - 0.4, -3, 2);
  if (finish === "CLEAN_PIN") {
    return clamp(((style.competitiveness + style.intensity) / 2 - 50) * 0.018, -2.5, 2.5);
  }
  if (finish === "SUBMISSION") {
    return clamp((style.technical - 50) * 0.035 + (style.competitiveness - 50) * 0.008, -2.5, 3);
  }
  if (finish === "FLASH_PIN") {
    return clamp((style.story - 50) * 0.03 - Math.max(0, style.epic - 70) * 0.015, -2.5, 2.5);
  }
  if (finish === "PROTECTED_FINISH") {
    return clamp(
      (style.story - 50) * 0.035
      - Math.max(0, style.competitiveness - 60) * 0.018
      - Math.max(0, style.technical - 70) * 0.012,
      -3,
      2.5,
    );
  }
  return -4;
}

function styledFinishCrowdModifier(match: ScoringMatch, finish: MatchFinish): number {
  const style = match.style!;
  if (finish === "DISQUALIFICATION") return clamp((style.story - 50) * 0.024 - 2.2, -4, 0.9);
  if (finish === "FOREIGN_OBJECT") return clamp((style.story - 50) * 0.032 - 0.8, -3.5, 1.8);
  if (finish === "CLEAN_PIN") {
    return clamp(((style.competitiveness + style.intensity + style.epic) / 3 - 45) * 0.018, -2, 2.5);
  }
  if (finish === "SUBMISSION") {
    return clamp((style.technical - 45) * 0.028 + (style.competitiveness - 50) * 0.006, -2, 2.8);
  }
  if (finish === "FLASH_PIN") {
    return clamp((style.story - 45) * 0.028 - Math.max(0, style.epic - 75) * 0.012, -2, 2.5);
  }
  if (finish === "PROTECTED_FINISH") {
    return clamp(
      (style.story - 45) * 0.032 - Math.max(0, style.competitiveness - 65) * 0.018,
      -3,
      2.8,
    );
  }
  return -4;
}
/** The original match rating/crowd equations and RNG draw order. The original
 * runtime also handles injuries, run-ins, physical wear, programme signals and
 * post-show consequences. Those must remain separate until ported atomically.
 */
/** Retain the exact RNG instance *after* the three legacy scoring draws so
 * injury rolls consume the right continuation, not a fresh random seed. */
export function scoreArchivedSinglesBeforeInjuriesWithRng(input:ScoringInput):{
  score:PreliminaryMatchScore;rng:DeterministicRng;
  styleEvaluation:MatchStyleExecutionEvaluation|null;
} {
  if(!input.matchId||!String(input.worldSeed)||
     !Number.isSafeInteger(input.order)||input.order<1||input.order>100||
     !Number.isFinite(input.eventImportance)||input.eventImportance<0||input.eventImportance>100||
     !Number.isInteger(input.plannedLengthMinutes)||
     input.plannedLengthMinutes<3||input.plannedLengthMinutes>60||
     !Number.isFinite(input.chemistryModifier)||input.chemistryModifier < -25||
     input.chemistryModifier>25||input.people.length!==2)throw new Error("Invalid match scoring context");
  for(const p of input.people){
    for(const v of [...Object.values(p.skills),p.popularity,p.recognition,p.momentum,p.fatigue,p.wear]){
      if(typeof v!=="number"||!Number.isFinite(v)||v<0||v>100)
        throw new Error("Unknown or invalid original wrestler scoring input");
    }
  }
  const match:{
    intent:MatchIntent;style?:MatchStyleProfile;plannedLengthMinutes:number;
    order:number;executionQuality:number;criticalRatingStars:number;
    crowdResponse:number;actualLengthMinutes:number;
  }={intent:input.intent,style:input.style??undefined,
    plannedLengthMinutes:input.plannedLengthMinutes,order:input.order,
    executionQuality:0,criticalRatingStars:0,crowdResponse:0,actualLengthMinutes:0};
  const event={eventImportance:input.eventImportance};
  const allPeople=input.people;
  const rng=new DeterministicRng(deterministicSeedFromText(`${input.worldSeed}:${input.matchId}:resolve`));
  const sideAverage=(selector:(p:ScoredWrestler)=>number)=>
    allPeople.reduce((sum,p)=>sum+selector(p),0)/allPeople.length;
  const averageRing=sideAverage(p=>p.skills.inRingQuality);
  const averageCraft=sideAverage(p=>p.skills.matchCraft);
  const averagePresentation=sideAverage(p=>p.skills.presentation);
  const averageStamina=sideAverage(p=>p.skills.stamina);
  const averageSafety=sideAverage(p=>p.skills.safety);
  const averageFatigue=sideAverage(p=>p.fatigue);
  const averageStar=sideAverage(p=>(p.popularity+p.recognition+p.momentum)/3);
  const chemistry=input.chemistryModifier;
  const styleEvaluation=match.style===undefined?null:evaluateMatchStyleExecution(
    match.style,{
      inRingQuality:averageRing,matchCraft:averageCraft,
      presentation:averagePresentation,stamina:averageStamina,safety:averageSafety,
    },match.plannedLengthMinutes);
  const bookedFinish=input.plannedFinish;
  const intentBonus = match.intent === "EPIC" ? 6 : match.intent === "TECHNICAL" ? 4 : match.intent === "HIGH_RISK" ? 3 : match.intent === "SHOWCASE" ? 2 : 0;
  const finishExecution = styleEvaluation === null
    ? finishExecutionModifier(match.intent, bookedFinish)
    : styledFinishExecutionModifier(match, bookedFinish);
  const fatiguePenalty = averageFatigue * 0.17;
  const staminaFit = Math.min(6, (averageStamina - 50) * 0.1) - Math.max(0, match.plannedLengthMinutes - 18) * Math.max(0, 62 - averageStamina) / 160;
  const execution = styleEvaluation === null
    ? clamp(
      averageRing * 0.43
        + averageCraft * 0.37
        + averagePresentation * 0.08
        + 8
        + chemistry
        + intentBonus
        + finishExecution
        + staminaFit
        - fatiguePenalty
        + rng.float(-7, 7),
      5,
      100,
    )
    : clamp(
      averageRing * 0.4
        + averageCraft * 0.35
        + averagePresentation * 0.08
        + averageSafety * 0.03
        + 7
        + chemistry
        + styleEvaluation.realizedUpside
        - styleEvaluation.difficultyPenalty
        + finishExecution
        + staminaFit
        - fatiguePenalty
        + rng.float(-7, 7),
      5,
      100,
    );
  match.executionQuality = Math.round(execution * 10) / 10;
  const rawStars = 0.5 + execution / 25.5 + Math.max(0, execution - 82) / 36;
  match.criticalRatingStars = Math.round(clamp(rawStars, 0.5, 5) * 4) / 4;
  const styledCrowdDelivery = styleEvaluation === null
    ? 0
    : (styleEvaluation.crowdAppeal - 45)
      * clamp(execution / 75, 0.35, 1.15)
      * 0.11;
  match.crowdResponse = Math.round(clamp(
    averageStar * 0.53
      + execution * 0.34
      + event.eventImportance * 0.13
      + (match.order >= 4 ? 2 : 0)
      + (styleEvaluation === null
        ? finishCrowdModifier(match.intent, bookedFinish)
        : styledFinishCrowdModifier(match, bookedFinish))
      + styledCrowdDelivery
      + rng.float(-6, 6),
    0,
    100,
  ) * 10) / 10;
  match.actualLengthMinutes = Math.max(3, Math.round(match.plannedLengthMinutes * rng.float(0.88, 1.1)));

  return {score:{stage:"PRE_INJURY_PRE_INTERFERENCE_PRE_SHOW_FLOW",
    executionQuality:match.executionQuality,criticalRatingStars:match.criticalRatingStars,
    crowdResponse:match.crowdResponse,actualLengthMinutes:match.actualLengthMinutes,
    styleResolver:styleEvaluation?"DIMENSIONAL":"INTENT"},rng,styleEvaluation};
}
/** Existing stable read-only scoring contract. */
export function scoreArchivedSinglesBeforeInjuries(input:ScoringInput):PreliminaryMatchScore {
  return scoreArchivedSinglesBeforeInjuriesWithRng(input).score;
}
