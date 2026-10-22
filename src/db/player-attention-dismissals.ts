/** Narrow, non-World-changing acknowledgement of resolved contract and
 * locker-room news. Action-required items cannot be hidden. No background writes.
 */
import type {TransactionPool} from "./transaction.js";
import {withSqlClient} from "./postgres.js";
export interface DismissalScope{
 worldId:string;promotionId:string;playerId:string;attentionId:string;
}
export async function dismissResolvedOfferAttention(pool:TransactionPool,scope:DismissalScope){
 const {worldId,promotionId,playerId,attentionId}=scope;
 const prefix="offer-result:",backstagePrefix="backstage-result:",
  businessPrefix="business-update:",titlePrefix="title-reign:",
  injuryPrefix="injury-report:",clearancePrefix="medical-clearance:";
 const isBackstage=typeof attentionId==="string"&&attentionId.startsWith(backstagePrefix);
 const isBusiness=typeof attentionId==="string"&&attentionId.startsWith(businessPrefix);
 const isTitle=typeof attentionId==="string"&&attentionId.startsWith(titlePrefix);
 const isInjury=typeof attentionId==="string"&&attentionId.startsWith(injuryPrefix);
 const isClearance=typeof attentionId==="string"&&attentionId.startsWith(clearancePrefix);
 if(![worldId,promotionId,playerId].every(x=>
  typeof x==="string"&&!!x.trim()&&x.length<=200)||
  typeof attentionId!=="string"||
  !(attentionId.startsWith(prefix)||isBackstage||isBusiness||isTitle||isInjury||isClearance)||
  attentionId.length>230||
  (isBackstage?!/^[1-9][0-9]{0,14}$/.test(attentionId.slice(backstagePrefix.length)):
   isBusiness?!/^[1-9][0-9]{0,18}$/.test(attentionId.slice(businessPrefix.length)):
   isTitle?(attentionId.length<=titlePrefix.length||attentionId.length>212):
   isClearance?!/^medical-clearance:[1-9][0-9]{0,18}:[0-9a-f]{32}$/.test(attentionId):
   isInjury?!/^injury-report:[0-9a-f]{32}$/.test(attentionId):
   attentionId.length<=prefix.length))
  throw new Error("Invalid dismissible news");
 const offerId=isBackstage||isBusiness||isTitle||isInjury||isClearance?"":attentionId.slice(prefix.length);
 return withSqlClient(pool,async tx=>{
  const result=await tx.query<{permitted:boolean;inserted:boolean}>(isClearance?[
    "WITH permitted AS (",
    "SELECT event.event_id FROM ppw_ledger_events event",
    "JOIN LATERAL jsonb_to_recordset(CASE WHEN",
    "event.event_type='WRESTLER_CLEARED_TO_RETURN'",
    "AND jsonb_typeof(event.payload->'people')='array'",
    "THEN event.payload->'people' ELSE '[]'::jsonb END)",
    "AS person(\"personId\" text,severity text,\"weeksOut\" integer) ON TRUE",
    "JOIN ppw_people wrestler ON wrestler.world_id=event.world_id",
    "AND wrestler.person_id=person.\"personId\" AND wrestler.status='ACTIVE'",
    "JOIN ppw_promotion_controls owner ON owner.world_id=event.world_id",
    "AND owner.promotion_id=$2 AND owner.player_id=$3 AND owner.active",
    "JOIN ppw_memberships m ON m.world_id=event.world_id",
    "AND m.player_id=$3 AND m.status='ACTIVE'",
    "JOIN ppw_worlds w ON w.world_id=event.world_id",
    "WHERE event.world_id=$1 AND event.event_type='WRESTLER_CLEARED_TO_RETURN'",
    "AND $4='medical-clearance:'||event.event_id::text||':'||md5(person.\"personId\")",
    "AND (event.year-1)*52+event.week-1 BETWEEN",
    "greatest(0,(w.year-1)*52+w.week-1-7) AND (w.year-1)*52+w.week-1",
    "AND EXISTS(SELECT 1 FROM ppw_contracts contract",
    "WHERE contract.world_id=event.world_id",
    "AND contract.person_id=person.\"personId\" AND contract.promotion_id=$2",
    "AND contract.status='SIGNED'",
    "AND contract.start_week_index<=(w.year-1)*52+w.week-1",
    "AND contract.expires_week_index>=(w.year-1)*52+w.week-1)",
    "LIMIT 1",
    "), created AS (",
    "INSERT INTO ppw_player_attention_dismissals",
    "(world_id,player_id,promotion_id,attention_id)",
    "SELECT $1,$3,$2,$5 FROM permitted ON CONFLICT DO NOTHING",
    "RETURNING attention_id",
    ") SELECT EXISTS(SELECT 1 FROM permitted) AS permitted,",
    "EXISTS(SELECT 1 FROM created) AS inserted"
   ].join(" "):isInjury?[
   "WITH permitted AS (",
   "SELECT e.person_id FROM ppw_completed_shows done",
   "JOIN LATERAL (",
   "SELECT s.match_id,s.person_id FROM ppw_individual_field_career_effects s",
   "WHERE s.world_id=done.world_id AND s.show_id=done.show_id",
   "AND s.injury_severity IS NOT NULL",
   "UNION ALL",
   "SELECT t.match_id,t.person_id FROM ppw_tag_match_career_effects t",
   "WHERE t.world_id=done.world_id AND t.show_id=done.show_id",
   "AND t.injury_severity IS NOT NULL",
   "UNION",
   "SELECT f.match_id,i.person_id FROM ppw_completed_match_report_facts f",
   "CROSS JOIN LATERAL jsonb_to_recordset(f.injuries_json)",
   "AS i(person_id text,injury_severity text,injury_weeks_out integer)",
   "WHERE f.world_id=done.world_id AND f.show_id=done.show_id",
   "AND i.injury_severity IS NOT NULL",
   ") e ON TRUE",
   "JOIN ppw_people person ON person.world_id=done.world_id",
   "AND person.person_id=e.person_id AND person.status<>'RETIRED'",
   "JOIN ppw_promotion_controls owner ON owner.world_id=done.world_id",
   "AND owner.promotion_id=$2 AND owner.player_id=$3 AND owner.active",
   "JOIN ppw_memberships m ON m.world_id=owner.world_id",
   "AND m.player_id=owner.player_id AND m.status='ACTIVE'",
   "JOIN ppw_promotions p ON p.world_id=owner.world_id",
   "AND p.promotion_id=owner.promotion_id AND p.lifecycle='ACTIVE'",
   "JOIN ppw_worlds w ON w.world_id=done.world_id",
   "WHERE done.world_id=$1",
   "AND $4='injury-report:'||",
   "md5(jsonb_build_array(done.show_id,e.match_id,e.person_id)::text)",
   "AND done.year BETWEEN greatest(1,w.year-1) AND w.year",
   "AND (done.year-1)*52+done.week-1 BETWEEN",
   "greatest(0,(w.year-1)*52+w.week-1-7) AND (w.year-1)*52+w.week-1",
   "AND EXISTS (SELECT 1 FROM ppw_contracts contract",
   "WHERE contract.world_id=done.world_id",
   "AND contract.person_id=e.person_id AND contract.promotion_id=$2",
   "AND contract.status='SIGNED'",
   "AND contract.start_week_index<=(w.year-1)*52+w.week-1",
   "AND contract.expires_week_index>=(w.year-1)*52+w.week-1)",
   "LIMIT 1",
   "), created AS (",
   "INSERT INTO ppw_player_attention_dismissals",
   "(world_id,player_id,promotion_id,attention_id)",
   "SELECT $1,$3,$2,$5 FROM permitted ON CONFLICT DO NOTHING",
   "RETURNING attention_id",
   ") SELECT EXISTS(SELECT 1 FROM permitted) AS permitted,",
   "EXISTS(SELECT 1 FROM created) AS inserted"
  ].join(" "):isTitle?[
   "WITH permitted AS (",
   "SELECT reign.reign_id FROM ppw_championship_reigns reign",
   "JOIN ppw_championships title ON title.world_id=reign.world_id",
   "AND title.promotion_id=reign.promotion_id",
   "AND title.championship_id=reign.championship_id",
   "JOIN ppw_championship_contests contest ON contest.world_id=reign.world_id",
   "AND contest.promotion_id=reign.promotion_id",
   "AND contest.championship_id=reign.championship_id",
   "AND contest.title_changed",
   "AND reign.reign_id=contest.show_id||':'||contest.slot_id||",
   "CASE title.division WHEN 'TAG' THEN ':tag-reign' ELSE ':new-reign' END",
   "JOIN ppw_completed_shows show ON show.world_id=contest.world_id",
   "AND show.show_id=contest.show_id AND show.promotion_id=contest.promotion_id",
   "JOIN ppw_promotion_controls c ON c.world_id=reign.world_id",
   "AND c.promotion_id=reign.promotion_id AND c.player_id=$3 AND c.active",
   "JOIN ppw_memberships m ON m.world_id=c.world_id",
   "AND m.player_id=c.player_id AND m.status='ACTIVE'",
   "JOIN ppw_promotions owner ON owner.world_id=c.world_id",
   "AND owner.promotion_id=c.promotion_id AND owner.lifecycle='ACTIVE'",
   "JOIN ppw_worlds w ON w.world_id=reign.world_id",
   "WHERE reign.world_id=$1 AND reign.promotion_id=$2 AND reign.reign_id=$4",
   "AND length(reign.reign_id)<=200",
   "AND (show.year-1)*52+show.week-1 BETWEEN",
   "greatest(0,(w.year-1)*52+w.week-1-11) AND (w.year-1)*52+w.week-1",
   "LIMIT 1",
   "), created AS (",
   "INSERT INTO ppw_player_attention_dismissals",
   "(world_id,player_id,promotion_id,attention_id)",
   "SELECT $1,$3,$2,$5 FROM permitted ON CONFLICT DO NOTHING",
   "RETURNING attention_id",
   ") SELECT EXISTS(SELECT 1 FROM permitted) AS permitted,",
   "EXISTS(SELECT 1 FROM created) AS inserted"
  ].join(" "):isBusiness?[
   "WITH permitted AS (",
   "SELECT event.event_id FROM ppw_ledger_events event",
   "JOIN ppw_promotion_controls c ON c.world_id=event.world_id",
   "AND c.promotion_id=$2 AND c.player_id=$3 AND c.active",
   "JOIN ppw_memberships m ON m.world_id=c.world_id",
   "AND m.player_id=c.player_id AND m.status='ACTIVE'",
   "JOIN ppw_promotions owner ON owner.world_id=c.world_id",
   "AND owner.promotion_id=c.promotion_id AND owner.lifecycle='ACTIVE'",
   "JOIN ppw_worlds w ON w.world_id=event.world_id",
   "WHERE event.world_id=$1 AND event.event_id=$4::bigint",
   "AND event.event_type IN ('PROMOTION_STANDING_UPDATED','FINANCIAL_DISTRESS_CHANGED')",
   "AND event.payload->>'promotionId'=$2",
   "AND ((event.event_type='FINANCIAL_DISTRESS_CHANGED'",
   "AND event.payload->>'from' IN ('HEALTHY','WATCH','DISTRESSED','CRISIS')",
   "AND event.payload->>'to' IN ('HEALTHY','WATCH','DISTRESSED','CRISIS')",
   "AND event.payload->>'from'<>event.payload->>'to')",
   "OR (event.event_type='PROMOTION_STANDING_UPDATED'",
   "AND jsonb_typeof(event.payload->'prestigeDelta')='number'",
   "AND jsonb_typeof(event.payload->'prestige')='number'))",
   "AND (event.year-1)*52+event.week-1 BETWEEN",
   "greatest(0,(w.year-1)*52+w.week-1-11) AND (w.year-1)*52+w.week-1",
   "LIMIT 1",
   "), created AS (",
   "INSERT INTO ppw_player_attention_dismissals",
   "(world_id,player_id,promotion_id,attention_id)",
   "SELECT $1,$3,$2,$5 FROM permitted ON CONFLICT DO NOTHING",
   "RETURNING attention_id",
   ") SELECT EXISTS(SELECT 1 FROM permitted) AS permitted,",
   "EXISTS(SELECT 1 FROM created) AS inserted"
  ].join(" "):isBackstage?[
   "WITH permitted AS (",
   "SELECT event.event_id FROM ppw_ledger_events event",
   "JOIN ppw_backstage_requests request ON request.world_id=event.world_id",
   "AND request.request_id=event.payload->>'conversationId'",
   "AND request.promotion_id=$2",
   "JOIN ppw_promotion_controls c ON c.world_id=event.world_id",
   "AND c.promotion_id=$2 AND c.player_id=$3 AND c.active",
   "JOIN ppw_memberships m ON m.world_id=c.world_id",
   "AND m.player_id=c.player_id AND m.status='ACTIVE'",
   "JOIN ppw_promotions owner ON owner.world_id=c.world_id",
   "AND owner.promotion_id=c.promotion_id AND owner.lifecycle='ACTIVE'",
   "JOIN ppw_worlds w ON w.world_id=event.world_id",
   "WHERE event.world_id=$1 AND event.event_id=$4::bigint",
   "AND event.event_type IN ('BACKSTAGE_PROMISE_FULFILLED','BACKSTAGE_PROMISE_BROKEN')",
   "AND event.payload->>'promotionId'=$2",
   "AND event.payload->>'personId'=request.person_id",
   "AND request.status=CASE",
   "WHEN event.event_type='BACKSTAGE_PROMISE_FULFILLED'",
   "THEN 'FULFILLED' ELSE 'BROKEN' END",
   "AND (event.year-1)*52+event.week-1 BETWEEN",
   "greatest(0,(w.year-1)*52+w.week-1-3) AND (w.year-1)*52+w.week-1",
   "LIMIT 1",
   "), created AS (",
   "INSERT INTO ppw_player_attention_dismissals",
   "(world_id,player_id,promotion_id,attention_id)",
   "SELECT $1,$3,$2,$5 FROM permitted ON CONFLICT DO NOTHING",
   "RETURNING attention_id",
   ") SELECT EXISTS(SELECT 1 FROM permitted) AS permitted,",
   "EXISTS(SELECT 1 FROM created) AS inserted"
  ].join(" "):[
   "WITH permitted AS (",
   "SELECT offer.offer_id FROM ppw_contract_offers offer",
   "JOIN ppw_promotion_controls c ON c.world_id=offer.world_id",
   "AND c.promotion_id=offer.promotion_id AND c.player_id=$3 AND c.active",
   "JOIN ppw_memberships m ON m.world_id=c.world_id",
   "AND m.player_id=c.player_id AND m.status='ACTIVE'",
   "JOIN ppw_promotions owner ON owner.world_id=c.world_id",
   "AND owner.promotion_id=c.promotion_id AND owner.lifecycle='ACTIVE'",
   "JOIN ppw_worlds w ON w.world_id=offer.world_id",
   "WHERE offer.world_id=$1 AND offer.promotion_id=$2 AND offer.offer_id=$4",
   "AND offer.status IN ('ACCEPTED','REJECTED')",
   "AND offer.submitted_week_index BETWEEN",
   "greatest(0,(w.year-1)*52+w.week-1-3) AND (w.year-1)*52+w.week-1",
   "LIMIT 1",
   "), created AS (",
   "INSERT INTO ppw_player_attention_dismissals",
   "(world_id,player_id,promotion_id,attention_id)",
   "SELECT $1,$3,$2,$5 FROM permitted ON CONFLICT DO NOTHING",
   "RETURNING attention_id",
   ") SELECT EXISTS(SELECT 1 FROM permitted) AS permitted,",
   "EXISTS(SELECT 1 FROM created) AS inserted"
  ].join(" "),isInjury||isClearance?
   [worldId,promotionId,playerId,attentionId,attentionId]:
   isTitle?
   [worldId,promotionId,playerId,attentionId.slice(titlePrefix.length),attentionId]:
   isBusiness?
   [worldId,promotionId,playerId,attentionId.slice(businessPrefix.length),attentionId]:
   isBackstage?
   [worldId,promotionId,playerId,attentionId.slice(backstagePrefix.length),attentionId]:
   [worldId,promotionId,playerId,offerId,attentionId]);
  if(result.length!==1||!result[0]!.permitted)
   throw new Error("This update is unavailable or cannot be dismissed");
  return {dismissed:true,firstDismissal:result[0]!.inserted};
 });
}

/** Clear up to ten published, resolved notices in ONE atomic and owner-scoped
 * statement. Any forged/expired item aborts the entire set.
 */
export async function dismissResolvedAttentionBatch(pool:TransactionPool,s:{
 worldId:string;promotionId:string;playerId:string;attentionIds:readonly string[];
}){
 const {worldId,promotionId,playerId,attentionIds}=s;
 const valid=(id:string)=>(
  id.startsWith("offer-result:")&&id.length>13&&id.length<=230
 )||/^backstage-result:[1-9][0-9]{0,14}$/.test(id)||
  /^business-update:[1-9][0-9]{0,18}$/.test(id)||
  (id.startsWith("title-reign:")&&id.length>12&&id.length<=212)||
  /^injury-report:[0-9a-f]{32}$/.test(id)||
   /^medical-clearance:[1-9][0-9]{0,18}:[0-9a-f]{32}$/.test(id);
 if(![worldId,promotionId,playerId].every(x=>
  typeof x==="string"&&x.trim().length>0&&x.length<=200)||
  !Array.isArray(attentionIds)||attentionIds.length<1||attentionIds.length>10||
  attentionIds.some(x=>typeof x!=="string"||!valid(x))||
  new Set(attentionIds).size!==attentionIds.length)
  throw new Error("Invalid settled updates");
 return withSqlClient(pool,async tx=>{
  const rows=await tx.query<{permitted_count:number;inserted_count:number}>([
   "WITH owner AS (",
   "SELECT w.year,w.week,w.world_id FROM ppw_worlds w",
   "JOIN ppw_promotion_controls c ON c.world_id=w.world_id",
   "AND c.promotion_id=$2 AND c.player_id=$3 AND c.active",
   "JOIN ppw_memberships m ON m.world_id=c.world_id",
   "AND m.player_id=c.player_id AND m.status='ACTIVE'",
   "JOIN ppw_promotions p ON p.world_id=c.world_id",
   "AND p.promotion_id=c.promotion_id AND p.lifecycle='ACTIVE'",
   "WHERE w.world_id=$1",
   "), requested AS (SELECT unnest($4::text[]) AS attention_id),",
   "permitted AS (",
   "SELECT requested.attention_id FROM requested CROSS JOIN owner w",
   "WHERE EXISTS (SELECT 1 FROM ppw_contract_offers offer",
   "WHERE offer.world_id=w.world_id AND offer.promotion_id=$2",
   "AND requested.attention_id='offer-result:'||offer.offer_id",
   "AND offer.status IN ('ACCEPTED','REJECTED')",
   "AND offer.submitted_week_index BETWEEN",
   "greatest(0,(w.year-1)*52+w.week-1-3) AND (w.year-1)*52+w.week-1)",
   "OR EXISTS (SELECT 1 FROM ppw_ledger_events event",
   "JOIN ppw_backstage_requests request ON request.world_id=event.world_id",
   "AND request.request_id=event.payload->>'conversationId'",
   "AND request.promotion_id=$2",
   "WHERE event.world_id=w.world_id",
   "AND requested.attention_id='backstage-result:'||event.event_id::text",
   "AND event.event_type IN ('BACKSTAGE_PROMISE_FULFILLED','BACKSTAGE_PROMISE_BROKEN')",
   "AND event.payload->>'promotionId'=$2",
   "AND event.payload->>'personId'=request.person_id",
   "AND request.status=CASE",
   "WHEN event.event_type='BACKSTAGE_PROMISE_FULFILLED'",
   "THEN 'FULFILLED' ELSE 'BROKEN' END",
   "AND (event.year-1)*52+event.week-1 BETWEEN",
   "greatest(0,(w.year-1)*52+w.week-1-3) AND (w.year-1)*52+w.week-1)",
   "OR EXISTS (SELECT 1 FROM ppw_ledger_events event",
   "WHERE event.world_id=w.world_id",
   "AND requested.attention_id='business-update:'||event.event_id::text",
   "AND event.event_type IN ('PROMOTION_STANDING_UPDATED','FINANCIAL_DISTRESS_CHANGED')",
   "AND event.payload->>'promotionId'=$2",
   "AND ((event.event_type='FINANCIAL_DISTRESS_CHANGED'",
   "AND event.payload->>'from' IN ('HEALTHY','WATCH','DISTRESSED','CRISIS')",
   "AND event.payload->>'to' IN ('HEALTHY','WATCH','DISTRESSED','CRISIS')",
   "AND event.payload->>'from'<>event.payload->>'to')",
   "OR (event.event_type='PROMOTION_STANDING_UPDATED'",
   "AND jsonb_typeof(event.payload->'prestigeDelta')='number'",
   "AND jsonb_typeof(event.payload->'prestige')='number'))",
   "AND (event.year-1)*52+event.week-1 BETWEEN",
   "greatest(0,(w.year-1)*52+w.week-1-11) AND (w.year-1)*52+w.week-1)",
   "OR EXISTS (SELECT 1 FROM ppw_championship_reigns reign",
   "JOIN ppw_championships title ON title.world_id=reign.world_id",
   "AND title.promotion_id=reign.promotion_id",
   "AND title.championship_id=reign.championship_id",
   "JOIN ppw_championship_contests contest ON contest.world_id=reign.world_id",
   "AND contest.promotion_id=reign.promotion_id",
   "AND contest.championship_id=reign.championship_id",
   "AND contest.title_changed",
   "AND reign.reign_id=contest.show_id||':'||contest.slot_id||",
   "CASE title.division WHEN 'TAG' THEN ':tag-reign' ELSE ':new-reign' END",
   "JOIN ppw_completed_shows show ON show.world_id=contest.world_id",
   "AND show.show_id=contest.show_id AND show.promotion_id=contest.promotion_id",
   "WHERE reign.world_id=w.world_id AND reign.promotion_id=$2",
   "AND requested.attention_id='title-reign:'||reign.reign_id",
   "AND length(reign.reign_id)<=200",
   "AND (show.year-1)*52+show.week-1 BETWEEN",
   "greatest(0,(w.year-1)*52+w.week-1-11) AND (w.year-1)*52+w.week-1)",
   "OR EXISTS (SELECT 1 FROM ppw_completed_shows done",
   "JOIN LATERAL (",
   "SELECT s.match_id,s.person_id FROM ppw_individual_field_career_effects s",
   "WHERE s.world_id=done.world_id AND s.show_id=done.show_id",
   "AND s.injury_severity IS NOT NULL",
   "UNION ALL",
   "SELECT t.match_id,t.person_id FROM ppw_tag_match_career_effects t",
   "WHERE t.world_id=done.world_id AND t.show_id=done.show_id",
   "AND t.injury_severity IS NOT NULL",
   "UNION",
   "SELECT f.match_id,i.person_id FROM ppw_completed_match_report_facts f",
   "CROSS JOIN LATERAL jsonb_to_recordset(f.injuries_json)",
   "AS i(person_id text,injury_severity text,injury_weeks_out integer)",
   "WHERE f.world_id=done.world_id AND f.show_id=done.show_id",
   "AND i.injury_severity IS NOT NULL",
   ") e ON TRUE",
   "JOIN ppw_people person ON person.world_id=done.world_id",
   "AND person.person_id=e.person_id AND person.status<>'RETIRED'",
   "WHERE done.world_id=w.world_id",
   "AND requested.attention_id='injury-report:'||",
   "md5(jsonb_build_array(done.show_id,e.match_id,e.person_id)::text)",
   "AND done.year BETWEEN greatest(1,w.year-1) AND w.year",
   "AND (done.year-1)*52+done.week-1 BETWEEN",
   "greatest(0,(w.year-1)*52+w.week-1-7) AND (w.year-1)*52+w.week-1",
   "AND EXISTS (SELECT 1 FROM ppw_contracts contract",
   "WHERE contract.world_id=done.world_id",
   "AND contract.person_id=e.person_id AND contract.promotion_id=$2",
   "AND contract.status='SIGNED'",
   "AND contract.start_week_index<=(w.year-1)*52+w.week-1",
   "AND contract.expires_week_index>=(w.year-1)*52+w.week-1))",

   "OR EXISTS (SELECT 1 FROM ppw_ledger_events event",
   "JOIN LATERAL jsonb_to_recordset(CASE WHEN",
    "event.event_type='WRESTLER_CLEARED_TO_RETURN'",
    "AND jsonb_typeof(event.payload->'people')='array'",
    "THEN event.payload->'people' ELSE '[]'::jsonb END)",
   "AS person(\"personId\" text,severity text,\"weeksOut\" integer) ON TRUE",
   "JOIN ppw_people wrestler ON wrestler.world_id=event.world_id",
   "AND wrestler.person_id=person.\"personId\" AND wrestler.status='ACTIVE'",
   "WHERE event.world_id=w.world_id",
   "AND event.event_type='WRESTLER_CLEARED_TO_RETURN'",
   "AND requested.attention_id='medical-clearance:'||event.event_id::text||':'",
   "||md5(person.\"personId\")",
   "AND (event.year-1)*52+event.week-1 BETWEEN",
   "greatest(0,(w.year-1)*52+w.week-1-7) AND (w.year-1)*52+w.week-1",
   "AND EXISTS (SELECT 1 FROM ppw_contracts contract",
   "WHERE contract.world_id=event.world_id",
   "AND contract.person_id=person.\"personId\" AND contract.promotion_id=$2",
   "AND contract.status='SIGNED'",
   "AND contract.start_week_index<=(w.year-1)*52+w.week-1",
   "AND contract.expires_week_index>=(w.year-1)*52+w.week-1))",
   "), inserted AS (",
   "INSERT INTO ppw_player_attention_dismissals",
   "(world_id,player_id,promotion_id,attention_id)",
   "SELECT $1,$3,$2,attention_id FROM permitted",
   "WHERE (SELECT count(*) FROM permitted)=cardinality($4::text[])",
   "ON CONFLICT DO NOTHING RETURNING attention_id",
   ") SELECT (SELECT count(*)::integer FROM permitted) AS permitted_count,",
   "(SELECT count(*)::integer FROM inserted) AS inserted_count"
  ].join(" "),[worldId,promotionId,playerId,attentionIds]);
  if(rows.length!==1||Number(rows[0]!.permitted_count)!==attentionIds.length)
   throw new Error("One or more updates are unavailable or cannot be dismissed");
  return {dismissed:attentionIds.length,
   firstDismissals:Number(rows[0]!.inserted_count)};
 });
}
