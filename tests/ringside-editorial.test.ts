import {test} from "node:test";
import assert from "node:assert/strict";
import {ringsideFacts,ringsideBrief,recoverRingsideCopy,removeVerbatimRecapEchoes,validateRingsideCopy,RINGSIDE_STYLE_GUIDE,ringsideStipulationNote,RINGSIDE_PROMPT_VERSION} from "../src/domain/ringside-editorial.js";
import type {CompletedShowView} from "../src/db/show-results-view.js";
const example:CompletedShowView={showId:"show-1",showName:"Omega Night",year:1,week:1,
 crowdResponse:83,matchCount:1,angleCount:1,entries:[
  {slotId:"match-1",position:0,type:"MATCH",headline:"Kenny Omega wins",
   summary:"Certified clean pin",outcome:"CLEAN_PIN",crowdResponse:88,actorIds:["omega","x"],targetIds:[],
   matchContext:{format:"SINGLES",intent:"COMPETITIVE",plannedMinutes:18,sides:[["Kenny Omega"],["Opponent"]],
    winnerNames:["Kenny Omega"],championshipContested:false},
   fallout:{ratingStars:4.25,actualMinutes:17,injuries:[],eliminations:[]},
   performerIdentities:[{personId:"omega",ringName:"Kenny Omega",character:"THE CLEANER",
    style:"ALL_ROUNDER",signatureMoves:["V-Trigger","Snap Dragon Suplex"],
    finishingMoves:["One Winged Angel"],source:"WORLD_RECORD"}]},
  {slotId:"angle-1",position:1,type:"SEGMENT",headline:"A challenge",
   summary:"A challenge happened",outcome:"HAPPENS",crowdResponse:78,
   actorIds:[],targetIds:[],segmentKind:"PROMO"}
 ]};
const valid={showHeadline:"A proper closer",opening:"The audience arrived ready.",
 closing:"An excellent night with a few rough edges.",
 slots:[{slotId:"match-1",headline:"Omega prevails",recap:"A V-Trigger opens the door to the One Winged Angel and a clean pin."},
 {slotId:"angle-1",headline:"The challenge",recap:"The speech left the crowd wanting an answer."}]};
test("facts include all ordered, verified results, moves and certified rating",()=>{
 const packet=ringsideFacts(example);assert.equal(packet.slots.length,2);
 assert.equal(packet.slots[0]?.match?.winnerNames[0],"Kenny Omega");
 assert.equal(packet.slots[0]?.wrestlers[0]?.finishers[0],"One Winged Angel");
 assert.equal(packet.slots[0]?.fallout?.ratingStars,4.25);
});
test("Ringside admits creative wrestling spots but never changes slot ordering",()=>{
 assert.equal(validateRingsideCopy(valid,example).slots.length,2);
 assert.match(RINGSIDE_STYLE_GUIDE,/FLASH_PIN/);
 assert.match(RINGSIDE_STYLE_GUIDE,/Coquina Clutch/);
 assert.throws(()=>validateRingsideCopy({...valid,slots:[...valid.slots].reverse()},example));
 assert.throws(()=>validateRingsideCopy({...valid,slots:[{...valid.slots[0],slotId:"forged"},valid.slots[1]]},example));
 assert.throws(()=>validateRingsideCopy({...valid,slots:[valid.slots[0]]},example));
 assert.throws(()=>validateRingsideCopy({...valid,slots:[{...valid.slots[0],recap:"<script>"},valid.slots[1]]},example));
});
test("Invented consequential events and wrong official finishes fail closed",()=>{
 const forgedTitle={...valid,slots:[{...valid.slots[0],recap:"Omega captured the world title tonight."},valid.slots[1]]};
 assert.throws(()=>validateRingsideCopy(forgedTitle,example),/championship/);
 const forgedMedical={...valid,slots:[{...valid.slots[0],recap:"Joe was stretchered out."},valid.slots[1]]};
 assert.throws(()=>validateRingsideCopy(forgedMedical,example),/medical/);
 const forgedInterference={...valid,slots:[{...valid.slots[0],recap:"Outside interference won the match."},valid.slots[1]]};
 assert.throws(()=>validateRingsideCopy(forgedInterference,example),/interference/);
 const badFinish={...valid,slots:[{...valid.slots[0],recap:"Omega won by submission."},valid.slots[1]]};
 assert.throws(()=>validateRingsideCopy(badFinish,example),/submission/);
});
test("Move ownership is protected across the whole show",()=>{
 const wrong={...valid,slots:[valid.slots[0],{...valid.slots[1],recap:"The One Winged Angel ended the promo."}]};
 assert.throws(()=>validateRingsideCopy(wrong,example),/unowned/);
 const aired={...valid,slots:[{...valid.slots[0],
  recap:"Omega sealed the clean win with his One‑Winged Angel."},valid.slots[1]]};
 assert.deepEqual(validateRingsideCopy(aired,example).slots[0]?.recap,aired.slots[0]?.recap);
 for(const wrongMove of ["One-Winged Angel","One‑Winged Angel","ONE—WINGED ANGEL"]){
  const misattributed={...valid,slots:[valid.slots[0],
   {...valid.slots[1],recap:"The "+wrongMove+" ended the interview."}]};
  assert.throws(()=>validateRingsideCopy(misattributed,example),/unowned/);
 }
});

test("Ringside rejects identical long prose across separate matches",()=>{
 const repeated="For a few seconds it felt as though every person in the building was willing the match to continue.";
 const duplicated={...valid,slots:[
  {...valid.slots[0],recap:repeated},
  {...valid.slots[1],recap:repeated}
 ]};
 assert.throws(()=>validateRingsideCopy(duplicated,example),/repeated a full sentence/);
 assert.deepEqual(validateRingsideCopy(valid,example),valid);
});
test("Ringside rejects simulation labels and score numbers",()=>{
 assert.throws(()=>validateRingsideCopy({...valid,slots:[{
  ...valid.slots[0],recap:"Omega got an 84/100 reaction score."
 },valid.slots[1]]},example),/terminology|score/);
 assert.throws(()=>validateRingsideCopy({...valid,slots:[{
  ...valid.slots[0],recap:"The crowd loved it with a 92% crowd reaction."
 },valid.slots[1]]},example),/numerical score/);

 assert.throws(()=>validateRingsideCopy({...valid,opening:"The crowd score was 71.9."},example),/terminology|numerical score/);
 assert.throws(()=>validateRingsideCopy({...valid,slots:[
  {...valid.slots[0],recap:"Omega claimed a protected finish."},valid.slots[1]]},example),/terminology/);
});

test("Long-form Ringside permits paragraphs but not unbounded content",()=>{
 const prose="Omega set up the One Winged Angel with a V-Trigger. ".repeat(12);
 const article={...valid,slots:[{...valid.slots[0],recap:prose+"\n\n"+prose},valid.slots[1]]};
 assert.ok(validateRingsideCopy(article,example).slots[0]?.recap.includes("\n\n"));
 const giant={...valid,slots:[{...valid.slots[0],recap:"x".repeat(1801)},valid.slots[1]]};
 assert.throws(()=>validateRingsideCopy(giant,example));
 assert.match(RINGSIDE_STYLE_GUIDE,/90–150 words/);
});

test("Ringside rejects a loser being reported as the victor",()=>{
 const inverted={...valid,slots:[{...valid.slots[0],
  recap:"Opponent pinned Kenny Omega after the V-Trigger to win."},valid.slots[1]]};
 assert.throws(()=>validateRingsideCopy(inverted,example),/winner/);
});

test("a six-slot article retains five AI recaps and replaces one false submission",()=>{
 const many:CompletedShowView={...example,entries:Array.from({length:6},(_,i)=>({
  ...example.entries[0]!,slotId:"m"+i,position:i
 }))};
 const candidate={...valid,slots:many.entries.map((s,i)=>({
  slotId:s.slotId,headline:"Omega survives the bout",
  recap:i===3?"Omega won by submission.":
   "Encounter "+(i+1)+" ended after a V-Trigger and the One Winged Angel scored a clean pin."
 }))};
 const result=recoverRingsideCopy(candidate,many);
 assert.equal(result?.replaced,1);
 assert.equal(result?.review.slots[2]?.recap,candidate.slots[2]?.recap);
 assert.ok(!result?.review.slots[3]?.recap.includes("submission"));
 assert.ok(JSON.stringify(ringsideBrief(many)).length<JSON.stringify(ringsideFacts(many)).length);
 assert.doesNotMatch(JSON.stringify(ringsideBrief(many)),/crowd":(?:[0-9]+)/);
 assert.ok(ringsideBrief(many).slots.every(s=>typeof s.audienceMood==="string"));
 const allBad={...candidate,slots:candidate.slots.map(s=>({...s,recap:"Omega won by submission."}))};
 assert.equal(recoverRingsideCopy(allBad,many),null);
});

test("repeat sentences are discarded while distinct editorial observations survive",()=>{
 const prose="A big boot flattened the challenger. The crowd rose to its feet.\n\n"+
  "A big boot flattened the challenger. The referee looked impressed.";
 const clean=removeVerbatimRecapEchoes(prose);
 assert.equal(clean.match(/A big boot flattened/g)?.length,1);
 assert.match(clean,/referee looked impressed/);
});


test("Phase 38 Ringside knows the I Quit and Cage rules without additional calls",()=>{
 assert.equal(RINGSIDE_PROMPT_VERSION,"ringside-v8");
 assert.match(ringsideStipulationNote("I Quit Match · SINGLES")!.winningCondition,/VERBALLY/);
 assert.match(ringsideStipulationNote("Steel Cage · SINGLES")!.plausibleAction,/Steel mesh/);
 const quit:CompletedShowView={...example,entries:[{
  ...example.entries[0]!,outcome:"VERBAL_SURRENDER",
  matchContext:{...example.entries[0]!.matchContext!,format:"I Quit Match · SINGLES"}
 },example.entries[1]!]};
 assert.equal(ringsideBrief(quit).slots[0]!.match!.stipulationRules!.stipulation,"I_QUIT");
 const spoken={...valid,slots:[{...valid.slots[0],
  recap:"Omega stretched the hold as the referee raised the microphone. The challenger verbally surrendered."},
  valid.slots[1]]};
 assert.doesNotThrow(()=>validateRingsideCopy(spoken,quit));
 assert.throws(()=>validateRingsideCopy({...spoken,slots:[{
  ...spoken.slots[0],recap:"The challenger tapped out to end it."},spoken.slots[1]]},quit),
  /verbal surrender/);
 const cage:CompletedShowView={...example,entries:[{
  ...example.entries[0]!,
  matchContext:{...example.entries[0]!.matchContext!,format:"Steel Cage · SINGLES"}
 },example.entries[1]!]};
 assert.throws(()=>validateRingsideCopy({...valid,slots:[{...valid.slots[0],
  recap:"Kenny Omega escaped the cage for the win."},valid.slots[1]]},cage),/Cage escape/);
 assert.equal(ringsideStipulationNote("SINGLES"),null);
});

test("Wrestling IQ supplies legal singles, tags and multi-party rules without a provider call",()=>{
 const singles=ringsideBrief(example).slots[0]!.match!.wrestlingIQ!;
 assert.equal(singles.format,"SINGLES");
 assert.equal(singles.tempo,"STANDARD");
 assert.match(RINGSIDE_STYLE_GUIDE,/No tags or tag partners|Do not insert a tag or a tag partner/);
 const team={...example.entries[0]!,matchContext:{
  ...example.entries[0]!.matchContext!,format:"2v2",sides:[
   ["The Gunns' Austin","The Gunns' Colten"],["FTR's Dax","FTR's Cash"]],
  winnerNames:["The Gunns' Austin","The Gunns' Colten"]}};
 const tag:CompletedShowView={...example,entries:[team,example.entries[1]!]};
 const tagIQ=ringsideBrief(tag).slots[0]!.match!.wrestlingIQ!;
 assert.equal(tagIQ.format,"TAG");
 assert.equal(tagIQ.competitors,4);
 assert.match(tagIQ.storyCue,/do not force a hot tag/);
 assert.match(RINGSIDE_STYLE_GUIDE,/only one wrestler PER TEAM is legal/);
 const trios={...team,matchContext:{...team.matchContext,format:"3v3",
  sides:[["A","B","C"],["D","E","F"]],winnerNames:["A","B","C"]}};
 assert.equal(ringsideBrief({...tag,entries:[trios]}).slots[0]!.match!.wrestlingIQ!.format,"TAG");
 const many={...team,matchContext:{...team.matchContext,format:"3-team 2v2",
  sides:[["A","B"],["C","D"],["E","F"]],winnerNames:["A","B"]}};
 assert.equal(ringsideBrief({...tag,entries:[many]}).slots[0]!.match!.wrestlingIQ!.format,"MULTI_TEAM");
 const triple={...team,matchContext:{...team.matchContext,format:"TRIPLE-WAY",
  sides:[["A"],["B"],["C"]],winnerNames:["A"]}};
 const iq=ringsideBrief({...tag,entries:[triple]}).slots[0]!.match!.wrestlingIQ!;
 assert.equal(iq.format,"MULTI_PERSON");
 assert.match(RINGSIDE_STYLE_GUIDE,/there are NO tags/);
 const battle={...team,matchContext:{...team.matchContext,format:"BATTLE ROYAL",
  sides:Array.from({length:12},(_,i)=>["Competitor "+i]),winnerNames:["Competitor 0"]}};
 const ringIQ=ringsideBrief({...tag,entries:[battle]}).slots[0]!.match!.wrestlingIQ!;
 assert.equal(ringIQ.format,"BATTLE_ROYAL");
 assert.equal(ringIQ.competitors,12);
 assert.match(RINGSIDE_STYLE_GUIDE,/For EVERY match/);
});
test("Ringside rejects proven invalid tag mechanics but not an optional hot tag",()=>{
 const entry=example.entries[0]!;
 const bad={...valid,slots:[{...valid.slots[0],
  recap:"Kenny Omega made the hot tag before landing the One Winged Angel."},valid.slots[1]]};
 assert.throws(()=>validateRingsideCopy(bad,example),/tag-team mechanics/);
 const tag={...entry,matchContext:{...entry.matchContext!,format:"2v2",
  sides:[["Kenny Omega","Matt Jackson"],["Opponent","Partner"]],
  winnerNames:["Kenny Omega","Matt Jackson"]}};
 const card:CompletedShowView={...example,entries:[tag,example.entries[1]!]};
 const invalid={...valid,slots:[{...valid.slots[0],
  recap:"Both team partners were legal throughout, and Omega pinned the opponent."},valid.slots[1]]};
 assert.throws(()=>validateRingsideCopy(invalid,card),/tag-team legality/);
 const good={...valid,slots:[{...valid.slots[0],
  recap:"Omega reached his corner for a tag. A burst of offence set up a legal cover for their team."},valid.slots[1]]};
 assert.doesNotThrow(()=>validateRingsideCopy(good,card));
 const noHot={...valid,slots:[{...valid.slots[0],
  recap:"The winners cut off the ring and settled the contest before their opponents could build momentum."},valid.slots[1]]};
 assert.doesNotThrow(()=>validateRingsideCopy(noHot,card));
});
