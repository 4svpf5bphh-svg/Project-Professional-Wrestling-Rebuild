/** Gorilla Position: deterministic, legal production decisions on certified
 * show evidence. All managers pre-authorise a policy before the one World Lock.
 * Decisions never change the scripted winner, finishing move, medical result,
 * title transfer, appearance or match/angle order. The only current on-air
 * effect is a bounded SHOW-level commentary recovery with an employed agent.
 */
import type {CompletedShowReceipt} from "./completed-show-receipt.js";
import type {RecordedMatchReportFact} from "../db/record-match-report-facts.js";
export const GORILLA_POLICIES=[
 "STICK_TO_CARD","USE_JUDGEMENT","FOLLOW_THE_CROWD","PROTECT_KEY_PLANS"
] as const;
export type GorillaPolicy=typeof GORILLA_POLICIES[number];
export type GorillaIncidentKind="MEDICAL_STOPPAGE"|"CROWD_DIP"|"CROWD_SURGE"|"TIME_PRESSURE";
export type GorillaChoice="PROTECT_SCRIPT"|"BRIEF_MEDICAL"|"RESET_COMMENTARY"|"LET_CROWD_BREATHE"|"TIGHTEN_TRANSITIONS";
export interface GorillaIncident{
 matchId:string;position:number;kind:GorillaIncidentKind;
 evidence:string;legalChoices:readonly GorillaChoice[];
 choice:GorillaChoice;reason:string;
}
export interface GorillaShowLog{
 policy:GorillaPolicy;staffId:string|null;staffName:string;
 incidents:readonly GorillaIncident[];
 crowdAdjustment:number;crowdBefore:number;crowdAfter:number;
 guarantees:readonly ["SCRIPTED_WINNERS_UNCHANGED","FINISHES_UNCHANGED","MEDICAL_EVIDENCE_UNCHANGED"];
}
export interface GorillaAgent{
 staffId:string;name:string;craft:number;people:number;reliability:number;
}
const bounded=(n:number)=>Number.isFinite(n)&&n>=0&&n<=100;
const round=(n:number)=>Math.round(n*10)/10;
export function planGorillaPosition(
 receipt:CompletedShowReceipt,facts:readonly RecordedMatchReportFact[],
 policy:GorillaPolicy,agent:GorillaAgent|null,
):GorillaShowLog{
 if(!GORILLA_POLICIES.includes(policy)||
  receipt.matches.length!==facts.length||
  new Set(facts.map(f=>f.matchId)).size!==facts.length||
  !bounded(receipt.crowdResponse)||
  !receipt.matches.every(m=>bounded(m.crowdResponse)&&
   facts.some(f=>f.matchId===m.matchId)))
  throw new Error("Gorilla Position requires complete certified match evidence");
 if(agent&&(!bounded(agent.craft)||!bounded(agent.people)||!bounded(agent.reliability)))
  throw new Error("Gorilla Position requires verified staff competencies");
 const incidents:GorillaIncident[]=[];
 const strongestPosition=Math.max(...receipt.matches.map(m=>m.position));
 for(const match of receipt.matches){
  const fact=facts.find(f=>f.matchId===match.matchId)!;
  const protectedMainEvent=policy==="PROTECT_KEY_PLANS"&&
   match.position===strongestPosition;
  // Legitimate medical protection always takes priority over crowd decisions.
  if(fact.injuries.length>0||match.actualFinish==="INJURY_STOPPAGE"){
   incidents.push({matchId:match.matchId,position:match.position,kind:"MEDICAL_STOPPAGE",
    evidence:fact.injuries.length+" verified injury report(s); recorded finish "+match.actualFinish,
    legalChoices:["BRIEF_MEDICAL"],choice:"BRIEF_MEDICAL",
    reason:"Medical facts and any stoppage stand. Refer the actual injuries to the medical desk; no rebooking."});
  }
  if(match.crowdResponse<=42||match.crowdResponse>=85){
   const dip=match.crowdResponse<=42;
   const kind:GorillaIncidentKind=dip?"CROWD_DIP":"CROWD_SURGE";
   const choices:readonly GorillaChoice[]=protectedMainEvent?["PROTECT_SCRIPT"]:
    ["PROTECT_SCRIPT",dip?"RESET_COMMENTARY":"LET_CROWD_BREATHE"];
   const adaptable=!protectedMainEvent&&agent!==null&&
    (policy==="FOLLOW_THE_CROWD"||
     (policy==="USE_JUDGEMENT"&&agent.reliability>=65&&agent.people>=60)||
     (policy==="PROTECT_KEY_PLANS"&&agent.reliability>=80));
   const choice=adaptable?choices[1]!:"PROTECT_SCRIPT";
   incidents.push({matchId:match.matchId,position:match.position,kind,
    evidence:"Certified match crowd response "+round(match.crowdResponse)+"/100",
    legalChoices:choices,choice,
    reason:protectedMainEvent?"Main-event presentation is explicitly protected.":
     choice==="PROTECT_SCRIPT"?"Follow the booked broadcast, without an unapproved change.":
     dip?"Road Agent adapts live commentary only; wrestlers and result are unchanged.":
     "Road Agent holds the crowd's moment without moving or rewriting the card."});
  }
  // A severe real match duration is a production warning, not evidence
  // of a fabricated second deadline or an excuse to change the booked finish.
  if(fact.actualMinutes>=45){
   const choices:readonly GorillaChoice[]=protectedMainEvent?["PROTECT_SCRIPT"]:
    ["PROTECT_SCRIPT","TIGHTEN_TRANSITIONS"];
   const choice=choices.length>1&&agent!==null&&
    policy!=="STICK_TO_CARD"&&agent.craft>=70?
    "TIGHTEN_TRANSITIONS":"PROTECT_SCRIPT";
   incidents.push({matchId:match.matchId,position:match.position,
    kind:"TIME_PRESSURE",evidence:"Certified match duration "+fact.actualMinutes+" minutes",
    legalChoices:choices,choice,
    reason:choice==="TIGHTEN_TRANSITIONS"?
     "Production tightens unbooked transitions only. All card slots and results stay intact.":
     "Keep the booked running order and document the lengthy match."});
  }
  if(incidents.length>100)throw new Error("Gorilla incident capacity exceeded");
 }
 // A well-equipped Road Agent can improve the *show-level* impression of a
 // below-par crowd through live commentary. Capped at 1.0/100, and applied
 // only once inside the canonical receipt's atomic World transaction.
 const resets=incidents.filter(x=>x.choice==="RESET_COMMENTARY").length;
 const crowdAdjustment=agent&&resets?
  Math.min(1,round(resets*(0.2+Math.max(0,agent.people-50)/100))):0;
 return {policy,staffId:agent?.staffId??null,
  staffName:agent?.name??"PPW House Gorilla",
  incidents,crowdAdjustment,crowdBefore:receipt.crowdResponse,
  crowdAfter:Math.min(100,round(receipt.crowdResponse+crowdAdjustment)),
  guarantees:["SCRIPTED_WINNERS_UNCHANGED","FINISHES_UNCHANGED","MEDICAL_EVIDENCE_UNCHANGED"]};
}
