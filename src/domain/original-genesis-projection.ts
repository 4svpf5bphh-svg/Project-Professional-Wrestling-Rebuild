/** One-time adapter for an ORIGINAL PPW Genesis WorldState.
 * Deliberately projects ONLY rows required by the relational rebuild.
 * The input remains in process memory; neither the full World JSON nor
 * historic event arrays are persisted or queried during normal play.
 */
import {requireEconomics,type PersonEconomics,type Role,type Creative,
 type Family} from "./contract-economics.js";
import {validatePortablePersona} from "./portable-persona.js";
import type {PortablePersona} from "./portable-identity-types.js";
type DateParts={year:number;week:number;day:number};
type Status="ACTIVE"|"INJURED"|"RETIRED";
type Tier="GLOBAL"|"NATIONAL"|"RISING"|"INDEPENDENT"|"LOCAL";
export interface OriginalGenesisSource {
 world:{id:string;name:string;seed:number;rulesetVersion:string;currentDate:DateParts};
 ruleset:{version:string;weeksPerYear:number;offerAcceptanceThreshold:number;injuryRateMultiplier:number;
  majorEventIntervalWeeks:number};
 promotions:Array<{id:string;worldId:string;name:string;tier:Tier;lifecycle:string;
  controllerType:"AI"|"HUMAN";
  playerTakeoverEligibility:"LOCKED"|"STANDARD";
  identity?:{origin:"REAL_WORLD"|"FICTIONAL";parentPromotionId?:string|null};
  cash:number;debt:number;mediaReach:number;
  weeklyMediaIncome:number;weeklySponsorIncome:number;weeklyFixedOverhead:number;
  lastWeeklyNet:number;financialDistress:string;homeMarketId:string;
  eventCadenceWeeks:number;aiProfile:{financialCaution:number;riskTolerance:number;
    matchQualityPreference:number;starPreference:number}}>;
 people:Array<{id:string;worldId:string;name:string;status:Status;
  careerStage:PersonEconomics["careerStage"];morale:number;
  biologicalAge?:number;careerExperience?:number;developmentAptitude?:number;generatedTalent?:boolean;
  recognition:number;popularity:number;momentum:number;fatigue:number;wear:number;
  skills:{inRingQuality:number;matchCraft:number;presentation:number;stamina:number;safety:number};
  priorities:PersonEconomics["priorities"];
  bookingDivision?:"MEN"|"WOMEN"|null;
  defaultAlignment?:"FACE"|"HEEL"|"TWEENER"|null;
  portableGimmickId?:string|null}>;
 markets:Array<{id:string;worldId:string;name:string;audiencePotential:number;
  wrestlingInterest:number;spendingIndex:number}>;
 promotionMarketStates:Array<{worldId:string;promotionId:string;marketId:string;
  awareness:number;liveStrength:number;loyalty:number}>;
 /** Exact records from original-main promotionStandings; never infer values. */
 promotionStandings:Array<{worldId:string;promotionId:string;prestige:number;
  fanReputation:number;businessReputation:number;talentReputation:number;
  lastEvaluatedYear:number}>;
 venues:Array<{id:string;worldId:string;name:string;marketId:string;capacity:number;
  weeklyHireCost:number;prestige:number;productionSuitability:number}>;
 /** Direct original-main tag-team identities, never synthetic pairings. */
 teams?:Array<{id:string;worldId:string;name:string;status:"ACTIVE"|"DISBANDED"}>;
 teamMemberships?:Array<{teamId:string;worldId:string;personId:string;active:boolean}>;
 /** Original roster identity, distinct from who legally signs/pays the contract. */
 wrestlerPromotionAffiliations?:Array<{worldId:string;personId:string;
  promotionId:string;role:"PRIMARY"|"SECONDARY";basis:"CONTRACT"|"PARENT_COMPANY"}>;
 /** Exact wrestler-owned onscreen persona from genuine main's fresh World. */
 personas?:Array<{personId:string;persona:PortablePersona}>;

 contracts:Array<{id:string;worldId:string;personId:string;promotionId:string;
  status:"SIGNED"|"EXPIRED"|"TERMINATED";family:Family;
  exclusivity:"OPEN"|"NON_EXCLUSIVE"|"EXCLUSIVE";
  startDate:DateParts;endDate:DateParts;datesUsed:number;dateEntitlement:number;
  weeklyGuarantee:number;appearanceFee:number;signingBonus:number;
  roleExpectation:Role;creativeControl?:Creative}>;
}
export interface GenesisProjection {
 world:{id:string;name:string;seed:number;rulesetVersion:string;acceptance:number;injury:number;
 majorEventIntervalWeeks:number};
 markets:Array<{id:string;name:string;audiencePotential:number;
  wrestlingInterest:number;spendingIndex:number}>;
 promotionMarketStates:Array<{promotionId:string;marketId:string;
  awareness:number;liveStrength:number;loyalty:number}>;
 promotionStandings:Array<{promotionId:string;prestige:number;fanReputation:number;
  businessReputation:number;talentReputation:number;lastEvaluatedYear:number}>;
 promotions:Array<{id:string;name:string;homeMarketId:string;tier:Tier;lifecycle:string;mode:string;
 takeoverEligibility:"LOCKED"|"STANDARD";parentPromotionId:string|null;
 cash:number;debt:number;media:number;eventCadenceWeeks:number;aiFinancialCaution:number;
 aiRiskTolerance:number;aiMatchQualityPreference:number;aiStarPreference:number;
 weeklyMedia:number;weeklySponsor:number;
 weeklyOverhead:number;lastWeeklyNet:number;distress:string}>;
 people:Array<{id:string;name:string;status:Status;careerStage:PersonEconomics["careerStage"];
 recognition:number;popularity:number;momentum:number;fatigue:number;wear:number;morale:number;
 biologicalAge:number|null;careerExperience:number|null;developmentAptitude:number|null;
 generatedTalent:boolean;
 ring:number;craft:number;presentation:number;stamina:number;safety:number;
 priorities:PersonEconomics["priorities"];division:string|null;
 alignment:string|null;gimmick:string|null}>;
 venues:Array<{id:string;name:string;marketId:string;capacity:number;cost:number;prestige:number;suitability:number}>;
 teams:Array<{id:string;name:string;status:"ACTIVE"|"DISBANDED"}>;
 teamMemberships:Array<{teamId:string;personId:string;active:boolean}>;
 rosterAffiliations:Array<{personId:string;promotionId:string;
  role:"PRIMARY"|"SECONDARY";basis:"CONTRACT"|"PARENT_COMPANY"}>;
 personas:Array<{personId:string;persona:PortablePersona}>;

 contracts:Array<{id:string;person:string;promotion:string;family:Family;status:string;
 remaining:number|null;start:number;expires:number;entitlement:number;weekly:number;
 appearance:number;bonus:number;role:Role;creative:Creative}>;
}
const isText=(x:unknown)=>typeof x==="string"&&x.trim().length>0&&x.length<=200;
const int=(x:unknown,min:number,max:number)=>Number.isSafeInteger(x)&&Number(x)>=min&&Number(x)<=max;
const stat=(x:unknown)=>typeof x==="number"&&Number.isFinite(x)&&x>=0&&x<=100;
const fee=(x:unknown)=>int(x,0,1_000_000_000);
const roles=new Set(["DEVELOPMENTAL","REGULAR","FEATURED","UPPER_CARD","MAIN_EVENT","SPECIAL_ATTRACTION"]);
const levels=new Set(["NONE","CONSULTATION","PROTECTED_FINISHES","FULL_APPROVAL"]);
const lifecycles=new Set(["FOUNDING","ACTIVE","DISTRESSED","STEWARDED","DORMANT","CLOSED"]);
const distress=new Set(["HEALTHY","WATCH","DISTRESSED","CRISIS"]);
function weekIndex(d:DateParts):number{
 if(!d||!int(d.year,1,100_000)||!int(d.week,1,52)||!int(d.day,1,7))
  throw new Error("Invalid original PPW date");
 return (d.year-1)*52+d.week-1;
}
function unique(names:readonly string[],label:string){
 if(new Set(names).size!==names.length)throw new Error("Duplicate "+label+" identity");
}
/** Reject partial, modified or historical Worlds. This is fresh-Genesis bootstrap,
 * NOT a saved-game migration or a reset of any live database.
 */
export function projectOriginalGenesis(source:OriginalGenesisSource):GenesisProjection{
 if(!source||!source.world||!source.ruleset
 ||!isText(source.world.id)||!isText(source.world.name)
 ||!isText(source.world.rulesetVersion)||source.world.rulesetVersion!==source.ruleset.version
 ||!int(source.world.seed,0,4294967295)||source.ruleset.weeksPerYear!==52
 ||weekIndex(source.world.currentDate)!==0||source.world.currentDate.day!==1
 ||!stat(source.ruleset.offerAcceptanceThreshold)
 ||!Number.isFinite(source.ruleset.injuryRateMultiplier)
 ||source.ruleset.injuryRateMultiplier<0||source.ruleset.injuryRateMultiplier>10
 ||Math.round(source.ruleset.injuryRateMultiplier*1000)/1000!==source.ruleset.injuryRateMultiplier)
 throw new Error("Expected a fresh 52-week original PPW Genesis World");
 if(!Array.isArray(source.promotions)||source.promotions.length<1||source.promotions.length>128
 ||!Array.isArray(source.people)||source.people.length<1||source.people.length>2500
 ||!Array.isArray(source.markets)||source.markets.length<1||source.markets.length>128
 ||!Array.isArray(source.promotionMarketStates)||source.promotionMarketStates.length<1
 ||source.promotionMarketStates.length>16384
 ||!Array.isArray(source.promotionStandings)
 ||source.promotionStandings.length!==source.promotions.length
 ||!Array.isArray(source.venues)||source.venues.length<1||source.venues.length>2048
 ||!Array.isArray(source.contracts)||source.contracts.length>10000)
 throw new Error("Original Genesis population outside import bounds");
 const worldId=source.world.id;
 unique(source.promotions.map(p=>p.id),"promotion");
 unique(source.people.map(p=>p.id),"wrestler");
 unique(source.markets.map(p=>p.id),"market");
 unique(source.venues.map(p=>p.id),"venue");
 unique(source.contracts.map(p=>p.id),"contract");
 const markets=source.markets.map(m=>{
  if(!isText(m.id)||m.worldId!==worldId||!isText(m.name)
    ||![m.audiencePotential,m.wrestlingInterest].every(stat)
    ||!Number.isFinite(m.spendingIndex)||m.spendingIndex<0||m.spendingIndex>1000)
    throw new Error("Invalid original market: "+m.id);
  return {id:m.id,name:m.name,audiencePotential:m.audiencePotential,
   wrestlingInterest:m.wrestlingInterest,spendingIndex:m.spendingIndex};
 });
 const marketIds=new Set(markets.map(m=>m.id));
 if(!int(source.ruleset.majorEventIntervalWeeks,1,104))
  throw new Error("Invalid original major event interval");
 const promotions=source.promotions.map(p=>{
  if(!isText(p.id)||p.worldId!==worldId||!isText(p.name)
   ||!isText(p.homeMarketId)||!marketIds.has(p.homeMarketId)
   ||!int(p.eventCadenceWeeks,1,52)||!stat(p.aiProfile?.financialCaution)
   ||!stat(p.aiProfile?.riskTolerance)||!stat(p.aiProfile?.matchQualityPreference)
   ||!stat(p.aiProfile?.starPreference)
   ||!["GLOBAL","NATIONAL","RISING","INDEPENDENT","LOCAL"].includes(p.tier)
   ||!lifecycles.has(p.lifecycle)||!["AI","HUMAN"].includes(p.controllerType)
   ||!["LOCKED","STANDARD"].includes(p.playerTakeoverEligibility)
   ||(p.identity?.parentPromotionId!=null&&!isText(p.identity.parentPromotionId))
   ||(p.identity?.origin==="REAL_WORLD"&&p.playerTakeoverEligibility!=="LOCKED")
   ||(p.identity!==undefined&&
    !["REAL_WORLD","FICTIONAL"].includes(p.identity.origin))
   ||!int(p.cash,-2_000_000_000_000,2_000_000_000_000)
   ||!int(p.debt,0,2_000_000_000_000)||!stat(p.mediaReach)
   ||![p.weeklyMediaIncome,p.weeklySponsorIncome,p.weeklyFixedOverhead].every(fee)
   ||!int(p.lastWeeklyNet,-1_000_000_000_000,1_000_000_000_000)
   ||!distress.has(p.financialDistress))
   throw new Error("Incomplete original promotion finance profile: "+p.id);
  return {id:p.id,name:p.name,homeMarketId:p.homeMarketId,tier:p.tier,lifecycle:p.lifecycle,
   mode:p.controllerType,takeoverEligibility:p.playerTakeoverEligibility,
   parentPromotionId:p.identity?.parentPromotionId??null,
   cash:p.cash,debt:p.debt,media:p.mediaReach,
   eventCadenceWeeks:p.eventCadenceWeeks,aiFinancialCaution:p.aiProfile.financialCaution,
   aiRiskTolerance:p.aiProfile.riskTolerance,
   aiMatchQualityPreference:p.aiProfile.matchQualityPreference,
   aiStarPreference:p.aiProfile.starPreference,
   weeklyMedia:p.weeklyMediaIncome,weeklySponsor:p.weeklySponsorIncome,
   weeklyOverhead:p.weeklyFixedOverhead,lastWeeklyNet:p.lastWeeklyNet,
   distress:p.financialDistress};
 });
 const knownPromotions=new Set(promotions.map(p=>p.id));
 for(const p of promotions)if(p.parentPromotionId!==null&&
  (!knownPromotions.has(p.parentPromotionId)||p.parentPromotionId===p.id))
  throw new Error("Invalid original parent-company promotion");
 // Source-only ratings: no tier, finance or media heuristics.
 unique(source.promotionStandings.map(s=>s.promotionId),"promotion standing");
 const promotionStandings=source.promotionStandings.map(s=>{
  if(s.worldId!==worldId||!knownPromotions.has(s.promotionId)
   ||![s.prestige,s.fanReputation,s.businessReputation,s.talentReputation].every(stat)
   ||!int(s.lastEvaluatedYear,0,source.world.currentDate.year))
   throw new Error("Invalid original promotion standing");
  return {promotionId:s.promotionId,prestige:s.prestige,
   fanReputation:s.fanReputation,businessReputation:s.businessReputation,
   talentReputation:s.talentReputation,lastEvaluatedYear:s.lastEvaluatedYear};
 });
 if(new Set(promotionStandings.map(s=>s.promotionId)).size!==promotions.length)
  throw new Error("Missing original promotion standing");
 unique(source.promotionMarketStates.map(s=>s.promotionId+"\\u0000"+s.marketId),"promotion-market");
 const promotionMarketStates=source.promotionMarketStates.map(m=>{
  if(m.worldId!==worldId||!knownPromotions.has(m.promotionId)||!marketIds.has(m.marketId)
   ||![m.awareness,m.liveStrength,m.loyalty].every(stat))
   throw new Error("Invalid original promotion market state");
  return {promotionId:m.promotionId,marketId:m.marketId,
    awareness:m.awareness,liveStrength:m.liveStrength,loyalty:m.loyalty};
 });
 for(const promotion of promotions)for(const market of markets)
  if(!promotionMarketStates.some(s=>s.promotionId===promotion.id&&s.marketId===market.id))
   throw new Error("Missing original promotion market state");
 const people=source.people.map(p=>{
  if(!isText(p.id)||p.worldId!==worldId||!isText(p.name)
   ||!["ACTIVE","INJURED","RETIRED"].includes(p.status)||!p.skills
   ||![p.skills.inRingQuality,p.skills.matchCraft,p.skills.presentation,
      p.skills.stamina,p.skills.safety].every(v=>int(v,0,100))
   ||![p.momentum,p.wear].every(stat)
   ||(p.biologicalAge!==undefined&&(!Number.isFinite(p.biologicalAge)||p.biologicalAge<0||p.biologicalAge>120))
   ||(p.careerExperience!==undefined&&!stat(p.careerExperience))
   ||(p.developmentAptitude!==undefined&&!stat(p.developmentAptitude))
   ||(p.generatedTalent!==undefined&&typeof p.generatedTalent!=="boolean")
   ||(p.bookingDivision!=null&&!["MEN","WOMEN"].includes(p.bookingDivision))
   ||(p.defaultAlignment!=null&&!["FACE","HEEL","TWEENER"].includes(p.defaultAlignment))
   ||(p.portableGimmickId!=null&&(!isText(p.portableGimmickId)||p.portableGimmickId.length>120)))
   throw new Error("Incomplete original wrestler identity: "+p.id);
  const economics:PersonEconomics={careerStage:p.careerStage,
   recognition:p.recognition,popularity:p.popularity,
   inRingQuality:p.skills.inRingQuality,matchCraft:p.skills.matchCraft,
   presentation:p.skills.presentation,stamina:p.skills.stamina,
   fatigue:p.fatigue,morale:p.morale,priorities:p.priorities};
  requireEconomics(economics);
  return {id:p.id,name:p.name,status:p.status,careerStage:p.careerStage,
   recognition:p.recognition,popularity:p.popularity,momentum:p.momentum,
   fatigue:p.fatigue,wear:p.wear,morale:p.morale,
   biologicalAge:p.biologicalAge??null,careerExperience:p.careerExperience??null,
   developmentAptitude:p.developmentAptitude??null,generatedTalent:p.generatedTalent??false,
   ring:p.skills.inRingQuality,craft:p.skills.matchCraft,
   presentation:p.skills.presentation,stamina:p.skills.stamina,safety:p.skills.safety,
   priorities:{...p.priorities},division:p.bookingDivision??null,
   alignment:p.defaultAlignment??null,gimmick:p.portableGimmickId??null};
 });
 const venues=source.venues.map(v=>{
  if(!isText(v.id)||v.worldId!==worldId||!isText(v.name)
   ||!marketIds.has(v.marketId)||!int(v.capacity,1,1_000_000)||!fee(v.weeklyHireCost)
   ||!stat(v.prestige)||!stat(v.productionSuitability))
   throw new Error("Incomplete original venue: "+v.id);
  return {id:v.id,name:v.name,marketId:v.marketId,capacity:v.capacity,cost:v.weeklyHireCost,
   prestige:v.prestige,suitability:v.productionSuitability};
 });
 const ids=new Set(people.map(p=>p.id)),promos=new Set(promotions.map(p=>p.id));
 // Fresh real teams, distinct from promotion-owned stables and booking sides.
 // Empty for legacy test fixtures; when provided, both collections must agree.
 if((source.teams===undefined)!==(source.teamMemberships===undefined))
  throw new Error("Original team roster and memberships must be supplied together");
 const sourceTeams=source.teams??[],sourceMembers=source.teamMemberships??[];
 if(sourceTeams.length>500||sourceMembers.length>1500)
  throw new Error("Original World has too many team identities");
 unique(sourceTeams.map(t=>t.id),"tag team");
 const teams=sourceTeams.map(t=>{
  if(!isText(t.id)||!isText(t.name)||t.worldId!==worldId||
   !["ACTIVE","DISBANDED"].includes(t.status))
   throw new Error("Invalid original tag team");
  return {id:t.id,name:t.name,status:t.status};
 });
 const teamIds=new Set(teams.map(t=>t.id));
 unique(sourceMembers.map(x=>x.teamId+"\\u0000"+x.personId),"team membership");
 const teamMemberships=sourceMembers.map(m=>{
  const team=teams.find(t=>t.id===m.teamId);
  if(m.worldId!==worldId||!teamIds.has(m.teamId)||!ids.has(m.personId)||
   typeof m.active!=="boolean"||(m.active&&team?.status!=="ACTIVE"))
   throw new Error("Invalid original tag team member");
  return {teamId:m.teamId,personId:m.personId,active:m.active};
 });
 // Unlike a generic roster guide, these records carry the *exact* character
 // and signature/finisher names actually seeded by the original main factory.
 // Legacy small test fixtures may omit this collection; authentic exports may
 // not. Verify every wrestler has exactly one World-owned valid persona.
 const incomingPersonas=source.personas??[];
 if(!Array.isArray(incomingPersonas)||incomingPersonas.length>2500||
  (source.personas!==undefined&&incomingPersonas.length!==people.length))
  throw new Error("Incomplete original wrestler-owned persona population");
 unique(incomingPersonas.map(x=>x.personId),"original portable persona");
 const byName=new Map(people.map(p=>[p.id,p.name]));
 const gimmicks=new Map(people.map(p=>[p.id,p.gimmick]));
 const personas=incomingPersonas.map(x=>{
  if(!byName.has(x.personId))throw new Error("Persona references missing wrestler");
  const persona=validatePortablePersona(x.persona,byName.get(x.personId)!);
  if(persona.gimmickId!==gimmicks.get(x.personId))
   throw new Error("Original portable persona differs from wrestler identity");
  return {personId:x.personId,persona};
 });
 const contracts=source.contracts.map(c=>{
  if(!isText(c.id)||c.worldId!==worldId||!ids.has(c.personId)||!promos.has(c.promotionId)
   ||!["SIGNED","EXPIRED","TERMINATED"].includes(c.status)
   ||!["ONE_OFF","LIMITED_NON_EXCLUSIVE","EXCLUSIVE"].includes(c.family)
   ||!roles.has(c.roleExpectation)||!levels.has(c.creativeControl??"NONE")
   ||!int(c.dateEntitlement,1,104)||!int(c.datesUsed,0,c.dateEntitlement)
   ||![c.weeklyGuarantee,c.appearanceFee,c.signingBonus].every(fee))
   throw new Error("Invalid original contract: "+c.id);
  const start=weekIndex(c.startDate),expires=weekIndex(c.endDate);
  if(expires<start
   ||(c.family==="EXCLUSIVE"&&(c.exclusivity!=="EXCLUSIVE"||c.appearanceFee!==0))
   ||(c.family==="LIMITED_NON_EXCLUSIVE"&&c.exclusivity!=="NON_EXCLUSIVE")
   ||(c.family==="ONE_OFF"&&(c.exclusivity!=="OPEN"||c.dateEntitlement!==1
     ||c.weeklyGuarantee!==0||expires!==start)))
   throw new Error("Incompatible original contract terms: "+c.id);
  return {id:c.id,person:c.personId,promotion:c.promotionId,family:c.family,
   status:c.status,remaining:c.family==="EXCLUSIVE"?null:c.dateEntitlement-c.datesUsed,
   start,expires,entitlement:c.dateEntitlement,weekly:c.weeklyGuarantee,
   appearance:c.appearanceFee,bonus:c.signingBonus,role:c.roleExpectation,
   creative:c.creativeControl??"NONE"};
 });
 // Preserve wrestler-owned roster identity, including legal cross-promotion
 // appearances for original parent-company brands such as NXT and ROH.
 // A third-party affiliation never grants an uncontracted appearance.
 const incomingAffiliations=source.wrestlerPromotionAffiliations??[];
 if(!Array.isArray(incomingAffiliations)||incomingAffiliations.length>5000)
  throw new Error("Original roster affiliations exceed import bounds");
 unique(incomingAffiliations.map(a=>a.personId+"\\u0000"+a.promotionId),
  "original wrestler affiliation");
 const parents=new Map(promotions.map(p=>[p.id,p.parentPromotionId]));
 const rosterAffiliations=incomingAffiliations.map(a=>{
  if(a.worldId!==worldId||!ids.has(a.personId)||
   !knownPromotions.has(a.promotionId)||
   !["PRIMARY","SECONDARY"].includes(a.role)||
   !["CONTRACT","PARENT_COMPANY"].includes(a.basis))
   throw new Error("Invalid original wrestler roster affiliation");
  const contractPromotion=a.basis==="PARENT_COMPANY"?
   parents.get(a.promotionId):a.promotionId;
  if(!contractPromotion||!contracts.some(c=>c.person===a.personId&&
   c.promotion===contractPromotion&&c.status==="SIGNED"))
   throw new Error("Original wrestler affiliation lacks owner contract");
  return {personId:a.personId,promotionId:a.promotionId,
   role:a.role,basis:a.basis};
 });
 // A unique exclusive index alone does not reject overlapping non-exclusive
 // contracts; enforce the original worldwide exclusivity invariant before SQL.
 const byPerson=new Map<string,typeof contracts>();
 for(const c of contracts.filter(c=>c.status==="SIGNED")){
  const list=byPerson.get(c.person)??[];
  for(const other of list){
   if((c.family==="EXCLUSIVE"||other.family==="EXCLUSIVE")
      &&c.start<=other.expires&&other.start<=c.expires)
    throw new Error("Conflicting global exclusive rights for "+c.person);
  }
  list.push(c);byPerson.set(c.person,list);
 }
 return {world:{id:worldId,name:source.world.name,seed:source.world.seed,
  rulesetVersion:source.world.rulesetVersion,acceptance:source.ruleset.offerAcceptanceThreshold,
  injury:source.ruleset.injuryRateMultiplier,
  majorEventIntervalWeeks:source.ruleset.majorEventIntervalWeeks},
  markets,promotionMarketStates,promotionStandings,promotions,people,venues,
  teams,teamMemberships,rosterAffiliations,personas,contracts};
}
