import { publicStoryBlueprintName } from "../domain/story-blueprints.js";
import type { SqlRows } from "./world-operations.js";
import type { WorldNewsStory } from "./world-news.js";

type PublicChapter = {
 promotion_id: string; promotion_name: string; programme_id: string; show_id: string;
 show_name: string; booking_class: string; kind: "MATCH" | "SEGMENT";
 week_index: number; started_week_index: number; payoff: string | null;
 crowd_response: number; actual_finish: string | null; winner_side: "A" | "B" | null;
 blueprint_id: string; title_name: string | null; side_a: string[]; side_b: string[];
 purpose: string | null; on_air: string[];
};

export async function readCertifiedAiProgrammeNews(tx: SqlRows, worldId: string, year: number, week: number) {
 const rows = await tx.query<PublicChapter>(`
  WITH chapters AS (
   SELECT DISTINCT ON (p.promotion_id)
    p.promotion_id,p.programme_id,p.started_week_index,p.championship_id,
    p.creative_intent->>'blueprintId' blueprint_id,
    a.show_id,a.slot_id,a.kind,a.week_index,a.crowd_response,a.winner_side,
    f.payoff,d.booking_class,coalesce(d.show_name,
     CASE WHEN d.booking_class='PREMIUM' THEN 'the premium event' ELSE 'television' END) show_name
   FROM ppw_completed_shows s
   JOIN ppw_booking_drafts d ON (d.world_id,d.draft_id)=(s.world_id,s.show_id)
    AND d.booking_origin='AI'
   JOIN ppw_programme_match_activities l ON (l.world_id,l.draft_id)=(s.world_id,s.show_id)
   JOIN ppw_programme_resolved_activities a ON (a.world_id,a.promotion_id,a.programme_id,a.show_id,a.slot_id)=
    (l.world_id,l.promotion_id,l.programme_id,l.draft_id,l.slot_id)
   JOIN ppw_programmes p ON (p.world_id,p.promotion_id,p.programme_id)=
    (a.world_id,a.promotion_id,a.programme_id) AND p.ai_authored
   LEFT JOIN ppw_programme_finales f ON (f.world_id,f.promotion_id,f.programme_id,f.show_id,f.slot_id)=
    (a.world_id,a.promotion_id,a.programme_id,a.show_id,a.slot_id) AND f.resolved_week_index=a.week_index
   WHERE s.world_id=$1 AND s.year=$2 AND s.week=$3
   ORDER BY p.promotion_id,(f.payoff IS NOT NULL) DESC,a.crowd_response DESC,a.show_id,a.slot_id
  )
  SELECT c.*,company.name promotion_name,t.name title_name,m.actual_finish,
   slot.payload#>>'{scene,purpose}' AS purpose,names.side_a,names.side_b,
   coalesce(roles.on_air,ARRAY[]::text[]) AS on_air
  FROM chapters c
  JOIN ppw_promotions company ON company.world_id=$1 AND company.promotion_id=c.promotion_id
  LEFT JOIN ppw_championships t ON (t.world_id,t.promotion_id,t.championship_id)=
   ($1,c.promotion_id,c.championship_id)
  LEFT JOIN ppw_completed_show_matches m ON (m.world_id,m.show_id,m.match_id)=($1,c.show_id,c.slot_id)
  JOIN ppw_card_slots slot ON (slot.world_id,slot.draft_id,slot.slot_id)=($1,c.show_id,c.slot_id)
  LEFT JOIN LATERAL (
   SELECT array_agg(person.name ORDER BY role.ordinality) on_air
   FROM jsonb_array_elements_text(coalesce(slot.payload->'actorIds','[]'::jsonb) ||
    coalesce(slot.payload->'targetIds','[]'::jsonb)) WITH ORDINALITY role(id,ordinality)
   JOIN ppw_people person ON person.world_id=$1 AND person.person_id=role.id
  ) roles ON c.kind='SEGMENT'
  JOIN LATERAL (
   SELECT array_agg(person.name ORDER BY ref.position) FILTER(WHERE ref.side='A') side_a,
    coalesce(array_agg(person.name ORDER BY ref.position) FILTER(WHERE ref.side='B'),ARRAY[]::text[]) side_b
   FROM ppw_programme_side_refs ref
   JOIN ppw_people person ON person.world_id=ref.world_id AND person.person_id=ref.ref_id
   WHERE (ref.world_id,ref.promotion_id,ref.programme_id)=($1,c.promotion_id,c.programme_id)
  ) names ON true
  ORDER BY (c.payoff IS NOT NULL) DESC,(c.booking_class='PREMIUM') DESC,c.crowd_response DESC,c.promotion_id
  LIMIT 6
 `, [worldId, year, week]);
 const official = rows.map(composeChapter);
 const talk = rows.find(chapter => chapter.actual_finish === "PROTECTED_FINISH" ||
  chapter.purpose === "TEASE_BETRAYAL" || !chapter.payoff && chapter.crowd_response < 43);
 const dirt: WorldNewsStory[] = talk ? [{
  ...composeChapter(talk), key: "programme:dirt:" + talk.programme_id,
  desk: "DIRT", certainty: "SPECULATION",
  title: (talk.actual_finish === "PROTECTED_FINISH" ? "Unfinished business at " :
   talk.purpose === "TEASE_BETRAYAL" ? "How solid is the partnership at " :
   "Can the crowd be won over at ") + talk.promotion_name + "?",
  summary: talk.actual_finish === "PROTECTED_FINISH" ?
   "The first encounter ended without a clean decision. The sheets are asking how long the two sides can be kept apart." :
   talk.purpose === "TEASE_BETRAYAL" ?
    "After the interview aired, the sheets picked up on the friction between the partners. Whether it costs them in the ring is open to speculation." :
    "This week's chapter drew a muted response. The sheets are speculating about whether the programme needs a change of direction.",
 }] : [];
 return [...official, ...dirt];
}

function composeChapter(c: PublicChapter): WorldNewsStory {
 const first = c.side_a[0] ?? c.promotion_name;
 const opponent = c.side_b.join(" & ") || c.side_a.slice(1).join(" & ");
 const firstSide = c.side_a.join(" & ") || first;
 const cast = c.side_b.length ? firstSide + " against " + opponent : opponent ? first + " and " + opponent : first;
 const format = publicStoryBlueprintName(c.blueprint_id) ?? "Featured programme";
 const event = c.show_name;
 const result = c.winner_side === "A" ? firstSide : c.winner_side === "B" ? c.side_b.join(" & ") : null;
 let headline: string, summary: string;
 if (c.payoff === "TITLE_SHOWDOWN") {
  headline = cast + " settle the " + (c.title_name ?? "championship") + " chase";
  summary = "The title pursuit reached its showdown at " + event + ". " +
   (result ? result + " won the deciding match." : "The deciding match closed the pursuit.");
 } else if (c.payoff) {
  headline = c.payoff === "BETRAYAL" ? first + " turns on " + opponent : cast + " close " + format;
  summary = c.payoff === "BETRAYAL" ? "The partnership broke down in an on-air attack at " + event + "." :
   format + " reached its final chapter at " + event + "." + (result ? " " + result + " won the deciding match." : "");
 } else if (c.actual_finish === "INJURY_STOPPAGE") {
  headline = cast + " cut short by a referee stoppage";
  summary = "The referee ended the match on " + event + ". The result left the programme without its planned decisive finish.";
 } else if (c.actual_finish === "PROTECTED_FINISH") {
  headline = cast + " leave business unfinished";
  summary = "Their match on " + event + " ended without a clean decision.";
 } else if (c.purpose === "TARGET_CHAMPIONSHIP") {
  headline = first + " sets sights on " + (c.title_name ?? "the championship");
  summary = "On " + event + ", " + first + (opponent && c.week_index>c.started_week_index ? " challenged " + opponent + " for a title opportunity." :
   " made the title pursuit public.");
 } else if (c.purpose === "BUILD_ANTICIPATION") {
  headline = c.promotion_name + " puts the spotlight on " + c.on_air.join(" and ");
  summary = "A broadcast video revisited the stakes of " + format + " and built anticipation for the next encounter.";
 } else if (c.week_index === c.started_week_index) {
  headline = (c.on_air[0] ?? first) +
   (c.on_air.length > 1 ? " and " + c.on_air.slice(1).join(" and ") + " open " : " opens ") + format;
  summary = "An opening scene on " + event + " gave the promotion's audience its first look at the story.";
 } else if (c.kind === "MATCH") {
  headline = first + (c.winner_side === "A" ? " passes the in-ring test" : " hits resistance in the ring");
  summary = "A match on " + event + " moved " + format + " forward.";
 } else {
  headline = c.on_air.length > 1 ? c.on_air.join(" and ") + " raise the stakes" :
   (c.on_air[0] ?? first) + " raises the stakes";
  summary = "The latest scene on " + event + " advanced " + format + ".";
 }
 return { key: "programme:official:" + c.programme_id, desk: "OFFICIAL", certainty: "CONFIRMED",
  promotionId: c.promotion_id, promotionName: c.promotion_name, showId: c.show_id,
  title: headline.slice(0, 240), summary: summary.slice(0, 600),
  sourceKind: c.kind === "MATCH" ? "MATCH" : "ANGLE" };
}
