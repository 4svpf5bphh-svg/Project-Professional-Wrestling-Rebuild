/** Port of original packages/sim-core/src/contracts.ts and creative-control.ts.
 * Operates on person-scoped relational rows; never loads or mutates a World blob.
 * Keep these coefficients in parity with the original until playtest balancing.
 */
export type Family="ONE_OFF"|"LIMITED_NON_EXCLUSIVE"|"EXCLUSIVE";
export type Creative="NONE"|"CONSULTATION"|"PROTECTED_FINISHES"|"FULL_APPROVAL";
export type Role="DEVELOPMENTAL"|"REGULAR"|"FEATURED"|"UPPER_CARD"|"MAIN_EVENT"|"SPECIAL_ATTRACTION";
export type Stage="PROSPECT"|"PRIME"|"VETERAN"|"SPECIAL_ATTRACTION";
export interface OfferTerms {
 family:Family;roleExpectation:Role;creativeControl:Creative;
 startWeekIndex:number;termWeeks:number;dateEntitlement:number;
 weeklyGuarantee:number;appearanceFee:number;signingBonus:number;
}
export interface PersonEconomics {
 recognition:number;popularity:number;inRingQuality:number;matchCraft:number;
 presentation:number;stamina:number;fatigue:number;careerStage:Stage;weeklyServiceCapacity?:number|null;
 morale:number; priorities:Record<"money"|"role"|"prestige"|"schedule"|"loyalty"|"exposure",number>;
}
export interface ExistingCommitment {
 contractId:string;family:Family;status:string;remainingDates:number|null;
 startWeekIndex:number;expiresWeekIndex:number;
}
const ROLES:Record<Role,number>={DEVELOPMENTAL:25,REGULAR:45,FEATURED:62,UPPER_CARD:76,MAIN_EVENT:90,SPECIAL_ATTRACTION:88};
const TIERS:Record<string,number>={LOCAL:25,INDEPENDENT:42,RISING:58,NATIONAL:75,GLOBAL:92};
const moneyKeys=["money","role","prestige","schedule","loyalty","exposure"] as const;
const validRoles=Object.keys(ROLES);
const validCreative=["NONE","CONSULTATION","PROTECTED_FINISHES","FULL_APPROVAL"];
function number(v:unknown):v is number{return typeof v==="number"&&Number.isFinite(v);}
function nonnegative(v:unknown):v is number{return Number.isSafeInteger(v)&&Number(v)>=0&&Number(v)<=1_000_000_000;}
export function requireEconomics(person:PersonEconomics):void {
 if(!person||!["PROSPECT","PRIME","VETERAN","SPECIAL_ATTRACTION"].includes(person.careerStage)
 || !["recognition","popularity","inRingQuality","matchCraft","presentation","stamina","fatigue","morale"].every(k=>number(person[k as keyof PersonEconomics])&&Number(person[k as keyof PersonEconomics])>=0&&Number(person[k as keyof PersonEconomics])<=100)
 || !person.priorities||!moneyKeys.every(k=>number(person.priorities[k])&&person.priorities[k]>=0)
 || moneyKeys.reduce((n,k)=>n+person.priorities[k],0)<=0) throw new Error("Original wrestler contract economics not imported");
}
export function validateOfferTerms(t:OfferTerms,currentWeek:number):void {
 if(!t||!["ONE_OFF","LIMITED_NON_EXCLUSIVE","EXCLUSIVE"].includes(t.family)
 || !validRoles.includes(t.roleExpectation)||!validCreative.includes(t.creativeControl)
 || !Number.isSafeInteger(t.startWeekIndex)||t.startWeekIndex<currentWeek||t.startWeekIndex>currentWeek+52
 || !Number.isSafeInteger(t.termWeeks)||t.termWeeks<1||t.termWeeks>52
 || !nonnegative(t.dateEntitlement)||t.dateEntitlement<1||t.dateEntitlement>104
 || !nonnegative(t.weeklyGuarantee)||!nonnegative(t.appearanceFee)||!nonnegative(t.signingBonus))
  throw new Error("Invalid contract terms");
 if(t.family==="ONE_OFF"&&(t.termWeeks!==1||t.dateEntitlement!==1||t.weeklyGuarantee!==0||t.creativeControl!=="NONE"))
  throw new Error("One-off agreements are one purchased appearance without weekly guarantee");
 if(t.family==="EXCLUSIVE"&&(t.appearanceFee!==0||t.dateEntitlement!==t.termWeeks))
  throw new Error("Exclusive employment has unlimited appearances and no appearance fee");
 if(t.family==="LIMITED_NON_EXCLUSIVE"&&t.dateEntitlement>2*t.termWeeks)
  throw new Error("Purchased appearances cannot exceed twice the contract weeks");
}
export function marketWeeklyValue(p:PersonEconomics):number {
 requireEconomics(p);
 const skill=(p.inRingQuality+p.matchCraft+p.presentation)/3;
 const mult=p.careerStage==="SPECIAL_ATTRACTION"?1.35:p.careerStage==="VETERAN"?1.1:p.careerStage==="PROSPECT"?0.75:1;
 return Math.round((500+p.recognition*50+p.popularity*30+skill*25)*mult);
}
/** The exclusive contract floor is a hard validation rule, not a prediction
 * of whether the wrestler will like or accept an offer. Public market values
 * and server economics use the same original market-value formula. */
export function minimumExclusiveWeeklyGuarantee(marketValue:number):number{
 if(!Number.isFinite(marketValue)||marketValue<0)
  throw new Error("Invalid wrestler market value");
 return Math.max(1,Math.ceil(marketValue*.5));
}
export function serviceCapacityDatesPerWeek(p:Pick<PersonEconomics,"careerStage"|"stamina"|"fatigue">):number {
 const base=p.careerStage==="PRIME"?1.9:p.careerStage==="PROSPECT"?1.55:p.careerStage==="VETERAN"?1.4:1;
 return base*(.8+p.stamina/250)*Math.max(.65,1-p.fatigue/200);
}
type ServiceProfile=Pick<PersonEconomics,"careerStage"|"stamina"|"fatigue"|"weeklyServiceCapacity">;
/** Purchased dates are flexible obligations, not fixed weekly reservations.
 * Existing show-day and weekly booking clearance remains authoritative.
 */
export function maxPurchasedDates(p:ServiceProfile,start:number,weeks:number,
 contracts:readonly ExistingCommitment[],currentWeek:number,ignoreContractId:string|null=null):number{
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(weeks)||weeks<1||weeks>104||start<currentWeek)return 0;
 const end=start+weeks-1;
 const signed=contracts.filter(c=>c.status==="SIGNED"&&c.contractId!==ignoreContractId&&c.expiresWeekIndex>=currentWeek);
 if(signed.some(c=>c.family==="EXCLUSIVE"&&c.startWeekIndex<=end&&c.expiresWeekIndex>=start))return 0;
 const weeklyLimit=Math.min(2,Math.max(0,p.weeklyServiceCapacity??2));
 const rate=Math.min(weeklyLimit,Math.max(0,serviceCapacityDatesPerWeek(p)));
 const capacity=(length:number)=>Math.min(weeklyLimit*length,Math.ceil(rate*length-.000001));
 const commitments=signed.filter(c=>c.family!=="EXCLUSIVE"&&(c.remainingDates??0)>0).map(c=>({
  start:Math.max(currentWeek,c.startWeekIndex),end:c.expiresWeekIndex,dates:c.remainingDates??0
 }));
 let left=start,right=end;
 for(let i=0;i<=commitments.length;i++){
  const relevant=commitments.filter(c=>c.start<=right&&c.end>=left);
  const lo=Math.min(left,...relevant.map(c=>c.start)),hi=Math.max(right,...relevant.map(c=>c.end));
  if(lo===left&&hi===right)break;left=lo;right=hi;
 }
 const relevant=commitments.filter(c=>c.start<=right&&c.end>=left);
 const starts=[...new Set([start,...relevant.map(c=>c.start).filter(n=>n<=start)])];
 const ends=[...new Set([end,...relevant.map(c=>c.end).filter(n=>n>=end)])];
 let maximum=Math.min(104,capacity(weeks));
 for(const lo of starts)for(const hi of ends){
  const used=relevant.reduce((sum,c)=>sum+(c.start>=lo&&c.end<=hi?c.dates:0),0);
  maximum=Math.min(maximum,capacity(hi-lo+1)-used);
 }
 return Math.max(0,maximum);
}
/** Exclusive rights can only extend up to the first competing signed term. */
export function maxExclusiveTermWeeks(start:number,contracts:readonly ExistingCommitment[]):number{
 if(!Number.isSafeInteger(start)||start<0)return 0;
 return Math.max(0,Math.min(52,...contracts.filter(c=>c.status==="SIGNED"&&c.expiresWeekIndex>=start)
  .map(c=>c.startWeekIndex-start)));
}
export function purchasedDateLimits(p:ServiceProfile,start:number,contracts:readonly ExistingCommitment[],currentWeek:number,ignoreContractId:string|null=null){
 return Array.from({length:52},(_,i)=>maxPurchasedDates(p,start,i+1,contracts,currentWeek,ignoreContractId));
}
export function canAcceptTerms(p:PersonEconomics,t:OfferTerms,contracts:readonly ExistingCommitment[],
 currentWeek:number,ignoreContractId:string|null=null):string|null {
 validateOfferTerms(t,currentWeek);requireEconomics(p);
 if(t.family==="EXCLUSIVE"&&t.weeklyGuarantee<minimumExclusiveWeeklyGuarantee(marketWeeklyValue(p)))
  return "exclusive guarantee below the original minimum wage";
 const end=t.startWeekIndex+t.termWeeks-1;
 const overlapping=contracts.filter(c=>c.status==="SIGNED"&&c.contractId!==ignoreContractId
 &&c.startWeekIndex<=end&&c.expiresWeekIndex>=t.startWeekIndex);
 if(t.family==="EXCLUSIVE")return overlapping.length?"exclusive offer overlaps another signed agreement":null;
 if(overlapping.some(c=>c.family==="EXCLUSIVE"))return "existing exclusive contract blocks outside work";
 return t.dateEntitlement>maxPurchasedDates(p,t.startWeekIndex,t.termWeeks,contracts,currentWeek,ignoreContractId)
  ?"service capacity exceeded":null;
}
export function canAddDates(p:PersonEconomics,source:ExistingCommitment,extra:number,
 others:readonly ExistingCommitment[],currentWeek:number):string|null{
 requireEconomics(p);
 if(source.status!=="SIGNED"||source.family!=="LIMITED_NON_EXCLUSIVE"
 ||source.expiresWeekIndex<currentWeek||source.startWeekIndex>currentWeek
 ||!Number.isSafeInteger(extra)||extra<1||extra>104) return "invalid date addendum";
 const weeks=source.expiresWeekIndex-currentWeek+1;
 const total=Math.max(0,source.remainingDates??0)+extra;
 if(total>Math.min(104,2*weeks))return "additional dates exceed remaining contract weeks";
 if(others.some(c=>c.status==="SIGNED"&&c.family==="EXCLUSIVE"
 &&c.startWeekIndex<=source.expiresWeekIndex&&c.expiresWeekIndex>=currentWeek))
  return "exclusive agreement blocks additional dates";
 return total>maxPurchasedDates(p,currentWeek,weeks,others,currentWeek,source.contractId)
  ?"additional dates exceed remaining-term service capacity":null;
}
function randomUtility(seed:string):number{
 let h=0x811c9dc5;
 for(let i=0;i<seed.length;i++){h^=seed.charCodeAt(i);h=Math.imul(h,0x01000193)}
 let s=(h>>>0)||0x6d2b79f5;s=(s+0x6d2b79f5)>>>0;
 let t=s;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);
 return ((t^(t>>>14))>>>0)/4294967296;
}
export function offerUtility(p:PersonEconomics,t:OfferTerms,context:{
 tier:string;mediaReach:number;hasPriorRelationship:boolean;trust:number;seed:string;offerId:string;
}):number{
 requireEconomics(p);
 const market=Math.max(1,marketWeeklyValue(p));
 const equivalent=t.weeklyGuarantee+t.signingBonus/t.termWeeks
 +(t.family==="EXCLUSIVE"?0:t.appearanceFee*t.dateEntitlement/t.termWeeks);
 const money=Math.max(0,Math.min(100,50+((equivalent-market*.7)/market)*65));
 const density=t.family==="EXCLUSIVE"?1:t.dateEntitlement/t.termWeeks;
 const schedule=Math.max(10,Math.min(100,92-density*35-(t.family==="EXCLUSIVE"?18:0)));
 const loyalty=Math.max(0,Math.min(100,(context.hasPriorRelationship?78:48)+(context.trust-50)*.3));
 const priority=p.priorities,total=moneyKeys.reduce((n,k)=>n+priority[k],0);
 const raw=(money*priority.money+ROLES[t.roleExpectation]*priority.role
 +(TIERS[context.tier]??0)*priority.prestige+schedule*priority.schedule
 +loyalty*priority.loyalty+context.mediaReach*priority.exposure)/total;
 const autonomy=(priority.role+priority.schedule)/total;
 const multiplier=Math.max(.85,Math.min(1.2,.9+autonomy*.45));
 const base=t.creativeControl==="NONE"?0:t.creativeControl==="CONSULTATION"?5:
  t.creativeControl==="PROTECTED_FINISHES"?12:20;
 const credibility=Math.max(.2,Math.min(1,(money-20)/30));
 const termCred=t.family==="ONE_OFF"?.35:Math.min(1,.65+t.termWeeks*.035);
 const bonus=Math.round(base*multiplier*10)/10;
 const rights=Math.round(bonus*credibility*termCred*10)/10;
 return Math.round((raw+rights+(randomUtility(context.seed+":"+context.offerId+":utility")*6-3))*10)/10;
}

/** Original DATES_ADDENDUM branch of evaluateContractOffer: incremental cash
 * per new appearance and stricter schedule density; no bonus from creative
 * control, since the parent agreement's rights cannot be rewritten.
 */
export function addendumUtility(p:PersonEconomics,source:{roleExpectation:Role;appearanceFee:number},
 extraDates:number,incrementalPayment:number,weeksRemaining:number,
 context:{tier:string;mediaReach:number;trust:number;seed:string;offerId:string}):number{
 requireEconomics(p);
 if(!validRoles.includes(source.roleExpectation)||!nonnegative(source.appearanceFee)
 ||!nonnegative(incrementalPayment)||!Number.isSafeInteger(extraDates)||extraDates<1
 ||!Number.isSafeInteger(weeksRemaining)||weeksRemaining<1)
  throw new Error("Invalid date addendum terms");
 const market=Math.max(1,marketWeeklyValue(p));
 const perDate=source.appearanceFee+incrementalPayment/extraDates;
 const money=Math.max(0,Math.min(100,50+((perDate-market*.8)/market)*65));
 const schedule=Math.max(10,Math.min(100,92-extraDates/weeksRemaining*55));
 const loyalty=Math.max(0,Math.min(100,78+(context.trust-50)*.3));
 const pr=p.priorities,total=moneyKeys.reduce((n,k)=>n+pr[k],0);
 const raw=(money*pr.money+ROLES[source.roleExpectation]*pr.role
  +(TIERS[context.tier]??0)*pr.prestige+schedule*pr.schedule
  +loyalty*pr.loyalty+context.mediaReach*pr.exposure)/total;
 return Math.round((raw+(randomUtility(context.seed+":"+context.offerId+":utility")*6-3))*10)/10;
}
