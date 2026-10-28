import test from "node:test";
import assert from "node:assert/strict";
import {LEGENDS_CATALOGUE,LIVE_LEGENDS,LEGENDS_EXPANSION_RELEASED,
 legendUnlockEligible} from "../src/domain/legends-catalogue.js";
import {LEGEND_PORTRAIT_ASSETS,legendPortraitSource}
 from "../src/ui/legend-portrait-assets.js";
import {reviewedLegendExpansion,reviewedLegendPortraits}
 from "../src/domain/reviewed-legend-expansion.js";
import {PLANNED_LEGEND_ARTWORK}
 from "../src/domain/planned-legend-artwork.js";
import {planCertifiedLegendReleases}
 from "../src/domain/legend-release-cadence.js";

test("all 81 new cards and 93 portraits are wired for release without exposing missing art",()=>{
 assert.equal(LEGENDS_EXPANSION_RELEASED,false,"Never expose uncommitted image assets");
 assert.equal(LEGENDS_CATALOGUE.length,48);
 assert.equal(LIVE_LEGENDS.length,48);
 assert.equal(Object.keys(LEGEND_PORTRAIT_ASSETS).length,49);
 assert.equal(legendPortraitSource("legend:the-midnight-express:0"),null);
 const expansion=reviewedLegendExpansion();
 assert.equal(expansion.length,81);
 assert.equal(expansion.filter(x=>x.roster.length>1).length,11);
 assert.ok(expansion.every(x=>x.status==="ACTIVE"&&x.cardAsset));
 const all=[...LEGENDS_CATALOGUE,...expansion];
 assert.equal(all.length,129);
 assert.equal(new Set(all.map(x=>x.id)).size,129);
 const paths=reviewedLegendPortraits();
 assert.equal(Object.keys(paths).length,93);
 assert.equal(new Set(Object.keys(paths)).size,93);
 for(const x of expansion){
  const art=PLANNED_LEGEND_ARTWORK.find(a=>a.id===x.id);
  assert.ok(art);
  assert.equal(art.cardAsset,x.cardAsset);
  assert.deepEqual(art.members.map(m=>m.name),x.roster.map(m=>m.name));
  for(const member of art.members)assert.equal(paths[member.personId],member.portraitAsset);
 }
});

test("after explicit art release the new Legends use certified milestones and one global arrival",()=>{
 const expansion=reviewedLegendExpansion();
 const candidate=expansion.find(x=>x.name==="The Midnight Express");
 assert.ok(candidate);
 assert.equal(candidate.roster.length,2);
 assert.equal(legendUnlockEligible(candidate,{[candidate.metric!]:candidate.target!-1}),false);
 assert.equal(legendUnlockEligible(candidate,{[candidate.metric!]:candidate.target!}),true);
 const plan=planCertifiedLegendReleases(expansion,[],3,1,
  Object.fromEntries(expansion.map(x=>[x.metric!,10000])));
 assert.equal(plan.selected.length,1);
 const id=plan.selected[0]!.id;
 const next=planCertifiedLegendReleases(expansion.filter(x=>x.id!==id),
  [{id,year:3,week:1}],3,2,Object.fromEntries(expansion.map(x=>[x.metric!,10000])));
 assert.equal(next.selected.length,0);
 assert.equal(next.reason,"INTERVAL");
});
