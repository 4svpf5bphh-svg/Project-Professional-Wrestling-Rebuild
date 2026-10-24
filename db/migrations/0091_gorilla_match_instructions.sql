-- Bound player pre-authorised contingencies to the exact authored slot body.
-- An edited/replaced card automatically invalidates stale contingency decisions.
CREATE TABLE ppw_gorilla_match_instructions(
 world_id text NOT NULL,show_id text NOT NULL,slot_id text NOT NULL,
 promotion_id text NOT NULL,owner_player_id text NOT NULL,
 slot_signature char(32) NOT NULL CHECK(slot_signature ~ '^[0-9a-f]{32}$'),
 protect_script boolean NOT NULL DEFAULT false,
 crowd_choice text NOT NULL DEFAULT 'DELEGATE'
  CHECK(crowd_choice IN ('DELEGATE','PROTECT_SCRIPT','RESET_COMMENTARY','LET_CROWD_BREATHE')),
 timing_choice text NOT NULL DEFAULT 'DELEGATE'
  CHECK(timing_choice IN ('DELEGATE','PROTECT_SCRIPT','TIGHTEN_TRANSITIONS')),
 PRIMARY KEY(world_id,show_id,slot_id),
 FOREIGN KEY(world_id,show_id,slot_id) REFERENCES ppw_card_slots(world_id,draft_id,slot_id) ON DELETE CASCADE,
 FOREIGN KEY(world_id,promotion_id) REFERENCES ppw_promotions(world_id,promotion_id) ON DELETE CASCADE,
 FOREIGN KEY(world_id,owner_player_id) REFERENCES ppw_memberships(world_id,player_id)
);
CREATE INDEX ppw_gorilla_instructions_by_owner
 ON ppw_gorilla_match_instructions(world_id,promotion_id,show_id);
