/** Pure, provisional segment crowd response. Authored outcome is immutable.
 * Does not alter storylines, alignments, contracts or recorded show results.
 * Tunable first-pass parameters are explicit, not claimed as archived formulas.
 */
import {validateAuthoredSegments,type AuthoredSegment} from "./show-segments.js";
export interface SegmentPerformerContext {
 personId:string;name?:string;popularity:number;presentation:number;momentum:number;
 /** Live crowd connection; legacy input without it uses popularity. */
 overness?:number;
}
export interface SegmentCrowdContext {
 segment:AuthoredSegment;performers:readonly SegmentPerformerContext[];
 storylineHeat:number;repetitionCount:number;
}
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
const round1=(n:number)=>Math.round(n*10)/10;
const baseByKind:Record<AuthoredSegment["kind"],number>={
 PROMO:2,INTERVIEW:2,CONFRONTATION:4,CHALLENGE:3,CELEBRATION:2,
 ATTACK:3,INTERRUPTION:3,RESCUE:4,POST_MATCH_ASSAULT:4,TURN:4,CONTRACT_SIGNING:2,INTERFERENCE:2,
 DEBUT:5,VIDEO_PACKAGE:0,STABLE_INVITATION:3,STABLE_EXIT:3,STABLE_RECONCILIATION:4,
};
const videoByPurpose:Record<NonNullable<AuthoredSegment["videoPurpose"]>,number>={
 DEBUT_HYPE:2,RETURN_HYPE:2,WRESTLER_HYPE:0,FEUD_RECAP:1,EVENT_PROMO:1,
};
export function evaluateAuthoredSegmentCrowd(
 contexts:readonly SegmentCrowdContext[],
):readonly {slotId:string;position:number;crowdResponse:number;
 /** A separate certified promo/angle execution rating; not audience size. */
 ratingStars:number;
 outcome:AuthoredSegment["outcome"];components:{
  performer:number;storyline:number;kind:number;repetition:number;
 }}[]{
 if(contexts.length===0)return [];
 const people=new Set(contexts.flatMap(x=>x.performers.map(p=>p.personId)));
 validateAuthoredSegments(contexts.map(x=>x.segment),people);
 return contexts.map(({segment,performers,storylineHeat,repetitionCount})=>{
  if(!Number.isFinite(storylineHeat)||storylineHeat<0||storylineHeat>100||
   !Number.isSafeInteger(repetitionCount)||repetitionCount<0||
   performers.length===0||performers.length>40||
   new Set(performers.map(p=>p.personId)).size!==performers.length||
   performers.some(p=>!p.personId||
    [p.popularity,p.presentation,p.momentum,p.overness??p.popularity].some(n=>
     !Number.isFinite(n)||n<0||n>100)))
   throw new Error("Invalid segment crowd context");
  // A named target in a solo PROMO may be mentioned, not present on camera.
  // Never count their star power or presentation as part of the segment.
  const ids=[...segment.actorIds,
   ...(segment.targetPresence==="MENTIONED"?[]:segment.targetIds)];
  if(ids.length===0||ids.some(id=>!performers.some(p=>p.personId===id)))
   throw new Error("Missing segment participant");
  const featured=performers.filter(p=>ids.includes(p.personId));
  const performer=featured.reduce((n,p)=>n+
   p.popularity*0.22+(p.overness??p.popularity)*0.23+
   p.presentation*0.4+p.momentum*0.15,0)/featured.length;
  const storyline=(storylineHeat-50)*0.14;
  // A live arrival is scripted by the booker. Its presentation and chosen
  // purpose shape reception, but never replace the arrival or invent a rival.
  const debut=segment.kind==="DEBUT"&&segment.creativeBeat?.kind==="DEBUT"?
   segment.creativeBeat:null;
  const arrivalFit=debut?(
   (debut.presentation==="SURPRISE_REVEAL"?1:0)+
   (debut.objective==="ESTABLISH_STAR"?(performer<70?2:0):
    debut.objective==="BUILD_EXCITEMENT"?1:
    debut.objective==="CREATE_MYSTERY"?
     (debut.presentation==="SURPRISE_REVEAL"?2:0):
    debut.objective==="UNSETTLE_RIVAL"?(storylineHeat>=60?2:-1):
    debut.objective==="REIGNITE_PROGRAMME"?(storylineHeat>=65?3:-2):0)
  ):0;
  const kind=baseByKind[segment.kind]+arrivalFit+
   (segment.videoPurpose?videoByPurpose[segment.videoPurpose]:0);
  const repetition=-Math.min(14,repetitionCount*2);
  const crowdResponse=round1(clamp(performer+storyline+kind+repetition,0,100));
  // An angle can be expertly performed without being over with this crowd.
  // Grade execution/presentation, coherent story stakes and originality
  // separately from the popularity-led crowd metric. Star grades are
  // quarter-step, World-certified and never supplied by generative AI.
  const delivery=featured.reduce((sum,p)=>
   sum+p.presentation*0.72+p.momentum*0.28,0)/featured.length;
  const craft=delivery*0.67+storylineHeat*0.20+7+
   Math.max(0,kind)*0.9-Math.min(18,repetitionCount*1.75);
  const ratingStars=Math.round(clamp(craft/20,0,5)*4)/4;
  return {slotId:segment.slotId,position:segment.position,crowdResponse,
   ratingStars,
   outcome:segment.outcome,components:{performer:round1(performer),
    storyline:round1(storyline),kind,repetition}};
 });
}
