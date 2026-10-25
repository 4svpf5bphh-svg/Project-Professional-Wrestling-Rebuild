/** Deliberately small, deterministic commercial choices, equally available
 * to players and AI companies. The original Genesis amounts are the baseline.
 * An offer cannot inflate earnings without actual recently certified shows.
 */
export type CommercialKind="BROADCAST"|"SPONSOR";
export type CommercialOffer={
 code:"BROADCAST_STABLE"|"BROADCAST_GROWTH"|"BROADCAST_TV"|
  "SPONSOR_LOCAL"|"SPONSOR_PARTNER";
 kind:CommercialKind;name:string;description:string;
 weeklyIncome:number;reachIncrease:number;termWeeks:13|26|52;
 obligation:string;
};
export type CommercialEvidence={
 tier:string;mediaReach:number|null;weeklyMediaIncome:number|null;
 weeklySponsorIncome:number|null;completedShows:number;
 averageCrowd:number|null;
};
const valid=(n:number|null):n is number=>
 n!==null&&Number.isFinite(n)&&n>=0;
const income=(base:number,rate:number)=>Math.round(base*(1+rate));
/** The full set is no more than five options, independent of current cash or
 * player presence. Flat sponsor and broadcaster upgrades cannot stack.
 */
export function commercialOffers(e:CommercialEvidence):CommercialOffer[]{
 const count=e.completedShows,crowd=e.averageCrowd??0,reach=e.mediaReach;
 if(count<3||crowd<48)return [];
 const offers:CommercialOffer[]=[];
 if(valid(e.weeklyMediaIncome)&&e.weeklyMediaIncome>0&&valid(reach)&&reach>0){
  const base=e.weeklyMediaIncome;
  offers.push({code:"BROADCAST_STABLE",kind:"BROADCAST",
   name:"Reliable streaming partner",
   description:"A stronger weekly guarantee, but modest exposure.",
   weeklyIncome:income(base,.12),reachIncrease:Math.round(reach*.05),
   termWeeks:26,obligation:"Maintain your normal programme of shows."});
  offers.push({code:"BROADCAST_GROWTH",kind:"BROADCAST",
   name:"Audience-first streaming",
   description:"Sacrifice some guaranteed income for a wider audience.",
   weeklyIncome:income(base,.04),reachIncrease:Math.round(reach*.17),
   termWeeks:26,obligation:"Maintain your normal programme of shows."});
  if(["NATIONAL","GLOBAL"].includes(e.tier)&&count>=9&&crowd>=72)
   offers.push({code:"BROADCAST_TV",kind:"BROADCAST",
    name:"National television agreement",
    description:"Higher income and distribution; a lengthy exclusive commitment.",
    weeklyIncome:income(base,.2),reachIncrease:Math.round(reach*.2),
    termWeeks:52,obligation:"Sustain major-event calibre shows; renewal is not guaranteed."});
 }
 if(valid(e.weeklySponsorIncome)&&e.weeklySponsorIncome>0){
  const base=e.weeklySponsorIncome;
  offers.push({code:"SPONSOR_LOCAL",kind:"SPONSOR",
   name:"Local sponsor package",
   description:"Reliable modest funding with a shorter commitment.",
   weeklyIncome:income(base,.08),reachIncrease:0,
   termWeeks:13,obligation:"Keep presenting regular shows."});
  if(count>=6&&crowd>=60)
   offers.push({code:"SPONSOR_PARTNER",kind:"SPONSOR",
    name:"Principal commercial partner",
    description:"Higher guaranteed support in return for a year-long term.",
    weeklyIncome:income(base,.16),reachIncrease:0,
    termWeeks:52,obligation:"Maintain your profile across a full year."});
 }
 return offers;
}
