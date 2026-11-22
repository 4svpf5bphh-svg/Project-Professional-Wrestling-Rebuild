import test from "node:test";
import assert from "node:assert/strict";
import {
 ringsideClicheSignals,ringsideProseQualityFailure,
 impossibleHoldCount,reportedTapInPinfall,unseenCleanCount
} from "../src/domain/ringside-prose-quality.js";

test("published PPW purple-prose clusters are identified without rejecting normal sportswriting",()=>{
 const published="Regal strutted in, caught the electric crowd and became a looming authority figure, "+
  "while a dark shadow loomed and his eyes sparkled.";
 const signals=ringsideClicheSignals(published);
 assert.ok(signals.length>=3);
 assert.match(ringsideProseQualityFailure({
  opening:"The evening began with a live interview.",
  closing:"The main event divided the audience.",
  slots:[{headline:"Regal's debut",recap:published}]
 })??"",/stock metaphors/);
 assert.equal(ringsideProseQualityFailure({
  opening:"An audience gathered for an important challenge.",
  closing:"The finish was decisive, though the match dragged before the last exchange.",
  slots:[{headline:"Regal speaks",recap:
   "Regal demanded a response from the company. His words drew an electric crowd before he left the stage."}]
 }),null,"One ordinary metaphor is not automatically disallowed");
});

test("one repetitive cliche from each slot becomes a weak article only when heavily overused",()=>{
 const prose=(n:number)=>({
  headline:"Fight "+n,
  recap:"The electric crowd cheered the exchange, while the audience kept watching the ring."
 });
 assert.match(ringsideProseQualityFailure({
  opening:"The audience entered for the first bell.",
  closing:"That was the final decision.",
  slots:Array.from({length:5},(_,i)=>prose(i))
 })??"",/repeated stock metaphors/);
 assert.equal(ringsideProseQualityFailure({
  opening:"A good opening match.",
  closing:"The final bout was measured.",
  slots:[prose(1),prose(2)]
 }),null);
});

test("a locked armbar cannot simultaneously score a clean three-count",()=>{
 const impossible="O'Reilly caught Sabin in an armbar. Sabin fought back, "+
  "but the referee's hand struck the mat for a clean pin while the armbar remained locked.";
 assert.equal(impossibleHoldCount(impossible),true);
 assert.equal(impossibleHoldCount("The armbar was released. "+
  "Later O'Reilly applied a cradle and the referee counted three."),false);
 assert.equal(impossibleHoldCount("O'Reilly kept the armbar locked "+
  "until Sabin tapped out."),false,"A lawful submission should not be rejected");
});

test("a legal referee must witness the winning count, or return to the action",()=>{
 const impossible="The referee's back was turned. "+
  "Bayne snatched a clean pin as the referee counted three.";
 assert.equal(unseenCleanCount(impossible),true);
 assert.equal(unseenCleanCount("The referee's back was turned, but "+
  "the referee returned to count three as Bayne covered Hart."),false);
 assert.equal(unseenCleanCount("The referee's back was turned when "+
  "Bayne shoved Hart outside the ring. The match continued."),false);
});

test("live CWA pinfall corrections catch heel-hook-to-count across sentences",()=>{
 const fromLiveSamples=[
  "The climax arrived when O'Reilly transitioned into a textbook Heel Hook, "+
   "forcing Sabin's shoulder to the mat for the three-count.",
  "O'Reilly caught a rebounded strike, transitioned into a seamless armbar, "+
   "and kept the pressure until Sabin's shoulders hit the mat. "+
   "The referee's clean three-count left no doubt.",
  "He kept the chokehold on as the referee counted three."
 ];
 for(const article of fromLiveSamples)
  assert.equal(impossibleHoldCount(article),true,article);
 const legitimate=[
  "Omega worked an armbar until his opponent escaped. "+
   "Later a V-Trigger led to a legal pinfall.",
  "The heel hook was released before the wrestlers returned to their feet. "+
   "A quick cradle scored a three-count.",
  "Joe kept the Coquina Clutch locked until Lethal tapped out."
 ];
 for(const article of legitimate)
  assert.equal(impossibleHoldCount(article),false,article);
});
test("a tap in a clean-pin match cannot be ignored because Groq counts three later",()=>{
 assert.equal(reportedTapInPinfall(
  "An armbar stretched Sabin's forearm into a heel hook that left the veteran tapping. "+
  "The referee's clean three-count was the logical conclusion."),true);
 assert.equal(reportedTapInPinfall(
  "Sabin tapped out to a leg lock, then O'Reilly pinned him."),true);
 assert.equal(reportedTapInPinfall(
  "Sabin nearly tapped, but escaped the hold before O'Reilly scored the legal pin."),false);
 assert.equal(reportedTapInPinfall(
  "Sabin refused to tap and rolled clear before O'Reilly hit the winning strike."),false);
});
