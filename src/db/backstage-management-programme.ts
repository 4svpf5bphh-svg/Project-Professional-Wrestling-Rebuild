/** Select the current owned Programme and its recent certified chapter for one wrestler.
 * Arguments are trusted SQL expressions from the two authorized projections. */
export const managementProgrammeSql=(world:string,promotion:string,person:string,week:string)=>`
 SELECT programme.programme_id,programme.championship_id,
      (SELECT a.week_index FROM ppw_programme_resolved_activities a
       WHERE a.world_id=${world} AND a.promotion_id=${promotion} AND a.programme_id=programme.programme_id
        AND a.week_index BETWEEN greatest(0,${week}-12) AND ${week}-1
       ORDER BY a.week_index DESC,a.show_id DESC,a.slot_id DESC LIMIT 1) AS chapter
     FROM ppw_programme_participants cast_member
     JOIN ppw_programmes programme USING(world_id,promotion_id,programme_id)
     WHERE cast_member.world_id=${world} AND cast_member.promotion_id=${promotion}
      AND cast_member.person_id=${person} AND programme.status='ACTIVE'
     ORDER BY chapter DESC NULLS LAST,programme.heat DESC NULLS LAST,programme.programme_id LIMIT 1
`;
