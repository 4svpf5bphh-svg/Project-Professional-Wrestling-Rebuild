/** Fictional commercial universe; terms come from certified shows, not client cash.
 * One live broadcaster and sponsor at a time. AI and players use this catalogue.
 */
export type CommercialKind="BROADCAST"|"SPONSOR";
export type CommercialOffer={
 code:string;kind:CommercialKind;name:string;description:string;
 weeklyIncome:number;reachIncrease:number;termWeeks:13|26|52;
 obligation:string;tagline?:string;preference?:string;
};
export type CommercialEvidence={
 tier:string;mediaReach:number|null;weeklyMediaIncome:number|null;
 weeklySponsorIncome:number|null;completedShows:number;averageCrowd:number|null;
};
export const COMMERCIAL_COMPANIES:Readonly<Record<string,{
 name:string;tagline:string;preference:string}>>={
 BROADCAST_STABLE:{name:"GrappleGrid TV",tagline:"Every bell. Every week.",
  preference:"Established schedules and reliable weekly programming"},
 BROADCAST_GROWTH:{name:"VibeFlix",tagline:"Stream the spectacle.",
  preference:"Fresh faces, ambitious shows and audience growth"},
 BROADCAST_TV:{name:"BBS Sports",tagline:"The home of the big fight.",
  preference:"Established promoters and consistently impressive cards"},
 BROADCAST_INDIE:{name:"RingWave Live",tagline:"All wrestling. No waiting.",
  preference:"Lively regional events and distinctive wrestling"},
 BROADCAST_ARCHIVE:{name:"VaultVision+",tagline:"Build a legacy worth replaying.",
  preference:"Regular shows and a strong library of broadcasts"},
 BROADCAST_GLOBAL:{name:"Titan Prime",tagline:"The whole world is watching.",
  preference:"Major events and international visibility"},
 SPONSOR_LOCAL:{name:"Jack's Crematorium",tagline:"You bring 'em, we grill 'em!",
  preference:"Rowdy wrestling and spectacular brawls"},
 SPONSOR_PARTNER:{name:"Warpath Energy",tagline:"No quit. No mercy.",
  preference:"Hard-hitting wrestling and high-energy events"},
 SPONSOR_GEAR:{name:"Ironclad Workwear",tagline:"Built for the bump.",
  preference:"Reliable, gritty promotions that keep showing up"},
 SPONSOR_FOOD:{name:"Knuckle Sandwich Deli",tagline:"Fresh subs. Stiff shots.",
  preference:"Good-natured chaos and the independent circuit"},
 SPONSOR_TECH:{name:"PixelPiledriver",tagline:"Level up your entrance.",
  preference:"Strong digital audiences and character-led wrestling"},
 SPONSOR_LUXURY:{name:"Black Crown Watches",tagline:"Every second is a main event.",
  preference:"Prestige events and highly polished presentation"}
};
export function commercialCompanyName(code:string):string{
 return COMMERCIAL_COMPANIES[code]?.name??code.replaceAll("_"," ");
}
const good=(n:number|null):n is number=>n!==null&&Number.isFinite(n)&&n>0;
const term=(base:number,percent:number)=>Math.round(base*(1+percent));
/** Earned offers stay grounded in recent certified performance.
 * Expanded choices are optional; they never demand a weekly checklist.
 * Growth partners trade guarantee for reach; prestige demands reputation.
 */
export function commercialOffers(e:CommercialEvidence):CommercialOffer[]{
 const count=e.completedShows,crowd=e.averageCrowd??0,reach=e.mediaReach;
 if(count<3||crowd<48)return [];
 const offers:CommercialOffer[]=[];
 const add=(code:string,kind:CommercialKind,base:number,percent:number,
  reachPercent:number,termWeeks:13|26|52,description:string,obligation:string)=>{
  const company=COMMERCIAL_COMPANIES[code]!;
  // Identity copy lives in the already-shipped client catalogue; do not
  // transfer it repeatedly in every Business workspace RPC.
  offers.push({code,kind,name:company.name,description,
   weeklyIncome:term(base,percent),
   reachIncrease:Math.round((reach??0)*reachPercent),
   termWeeks,obligation});
 };
 if(good(e.weeklyMediaIncome)&&good(reach)){
  const base=e.weeklyMediaIncome;
  add("BROADCAST_STABLE","BROADCAST",base,.12,.05,26,
   "Conventional television distribution with dependable payments.",
   "A regular broadcast schedule; no automatic renewal.");
  add("BROADCAST_GROWTH","BROADCAST",base,.04,.17,26,
   "Smaller guarantee, much wider streaming distribution.",
   "Maintain regular shows and grow the audience.");
  if(count>=6&&crowd>=60)
   add("BROADCAST_INDIE","BROADCAST",base,.09,.12,13,
    "An indie-friendly short-term deal with flexible programming.",
    "Keep delivering lively shows; no exclusivity beyond this agreement.");
  if(count>=8&&crowd>=65)
   add("BROADCAST_ARCHIVE","BROADCAST",base,.11,.11,52,
    "Build a season-long streaming library and distribution reach.",
    "Produce regular broadcasts through the contracted year.");
  if(["NATIONAL","GLOBAL"].includes(e.tier)&&count>=9&&crowd>=72)
   add("BROADCAST_TV","BROADCAST",base,.2,.2,52,
    "Top-flight weekly television and a long exclusive commitment.",
    "Keep delivering major-event calibre shows.");
  if(e.tier==="GLOBAL"&&count>=12&&crowd>=80)
   add("BROADCAST_GLOBAL","BROADCAST",base,.23,.24,52,
    "Prime-time global distribution with demanding prestige expectations.",
    "A full year of major-scale shows and an exclusive broadcast slot.");
 }
 if(good(e.weeklySponsorIncome)){
  const base=e.weeklySponsorIncome;
  add("SPONSOR_LOCAL","SPONSOR",base,.08,0,13,
   "An eccentric local outfit happy to put its name on the ring apron.",
   "Keep staging shows. A taste for hardcore wrestling is a preference, not a requirement.");
  if(count>=4&&crowd>=55)
   add("SPONSOR_GEAR","SPONSOR",base,.09,0,26,
    "Blue-collar support for the hard-working regional circuit.",
    "Keep promoting dependable events.");
  if(count>=6&&crowd>=60){
   add("SPONSOR_FOOD","SPONSOR",base,.12,0,13,
    "A memorable independent sponsor with an appetite for big moments.",
    "Remain active and keep the audience entertained.");
   add("SPONSOR_PARTNER","SPONSOR",base,.16,0,52,
    "A principal sponsor backing athletic spectacle for a full year.",
    "Maintain a strong profile across the contracted year.");
  }
  if(["RISING","NATIONAL","GLOBAL"].includes(e.tier)&&count>=10&&crowd>=70)
   add("SPONSOR_TECH","SPONSOR",base,.18,0,26,
    "Digital-first sponsorship for a growing and engaged fanbase.",
    "Sustain consistent shows and a distinctive on-screen identity.");
  if(["NATIONAL","GLOBAL"].includes(e.tier)&&count>=10&&crowd>=76)
   add("SPONSOR_LUXURY","SPONSOR",base,.2,0,52,
    "Prestige partnership for an established, polished promotion.",
    "Present major shows with broadcast-quality consistency.");
 }
 return offers;
}
