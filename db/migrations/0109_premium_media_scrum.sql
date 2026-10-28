-- One selected response to each certified premium-event question per owner.
-- No automated show changes, no score effects, no second World clock.
CREATE TABLE ppw_premium_media_scrum_answers (
 world_id text NOT NULL,
 promotion_id text NOT NULL,
 show_id text NOT NULL,
 player_id text NOT NULL REFERENCES ppw_players(player_id),
 question_id text NOT NULL CHECK(question_id IN ('MAIN_EVENT','BIG_PICTURE','NEXT_CHAPTER')),
 answer_index smallint NOT NULL CHECK(answer_index BETWEEN 0 AND 2),
 answered_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(world_id,show_id,player_id,question_id),
 FOREIGN KEY(world_id,show_id) REFERENCES ppw_completed_shows(world_id,show_id),
 FOREIGN KEY(world_id,promotion_id) REFERENCES ppw_promotions(world_id,promotion_id)
);
CREATE INDEX ppw_scrum_answers_owner ON ppw_premium_media_scrum_answers(world_id,promotion_id,player_id);
