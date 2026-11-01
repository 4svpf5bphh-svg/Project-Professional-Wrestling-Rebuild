import type {SqlRows} from "./world-operations.js";
import {standingCoveredConcerns} from "./standing-programme-review.js";
import {normalizeBookableMatch} from "../domain/bookable-match.js";
import {contractAvailability} from "../domain/contract-availability.js";
export type CreativeReviewShow={showId:string;promotionId:string;weekIndex:number;slots:readonly {slot_id:string;kind:string;payload:unknown}[];checkStanding?:boolean};
import {buildCreativeConcerns,creativeApprovalRequired,
 type CreativeConcern,type CreativeContract,type CreativeRight}
 from "../domain/match-creative-consent.js";
export {creativeApprovalRequired};
type Row={person_id:string;contract_id:string;promotion_id:string;name:string;
 creative_control:CreativeRight;role_expectation:string;morale:number|null;
 fatigue:number|null;contract_priorities:CreativeContract["priorities"];
 start_week_index:number;expires_week_index:number};
export async function creativeReviewsInTransaction(tx:SqlRows,worldId:string,
 shows:readonly CreativeReviewShow[]):Promise<CreativeConcern[]>{
 const active=shows.filter(x=>x.slots.some(s=>s.kind==="MATCH"));
 if(!active.length)return [];
 const people=[...new Set(active.flatMap(show=>show.slots.flatMap(slot=>{
  if(slot.kind!=="MATCH")return [];
  const m=slot.payload as {participants?:{personId?:string}[]};
  return Array.isArray(m?.participants)?m.participants.flatMap(p=>
   typeof p?.personId==="string"?[p.personId]:[]):[];
 })))];
 if(people.length>3000)throw new Error("Too many booked wrestlers");
 const weeks=active.map(x=>x.weekIndex);
 const contracts=await tx.query<Row>([
  "SELECT c.person_id,c.contract_id,c.promotion_id,p.name,",
  "c.creative_control,c.role_expectation,p.morale,p.fatigue,p.contract_priorities,",
  "c.start_week_index,c.expires_week_index FROM ppw_contracts c",
  "JOIN ppw_people p ON p.world_id=c.world_id AND p.person_id=c.person_id",
  "WHERE c.world_id=$1 AND c.promotion_id=ANY($2::text[])",
  "AND c.person_id=ANY($3::text[]) AND c.status='SIGNED'",
  "AND c.creative_control<>'NONE' AND c.start_week_index<=$4",
  "AND c.expires_week_index>=$5 ORDER BY c.person_id,c.contract_id LIMIT 3001"
 ].join(" "),[worldId,[...new Set(active.map(x=>x.promotionId))],
  people,Math.max(...weeks),Math.min(...weeks)]);
 if(contracts.length>3000)throw new Error("Creative contract limit exceeded");
 const scoped=(show:CreativeReviewShow):CreativeContract[]=>
  contracts.filter(c=>c.promotion_id===show.promotionId&&
   c.start_week_index<=show.weekIndex&&c.expires_week_index>=show.weekIndex)
   .map(c=>({promotionId:c.promotion_id,personId:c.person_id,
    contractId:c.contract_id,name:c.name,creativeControl:c.creative_control,
    roleExpectation:c.role_expectation,morale:c.morale,fatigue:c.fatigue,
    priorities:c.contract_priorities}));
 const concerns=active.flatMap(show=>buildCreativeConcerns(
  show.showId,show.promotionId,show.slots.filter(x=>x.kind==="MATCH")
   .map(x=>({slotId:x.slot_id,payload:x.payload})),scoped(show)));
 if(!concerns.some(x=>x.requiresConsent))return concerns;
 const standing=await standingCoveredConcerns(tx,worldId,active,concerns);
 const decisions=await tx.query<{show_id:string;slot_id:string;
  person_id:string;contract_id:string;signature:string;
  decision:"APPROVED"|"DECLINED"}>([
  "SELECT show_id,slot_id,person_id,contract_id,signature,decision",
  "FROM ppw_match_creative_consents WHERE world_id=$1",
  "AND show_id=ANY($2::text[]) AND signature=ANY($3::text[])",
  "ORDER BY show_id,slot_id,person_id LIMIT 3001"
 ].join(" "),[worldId,[...new Set(active.map(x=>x.showId))],
  concerns.filter(x=>x.requiresConsent).map(x=>x.signature)]);
 if(decisions.length>3000)throw new Error("Creative decisions limit exceeded");
 const key=(x:{showId:string;slotId:string;personId:string;
  contractId:string;signature:string})=>[
   x.showId,x.slotId,x.personId,x.contractId,x.signature].join(":");
 const found=new Map(decisions.map(x=>[key({
  showId:x.show_id,slotId:x.slot_id,personId:x.person_id,
  contractId:x.contract_id,signature:x.signature}),x.decision]));
 return concerns.map(x=>{
  const standingKey=[x.showId,x.slotId,x.personId,x.contractId].join("\u0001");
  if(x.reason==="MATCH_APPROVAL"&&standing.has(standingKey))
   return {...x,decision:"APPROVED" as const,
    approvalSource:"STANDING_PROGRAMME" as const};
  const exact=found.get(key(x));
  return {...x,decision:exact??x.decision,
   ...(exact?{approvalSource:"EXACT_MATCH" as const}:{})};
 });
}
import type {TransactionPool} from "./transaction.js";
import {applyWorldCommand} from "./world-commands.js";
import {creativeDecisionScore} from "../domain/match-creative-consent.js";
export async function requestMatchCreativeConsent(pool:TransactionPool,input:{
 worldId:string;promotionId:string;showId:string;slotId:string;personId:string;
 playerId:string;requestId:string;expectedRevision:number;proposedMatch?:unknown;
}){
 if(![input.worldId,input.promotionId,input.showId,input.slotId,
  input.personId,input.playerId,input.requestId].every(s=>
   typeof s==="string"&&s.trim().length>0&&s.length<=200))
  throw new Error("Invalid creative agreement request");
 return applyWorldCommand(pool,{
  worldId:input.worldId,playerId:input.playerId,requestId:input.requestId,
  expectedRevision:input.expectedRevision,requiresOpenWeek:true,
  commandType:"REQUEST_MATCH_CREATIVE_CONSENT",
  execute:async tx=>{
   const drafts=await tx.query<{year:number;week:number}>([
    "SELECT d.year,d.week FROM ppw_booking_drafts d",
    "JOIN ppw_worlds w ON w.world_id=d.world_id AND w.year=d.year AND w.week=d.week",
    "JOIN ppw_promotion_controls c ON c.world_id=d.world_id AND c.promotion_id=d.promotion_id",
    "AND c.player_id=$4 AND c.active",
    "JOIN ppw_memberships m ON m.world_id=c.world_id AND m.player_id=c.player_id",
    "AND m.status='ACTIVE'",
    "JOIN ppw_promotions p ON p.world_id=d.world_id AND p.promotion_id=d.promotion_id",
    "AND p.lifecycle='ACTIVE'",
    "WHERE d.world_id=$1 AND d.promotion_id=$2 AND d.draft_id=$3",
    "AND d.status='DRAFT' AND d.lock_ready_fingerprint IS NULL",
    "AND w.phase='OPEN' AND w.next_lock_at>clock_timestamp()"
   ].join(" "),[input.worldId,input.promotionId,input.showId,input.playerId]);
   if(drafts.length!==1)throw new Error("This show card is not open for wrestler agreements");
    const showWeek=(drafts[0]!.year-1)*52+drafts[0]!.week-1;
    // The unsaved script is validated but not booked; authorization is bound
    // to an exact slot/person/contract/script fingerprint at final confirmation.
    const proposed=input.proposedMatch===undefined?null:normalizeBookableMatch(input.proposedMatch);
    if(proposed){
     const people=proposed.participants;
     if(!people.some(p=>p.personId===input.personId))
      throw new Error("Wrestler is not part of the proposed match");
     const rights=await tx.query<{person_id:string;contract_id:string;family:string;
      remaining_dates:number|null;start_week_index:number;expires_week_index:number;
      status:string;booking_division:string|null;exclusive_elsewhere:boolean;injured:boolean}>([
      "SELECT c.person_id,c.contract_id,c.family,c.remaining_dates,c.start_week_index,",
      "c.expires_week_index,p.status,p.booking_division,",
      "EXISTS(SELECT 1 FROM ppw_contracts rival WHERE rival.world_id=c.world_id",
      "AND rival.person_id=c.person_id AND rival.promotion_id<>c.promotion_id",
      "AND rival.status='SIGNED' AND rival.family='EXCLUSIVE'",
      "AND rival.expires_week_index>=$5) AS exclusive_elsewhere,",
      "EXISTS(SELECT 1 FROM ppw_medical_absences med WHERE med.world_id=c.world_id",
      "AND med.person_id=c.person_id AND med.status='ACTIVE'",
      "AND med.injured_week_index<$5 AND med.cleared_week_index>$5) AS injured",
      "FROM ppw_contracts c JOIN ppw_people p ON p.world_id=c.world_id",
      "AND p.person_id=c.person_id WHERE c.world_id=$1 AND c.promotion_id=$2",
      "AND c.status='SIGNED' AND c.contract_id=ANY($3::text[])",
      "AND c.person_id=ANY($4::text[]) LIMIT 101"
     ].join(" "),[input.worldId,input.promotionId,people.map(p=>p.contractId),
      people.map(p=>p.personId),showWeek]);
     if(rights.length>100)throw new Error("Too many wrestler agreements");
     const divisions=new Set<string>();
     for(const p of people){
      const c=rights.find(c=>c.person_id===p.personId&&c.contract_id===p.contractId);
      if(!c||c.status!=="ACTIVE"||c.injured||c.exclusive_elsewhere||
       !contractAvailability({
        family:c.family as "ONE_OFF"|"LIMITED_NON_EXCLUSIVE"|"EXCLUSIVE",
        status:"SIGNED",startWeekIndex:c.start_week_index,
        expiresWeekIndex:c.expires_week_index,
        remainingDates:c.remaining_dates,currentWeekIndex:showWeek
       }).available)
       throw new Error("Proposed wrestler lacks eligible contract rights for this show");
      if(c.booking_division)divisions.add(c.booking_division);
     }
     if(divisions.size!==1)throw new Error("Proposed match divisions do not match");
     if(proposed.tournamentId){
      const bouts=await tx.query<{person_a:string;person_b:string}>([
       "SELECT person_a,person_b FROM ppw_tournament_bouts",
       "WHERE world_id=$1 AND promotion_id=$2 AND tournament_id=$3",
       "AND bout_no=$4 AND winner_person_id IS NULL",
       "AND (show_id IS NULL OR show_id=$5) LIMIT 2"
      ].join(" "),[input.worldId,input.promotionId,proposed.tournamentId,
       proposed.tournamentBoutNo,input.showId]);
      if(bouts.length!==1||people.map(p=>p.personId).sort().join("|")!==
       [bouts[0]!.person_a,bouts[0]!.person_b].sort().join("|"))
       throw new Error("Proposed tournament match does not match its active bracket");
     }
    }
    const slots=proposed?[{slot_id:input.slotId,kind:"MATCH",payload:proposed}]:
     await tx.query<{slot_id:string;kind:string;payload:unknown}>(
    "SELECT slot_id,kind,payload FROM ppw_card_slots"+
    " WHERE world_id=$1 AND draft_id=$2 AND slot_id=$3 AND kind='MATCH'",
    [input.worldId,input.showId,input.slotId]);
   if(slots.length!==1)throw new Error("Save the complete match first");
   const concerns=await creativeReviewsInTransaction(tx,input.worldId,[{
    showId:input.showId,promotionId:input.promotionId,
    weekIndex:showWeek,slots
   }]);
   const issue=concerns.find(x=>x.personId===input.personId&&x.requiresConsent);
   if(!issue)throw new Error("No contractual approval is needed for this wrestler");
    if(proposed&&proposed.participants.find(p=>p.personId===input.personId)?.contractId!==
       issue.contractId)
     throw new Error("Use the currently signed creative-control contract for this wrestler");
   if(issue.decision!=="NOT_REQUESTED")return {slotId:input.slotId,
    personId:input.personId,decision:issue.decision,existing:true};
   const rows=await tx.query<{morale:number|null;fatigue:number|null;
    contract_priorities:{role:number;loyalty:number}|null;
    role_expectation:string}>([
    "SELECT p.morale,p.fatigue,p.contract_priorities,c.role_expectation",
    "FROM ppw_contracts c JOIN ppw_people p",
    "ON p.world_id=c.world_id AND p.person_id=c.person_id",
    "WHERE c.world_id=$1 AND c.contract_id=$2 AND c.person_id=$3",
    "AND c.promotion_id=$4 AND c.status='SIGNED'"
   ].join(" "),[input.worldId,issue.contractId,input.personId,input.promotionId]);
   if(rows.length!==1)throw new Error("Creative contract expired");
   const c=rows[0]!;
   const score=creativeDecisionScore({
    promotionId:input.promotionId,personId:input.personId,contractId:issue.contractId,
    name:issue.name,creativeControl:"FULL_APPROVAL",
    roleExpectation:c.role_expectation,morale:c.morale,fatigue:c.fatigue,
    priorities:c.contract_priorities
   },issue.reason);
   const decision=score>=55?"APPROVED" as const:"DECLINED" as const;
   const wrote=await tx.query<{decision:string}>([
    "INSERT INTO ppw_match_creative_consents",
    "(world_id,show_id,slot_id,person_id,contract_id,signature,decision,score,decided_week_index)",
    "VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
    "ON CONFLICT DO NOTHING RETURNING decision"
   ].join(" "),[input.worldId,input.showId,input.slotId,input.personId,
    issue.contractId,issue.signature,decision,score,
    (drafts[0]!.year-1)*52+drafts[0]!.week-1]);
   if(wrote.length===0)throw new Error("Creative agreement already recorded");
   return {slotId:input.slotId,personId:input.personId,decision,existing:false};
  }
 });
}
