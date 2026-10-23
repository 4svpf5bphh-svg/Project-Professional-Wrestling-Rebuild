/** Isolated one-off real Groq acceptance test on a restricted Vercel Preview.
 * Contains synthetic match data only. Never touches Neon, auth or the live World.
 * Remove the preview build-command override before merging feature changes.
 */
import assert from "node:assert/strict";
import {generateGroqReview} from "../src/db/ringside-commentary.js";
import {DEFAULT_RINGSIDE_SETTINGS,type RingsideSettings} from "../src/domain/ringside-settings.js";
import type {CompletedShowView,ShowResultEntry} from "../src/db/show-results-view.js";

assert.equal(process.env.VERCEL_ENV,"preview","Only a Vercel preview may run this smoke test");
assert.equal(process.env.VERCEL_GIT_COMMIT_REF,"feature/ringside-editorial-typography-20261021",
 "Only the isolated Groq test branch may run this smoke test");
const key=process.env.GROQ_API_KEY;
assert.ok(key&&key.trim().length>10,"GROQ_API_KEY unavailable in restricted preview");
const makeMatch=(id:string,position:number,a:string,b:string,finish:string,rating:number,finisher?:string):ShowResultEntry=>({
 slotId:id,position,type:"MATCH",headline:a+" defeats "+b,summary:a+" wins a singles match.",
 crowdResponse:rating,outcome:finish,actorIds:[a,b],targetIds:[],
 matchContext:{format:"SINGLES",intent:"COMPETITIVE",plannedMinutes:18,
  sides:[[a],[b]],winnerNames:[a],championshipContested:false},
 fallout:{ratingStars:4.0,actualMinutes:18,injuries:[],eliminations:[]},
 performerIdentities:finisher?[{
  personId:id+"-winner",ringName:a,character:"THE CLEANER",style:"ALL_ROUNDER",
  signatureMoves:["V-Trigger"],finishingMoves:[finisher],source:"WORLD_RECORD"
 }]:[]
});
const entries:ShowResultEntry[]=[
 makeMatch("omegajoe",0,"Kenny Omega","Samoa Joe","CLEAN_PIN",91,"One Winged Angel"),
 makeMatch("codyroman",1,"Cody Rhodes","Roman Reigns","FLASH_PIN",76),
 {slotId:"segment",position:2,type:"SEGMENT",headline:"CM Punk confronts Drew McIntyre",
  summary:"A heated in-ring confrontation with neither man physically attacked.",
  crowdResponse:80,outcome:"HAPPENS",segmentKind:"CONFRONTATION",
  actorIds:["punk"],targetIds:["drew"],
  segmentContext:{actorNames:["CM Punk"],targetNames:["Drew McIntyre"],
   videoPurpose:null,stableDecision:null,turnTargetAlignment:null}},
 makeMatch("tonishida",3,"Toni Storm","Hikaru Shida","SUBMISSION",84),
 makeMatch("willokada",4,"Will Ospreay","Kazuchika Okada","DISQUALIFICATION",69)
];
const show:CompletedShowView={showId:"preview-synthetic-only",showName:"Synthetic Supercard",
 year:1,week:1,crowdResponse:83,matchCount:4,angleCount:1,entries};
const cases:{label:string;settings:RingsideSettings}[]=[
 {label:"default-veteran",settings:DEFAULT_RINGSIDE_SETTINGS},
 {label:"high-creativity-satire",settings:{...DEFAULT_RINGSIDE_SETTINGS,voice:"SATIRE",creativity:1.5,detail:"LONG",reasoning:"low",version:1}},
 {label:"sports-short",settings:{...DEFAULT_RINGSIDE_SETTINGS,voice:"SPORTS",creativity:0.4,detail:"SHORT",version:2}}
];
let total=0;
for(const item of cases){
 let httpStatus:number|undefined;
 const transport:typeof fetch=async(input,init)=>{
  const result=await fetch(input,init);httpStatus=result.status;return result;
 };
 try{
  const review=await generateGroqReview(show,key,transport,item.settings);
  assert.equal(review.slots.length,entries.length,"Every match and segment needs a review");
  for(let i=0;i<entries.length;i++){
   assert.equal(review.slots[i]?.slotId,entries[i]?.slotId,"Card slots were reordered");
   assert.ok(review.slots[i]!.recap.length>70,"Empty or incomplete recap");
  }
  total++;
  console.log("PPW_GROQ_LIVE_PASS",JSON.stringify({
   scenario:item.label,httpStatus,slots:review.slots.length,
   winnerMentioned:review.slots[0]?.recap.includes("Omega"),
   sample:review.slots[0]?.recap.slice(0,320)
  }));
 }catch(e){
  console.error("PPW_GROQ_LIVE_FAIL",JSON.stringify({
   scenario:item.label,httpStatus,error:e instanceof Error?e.message:String(e)
  }));
  process.exitCode=1;
 }
}
console.log("PPW_GROQ_LIVE_SUMMARY",JSON.stringify({passed:total,total:cases.length}));
