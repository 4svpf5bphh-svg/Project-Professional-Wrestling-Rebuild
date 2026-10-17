-- A private UI read receipt, not a player advantage or a World command.
ALTER TABLE ppw_backstage_requests ADD COLUMN read_week_index integer
 CHECK(read_week_index>=0);
