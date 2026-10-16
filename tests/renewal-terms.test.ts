import test from "node:test";
import assert from "node:assert/strict";
import {sameTermsRenewal,type RenewalContract} from "../src/domain/renewal-terms.js";
const base:RenewalContract={
 family:"EXCLUSIVE",status:"SIGNED",startWeekIndex:0,expiresWeekIndex:25,
 dateEntitlement:26,weeklyGuarantee:5000,appearanceFee:2500,
 roleExpectation:"MAIN_EVENT",creativeControl:"CONSULTATION"
};
test("same terms retain recurring fees and exclude historical signing bonus",()=>{
 assert.deepEqual(sameTermsRenewal(base),{
 family:"EXCLUSIVE",termWeeks:26,dateEntitlement:26,weeklyGuarantee:5000,
 appearanceFee:2500,roleExpectation:"MAIN_EVENT",creativeControl:"CONSULTATION",signingBonus:0
 });
});
test("limited dates stay limited while exclusive retains its term entitlement",()=>{
 assert.equal(sameTermsRenewal({...base,family:"LIMITED_NON_EXCLUSIVE",
 expiresWeekIndex:12,dateEntitlement:6})?.dateEntitlement,6);
 assert.equal(sameTermsRenewal({...base,dateEntitlement:10})?.dateEntitlement,26);
});
test("one-offs, expired, irregular and invalid financial terms require manual handling",()=>{
 assert.equal(sameTermsRenewal({...base,family:"ONE_OFF"}),null);
 assert.equal(sameTermsRenewal({...base,status:"EXPIRED"}),null);
 assert.equal(sameTermsRenewal({...base,expiresWeekIndex:9}),null);
 assert.equal(sameTermsRenewal({...base,weeklyGuarantee:-1}),null);
 assert.equal(sameTermsRenewal({...base,appearanceFee:NaN}),null);
});
