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
 sideAName?:string;sideBName?:string;
 direction?:"PURSUE_REMATCH"|"PLAN_RETALIATION"|"LET_STAND"|null;
 directionStatus?:string;
}
export interface ProgrammeAdvice{
 headline:string;
 observation:string;
 suggestion:string;
 options:readonly {label:string;plan:string}[];
}
function baseProgrammeAdvice(p:ProgrammeAdviceEvidence){
 const gap=Math.abs(p.sideAWins-p.sideBWins);
 const leading=p.sideAWins>p.sideBWins?(p.sideAName??"side A"):
  p.sideBWins>p.sideAWins?(p.sideBName??"side B"):null;
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
   observation:leading+" has taken the upper hand in their certified meetings.",
   suggestion:"Give "+(p.sideAWins>p.sideBWins?p.sideBName??"the trailing side":
    p.sideAName??"the trailing side")+
    " a credible answer: a confrontation, a challenge or an earned opportunity. You still choose the winner."};
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

/** Three next-card alternatives grounded in the actual rivalry, not a booked outcome. */
export function suggestProgrammeAdvice(p:ProgrammeAdviceEvidence):ProgrammeAdvice{
 const original=baseProgrammeAdvice(p);
 const a=p.sideAName?.trim()||"Side A",b=p.sideBName?.trim()||"Side B";
 const person=p.sideAWins>p.sideBWins?b:p.sideBWins>p.sideAWins?a:b;
 const opponent=person===a?b:a;
 const interview={label:"Interview · 6 minutes",
  plan:"On the next show, interview "+person+" about "+(p.matchCount?"their last match with ":"their issue with ")+
   opponent+". Invite the other side to answer; decide whether to issue a challenge."};
 const confrontation={label:"Confrontation · 5 minutes",
  plan:"Book "+a+" and "+b+" for a face-to-face on the next card. Let one issue a specific challenge and the other accept, reject or walk out. No result is predetermined."};
 const match={label:"Rivalry match · 12–15 minutes",
  plan:"Book an eligible match between "+a+" and "+b+" after checking dates and approvals. Choose the stipulation and winner yourself."+
   (p.championshipId?" Verify championship eligibility before adding the title.":"")};
 let options=[interview,confrontation,match];
 if(p.direction==="PURSUE_REMATCH"&&p.directionStatus!=="REMATCH_HELD")options=[match,interview,confrontation];
 else if(p.direction==="PLAN_RETALIATION"&&p.directionStatus!=="ANGLE_AFTER_RETALIATION")options=[confrontation,interview,match];
 else if(p.recentKind==="SEGMENT"&&p.repetition<65)options=[match,interview,confrontation];
 return {...original,options};
}
