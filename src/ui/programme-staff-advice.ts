/** Optional, client-side creative notes from verified programme data only.
 * No server read, Groq request, future booking or confidential rival data.
 */
export interface ProgrammeAdviceEvidence{
 heat:number|null;
 repetition:number;
 activityCount:number;
 matchCount:number;
 segmentCount:number;
 sideAWins:number;
 sideBWins:number;
 championshipId:string|null;
 recentKind:"MATCH"|"SEGMENT"|null;
}
export interface ProgrammeAdvice{
 headline:string;
 observation:string;
 suggestion:string;
}
export function suggestProgrammeAdvice(p:ProgrammeAdviceEvidence):ProgrammeAdvice{
 const gap=Math.abs(p.sideAWins-p.sideBWins);
 const leading=p.sideAWins>p.sideBWins?"side A":p.sideBWins>p.sideAWins?"side B":null;
 if(p.activityCount===0)
  return {headline:"Give them a reason to clash",
   observation:"This issue has no recorded on-air chapter yet.",
   suggestion:"Start with a confrontation or a match that establishes the conflict. You can decide the finish."};
 if(p.repetition>=65&&p.matchCount>=2)
  return {headline:"Change the rhythm",
   observation:"The same issue has returned to the ring enough times that another straight rematch risks feeling familiar.",
   suggestion:"Try an angle, a fresh stipulation or a credible escalation before booking another bout. No result is being chosen for you."};
 if(p.segmentCount===0&&p.matchCount>=1)
  return {headline:"Let them talk",
   observation:"The story has been told through matches, without a recorded angle to give it another dimension.",
   suggestion:"A short challenge, confrontation or character beat could give their next meeting more purpose."};
 if(gap>=2&&leading)
  return {headline:"The result needs a response",
   observation:leading+" has more certified wins in this rivalry. The other side has work to do.",
   suggestion:"Consider a response from the trailing side: a challenge, an argument or an earned opportunity. You remain in charge of the outcome."};
 if((p.heat??0)>=75&&p.matchCount>=1)
  return {headline:p.championshipId?"The title stakes are working":"There is a real audience to reward",
   observation:"This rivalry has earned strong attention from the audience.",
   suggestion:p.championshipId?
    "If the championship is still relevant, a well-built title confrontation could carry the next event. Check availability and creative agreements first.":
    "Give the next major chapter space on an upcoming card rather than repeating last week's scene."};
 if(p.recentKind==="SEGMENT")
  return {headline:"Pay off the latest chapter",
   observation:"The most recent verified activity was an angle, not a match.",
   suggestion:"Think about what the audience expects after that scene and whether a bout, another confrontation or some breathing room serves the story best."};
 return {headline:"Keep the story moving",
  observation:"There is established activity, but not yet a clear reason to rush another major confrontation.",
  suggestion:"Use your next show to develop the characters, then give the rivalry an appropriate in-ring destination."};
}
