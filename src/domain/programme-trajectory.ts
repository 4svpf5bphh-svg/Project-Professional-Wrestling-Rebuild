/** Reader-facing creative continuity from a certified Programme summary.
 * It offers options, never chooses a match, mandates a storyline stage,
 * changes heat, or writes any new World state.
 */
export interface ProgrammeTrajectoryEvidence {
 heat:number|null;repetition:number;activityCount:number;
 matchCount:number;segmentCount:number;sideAWins:number;sideBWins:number;
}
export interface ProgrammeTrajectory {
 title:string;summary:string;
 kind:"NEW"|"BUILDING"|"ESCALATING"|"PAYOFF"|"STALE"|"COOLING";
}
export function readProgrammeTrajectory(p:ProgrammeTrajectoryEvidence):ProgrammeTrajectory {
 const heat=p.heat===null?null:Math.max(0,Math.min(100,p.heat));
 if(p.activityCount<1)return {kind:"NEW",title:"Opening chapter",
  summary:"No completed chapters yet. Your next match or on-screen moment can give this rivalry its opening spark."};
 if(p.repetition>=35)return {kind:"STALE",title:"Time for a fresh beat",
  summary:"Recent programme activity is repeating itself. A different confrontation, match or turning point could bring the intrigue back."};
 if(heat!==null&&heat<35&&p.activityCount>=3)return {kind:"COOLING",title:"The crowd needs a reason",
  summary:"This rivalry has history, but recent audience interest is cooling. The next meaningful development matters more than another routine appearance."};
 if(heat!==null&&heat>=72&&p.activityCount>=3&&p.matchCount>=1)
  return {kind:"PAYOFF",title:"A major chapter beckons",
   summary:"The crowd is invested and the rivalry has real match history. There's room for a decisive showdown or a fresh twist, on your terms."};
 if(p.activityCount>=3){
  const difference=Math.abs(p.sideAWins-p.sideBWins);
  return {kind:"ESCALATING",title:"The stakes are rising",
   summary:difference>=2?
    "One side has built a clear winning advantage. A challenge, comeback or changing dynamic could take the story somewhere new.":
    p.segmentCount>p.matchCount?
    "There's more than a match record here: on-screen developments are shaping this rivalry. Your next card decides where it heads.":
    "The wrestlers have unfinished business and the results are building a history. There's still more to tell."};
 }
 return {kind:"BUILDING",title:"Building the issue",
  summary:"The opening encounters are in the books. Give the audience another meaningful chapter when you're ready."};
}
