/** Single, tightly bounded indexed-current-reign projection for a wrestler.
 * Never estimates status from popularity, and never fetches historic reigns.
 * Shared by directory and individual dossier within their existing SQL reads.
 */
export const currentWrestlerTitlesJoin=String.raw`
 LEFT JOIN LATERAL (
   SELECT ARRAY(
    SELECT c.name
    FROM ppw_championships c
    JOIN ppw_championship_reigns r
      ON r.world_id=c.world_id AND r.promotion_id=c.promotion_id
     AND r.championship_id=c.championship_id
     AND r.reign_id=c.current_reign_id AND r.status='ACTIVE'
    WHERE c.world_id=p.world_id AND c.status='ACTIVE'
      AND (
       (r.holder_type='PERSON' AND r.person_id=p.person_id)
       OR (r.holder_type='TEAM' AND EXISTS (
        SELECT 1 FROM ppw_tag_team_members tm
        WHERE tm.world_id=r.world_id AND tm.team_id=r.team_id
          AND tm.person_id=p.person_id AND tm.active
       ))
      )
    ORDER BY c.prestige DESC,c.name,c.championship_id LIMIT 6
   ) AS championship_titles
 ) current_titles ON true
`;
export function normaliseCurrentTitles(names:readonly string[]|null|undefined):string[]{
 if(!Array.isArray(names))return [];
 return names.filter(name=>typeof name==="string"&&!!name.trim())
  .slice(0,6);
}
