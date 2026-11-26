/** AI rivals develop recognisable booking preferences and a stable quarterly
 * priority. Only existing original-World attributes determine the identity.
 * This has no separate scheduler, persistent meter or effect on human cards.
 */
import type {CertifiedContenderResult} from "./earned-contenders.js";

export type AiPromotionIdentity="WORKRATE"|"SPECTACLE"|"STAR_POWER"|"STORYTELLING";
export type AiQuarterFocus="BUILD_STARS"|"PAY_OFF_RIVALRIES"|"SHOWCASE_HEADLINERS";
export interface AiPromotionStrategy{
 identity:AiPromotionIdentity;focus:AiQuarterFocus;
 cautious?:boolean;
}
export interface AiStrategicProfile{
 worldSeed:string;promotionId:string;year:number;week:number;
 riskTolerance:number;matchQualityPreference:number;starPreference:number;
 circumstances?:{
  tier:string;distress:string|null;mediaReach:number|null;
  prestige:number|null;fanReputation:number|null;financialCaution:number|null;
  roster:readonly {careerStage?:string|null;popularity:number;presentation:number;matchCraft:number}[];
  recentForm:readonly CertifiedContenderResult[];premiumSoon:boolean;broadcast:boolean;
 };
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
 const c=profile.circumstances;
 const cautious=!!c&&(c.distress==="CRISIS"||c.distress==="DISTRESSED"||
  ((c.tier==="LOCAL"||c.tier==="INDEPENDENT")&&
   (profile.riskTolerance<45||(c.financialCaution??0)>=80)));
 const average=(stat:"presentation"|"matchCraft")=>c?.roster.length?
  c.roster.reduce((sum,p)=>sum+p[stat],0)/c.roster.length:50;
 const clamp=(n:number)=>Math.max(0,Math.min(100,n));
 const identity=aiPromotionIdentity(c?{
  riskTolerance:clamp(profile.riskTolerance-(cautious?16:0)+Math.max(0,average("presentation")-60)*.2),
  matchQualityPreference:clamp(profile.matchQualityPreference+(average("matchCraft")-55)*.24+
   ((c.fanReputation??50)-50)*.06),
  starPreference:clamp(profile.starPreference+((c.mediaReach??50)-50)*.12+((c.prestige??50)-50)*.06+
   (c.broadcast&&c.roster.some(p=>p.popularity>=75)?5:0)),
 }:profile);
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
 const established=options[(seed+quarter)%options.length]!;
 if(!c)return {identity,focus:established};
 const strongMatches=c.recentForm.filter(r=>(r.ratingStars??0)>=3.5).length;
 const developing=c.roster.filter(p=>p.careerStage==="PROSPECT").length;
 const focus=c.premiumSoon?"PAY_OFF_RIVALRIES":
  cautious||developing>=Math.max(3,c.roster.length/4)?"BUILD_STARS":
  c.broadcast&&strongMatches>=5&&c.roster.some(p=>p.popularity>=75)?"SHOWCASE_HEADLINERS":established;
 return {identity,focus,cautious};
}
export const AI_IDENTITY_LABELS:Record<AiPromotionIdentity,string>={
 WORKRATE:"In-ring specialists",
 SPECTACLE:"High-octane spectacle",
 STAR_POWER:"Star-driven wrestling",
 STORYTELLING:"Story-first wrestling"
};
