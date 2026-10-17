/** Authoritative, historically stable consequences from a locked match.
 * Never infer a title transfer, injury, run-in or elimination from crowd score.
 * This projector is pure: the World resolver already verified each evidence row.
 */
import type {CompletedMatchEvidence} from "./completed-match-evidence.js";
import type {CompletedMatchReceipt,CompletedShowReceipt}
 from "./completed-show-receipt.js";
import {validateCompletedMatchEvidence} from "./completed-match-evidence.js";

export interface BroadcastMedical{
 personName:string;severity:"MINOR"|"MODERATE"|"MAJOR"|"SEVERE";
 weeksOut:number|null;stoppage:boolean;
}
export interface BroadcastTitle{
 name:string;winnerName:string;priorHolderName:string|null;
 changed:boolean;
}
export interface BroadcastFallout{
 /** Immutable critic score and actual running time from the World simulation. */
 ratingStars?:number;executionQuality?:number;actualMinutes?:number;
 chemistryModifier?:number;finishCheaterName?:string;
 linkedProgrammes?:number;programmeSignal?:"HOT_PROGRAMME"|"COOL_PROGRAMME"|
  "PROGRAMME_REPETITION"|null;
 title?:BroadcastTitle;
 injuries:BroadcastMedical[];
 interference?:{personName:string|null;outcome:"SUCCESS"|"THWARTED"|"ABORTED"};
 eliminations:string[];
}
export interface RecordedMatchFalloutRow extends Record<string,unknown>{
 match_id:string;evidence_json:unknown;
 report_rating_stars?:string|number|null;
 report_execution_quality?:string|number|null;report_actual_minutes?:number|null;
 report_chemistry_modifier?:string|number|null;
 report_finish_cheater_person_id?:string|null;
 report_linked_programmes?:number|null;report_programme_signal?:string|null;
 championship_name:string|null;title_changed:boolean|null;
 title_winner_name:string|null;title_prior_holder_name:string|null;
 injuries:unknown;
}
type RecordedInjury={person_id:string;injury_severity:BroadcastMedical["severity"];
 injury_weeks_out:number};
const severity=new Set(["MINOR","MODERATE","MAJOR","SEVERE"]);
/** The generated copy cannot report unsupported events, even with malformed
 * historic records. Older matches without evidence still get a plain result.
 */
export function projectVerifiedBroadcastFallout(
 row:RecordedMatchFalloutRow|undefined,receipt:CompletedShowReceipt,
 match:CompletedMatchReceipt,
 name:(personId:string)=>string,
 sideNames:ReadonlyMap<string,readonly string[]>,
 interfererId:string|null,
 completedParticipantIds:readonly string[],
):BroadcastFallout{
 const result:BroadcastFallout={injuries:[],eliminations:[]};
 if(!row)return result;
 if(row.report_rating_stars!==null&&row.report_rating_stars!==undefined){
  const stars=Number(row.report_rating_stars);
  if(!Number.isFinite(stars)||stars<0||stars>5)throw new Error("Invalid match star rating");
  result.ratingStars=stars;
 }
 if(row.report_execution_quality!==null&&row.report_execution_quality!==undefined){
  const execution=Number(row.report_execution_quality);
  if(!Number.isFinite(execution)||execution<0||execution>100)
   throw new Error("Invalid match execution quality");
  result.executionQuality=execution;
 }
 if(row.report_chemistry_modifier!==null&&
  row.report_chemistry_modifier!==undefined){
  const chemistry=Number(row.report_chemistry_modifier);
  if(!Number.isFinite(chemistry)||Math.abs(chemistry)>100)
   throw new Error("Invalid historic match chemistry");
  result.chemistryModifier=chemistry;
 }
 if(row.report_finish_cheater_person_id!==null&&
  row.report_finish_cheater_person_id!==undefined){
  if(!["DISQUALIFICATION","FOREIGN_OBJECT"].includes(match.actualFinish)||
   !match.actualWinnerSide||typeof row.report_finish_cheater_person_id!=="string"||
   !row.report_finish_cheater_person_id)
   throw new Error("Unsupported recorded finish cheater");
  const actor=row.report_finish_cheater_person_id;
  // Historical bookings/evidence can be absent; use only known card sides.
  if(!completedParticipantIds.includes(actor))
   throw new Error("Recorded finish cheater was not in the completed match");
  result.finishCheaterName=name(actor);
 }
 if(row.report_actual_minutes!==null&&row.report_actual_minutes!==undefined){
  if(!Number.isSafeInteger(row.report_actual_minutes)||
   row.report_actual_minutes<3||row.report_actual_minutes>120)
   throw new Error("Invalid actual match duration");
  result.actualMinutes=row.report_actual_minutes;
 }
 if(row.report_linked_programmes!==null&&
  row.report_linked_programmes!==undefined){
  if(!Number.isSafeInteger(row.report_linked_programmes)||
   row.report_linked_programmes<0||row.report_linked_programmes>100||
   (row.report_linked_programmes===0&&
    row.report_programme_signal!==null&&row.report_programme_signal!==undefined))
   throw new Error("Invalid certified programme count");
  const signal=row.report_programme_signal??null;
  if(signal!==null&&!["HOT_PROGRAMME","COOL_PROGRAMME",
   "PROGRAMME_REPETITION"].includes(signal))
   throw new Error("Invalid certified programme signal");
  result.linkedProgrammes=row.report_linked_programmes;
  result.programmeSignal=signal as typeof result.programmeSignal;
 }
 if(row.match_id!==match.matchId)throw new Error("Wrong match evidence on broadcast");
 if(row.championship_name!==null){
  if(typeof row.title_changed!=="boolean"||!row.title_winner_name)
   throw new Error("Invalid historic championship contest");
  if(row.title_changed&&
   !["CLEAN_PIN","SUBMISSION","FLASH_PIN"].includes(match.actualFinish))
   throw new Error("Title change contradicts verified match finish");
  result.title={name:row.championship_name,changed:row.title_changed,
   winnerName:row.title_winner_name,priorHolderName:row.title_prior_holder_name};
 }
 let evidence:CompletedMatchEvidence|null=null;
 if(row.evidence_json!==null){
  evidence=row.evidence_json as CompletedMatchEvidence;
  if(!evidence||evidence.matchId!==match.matchId)
   throw new Error("Invalid historic match evidence");
  validateCompletedMatchEvidence(receipt,[evidence]);
  const resolution=evidence.resolution;
  if(resolution.medical?.stoppage){
   result.injuries.push({personName:name(resolution.medical.injuredPersonId),
    severity:resolution.medical.severity,weeksOut:null,stoppage:true});
  }
  if("interference" in resolution&&resolution.interference){
   result.interference={personName:interfererId?name(interfererId):null,
    outcome:resolution.interference.actualOutcome};
  }
  if("completedEliminationOrder" in resolution&&
   resolution.completedEliminationOrder?.length){
   for(const id of resolution.completedEliminationOrder){
    const side=sideNames.get(id);
    if(!side?.length)throw new Error("Historic elimination side unavailable");
    result.eliminations.push(side.join(" & "));
   }
  }
 }
 const injuries=row.injuries??[];
 if(!Array.isArray(injuries)||injuries.length>30)
  throw new Error("Invalid historic injury receipts");
 for(const raw of injuries){
  const value=raw as RecordedInjury;
  if(!value||typeof value.person_id!=="string"||
   !severity.has(value.injury_severity)||
   !Number.isInteger(value.injury_weeks_out)||value.injury_weeks_out<1||
   value.injury_weeks_out>52)
   throw new Error("Invalid historic medical consequence");
  const personName=name(value.person_id);
  const existing=result.injuries.find(x=>x.personName===personName);
  if(existing){
   if(existing.severity!==value.injury_severity)
    throw new Error("Medical evidence contradicts career injury");
   existing.weeksOut=value.injury_weeks_out;
  }else result.injuries.push({personName,severity:value.injury_severity,
   weeksOut:value.injury_weeks_out,stoppage:false});
 }
 return result;
}
