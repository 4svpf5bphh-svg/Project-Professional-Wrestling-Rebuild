/** Fair, zero-query comparisons: only samples of the same certified show.
 * All runs are already scoped to the authenticated lab owner in SQL.
 * Failed calls with missing usage are NEVER treated as free.
 */
import {estimateTerraStandardUsd} from "./paid-editorial-cost.js";
export type SameShowSample={
 show_id:string;show_name:string;provider:"GROQ"|"OPENAI";model:string;
 created_at:string;status?:"READY"|"FAILED";rating:number|null;
 provider_calls:number;input_tokens:number|null;output_tokens:number|null;
};
export type SameShowProviderResult={
 provider:"GROQ"|"OPENAI";models:string[];
 attempts:number;accepted:number;failed:number;
 rated:number;averageRating:number|null;providerCalls:number;
 measured:number;inputTokens:number;outputTokens:number;
 knownUsd:number|null;hasUnreportedCosts:boolean;
};
export type SameShowComparison={
 showId:string;showName:string;latest:string;
 groq:SameShowProviderResult;terra:SameShowProviderResult;
};
function summarizeProvider(runs:SameShowSample[],
 provider:"GROQ"|"OPENAI"):SameShowProviderResult{
 const subset=runs.filter(x=>x.provider===provider);
 const accepted=subset.filter(x=>x.status!=="FAILED");
 const ratings=accepted.map(x=>x.rating).filter(
  (value):value is number=>typeof value==="number"&&Number.isFinite(value));
 const measured=subset.filter(x=>x.input_tokens!==null&&x.output_tokens!==null);
 const price=provider==="OPENAI"?measured.reduce((sum,x)=>
  sum+(estimateTerraStandardUsd(x.input_tokens,x.output_tokens)??0),0):null;
 return {provider,models:[...new Set(subset.map(x=>x.model))],
  attempts:subset.length,accepted:accepted.length,
  failed:subset.length-accepted.length,rated:ratings.length,
  averageRating:ratings.length?ratings.reduce((sum,n)=>sum+n,0)/ratings.length:null,
  providerCalls:subset.reduce((sum,x)=>sum+x.provider_calls,0),
  measured:measured.length,
  inputTokens:measured.reduce((sum,x)=>sum+x.input_tokens!,0),
  outputTokens:measured.reduce((sum,x)=>sum+x.output_tokens!,0),
  knownUsd:price,hasUnreportedCosts:measured.length<subset.length};
}
export function sameShowComparisons(runs:SameShowSample[]):SameShowComparison[]{
 const byShow=new Map<string,SameShowSample[]>();
 for(const run of runs){
  if(!run.show_id||!run.created_at||
   !["GROQ","OPENAI"].includes(run.provider))continue;
  const group=byShow.get(run.show_id)??[];
  group.push(run);byShow.set(run.show_id,group);
 }
 const pairs:SameShowComparison[]=[];
 for(const [showId,group] of byShow){
  if(!group.some(x=>x.provider==="GROQ")||
   !group.some(x=>x.provider==="OPENAI"))continue;
  const ordered=[...group].sort((a,b)=>b.created_at.localeCompare(a.created_at));
  pairs.push({showId,showName:ordered[0]!.show_name,
   latest:ordered[0]!.created_at,groq:summarizeProvider(group,"GROQ"),
   terra:summarizeProvider(group,"OPENAI")});
 }
 return pairs.sort((a,b)=>b.latest.localeCompare(a.latest)).slice(0,6);
}
