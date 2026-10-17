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
 title?:BroadcastTitle;
 injuries:BroadcastMedical[];
 interference?:{personName:string|null;outcome:"SUCCESS"|"THWARTED"|"ABORTED"};
 eliminations:string[];
}
export interface RecordedMatchFalloutRow{
 match_id:string;evidence_json:unknown;
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
):BroadcastFallout{
 const result:BroadcastFallout={injuries:[],eliminations:[]};
 if(!row)return result;
 if(row.match_id!==match.matchId)throw new Error("Wrong match evidence on broadcast");
 if(row.championship_name!==null){
  if(typeof row.title_changed!=="boolean"||!row.title_winner_name)
   throw new Error("Invalid historic championship contest");
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
