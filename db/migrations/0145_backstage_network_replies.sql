-- Stable manager choices about genuine signed-network warnings.
CREATE TABLE ppw_backstage_network_replies (
 world_id text NOT NULL,
 promotion_id text NOT NULL,
 mail_id text NOT NULL CHECK(mail_id ~ '^backstage-world:[a-f0-9]{32}$'),
 deal_id text NOT NULL,
 player_id text NOT NULL,
 decision text NOT NULL CHECK(decision IN ('COMMIT_RECOVERY','COMMIT_STANDARDS','STAND_FIRM')),
 status text NOT NULL CHECK(status IN ('PENDING','ACKNOWLEDGED','KEPT','BROKEN','EXCUSED')),
 responded_week_index integer NOT NULL CHECK(responded_week_index>=0),
 due_week_index integer NOT NULL CHECK(due_week_index>=responded_week_index),
 settled_week_index integer,
 PRIMARY KEY(world_id,promotion_id,mail_id),
 FOREIGN KEY(world_id,promotion_id) REFERENCES ppw_promotions(world_id,promotion_id),
 FOREIGN KEY(world_id,deal_id) REFERENCES ppw_commercial_deals(world_id,deal_id)
);
CREATE INDEX ppw_backstage_network_pending
 ON ppw_backstage_network_replies(world_id,deal_id,due_week_index)
 WHERE status='PENDING';
