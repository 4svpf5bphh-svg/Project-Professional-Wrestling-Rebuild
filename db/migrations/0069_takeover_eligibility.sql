-- One-off authentic PPW Genesis preserves locked real promotions; player claims
-- remain available only for explicitly takeover-eligible fictional promotions.
ALTER TABLE ppw_promotions ADD COLUMN IF NOT EXISTS takeover_eligibility text NOT NULL DEFAULT 'STANDARD'
 CHECK (takeover_eligibility IN ('STANDARD','LOCKED'));
UPDATE ppw_promotions SET takeover_eligibility='LOCKED'
 WHERE promotion_id IN ('promotion-001','promotion-002','promotion-003','promotion-004',
 'promotion-005','promotion-006','promotion-007','promotion-008')
 AND name IN ('WWE','AEW','NJPW','NXT','TNA Wrestling','CMLL','ROH','STARDOM');
