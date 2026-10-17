-- Genuine recent working-chemistry strain; not scripted rivalry or old low trust.
ALTER TABLE ppw_backstage_requests
 ADD COLUMN working_verified_shows integer CHECK(working_verified_shows>=3),
 ADD COLUMN working_trust_delta double precision
 CHECK(working_trust_delta<0 AND working_trust_delta>=-1),
 ADD CONSTRAINT ppw_backstage_working_evidence CHECK
 ((working_verified_shows IS NULL)=(working_trust_delta IS NULL));
