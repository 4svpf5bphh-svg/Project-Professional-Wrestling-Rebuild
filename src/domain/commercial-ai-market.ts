/** Certified-audience auction for the World’s finite fictional commercial slots.
 * Exactly one broadcaster and one sponsor can sign per rollover. Existing
 * human and AI contracts remain protected; player negotiations remain manual.
 * No database access or random calls: equal bids are resolved by stable ID.
 */
import {commercialOffers,COMMERCIAL_COMPANIES,type CommercialEvidence,
 type CommercialKind,type CommercialOffer} from "./commercial-offers.js";

export type AiCommercialCandidate=CommercialEvidence&{
 promotion_id:string;active_kinds:readonly string[];
};
export type AiCommercialAward={
 promotion:AiCommercialCandidate;offer:CommercialOffer;
};
const priorities:Readonly<Record<CommercialKind,readonly string[]>>={
 BROADCAST:["BROADCAST_GLOBAL","BROADCAST_TV","BROADCAST_GROWTH",
  "BROADCAST_ARCHIVE","BROADCAST_INDIE","BROADCAST_STABLE"],
 SPONSOR:["SPONSOR_LUXURY","SPONSOR_TECH","SPONSOR_PARTNER",
  "SPONSOR_GEAR","SPONSOR_FOOD","SPONSOR_LOCAL"]
};
const tierRank:Readonly<Record<string,number>>={
 LOCAL:0,INDEPENDENT:1,RISING:2,NATIONAL:3,GLOBAL:4
};
/** Partners weigh certified audience differently, rather than choosing the
 * first alphabetically sorted promotion. No fictitious Hardcore evidence. */
function partnerFit(p:AiCommercialCandidate,code:string):number{
 const crowd=Math.max(0,Math.min(100,p.averageCrowd??0));
 const shows=Math.max(0,Math.min(12,p.completedShows));
 const rating=p.recentTvEpisodes!==undefined&&p.recentTvEpisodes>=2&&
  typeof p.averageTvRating==="number"&&Number.isFinite(p.averageTvRating)?
   Math.max(0,Math.min(20,p.averageTvRating)):null;
 const style=COMMERCIAL_COMPANIES[code]?.style;
 if(code.startsWith("BROADCAST_"))
  return (rating===null?0:80+rating*20)+crowd*.2+shows*.2;
 if(style==="DIGITAL")return crowd*.6+(rating??0)*25+shows*.5;
 if(style==="PRESTIGE")return crowd+(tierRank[p.tier]??0)*8+
  (rating??0)*2;
 if(style==="UTILITY")return crowd*.7+shows*1.6;
 if(style==="SPORT")return crowd+shows*.5+(rating??0)*3;
 return crowd+shows*.3;
}
export function awardAiCommercialPartners(
 candidates:readonly AiCommercialCandidate[],occupied:ReadonlySet<string>
):AiCommercialAward[]{
 const qualified=candidates.map(p=>({promotion:p,offers:commercialOffers(p)}));
 const awards:AiCommercialAward[]=[];
 for(const kind of ["BROADCAST","SPONSOR"] as const){
  for(const code of priorities[kind]){
   if(occupied.has(code))continue;
   const bidders=qualified.flatMap(({promotion,offers})=>{
    if(promotion.active_kinds.includes(kind))return [];
    const offer=offers.find(o=>o.code===code);
    return offer?[{promotion,offer,score:partnerFit(promotion,code)}]:[];
   });
   if(!bidders.length)continue;
   bidders.sort((a,b)=>b.score-a.score||
    (a.promotion.promotion_id<b.promotion.promotion_id?-1:
     a.promotion.promotion_id>b.promotion.promotion_id?1:0));
   awards.push({promotion:bidders[0]!.promotion,offer:bidders[0]!.offer});
   break;
  }
 }
 return awards;
}
