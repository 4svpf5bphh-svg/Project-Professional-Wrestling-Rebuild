-- Opt-in Talent Manager. The server offers the SAME terms near expiry.
-- Wrestlers remain free to refuse. Existing staff permissions stay unchanged.
-- Default is OFF; consent never passes automatically to a future controller.
ALTER TABLE ppw_staff_continuity_settings
 ADD COLUMN auto_renew_same_terms boolean NOT NULL DEFAULT false;
