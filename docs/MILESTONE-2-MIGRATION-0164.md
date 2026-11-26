# Production procedure for PPW migration 0164

Run during an owner-approved idle window before releasing the Milestone 2 application. Use the direct Neon connection and select the production branch explicitly in the operator console. Keep the connection string in the operator's local secret store. Record the current branch, application revision and recoverable timestamp before starting.

## Confirm the idle window

Pause manual World advancement and booking traffic for the window. Verify the current application can still run during a migration abort. Confirm the preceding release's active-career index from migration 0163 is present. Inspect the database from a short read-only session.

```sql
SELECT phase, count(*) FROM ppw_worlds GROUP BY phase;
SELECT count(*) AS active_updates FROM ppw_world_update_runs WHERE state = 'ACTIVE';
SELECT current_database(), current_schema();
SELECT to_regclass('ppw_programmes'), to_regclass('ppw_people_working_careers');
```

Proceed once both catalog names resolve, the Worlds in scope are open and active updates are zero. Close the read-only session before applying the migration. Long-lived sessions holding Programme locks can prevent the schema change during an otherwise idle application window.

## Apply in a single transaction

From the reviewed candidate checkout, with the direct connection supplied to the local client, run:

```bash
psql "$PPW_DIRECT_DATABASE_URL" -X --set=ON_ERROR_STOP=1 --single-transaction \
  -c "SET LOCAL lock_timeout = '3s'; SET LOCAL statement_timeout = '60s';" \
  -f db/migrations/0164_ai_programmes.sql
```

A lock timeout or any other statement error aborts the whole transaction. Inspect blocking activity and reschedule within an idle window if the timeout recurs. The migration adds a boolean with a false default and two partial indexes. Existing records acquire the default through PostgreSQL. The application rollout follows a successful commit and catalog check.

## Verify the catalog

```sql
SELECT a.attname, format_type(a.atttypid,a.atttypmod) AS type,
       a.attnotnull, pg_get_expr(d.adbin,d.adrelid) AS default_expr
FROM pg_attribute a
JOIN pg_attrdef d ON (d.adrelid,d.adnum) = (a.attrelid,a.attnum)
WHERE a.attrelid = 'ppw_programmes'::regclass AND a.attname = 'ai_authored';

SELECT c.relname, i.indisunique, i.indisready, i.indisvalid,
       pg_get_indexdef(i.indexrelid) AS definition,
       pg_get_expr(i.indpred,i.indrelid) AS predicate
FROM pg_index i
JOIN pg_class c ON c.oid = i.indexrelid
WHERE i.indrelid = 'ppw_programmes'::regclass
  AND c.relname IN ('ppw_one_active_ai_programme','ppw_ai_programme_recent_end')
ORDER BY c.relname;
```

Expect a non-null boolean with default `false`. Both indexes must be ready and valid. The first must be unique on `(world_id,promotion_id)` with the `ai_authored AND status='ACTIVE'` predicate. The second must order `(world_id,promotion_id,ended_week_index DESC)` and cover AI-authored programmes with an end week. Verify definitions even when the idempotent migration reports that objects already existed.

Record the committed migration after verification. If the application rollout must be reverted, restore the previous application version and retain the additive schema so any already certified Programme evidence stays intact. An unexpected catalog definition or lost migration session calls for inspection before retrying. Use the recorded recovery point only under the normal owner-authorized recovery process.
