import { aiProgrammeKey, type AiProgramme } from "../domain/ai-programmes.js";
import { parseProgrammeCreativeIntent } from "../domain/programme-creative-intent.js";
import type { ProgrammeFormat } from "../domain/programme-lifecycle.js";
import type { ProgrammePayoff } from "../domain/programme-finales.js";
import type { SqlRows } from "./world-operations.js";

type ProgrammeRow = {
 promotion_id: string; programme_id: string; programme_format: ProgrammeFormat;
 championship_id: string | null; creative_intent: unknown; programme_key: string | null;
 status: string; started_week_index: number; segment_count: number; match_count: number;
 side_a: string[]; side_b: string[]; last_week: number | null; last_crowd: number | null;
 last_finish: string | null; last_winner_side: string | null; ended_week_index: number | null;
};

export async function readAiProgrammes(tx: SqlRows, worldId: string, promotionIds: string[], week: number) {
 const rows = await tx.query<ProgrammeRow>(`
  WITH featured AS (
   SELECT p.world_id,p.promotion_id,p.programme_id,p.programme_format,p.championship_id,
    p.creative_intent,p.programme_key,p.status,p.started_week_index,p.segment_count,p.match_count,p.ended_week_index FROM ppw_programmes p
   WHERE p.world_id=$1 AND p.promotion_id=ANY($2::text[]) AND p.ai_authored AND p.status='ACTIVE'
   UNION ALL
   SELECT recent.* FROM unnest($2::text[]) company(promotion_id)
   CROSS JOIN LATERAL (
    SELECT p.world_id,p.promotion_id,p.programme_id,p.programme_format,p.championship_id,
    p.creative_intent,p.programme_key,p.status,p.started_week_index,p.segment_count,p.match_count,p.ended_week_index FROM ppw_programmes p
    WHERE p.world_id=$1 AND p.promotion_id=company.promotion_id AND p.ai_authored
     AND p.ended_week_index >= $3 - 18
    ORDER BY p.ended_week_index DESC,p.programme_id LIMIT 4
   ) recent
  )
  SELECT p.promotion_id,p.programme_id,p.programme_format,p.championship_id,p.creative_intent,
   p.programme_key,p.status,p.started_week_index,p.segment_count,p.match_count,p.ended_week_index,
   coalesce(lineup.side_a,ARRAY[]::text[]) side_a,coalesce(lineup.side_b,ARRAY[]::text[]) side_b,
   chapter.week_index last_week,chapter.crowd_response last_crowd,
   last_match.actual_finish last_finish,last_match.winner_side last_winner_side
  FROM featured p
  JOIN LATERAL (
   SELECT array_agg(ref_id ORDER BY position) FILTER(WHERE side='A') side_a,
    array_agg(ref_id ORDER BY position) FILTER(WHERE side='B') side_b
   FROM ppw_programme_side_refs r
   WHERE (r.world_id,r.promotion_id,r.programme_id)=(p.world_id,p.promotion_id,p.programme_id)
  ) lineup ON true
  LEFT JOIN LATERAL (
   SELECT a.week_index,a.crowd_response FROM ppw_programme_resolved_activities a
   WHERE p.status='ACTIVE' AND (a.world_id,a.promotion_id,a.programme_id)=
    (p.world_id,p.promotion_id,p.programme_id) AND a.week_index >= $3 - 22
   ORDER BY a.week_index DESC,a.show_id DESC,a.slot_id DESC LIMIT 1
  ) chapter ON true
  LEFT JOIN LATERAL (
   SELECT m.actual_finish,a.winner_side FROM ppw_programme_resolved_activities a
   JOIN ppw_completed_show_matches m ON (m.world_id,m.show_id,m.match_id)=(a.world_id,a.show_id,a.slot_id)
   WHERE p.status='ACTIVE' AND (a.world_id,a.promotion_id,a.programme_id)=
    (p.world_id,p.promotion_id,p.programme_id) AND a.week_index >= $3 - 22
   ORDER BY a.week_index DESC,a.show_id DESC,a.slot_id DESC LIMIT 1
  ) last_match ON true
  `, [worldId, promotionIds, week]);
 const active = new Map<string, AiProgramme>();
 const history = new Map<string, { blueprintId: string; people: string[]; programmeKey: string | null; ended: number }[]>();
 for (const row of rows) {
  const intent = parseProgrammeCreativeIntent(row.creative_intent);
  if (!intent) continue;
  if (row.status === "ACTIVE") {
   active.set(row.promotion_id, {
    programmeId: row.programme_id, format: row.programme_format, intent,
    sideA: row.side_a, sideB: row.side_b, championshipId: row.championship_id,
    started: row.started_week_index, angleCount: row.segment_count, matchCount: row.match_count,
    lastWeek: row.last_week, lastCrowd: row.last_crowd, lastFinish: row.last_finish,
    lastWinnerSide: row.last_winner_side,
   });
  } else if (row.ended_week_index !== null) {
   const companyHistory = history.get(row.promotion_id) ?? [];
   companyHistory.push({ blueprintId: intent.blueprintId, people: [...row.side_a, ...row.side_b],
    programmeKey: row.programme_key, ended: row.ended_week_index });
   history.set(row.promotion_id, companyHistory);
  }
 }
 return { active, history };
}

export async function readAiFactionCasts(tx: SqlRows, worldId: string, promotionIds: string[]) {
 const rows = await tx.query<{promotion_id: string; members: string[]}>(`
  SELECT s.promotion_id,array_agg(m.person_id ORDER BY m.joined_week_index,m.person_id) AS members
  FROM ppw_stables s JOIN ppw_stable_memberships m
   ON (s.world_id,s.promotion_id,s.stable_id)=(m.world_id,m.promotion_id,m.stable_id)
  WHERE s.world_id=$1 AND s.promotion_id=ANY($2::text[]) AND s.status='ACTIVE' AND m.active
  GROUP BY s.promotion_id,s.stable_id HAVING count(*) BETWEEN 3 AND 20
  ORDER BY s.promotion_id,s.stable_id LIMIT 512
  `, [worldId, promotionIds]);
 const factions = new Map<string, string[][]>();
 for (const row of rows) {
  const casts = factions.get(row.promotion_id) ?? [];
  casts.push(row.members);
  factions.set(row.promotion_id, casts);
 }
 return factions;
}

export async function insertAiProgrammes(tx: SqlRows, scope: {
 worldId: string; year: number; week: number; weekIndex: number;
}, starts: { promotionId: string; programme: AiProgramme }[]) {
 if (!starts.length) return;
 const saved = await tx.query<{ count: number }>(`
  WITH planned AS MATERIALIZED (
   SELECT * FROM jsonb_to_recordset($5::jsonb) AS x(
    promotion_id text,programme_id text,championship_id text,programme_key text,
    programme_format text,creative_intent jsonb,participants jsonb)
  ), inserted AS (
   INSERT INTO ppw_programmes(world_id,promotion_id,programme_id,status,heat,repetition,
    started_week_index,championship_id,programme_key,programme_format,creative_intent,ai_authored)
   SELECT $1,s.promotion_id,s.programme_id,'ACTIVE',NULL,0,$4,s.championship_id,s.programme_key,
    s.programme_format,s.creative_intent,true
   FROM planned s JOIN ppw_promotions p ON p.world_id=$1 AND p.promotion_id=s.promotion_id
   WHERE p.lifecycle='ACTIVE' AND p.management_mode='AI'
    AND NOT EXISTS (SELECT 1 FROM ppw_promotion_controls c
     WHERE c.world_id=$1 AND c.promotion_id=s.promotion_id AND c.active)
   RETURNING world_id,promotion_id,programme_id
  ), lineup AS MATERIALIZED (
   SELECT p.world_id,p.promotion_id,p.programme_id,r.side,r.position,r.person_id
   FROM inserted p JOIN planned s USING(promotion_id,programme_id)
   CROSS JOIN LATERAL jsonb_to_recordset(s.participants) AS r(side text,position smallint,person_id text)
  ), refs AS (
   INSERT INTO ppw_programme_side_refs(world_id,promotion_id,programme_id,side,position,ref_kind,ref_id)
   SELECT world_id,promotion_id,programme_id,side,position,'PERSON',person_id FROM lineup
  ), people AS (
   INSERT INTO ppw_programme_participants(world_id,promotion_id,programme_id,person_id,side)
   SELECT world_id,promotion_id,programme_id,person_id,side FROM lineup
  ), baseline AS (
   INSERT INTO ppw_programme_talent_baselines
    (world_id,promotion_id,programme_id,person_id,start_popularity,start_momentum)
   SELECT c.world_id,c.promotion_id,c.programme_id,c.person_id,p.popularity,p.momentum
   FROM lineup c JOIN ppw_people p USING(world_id,person_id)
  ), ledger AS (
   INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)
   SELECT $1,$2,$3,'PROGRAMME_STARTED',jsonb_build_object('promotionId',p.promotion_id,
    'programmeId',p.programme_id,'participants',jsonb_array_length(s.participants),
    'championshipId',s.championship_id,'format',s.programme_format,'origin','AI')
   FROM inserted p JOIN planned s USING(promotion_id,programme_id)
  )
  SELECT count(*)::integer AS count FROM inserted
  `, [scope.worldId, scope.year, scope.week, scope.weekIndex, JSON.stringify(starts.map(({ promotionId, programme: p }) => ({
  promotion_id: promotionId, programme_id: p.programmeId, championship_id: p.championshipId,
  programme_key: aiProgrammeKey(p), programme_format: p.format, creative_intent: p.intent,
  participants: [
   ...p.sideA.map((person_id, position) => ({ person_id, position, side: "A" })),
   ...p.sideB.map((person_id, position) => ({ person_id, position, side: "B" })),
  ],
 })))]);
 if (saved[0]?.count !== starts.length) throw new Error("AI programme authority changed during booking");
}

export async function retireAiProgrammes(tx: SqlRows, scope: {
 worldId: string; year: number; week: number; weekIndex: number;
}, removed: { promotionId: string; programmeId: string; reason: string }[]) {
 if (!removed.length) return;
 await tx.query(`
  WITH ended AS (
   UPDATE ppw_programmes p SET status='INACTIVE',ended_week_index=$4
   FROM jsonb_to_recordset($5::jsonb) AS x(promotion_id text,programme_id text,reason text)
   WHERE p.world_id=$1 AND p.promotion_id=x.promotion_id AND p.programme_id=x.programme_id
    AND p.ai_authored AND p.status='ACTIVE'
    AND EXISTS (SELECT 1 FROM ppw_promotions c WHERE c.world_id=p.world_id
     AND c.promotion_id=p.promotion_id AND c.management_mode='AI')
    AND NOT EXISTS (SELECT 1 FROM ppw_promotion_controls c WHERE c.world_id=p.world_id
     AND c.promotion_id=p.promotion_id AND c.active)
   RETURNING p.world_id,p.promotion_id,p.programme_id,x.reason
  ), drop_plan AS (
   DELETE FROM ppw_programme_finales f USING ended e
   WHERE (f.world_id,f.promotion_id,f.programme_id)=(e.world_id,e.promotion_id,e.programme_id)
    AND f.resolved_week_index IS NULL
  ), archived_baselines AS (
   UPDATE ppw_programme_talent_baselines b SET end_popularity=p.popularity,end_momentum=p.momentum
   FROM ended e JOIN ppw_people p ON p.world_id=e.world_id
   WHERE (b.world_id,b.promotion_id,b.programme_id)=(e.world_id,e.promotion_id,e.programme_id)
    AND b.person_id=p.person_id AND b.end_popularity IS NULL AND b.end_momentum IS NULL
  )
  INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)
   SELECT $1,$2,$3,'AI_PROGRAMME_ABANDONED',
    jsonb_build_object('promotionId',promotion_id,'programmeId',programme_id,'reason',reason)
   FROM ended
  `, [scope.worldId, scope.year, scope.week, scope.weekIndex, JSON.stringify(removed.map(x => ({
  promotion_id: x.promotionId, programme_id: x.programmeId, reason: x.reason,
 })))]);
}

export async function planAiFinales(tx: SqlRows, worldId: string, week: number, rows: {
 promotionId: string; programmeId: string; showId: string; slotId: string; kind: string; payoff: ProgrammePayoff;
}[]) {
 if (!rows.length) return;
 const saved = await tx.query<{ programme_id: string }>(`
  INSERT INTO ppw_programme_finales(world_id,promotion_id,programme_id,show_id,slot_id,kind,payoff,planned_week_index)
  SELECT $1,x.promotion_id,x.programme_id,x.show_id,x.slot_id,x.kind,x.payoff,$2
  FROM jsonb_to_recordset($3::jsonb) AS x(
   promotion_id text,programme_id text,show_id text,slot_id text,kind text,payoff text)
  ON CONFLICT (world_id,promotion_id,programme_id) DO UPDATE SET
   show_id=EXCLUDED.show_id,slot_id=EXCLUDED.slot_id,kind=EXCLUDED.kind,
   payoff=EXCLUDED.payoff,planned_week_index=EXCLUDED.planned_week_index
  WHERE ppw_programme_finales.resolved_week_index IS NULL
  RETURNING programme_id
  `, [worldId, week, JSON.stringify(rows.map(r => ({
  promotion_id: r.promotionId, programme_id: r.programmeId, show_id: r.showId,
  slot_id: r.slotId, kind: r.kind, payoff: r.payoff,
 })))]);
 if (saved.length !== rows.length) throw new Error("AI finale was already settled");
}
