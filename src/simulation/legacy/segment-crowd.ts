/** Pure, provisional segment crowd response. Authored outcome is immutable.
 * Does not alter storylines, alignments, contracts or recorded show results.
 * Tunable first-pass parameters are explicit, not claimed as archived formulas.
 */
import {validateAuthoredSegments,type AuthoredSegment} from "./show-segments.js";
export interface SegmentPerformerContext {
 personId:string;popularity:number;presentation:number;momentum:number;
}
export interface SegmentCrowdContext {
 segment:AuthoredSegment;performers:readonly SegmentPerformerContext[];
 storylineHeat:number;repetitionCount:number;
}
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
const round1=(n:number)=>Math.round(n*10)/10;
const baseByKind:Record<AuthoredSegment["kind"],number>={
 PROMO:2,INTERVIEW:2,CONFRONTATION:4,CHALLENGE:3,CELEBRATION:2,
 ATTACK:3,TURN:4,CONTRACT_SIGNING:2,INTERFERENCE:2,
 DEBUT:5,VIDEO_PACKAGE:0,STABLE_EXIT:3,STABLE_RECONCILIATION:4,
};
const videoByPurpose:Record<NonNullable<AuthoredSegment["videoPurpose"]>,number>={
 DEBUT_HYPE:2,RETURN_HYPE:2,WRESTLER_HYPE:0,FEUD_RECAP:1,EVENT_PROMO:1,
};
export function evaluateAuthoredSegmentCrowd(
 contexts:readonly SegmentCrowdContext[],
):readonly {slotId:string;position:number;crowdResponse:number;
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
    [p.popularity,p.presentation,p.momentum].some(n=>
     !Number.isFinite(n)||n<0||n>100)))
   throw new Error("Invalid segment crowd context");
  const ids=[...segment.actorIds,...segment.targetIds];
  if(ids.length===0||ids.some(id=>!performers.some(p=>p.personId===id)))
   throw new Error("Missing segment participant");
  const featured=performers.filter(p=>ids.includes(p.personId));
  const performer=featured.reduce((n,p)=>n+
   p.popularity*0.45+p.presentation*0.4+p.momentum*0.15,0)/featured.length;
  const storyline=(storylineHeat-50)*0.14;
  const kind=baseByKind[segment.kind]+
   (segment.videoPurpose?videoByPurpose[segment.videoPurpose]:0);
  const repetition=-Math.min(14,repetitionCount*2);
  const crowdResponse=round1(clamp(performer+storyline+kind+repetition,0,100));
  return {slotId:segment.slotId,position:segment.position,crowdResponse,
   outcome:segment.outcome,components:{performer:round1(performer),
    storyline:round1(storyline),kind,repetition}};
 });
}
