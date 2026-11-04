/** Display-only estimate of a wrestler's potential following.
 * Based on canonical World popularity / recognition / momentum, not a
 * persistent fan ledger, fabricated social accounts or an extra Neon read.
 * Hot Tag engagement stays grounded in certified crowd reactions.
 */
export function estimateWrestlerFans(
 popularity:number|null|undefined,recognition:number|null|undefined,
 momentum:number|null|undefined,
):number|null{
 if(popularity==null||recognition==null||
  !Number.isFinite(popularity)||!Number.isFinite(recognition))return null;
 const pop=Math.max(0,Math.min(100,popularity))/100;
 const rec=Math.max(0,Math.min(100,recognition))/100;
 const mom=momentum==null||!Number.isFinite(momentum)?50:
  Math.max(0,Math.min(100,momentum));
 const audience=Math.round(4_000_000*pop**2.25*rec**1.15*
  (0.9+mom/500)/100)*100;
 return Math.max(0,audience);
}
export function compactFanEstimate(count:number|null|undefined):string|null{
 if(count===null||count===undefined||!Number.isFinite(count))return null;
 return "~"+new Intl.NumberFormat("en-GB",{
  notation:"compact",maximumFractionDigits:1
 }).format(count)+" fans";
}
/** One optional earned descriptive badge, never an extra stat modifier. */
export function wrestlerSpotlightTrait(p:{
 popularity?:number|null;recognition?:number|null;momentum?:number|null;
 matchCraft?:number|null;inRingQuality?:number|null;presentation?:number|null;
}):string|null{
 if((p.presentation??0)>=93&&(p.recognition??0)>=82)return "Superstar Look";
 if((p.matchCraft??0)>=93&&(p.inRingQuality??0)>=88)return "Technical Wizard";
 if((p.momentum??0)>=88&&(p.popularity??100)<75)return "Rising Star";
 return null;
}
