/** PPW original show-flow pacing extraction (archived show-flow.ts).
 * Intent/style intensity, repetition, breather, closer, show weights and
 * signal ordering are retained in the same arithmetic order.
 * This output is NOT the full legacy show evaluation: it lacks alignment,
 * programme/repetition, cheating history and recorded segment reactions.
 * No database access, no writes and no historical WorldState hydration.
 */
import type {MatchIntent,MatchStyleProfile} from "./types.js";

const INTENT_INTENSITY: Record<MatchIntent, number> = {
  COMPETITIVE: 58,
  SHOWCASE: 40,
  DOMINANT: 44,
  TECHNICAL: 54,
  HIGH_RISK: 82,
  STORY: 42,
  PROTECTIVE: 38,
  EPIC: 90,
};


export type ShowFlowReasonCode =
  | "FACE_HEEL_CLARITY"
  | "SAME_ALIGNMENT"
  | "TWEENER_TENSION"
  | "ALIGNMENT_VOLATILITY"
  | "HOT_PROGRAMME"
  | "PROGRAMME_REPETITION"
  | "COOL_PROGRAMME"
  | "REPEATED_INTENT"
  | "REPEATED_STYLE"
  | "BACK_TO_BACK_INTENSITY"
  | "PACE_CONTRAST"
  | "INTENSITY_BUILD"
  | "BREATHER"
  | "HIGH_INTENSITY_STREAK"
  | "FLAT_CLOSER"
  | "BIG_CLOSER"
  | "HEEL_CHEATING_HEAT"
  | "FACE_CHEATING_BACKLASH"
  | "DIRTY_FINISH_FAMILIAR";


export interface PacingMatch {
  matchId:string;position:number;intent:MatchIntent;
  style?:MatchStyleProfile;crowdResponse:number;
}
export interface KnownSegmentCrowd {position:number;crowdResponse:number}
export interface ArchivedPacingPreview {
  phase:"PACING_ONLY_NOT_FINAL";
  baseMatchCrowd:number;
  basePacingCrowd:number;
  crowdResponsePacingOnly:number;
  pacingAdjustment:number;
  segments:"NOT_PROJECTED"|"PROVIDED";
  pendingContext:readonly ["ALIGNMENT","PROGRAMME","DIRTY_FINISH_HISTORY"];
  matches:readonly {
    matchId:string;position:number;originalCrowd:number;adjustedPacingCrowd:number;
    pacingModifier:number;pacingReason:ShowFlowReasonCode|null;weight:number;
  }[];
}
interface ModifierEvaluation {modifier:number;reason:ShowFlowReasonCode|null}
function clamp(value:number,min:number,max:number):number{
  return Math.max(min,Math.min(max,value));
}
function round1(value:number):number{return Math.round(value*10)/10;}

function styleIntensity(match: PacingMatch): number {
  if (match.style === undefined) return INTENT_INTENSITY[match.intent];
  return clamp(
    match.style.intensity * 0.45
      + match.style.epic * 0.25
      + match.style.risk * 0.12
      + match.style.competitiveness * 0.1
      + match.style.technical * 0.04
      + match.style.story * 0.04,
    0,
    100,
  );
}

function styleSimilarity(left: PacingMatch, right: PacingMatch): number | null {
  if (left.style === undefined || right.style === undefined) return null;
  const differences = [
    Math.abs(left.style.competitiveness - right.style.competitiveness),
    Math.abs(left.style.technical - right.style.technical),
    Math.abs(left.style.story - right.style.story),
    Math.abs(left.style.intensity - right.style.intensity),
    Math.abs(left.style.risk - right.style.risk),
    Math.abs(left.style.epic - right.style.epic),
  ];
  return 100 - differences.reduce((sum, value) => sum + value, 0) / differences.length;
}

function pacingModifier(matches: PacingMatch[], index: number): ModifierEvaluation {
  const match = matches[index]!;
  const intensity = styleIntensity(match);
  const isLast = index === matches.length - 1;
  const signals = new Map<ShowFlowReasonCode, number>();
  const add = (reason: ShowFlowReasonCode, impact: number): void => {
    signals.set(reason, (signals.get(reason) ?? 0) + impact);
  };

  if (index > 0) {
    const previous = matches[index - 1]!;
    const previousIntensity = styleIntensity(previous);
    const difference = intensity - previousIntensity;
    const absoluteDifference = Math.abs(difference);
    const similarity = styleSimilarity(previous, match);

    if (similarity !== null && similarity >= 82) add("REPEATED_STYLE", similarity >= 92 ? -1.1 : -0.8);
    else if (similarity === null && match.style === undefined && previous.style === undefined && match.intent === previous.intent) {
      add("REPEATED_INTENT", -0.8);
    }
    if (intensity >= 76 && previousIntensity >= 76) add("BACK_TO_BACK_INTENSITY", -1.8);
    if (absoluteDifference >= 14 && absoluteDifference <= 42) add("PACE_CONTRAST", 0.6);
    if (difference >= 10 && difference <= 45) add("INTENSITY_BUILD", 0.5);
    if (previousIntensity >= 76 && intensity <= 48 && !isLast) add("BREATHER", 0.8);
    if (previousIntensity - intensity >= 30 && isLast) add("FLAT_CLOSER", -0.8);
  }

  if (intensity >= 76) {
    let highIntensityStreak = 1;
    for (let prior = index - 1; prior >= 0 && styleIntensity(matches[prior]!) >= 76; prior -= 1) {
      highIntensityStreak += 1;
    }
    if (highIntensityStreak >= 3) {
      add("HIGH_INTENSITY_STREAK", -Math.min(2.4, (highIntensityStreak - 2) * 1.2));
    }
  }

  if (isLast) {
    if (intensity >= 78) add("BIG_CLOSER", 1.2);
    else if (intensity <= 45) add("FLAT_CLOSER", -1.3);
  }

  const rawModifier = [...signals.values()].reduce((sum, value) => sum + value, 0);
  const reason = [...signals.entries()]
    .sort((left, right) => Math.abs(right[1]) - Math.abs(left[1]))[0]?.[0] ?? null;
  return { modifier: clamp(rawModifier, -5, 3), reason };
}

function matchWeight(index: number, total: number): number {
  if (total <= 1) return 1;
  const position = index / (total - 1);
  return 1 + position * 0.18 + (index === total - 1 ? 0.08 : 0);
}


/** All matches supplied here must have already reached medical/interference
 * resolution. Supplying segmentCrowd explicitly (even []) asserts that
 * segment reactions were actually assessed. Omitting it leaves that missing.
 */
export function evaluateArchivedMatchPacing(
  card:readonly PacingMatch[],segmentCrowd?:readonly KnownSegmentCrowd[],
):ArchivedPacingPreview {
  if(card.length<1||card.length>100)throw new Error("Pacing card requires 1-100 matches");
  const sorted=[...card].sort((a,b)=>a.position-b.position||a.matchId.localeCompare(b.matchId,"en"));
  const seen=new Set<string>(),positions=new Set<number>();
  for(const match of sorted){
    if(!match.matchId||match.matchId.length>200||seen.has(match.matchId)||
      !Number.isSafeInteger(match.position)||match.position<0||positions.has(match.position)||
      typeof match.crowdResponse!=="number"||!Number.isFinite(match.crowdResponse)||
      match.crowdResponse<0||match.crowdResponse>100||!(match.intent in INTENT_INTENSITY))
      throw new Error("Invalid resolved match for pacing");
    seen.add(match.matchId);positions.add(match.position);
    if(match.style!==undefined){
      const dimensions=["competitiveness","technical","story","intensity","risk","epic"] as const;
      if(dimensions.some(k=>!Number.isInteger(match.style![k])||
        match.style![k]<0||match.style![k]>100))
        throw new Error("Invalid explicit match style for pacing");
    }
  }
  if(segmentCrowd!==undefined && (segmentCrowd.length>100||
    segmentCrowd.some(segment=>!Number.isSafeInteger(segment.position)||
      segment.position<0||!Number.isFinite(segment.crowdResponse)||
      segment.crowdResponse<0||segment.crowdResponse>100)))
    throw new Error("Invalid recorded segment crowd");
  const evaluations=sorted.map((match,index)=>{
    const pacing=pacingModifier(sorted,index);
    return {matchId:match.matchId,position:match.position,
      originalCrowd:match.crowdResponse,
      adjustedPacingCrowd:round1(clamp(match.crowdResponse+pacing.modifier,0,100)),
      pacingModifier:round1(pacing.modifier),pacingReason:pacing.reason,
      weight:matchWeight(index,sorted.length)};
  });
  const baseMatchCrowd=round1(sorted.reduce((sum,m)=>sum+m.crowdResponse,0)/sorted.length);
  const segments=segmentCrowd===undefined?[]:[...segmentCrowd].sort((a,b)=>a.position-b.position);
  const segmentWeight=0.65;
  const totalWeight=evaluations.reduce((sum,m)=>sum+m.weight,0)+segments.length*segmentWeight;
  const basePacingCrowd=segments.length===0?baseMatchCrowd:round1((
    evaluations.reduce((sum,m)=>sum+m.originalCrowd*m.weight,0)+
    segments.reduce((sum,m)=>sum+m.crowdResponse*segmentWeight,0)
  )/totalWeight);
  const crowdResponsePacingOnly=round1((
    evaluations.reduce((sum,m)=>sum+m.adjustedPacingCrowd*m.weight,0)+
    segments.reduce((sum,m)=>sum+m.crowdResponse*segmentWeight,0)
  )/totalWeight);
  return {phase:"PACING_ONLY_NOT_FINAL",baseMatchCrowd,basePacingCrowd,
    crowdResponsePacingOnly,pacingAdjustment:round1(crowdResponsePacingOnly-basePacingCrowd),
    segments:segmentCrowd===undefined?"NOT_PROJECTED":"PROVIDED",
    pendingContext:["ALIGNMENT","PROGRAMME","DIRTY_FINISH_HISTORY"],
    matches:evaluations};
}
