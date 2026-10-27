/** Render only significant, certified World ledger career chapters.
 * Do not infer a milestone from current age or reputation. */
export interface CertifiedCareerLedgerMoment{
 kind:string;year:number;week:number;personName:string|null;
 careerStage?:string|null;fromStage?:string|null;
}
const stages:Record<string,string>={PROSPECT:"prospect",PRIME:"prime",
 VETERAN:"veteran",SPECIAL_ATTRACTION:"special attraction"};
export function certifiedCareerMoment(e:CertifiedCareerLedgerMoment):
 {title:string;detail:string}|null{
 if(!Number.isSafeInteger(e.year)||e.year<1||
  !Number.isSafeInteger(e.week)||e.week<1||e.week>52||
  !e.personName?.trim())return null;
 const who=e.personName.trim();
 if(e.kind==="WRESTLER_RETIRED")return {
  title:who+" hangs up the boots",
  detail:"A confirmed retirement in the World record. Their completed matches, title reigns and honours remain part of wrestling history."};
 if(e.kind!=="CAREER_STAGE_CHANGED")return null;
 const from=e.fromStage?stages[e.fromStage]:undefined;
 const to=e.careerStage?stages[e.careerStage]:undefined;
 if(!from||!to||from===to)return null;
 return {title:who+(e.careerStage==="SPECIAL_ATTRACTION"?
  " becomes a special attraction":" enters a new career chapter"),
  detail:"Career stage: "+from+" → "+to+
   ". A recorded World transition, not a newly awarded title, contract or Hall of Fame induction."};
}
