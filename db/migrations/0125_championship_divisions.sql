-- New titles can target a men's or women's division without changing any
-- historic belt, holder or World result. NULL preserves legacy eligibility.
ALTER TABLE ppw_championships
 ADD COLUMN IF NOT EXISTS booking_division text
 CHECK(booking_division IN ('MEN','WOMEN'));
CREATE INDEX IF NOT EXISTS ppw_championships_owned_active_gender
 ON ppw_championships(world_id,promotion_id,booking_division,title_role)
 WHERE status='ACTIVE';
