/** PPW original alignment clarity and eight-week volatile-turn penalty,
 * extracted from archived sim-core/show-flow.ts and sim-core/alignment.ts.
 * All figures are pure and promotion-scoped. No WorldState or DB access.
 */
import type {ArchivedPacingPreview} from "./show-pacing.js";
export type WrestlerAlignment="FACE"|"HEEL"|"TWEENER";
export type AlignmentChangeMethod="OFFSCREEN_SWITCH"|"TURN"|
  "INITIAL_PRESENTATION"|"JUST_SIGNED"|"RETURNING";
export interface AlignmentChange {
 personId:string;weekIndex:number;method:AlignmentChangeMethod;changed:boolean;
}
export interface AlignmentMatch {
 matchId:string;position:number;aId:string;bId:string;
 aAlignment:WrestlerAlignment;bAlignment:WrestlerAlignment;
}
export interface ArchivedAlignmentEvaluation {
 matchId:string;position:number;
 modifier:number;reason:"FACE_HEEL_CLARITY"|"SAME_ALIGNMENT"|
  "TWEENER_TENSION"|"ALIGNMENT_VOLATILITY"|null;
 baseModifier:number;baseReason:"FACE_HEEL_CLARITY"|
  "SAME_ALIGNMENT"|"TWEENER_TENSION"|null;
 volatilityModifier:number;
}
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
const round1=(n:number)=>Math.round(n*10)/10;
const alignments=new Set(["FACE","HEEL","TWEENER"]);
export function evaluateArchivedShowAlignments(
 card:readonly AlignmentMatch[],changes:readonly AlignmentChange[],
 currentWeekIndex:number,
):ArchivedAlignmentEvaluation[]{
 if(card.length<1||card.length>100||changes.length>4096||
    !Number.isSafeInteger(currentWeekIndex)||currentWeekIndex<0)
   throw new Error("Invalid alignment show scope");
 const people=new Set(card.flatMap(x=>[x.aId,x.bId]));
 const counts=new Map<string,{offscreen:number;turns:number}>();
 for(const c of changes){
   if(!people.has(c.personId)||!Number.isSafeInteger(c.weekIndex)||
      c.weekIndex<0||typeof c.changed!=="boolean"||
      !["OFFSCREEN_SWITCH","TURN","INITIAL_PRESENTATION","JUST_SIGNED","RETURNING"].includes(c.method))
     throw new Error("Invalid alignment history");
   const age=currentWeekIndex-c.weekIndex;
   if(age<0)throw new Error("Future alignment change cannot affect current show");
   if(age>=8||!c.changed)continue;
   const existing=counts.get(c.personId)??{offscreen:0,turns:0};
   if(c.method==="OFFSCREEN_SWITCH")existing.offscreen++;
   if(c.method==="TURN")existing.turns++;
   counts.set(c.personId,existing);
 }
 const penalty=(id:string)=>{
   const {offscreen,turns}=counts.get(id)??{offscreen:0,turns:0};
   const confusion=offscreen*1.1+Math.max(0,offscreen+turns-1)*0.65;
   return Math.min(3,round1(confusion));
 };
 const ids=new Set<string>();
 return card.map(m=>{
   if(!m.matchId||m.matchId.length>200||ids.has(m.matchId)||
     !Number.isSafeInteger(m.position)||m.position<0||
     !m.aId||!m.bId||m.aId===m.bId||
     !alignments.has(m.aAlignment)||!alignments.has(m.bAlignment))
     throw new Error("Invalid match alignment");
   ids.add(m.matchId);
   let baseModifier=0;
   let baseReason:ArchivedAlignmentEvaluation["baseReason"]=null;
   if((m.aAlignment==="FACE"&&m.bAlignment==="HEEL")||
      (m.aAlignment==="HEEL"&&m.bAlignment==="FACE")){
     baseModifier=2.2;baseReason="FACE_HEEL_CLARITY";
   }else if(m.aAlignment===m.bAlignment){
     baseModifier=m.aAlignment==="TWEENER"?-0.1:-0.3;
     baseReason="SAME_ALIGNMENT";
   }else if(m.aAlignment==="TWEENER"||m.bAlignment==="TWEENER"){
     baseModifier=0.7;baseReason="TWEENER_TENSION";
   }
   const volatility=-Math.max(penalty(m.aId),penalty(m.bId));
   const modifier=volatility< -0.05?
     clamp(baseModifier+volatility,-3.5,2.2):baseModifier;
   return {matchId:m.matchId,position:m.position,
     modifier:round1(modifier),
     reason:volatility< -0.05?"ALIGNMENT_VOLATILITY":baseReason,
     baseModifier,baseReason,volatilityModifier:round1(volatility)};
 });
}
export interface ArchivedAlignedShowPreview {
 phase:"PACING_AND_ALIGNMENT_NOT_FINAL";
 baseCrowdResponse:number;crowdResponse:number;adjustment:number;
 segmentReactions:"NOT_PROJECTED";
 pendingContext:readonly ["PROGRAMME","DIRTY_FINISH_HISTORY","SEGMENT_CROWD"];
 matches:readonly (ArchivedAlignmentEvaluation &{
    pacingModifier:number;pacingReason:string|null;adjustedCrowdResponse:number;weight:number;
 })[];
}
/** The archived show-flow weighted aggregation with the known alignment and
 * pacing terms only; critically, it is still not an official show result.
 */
export function combineArchivedPacingAndAlignments(
 pacing:ArchivedPacingPreview,
 alignment:readonly ArchivedAlignmentEvaluation[],
):ArchivedAlignedShowPreview {
 if(pacing.segments!=="NOT_PROJECTED"||pacing.matches.length!==alignment.length)
   throw new Error("Incompatible pacing and alignment projections");
 const byId=new Map(alignment.map(x=>[x.matchId,x]));
 if(byId.size!==alignment.length)throw new Error("Duplicate alignment projections");
 const matches=pacing.matches.map(p=>{
   const a=byId.get(p.matchId);
   if(!a||a.position!==p.position)throw new Error("Mismatched match alignment projection");
   return {...a,pacingModifier:p.pacingModifier,pacingReason:p.pacingReason,
     weight:p.weight,adjustedCrowdResponse:round1(clamp(
       p.originalCrowd+a.modifier+p.pacingModifier,0,100))};
 });
 const total=matches.reduce((n,m)=>n+m.weight,0);
 const crowdResponse=round1(matches.reduce((n,m)=>n+m.adjustedCrowdResponse*m.weight,0)/total);
 // The archived no-segment baseline is the raw (unweighted) mean.
 return {phase:"PACING_AND_ALIGNMENT_NOT_FINAL",baseCrowdResponse:pacing.baseMatchCrowd,
   crowdResponse,adjustment:round1(crowdResponse-pacing.baseMatchCrowd),
   segmentReactions:"NOT_PROJECTED",
   pendingContext:["PROGRAMME","DIRTY_FINISH_HISTORY","SEGMENT_CROWD"],
   matches};
}
