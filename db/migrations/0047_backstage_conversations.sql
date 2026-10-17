-- Private, persistent wrestler requests; at most one unresolved conversation per talent/promotion.
CREATE TABLE ppw_backstage_requests (
 world_id text NOT NULL,request_id text NOT NULL,
 promotion_id text NOT NULL,person_id text NOT NULL,related_person_id text,
 kind text NOT NULL CHECK(kind IN ('CONTRACT','MORALE','MOMENTUM','PARTNERSHIP')),
 created_week_index integer NOT NULL CHECK(created_week_index>=0),
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN
 ('PENDING','ANSWERED','DECLINED','PROMISED','FULFILLED','BROKEN')),
 decision text CHECK(decision IN
 ('TALK','DECLINE','PROMISE_APPEARANCE','EXPLORE_RENEWAL','MEDIATE')),
 responded_week_index integer CHECK(responded_week_index>=0),
 due_week_index integer CHECK(due_week_index>=0),
 PRIMARY KEY(world_id,request_id),
 FOREIGN KEY(world_id,promotion_id) REFERENCES ppw_promotions(world_id,promotion_id),
 FOREIGN KEY(world_id,person_id) REFERENCES ppw_people(world_id,person_id),
 FOREIGN KEY(world_id,related_person_id) REFERENCES ppw_people(world_id,person_id),
 CHECK ((status='PENDING' AND decision IS NULL AND responded_week_index IS NULL)
  OR (status<>'PENDING' AND decision IS NOT NULL AND responded_week_index IS NOT NULL)),
 CHECK ((status IN ('PROMISED','FULFILLED','BROKEN'))=(due_week_index IS NOT NULL))
);
CREATE UNIQUE INDEX ppw_backstage_unresolved ON ppw_backstage_requests
 (world_id,promotion_id,person_id) WHERE status IN ('PENDING','PROMISED');
CREATE INDEX ppw_backstage_inbox ON ppw_backstage_requests
 (world_id,promotion_id,person_id,created_week_index DESC);
CREATE INDEX ppw_backstage_due ON ppw_backstage_requests
 (world_id,due_week_index) WHERE status='PROMISED';
