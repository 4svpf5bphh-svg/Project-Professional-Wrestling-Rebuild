import {agreedNextTermSql} from "./contract-renewal-status-sql.js";

export function staffRenewalDueSql(contract:string,week:string,player:string){
 return `${contract}.status='SIGNED' AND ${contract}.family<>'ONE_OFF'
  AND ${contract}.start_week_index<=${week}
  AND ${contract}.expires_week_index BETWEEN ${week} AND (${week})+3
  AND NOT EXISTS (${agreedNextTermSql(contract)})
  AND NOT EXISTS(SELECT 1 FROM ppw_contract_offers bid
   WHERE bid.world_id=${contract}.world_id AND bid.promotion_id=${contract}.promotion_id
    AND bid.person_id=${contract}.person_id AND bid.status='PENDING')
  AND NOT EXISTS(SELECT 1 FROM ppw_contract_renewal_proposals bid
   WHERE bid.world_id=${contract}.world_id AND bid.contract_id=${contract}.contract_id AND bid.status='PENDING')
  AND NOT EXISTS(SELECT 1 FROM ppw_delegated_contract_renewals task
   WHERE task.world_id=${contract}.world_id AND task.contract_id=${contract}.contract_id
    AND task.owner_player_id=${player} AND task.status='QUEUED')`;
}

export function staffPressureSql(employee:string,week:string,player:string){
 return `SELECT count(*)::integer AS issue_count,
  array_to_string((array_agg(issues.name ORDER BY issues.sort_order,issues.id))[1:2],' and ') AS names,
  md5(string_agg(issues.id,',' ORDER BY issues.id)||':'||
   coalesce((SELECT max(review.settled_week_index)::text FROM ppw_backstage_staff_replies review
    WHERE review.world_id=${employee}.world_id AND review.promotion_id=${employee}.promotion_id
     AND review.employment_id=${employee}.employment_id AND review.player_id=${player}
     AND review.status='KEPT'),'')) AS fingerprint
 FROM (
  SELECT c.contract_id||':'||c.start_week_index AS id,p.name,c.expires_week_index AS sort_order
  FROM ppw_contracts c JOIN ppw_people p USING(world_id,person_id)
  WHERE ${employee}.role='TALENT_MANAGER' AND c.world_id=${employee}.world_id AND c.promotion_id=${employee}.promotion_id
   AND ${staffRenewalDueSql("c",week,player)}
  UNION ALL
  SELECT DISTINCT p.person_id,p.name,0
  FROM ppw_contracts c JOIN ppw_people p USING(world_id,person_id)
  WHERE ${employee}.role='MEDICAL' AND c.world_id=${employee}.world_id AND c.promotion_id=${employee}.promotion_id
   AND c.status='SIGNED' AND ${week} BETWEEN c.start_week_index AND c.expires_week_index
   AND p.status IN ('ACTIVE','INJURED') AND p.fatigue>=70
 ) issues HAVING count(*)>0`;
}

export const staffPressureEvidenceSql=(employee:string,pressure:string)=>
 `'staff:'||${employee}.employment_id||':'||${employee}.role||':'||${pressure}.fingerprint`;
