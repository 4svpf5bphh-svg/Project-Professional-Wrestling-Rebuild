/** Original main packages/sim-core/src/career.ts, pure career calculations.
 * Derived only from verified original profile values and completed matches.
 * A nullable age/aptitude means an older imported World lacks the source fact.
 */
export type CareerStage="PROSPECT"|"PRIME"|"VETERAN"|"SPECIAL_ATTRACTION";
export type CareerStatus="ACTIVE"|"INJURED"|"RETIRED";
export interface CareerSkills {
 inRingQuality:number;matchCraft:number;safety:number;stamina:number;presentation:number;
}
export interface CareerState {
 biologicalAge:number;careerExperience:number;developmentAptitude:number;
 careerStage:CareerStage;status:CareerStatus;wear:number;
 popularity:number;recognition:number;skills:CareerSkills;
}
export interface CareerChange {
 next:CareerState;previousStage:CareerStage;retirementProbability:number;
}
const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
const round2=(v:number)=>Math.round(v*100)/100;
const stageFactor:Record<CareerStage,number>={
 PROSPECT:1.35,PRIME:.75,VETERAN:.28,SPECIAL_ATTRACTION:.12,
};
const develop=(value:number,growth:number)=>
 round2(clamp(value+growth*Math.max(.05,(100-value)/100),1,99));
const WEEKS_PER_YEAR=52;
const CAREER_TIME_FACTOR=.14;
const RETIREMENT_AGE=42;
/** One application for an already-certified World week, identical to original ordering:
 * skill improvement -> age/wear decline -> stage transition -> retirement chance.
 */
export function originalCareerWeek(
 person:CareerState,matches:number,averageStars:number,
):CareerChange{
 if(!Number.isSafeInteger(matches)||matches<0||matches>104||
  !Number.isFinite(averageStars)||averageStars<0||averageStars>5)
  throw new Error("Invalid certified career evidence");
 const p:CareerState={...person,skills:{...person.skills}};
 const previousStage=p.careerStage;
 if(p.status!=="RETIRED"&&matches>0){
  const base=stageFactor[p.careerStage]*(0.035+averageStars*.012)
   *(.55+p.developmentAptitude/100)*Math.min(1.4,.8+matches*.25);
  p.careerExperience=round2(clamp(p.careerExperience+.08*matches+averageStars*.012,0,100));
  p.skills.matchCraft=develop(p.skills.matchCraft,base*1.15);
  p.skills.inRingQuality=develop(p.skills.inRingQuality,base);
  p.skills.safety=develop(p.skills.safety,base*.42);
  p.skills.presentation=develop(p.skills.presentation,base*.52);
  if(p.careerStage==="PROSPECT"||p.careerStage==="PRIME")
   p.skills.stamina=develop(p.skills.stamina,base*.35);
 }
 if(p.status!=="RETIRED"){
  const biologicalWeek=CAREER_TIME_FACTOR/WEEKS_PER_YEAR;
  p.biologicalAge=Math.round((p.biologicalAge+biologicalWeek)*1_000_000)/1_000_000;
  const agePressure=Math.max(0,p.biologicalAge-36)/12;
  const wearPressure=Math.max(0,p.wear-58)/42;
  const decline=biologicalWeek*(agePressure+wearPressure*.75);
  if(decline>0){
   p.skills.stamina=round2(clamp(p.skills.stamina-decline*2.4,10,99));
   p.skills.inRingQuality=round2(clamp(p.skills.inRingQuality-decline*.7,10,99));
   p.skills.matchCraft=develop(p.skills.matchCraft,decline*.25);
  }
  if(p.careerStage==="PROSPECT"&&(p.biologicalAge>=25||p.careerExperience>=45))
   p.careerStage="PRIME";
  else if(p.careerStage==="PRIME"&&(p.biologicalAge>=35||
    (p.wear>=68&&p.careerExperience>=70)))p.careerStage="VETERAN";
  else if(p.careerStage==="VETERAN"&&p.biologicalAge>=42&&
   Math.max(p.recognition,p.popularity)>=62)p.careerStage="SPECIAL_ATTRACTION";
 }
 return {next:p,previousStage,
  retirementProbability:p.status==="RETIRED"||p.biologicalAge<RETIREMENT_AGE&&p.wear<88?0:
   clamp(.05+Math.max(0,p.biologicalAge-RETIREMENT_AGE)*.065+
    Math.max(0,p.wear-65)*.012-
    Math.max(p.recognition,p.popularity)/100*.08,.01,.82)*CAREER_TIME_FACTOR/WEEKS_PER_YEAR};
}
export function originalMoraleEvidence(input:{
 role:"DEVELOPMENTAL"|"REGULAR"|"FEATURED"|"UPPER_CARD"|"MAIN_EVENT"|"SPECIAL_ATTRACTION";
 used:boolean;hadShow:boolean;injured:boolean;
 momentum:number;fatigue:number;distress:"HEALTHY"|"WATCH"|"DISTRESSED"|"CRISIS";
 inactive:boolean;currentMorale:number;
}):number{
 const missed={DEVELOPMENTAL:54,REGULAR:50,FEATURED:44,UPPER_CARD:38,
  MAIN_EVENT:32,SPECIAL_ATTRACTION:58}[input.role];
 const usage=input.hadShow&&!input.injured;
 let evidence=usage?(input.used?68:missed):60;
 evidence+=(input.momentum-50)*.12;
 evidence-=input.fatigue>=80?16:input.fatigue>=65?10:input.fatigue>=50?5:0;
 evidence-=Math.max({HEALTHY:0,WATCH:2,DISTRESSED:6,CRISIS:10}[input.distress],
  input.inactive?15:0);
 evidence=clamp(evidence,15,90);
 return Math.round(clamp(input.currentMorale+
  (evidence-input.currentMorale)*(usage ? 0.18 : 0.08),5,95)*10)/10;
}
export function originalTrustYear(input:{
 current:number;appearances:number;terminations:number;dormant:boolean
}):number{
 const a=input.appearances;
 let evidence=a>=12?76:a>=6?70:a>=3?62:a>=1?54:38;
 evidence=clamp(evidence-input.terminations*45-(input.dormant?25:0),10,90);
 const weight=input.terminations>0||input.dormant ? 0.45 : 0.3;
 return Math.round(clamp(input.current+(evidence-input.current)*weight,0,100)*10)/10;
}
const ORDER=["LOCAL","INDEPENDENT","RISING","NATIONAL","GLOBAL"] as const;
export type PromotionTier=typeof ORDER[number];
export function originalAnnualTier(tier:PromotionTier,score:number):PromotionTier{
 const promote:Partial<Record<PromotionTier,number>>={LOCAL:30,INDEPENDENT:40,RISING:50,NATIONAL:62};
 const demote:Partial<Record<PromotionTier,number>>={INDEPENDENT:24,RISING:34,NATIONAL:44,GLOBAL:54};
 const index=ORDER.indexOf(tier);
 if(promote[tier]!==undefined&&score>=promote[tier]!&&index<ORDER.length-1)
  return ORDER[index+1]!;
 if(demote[tier]!==undefined&&score<demote[tier]!&&index>0)return ORDER[index-1]!;
 return tier;
}

/** Original processWrestlerMoraleForWeek, averaging every relevant contract.
 * Unknown show-appearance proof is not evidence that somebody was benched. */
export function originalWeeklyMorale(input:{
 morale:number;momentum:number;fatigue:number;injured:boolean;
 contracts:readonly {role:"DEVELOPMENTAL"|"REGULAR"|"FEATURED"|"UPPER_CARD"|
 "MAIN_EVENT"|"SPECIAL_ATTRACTION";hadVerifiedShow:boolean;used:boolean;
 distress:"HEALTHY"|"WATCH"|"DISTRESSED"|"CRISIS";inactive:boolean}[]
}):number{
 const values=input.contracts.filter(c=>c.hadVerifiedShow&&!input.injured);
 const missed={DEVELOPMENTAL:54,REGULAR:50,FEATURED:44,UPPER_CARD:38,
  MAIN_EVENT:32,SPECIAL_ATTRACTION:58};
 const usages=values.map(c=>c.used?68:missed[c.role]);
 let evidence=usages.length?usages.reduce((s,v)=>s+v,0)/usages.length:60;
 evidence+=(input.momentum-50)*.12;
 evidence-=input.fatigue>=80?16:input.fatigue>=65?10:input.fatigue>=50?5:0;
 const penalties={HEALTHY:0,WATCH:2,DISTRESSED:6,CRISIS:10};
 evidence-=input.contracts.reduce((worst,c)=>
  Math.max(worst,penalties[c.distress],c.inactive?15:0),0);
 evidence=clamp(evidence,15,90);
 return Math.round(clamp(input.morale+(evidence-input.morale)*
  (usages.length?0.18:0.08),5,95)*10)/10;
}

export const ORIGINAL_ROSTER_TARGET={GLOBAL:46,NATIONAL:36,RISING:29,
 INDEPENDENT:24,LOCAL:16} as const;
export function originalPromotionScaleScore(input:{
 localMarkets:readonly {liveStrength:number;awareness:number;loyalty:number}[];
 mediaReach:number;showPerformance:number;financialDistress:
 "HEALTHY"|"WATCH"|"DISTRESSED"|"CRISIS"
}):number{
 const local=input.localMarkets.map(s=>
  s.liveStrength*.45+s.awareness*.35+s.loyalty*.2).sort((a,b)=>b-a);
 const core=local.slice(0,5);
 const strength=core.length?core.reduce((a,b)=>a+b,0)/core.length:0;
 const breadth=input.localMarkets.length?input.localMarkets.filter(s=>
  s.awareness>=25&&s.liveStrength>=20).length/input.localMarkets.length*100:0;
 const finances={HEALTHY:80,WATCH:60,DISTRESSED:38,CRISIS:15};
 return Math.round(clamp(strength*.32+breadth*.16+input.mediaReach*.2+
  input.showPerformance*.22+finances[input.financialDistress]*.1,0,100)*10)/10;
}
export function originalSurvivalCounters(input:{
 distress:"HEALTHY"|"WATCH"|"DISTRESSED"|"CRISIS";
 healthyWeeks:number;stressWeeks:number;crisisWeeks:number;
 understaffedWeeks:number;rosterCount:number;minimumRoster:number;
 interval:number;
}){
 const healthy=input.distress==="HEALTHY";
 return {healthyWeeks:healthy?input.healthyWeeks+input.interval:0,
  stressWeeks:healthy?0:input.distress==="DISTRESSED"||input.distress==="CRISIS"?
   input.stressWeeks+input.interval:Math.max(0,input.stressWeeks-input.interval),
  crisisWeeks:input.distress==="CRISIS"?input.crisisWeeks+input.interval:0,
  understaffedWeeks:input.rosterCount<input.minimumRoster?
   input.understaffedWeeks+input.interval:0};
}
