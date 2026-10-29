-- Reconcile reviewed real-world tag partners into an existing PPW World.
-- Source: original PPW main packages/content/src/real-active-tag-teams.ts
-- (+ The Gunns, whose exact wrestlers are in its original mixed roster).
-- Neither a second World Lock nor fabricated match evidence is introduced.
-- Worlds without these exact, uniquely identified people are unchanged.
CREATE TEMP TABLE ppw_reviewed_tag_heritage (
 name text NOT NULL, first_name text NOT NULL, second_name text NOT NULL,
 family boolean NOT NULL
) ON COMMIT DROP;
INSERT INTO ppw_reviewed_tag_heritage VALUES
 ('The Young Bucks','Matthew Jackson','Nicholas Jackson',true),
 ('FTR','Cash Wheeler','Dax Harwood',false),
 ('The Street Profits','Angelo Dawkins','Montez Ford',false),
 ('The Creed Brothers','Brutus Creed','Julius Creed',true),
 ('The Hardys','Jeff Hardy','Matt Hardy',true),
 ('The Nemeths','Nic Nemeth','Ryan Nemeth',true),
 ('JetSpeed','Kevin Knight','Mike Bailey',false),
 ('TMDK','Mikey Nicholls','Shane Haste',false),
 ('The Elegance Brand','M By Elegance','Heather By Elegance',false),
 ('ZaRuca','Sol Ruca','Zaria',false),
 ('FWC','Hazuki','Koguma',false),
 ('The Bella Twins','Brie Bella','Nikki Bella',true),
 ('The Gunns','Austin Gunn','Colten Gunn',true);

-- Materialise only exact two-person, same-division pair identities. Repeated
-- wrestler names are ambiguous and intentionally skipped (not guessed).
CREATE TEMP TABLE ppw_reviewed_tag_pairs ON COMMIT DROP AS
SELECT a.world_id, c.name, c.family,
 LEAST(a.person_id,b.person_id) AS person_a_id,
 GREATEST(a.person_id,b.person_id) AS person_b_id,
 'heritage-tag-'||md5(lower(c.name)) AS team_id
FROM ppw_reviewed_tag_heritage c
JOIN ppw_people a ON a.name=c.first_name AND a.status='ACTIVE'
JOIN ppw_people b ON b.world_id=a.world_id AND b.name=c.second_name
 AND b.status='ACTIVE' AND b.person_id<>a.person_id
WHERE a.booking_division IS NOT NULL
 AND a.booking_division=b.booking_division
 AND (SELECT count(*) FROM ppw_people other
  WHERE other.world_id=a.world_id AND other.name=c.first_name)=1
 AND (SELECT count(*) FROM ppw_people other
  WHERE other.world_id=a.world_id AND other.name=c.second_name)=1;

-- Respect player-created/rebranded teams. Never overwrite a name, dismantle
-- an existing active pair, steal another team's name, or add duplicate members.
INSERT INTO ppw_tag_teams(world_id,team_id,name,status,formed_week_index)
SELECT pair.world_id,pair.team_id,pair.name,'ACTIVE',0
FROM ppw_reviewed_tag_pairs pair
WHERE NOT EXISTS (
 SELECT 1 FROM ppw_tag_teams existing
 WHERE existing.world_id=pair.world_id AND existing.status='ACTIVE'
 AND lower(btrim(existing.name))=lower(btrim(pair.name))
) AND NOT EXISTS (
 SELECT 1 FROM ppw_tag_teams existing
 JOIN ppw_tag_team_members one ON one.world_id=existing.world_id
  AND one.team_id=existing.team_id AND one.active
 JOIN ppw_tag_team_members two ON two.world_id=existing.world_id
  AND two.team_id=existing.team_id AND two.active
 WHERE existing.world_id=pair.world_id AND existing.status='ACTIVE'
 AND one.person_id=pair.person_a_id AND two.person_id=pair.person_b_id
)
ON CONFLICT DO NOTHING;

-- Add members only for the exact newly created heritage ID; reruns are safe.
INSERT INTO ppw_tag_team_members(world_id,team_id,person_id,active)
SELECT t.world_id,t.team_id,m.person_id,true
FROM ppw_reviewed_tag_pairs pair
JOIN ppw_tag_teams t ON t.world_id=pair.world_id AND t.team_id=pair.team_id
 AND t.status='ACTIVE' AND t.name=pair.name
CROSS JOIN LATERAL (VALUES(pair.person_a_id),(pair.person_b_id)) AS m(person_id)
ON CONFLICT DO NOTHING;

-- Record known pre-World familiarity separately from certified matches.
-- Existing working history and relationships always win; an initial team is
-- *established*, but has zero matches completed inside this simulated World.
INSERT INTO ppw_wrestler_relationships(
 world_id,person_a_id,person_b_id,professional_trust,familiarity,tags)
SELECT pair.world_id,pair.person_a_id,pair.person_b_id,76,86,
 CASE WHEN pair.family THEN '["TAG_PARTNERS","FAMILY"]'::jsonb
 ELSE '["TAG_PARTNERS"]'::jsonb END
FROM ppw_reviewed_tag_pairs pair
WHERE EXISTS (
 SELECT 1 FROM ppw_tag_teams t
 JOIN ppw_tag_team_members a ON a.world_id=t.world_id AND a.team_id=t.team_id
  AND a.person_id=pair.person_a_id AND a.active
 JOIN ppw_tag_team_members b ON b.world_id=t.world_id AND b.team_id=t.team_id
  AND b.person_id=pair.person_b_id AND b.active
 WHERE t.world_id=pair.world_id AND t.status='ACTIVE' AND t.name=pair.name
)
ON CONFLICT(world_id,person_a_id,person_b_id) DO NOTHING;

INSERT INTO ppw_working_chemistry(
 world_id,person_a_id,person_b_id,context,compatibility,familiarity,matches_together)
SELECT pair.world_id,pair.person_a_id,pair.person_b_id,'TAG',4,86,0
FROM ppw_reviewed_tag_pairs pair
WHERE EXISTS (
 SELECT 1 FROM ppw_tag_teams t
 JOIN ppw_tag_team_members a ON a.world_id=t.world_id AND a.team_id=t.team_id
  AND a.person_id=pair.person_a_id AND a.active
 JOIN ppw_tag_team_members b ON b.world_id=t.world_id AND b.team_id=t.team_id
  AND b.person_id=pair.person_b_id AND b.active
 WHERE t.world_id=pair.world_id AND t.status='ACTIVE' AND t.name=pair.name
)
ON CONFLICT(world_id,context,person_a_id,person_b_id) DO NOTHING;
