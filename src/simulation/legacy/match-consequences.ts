/** Pure extraction of archived PPW post-match effects from matches.ts,
 * plus archived career.ts injury application and applyMatchLoad ordering.
 * No state writes; simulate one completed singles match using its already
 * resolved medical / interference outcomes. Match wins are not rerolled.
 */
import type {MatchFinish} from "./match-finishes.js";
import {evaluateMatchStyleExecution} from "./match-style.js";
import type {InjuryResolutionInput,InjuryResolutionPreview,InjurySeverity}
  from "./match-injuries.js";
import type {InterferenceResolutionPreview} from "./match-interference.js";

export interface ArchivedMatchConsequencesInput {
  booked:InjuryResolutionInput;
  injury:InjuryResolutionPreview;
  final:InterferenceResolutionPreview;
  mediaReach:number;
  isMainEvent:boolean;
}
export interface WrestlerMatchConsequence {
  personId:string;won:boolean;
  injury:{severity:InjurySeverity;weeksOut:number}|null;
  before:{fatigue:number;wear:number;momentum:number;recognition:number;popularity:number};
  after:{fatigue:number;wear:number;momentum:number;recognition:number;popularity:number};
  delta:{fatigue:number;wear:number;momentum:number;recognition:number;popularity:number};
}
export interface ArchivedMatchConsequencePreview {
  stage:"POST_MATCH_CONSEQUENCES_PRE_SHOW_FLOW";
  actualWinnerId:string;actualFinish:MatchFinish;
  performers:[WrestlerMatchConsequence,WrestlerMatchConsequence];
}
const clamp=(x:number,min:number,max:number)=>Math.max(min,Math.min(max,x));

function winnerMomentumDelta(finish:MatchFinish):number {
  switch(finish){
    case "SUBMISSION":return 1.55;
    case "CLEAN_PIN":return 1.4;
    case "FLASH_PIN":return 0.95;
    case "PROTECTED_FINISH":return 0.7;
    case "DISQUALIFICATION":return 0.55;
    case "FOREIGN_OBJECT":return 0.95;
    case "INJURY_STOPPAGE":return 0.35;
  }
}
function loserMomentumDelta(finish:MatchFinish,greatMatch:boolean):number {
  if(greatMatch)return 0.35;
  switch(finish){
    case "SUBMISSION":return -0.6;
    case "CLEAN_PIN":return -0.45;
    case "FLASH_PIN":return -0.15;
    case "PROTECTED_FINISH":return 0;
    case "DISQUALIFICATION":return -0.05;
    case "FOREIGN_OBJECT":return -0.2;
    case "INJURY_STOPPAGE":return -0.05;
  }
}
function winnerPopularityGain(finish:MatchFinish):number {
  switch(finish){
    case "SUBMISSION":return 0.013;
    case "CLEAN_PIN":return 0.012;
    case "FLASH_PIN":return 0.009;
    case "PROTECTED_FINISH":return 0.006;
    case "DISQUALIFICATION":return 0.004;
    case "FOREIGN_OBJECT":return 0.007;
    case "INJURY_STOPPAGE":return 0.004;
  }
}
/** Preserve the original career.createInjury BEFORE career.applyMatchLoad
 * order. For a newly injured wrestler, the recovery floor and injury wear
 * are applied before ordinary worked-match physical loads.
 */
export function previewArchivedMatchConsequences(
  input:ArchivedMatchConsequencesInput,
):ArchivedMatchConsequencePreview {
  const {booked,injury,final,mediaReach,isMainEvent}=input;
  if(!Number.isFinite(mediaReach)||mediaReach<0||mediaReach>1000000 ||
     typeof isMainEvent!=="boolean")
    throw new Error("Missing or invalid canonical media reach");
  if(injury.plannedWinnerId!==booked.bookedWinnerId ||
    injury.plannedFinish!==booked.plannedFinish ||
    final.plannedWinnerId!==injury.plannedWinnerId ||
    final.actualWinnerId!==injury.actualWinnerId ||
    !booked.personIds.includes(final.actualWinnerId) ||
    final.injuryStoppage!==injury.injuryStoppage ||
    (injury.injuryStoppage && final.actualFinish!=="INJURY_STOPPAGE"))
    throw new Error("Mismatch between booked, medical and interference outcomes");
  if(!Number.isFinite(final.crowdResponse)||final.crowdResponse<0||final.crowdResponse>100)
    throw new Error("Invalid final match crowd response");
  const score=injury.preInjury;
  const allPeople=booked.people;
  const averageRing=allPeople.reduce((sum,p)=>sum+p.skills.inRingQuality,0)/allPeople.length;
  const averageCraft=allPeople.reduce((sum,p)=>sum+p.skills.matchCraft,0)/allPeople.length;
  const averagePresentation=allPeople.reduce((sum,p)=>sum+p.skills.presentation,0)/allPeople.length;
  const averageStamina=allPeople.reduce((sum,p)=>sum+p.skills.stamina,0)/allPeople.length;
  const averageSafety=allPeople.reduce((sum,p)=>sum+p.skills.safety,0)/allPeople.length;
  const styleEvaluation=booked.style===null?null:evaluateMatchStyleExecution(
    booked.style,{inRingQuality:averageRing,matchCraft:averageCraft,
      presentation:averagePresentation,stamina:averageStamina,safety:averageSafety},
    booked.plannedLengthMinutes,
  );
  const loadBase=score.actualLengthMinutes*(
    styleEvaluation===null?
      (booked.intent==="HIGH_RISK"?0.72:booked.intent==="EPIC"?0.62:0.48):
      clamp(0.32+styleEvaluation.load.physical/220,0.28,0.82)
  );
  const styledWearRate=styleEvaluation===null?null:clamp(
    0.005+styleEvaluation.load.physical/100*0.006+booked.style!.risk/100*0.006,
    0.004,0.022,
  );
  const result=allPeople.map((person,i):WrestlerMatchConsequence=>{
    const personId=booked.personIds[i]!;
    const activeInjury=injury.injuries.find(x=>x.personId===personId);
    let injuryFatigue=person.fatigue,injuryWear=person.wear;
    if(activeInjury){
      // Archived career.createInjury, including hard recovery floor.
      injuryFatigue=Math.max(injuryFatigue,
        activeInjury.severity==="SEVERE"?80:
        activeInjury.severity==="MAJOR"?65:
        activeInjury.severity==="MODERATE"?50:35);
      injuryWear=Math.round(clamp(injuryWear+(
        activeInjury.severity==="SEVERE"?5:
        activeInjury.severity==="MAJOR"?3:
        activeInjury.severity==="MODERATE"?1.5:0.5
      ),0,100)*10)/10;
    }
    const fatigue=loadBase*(1.15-person.skills.stamina/220);
    const wear=score.actualLengthMinutes*(
      styleEvaluation===null?
        (booked.intent==="HIGH_RISK"?0.018:booked.intent==="EPIC"?0.012:0.008):
        styledWearRate!
    )*(1.15-person.skills.safety/260);
    // Archived career.applyMatchLoad after createInjury.
    const nextFatigue=Math.round(clamp(injuryFatigue+fatigue,0,100)*10)/10;
    const nextWear=Math.round(clamp(injuryWear+wear,0,100)*10)/10;
    const won=personId===final.actualWinnerId;
    const greatMatch=score.criticalRatingStars>=4;
    const momentumDelta=won?
      winnerMomentumDelta(final.actualFinish):
      loserMomentumDelta(final.actualFinish,greatMatch);
    const nextMomentum=Math.round(clamp(person.momentum+momentumDelta,0,100)*10)/10;
    const exposureBase=0.025+mediaReach/3000+booked.eventImportance/5000+
      (isMainEvent?0.015:0);
    const recognitionGain=exposureBase*Math.max(0.08,1-person.recognition/108);
    const nextRecognition=Math.round(clamp(person.recognition+recognitionGain,0,100)*100)/100;
    const crowdGain=Math.max(0,final.crowdResponse-55)/800;
    const performanceGain=Math.max(0,score.criticalRatingStars-2.5)*0.035;
    const resultGain=won?winnerPopularityGain(final.actualFinish):0;
    const poorPerformancePenalty=score.criticalRatingStars<1.75?0.02:
      final.crowdResponse<32?0.01:0;
    const popularityHeadroom=Math.max(0.12,1-person.popularity/108);
    const popularityDelta=(crowdGain+performanceGain+resultGain)*popularityHeadroom-
      poorPerformancePenalty;
    const nextPopularity=Math.round(clamp(person.popularity+popularityDelta,0,100)*100)/100;
    const before={fatigue:person.fatigue,wear:person.wear,momentum:person.momentum,
      recognition:person.recognition,popularity:person.popularity};
    const after={fatigue:nextFatigue,wear:nextWear,momentum:nextMomentum,
      recognition:nextRecognition,popularity:nextPopularity};
    return {personId,won,injury:activeInjury?{
      severity:activeInjury.severity,weeksOut:activeInjury.weeksOut}:null,
      before,after,delta:{
        fatigue:after.fatigue-before.fatigue,wear:after.wear-before.wear,
        momentum:after.momentum-before.momentum,
        recognition:after.recognition-before.recognition,
        popularity:after.popularity-before.popularity,
      }};
  });
  return {stage:"POST_MATCH_CONSEQUENCES_PRE_SHOW_FLOW",
    actualWinnerId:final.actualWinnerId,actualFinish:final.actualFinish,
    performers:[result[0]!,result[1]!]};
}
