-- One deliberate manager reply per genuine staff concern, no message fan-out.
CREATE TABLE ppw_backstage_staff_replies (
 world_id text NOT NULL,
 promotion_id text NOT NULL,
 mail_id text NOT NULL CHECK(mail_id ~ '^backstage-world:[a-f0-9]{32}$'),
 employment_id text NOT NULL,
 staff_id text NOT NULL,
 role text NOT NULL CHECK(role IN ('MEDICAL','CREATIVE')),
 player_id text NOT NULL,
 decision text NOT NULL CHECK(decision IN ('COMMIT','DEFER')),
 status text NOT NULL CHECK(status IN ('PENDING','ACKNOWLEDGED','KEPT','BROKEN','EXCUSED')),
 responded_week_index integer NOT NULL CHECK(responded_week_index>=0),
 due_week_index integer NOT NULL CHECK(due_week_index>=responded_week_index),
 settled_week_index integer,
 PRIMARY KEY(world_id,promotion_id,mail_id),
 FOREIGN KEY(world_id,promotion_id) REFERENCES ppw_promotions(world_id,promotion_id),
 FOREIGN KEY(world_id,employment_id) REFERENCES ppw_staff_employments(world_id,employment_id)
);
CREATE INDEX ppw_backstage_staff_reply_pending ON ppw_backstage_staff_replies
(world_id,due_week_index) WHERE status='PENDING';
