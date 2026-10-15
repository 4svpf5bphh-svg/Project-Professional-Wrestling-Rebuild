-- One authoritative deadline, compared using database time.
ALTER TABLE ppw_worlds
  ADD COLUMN next_lock_at timestamptz NOT NULL DEFAULT (now() + interval '1 day');
CREATE INDEX ppw_worlds_due_for_lock ON ppw_worlds(next_lock_at,world_id) WHERE phase='OPEN';
