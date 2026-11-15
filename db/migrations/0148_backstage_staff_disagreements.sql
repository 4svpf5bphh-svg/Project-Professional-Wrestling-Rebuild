-- Certified staff disagreement: one active high-fatigue wrestler in a stale programme,
-- with both Medical and Creative genuinely employed by the controlled promotion.
-- Reply is a manager's three-week commitment; it never books a show or alters a programme.
CREATE TABLE ppw_backstage_staff_disagreements (
 world_id text NOT NULL,
 promotion_id text NOT NULL,
 mail_id text NOT NULL CHECK(mail_id ~ '^backstage-world:[a-f0-9]{32}$'),
 medical_employment_id text NOT NULL,
 creative_employment_id text NOT NULL,
 programme_id text NOT NULL,
 person_id text NOT NULL,
 player_id text NOT NULL,
 decision text NOT NULL CHECK(decision IN ('PRIORITISE_HEALTH','REFRESH_PROGRAMME','DEFER')),
 status text NOT NULL CHECK(status IN ('PENDING','ACKNOWLEDGED','KEPT','BROKEN','EXCUSED')),
 responded_week_index integer NOT NULL CHECK(responded_week_index>=0),
 due_week_index integer NOT NULL CHECK(due_week_index>=responded_week_index),
 settled_week_index integer,
 PRIMARY KEY(world_id,promotion_id,mail_id),
 FOREIGN KEY(world_id,promotion_id) REFERENCES ppw_promotions(world_id,promotion_id),
 FOREIGN KEY(world_id,medical_employment_id) REFERENCES ppw_staff_employments(world_id,employment_id),
 FOREIGN KEY(world_id,creative_employment_id) REFERENCES ppw_staff_employments(world_id,employment_id),
 FOREIGN KEY(world_id,promotion_id,programme_id) REFERENCES ppw_programmes(world_id,promotion_id,programme_id),
 FOREIGN KEY(world_id,person_id) REFERENCES ppw_people(world_id,person_id)
);
CREATE INDEX ppw_staff_dispute_settle ON ppw_backstage_staff_disagreements
(world_id,due_week_index) WHERE status='PENDING';
CREATE INDEX ppw_staff_dispute_recent ON ppw_backstage_staff_disagreements
(world_id,promotion_id,programme_id,person_id,responded_week_index DESC);
