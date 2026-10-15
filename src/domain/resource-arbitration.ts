import {createHash} from "node:crypto";

/** A candidate claim is a booking intention, NEVER an executed show.
 * Priority is calculated from fixed World seed/week/resource/promotion.
 * Neither the submission time, command ID nor editable show ID is used.
 */
export interface ResourceClaim {
  kind:"VENUE"|"WRESTLER";
  resourceId:string;day:number;promotionId:string;showId:string;
  weeklyCapacity?:number;
}
export interface ArbitrationContext {worldId:string;worldSeed:string;year:number;week:number}
export interface ArbitrationOutcome {
  kind:"VENUE"|"WRESTLER";resourceId:string;day:number;
  reason:"SAME_DAY"|"WEEKLY_CAPACITY";
  denied:{promotionId:string;showId:string};
  protected:{promotionId:string;showId:string}[];
}
export interface ArbitrationPlan {
  fingerprint:string;
  outcomes:ArbitrationOutcome[];
  contestedPromotions:string[];
}

/** Pure, permutation-independent tie-breaking and weekly capacity allocation.
 * Losing a claim is a staff/AI remediation obligation: a proposed decision
 * NEVER silently changes a scripted match, segment or show.
 */
export function planResourceArbitration(context:ArbitrationContext,claims:readonly ResourceClaim[]):ArbitrationPlan {
  if(!context.worldId || !context.worldSeed ||
     !Number.isSafeInteger(context.year)||context.year<1 ||
     !Number.isSafeInteger(context.week)||context.week<1||context.week>52)
    throw new Error("Invalid arbitration World");
  if(claims.length>12800)throw new Error("Arbitration claim limit exceeded");
  const keys=new Set<string>();
  const sorted=[...claims].sort((a,b)=>
    [a.kind,a.resourceId,String(a.day),a.promotionId,a.showId].join("\u0000")
      .localeCompare([b.kind,b.resourceId,String(b.day),b.promotionId,b.showId].join("\u0000"),"en"));
  for(const c of sorted){
    if(!c.resourceId || !c.showId || !c.promotionId ||
      !Number.isSafeInteger(c.day)||c.day<1||c.day>7) throw new Error("Invalid arbitration claim");
    if(c.kind!=="VENUE"&&c.kind!=="WRESTLER")throw new Error("Unknown arbitration resource kind");
    if(c.kind==="WRESTLER"&&(!Number.isSafeInteger(c.weeklyCapacity)||c.weeklyCapacity!<1||c.weeklyCapacity!>7))
      throw new Error("Invalid wrestler service capacity");
    const key=[c.kind,c.resourceId,c.promotionId].join("\u0000");
    if(keys.has(key)) throw new Error("Duplicate promotion/resource claim");
    keys.add(key);
  }
  // Canonical source fingerprint enables a future persistent decision receipt
  // to reject stale cards without trusting a timestamp or submission order.
  const fingerprint=createHash("sha256").update(JSON.stringify({
    worldId:context.worldId,seed:context.worldSeed,year:context.year,week:context.week,claims:sorted,
  })).digest("hex");
  const score=(c:ResourceClaim)=>createHash("sha256").update(JSON.stringify([
    "ppw-resource-v1",context.worldId,context.worldSeed,context.year,context.week,
    c.kind,c.resourceId,c.promotionId,
  ])).digest("hex");
  const ranked=(items:ResourceClaim[])=>[...items].sort((a,b)=>{
    const sa=score(a),sb=score(b);
    return sa===sb?a.promotionId.localeCompare(b.promotionId,"en"):sa<sb?-1:1;
  });
  const venues=new Map<string,ResourceClaim[]>();
  const wrestlers=new Map<string,ResourceClaim[]>();
  for(const claim of sorted){
    const key=claim.kind==="VENUE"?claim.resourceId+"\u0000"+claim.day:claim.resourceId;
    const into=claim.kind==="VENUE"?venues:wrestlers;
    const arr=into.get(key)??[];arr.push(claim);into.set(key,arr);
  }
  const outcomes:ArbitrationOutcome[]=[];
  const show=(c:ResourceClaim)=>({promotionId:c.promotionId,showId:c.showId});
  for(const candidates of venues.values()){
    if(candidates.length<=1)continue;
    const ordered=ranked(candidates);
    const winner=ordered[0]!;
    for(const loser of ordered.slice(1))outcomes.push({
      kind:"VENUE",resourceId:winner.resourceId,day:winner.day,reason:"SAME_DAY",
      denied:show(loser),protected:[show(winner)],
    });
  }
  for(const candidates of wrestlers.values()){
    const caps=new Set(candidates.map(c=>c.weeklyCapacity));
    if(caps.size!==1)throw new Error("Inconsistent wrestler capacity");
    const capacity=candidates[0]!.weeklyCapacity!;
    const accepted:ResourceClaim[]=[];
    const days=new Map<number,ResourceClaim>();
    for(const candidate of ranked(candidates)){
      const sameDay=days.get(candidate.day);
      if(sameDay)outcomes.push({
        kind:"WRESTLER",resourceId:candidate.resourceId,day:candidate.day,
        reason:"SAME_DAY",denied:show(candidate),protected:[show(sameDay)],
      });
      else if(accepted.length>=capacity)outcomes.push({
        kind:"WRESTLER",resourceId:candidate.resourceId,day:candidate.day,
        reason:"WEEKLY_CAPACITY",denied:show(candidate),protected:accepted.map(show),
      });
      else {days.set(candidate.day,candidate);accepted.push(candidate);}
    }
  }
  outcomes.sort((a,b)=>JSON.stringify([a.kind,a.resourceId,a.day,a.denied.promotionId,a.reason])
    .localeCompare(JSON.stringify([b.kind,b.resourceId,b.day,b.denied.promotionId,b.reason]),"en"));
  return {fingerprint,outcomes,
    contestedPromotions:[...new Set(outcomes.flatMap(o=>[
      o.denied.promotionId,...o.protected.map(p=>p.promotionId),
    ]))].sort()};
}
