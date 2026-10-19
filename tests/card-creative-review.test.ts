import test from "node:test";
import assert from "node:assert/strict";
import {creativeForSlot,consentRebookingAdvice} from "../src/ui/card-creative-review.js";
import type {CreativeConcern} from "../src/domain/match-creative-consent.js";
const make=(slotId:string,decision:CreativeConcern["decision"],
 reason:CreativeConcern["reason"],approvalSource?:CreativeConcern["approvalSource"]):CreativeConcern=>({
 showId:"weekly",slotId,personId:"a",contractId:"deal",name:"Alice",
 reason,decision,approvalSource,requiresConsent:reason!=="CONSULTATION_REQUESTED",
 signature:"abc"
});
test("Consent follows the right match slot, not another match",()=>{
 const rows=[make("main","APPROVED","MATCH_APPROVAL","STANDING_PROGRAMME"),
 make("main","NOT_REQUESTED","PROTECTED_LOSS"),
 make("other","DECLINED","PROTECTED_LOSS")];
 assert.equal(creativeForSlot("main",rows,false).approved,1);
 assert.equal(creativeForSlot("main",rows,false).unanswered,1);
 assert.equal(creativeForSlot("main",rows,false).coveredByProgramme,1);
 assert.equal(creativeForSlot("other",rows,false).declined,1);
 assert.equal(creativeForSlot("unused",rows,false).required,0);
});

test("Unsaved changes require a new saved-card check",()=>{
 const rows=[make("main","APPROVED","MATCH_APPROVAL","EXACT_MATCH")];
 assert.equal(creativeForSlot("main",rows,true).label,"Recheck after saving");
 assert.equal(creativeForSlot("main",rows,true).needsSavedReview,true);
 assert.equal(creativeForSlot("main",rows,false).label,"Creative terms agreed");
});
test("Declined protected losses guide, but never rewrite a finish",()=>{
 const a=make("main","DECLINED","PROTECTED_LOSS");
 assert.match(consentRebookingAdvice(a,"SUBMISSION")!,/different finish/);
 assert.equal(consentRebookingAdvice({...a,decision:"APPROVED"},"SUBMISSION"),null);
 assert.match(consentRebookingAdvice(make("main","DECLINED","MATCH_APPROVAL"),
 "CLEAN_PIN")!,/declined/);
});
