/** Fictional, certified test cards for the one-request post-show 20B writer.
 * Never read or mutate a live promotion or manufacture a completed show row.
 */
import {getWrestlingBenchmark} from "./wrestling-ai-benchmark.js";
import {postShowVoiceBrief,type PostShowVoiceBrief} from "./postshow-voice-batch.js";
import type {CompletedShowView} from "../db/show-results-view.js";

export const POSTSHOW_VOICE_SCENARIOS=[
 {id:"i-quit",name:"I Quit · intense surrender",
  expectation:"News records the verbal surrender; wrestler sounds in character; Road Agent gives concrete follow-up advice"},
 {id:"steel-cage",name:"Steel Cage · decisive pinfall",
  expectation:"News credits the actual three-count; authentic character response; no fabricated cage escape or medical incident"},
 {id:"tag-standard",name:"Tag team · verified winning team",
  expectation:"News credits the team, not an invented fall scorer; wrestler stays in character; the staff note is actionable"}
] as const;
export function getPostShowVoiceBenchmark(id:string):
 {scenario:typeof POSTSHOW_VOICE_SCENARIOS[number];
  show:CompletedShowView;brief:PostShowVoiceBrief}|null{
 const scenario=POSTSHOW_VOICE_SCENARIOS.find(x=>x.id===id);
 const sample=scenario?getWrestlingBenchmark(id):null;
 if(!scenario||!sample)return null;
 const show:CompletedShowView={...sample.show,entries:sample.show.entries.map(e=>({
  ...e,matchContext:e.matchContext?{...e.matchContext,
   sideParticipants:e.matchContext.sides.map((side,i)=>
    side.map((name,j)=>({personId:"fixture-"+String(
     e.matchContext!.sides.slice(0,i).reduce((n,team)=>n+team.length,0)+j),name})))}:undefined
 }))};
 // A named fictional staff report is supplied only for the fixed Lab card.
 // The observation itself still comes from the certified match facts.
 show.staffReport={
  reporter:"Morgan Reed",headline:"Post-show performance report",
  praise:"The verified match gave the audience a clear result",
  concern:"Repeating the same stipulation immediately may dilute the payoff",
  recommendation:"Give the next appearance a specific story reason"
 };
 return {scenario,show,brief:postShowVoiceBrief(show)};
}
