import test from "node:test";
import assert from "node:assert/strict";
import {newEditorMatch,assignPerformer} from "../src/ui/card-editor-model.js";
import {previewMatchCreativeTerms} from "../src/ui/card-creative-term-preview.js";
const person=(personId:string)=>({personId,contractId:"deal-"+personId});
function singles(){
 let match=newEditorMatch("bout","SINGLES");
 match=assignPerformer(match,0,0,person("a"));
 return assignPerformer(match,1,0,person("b"));
}
test("full approval warns without assuming an agreement",()=>{
 const match=singles();
 const roster=new Map([["a",{name:"Star A",creativeControl:"FULL_APPROVAL"}]]);
 const notes=previewMatchCreativeTerms(match,roster);
 assert.equal(notes.length,1);
 assert.equal(notes[0]!.kind,"APPROVAL");
 assert.match(notes[0]!.message,/approval is not assumed/i);
 assert.equal(match.winnerSide,0);
});
test("protected finishes and consultation only apply to clean losers",()=>{
 const match=singles();
 const roster=new Map([
  ["a",{name:"Star A",creativeControl:"CONSULTATION"}],
  ["b",{name:"Star B",creativeControl:"PROTECTED_FINISHES"}]
 ]);
 assert.deepEqual(previewMatchCreativeTerms(match,roster).map(x=>x.kind),["PROTECTION"]);
 assert.equal(previewMatchCreativeTerms({...match,winnerSide:1},roster)[0]?.kind,
  "CONSULTATION");
 assert.deepEqual(previewMatchCreativeTerms({...match,plannedFinish:"DISQUALIFICATION"},
  roster),[]);
});
test("unknown, absent or none creative terms never produce fabricated warnings",()=>{
 assert.deepEqual(previewMatchCreativeTerms(singles(),new Map()),[]);
 const roster=new Map([["a",{name:"Star A",creativeControl:"NONE"}],
  ["b",{name:"Star B",creativeControl:"UNKNOWN"}]]);
 assert.deepEqual(previewMatchCreativeTerms(singles(),roster),[]);
});
