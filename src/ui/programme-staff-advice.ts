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
 recentWinnerSide?:"A"|"B"|null;
 sideAName?:string;sideBName?:string;
 direction?:"PURSUE_REMATCH"|"PLAN_RETALIATION"|"LET_STAND"|null;
 directionStatus?:string;
}
export interface ProgrammeAdvice{
 headline:string;
 observation:string;
 suggestion:string;
 options:readonly {label:string;plan:string;choice:"PURSUE_REMATCH"|"PLAN_RETALIATION"|"LET_STAND"}[];
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

/** A few distinct decisions, based only on certified facts: not invented
 * backstage motives or three generic segments for every rivalry. The mapped
 * direction is the existing authoritative post-match consent decision. */
export function suggestProgrammeAdvice(p:ProgrammeAdviceEvidence):ProgrammeAdvice{
 const original=baseProgrammeAdvice(p);
 const a=p.sideAName?.trim()||"Side A",b=p.sideBName?.trim()||"Side B";
 const leading=p.sideAWins>p.sideBWins?a:p.sideBWins>p.sideAWins?b:null;
 const trailing=leading===a?b:leading===b?a:null;
 const latestWinner=p.recentWinnerSide==="A"?a:p.recentWinnerSide==="B"?b:null;
 const challenger=trailing??(latestWinner===a?b:latestWinner===b?a:a);
 const dominant=leading??latestWinner??(challenger===a?b:a);
 const live=p.directionStatus&&["PENDING_REMATCH","PENDING_RETALIATION","BUILDING_REMATCH"]
  .includes(p.directionStatus);
 const title=p.championshipId!==null;
 const heavy=p.repetition>=55;
 const options:Array<ProgrammeAdvice["options"][number]>=[];
 if(p.activityCount===0){
  options.push({choice:"PLAN_RETALIATION",label:"Establish the issue",
   plan:a+" and "+b+" have no certified conflict yet. Introduce what each wants in an authored interview or challenge; decide who responds."});
  options.push({choice:"PURSUE_REMATCH",label:"Let the ring tell the story",
   plan:"Book "+a+" against "+b+" if they are eligible. The verified outcome will give the rivalry its first concrete direction."});
  options.push({choice:"LET_STAND",label:"Build anticipation",
   plan:"Keep "+a+" and "+b+" apart while developing their characters. A future meeting should have a reason."});
 }else if(live){
  options.push({choice:p.direction!,label:"Follow through on your promise",
   plan:p.direction==="PURSUE_REMATCH"?
    "You promised a rematch. Give "+a+" and "+b+" a real booking, with a new reason for the result to matter.":
    "Retaliation remains unresolved. Give "+challenger+" a specific response to "+dominant+" before adding another ordinary bout."});
  options.push({choice:"LET_STAND",label:"Change course deliberately",
   plan:"The current direction has not happened yet. You can let the outcome stand, but the rivalry may lose its immediate momentum."});
  options.push({choice:"PLAN_RETALIATION",label:"Escalate the stakes",
   plan:"Use an actual booked scene involving "+a+" and "+b+" to sharpen the conflict. Do not invent attacks or acceptances."});
 }else if(heavy){
  options.push({choice:"LET_STAND",label:"Give the rivalry breathing room",
   plan:a+" and "+b+" have repeated this story often. Separate them for a show, and return only with a genuinely different issue."});
  options.push({choice:"PLAN_RETALIATION",label:"Change the type of conflict",
   plan:"If "+challenger+" has something unresolved with "+dominant+", try an authored character scene rather than another straightforward rematch."});
  options.push({choice:"PURSUE_REMATCH",label:"Make the next meeting decisive",
   plan:"Only revisit "+a+" versus "+b+" with specific stakes, such as a suitable stipulation or planned finale."});
 }else if(title){
  options.push({choice:"PURSUE_REMATCH",label:"Put the championship at stake",
   plan:"If booking eligibility allows, build "+a+" versus "+b+" towards a genuine title contest, not a fictional title change."});
  options.push({choice:"PLAN_RETALIATION",label:"Make the challenger earn it",
   plan:challenger+" could demand another opportunity. An actual challenge or qualifying match must establish the case before "+dominant+" agrees."});
  options.push({choice:"LET_STAND",label:"Protect the title picture",
   plan:"Delay another contest between "+a+" and "+b+" until the story gives the championship a fresh reason to be defended."});
 }else if(leading){
  options.push({choice:"PLAN_RETALIATION",label:"Give "+trailing+" an answer",
   plan:leading+" is ahead "+p.sideAWins+"–"+p.sideBWins+" in certified matches. Let "+trailing+" respond with a credible, bookable challenge or character change."});
  options.push({choice:"PURSUE_REMATCH",label:"Raise the cost of another loss",
   plan:"A rematch between "+a+" and "+b+" needs stakes for the trailing side. Decide how another defeat would change the rivalry."});
  options.push({choice:"LET_STAND",label:"Let the result mean something",
   plan:"Keep "+leading+"'s advantage on the record. The other wrestler can pursue a different path before returning."});
 }else{
  options.push({choice:"PURSUE_REMATCH",label:"Break the deadlock",
   plan:"Neither "+a+" nor "+b+" has control of the rivalry. A decisive match can change that, with a winner and finish you author."});
  options.push({choice:"PLAN_RETALIATION",label:"Bring the personalities forward",
   plan:"Explore what "+a+" and "+b+" disagree about, using an authored segment with a concrete outcome—not another generic face-off."});
  options.push({choice:"LET_STAND",label:"Hold a bigger confrontation",
   plan:"Let the unresolved issue simmer while "+a+" and "+b+" build their own momentum elsewhere."});
 }
 return {...original,options};
}
