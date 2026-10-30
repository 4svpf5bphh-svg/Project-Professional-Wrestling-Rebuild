-- One-time, idempotent repair for company-branded belts left behind when
-- promotions were renamed before active championship labels were integrated.
-- Existing title IDs, reigns, holders, prestige and certified results are kept.
-- Only exact previous-brand + space prefixes belonging to that promotion change.
WITH candidates AS (
 SELECT c.world_id,c.promotion_id,c.championship_id,
  p.name AS current_name,h.previous_name,
  row_number() OVER (
   PARTITION BY c.world_id,c.promotion_id,c.championship_id
   ORDER BY char_length(h.previous_name) DESC,h.name_change_id DESC
  ) AS choice
 FROM ppw_championships c
 JOIN ppw_promotions p ON p.world_id=c.world_id AND p.promotion_id=c.promotion_id
 JOIN ppw_promotion_name_history h ON h.world_id=c.world_id
  AND h.promotion_id=c.promotion_id
 WHERE p.name<>h.previous_name
  AND left(c.name,char_length(h.previous_name)+1)=h.previous_name||' '
)
UPDATE ppw_championships c
SET name=chosen.current_name||
 substring(c.name FROM char_length(chosen.previous_name)+1)
FROM candidates chosen
WHERE chosen.choice=1 AND c.world_id=chosen.world_id
 AND c.promotion_id=chosen.promotion_id
 AND c.championship_id=chosen.championship_id;
