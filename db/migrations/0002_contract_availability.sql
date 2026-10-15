-- Contract availability read indexes. Non-exclusive talent may work for multiple
-- promotions; exclusive SIGNED contracts are unique per World/person.
-- Existing fixtures must be audited before applying to populated worlds.
CREATE UNIQUE INDEX IF NOT EXISTS ppw_one_signed_exclusive_contract_per_person
ON ppw_contracts(world_id,person_id)
WHERE family='EXCLUSIVE' AND status='SIGNED';

CREATE INDEX IF NOT EXISTS ppw_contracts_signed_person_expiry
ON ppw_contracts(world_id,person_id,expires_week_index)
WHERE status='SIGNED';

CREATE INDEX IF NOT EXISTS ppw_people_active_name
ON ppw_people(world_id,name,person_id)
WHERE status='ACTIVE';
