/** One-off protected preview build probe. Synthetic wrestler facts only:
 * no session, production World, Neon connection, migrations or database reads.
 * Revert the temporary Vercel buildCommand after recording its result.
 */
import assert from "node:assert/strict";
import {generateGroqReview} from "../src/db/ringside-commentary.js";
import type {CompletedShowView} from "../src/db/show-results-view.js";

assert.equal(process.env.VERCEL_ENV,"preview","Only a Vercel preview may run this smoke test");
assert.equal(process.env.VERCEL_GIT_COMMIT_REF,
 "feature/ringside-editorial-typography-20261021",
 "Only the isolated Ringside feature branch may run this smoke test");
const key=process.env.GROQ_API_KEY;
assert.ok(key&&key.trim().length>10,"GROQ_API_KEY is missing in the preview build environment");
const show:CompletedShowView={
 showId:"synthetic-no-database",showName:"Ringside Demonstration",
 year:1,week:1,crowdResponse:84,matchCount:1,angleCount:0,
 entries:[{
  slotId:"synthetic-kenny-joe",position:0,type:"MATCH",
  headline:"Kenny Omega defeats Samoa Joe by clean pinfall",
  summary:"Omega wins a competitive singles match in 20 minutes.",
  outcome:"CLEAN_PIN",crowdResponse:89,
  actorIds:["kenny","samoa"],targetIds:[],
  matchContext:{format:"SINGLES",intent:"COMPETITIVE",plannedMinutes:20,
   sides:[["Kenny Omega"],["Samoa Joe"]],
   winnerNames:["Kenny Omega"],championshipContested:false},
  fallout:{ratingStars:4.5,actualMinutes:20,injuries:[],eliminations:[]},
  performerIdentities:[
   {personId:"kenny",ringName:"Kenny Omega",character:"THE CLEANER",
    style:"ALL_ROUNDER",signatureMoves:["V-Trigger","Snap Dragon Suplex"],
    finishingMoves:["One Winged Angel"],source:"WORLD_RECORD"},
   {personId:"samoa",ringName:"Samoa Joe",character:"THE DESTROYER",
    style:"BRAWLER",signatureMoves:["Uranage","STJoe"],
    finishingMoves:["Coquina Clutch","Muscle Buster"],source:"WORLD_RECORD"}
  ]
 }]
};
let httpStatus:number|undefined;
const transport:typeof fetch=async(input,init)=>{
 const result=await fetch(input,init);
 httpStatus=result.status;
 return result;
};
try{
 const review=await generateGroqReview(show,key,transport);
 const recap=review.slots[0]?.recap??"";
 assert.equal(review.slots[0]?.slotId,"synthetic-kenny-joe");
 assert.match(review.showHeadline+" "+review.opening+" "+review.slots[0]?.headline+" "+recap+" "+review.closing,
  /Omega|Kenny/i,"Review omits the official winner");
 console.log("PPW_GROQ_SMOKE_PASS",JSON.stringify({
  model:"openai/gpt-oss-120b",httpStatus,
  slots:review.slots.length,finish:"CLEAN_PIN",
  finisherMentioned:/one winged angel/i.test(recap),
  review
 }));
}catch(e){
 console.error("PPW_GROQ_SMOKE_FAIL",JSON.stringify({
  httpStatus,error:e instanceof Error?e.message:"Unexpected response"
 }));
 process.exitCode=1;
}
