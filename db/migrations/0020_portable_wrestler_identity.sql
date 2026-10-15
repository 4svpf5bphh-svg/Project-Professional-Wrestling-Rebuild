-- Wrestlers carry one World-owned gimmick and core FACE/HEEL/TWEENER alignment.
-- Their normal identity MUST NOT be reauthored separately for each promotion.
-- Gimmick catalogue/profile/history and creative resistance are later systems;
-- this placeholder is nullable rather than inventing a character for imports.
ALTER TABLE ppw_people
  ADD COLUMN portable_gimmick_id text
    CHECK(portable_gimmick_id IS NULL OR length(btrim(portable_gimmick_id)) BETWEEN 1 AND 120);

-- Existing promotion-alignment rows are exceptional, not routine defaults.
-- A pending, unapproved or expired request cannot modify match presentation.
-- Approval evidence is issued by a future wrestler-response command; player
-- commands must not be able to set wrestler_approved themselves.
ALTER TABLE ppw_promotion_wrestler_alignments
  ADD COLUMN exception_kind text NOT NULL
    CHECK(exception_kind IN ('REGIONAL_STORYLINE','ONE_OFF_APPEARANCE','CROSS_PROMOTION_ANGLE')),
  ADD COLUMN justification text NOT NULL
    CHECK(length(btrim(justification)) BETWEEN 12 AND 400),
  ADD COLUMN starts_week_index integer NOT NULL CHECK(starts_week_index>=0),
  ADD COLUMN expires_week_index integer NOT NULL CHECK(expires_week_index>=0),
  ADD COLUMN wrestler_approved boolean NOT NULL DEFAULT false,
  ADD COLUMN approval_receipt_id text,
  ADD CONSTRAINT ppw_promotion_alignment_temporary
    CHECK(expires_week_index BETWEEN starts_week_index AND starts_week_index+25),
  ADD CONSTRAINT ppw_promotion_alignment_consent
    CHECK(
      (NOT wrestler_approved AND approval_receipt_id IS NULL) OR
      (wrestler_approved AND approval_receipt_id IS NOT NULL AND
       length(btrim(approval_receipt_id)) BETWEEN 8 AND 200)
    );
-- The existing world/promotion/person primary key supports a bounded lookup.
