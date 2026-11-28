import type {OfferTerms} from "../domain/contract-economics.js";
import type {SqlRows} from "./world-operations.js";

type WageWindow={
 promotion_id:string;person_id:string;source_id:string;family:OfferTerms["family"];
 start_week:number;end_week:number;wage:number;firm:boolean;
};
const overlaps=(a:WageWindow,b:WageWindow)=>a.start_week<=b.end_week&&b.start_week<=a.end_week;

function pendingWage(windows:readonly WageWindow[],week:number){
 let exclusive=0;
 const limited=new Map<string,number>();
 for(const window of windows){
  if(week<window.start_week||week>window.end_week)continue;
  if(window.family==="EXCLUSIVE")exclusive=Math.max(exclusive,window.wage);
  else limited.set(window.source_id,Math.max(limited.get(window.source_id)??0,window.wage));
 }
 // An exclusive displaces every overlapping bid for this person. Limited
 // deals from independent sources can coexist; alternatives for one source cannot.
 return Math.max(exclusive,[...limited.values()].reduce((sum,wage)=>sum+wage,0));
}

class DelegatedWageBudget {
 private readonly totals=new Map<number,number>();
 private readonly pending=new Map<string,WageWindow[]>();

 constructor(private readonly first:number,private readonly last:number,windows:readonly WageWindow[]){
  const firmByPerson=new Map<string,WageWindow[]>();
  for(const window of windows){
   if(!window.firm)continue;
   const firm=firmByPerson.get(window.person_id)??[];
   firm.push(window);
   firmByPerson.set(window.person_id,firm);
   for(let week=Math.max(first,window.start_week);week<=Math.min(last,window.end_week);week++)
    this.totals.set(week,(this.totals.get(week)??0)+window.wage);
  }
  for(const window of windows){
   if(window.firm||firmByPerson.get(window.person_id)?.some(firm=>
    firm.source_id===window.source_id||
    (overlaps(firm,window)&&(firm.family==="EXCLUSIVE"||window.family==="EXCLUSIVE"))))continue;
   const pending=this.pending.get(window.person_id)??[];
   pending.push(window);
   this.pending.set(window.person_id,pending);
  }
  for(const pending of this.pending.values())
   for(let week=first;week<=last;week++)
    this.totals.set(week,(this.totals.get(week)??0)+pendingWage(pending,week));
 }

 reserve(promotionId:string,personId:string,contractId:string,terms:OfferTerms,limit:number){
  const window:WageWindow={promotion_id:promotionId,person_id:personId,source_id:"contract:"+contractId,
   start_week:terms.startWeekIndex,end_week:terms.startWeekIndex+terms.termWeeks-1,
   family:terms.family,wage:terms.weeklyGuarantee,firm:false};
  if(window.start_week<this.first||window.end_week>this.last)return false;
  const pending=this.pending.get(personId)??[];
  const withOffer=[...pending,window];
  const projected:number[]=[];
  for(let week=window.start_week;week<=window.end_week;week++){
   const total=(this.totals.get(week)??0)+pendingWage(withOffer,week)-pendingWage(pending,week);
   if(total>limit)return false;
   projected.push(total);
  }
  projected.forEach((total,index)=>this.totals.set(window.start_week+index,total));
  this.pending.set(personId,withOffer);
  return true;
 }
}

export async function readDelegatedWageBudgets(tx:SqlRows,worldId:string,week:number,promotions:string[]){
 // Offers can start at most 52 weeks ahead and last at most 52 weeks.
 const first=week+1,last=week+103;
 const rows=await tx.query<WageWindow>(`
  WITH windows AS (
   SELECT c.promotion_id,c.person_id,'signed:'||c.contract_id AS source_id,c.family,
    c.start_week_index AS start_week,c.expires_week_index AS end_week,c.weekly_guarantee AS wage,true AS firm
   FROM ppw_contracts c
   WHERE c.world_id=$1 AND c.promotion_id=ANY($2::text[]) AND c.status='SIGNED'
    AND c.expires_week_index >= $3 AND c.start_week_index <= $4
   UNION ALL
   SELECT r.promotion_id,r.person_id,'contract:'||r.contract_id,r.proposed_terms->>'family',
    c.expires_week_index+1,c.expires_week_index+(r.proposed_terms->>'termWeeks')::integer,
    (r.proposed_terms->>'weeklyGuarantee')::bigint,r.status='ACCEPTED'
   FROM ppw_contract_renewal_proposals r
   JOIN ppw_contracts c ON c.world_id=r.world_id AND c.contract_id=r.contract_id
   WHERE r.world_id=$1 AND r.promotion_id=ANY($2::text[]) AND r.status IN ('PENDING','ACCEPTED')
    AND c.status='SIGNED' AND c.expires_week_index >= $3-1 AND c.expires_week_index < $4
   UNION ALL
   SELECT o.promotion_id,o.person_id,
    coalesce('contract:'||o.source_contract_id,'offer:'||o.offer_id),o.terms->>'family',
    greatest((o.terms->>'startWeekIndex')::integer,$3),
    greatest((o.terms->>'startWeekIndex')::integer,$3)+(o.terms->>'termWeeks')::integer-1,
    (o.terms->>'weeklyGuarantee')::bigint,false
   FROM ppw_contract_offers o
   LEFT JOIN ppw_contracts c ON c.world_id=o.world_id AND c.contract_id=o.source_contract_id
   WHERE o.world_id=$1 AND o.promotion_id=ANY($2::text[]) AND o.status='PENDING'
    AND o.submitted_week_index <= $3-1 AND (o.terms->>'startWeekIndex')::integer BETWEEN $3-1 AND $4
    AND (o.source_contract_id IS NULL OR (
     c.status='SIGNED' AND c.expires_week_index >= $3-1
     AND c.expires_week_index+1=(o.terms->>'startWeekIndex')::integer))
  )
  SELECT promotion_id,person_id,source_id,family,start_week,end_week,wage::double precision,firm
  FROM windows WHERE end_week >= $3 AND start_week <= $4
 `,[worldId,promotions,first,last]);
 const byPromotion=new Map<string,WageWindow[]>();
 for(const row of rows){
  const windows=byPromotion.get(row.promotion_id)??[];
  windows.push(row);
  byPromotion.set(row.promotion_id,windows);
 }
 return new Map(promotions.map(id=>[id,new DelegatedWageBudget(first,last,byPromotion.get(id)??[])]));
}
