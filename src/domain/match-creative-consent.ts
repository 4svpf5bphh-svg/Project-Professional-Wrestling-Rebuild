import {createHash} from "node:crypto";
import {normalizeBookableMatch,type BookableMatch} from "./bookable-match.js";
export type CreativeRight="NONE"|"CONSULTATION"|"PROTECTED_FINISHES"|"FULL_APPROVAL";
export type CreativeReason="CONSULTATION_REQUESTED"|"PROTECTED_LOSS"|"MATCH_APPROVAL";
export type CreativeDecision="APPROVED"|"DECLINED"|"NOT_REQUESTED";
export interface CreativeContract{
 promotionId:string;personId:string;contractId:string;name:string;
 creativeControl:CreativeRight;roleExpectation:string;
 morale:number|null;fatigue:number|null;priorities:{role:number;loyalty:number}|null;
}
export interface CreativeSlot{slotId:string;payload:unknown}
export interface CreativeConcern{
 showId:string;slotId:string;personId:string;contractId:string;name:string;
 reason:CreativeReason;requiresConsent:boolean;decision:CreativeDecision;signature:string;
 approvalSource?:"EXACT_MATCH"|"STANDING_PROGRAMME";
}
export interface MatchCreativeReceipt{
 showId:string;slotId:string;personId:string;contractId:string;signature:string;
 decision:"APPROVED"|"DECLINED";
}
const rank:Record<CreativeRight,number>={
 NONE:0,CONSULTATION:1,PROTECTED_FINISHES:2,FULL_APPROVAL:3};
export function creativeMatchSignature(showId:string,slotId:string,
 personId:string,contractId:string,match:BookableMatch):string{
 return createHash("sha256").update(JSON.stringify([
  showId,slotId,personId,contractId,match])).digest("hex");
}
export function buildCreativeConcerns(showId:string,promotionId:string,
 slots:readonly CreativeSlot[],contracts:readonly CreativeContract[],
 receipts:readonly MatchCreativeReceipt[]=[]):CreativeConcern[]{
 const strongest=new Map<string,CreativeContract>();
 for(const c of contracts){
  if(c.promotionId!==promotionId||!Object.hasOwn(rank,c.creativeControl))continue;
  const old=strongest.get(c.personId);
  if(!old||rank[c.creativeControl]>rank[old.creativeControl]||
   rank[c.creativeControl]===rank[old.creativeControl]&&
    c.contractId.localeCompare(old.contractId)<0)strongest.set(c.personId,c);
 }
 const saved=new Map(receipts.map(r=>[
  [r.showId,r.slotId,r.personId,r.contractId,r.signature].join(":"),r.decision]));
 const found:CreativeConcern[]=[];
 for(const slot of slots){
  const match=normalizeBookableMatch(slot.payload);
  const clean=["CLEAN_PIN","SUBMISSION"].includes(match.plannedFinish);
  for(const side of match.sides)for(const p of side.participants){
   const c=strongest.get(p.personId);
   if(!c)continue;
   const loses=side.sideId!==match.scriptedWinnerSide;
   const reason:CreativeReason|null=c.creativeControl==="FULL_APPROVAL"?"MATCH_APPROVAL":
    c.creativeControl==="PROTECTED_FINISHES"&&loses&&clean?"PROTECTED_LOSS":
    c.creativeControl==="CONSULTATION"&&loses&&clean?"CONSULTATION_REQUESTED":null;
   if(!reason)continue;
   const signature=creativeMatchSignature(showId,slot.slotId,p.personId,c.contractId,match);
   found.push({showId,slotId:slot.slotId,personId:p.personId,
    contractId:c.contractId,name:c.name,reason,
    requiresConsent:reason!=="CONSULTATION_REQUESTED",
    decision:saved.get([showId,slot.slotId,p.personId,c.contractId,signature].join(":"))??
     "NOT_REQUESTED",signature});
  }
 }
 return found;
}
export function creativeDecisionScore(c:CreativeContract,reason:CreativeReason):number{
 if(!Number.isFinite(c.morale)||!Number.isFinite(c.fatigue)||
  !c.priorities||!Number.isFinite(c.priorities.loyalty)||
  !Number.isFinite(c.priorities.role))
  throw new Error("Wrestler creative rights require a complete personnel record");
 const importance=["MAIN_EVENT","SPECIAL_ATTRACTION"].includes(c.roleExpectation)?13:
  c.roleExpectation==="UPPER_CARD"?8:3;
 const protectedLoss=reason==="PROTECTED_LOSS";
 const raw=67+(c.morale!-50)*.38+(c.priorities.loyalty-c.priorities.role)*.08-
  c.fatigue!*.09-(protectedLoss?importance+13:importance*.45);
 return Math.max(0,Math.min(100,Math.round(raw)));
}
export function creativeApprovalRequired(items:readonly CreativeConcern[]){
 return items.filter(x=>x.requiresConsent&&x.decision!=="APPROVED");
}
