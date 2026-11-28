/** World settlement moves the clock before the editorial stage publishes the
 * edition. Hide its shows until publication, while keeping older shows open.
 */
export function publishedShowSql(show:string,world:string){
 return `( (${show}.year,${show}.week)<(${world}.year,${world}.week)
  OR ((${show}.year,${show}.week)=(${world}.year,${world}.week) AND ${world}.phase='OPEN') )
 AND (${world}.phase<>'UPDATING' OR NOT EXISTS (
  SELECT 1 FROM ppw_world_update_runs unpublished
  WHERE unpublished.world_id=${show}.world_id AND unpublished.year=${show}.year
   AND unpublished.week=${show}.week AND unpublished.state='ACTIVE'
 ))`;
}
