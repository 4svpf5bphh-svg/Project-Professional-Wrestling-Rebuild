import test from "node:test";
import assert from "node:assert/strict";
import { postgresPool } from "../src/db/postgres.js";
import { withWorldTransaction, type TransactionPool } from "../src/db/transaction.js";
import { importOriginalGenesis } from "../src/db/import-original-genesis.js";
import { originalGenesisFixture } from "./fixtures/original-genesis.js";
import { lockWorldWeek } from "../src/db/world-lock.js";
import { driveWorldResolution } from "../src/db/world-resolution-pipeline.js";
import { readIndustryWorldHub } from "../src/db/industry-world-hub.js";
import { readIndustryWorldNews } from "../src/db/industry-news.js";
import { readPublicCompletedShow } from "../src/db/public-completed-show.js";

const url = process.env.PPW_NEON_TEST_URL;
const weeks = Number(process.env.PPW_CREATIVE_WEEKS ?? 13);
const seed = Number(process.env.PPW_CREATIVE_SEED ?? 31);
const baseline = process.env.PPW_CREATIVE_BASELINE === "1";

test("AI programmes develop and settle through the real World pipeline", {
 skip: !url ? "Disposable PostgreSQL required" : false, timeout: 1200000,
}, async t => {
 const worldId = "test-ai-creative-" + seed + "-" + weeks;
 const playerId = worldId + "-viewer";
 const db = postgresPool(url!, 4);
 const fixture = originalGenesisFixture(worldId);
 fixture.world.seed = seed;
 // Different existing booking philosophies and different financial pressure.
 const profiles = [
  [33, 94, 55], [92, 64, 56], [51, 61, 94], [41, 54, 47],
  [31, 84, 58], [48, 47, 46], [36, 67, 45], [74, 58, 71],
 ] as const;
 for (const [i, promotion] of fixture.promotions.entries()) {
  const [riskTolerance, matchQualityPreference, starPreference] = profiles[i]!;
  Object.assign(promotion, {
   name: i === 0 ? "WWE" : i === 1 ? "AEW" : "Territory " + i + " Wrestling",
   cash: i === 7 ? 2_900_000 : 5_800_000 + i * 75_000,
   aiProfile: { financialCaution: i >= 6 ? 84 : 60, riskTolerance, matchQualityPreference, starPreference },
  });
 }
 for (const [i, wrestler] of fixture.people.entries()) {
  wrestler.careerStage = (["PROSPECT", "PRIME", "VETERAN", "SPECIAL_ATTRACTION"] as const)[Math.floor(i / 8) % 4]!;
 }
 const totals = { statements: 0, writeStatements: 0, rows: 0, inputBytes: 0, outputBytes: 0, providerCalls: 0 };
 const samples: { week: number; statements: number; writeStatements: number; rows: number; inputBytes: number; outputBytes: number }[] = [];
 const measuringPool: TransactionPool = {
  async connect() {
   const conn = await db.pool.connect();
   return {
    release: () => conn.release(),
    async query<T extends Record<string, unknown>>(sql: string, params: readonly unknown[]) {
     const rows = await conn.query<T>(sql, params);
     totals.statements++;
     if (/\b(?:INSERT INTO|UPDATE \w+\s+SET|DELETE FROM)\b/i.test(sql)) totals.writeStatements++;
     totals.rows += rows.length;
     totals.inputBytes += Buffer.byteLength(JSON.stringify(params));
     totals.outputBytes += Buffer.byteLength(JSON.stringify(rows));
     return rows;
    },
   };
  },
 };
 const q = <T extends Record<string, unknown>>(sql: string, params: readonly unknown[] = [worldId]) =>
  withWorldTransaction(db.pool, tx => tx.query<T>(sql, params));
 const blockedFetch = t.mock.method(globalThis, "fetch", () => {
  totals.providerCalls++;
  throw new Error("Local creative simulations may not call external AI services");
 });
 try {
  await importOriginalGenesis(db.pool, fixture);
  await q("UPDATE ppw_worlds SET injury_rate_multiplier=$2 WHERE world_id=$1", [worldId, seed === 31 ? 1.4 : 2]);
  // The fixture exercises real injuries without relying on the base's
  // overlapping same-week medical handling. Capacity one is a supported
  // roster policy and makes two broadcasts draw on different performers.
  await q("UPDATE ppw_people SET weekly_service_capacity=1 WHERE world_id=$1");
  await q(`
   INSERT INTO ppw_tag_teams(world_id,team_id,name,status) VALUES($1,'audit-team','The Night Shift','ACTIVE')
  `);
  await q(`
   INSERT INTO ppw_tag_team_members(world_id,team_id,person_id) VALUES
   ($1,'audit-team','person-1'),($1,'audit-team','person-17')
  `);
  await q(`
   INSERT INTO ppw_stables(world_id,promotion_id,stable_id,name,status,formed_week_index)
   VALUES($1,'promotion-3','audit-faction','The Syndicate','ACTIVE',0)
  `);
  await q(`
   INSERT INTO ppw_stable_memberships(world_id,promotion_id,stable_id,membership_id,person_id,joined_week_index)
   VALUES ($1,'promotion-3','audit-faction','audit-1','person-3',0),
    ($1,'promotion-3','audit-faction','audit-2','person-11',0),
    ($1,'promotion-3','audit-faction','audit-3','person-19',0)
  `);
  for (let index = 0; index < weeks; index++) {
   const year = Math.floor(index / 52) + 1, week = index % 52 + 1;
   const clock = await q<{ revision: number | string }>(`
    UPDATE ppw_worlds SET next_lock_at=clock_timestamp()-interval '1 second'
    WHERE world_id=$1 AND (year,week)=($2,$3) AND phase='OPEN' RETURNING revision
   `, [worldId, year, week]);
   assert.equal(clock.length, 1);
   // New arrivals inherit the comparison fixture's single-service policy.
   if (index >= 52) await q("UPDATE ppw_people SET weekly_service_capacity=1 WHERE world_id=$1 AND weekly_service_capacity IS DISTINCT FROM 1");
   const before = { ...totals };
   assert.equal((await lockWorldWeek(measuringPool, {
    worldId, requestId: "creative-lock-" + index, expectedRevision: Number(clock[0]!.revision),
   })).status, "APPLIED");
   const run = await driveWorldResolution(measuringPool, {
    worldId, resolutionId: "creative-audit", maxStages: 16, manualRecovery: true,
   }).catch((error: unknown) => {
    throw new Error("Creative audit failed in World week " + (index + 1), { cause: error });
   });
   assert.equal(run.status, "PUBLISHED", "Week " + (index + 1) + " " + JSON.stringify(run));
   samples.push({ week: index + 1, statements: totals.statements - before.statements,
    writeStatements: totals.writeStatements - before.writeStatements, rows: totals.rows - before.rows,
    inputBytes: totals.inputBytes - before.inputBytes, outputBytes: totals.outputBytes - before.outputBytes });
   if (index === 0 || index + 1 === weeks) {
    const tried = await driveWorldResolution(db.pool, {
     worldId, resolutionId: "creative-audit", maxStages: 2, manualRecovery: true,
    });
    assert.equal(tried.status, "BLOCKED", "A published week may not settle twice");
   }
  }
  const counts = (await q(`
   SELECT
    (SELECT count(*)::int FROM ppw_programmes p WHERE p.world_id=$1) initiated,
    (SELECT count(*)::int FROM ppw_programmes p WHERE p.world_id=$1 AND p.status='ACTIVE') active,
    (SELECT count(*)::int FROM ppw_programmes p WHERE p.world_id=$1 AND p.status='COMPLETED') completed,
    (SELECT count(*)::int FROM ppw_programmes p WHERE p.world_id=$1 AND p.status='INACTIVE') abandoned,
    (SELECT count(*)::int FROM ppw_programmes p WHERE p.world_id=$1 AND p.championship_id IS NOT NULL) title_programmes,
    (SELECT count(*)::int FROM ppw_programme_resolved_activities a WHERE a.world_id=$1 AND a.kind='SEGMENT') angles,
    (SELECT count(*)::int FROM ppw_programme_resolved_activities a WHERE a.world_id=$1 AND a.kind='MATCH') linked_matches,
    (SELECT count(*)::int FROM ppw_programme_finales f JOIN ppw_booking_drafts d
      ON (d.world_id,d.draft_id)=(f.world_id,f.show_id)
      WHERE f.world_id=$1 AND f.resolved_week_index IS NOT NULL AND d.booking_class='PREMIUM') premium_payoffs,
    (SELECT count(*)::int FROM ppw_programme_finales f
      WHERE f.world_id=$1 AND f.resolved_week_index IS NOT NULL AND f.payoff='TITLE_SHOWDOWN') title_payoffs,
    (SELECT count(*)::int FROM ppw_card_slots WHERE world_id=$1 AND payload ? 'supportingProgrammeId') supporting_matches,
    (SELECT count(*)::int FROM ppw_completed_shows WHERE world_id=$1) shows,
    (SELECT count(*)::int FROM ppw_completed_show_matches WHERE world_id=$1) matches,
    (SELECT count(*)::int FROM ppw_booking_drafts WHERE world_id=$1 AND booking_class='PREMIUM') premiums,
    (SELECT count(*)::int FROM ppw_medical_absences WHERE world_id=$1) medical_records,
    (SELECT count(*)::int FROM ppw_ledger_events WHERE world_id=$1 AND event_type='WORLD_WEEK_COMPLETED') published,
    (SELECT count(*)::int FROM ppw_world_news_items WHERE world_id=$1 AND story_key LIKE 'programme:official:%') official_items,
    (SELECT count(*)::int FROM ppw_world_news_items WHERE world_id=$1 AND story_key LIKE 'programme:dirt:%') dirt_items,
    (SELECT count(*)::int FROM ppw_championship_contests WHERE world_id=$1 AND title_changed) title_changes
  `))[0]!;
  const formats = await q(`
   SELECT programme_format AS format,creative_intent->>'blueprintId' AS blueprint,count(*)::int AS programmes
    FROM ppw_programmes WHERE world_id=$1 GROUP BY 1,2 ORDER BY 1,2
  `);
  const philosophies = await q(`
   SELECT d.promotion_id,slot.payload->>'intent' AS intent,count(*)::int AS matches
   FROM ppw_booking_drafts d JOIN ppw_card_slots slot ON (slot.world_id,slot.draft_id)=(d.world_id,d.draft_id)
   WHERE d.world_id=$1 AND slot.kind='MATCH' AND d.promotion_id IN ('promotion-0','promotion-1','promotion-6')
   GROUP BY 1,2 ORDER BY 1,2
  `);
  const stoppages = await q(`
   SELECT event_type,payload->>'reason' AS reason,count(*)::int AS total FROM ppw_ledger_events
   WHERE world_id=$1 AND event_type='AI_PROGRAMME_ABANDONED' GROUP BY 1,2 ORDER BY 2
  `);
  const rematches = (await q(`
   WITH heads AS (
    SELECT d.promotion_id,d.year,d.week,d.show_day,d.draft_id,m.actual_finish,
     slot.payload->>'programmeId' programme_id,
     ARRAY(SELECT x->>'personId' FROM jsonb_array_elements(slot.payload->'participants') x ORDER BY 1) AS cast_ids
    FROM ppw_booking_drafts d JOIN ppw_card_slots slot ON (slot.world_id,slot.draft_id)=(d.world_id,d.draft_id)
    JOIN ppw_completed_show_matches m ON (m.world_id,m.show_id,m.match_id)=(slot.world_id,slot.draft_id,slot.slot_id)
    WHERE d.world_id=$1 AND slot.payload->>'mainEvent'='true'
   ), turns AS (
    SELECT *,lag(cast_ids) OVER history previous_cast,lag(actual_finish) OVER history previous_finish,
     lag(programme_id) OVER history previous_programme FROM heads
    WINDOW history AS (PARTITION BY promotion_id ORDER BY year,week,show_day,draft_id)
   )
   SELECT count(previous_cast)::int opportunities,count(*) FILTER(WHERE cast_ids=previous_cast)::int repeated,
    count(*) FILTER(WHERE cast_ids=previous_cast AND programme_id=previous_programme
     AND previous_finish IN ('PROTECTED_FINISH','INJURY_STOPPAGE','DISQUALIFICATION'))::int justified
   FROM turns
  `))[0]!;
  const examples = await q(`
   SELECT DISTINCT ON (p.creative_intent->>'blueprintId') p.creative_intent->>'blueprintId' AS blueprint,
    company.name AS promotion,d.show_name,d.booking_class,f.payoff,f.resolved_crowd_response AS crowd,
    f.resolved_winner_side AS winner, names.cast_names,actual.actual_finish,
    p.segment_count,p.match_count,
    (SELECT string_agg(coalesce(s.payload#>>'{scene,purpose}',m.actual_finish), ' → '
      ORDER BY a.week_index,a.show_id,a.slot_id)
     FROM ppw_programme_resolved_activities a JOIN ppw_card_slots s
      ON (s.world_id,s.draft_id,s.slot_id)=(a.world_id,a.show_id,a.slot_id)
     LEFT JOIN ppw_completed_show_matches m ON (m.world_id,m.show_id,m.match_id)=(a.world_id,a.show_id,a.slot_id)
     WHERE (a.world_id,a.promotion_id,a.programme_id)=(p.world_id,p.promotion_id,p.programme_id)) chapters
   FROM ppw_programmes p JOIN ppw_programme_finales f USING(world_id,promotion_id,programme_id)
   JOIN ppw_promotions company USING(world_id,promotion_id)
   JOIN ppw_booking_drafts d ON (d.world_id,d.draft_id)=(f.world_id,f.show_id)
   LEFT JOIN ppw_completed_show_matches actual ON (actual.world_id,actual.show_id,actual.match_id)=(f.world_id,f.show_id,f.slot_id)
   JOIN LATERAL (SELECT array_agg(w.name ORDER BY r.side,r.position) cast_names
    FROM ppw_programme_side_refs r JOIN ppw_people w ON (w.world_id,w.person_id)=(r.world_id,r.ref_id)
    WHERE (r.world_id,r.promotion_id,r.programme_id)=(p.world_id,p.promotion_id,p.programme_id)) names ON true
   WHERE p.world_id=$1 AND f.resolved_week_index IS NOT NULL
   ORDER BY 1,(d.booking_class='PREMIUM') DESC,f.resolved_crowd_response DESC,p.programme_id
  `);
  console.log("AI creative audit " + JSON.stringify({ seed, weeks, counts, formats, rematches, stoppages,
   philosophies, examples, totals, typicalWeek: samples[Math.floor(samples.length / 2)], lastWeek: samples.at(-1) }));
  assert.equal(blockedFetch.mock.callCount(), 0);
  assert.equal(counts.published, weeks);
  if (baseline) {
   assert.equal(counts.initiated, 0);
   return;
  }
  assert.ok(Number(counts.initiated) >= 8);
  assert.ok(Number(counts.completed) >= 4);
  assert.ok(Number(counts.angles) >= 12);
  assert.ok(Number(counts.premium_payoffs) >= 1);
  assert.ok(Number(counts.official_items) >= 10);
  assert.ok(formats.some(x => x.format === "RIVALRY") && formats.some(x => x.format !== "RIVALRY"));
  if (weeks >= 52) {
   assert.ok(Number(counts.title_payoffs) >= 1);
   assert.ok(Number(counts.supporting_matches) >= 1);
  }
  const consistency = (await q(`
   SELECT
    (SELECT count(*)::int FROM ppw_programmes p WHERE p.world_id=$1 AND p.status='COMPLETED'
      AND NOT EXISTS (SELECT 1 FROM ppw_programme_finales f
       WHERE (f.world_id,f.promotion_id,f.programme_id)=(p.world_id,p.promotion_id,p.programme_id)
        AND f.resolved_week_index=p.ended_week_index)) phantom_payoffs,
    (SELECT count(*)::int FROM ppw_programme_finales f WHERE world_id=$1 AND resolved_week_index IS NOT NULL) delivered,
    (SELECT count(*)::int FROM ppw_ledger_events WHERE world_id=$1
      AND event_type='PROGRAMME_FINALE_DELIVERED') finale_events,
    (SELECT count(*)::int FROM ppw_programmes p WHERE p.world_id=$1 AND p.activity_count<>(
      SELECT count(*) FROM ppw_programme_resolved_activities a
      WHERE (a.world_id,a.promotion_id,a.programme_id)=(p.world_id,p.promotion_id,p.programme_id))) duplicate_counts
   `))[0];
  assert.deepEqual(consistency, { phantom_payoffs: 0, delivered: counts.completed,
   finale_events: counts.completed, duplicate_counts: 0 });
  await q("INSERT INTO ppw_players(player_id) VALUES($1)", [playerId]);
  await q("INSERT INTO ppw_memberships(world_id,player_id,status) VALUES($1,$2,'ACTIVE')", [worldId, playerId]);
  await q("INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id) VALUES($1,$2,'promotion-7')", [worldId, playerId]);
  const viewer = { worldId, playerId, promotionId: "promotion-7" };
  const read = await readIndustryWorldNews(db.pool, viewer);
  const story = read.stories.find(s => s.id.startsWith("programme:official:") && s.promotionId !== viewer.promotionId);
  assert.ok(story, "A manager can read certified AI chapters in Official News");
  const args = { worldId, playerId, viewerPromotionId: viewer.promotionId,
   targetPromotionId: story.promotionId, showId: story.showId };
  const publicShow = await readPublicCompletedShow(db.pool, args);
  assert.ok(publicShow.entries.some(e => (e as { programme?: string }).programme), "Certified programme context is visible in rival results");
  await assert.rejects(readPublicCompletedShow(db.pool, { ...args, playerId: playerId + "-other" }), /unavailable/);
  await assert.rejects(readPublicCompletedShow(db.pool, { ...args, showId: "future-card" }), /unavailable/);
  const industry = await readIndustryWorldHub(db.pool, viewer);
  assert.ok(industry.broadcasts.some(s => (s as { publicResults?: boolean }).publicResults));
 } finally {
  await withWorldTransaction(db.pool, async tx => {
   const relations = await tx.query<{name: string; parent: string | null}>(`
    SELECT child.relname AS name,parent.relname AS parent
    FROM pg_class child JOIN pg_namespace ns ON ns.oid=child.relnamespace
    JOIN pg_attribute a ON a.attrelid=child.oid AND a.attname='world_id' AND NOT a.attisdropped
    LEFT JOIN pg_constraint con ON con.conrelid=child.oid AND con.contype='f'
    LEFT JOIN pg_class parent ON parent.oid=con.confrelid
    WHERE ns.nspname=current_schema() AND child.relkind='r' AND child.relname LIKE 'ppw_%'
   `, []);
   const dependencies = new Map<string, Set<string>>();
   for (const relation of relations) {
    const parents = dependencies.get(relation.name) ?? new Set<string>();
    if (relation.parent && relation.name !== relation.parent) parents.add(relation.parent);
    dependencies.set(relation.name, parents);
   }
   const completed = new Set<string>(), order: string[] = [];
   function visit(name: string) {
    if (completed.has(name)) return;
    completed.add(name);
    for (const parent of dependencies.get(name) ?? []) if (dependencies.has(parent)) visit(parent);
    order.push(name);
   }
   for (const name of dependencies.keys()) visit(name);
   for (const name of order.reverse()) await tx.query("DELETE FROM " + name + " WHERE world_id=$1", [worldId]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=$1", [playerId]);
  }).finally(() => db.close());
 }
});
