/** Original PPW main: packages/sim-core/src/reputation.ts
 * Annual evidence blending only. All inputs must be actual persisted metrics;
 * this module neither guesses missing records nor touches a database.
 */
export type StandingTier="GLOBAL"|"NATIONAL"|"RISING"|"INDEPENDENT"|"LOCAL";
export type Distress="HEALTHY"|"WATCH"|"DISTRESSED"|"CRISIS";
export interface StandingValues {
 prestige:number;fanReputation:number;businessReputation:number;
 talentReputation:number;
}
export interface StandingEvidence {
 tier:StandingTier;lifecycle:string;distress:Distress;mediaReach:number;
 completed:number;cancelled:number;
 meanCrowd:number|null;meanDemand:number|null;topFiveLoyalty:number|null;
 majorCount:number;majorScore:number|null;championshipPrestige:number|null;
 rosterCount:number;rosterUsed:number;renewalAccepted:number;renewalRejected:number;
 restructures:number;terminations:number;
}
const tiers:Record<StandingTier,number>={GLOBAL:90,NATIONAL:74,RISING:57,INDEPENDENT:40,LOCAL:25};
const finances:Record<Distress,number>={HEALTHY:88,WATCH:66,DISTRESSED:40,CRISIS:18};
const clamp=(n:number)=>Math.max(0,Math.min(100,n));
const round1=(n:number)=>Math.round(n*10)/10;
const blend=(current:number,evidence:number,weight:number)=>
 round1(clamp(current+(evidence-current)*weight));
const safe=(value:number)=>Number.isFinite(value)&&value>=0&&value<=100;
export function evaluateAnnualStanding(old:StandingValues,e:StandingEvidence):StandingValues {
 if(!Object.hasOwn(tiers,e.tier)||!Object.hasOwn(finances,e.distress)||
  ![old.prestige,old.fanReputation,old.businessReputation,old.talentReputation,
    e.mediaReach].every(safe)||![e.completed,e.cancelled,e.majorCount,e.rosterCount,
    e.rosterUsed,e.renewalAccepted,e.renewalRejected,e.restructures,e.terminations]
   .every(x=>Number.isSafeInteger(x)&&x>=0)||
  e.rosterUsed>e.rosterCount||e.majorCount>e.completed||
  (e.completed>0&&(e.meanCrowd===null||e.meanDemand===null))||
  (e.majorCount>0&&e.majorScore===null)||
  [e.meanCrowd,e.meanDemand,e.topFiveLoyalty,e.majorScore,e.championshipPrestige]
   .some(x=>x!==null&&!Number.isFinite(x)))
  throw new Error("Incomplete verified annual standing evidence");
 const inactive=e.lifecycle==="DORMANT"||e.lifecycle==="CLOSED";
 const crowd=e.completed>0?e.meanCrowd!:inactive?20:35;
 const demand=e.completed>0?e.meanDemand!:inactive?15:30;
 const loyalty=e.topFiveLoyalty??20;
 const fan=round1(clamp(crowd*.5+demand*.3+loyalty*.2));
 const decided=e.completed+e.cancelled;
 const reliability=decided>0?e.completed/decided*100:inactive?15:50;
 const business=round1(clamp(finances[e.distress]*.48+reliability*.32+
  e.mediaReach*.2-e.restructures*8));
 const usage=e.rosterCount===0?20:round1(e.rosterUsed/e.rosterCount*100);
 const resolved=e.renewalAccepted+e.renewalRejected;
 const renewals=resolved?round1(e.renewalAccepted/resolved*100):60;
 const continuity=clamp(100-e.terminations*18-e.restructures*8);
 const talent=inactive?15:round1(Math.max(30,Math.min(90,
  usage*.45+renewals*.3+continuity*.25-e.terminations*5-e.restructures*3)));
 const major=e.majorCount>0?e.majorScore!:35;
 const prestige=round1(clamp(tiers[e.tier]*.3+
  (e.championshipPrestige??30)*.25+major*.25+fan*.2));
 return {
  fanReputation:blend(old.fanReputation,fan,.35),
  businessReputation:blend(old.businessReputation,business,.3),
  talentReputation:blend(old.talentReputation,talent,.22),
  prestige:blend(old.prestige,prestige,
   prestige>=old.prestige?.18:.04)
 };
}
