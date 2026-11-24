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
  expectation:"News credits the team, not an invented fall scorer; wrestler stays in character; the staff note is actionable"},
 {id:"mixed-broadcast",name:"Mixed broadcast · two fan debates and a separate staff issue",
  expectation:"Five distinct slots: correct main-event news and speaker, two complete fan conversations, a specific undercard tag-team pacing note, and no cross-match or off-screen inventions"}
] as const;
export function getPostShowVoiceBenchmark(id:string):
 {scenario:typeof POSTSHOW_VOICE_SCENARIOS[number];
  show:CompletedShowView;brief:PostShowVoiceBrief}|null{
 const scenario=POSTSHOW_VOICE_SCENARIOS.find(x=>x.id===id);
 const mixed=id==="mixed-broadcast";
 const sample=scenario?getWrestlingBenchmark(mixed?"i-quit":id):null;
 if(!scenario||!sample)return null;
 const show:CompletedShowView={...sample.show,entries:sample.show.entries.map(e=>({
  ...e,matchContext:e.matchContext?{...e.matchContext,
   // The fictional tag match overruns its planned slot by six minutes,
   // providing a real, non-medical Road Agent cue at a sub-four-star rating.
   plannedMinutes:scenario.id==="tag-standard"?
    Math.max(2,(e.fallout?.actualMinutes??e.matchContext.plannedMinutes??18)-6):
    e.matchContext.plannedMinutes,
   sideParticipants:e.matchContext.sides.map((side,i)=>
    side.map((name,j)=>({personId:"fixture-"+String(
     e.matchContext!.sides.slice(0,i).reduce((n,team)=>n+team.length,0)+j),name})))}:undefined
 }))};
 if(mixed){
  // Reuse the original match and segment fixtures, but give each source its
  // own slot and identity namespace. The main event, the two fan threads
  // and the Road Agent's issue deliberately belong to different matches.
  const fixtureIds=["disqualification","singles-technical","tag-standard","angle-solo-interview","i-quit"];
  show.entries=fixtureIds.map((key,position)=>{
   const e=getWrestlingBenchmark(key)!.show.entries[0]!;
   const prefix="mixed-"+position+"-";
   const slotId="mixed-card-"+position;
   const identities=e.performerIdentities?.map(p=>({...p,personId:prefix+p.personId}));
   const matchContext=e.matchContext?{...e.matchContext,
    isMainEvent:key==="i-quit",
    plannedMinutes:key==="tag-standard"?12:e.matchContext.plannedMinutes,
    sideParticipants:e.matchContext.sides.map((side,i)=>side.map((name,j)=>({
     name,personId:prefix+"fixture-"+String(e.matchContext!.sides.slice(0,i).reduce((n,s)=>n+s.length,0)+j)
    })))}:undefined;
   return {...e,slotId,position,actorIds:e.actorIds.map(x=>prefix+x),
    targetIds:e.targetIds.map(x=>prefix+x),performerIdentities:identities,matchContext,
    crowdResponse:key==="singles-technical"?38:e.crowdResponse};
  });
  show.showId="benchmark:mixed-broadcast";show.showName="PPW Quality Lab · Mixed broadcast";
  show.matchCount=4;show.angleCount=1;show.crowdResponse=76;
 }
 // A named fictional staff report is supplied only for the fixed Lab card.
 // The observation itself still comes from the certified match facts.
 show.staffReport={
  reporter:"Morgan Reed",staffId:null,headline:"Post-show performance report",
  praise:"The verified match gave the audience a clear result",
  concern:"Repeating the same stipulation immediately may dilute the payoff",
  recommendation:"Give the next appearance a specific story reason",
  strongestMatchId:mixed?show.entries[1]?.slotId??null:show.entries[0]?.slotId??null,
  reviewedMatches:show.matchCount
 };
 return {scenario,show,brief:postShowVoiceBrief(show)};
}
