/** Deterministic show audience. A rating is the share of a modeled
 * 125-million household TV universe, NOT a viewer count; estimated viewers
 * are separate. Premium distribution is currently modeled as PPV. No money
 * or wrestler/popularity effects occur here.
 */
import type {EventType,ShowTier} from "./legacy-show-economics.js";
export interface ShowAudienceInput{
 tier:ShowTier;eventType:EventType;mediaReach:number;awareness:number;
 liveStrength:number;loyalty:number;wrestlingInterest:number;
 expectedDemand:number;averageMatchRating:number;
}
export interface ShowAudienceReceipt{
 format:"TV"|"PPV";householdRating:number|null;
 estimatedViewers:number|null;ppvBuys:number|null;
}
const cap=(n:number,low:number,high:number)=>Math.max(low,Math.min(high,n));
export function projectShowAudience(x:ShowAudienceInput):ShowAudienceReceipt{
 const stats=[x.mediaReach,x.awareness,x.liveStrength,x.loyalty,x.wrestlingInterest];
 if(!stats.every(v=>Number.isFinite(v)&&v>=0&&v<=100)||
 !Number.isFinite(x.averageMatchRating)||x.averageMatchRating<.5||
 x.averageMatchRating>5||!Number.isSafeInteger(x.expectedDemand)||
 x.expectedDemand<0)throw new Error("Invalid certified broadcast audience evidence");
 const tier:Record<ShowTier,number>={GLOBAL:1,NATIONAL:.52,
  RISING:.20,INDEPENDENT:.075,LOCAL:.02};
 if(!(x.tier in tier)||!["REGULAR","MAJOR"].includes(x.eventType))
  throw new Error("Unsupported broadcast audience category");
 const strength=tier[x.tier],reach=cap(x.mediaReach/100,0,1);
 const fan=cap(.48+x.awareness/195+x.liveStrength/470+x.loyalty/740,.38,1.23);
 const interest=cap(.75+x.wrestlingInterest/390,.75,1.04);
 const quality=cap(.65+x.averageMatchRating*.105,.70,1.18);
 if(x.eventType==="REGULAR"){
  const rating=cap(.04+4.75*strength*Math.pow(reach,1.28)*
   fan*quality*interest,.01,5.5*strength+.07);
  return {format:"TV",householdRating:Math.round(rating*10)/10,
   estimatedViewers:Math.round(125_000_000*rating/100*1.35/1000)*1000,ppvBuys:null};
 }
 const base:Record<ShowTier,number>={GLOBAL:740000,NATIONAL:210000,
  RISING:48000,INDEPENDENT:9000,LOCAL:900};
 const demand=cap(.6+Math.sqrt(x.expectedDemand/36000)*.15,.63,1.27);
 const buys=Math.round(base[x.tier]*(0.30+0.70*reach)*fan*
  interest*quality*demand/10)*10;
 return {format:"PPV",householdRating:null,estimatedViewers:null,
  ppvBuys:cap(buys,0,x.tier==="GLOBAL"?1600000:base[x.tier]*2)};
}
