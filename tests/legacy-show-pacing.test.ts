import assert from "node:assert/strict";
import test from "node:test";
import {evaluateArchivedMatchPacing,type PacingMatch}
  from "../src/simulation/legacy/show-pacing.js";
import type {MatchStyleProfile} from "../src/simulation/legacy/types.js";
const make=(matchId:string,position:number,intent:PacingMatch["intent"],
  crowdResponse=72,style?:MatchStyleProfile):PacingMatch=>({
  matchId,position,intent,crowdResponse,...(style?{style}:{})
});
test("original weekly show pacing rewards a planned crescendo over a flat finish",()=>{
  const wellBuilt=evaluateArchivedMatchPacing([
    make("opener",0,"PROTECTIVE"),make("middle",2,"STORY"),
    make("main",4,"EPIC"),
  ]);
  const flat=evaluateArchivedMatchPacing([
    make("opener",0,"EPIC"),make("middle",2,"EPIC"),
    make("main",4,"PROTECTIVE"),
  ]);
  assert.equal(wellBuilt.phase,"PACING_ONLY_NOT_FINAL");
  assert.equal(wellBuilt.segments,"NOT_PROJECTED");
  assert.equal(wellBuilt.matches.at(-1)?.pacingReason,"BIG_CLOSER");
  assert.equal(flat.matches.at(-1)?.pacingReason,"FLAT_CLOSER");
  assert.ok(wellBuilt.crowdResponsePacingOnly>flat.crowdResponsePacingOnly);
  assert.deepEqual(evaluateArchivedMatchPacing([
    make("main",4,"EPIC"),make("opener",0,"PROTECTIVE"),make("middle",2,"STORY"),
  ]),wellBuilt);
});
test("back-to-back epic booking triggers high-intensity and streak penalties",()=>{
  const sequence=evaluateArchivedMatchPacing([
    make("a",0,"EPIC"),make("b",1,"EPIC"),make("c",2,"EPIC"),
  ]);
  assert.equal(sequence.matches[1]!.pacingReason,"BACK_TO_BACK_INTENSITY");
  assert.ok(sequence.matches[1]!.pacingModifier<0);
  assert.ok(sequence.matches[2]!.pacingModifier<0);
  assert.ok(sequence.crowdResponsePacingOnly<sequence.basePacingCrowd);
});
test("a genuine post-main-event breather rewards thoughtful match ordering",()=>{
  const card=evaluateArchivedMatchPacing([
    make("opening",0,"EPIC"),make("rest",2,"PROTECTIVE"),
    make("main",4,"EPIC"),
  ]);
  assert.equal(card.matches[1]!.pacingReason,"BREATHER");
  assert.ok(card.matches[1]!.pacingModifier>0);
});
test("explicit dimensional style controls intensity and style similarity, not intent labels",()=>{
  const style:MatchStyleProfile={
    competitiveness:45,technical:58,story:40,intensity:52,risk:12,epic:30,
  };
  const repeated=evaluateArchivedMatchPacing([
    make("a",0,"COMPETITIVE",70,style),
    make("b",1,"PROTECTIVE",70,{...style,intensity:53}),
  ]);
  assert.equal(repeated.matches[1]!.pacingReason,"REPEATED_STYLE");
  assert.ok(repeated.matches[1]!.pacingModifier<0);
  const different=evaluateArchivedMatchPacing([
    make("a",0,"COMPETITIVE",70,style),
    make("b",1,"PROTECTIVE",70,{...style,technical:0,risk:100,epic:100,intensity:98}),
  ]);
  assert.notEqual(different.matches[1]!.pacingReason,"REPEATED_STYLE");
  const legacy=evaluateArchivedMatchPacing([
    make("a",0,"COMPETITIVE"),make("b",1,"COMPETITIVE"),
  ]);
  assert.equal(legacy.matches[1]!.pacingReason,"REPEATED_INTENT");
});
test("preserved historical segment weight uses 0.65 each without manufacturing segment scores",()=>{
  const card=[make("first",0,"COMPETITIVE",50),make("main",3,"EPIC",90)];
  const unknown=evaluateArchivedMatchPacing(card);
  assert.equal(unknown.segments,"NOT_PROJECTED");
  const delivered=evaluateArchivedMatchPacing(card,[{position:2,crowdResponse:30}]);
  assert.equal(delivered.segments,"PROVIDED");
  const weights=delivered.matches.map(m=>m.weight);
  assert.deepEqual(weights,[1,1.26]);
  const base=Math.round(((50*1+90*1.26+30*0.65)/(1+1.26+0.65))*10)/10;
  assert.equal(delivered.basePacingCrowd,base);
  assert.notEqual(delivered.basePacingCrowd,unknown.basePacingCrowd);
  assert.deepEqual(evaluateArchivedMatchPacing(card,[{position:2,crowdResponse:30}]),delivered);
});
test("pacing rejects invalid finished-card inputs, never hides missing crowd or scripts",()=>{
  assert.throws(()=>evaluateArchivedMatchPacing([]),/1-100 matches/);
  assert.throws(()=>evaluateArchivedMatchPacing([make("a",0,"STORY",NaN)]),
    /Invalid resolved match/);
  assert.throws(()=>evaluateArchivedMatchPacing([make("a",0,"STORY",-1)]),
    /Invalid resolved match/);
  assert.throws(()=>evaluateArchivedMatchPacing([
    make("a",0,"STORY"),make("a",1,"EPIC"),
  ]),/Invalid resolved match/);
  assert.throws(()=>evaluateArchivedMatchPacing([
    make("a",0,"STORY"),make("b",0,"EPIC"),
  ]),/Invalid resolved match/);
  assert.throws(()=>evaluateArchivedMatchPacing([
    make("a",0,"STORY"),
  ],[{position:2,crowdResponse:Infinity}]),/Invalid recorded segment crowd/);
  assert.throws(()=>evaluateArchivedMatchPacing([
    make("a",0,"STORY",70,{
      competitiveness:99,technical:65,story:60,intensity:101,risk:40,epic:40,
    }),
  ]),/Invalid explicit match style/);
});
