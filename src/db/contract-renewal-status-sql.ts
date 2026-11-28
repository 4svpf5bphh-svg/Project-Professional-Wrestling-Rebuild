/** A usable next term can be an accepted proposal or a separately signed
 * agreement. Use the same service windows as the booking desk. */
export function agreedNextTermSql(contract:string){
 return `SELECT next_term.start_week_index FROM ppw_signed_service_windows next_term
  WHERE next_term.world_id=${contract}.world_id
   AND next_term.promotion_id=${contract}.promotion_id
   AND next_term.person_id=${contract}.person_id
   AND next_term.contract_id<>${contract}.contract_id
   AND next_term.expires_week_index>${contract}.expires_week_index
   AND next_term.start_week_index<=${contract}.expires_week_index+1
   AND next_term.family<>'ONE_OFF'
   AND (next_term.family='EXCLUSIVE' OR next_term.remaining_dates>0)
  ORDER BY next_term.start_week_index LIMIT 1`;
}
