import assert from "node:assert/strict";
import test from "node:test";
import {WORLD_MAIL_SQL} from "../src/db/backstage-world-mail.js";

test("Free agent correspondence only follows genuine published shows and canonical real offers",()=>{
 assert.match(WORLD_MAIL_SQL,/ppw_completed_shows completed JOIN ppw_world_news_weeks news/);
 assert.match(WORLD_MAIL_SQL,/p.popularity BETWEEN 25 AND 70/);
 assert.match(WORLD_MAIL_SQL,/ppw_backstage_free_agent_replies agent_reply/);
 assert.match(WORLD_MAIL_SQL,/agent_reply.mail_id IS NULL/);
 assert.match(WORLD_MAIL_SQL,/JOIN LATERAL \(\s*SELECT offer_id,status,submitted_week_index FROM ppw_contract_offers bid/);
 assert.match(WORLD_MAIL_SQL,/bid.status IN \('ACCEPTED','REJECTED'\)/);
 assert.match(WORLD_MAIL_SQL,/recruitment_result AS/);
 assert.match(WORLD_MAIL_SQL,/LIMIT 20/);
 assert.doesNotMatch(WORLD_MAIL_SQL,/groq|random\(\)/i);
});
