/** AI rivals develop recognisable booking preferences and a stable quarterly
 * priority. Only existing original-World attributes determine the identity.
 * This has no separate scheduler, persistent meter or effect on human cards.
 */
export type AiPromotionIdentity="WORKRATE"|"SPECTACLE"|"STAR_POWER"|"STORYTELLING";
export type AiQuarterFocus="BUILD_STARS"|"PAY_OFF_RIVALRIES"|"SHOWCASE_HEADLINERS";
export interface AiPromotionStrategy{
 identity:AiPromotionIdentity;focus:AiQuarterFocus;
}
export interface AiStrategicProfile{
 worldSeed:string;promotionId:string;year:number;week:number;
 riskTolerance:number;matchQualityPreference:number;starPreference:number;
}
export function aiPromotionIdentity(profile:Pick<AiStrategicProfile,
 "riskTolerance"|"matchQualityPreference"|"starPreference">):AiPromotionIdentity{
 if(![profile.riskTolerance,profile.matchQualityPreference,profile.starPreference]
  .every(n=>Number.isFinite(n)&&n>=0&&n<=100))
  throw new Error("Invalid AI identity preferences");
 const options=[
  {kind:"WORKRATE" as const,score:profile.matchQualityPreference},
  {kind:"SPECTACLE" as const,score:profile.riskTolerance},
  {kind:"STAR_POWER" as const,score:profile.starPreference}
 ].sort((a,b)=>b.score-a.score);
 return options[0]!.score<58?"STORYTELLING":options[0]!.kind;
}
export function aiPromotionStrategy(profile:AiStrategicProfile):AiPromotionStrategy{
 const identity=aiPromotionIdentity(profile);
 if(!profile.promotionId||!profile.worldSeed||
  !Number.isSafeInteger(profile.year)||profile.year<1||
  !Number.isInteger(profile.week)||profile.week<1||profile.week>52)
  throw new Error("Invalid AI seasonal strategy");
 let seed=0;
 for(const x of profile.worldSeed+":"+profile.promotionId)
  seed=(Math.imul(seed,31)+x.charCodeAt(0))>>>0;
 const quarter=(profile.year-1)*4+Math.floor((profile.week-1)/13);
 const options:readonly AiQuarterFocus[]=[
  "BUILD_STARS","PAY_OFF_RIVALRIES","SHOWCASE_HEADLINERS"];
 return {identity,focus:options[(seed+quarter)%options.length]!};
}
export const AI_IDENTITY_LABELS:Record<AiPromotionIdentity,string>={
 WORKRATE:"In-ring specialists",
 SPECTACLE:"High-octane spectacle",
 STAR_POWER:"Star-driven wrestling",
 STORYTELLING:"Story-first wrestling"
};
