import type {TransactionPool} from "./transaction.js";
import {withSqlClient} from "./postgres.js";
import {plannedPromiseBookingSql} from "./backstage-promise-sql.js";
import {describeBookingCommitment,type UpcomingPromiseBooking} from "../domain/backstage-booking-commitment.js";

export type PromiseBookCursor={order:number;id:string};
export type PromiseBookView="OUTSTANDING"|"HISTORY";
type PromiseRow={
 id:string;conversation_id:string|null;person_id:string;name:string;decision:string;status:string;
 title:string|null;made:number;due:number|null;assessment:string|null;trust_delta:number;
 planned:UpcomingPromiseBooking|null;sort_order:number;
};

export async function readBackstagePromiseBook(pool:TransactionPool,scope:{
 worldId:string;promotionId:string;playerId:string;view:PromiseBookView;cursor?:PromiseBookCursor;
}){
 const {worldId,promotionId,playerId,view,cursor}=scope;
 if(![worldId,promotionId,playerId].every(s=>typeof s==="string"&&s.length>0&&s.length<=200)||
  (view!=="OUTSTANDING"&&view!=="HISTORY")||
  (cursor!==undefined&&(!cursor||!Number.isSafeInteger(cursor.order)||cursor.order<0||
   typeof cursor.id!=="string"||cursor.id.length<1||cursor.id.length>230)))
  throw new Error("Invalid Backstage Promises view");
 const open=view==="OUTSTANDING";
 const direction=open?"ASC":"DESC",operator=open?">":"<";
 const order=open?"coalesce(r.due_week_index,2147483647)":"r.responded_week_index";
 const renewalOrder=open?"c.expires_week_index+1":"coalesce(r.resolved_week_index,r.created_week_index)";
 const [result]=await withSqlClient(pool,tx=>tx.query<{now:number;entries:PromiseRow[]}>(`
  WITH owner AS MATERIALIZED (
   SELECT w.world_id,(w.year-1)*52+w.week-1 AS now
   FROM ppw_worlds w JOIN ppw_promotion_controls c ON c.world_id=w.world_id
    AND c.promotion_id=$2 AND c.player_id=$3 AND c.active
   JOIN ppw_memberships m ON m.world_id=w.world_id AND m.player_id=c.player_id AND m.status='ACTIVE'
   JOIN ppw_promotions p ON p.world_id=w.world_id AND p.promotion_id=c.promotion_id AND p.lifecycle='ACTIVE'
   WHERE w.world_id=$1
  ), selected AS MATERIALIZED (
   (SELECT 'conversation:'||r.request_id AS id,r.request_id AS conversation_id,r.person_id,r.decision,
    CASE WHEN r.decision<>'EXPLORE_RENEWAL' THEN r.status WHEN r.follow_through_week_index IS NOT NULL THEN 'FULFILLED'
     WHEN deal.status='SIGNED' AND deal.start_week_index<=r.responded_week_index AND deal.expires_week_index>=owner.now THEN 'PROMISED'
     ELSE 'EXCUSED' END AS status,
    coalesce(title.name,r.relevant_title) AS title,r.responded_week_index AS made,r.due_week_index AS due,
    r.assessment_reason AS assessment,r.trust_delta,${order} AS sort_order
   FROM owner JOIN ppw_backstage_requests r ON r.world_id=owner.world_id AND r.promotion_id=$2
   LEFT JOIN ppw_contracts deal ON deal.world_id=r.world_id AND deal.contract_id=r.source_contract_id
    AND deal.promotion_id=r.promotion_id AND deal.person_id=r.person_id
   LEFT JOIN ppw_championships title ON title.world_id=r.world_id AND title.promotion_id=r.promotion_id
    AND title.championship_id=r.promised_championship_id
   WHERE r.responded_week_index IS NOT NULL
    AND r.decision IN ('PROMISE_APPEARANCE','PROMISE_SEGMENT','PROMISE_FEATURED','PROMISE_TITLE_MATCH','EXPLORE_RENEWAL')
    AND (${open?"r.status='PROMISED'":"r.status IN ('FULFILLED','BROKEN','EXCUSED')"}
     OR (r.decision='EXPLORE_RENEWAL' AND r.status='ANSWERED' AND r.source_contract_id IS NOT NULL
      AND ${open?"":"NOT "}coalesce(r.follow_through_week_index IS NULL AND deal.status='SIGNED'
       AND deal.start_week_index<=r.responded_week_index AND deal.expires_week_index>=owner.now,false)))
    AND ($4::integer IS NULL OR (${order},'conversation:'||r.request_id) ${operator} ($4,$5::text))
   ORDER BY sort_order ${direction},id ${direction} LIMIT 26)
   UNION ALL
   (SELECT 'renewal:'||r.proposal_id,NULL,r.person_id,'AGREED_RENEWAL',r.status,NULL,
    coalesce(r.resolved_week_index,r.created_week_index),
    CASE WHEN r.status='ACCEPTED' THEN c.expires_week_index+1 END,NULL,0,${renewalOrder}
   FROM owner JOIN ppw_contract_renewal_proposals r ON r.world_id=owner.world_id AND r.promotion_id=$2
   JOIN ppw_contracts c ON c.world_id=r.world_id AND c.contract_id=r.contract_id
    AND c.person_id=r.person_id AND c.promotion_id=r.promotion_id
   WHERE r.status=${open?"'ACCEPTED'":"'ACTIVATED'"}
    AND ($4::integer IS NULL OR (${renewalOrder},'renewal:'||r.proposal_id) ${operator} ($4,$5::text))
   ORDER BY 11 ${direction},1 ${direction} LIMIT 26)
  ), page AS MATERIALIZED (
   SELECT * FROM selected ORDER BY sort_order ${direction},id ${direction} LIMIT 26
  )
  SELECT owner.now,coalesce((SELECT jsonb_agg(to_jsonb(page)||jsonb_build_object('name',person.name,'planned',
   CASE WHEN booking.show_name IS NULL THEN NULL ELSE jsonb_build_object('showName',booking.show_name,
    'year',booking.year,'week',booking.week,'status',booking.status,'kind',booking.kind) END)
   ORDER BY page.sort_order ${direction},page.id ${direction})
   FROM page JOIN ppw_people person ON person.world_id=owner.world_id AND person.person_id=page.person_id
   LEFT JOIN ppw_backstage_requests r ON r.world_id=owner.world_id AND r.request_id=page.conversation_id
    AND r.promotion_id=$2 AND page.status='PROMISED' AND page.decision<>'EXPLORE_RENEWAL'
   LEFT JOIN LATERAL (${plannedPromiseBookingSql("r","owner.now")}) booking ON true),'[]'::jsonb) AS entries
  FROM owner`,[worldId,promotionId,playerId,cursor?.order??null,cursor?.id??null]));
 if(!result)throw new Error("Backstage Promises access denied");
 const last=result.entries[24];
 return {entries:result.entries.slice(0,25).map(row=>{
  const booking=describeBookingCommitment({decision:row.decision,status:row.status,
   dueWeekIndex:row.due,assessmentReason:row.assessment,trustDelta:row.trust_delta,
   plannedBooking:row.planned,relevantTitle:row.title},result.now);
  const labels:Record<string,string>={PROMISE_APPEARANCE:"Book an in-ring appearance",
   PROMISE_SEGMENT:"Give time for a promo or angle",PROMISE_FEATURED:"Book a featured match",
   PROMISE_TITLE_MATCH:"Give a "+(row.title??"championship")+" opportunity",
   EXPLORE_RENEWAL:"Open renewal discussions",AGREED_RENEWAL:"Start the agreed renewal"};
  const renewal=row.decision==="AGREED_RENEWAL";
  const status=booking?.stage==="PLANNED"||row.status==="ACCEPTED"?"IN_PROGRESS":
   row.status==="PROMISED"?"OUTSTANDING":row.status==="ACTIVATED"?"FULFILLED":row.status;
  const detail=booking?.detail??(renewal?
   row.status==="ACCEPTED"?"The next agreement takes effect after the current term ends.":
    "The agreed contract term took effect.":
   row.status==="FULFILLED"?"A renewal offer was submitted. The wrestler retains the decision on the terms.":
    row.status==="EXCUSED"?"The original contract term has ended.": "Open Contracts to put an offer on the table.");
  return {id:row.id,conversationId:row.conversation_id,personId:row.person_id,name:row.name,
   commitment:labels[row.decision]!,status,made:row.made,due:row.due,detail,
   nextAction:booking?.canReviewBooking?"PLANNER":open&&!booking?"CONTRACTS":null};
 }),next:result.entries.length>25&&last?{order:last.sort_order,id:last.id}:null};
}
