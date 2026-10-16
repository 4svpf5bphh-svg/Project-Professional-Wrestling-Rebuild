/** Read-only combination of archived show-flow match terms.
 * Segments remain unprojected. No official World result may use this preview.
 */
import type {ArchivedPacingPreview} from "./show-pacing.js";
import type {ArchivedAlignmentEvaluation} from "./show-alignment.js";
import type {ArchivedProgrammeReaction} from "./show-programmes.js";
import type {FinishReaction} from "./show-finishes.js";
const clamp=(n:number)=>Math.max(0,Math.min(100,n));
const round1=(n:number)=>Math.round(n*10)/10;
export function combineArchivedShowMatchContext(
 pacing:ArchivedPacingPreview,
 alignment:readonly ArchivedAlignmentEvaluation[],
 programme:readonly ArchivedProgrammeReaction[],
 finish:readonly FinishReaction[],
){
 if(pacing.segments!=="NOT_PROJECTED")throw new Error("Segment reactions not supported");
 const ids=pacing.matches.map(x=>x.matchId);
 if(ids.length===0||new Set(ids).size!==ids.length)throw new Error("Invalid show match scope");
 const align=new Map(alignment.map(x=>[x.matchId,x]));
 const prog=new Map(programme.map(x=>[x.matchId,x]));
 const finishes=new Map(finish.map(x=>[x.matchId,x]));
 if([align,prog,finishes].some((m,i)=>m.size!==[alignment,programme,finish][i]!.length||
   m.size!==ids.length||ids.some(id=>!m.has(id))))
  throw new Error("Incomplete or duplicated show context");
 const matches=pacing.matches.map(p=>{
  const a=align.get(p.matchId)!;
  const g=prog.get(p.matchId)!;
  const f=finishes.get(p.matchId)!;
  if(a.position!==p.position||!Number.isFinite(p.originalCrowd)||
    !Number.isFinite(p.weight)||p.weight<=0||
    ![a.modifier,g.modifier,f.modifier,p.pacingModifier].every(Number.isFinite))
   throw new Error("Invalid show context projection");
  const adjustedCrowdResponse=round1(clamp(p.originalCrowd+a.modifier+
   g.modifier+p.pacingModifier+f.modifier));
  return {matchId:p.matchId,position:p.position,originalCrowd:p.originalCrowd,
   adjustedCrowdResponse,weight:p.weight,
   alignmentModifier:a.modifier,alignmentReason:a.reason,
   programmeModifier:g.modifier,programmeReason:g.reason,
   pacingModifier:p.pacingModifier,pacingReason:p.pacingReason,
   finishModifier:f.modifier,finishReason:f.reason,
   finishRepeatCount:f.repeatCount,finishProgrammeLinked:f.programmeLinked};
 });
 const weight=matches.reduce((sum,m)=>sum+m.weight,0);
 const crowdResponse=round1(matches.reduce((sum,m)=>
   sum+m.adjustedCrowdResponse*m.weight,0)/weight);
 return {phase:"MATCH_CONTEXT_ONLY_NOT_FINAL" as const,
  baseCrowdResponse:pacing.baseMatchCrowd,crowdResponse,
  adjustment:round1(crowdResponse-pacing.baseMatchCrowd),
  segmentReactions:"NOT_PROJECTED" as const,matches};
}
