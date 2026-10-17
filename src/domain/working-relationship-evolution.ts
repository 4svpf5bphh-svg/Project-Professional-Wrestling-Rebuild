/** Original PPW's conservative evidence-only tag working relationships.
 * Scripted hostility, betrayals, finishes and winners never change real trust.
 */
export interface WorkingEvidence{
 goodShows12:number;poorShows10:number;hasGood12:boolean;
 currentExecution:number;currentWeekIndex:number;
}
export interface WorkingRelationshipState{
 professionalTrust:number;familiarity:number;
 lastImprovedWeekIndex:number|null;
 lastStrainedWeekIndex:number|null;
}
export type WorkingDevelopment={
 kind:"IMPROVEMENT"|"STRAIN";professionalTrust:number;familiarity:number;
 trustDelta:number;familiarityDelta:number;verifiedShows:number;
};
const round1=(n:number)=>Math.round(n*10)/10;
export function evolveWorkingPartnership(
 evidence:WorkingEvidence,prior:WorkingRelationshipState|null,
):WorkingDevelopment|null{
 const e=evidence;
 if(!Number.isSafeInteger(e.currentWeekIndex)||e.currentWeekIndex<0||
  !Number.isSafeInteger(e.goodShows12)||e.goodShows12<0||
  !Number.isSafeInteger(e.poorShows10)||e.poorShows10<0||
  !Number.isFinite(e.currentExecution)||e.currentExecution<0||
  e.currentExecution>100||typeof e.hasGood12!=="boolean")
  throw new Error("Invalid completed working partnership evidence");
 const state=prior??{professionalTrust:50,familiarity:0,
  lastImprovedWeekIndex:null,lastStrainedWeekIndex:null};
 const validWeek=(v:number|null)=>v===null||
  Number.isSafeInteger(v)&&v>=0&&v<=e.currentWeekIndex;
 if(!Number.isFinite(state.professionalTrust)||state.professionalTrust< -100||
  state.professionalTrust>100||!Number.isFinite(state.familiarity)||
  state.familiarity<0||state.familiarity>100||
  !validWeek(state.lastImprovedWeekIndex)||!validWeek(state.lastStrainedWeekIndex))
  throw new Error("Invalid existing wrestler relationship");
 const cool=(last:number|null,weeks:number)=>last===null||e.currentWeekIndex-last>=weeks;
 if(e.currentExecution>=68&&e.goodShows12>=2&&
  cool(state.lastImprovedWeekIndex,8)){
  const trust=Math.max(state.professionalTrust,
   round1(Math.min(75,state.professionalTrust+0.8)));
  const familiarity=Math.min(100,state.familiarity+2);
  if(trust===state.professionalTrust&&familiarity===state.familiarity)return null;
  return {kind:"IMPROVEMENT",professionalTrust:trust,familiarity,
   trustDelta:round1(trust-state.professionalTrust),
   familiarityDelta:familiarity-state.familiarity,
   verifiedShows:e.goodShows12};
 }
 if(prior&&e.currentExecution<=40&&e.poorShows10>=3&&
  !e.hasGood12&&state.familiarity>=12&&state.professionalTrust>35&&
  cool(state.lastStrainedWeekIndex,12)&&
  cool(state.lastImprovedWeekIndex,12)){
  const trust=round1(Math.max(35,state.professionalTrust-0.6));
  if(trust===state.professionalTrust)return null;
  return {kind:"STRAIN",professionalTrust:trust,familiarity:state.familiarity,
   trustDelta:round1(trust-state.professionalTrust),familiarityDelta:0,
   verifiedShows:e.poorShows10};
 }
 return null;
}
