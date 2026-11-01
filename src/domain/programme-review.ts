/** Verified rivalry review. No stat changes: reporting only. */
export interface ProgrammeReviewInput{
 heat:number|null;repetition:number;matchCount:number;segmentCount:number;
 finaleCompleted:boolean;finaleCrowd:number|null;
}
export function evaluateProgrammeReview(p:ProgrammeReviewInput){
 const clamp=(v:number)=>Math.min(100,Math.max(0,v));
 const heat=clamp(p.heat??0),crowd=clamp(p.finaleCrowd??0);
 const variety=p.matchCount>0&&p.segmentCount>0?9:0;
 const substance=Math.min(16,p.matchCount*3+p.segmentCount*2);
 const payoff=p.finaleCompleted?12+Math.round(crowd*0.09):0;
 const wear=Math.min(24,Math.max(0,p.repetition-25)*0.22);
 const score=Math.round(clamp(heat*0.63+substance+variety+payoff-wear));
 const grade=score>=90?"A+":score>=82?"A":score>=74?"B":
  score>=64?"C":score>=50?"D":"E";
 const verdict=p.finaleCompleted?
  score>=82?"A feud that delivered its payoff":score>=64?
  "A solid rivalry with room to improve":"The payoff fell short of its build":
  "Closed without a certified on-screen payoff";
 return {score,grade,verdict};
}
