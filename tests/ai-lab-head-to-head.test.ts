import {test} from "node:test";
import assert from "node:assert/strict";
import {sameShowComparisons,type SameShowSample}
 from "../src/domain/ai-lab-head-to-head.js";
const base={show_id:"ascension-w29",show_name:"Ascension",created_at:"2026-11-23T18:00:00Z",
 provider_calls:1,input_tokens:5014,output_tokens:1768,rating:4} as const;
test("Only identical show IDs compare; rejected and unmetered calls count",()=>{
 const runs:SameShowSample[]=[
  {...base,provider:"GROQ",model:"openai/gpt-oss-120b",status:"READY"},
  {...base,provider:"GROQ",model:"openai/gpt-oss-120b",
   status:"FAILED",rating:null,input_tokens:null,output_tokens:null,provider_calls:2},
  {...base,provider:"OPENAI",model:"gpt-6.1-terra",status:"READY",rating:5,
   input_tokens:5100,output_tokens:1900},
  {...base,show_id:"another-show",provider:"OPENAI",model:"gpt-6.1-terra",
   status:"READY",rating:5},
  {...base,show_id:"second-unpaired",provider:"GROQ",model:"openai/gpt-oss-20b",
   status:"READY",rating:2}
 ];
 const pairs=sameShowComparisons(runs);
 assert.equal(pairs.length,1);
 assert.equal(pairs[0]?.showId,"ascension-w29");
 assert.equal(pairs[0]?.groq.accepted,1);
 assert.equal(pairs[0]?.groq.failed,1);
 assert.equal(pairs[0]?.groq.providerCalls,3);
 assert.equal(pairs[0]?.groq.measured,1);
 assert.equal(pairs[0]?.groq.hasUnreportedCosts,true);
 assert.equal(pairs[0]?.groq.averageRating,4);
 assert.equal(pairs[0]?.terra.accepted,1);
 assert.equal(pairs[0]?.terra.averageRating,5);
 assert.equal(pairs[0]?.terra.knownUsd,0.0146);
 assert.equal(pairs[0]?.terra.hasUnreportedCosts,false);
});
test("Unknown Terra usage never appears as zero-dollar spend",()=>{
 const rows:SameShowSample[]=[
  {...base,provider:"GROQ",model:"openai/gpt-oss-120b",status:"READY"},
  {...base,provider:"OPENAI",model:"gpt-6.1-terra",
   status:"FAILED",rating:null,input_tokens:null,output_tokens:null}
 ];
 const pair=sameShowComparisons(rows)[0]!;
 assert.equal(pair.terra.knownUsd,null);
 assert.equal(pair.terra.hasUnreportedCosts,true);
 assert.equal(pair.terra.failed,1);
});
test("Same-show comparisons are newest first and bounded to six",()=>{
 const samples:SameShowSample[]=[];
 for(let i=0;i<8;i++)for(const provider of ["GROQ","OPENAI"] as const)
  samples.push({...base,show_id:"show-"+i,created_at:"2026-11-23T"+
   String(i+10).padStart(2,"0")+":00:00Z",provider,
   model:provider==="GROQ"?"openai/gpt-oss-120b":"gpt-6.1-terra",status:"READY"});
 const result=sameShowComparisons(samples);
 assert.equal(result.length,6);
 assert.equal(result[0]?.showId,"show-7");
 assert.equal(result.at(-1)?.showId,"show-2");
});

test("Assisted Terra samples remain readable but do not inflate model-only ratings",()=>{
 const samples:SameShowSample[]=[
  {...base,provider:"GROQ",model:"groq",status:"READY"},
  {...base,provider:"OPENAI",model:"gpt-6.1-terra",status:"READY",rating:5,editorial_assisted:true},
  {...base,provider:"OPENAI",model:"gpt-6.1-terra",status:"READY",rating:2}
 ];
 const terra=sameShowComparisons(samples)[0]!.terra;
 assert.equal(terra.accepted,2);assert.equal(terra.assisted,1);
 assert.equal(terra.rated,1);assert.equal(terra.averageRating,2);
});
