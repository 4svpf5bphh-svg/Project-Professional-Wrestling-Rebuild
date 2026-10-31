/** Author-approved finale types, grounded in the actual saved card.
 * Both planning and canonical certification use this exact eligibility table.
 * No scripted winner, alliance or wrestler choice is manufactured here.
 */
export const PROGRAMME_PAYOFFS={
 DECISIVE_MATCH:"Decisive final match",
 TITLE_SHOWDOWN:"Championship showdown",
 STIPULATION_SHOWDOWN:"Final stipulation match",
 BETRAYAL:"Betrayal / final attack",
 RECONCILIATION:"Reconciliation",
 FINAL_CONFRONTATION:"Final confrontation"
} as const;
export type ProgrammePayoff=keyof typeof PROGRAMME_PAYOFFS;
export type FinaleSlotKind="MATCH"|"SEGMENT";
const anglePayoffs:Readonly<Record<string,readonly ProgrammePayoff[]>>={
 TURN:["BETRAYAL"],ATTACK:["BETRAYAL"],STABLE_EXIT:["BETRAYAL"],
 STABLE_RECONCILIATION:["RECONCILIATION"],
 CONFRONTATION:["FINAL_CONFRONTATION"],CHALLENGE:["FINAL_CONFRONTATION"],
 CONTRACT_SIGNING:["FINAL_CONFRONTATION"],INTERRUPTION:["FINAL_CONFRONTATION"]
};
export function eligibleProgrammePayoffs(kind:FinaleSlotKind,payload:unknown):readonly ProgrammePayoff[]{
 if(!payload||typeof payload!=="object"||Array.isArray(payload))return [];
 const data=payload as Record<string,unknown>;
 if(kind==="MATCH"){
  const available:ProgrammePayoff[]=["DECISIVE_MATCH"];
  if(typeof data.championshipId==="string"&&data.championshipId.trim())
   available.push("TITLE_SHOWDOWN");
  if(typeof data.stipulation==="string"&&data.stipulation.trim()&&
    data.stipulation!=="STANDARD")available.push("STIPULATION_SHOWDOWN");
  return available;
 }
 return typeof data.kind==="string"?anglePayoffs[data.kind]??[]:[];
}
export function certifiedFinaleDelivered(input:{
 kind:FinaleSlotKind;payoff:ProgrammePayoff;payload:unknown;
 winnerSide:"A"|"B"|null;angleHappened:boolean;actualFinish?:string|null
}):boolean{
 if(!eligibleProgrammePayoffs(input.kind,input.payload).includes(input.payoff))
  return false;
 // A drawn decisive showdown has not delivered a decisive payoff.
 if(input.kind==="MATCH")return input.winnerSide!==null&&
  !["DISQUALIFICATION","INJURY_STOPPAGE"].includes(input.actualFinish??"");
 if(input.payoff==="RECONCILIATION")
  return input.angleHappened&&
   (input.payload as {stableDecision?:unknown}).stableDecision==="ACCEPTED";
 return input.angleHappened;
}
