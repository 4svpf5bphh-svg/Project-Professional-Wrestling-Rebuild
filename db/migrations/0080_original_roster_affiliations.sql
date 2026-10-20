-- Preserve genuine original-main wrestler roster affiliations independently
-- of legal contract ownership. NXT talent can be contracted to WWE, and ROH
-- talent to AEW, while remaining on the correct active developmental roster.
-- No contract dates, cash or history are duplicated.
ALTER TABLE ppw_promotions ADD COLUMN parent_promotion_id text;
ALTER TABLE ppw_promotions ADD CONSTRAINT ppw_parent_promotion_fk
 FOREIGN KEY (world_id,parent_promotion_id)
 REFERENCES ppw_promotions(world_id,promotion_id);
ALTER TABLE ppw_promotions ADD CONSTRAINT ppw_no_self_parent
 CHECK (parent_promotion_id IS NULL OR parent_promotion_id<>promotion_id);
CREATE TABLE ppw_wrestler_promotion_affiliations (
 world_id text NOT NULL,
 person_id text NOT NULL,
 promotion_id text NOT NULL,
 role text NOT NULL CHECK (role IN ('PRIMARY','SECONDARY')),
 basis text NOT NULL CHECK (basis IN ('CONTRACT','PARENT_COMPANY')),
 PRIMARY KEY(world_id,person_id,promotion_id),
 FOREIGN KEY(world_id,person_id) REFERENCES ppw_people(world_id,person_id),
 FOREIGN KEY(world_id,promotion_id) REFERENCES ppw_promotions(world_id,promotion_id)
);
CREATE INDEX ppw_affiliations_promotion ON
 ppw_wrestler_promotion_affiliations(world_id,promotion_id,person_id)
 INCLUDE(basis,role);
