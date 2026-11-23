/** OpenAI API failures are data, never instructions. Neither error text nor
 * user prompts may be copied into PPW logs or the AI Lab. Keep an allowlist
 * of documented provider codes; unknown responses remain unknown.
 */
export type OpenAiErrorKind=
 "CREDITS"|"SPEND_LIMIT"|"USAGE_LIMIT"|"RATE_LIMIT"|
 "AUTH"|"MODEL_ACCESS"|"INVALID_REQUEST"|"UNKNOWN_429"|"OTHER";
export type OpenAiErrorDiagnosis={
 kind:OpenAiErrorKind;code:string|null;definiteRejection:boolean;
};
const credits=new Set(["credit_balance_exhausted","insufficient_quota"]);
const spend=new Set(["organization_spend_limit_exceeded",
 "project_spend_limit_exceeded","billing_hard_limit_reached"]);
const usageLimit=new Set(["organization_usage_limit_exceeded"]);
const rate=new Set(["rate_limit_exceeded","slow_down"]);
const model=new Set(["model_not_found","model_access_denied"]);
const invalid=new Set(["invalid_request_error","unsupported_parameter",
 "context_length_exceeded"]);
const allowed=new Set([...credits,...spend,...usageLimit,...rate,...model,
 ...invalid,"invalid_api_key","permission_denied"]);
function object(value:unknown):Record<string,unknown>|null{
 return value&&typeof value==="object"&&!Array.isArray(value)?
  value as Record<string,unknown>:null;
}
export function classifyOpenAiProviderError(status:number,payload:unknown):
 OpenAiErrorDiagnosis{
 const error=object(object(payload)?.error);
 // Never return unrecognised error strings: API error messages can echo
 // private prompts, app data, or bearer credentials.
 const rawCode=error?.code;
 const code=typeof rawCode==="string"&&allowed.has(rawCode)?rawCode:null;
 const type=typeof error?.type==="string"&&allowed.has(error.type)?
  error.type:null;
 if(status===429){
  if(spend.has(code??"")||spend.has(type??""))
   return {kind:"SPEND_LIMIT",code,definiteRejection:true};
  if(usageLimit.has(code??"")||usageLimit.has(type??""))
   return {kind:"USAGE_LIMIT",code,definiteRejection:true};
  if(credits.has(code??"")||credits.has(type??""))
   return {kind:"CREDITS",code,definiteRejection:true};
  if(rate.has(code??"")||rate.has(type??"")||error?.type==="rate_limit_error")
   return {kind:"RATE_LIMIT",code,definiteRejection:true};
  return {kind:"UNKNOWN_429",code,definiteRejection:false};
 }
 if((status===403||status===404)&&model.has(code??""))
  return {kind:"MODEL_ACCESS",code,definiteRejection:true};
 if((status===401||status===403)&&error)
  return {kind:"AUTH",code,definiteRejection:true};
 if(status===400&&error&&(code||error.type==="invalid_request_error"))
  return {kind:"INVALID_REQUEST",code,definiteRejection:true};
 return {kind:"OTHER",code,definiteRejection:false};
}
/** A retry delay exists only when the provider actually supplied it. */
export function readOpenAiRetryAfter(headers:Pick<Headers,"get">):number|null{
 const text=headers.get("retry-after");
 if(!text||!/^([1-9]\d{0,3})$/.test(text))return null;
 const n=Number(text);
 return Number.isSafeInteger(n)&&n<=1800?n:null;
}
/** Provider-owned 4xx rejections do not run a model completion. Do not consume
 * PPW's pessimistic monthly MONEY allowance when rejection is confirmed.
 * Daily request counts remain, preventing unlimited free blind retries.
 */
export function refundKnownProviderRejection(responseOk:boolean,
 usageKnown:boolean,diagnosis:OpenAiErrorDiagnosis|null):boolean{
 return !responseOk&&!usageKnown&&diagnosis?.definiteRejection===true;
}
