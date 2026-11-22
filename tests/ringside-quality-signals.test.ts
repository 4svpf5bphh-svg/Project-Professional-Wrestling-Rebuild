import test from "node:test";
import assert from "node:assert/strict";
import {getWrestlingBenchmark,assessWrestlingBenchmark}
 from "../src/domain/wrestling-ai-benchmark.js";
import {ringsideQualitySignals} from "../src/domain/ringside-quality-signals.js";
import {ringsideEditorialLens,ringsideBrief,RINGSIDE_STYLE_GUIDE}
 from "../src/domain/ringside-editorial.js";
import type {RingsideCopy} from "../src/domain/ringside-editorial.js";

const example=(id:string,recap:string)=>{
 const {show}=getWrestlingBenchmark(id)!;
 const article:RingsideCopy={showHeadline:"PPW Ringside",opening:"The lights came up.",
  closing:"The last contest left a mark.",
  slots:[{slotId:show.entries[0]!.slotId,headline:"A decisive bout",recap}]};
 return {show,article};
};
test("no-cost writing audit flags mechanical, florid and underwritten results",()=>{
 const {show,article}=example("singles-technical",
  "The unstoppable aura lit an electric audience. The result settled the contest.");
 const report=ringsideQualitySignals(show,article);
 assert.ok(report.warningCount>=2);
 assert.ok(report.flagTypes.includes("GENERIC_HYPE"));
 assert.ok(report.flagTypes.includes("MECHANICAL_FALLBACK"));
 assert.ok(report.flagTypes.includes("THIN_MAIN_BOUT"));
 const bench=assessWrestlingBenchmark("singles-technical",article);
 assert.equal(bench.humanReviewRequired,true);
 assert.ok(bench.qualityWarnings.some(w=>w.code==="GENERIC_HYPE"));
});
test("a specific physical story with a named finish needs no artificial prose flags",()=>{
 const recap="They opened cautiously, testing the distance with a collar-and-elbow lock-up. "+
  "The first counter caught the favourite leaning forward; a fast escape bought time "+
  "to rebuild the match around a stubborn arm. An attempted rush met a sharp elbow, "+
  "but neither wrestler could turn the first near-fall into a victory. "+
  "The late reversal changed the tempo. After one final exchange and a clean cover, "+
  "the booked winner scored three and got an earned reaction.";
 const {show,article}=example("singles-technical",recap);
 const result=ringsideQualitySignals(show,article);
 assert.deepEqual(result.warnings,[]);
 assert.equal(result.requiresHumanReview,true);
});
test("multiple individually plausible slots still flag repeated atmosphere across a show",()=>{
 const {show,article}=example("singles-technical","A counter drew an electric response.");
 const many={...show,entries:Array.from({length:5},(_,i)=>({
  ...show.entries[0]!,slotId:"bout-"+i,position:i
 }))};
 const full={...article,slots:many.entries.map(e=>({
  slotId:e.slotId,headline:"An actual fight",
  recap:"A clean takedown shifted the pace, with an electric crowd watching as the winner found another cover."
 }))};
 const result=ringsideQualitySignals(many,full);
 assert.ok(result.flagTypes.includes("REPEATED_HYPE"));
 assert.match(result.warnings.find(x=>x.code==="REPEATED_HYPE")?.description??"",
  /electric \(5\)/);
 assert.equal(result.requiresHumanReview,true);
});
test("quiet crowds and short contests get honest emphasis, not an invented epic",()=>{
 const {show,article}=example("singles-squash","A short match went wild. "+
  "The crowd erupted into a standing ovation. ".repeat(75));
 const quiet={...show,entries:show.entries.map(e=>({...e,crowdResponse:25}))};
 const flags=ringsideQualitySignals(quiet,article).flagTypes;
 assert.ok(flags.includes("OVERSOLD_QUIET_CROWD"));
 assert.ok(flags.includes("SQUASH_OVERWRITTEN"));
});
test("Groq editorial lenses use the actual finish, format, duration and story kind",()=>{
 for(const [id,fragment] of [["i-quit","spoken surrender"],
  ["singles-squash","brief, decisive"],["tag-standard","legal tags"]] as const){
  const {show}=getWrestlingBenchmark(id)!;
  assert.match(ringsideEditorialLens(show.entries[0]!),new RegExp(fragment));
  assert.equal(ringsideBrief(show).slots[0]!.editorialLens,
   ringsideEditorialLens(show.entries[0]!));
 }
 const {show}=getWrestlingBenchmark("singles-technical")!;
 const promo={...show.entries[0]!,type:"SEGMENT" as const,segmentKind:"INTERVIEW" as const};
 assert.match(ringsideEditorialLens(promo),/no invented entrance/);
 assert.match(RINGSIDE_STYLE_GUIDE,/editorialLens/);
 assert.ok(RINGSIDE_STYLE_GUIDE.length<6500);
});
