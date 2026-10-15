import assert from "node:assert/strict";
import test from "node:test";
import {scoreArchivedSinglesBeforeInjuries,type ScoringInput}
  from "../src/simulation/legacy/match-scoring.js";

const strong={skills:{inRingQuality:85,matchCraft:82,presentation:77,
  stamina:80,safety:92},popularity:60,recognition:65,momentum:72,fatigue:15};
const skilled={skills:{inRingQuality:77,matchCraft:74,presentation:69,
  stamina:83,safety:88},popularity:53,recognition:49,momentum:57,fatigue:24};
const base:ScoringInput={
  worldSeed:42,matchId:"show:opening",order:1,eventImportance:61,
  intent:"TECHNICAL",style:null,plannedFinish:"SUBMISSION",
  plannedLengthMinutes:20,chemistryModifier:3.5,people:[strong,skilled],
};
test("legacy intent-only scoring preserves original seeded execution, stars, crowd and length",()=>{
  const first=scoreArchivedSinglesBeforeInjuries(base);
  assert.deepEqual(scoreArchivedSinglesBeforeInjuries({...base}),first);
  assert.equal(first.stage,"PRE_INJURY_PRE_INTERFERENCE_PRE_SHOW_FLOW");
  assert.equal(first.styleResolver,"INTENT");
  assert.ok(first.executionQuality>=5&&first.executionQuality<=100);
  assert.ok(first.criticalRatingStars>=0.5&&first.criticalRatingStars<=5);
  assert.equal(first.criticalRatingStars*4,Math.round(first.criticalRatingStars*4));
  assert.ok(first.crowdResponse>=0&&first.crowdResponse<=100);
  assert.ok(first.actualLengthMinutes>=3);
  assert.notDeepEqual(scoreArchivedSinglesBeforeInjuries({...base,matchId:"show:second"}),first);
});
test("original style branch and finish modifiers are retained without rerolling results",()=>{
  const style={competitiveness:80,technical:94,story:47,intensity:65,risk:18,epic:48};
  const dimensional=scoreArchivedSinglesBeforeInjuries({...base,style});
  const legacy=scoreArchivedSinglesBeforeInjuries(base);
  assert.equal(dimensional.styleResolver,"DIMENSIONAL");
  assert.notEqual(dimensional.executionQuality,legacy.executionQuality);
  const dq=scoreArchivedSinglesBeforeInjuries({...base,style,plannedFinish:"DISQUALIFICATION"});
  assert.notEqual(dimensional.crowdResponse,dq.crowdResponse);
  assert.deepEqual(scoreArchivedSinglesBeforeInjuries({...base,style}),dimensional);
});
test("crowd pull, familiarity chemistry and fatigue influence the archived match formulas",()=>{
  const normal=scoreArchivedSinglesBeforeInjuries(base);
  const tired=scoreArchivedSinglesBeforeInjuries({...base,
    people:[{...strong,fatigue:95},{...skilled,fatigue:95}]});
  assert.ok(normal.executionQuality>tired.executionQuality);
  const popular=scoreArchivedSinglesBeforeInjuries({...base,
    people:[{...strong,popularity:95,recognition:95,momentum:95},
      {...skilled,popularity:95,recognition:95,momentum:95}]});
  assert.ok(popular.crowdResponse>normal.crowdResponse);
  const chemistry=scoreArchivedSinglesBeforeInjuries({...base,chemistryModifier:10});
  assert.ok(chemistry.executionQuality>normal.executionQuality);
});
test("scoring never fabricates missing skills, audience data or impossible show context",()=>{
  assert.throws(()=>scoreArchivedSinglesBeforeInjuries({...base,
    people:[{...strong,popularity:Number.NaN},skilled]}),/Unknown or invalid/);
  assert.throws(()=>scoreArchivedSinglesBeforeInjuries({...base,
    people:[{...strong,skills:{...strong.skills,safety:Number.NaN}},skilled]}),/Unknown or invalid/);
  assert.throws(()=>scoreArchivedSinglesBeforeInjuries({...base,eventImportance:105}),/Invalid match scoring context/);
  assert.throws(()=>scoreArchivedSinglesBeforeInjuries({...base,chemistryModifier:Infinity}),/Invalid match scoring context/);
});
