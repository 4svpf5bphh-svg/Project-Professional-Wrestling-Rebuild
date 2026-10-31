import test from "node:test";
import assert from "node:assert/strict";
import {newEditorMatch,buildBookedMatch,restoreEditorMatch}
 from "../src/ui/card-editor-model.js";
import {normalizeBookableMatch} from "../src/domain/bookable-match.js";
import {readCanonicalMatchLayout,requireSupportedScoringLayout}
 from "../src/domain/match-sides.js";

test("2v2v2 tag championship survives normalise, save, restore and canonical projection",()=>{
 const draft=newEditorMatch("tag-three-way","MULTI_TEAM");
 assert.deepEqual(draft.teams.map(x=>x.length),[2,2,2]);
 draft.championshipId="founding:tag";
 draft.teams=[0,1,2].map(side=>[0,1].map(member=>({
  personId:"person-"+(side*2+member),contractId:"contract-"+(side*2+member)
 })));
 draft.winnerSide=2;
 const booked=buildBookedMatch(draft);
 assert.equal(booked.championshipId,"founding:tag");
 assert.equal(booked.scriptedWinnerSide,"C");
 assert.equal(booked.family,"TEAMS");
 assert.equal(booked.sides.length,3);
 assert.equal(requireSupportedScoringLayout(readCanonicalMatchLayout(booked)),"MULTI_TEAM");
 assert.deepEqual(restoreEditorMatch("slot",booked).teams,draft.teams);
 const normalized=normalizeBookableMatch(booked);
 assert.equal(normalized.championshipId,"founding:tag");
 assert.equal(normalized.scriptedWinnerSide,"C");
});
test("a 3v3v3 or multi-side battle royal cannot accidentally claim a tag championship",()=>{
 const larger=newEditorMatch("large-team","MULTI_TEAM");
 larger.teams=larger.teams.map((x,i)=>[0,1,2].map(j=>({
  personId:"person-"+(i*3+j),contractId:"contract-"+(i*3+j)
 })));
 larger.championshipId="founding:tag";
 assert.throws(()=>buildBookedMatch(larger),/Unsupported championship format/);
 const short=newEditorMatch("battle","BATTLE_ROYAL");
 short.championshipId="founding:tag";
 assert.throws(()=>buildBookedMatch(short),/Unsupported championship format/);
});
