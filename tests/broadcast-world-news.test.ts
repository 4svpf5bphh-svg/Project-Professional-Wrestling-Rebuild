import test from "node:test";
import assert from "node:assert/strict";
import {composeBroadcastWorldNews} from "../src/domain/broadcast-world-news.js";
import {assessBroadcastNetwork} from "../src/domain/broadcast-network-review.js";
import type {NetworkAudit} from "../src/db/broadcast-network-audit.js";
const terms={dealId:"deal-77",offerCode:"BROADCAST_TV",tier:"NATIONAL",
 startWeekIndex:10,endWeekIndex:20,airingDay:5,airingHour:20};
const weeks=[12,13,14].map(weekIndex=>({
 weekIndex,showId:"match-"+weekIndex,showDay:5,audienceFormat:"TV" as const,rating:.7}));
const review=assessBroadcastNetwork(terms,weeks,14)!;
const audit:NetworkAudit={dealId:terms.dealId,promotionId:"human",
 promotionName:"Chaotic Wrestling Alliance",offerCode:terms.offerCode,
 airingDay:5,airingHour:20,review};
test("real network warnings are certified and quote their own partner personality",()=>{
 const news=composeBroadcastWorldNews([audit],[]);
 assert.equal(news.length,1);
 assert.equal(news[0]!.desk,"OFFICIAL");
 assert.equal(news[0]!.sourceKind,"EVENT");
 assert.equal(news[0]!.showId,"match-14");
 assert.match(news[0]!.key,/^broadcast:network:BROADCAST_TV:warning:/);
 assert.match(news[0]!.summary,/three consecutive weeks|3 consecutive weeks/);
 assert.match(news[0]!.summary,/BBS Sports responded/);
 assert.ok(news[0]!.summary.length<=600);
 assert.deepEqual(news,composeBroadcastWorldNews([audit],[]));
});
test("head-to-head ratings victory is attributed to the real TV show",()=>{
 const x=composeBroadcastWorldNews([],[
  {showId:"broadcast-1",promotionId:"human",promotionName:"CWA",
   rivalName:"North Wrestling",day:5,hour:20,rating:2.8,gain:.2,opponents:1}
 ]);
 assert.equal(x.length,1);
 assert.match(x[0]!.title,/wins viewers/);
 assert.match(x[0]!.summary,/North Wrestling/);
 assert.match(x[0]!.summary,/20:00/);
});
test("regular results, isolated ratings and unsourced warnings never become public news",()=>{
 const x=composeBroadcastWorldNews([{...audit,review:{...review,milestone:null}}],[]);
 assert.deepEqual(x,[]);
 const unavailable=composeBroadcastWorldNews([{...audit,
  review:{...review,showId:null}}],[]);
 assert.deepEqual(unavailable,[]);
});
