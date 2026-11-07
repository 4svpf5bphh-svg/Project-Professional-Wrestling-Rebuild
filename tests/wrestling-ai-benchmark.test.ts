import {test} from "node:test";
import assert from "node:assert/strict";
import {getWrestlingBenchmark,WRESTLING_BENCHMARKS,assessWrestlingBenchmark}
 from "../src/domain/wrestling-ai-benchmark.js";
import {ringsideBrief,ringsideStipulationNote,validateRingsideCopy}
 from "../src/domain/ringside-editorial.js";
import {wrestlingMatchIQ} from "../src/domain/wrestling-iq.js";
test("Fifteen deterministic wrestling scenarios provide certified results and no World data",()=>{
 assert.equal(WRESTLING_BENCHMARKS.length,15);
 assert.equal(new Set(WRESTLING_BENCHMARKS.map(s=>s.id)).size,15);
 for(const meta of WRESTLING_BENCHMARKS){
  const first=getWrestlingBenchmark(meta.id)!;
  const second=getWrestlingBenchmark(meta.id)!;
  assert.deepEqual(first,second,"benchmarks must be stable for model comparison");
  assert.equal(first.show.entries.length,1);
  const entry=first.show.entries[0]!,brief=ringsideBrief(first.show).slots[0]!;
  assert.equal(brief.match!.winners.join("|"),entry.matchContext!.winnerNames.join("|"));
  assert.equal(brief.finish,entry.outcome);
  assert.ok(wrestlingMatchIQ(entry));
  assert.ok(first.show.showId.startsWith("benchmark:"));
  assert.equal(first.show.matchCount,1);
  assert.ok(!JSON.stringify(first).includes("api_key"));
  const ok={showHeadline:"A story at ringside",opening:"The crowd greeted the bell.",
   closing:"There was plenty to consider after the finish.",slots:[{
    slotId:entry.slotId,headline:"The main event",recap:"The official victor had their hand raised once the decisive result was reached."}]};
  assert.deepEqual(validateRingsideCopy(ok,first.show),ok);
  assert.equal(assessWrestlingBenchmark(meta.id,ok).certifiedFactsValidated,true);
 }
 assert.equal(getWrestlingBenchmark("does-not-exist"),null);
});
test("Tag, trios, multi-team and battle-royal classifications survive real fixture formats",()=>{
 for(const [id,format] of [["tag-standard","TAG"],["tag-squash","TAG"],["trios","TAG"],
  ["multi-team","MULTI_TEAM"],["triple-threat","MULTI_PERSON"],["battle-royal","BATTLE_ROYAL"]] as const){
  assert.equal(wrestlingMatchIQ(getWrestlingBenchmark(id)!.show.entries[0]!)!.format,format);
 }
});
test("Cage, I Quit, Iron Man and Two Falls use canonical winning conditions",()=>{
 for(const [id,stip,finish] of [
  ["steel-cage","STEEL_CAGE","CLEAN_PIN"],["i-quit","I_QUIT","VERBAL_SURRENDER"],
  ["iron-man","IRON_MAN","MOST_FALLS"],["two-falls","TWO_OUT_OF_THREE","SECOND_FALL"]
 ] as const){
  const e=getWrestlingBenchmark(id)!.show.entries[0]!;
  assert.equal(ringsideStipulationNote(e.matchContext!.format)?.stipulation,stip);
  assert.equal(e.outcome,finish);
 }
});
test("Benchmark gate rejects decisive impossible finishes and untagged legal competitors",()=>{
 const scenario=(id:string,recap:string)=>{
  const x=getWrestlingBenchmark(id)!.show;
  return ()=>assessWrestlingBenchmark(id,{showHeadline:"A rough night",opening:"The crowd was tense.",
   closing:"The final bell caused debate.",
   slots:[{slotId:x.entries[0]!.slotId,headline:"The final stretch",recap}]});
 };
 assert.throws(scenario("i-quit","The loser tapped out to end it."),/verbal surrender/);
 assert.throws(scenario("steel-cage","He escaped the cage for the win."),/Cage escape/);
 assert.throws(scenario("tag-standard","Both team partners were legal throughout the match."),/tag-team legality/);
 assert.throws(scenario("triple-threat","The hot tag brought the partner into the ring."),/tag-team mechanics/);
 assert.throws(scenario("singles-submission","The winner pinned them for the three-count to win."),/pinfall/);
 const good=scenario("tag-standard","The winning team worked from the corner, with each legal tag shifting momentum.");
 assert.doesNotThrow(good);
 assert.equal(good().diagnosticCues[0],"Some tag-team mechanics mentioned");
});
