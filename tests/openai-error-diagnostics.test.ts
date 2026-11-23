import {test} from "node:test";
import assert from "node:assert/strict";
import {classifyOpenAiProviderError,readOpenAiRetryAfter,
 refundKnownProviderRejection} from "../src/domain/openai-error-diagnostics.js";
test("OpenAI distinguishes credits, organisation spend, usage and pacing within 429",()=>{
 const check=(code:string,type="rate_limit_error")=>
  classifyOpenAiProviderError(429,{error:{code,type,message:"not for display"}});
 assert.equal(check("credit_balance_exhausted","insufficient_quota").kind,"CREDITS");
 assert.equal(check("insufficient_quota","insufficient_quota").kind,"CREDITS");
 assert.equal(check("organization_spend_limit_exceeded").kind,"SPEND_LIMIT");
 assert.equal(check("project_spend_limit_exceeded").kind,"SPEND_LIMIT");
 assert.equal(check("organization_usage_limit_exceeded").kind,"USAGE_LIMIT");
 assert.equal(check("rate_limit_exceeded").kind,"RATE_LIMIT");
 assert.equal(check("slow_down").kind,"RATE_LIMIT");
 const noCode=classifyOpenAiProviderError(429,{error:{type:"insufficient_quota"}});
 assert.equal(noCode.kind,"CREDITS");
 assert.equal(noCode.code,null);
});
test("Unknown 429 never becomes an invented minute-long rate limit",()=>{
 const result=classifyOpenAiProviderError(429,{error:{
  code:"sk-secret-totally-custom",message:"Private show script and secret"
 }});
 assert.equal(result.kind,"UNKNOWN_429");
 assert.equal(result.code,null);
 assert.equal(result.definiteRejection,false);
 assert.doesNotMatch(JSON.stringify(result),/Private|secret|script/);
 assert.equal(readOpenAiRetryAfter(new Headers()),null);
 assert.equal(readOpenAiRetryAfter(new Headers({"retry-after":"60"})),60);
 assert.equal(readOpenAiRetryAfter(new Headers({"retry-after":"x60"})),null);
 assert.equal(readOpenAiRetryAfter(new Headers({"retry-after":"3601"})),null);
});
test("Provider rejection refunds safe reservations but ambiguous failures do not",()=>{
 const credit=classifyOpenAiProviderError(429,{error:{
  code:"credit_balance_exhausted",type:"insufficient_quota"}});
 const unknown=classifyOpenAiProviderError(429,{});
 assert.equal(refundKnownProviderRejection(false,false,credit),true);
 assert.equal(refundKnownProviderRejection(false,false,unknown),false);
 assert.equal(refundKnownProviderRejection(false,true,credit),false);
 assert.equal(refundKnownProviderRejection(true,false,credit),false);
 assert.equal(refundKnownProviderRejection(false,false,null),false);
 assert.equal(classifyOpenAiProviderError(400,{error:{
  code:"unsupported_parameter",type:"invalid_request_error"}}).kind,"INVALID_REQUEST");
 assert.equal(classifyOpenAiProviderError(401,{error:{
  code:"invalid_api_key"}}).kind,"AUTH");
});
