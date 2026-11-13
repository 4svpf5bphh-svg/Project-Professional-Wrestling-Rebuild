/** Private PPW communications from certified World events and employed staff.
 * Only real sources may appear; no random text per page view, Groq call, or
 * materialised weekly message row. One bounded SQL read for the full inbox.
 */
import type {SqlRows} from "./world-operations.js";
import type {TransactionPool} from "./transaction.js";
import {withSqlClient} from "./postgres.js";
import {worldStaff} from "../domain/world-staff.js";
import {COMMERCIAL_COMPANIES} from "../domain/commercial-offers.js";
export type WorldMailKind="NETWORK"|"STAFF"|"SCOUT";
export type WorldMailAction="COMMERCIALS"|"CONTRACTS"|"PROGRAMMES"|"STAFF"|"MARKET";
export interface WorldMail{
 id:string;kind:WorldMailKind;sender:string;subject:string;body:string;
 action:WorldMailAction;createdWeekIndex:number;read:boolean;
}
interface MailRow extends Record<string,unknown>{
 id:string;kind:WorldMailKind;sender_key:string;subject:string;
 body:string;action:WorldMailAction;created_week_index:number;
 read:boolean;seed:string;
}
/** Shared source selection is also used for validating read receipts.
 * Each CTE is limited to the owner's promotion and a rolling evidence window.
 * Counts come from signed contracts, real roster fatigue and real programmes.
 * Scout leads are a genuine uncontracted person, not an invented inbound offer.
 */
export const WORLD_MAIL_SQL=String.raw`
WITH owner AS MATERIALIZED (
 SELECT w.seed::text AS seed,(w.year-1)*52+w.week-1 AS now
 FROM ppw_worlds w
 JOIN ppw_promotion_controls c ON c.world_id=w.world_id
  AND c.promotion_id=$2 AND c.player_id=$3 AND c.active
 JOIN ppw_memberships m ON m.world_id=c.world_id
  AND m.player_id=c.player_id AND m.status='ACTIVE'
 JOIN ppw_promotions p ON p.world_id=c.world_id
  AND p.promotion_id=c.promotion_id AND p.lifecycle='ACTIVE'
 WHERE w.world_id=$1
), network AS (
 SELECT 'NETWORK'::text AS kind,'network:'||n.story_key AS evidence,
  split_part(n.story_key,':',3) AS sender_key,
  n.title AS subject,n.summary AS body,'COMMERCIALS'::text AS action,
  (n.year-1)*52+n.week-1 AS created_week_index
 FROM ppw_world_news_items n JOIN owner o ON true
 WHERE n.world_id=$1 AND n.promotion_id=$2
  AND n.desk='OFFICIAL' AND n.certainty='CONFIRMED'
  AND n.source_kind='EVENT'
  AND n.story_key LIKE 'broadcast:network:%'
  AND (n.year-1)*52+n.week-1 BETWEEN greatest(0,o.now-12) AND o.now
 ORDER BY n.year DESC,n.week DESC,n.story_key DESC LIMIT 8
), pressure AS (
 SELECT o.now,o.seed,
  (SELECT count(*)::integer FROM ppw_contracts c
    WHERE c.world_id=$1 AND c.promotion_id=$2 AND c.status='SIGNED'
     AND c.start_week_index<=o.now
     AND c.expires_week_index BETWEEN o.now AND o.now+4) AS due,
  (SELECT count(DISTINCT c.person_id)::integer
    FROM ppw_contracts c JOIN ppw_people p
     ON p.world_id=c.world_id AND p.person_id=c.person_id
    WHERE c.world_id=$1 AND c.promotion_id=$2 AND c.status='SIGNED'
     AND c.start_week_index<=o.now AND c.expires_week_index>=o.now
     AND p.status IN ('ACTIVE','INJURED') AND p.fatigue>=70) AS tired,
  (SELECT count(*)::integer FROM ppw_programmes p
    WHERE p.world_id=$1 AND p.promotion_id=$2 AND p.status='ACTIVE'
     AND p.repetition>=3) AS stale
 FROM owner o
), staff AS (
 SELECT 'STAFF'::text AS kind,
  'staff:'||e.employment_id||':'||e.role||':'||floor(p.now/4)::integer AS evidence,
  e.staff_id AS sender_key,
  CASE e.role
   WHEN 'TALENT_MANAGER' THEN 'Contract renewals need a look'
   WHEN 'MEDICAL' THEN 'The roster needs a breather'
   ELSE 'Our rivalries are running in circles'
  END AS subject,
  CASE e.role
   WHEN 'TALENT_MANAGER' THEN p.due||' signed contract(s) expire in the next four weeks. We should review the terms before anyone is left off the card.'
   WHEN 'MEDICAL' THEN p.tired||' contracted wrestler(s) have fatigue at 70 or above. I'd check the upcoming workload before they work another long match.'
   ELSE p.stale||' active programme(s) have repeated without moving the story forward. Let's book a proper next chapter.'
  END AS body,
  CASE e.role WHEN 'TALENT_MANAGER' THEN 'CONTRACTS'
   WHEN 'MEDICAL' THEN 'STAFF' ELSE 'PROGRAMMES' END AS action,
  greatest(e.start_week_index,(p.now/4)*4) AS created_week_index
 FROM ppw_staff_employments e JOIN pressure p ON true
 WHERE e.world_id=$1 AND e.promotion_id=$2 AND e.status='ACTIVE'
  AND ((e.role='TALENT_MANAGER' AND p.due>0)
   OR (e.role='MEDICAL' AND p.tired>0)
   OR (e.role='CREATIVE' AND p.stale>0))
 ORDER BY e.role,e.employment_id LIMIT 8
), scouting AS (
 SELECT 'SCOUT'::text AS kind,
  'scout:'||e.employment_id||':'||talent.person_id||':'||
    floor(o.now/8)::integer AS evidence,
  e.staff_id AS sender_key,'A potential free agent is worth a look' AS subject,
  talent.name||' is currently available in the World talent market. I rate them as a prospect worth examining, but a contract is not agreed.' AS body,
  'MARKET'::text AS action,
  greatest(e.start_week_index,(o.now/8)*8) AS created_week_index
 FROM ppw_staff_employments e JOIN owner o ON true
 JOIN LATERAL (
  SELECT p.person_id,p.name FROM ppw_people p
  WHERE p.world_id=$1 AND p.status='ACTIVE'
   AND NOT EXISTS(
    SELECT 1 FROM ppw_contracts c
    WHERE c.world_id=p.world_id AND c.person_id=p.person_id
     AND c.status='SIGNED' AND c.start_week_index<=o.now
     AND c.expires_week_index>=o.now)
  ORDER BY p.popularity DESC,p.person_id LIMIT 1
 ) talent ON true
 WHERE e.world_id=$1 AND e.promotion_id=$2 AND e.status='ACTIVE'
  AND e.role='SCOUT'
 ORDER BY e.employment_id LIMIT 1
), message AS (
 SELECT * FROM network UNION ALL SELECT * FROM staff
 UNION ALL SELECT * FROM scouting
), candidate AS (
 SELECT 'backstage-world:'||md5(message.evidence) AS id,
  message.kind,message.sender_key,message.subject,message.body,
  message.action,message.created_week_index,o.seed
 FROM message JOIN owner o ON true
)
SELECT c.id,c.kind,c.sender_key,c.subject,c.body,c.action,
 c.created_week_index,c.seed,(receipt.attention_id IS NOT NULL) AS read
FROM candidate c
LEFT JOIN ppw_player_attention_dismissals receipt ON receipt.world_id=$1
 AND receipt.promotion_id=$2 AND receipt.player_id=$3
 AND receipt.attention_id=c.id
ORDER BY c.created_week_index DESC,c.id DESC LIMIT 20
`;
function decode(rows:MailRow[]):WorldMail[]{
 if(rows.length>20)throw new Error("Backstage World inbox source exceeded bound");
 const catalogue=new Map<string,string>();
 if(rows.length){
  for(const member of worldStaff(rows[0]!.seed))catalogue.set(member.staffId,member.name);
 }
 return rows.map(r=>{
  if(!/^backstage-world:[a-f0-9]{32}$/.test(r.id)||
   !["NETWORK","STAFF","SCOUT"].includes(r.kind)||
   !["COMMERCIALS","CONTRACTS","PROGRAMMES","STAFF","MARKET"].includes(r.action)||
   !Number.isSafeInteger(r.created_week_index)||r.created_week_index<0)
   throw new Error("Invalid certified Backstage World correspondence");
  const network=r.kind==="NETWORK"?COMMERCIAL_COMPANIES[r.sender_key]?.name:null;
  return {id:r.id,kind:r.kind,
   sender:network??catalogue.get(r.sender_key)??(r.kind==="NETWORK"?"Your broadcaster":"Staff Office"),
   subject:r.subject,body:r.body,action:r.action,
   createdWeekIndex:r.created_week_index,read:r.read===true};
 });
}
export async function readWorldMail(tx:SqlRows,scope:{
 worldId:string;promotionId:string;playerId:string
}):Promise<WorldMail[]>{
 const {worldId,promotionId,playerId}=scope;
 if(![worldId,promotionId,playerId].every(x=>typeof x==="string"&&!!x&&x.length<=200))
  throw new Error("Invalid Backstage World inbox scope");
 return decode(await tx.query<MailRow>(WORLD_MAIL_SQL,[worldId,promotionId,playerId]));
}
/** Opening one actual inbox item writes one idempotent receipt. It cannot
 * mark rival mail as read, fabricate a source or consume World revision.
 */
export async function markWorldMailRead(pool:TransactionPool,scope:{
 worldId:string;promotionId:string;playerId:string;mailId:string
}){
 const {worldId,promotionId,playerId,mailId}=scope;
 if(!/^backstage-world:[a-f0-9]{32}$/.test(mailId)||
  ![worldId,promotionId,playerId].every(x=>typeof x==="string"&&!!x&&x.length<=200))
  throw new Error("Invalid Backstage mail receipt");
 return withSqlClient(pool,async tx=>{
  const messages=await readWorldMail(tx,{worldId,promotionId,playerId});
  const target=messages.find(m=>m.id===mailId);
  if(!target)throw new Error("That message is no longer available to this manager");
  if(target.read)return {readCount:0};
  const added=await tx.query<{attention_id:string}>(String.raw`
   INSERT INTO ppw_player_attention_dismissals
    (world_id,player_id,promotion_id,attention_id)
   VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING attention_id
  `,[worldId,playerId,promotionId,mailId]);
  return {readCount:added.length};
 });
}
