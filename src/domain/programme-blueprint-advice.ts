/** Creative guidance from original, certified Programme facts.
 * No World mutation, invented narrative, Groq call or extra Neon query.
 * A recommended beat is never a performed beat or automatic alignment turn.
 */
import type {StoryBlueprint,StoryBlueprintBeat} from "./story-blueprints.js";
import type {ProgrammeBlueprintProgress} from "./programme-blueprint-progress.js";
import type {ProgrammeCrowdTrend} from "./programme-crowd-trend.js";

export interface ProgrammeBlueprintAdviceInput{
 blueprint:StoryBlueprint;
 progress:ProgrammeBlueprintProgress;
 heat:number|null;repetition:number;
 crowdTrend:ProgrammeCrowdTrend|null;
 medicalHolds:number;
 latestChapter?:{kind:string;segmentKind:string|null;
  winnerSide:"A"|"B"|null}|null;
 latestFollowUp?:{choice:"PURSUE_REMATCH"|"PLAN_RETALIATION"|"LET_STAND";
  nextMatchWeekIndex?:number|null;nextAngleWeekIndex?:number|null}|null;
}
export interface ProgrammeBlueprintAdvice{
 beatId:string|null;
 reason:string;
 signal:"OPENING"|"MEDICAL"|"RETALIATION"|"REMATCH"|
  "COOLING"|"REPETITION"|"HOT"|"UNRESOLVED"|"VARIETY"|"PROGRESS"|"COMPLETE";
}
const spokenKinds=new Set(["INTERVIEW","PROMO","VIDEO_PACKAGE","CHALLENGE","CELEBRATION"]);
const byKind=(choices:readonly StoryBlueprintBeat[],kinds:readonly string[])=>
 kinds.flatMap(kind=>choices.filter(beat=>beat.kind===kind))[0]??null;
/** Decisions prioritise already-earned World evidence over the blueprint's
 * authored order; returning null deliberately means no safe automatic tip.
 * ALL original supported scenes remain selectable by the manager.
 */
export function recommendProgrammeBlueprintBeat(input:ProgrammeBlueprintAdviceInput):
 ProgrammeBlueprintAdvice{
 const {blueprint,progress}=input;
 if(progress.blueprintId!==blueprint.id||
  progress.beats.length!==blueprint.beats.length||
  blueprint.beats.some((b,i)=>b.id!==progress.beats[i]?.beatId))
  throw new Error("Story Blueprint progress is not for this authored story");
 const available=blueprint.beats.filter(beat=>
  progress.beats.find(p=>p.beatId===beat.id)?.status==="AVAILABLE");
 if(!available.length)return {beatId:null,signal:"COMPLETE",reason:
  "No unused beats remain. Review the real completed chapters, choose a payoff, or change the story direction."};
 const choose=(beat:StoryBlueprintBeat,signal:ProgrammeBlueprintAdvice["signal"],
  reason:string):ProgrammeBlueprintAdvice=>({beatId:beat.id,signal,reason});
 if(input.medicalHolds>0){
  const safe=available.find(beat=>spokenKinds.has(beat.kind));
  if(safe)return choose(safe,"MEDICAL",
   "Medical absence recorded. Consider a nonphysical scene, and check real performer clearance before booking.");
  return {beatId:null,signal:"MEDICAL",reason:
   "A medical hold is active and every unused beat calls for physical involvement. Review clearance or change the creative direction."};
 }
 const follow=input.latestFollowUp;
 if(follow?.choice==="PLAN_RETALIATION"&&follow.nextAngleWeekIndex==null){
  const response=byKind(available,["ATTACK","CONFRONTATION","INTERRUPTION","CHALLENGE","PROMO","INTERVIEW"]);
  if(response)return choose(response,"RETALIATION",
   "The booker chose retaliation after a certified match, but no later response has played out. This is one possible next scene.");
 }
 if(follow?.choice==="PURSUE_REMATCH"&&follow.nextMatchWeekIndex==null){
  const challenge=byKind(available,["CHALLENGE","CONTRACT_SIGNING","INTERVIEW","PROMO","VIDEO_PACKAGE"]);
  if(challenge)return choose(challenge,"REMATCH",
   "The requested return match has not happened. Establish the demand on-screen; the match still needs to be booked separately.");
 }
 if(input.crowdTrend?.direction==="COOLING"){
  const clarify=byKind(available,["INTERVIEW","PROMO","VIDEO_PACKAGE","CONFRONTATION"]);
  if(clarify)return choose(clarify,"COOLING",
   "Crowd response fell between certified show weeks. Give the audience a clear new reason to care before escalating.");
 }
 if(input.repetition>=55){
  const variety=byKind(available,["VIDEO_PACKAGE","INTERVIEW","PROMO","CHALLENGE"]);
  if(variety)return choose(variety,"REPETITION",
   "The programme is repeating familiar patterns. A different presentation can move the narrative forward.");
 }
 if((input.heat??0)>=75&&progress.played>=2){
  const climax=byKind(available,["CONFRONTATION","CHALLENGE","TURN","ATTACK","STABLE_EXIT"]);
  if(climax)return choose(climax,"HOT",
   "The rivalry has genuine heat and established chapters. You could raise the stakes or move toward a payoff; no outcome is assumed.");
 }
 if(input.latestChapter?.kind==="MATCH"&&input.latestChapter.winnerSide===null){
  const unresolved=byKind(available,["CHALLENGE","CONFRONTATION","INTERVIEW","PROMO"]);
  if(unresolved)return choose(unresolved,"UNRESOLVED",
   "The latest certified match had no recorded winning side. Give the unresolved contest a clearer next objective.");
 }
 if(input.latestChapter?.kind==="SEGMENT"&&input.latestChapter.segmentKind){
  const fresh=available.find(b=>b.kind!==input.latestChapter?.segmentKind);
  if(fresh&&fresh.id!==available[0]?.id)
   return choose(fresh,"VARIETY",
    "The latest certified chapter already used this scene format. Vary the next presentation if it suits your story.");
 }
 return choose(available[0]!,progress.played>0?"PROGRESS":"OPENING",
  progress.played>0?
  "A recorded chapter has advanced your story. This is the next unused idea, not a required sequence.":
  "Start with this optional scene, or choose any other beat. Only actual certified shows earn story progress.");
}
