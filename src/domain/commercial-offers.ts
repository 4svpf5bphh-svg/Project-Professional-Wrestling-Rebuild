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
 recentTvEpisodes?:number;averageTvRating?:number|null;
};
export const COMMERCIAL_COMPANIES:Readonly<Record<string,{
 name:string;tagline:string;preference:string;
 mark:string;voice:string;style:"SPORT"|"DIGITAL"|"PRESTIGE"|"INDIE"|"CHAOS"|"UTILITY";
 preferredDay:number;airtime:string;ratingPressure:number}>>={
 BROADCAST_STABLE:{name:"GrappleGrid TV",tagline:"Every bell. Every week.",
  preference:"Established schedules and reliable weekly programming",mark:"GG",voice:"If you can deliver on schedule, we can build a habit together.",style:"SPORT",preferredDay:6,airtime:"19:00",ratingPressure:0.7},
 BROADCAST_GROWTH:{name:"VibeFlix",tagline:"Stream the spectacle.",
  preference:"Fresh faces, ambitious shows and audience growth",mark:"V▶",voice:"We follow momentum, not reputations. Show us the viewers.",style:"DIGITAL",preferredDay:5,airtime:"20:00",ratingPressure:0.9},
 BROADCAST_TV:{name:"BBS Sports",tagline:"The home of the big fight.",
  preference:"Established promoters and consistently impressive cards",mark:"BBS",voice:"Our prime slot is earned. The numbers have to stand up.",style:"SPORT",preferredDay:6,airtime:"20:00",ratingPressure:1.25},
 BROADCAST_INDIE:{name:"RingWave Live",tagline:"All wrestling. No waiting.",
  preference:"Lively regional events and distinctive wrestling",mark:"RW",voice:"Your wrestling, your crowd, our cameras. Keep it loud.",style:"INDIE",preferredDay:5,airtime:"21:00",ratingPressure:0.75},
 BROADCAST_ARCHIVE:{name:"VaultVision+",tagline:"Build a legacy worth replaying.",
  preference:"Regular shows and a strong library of broadcasts",mark:"V+",voice:"Bring us episodes worth revisiting and we'll keep the lights on.",style:"PRESTIGE",preferredDay:7,airtime:"18:00",ratingPressure:0.8},
 BROADCAST_GLOBAL:{name:"Titan Prime",tagline:"The whole world is watching.",
  preference:"Major events and international visibility",mark:"T★",voice:"We expect tentpole television that defines the week.",style:"PRESTIGE",preferredDay:6,airtime:"21:00",ratingPressure:1.45},
 SPONSOR_LOCAL:{name:"Jack's Crematorium",tagline:"You bring 'em, we grill 'em!",
  preference:"Rowdy wrestling and spectacular brawls",mark:"J☄",voice:"More chaos, more customers. Keep the audience talking.",style:"CHAOS",preferredDay:6,airtime:"19:00",ratingPressure:0.8},
 SPONSOR_PARTNER:{name:"Warpath Energy",tagline:"No quit. No mercy.",
  preference:"Hard-hitting wrestling and high-energy events",mark:"W!",voice:"Intensity sells. We want fighters, not filler.",style:"SPORT",preferredDay:5,airtime:"20:00",ratingPressure:0.9},
 SPONSOR_GEAR:{name:"Ironclad Workwear",tagline:"Built for the bump.",
  preference:"Reliable, gritty promotions that keep showing up",mark:"IW",voice:"Consistency beats hype. Keep showing up.",style:"UTILITY",preferredDay:5,airtime:"19:00",ratingPressure:0.75},
 SPONSOR_FOOD:{name:"Knuckle Sandwich Deli",tagline:"Fresh subs. Stiff shots.",
  preference:"Good-natured chaos and the independent circuit",mark:"KS",voice:"Put on a show people talk about over lunch.",style:"CHAOS",preferredDay:6,airtime:"20:00",ratingPressure:0.85},
 SPONSOR_TECH:{name:"PixelPiledriver",tagline:"Level up your entrance.",
  preference:"Strong digital audiences and character-led wrestling",mark:"PX",voice:"That social reaction looks promising. Show us the audience.",style:"DIGITAL",preferredDay:5,airtime:"20:00",ratingPressure:1.1},
 SPONSOR_LUXURY:{name:"Black Crown Watches",tagline:"Every second is a main event.",
  preference:"Prestige events and highly polished presentation",mark:"BC",voice:"Prestige is earned on the card. Keep it that way.",style:"PRESTIGE",preferredDay:6,airtime:"21:00",ratingPressure:1.3}
};
export function commercialCompanyName(code:string):string{
 return COMMERCIAL_COMPANIES[code]?.name??code.replaceAll("_"," ");
}
const good=(n:number|null):n is number=>n!==null&&Number.isFinite(n)&&n>0;
const term=(base:number,percent:number)=>Math.round(base*(1+percent));
/** Small promotions earn fractional household audiences: network expectations
 * must be reachable on sensible regional reach, while national and global\n * prestige requirements remain demanding and unchanged.
 */
export const COMMERCIAL_TIER_RATING_TARGET:Readonly<Record<string,number>>={
 LOCAL:.10,INDEPENDENT:.14,RISING:.38,NATIONAL:1.35,GLOBAL:3.1
};
export function broadcasterRatingTarget(code:string,tier:string):number{
 const base=COMMERCIAL_TIER_RATING_TARGET[tier]??.25;
 return Math.round(base*(COMMERCIAL_COMPANIES[code]?.ratingPressure??1)*100)/100;
}
/** Preserve useful scale below one Nielsen point. */
export const formatTvRating=(rating:number):string=>rating<1?
 rating.toFixed(2):rating.toFixed(1);
export function partnerResponse(code:string,input:{
 tier:string;averageTvRating?:number|null;crowd?:number|null;
 current:boolean;heldBy?:string|null;
}):string{
 const partner=COMMERCIAL_COMPANIES[code];
 if(!partner)return "We review every offer on its own merits.";
 if(input.heldBy)return "Our exclusive slot belongs to "+input.heldBy+
  ". We'll talk when that agreement ends.";
 const rating=input.averageTvRating;
 if(code.startsWith("BROADCAST_")&&typeof rating==="number"&&Number.isFinite(rating)){
  const target=broadcasterRatingTarget(code,input.tier);
  if(rating>=target*1.2)return "Your "+formatTvRating(rating)+" rating beats our "+
   formatTvRating(target)+" target. Let's talk about a stronger deal.";
  if(rating<target*.8)return "The "+formatTvRating(rating)+" rating is below "+
   "our "+formatTvRating(target)+" target. We need to see improvement.";
 }
 // Sponsors have different standards and respond only to completed-show
 // evidence. Public statements never disclose hidden acceptance odds.
 const crowd=input.crowd;
 if(code.startsWith("SPONSOR_")&&typeof crowd==="number"&&Number.isFinite(crowd)){
  if(crowd>=79)return (partner.style==="CHAOS"?
   "Those fans were on their feet. ":
   partner.style==="PRESTIGE"?"That was a premium-level presentation. ":
   partner.style==="DIGITAL"?"Those numbers are worth talking about. ":
   "Keep performances like that coming. ")+partner.voice;
  if(crowd<56)return (partner.style==="CHAOS"?
   "Even chaos needs an audience. ":
   partner.style==="PRESTIGE"?"Our board expects a stronger presentation. ":
   "We need a more consistent crowd reaction. ")+partner.voice;
 }
 return input.current?"Our deal runs until the final contracted week. "+
  partner.voice:partner.voice;
}
/** Earned offers stay grounded in recent certified performance.
 * Expanded choices are optional; they never demand a weekly checklist.
 * Growth partners trade guarantee for reach; prestige demands reputation.
 */
export function commercialOffers(e:CommercialEvidence):CommercialOffer[]{
 const count=e.completedShows,crowd=e.averageCrowd??0,reach=e.mediaReach;
 const sample=(e.recentTvEpisodes??0)>=2&&Number.isFinite(e.averageTvRating);
 const target=COMMERCIAL_TIER_RATING_TARGET[e.tier]??.25;
 const ratio=sample?Math.max(0,Math.min(2.2,e.averageTvRating!/target)):1;
 // The audience premium is additional guaranteed weekly income and remains
 // deliberately capped; it does not invent or post revenue before signing.
 const earnedPremium=sample?Math.max(-.06,Math.min(.24,(ratio-1)*.17)):0;
 if(count<3||crowd<48)return [];
 const offers:CommercialOffer[]=[];
 const add=(code:string,kind:CommercialKind,base:number,percent:number,
  reachPercent:number,termWeeks:13|26|52,description:string,obligation:string)=>{
  const company=COMMERCIAL_COMPANIES[code]!;
  // Identity copy lives in the already-shipped client catalogue; do not
  // transfer it repeatedly in every Business workspace RPC.
  offers.push({code,kind,name:company.name,description,
   weeklyIncome:Math.max(0,Math.round(term(base,percent)*(1+earnedPremium*
    (kind==="BROADCAST"?1:.4)))),
   // Reach is a percentage-sized, 0–100 audience index. New TV terms
   // may improve distribution but never put the World above its valid cap.
   reachIncrease:Math.max(0,Math.min(100-Math.min(100,reach??0),
    Math.round(Math.min(100,reach??0)*reachPercent))),
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
  if(["NATIONAL","GLOBAL"].includes(e.tier)&&count>=9&&crowd>=72&&
  (!sample||ratio>=.75))
   add("BROADCAST_TV","BROADCAST",base,.2,.2,52,
    "Top-flight weekly television and a long exclusive commitment.",
    "Keep delivering major-event calibre shows.");
  if(e.tier==="GLOBAL"&&count>=12&&crowd>=80&&(!sample||ratio>=.9))
   add("BROADCAST_GLOBAL","BROADCAST",base,.23,.24,52,
    "Prime-time global distribution with demanding prestige expectations.",
    "A full year of major-scale shows and an exclusive broadcast slot.");
 }
 if(good(e.weeklySponsorIncome)){
  const base=e.weeklySponsorIncome;
  add("SPONSOR_LOCAL","SPONSOR",base,.08,0,13,
   "An eccentric local outfit happy to put its name on the ring apron.",
   "Keep staging shows. A taste for hardcore wrestling is a preference, not a requirement.");
  if(count>=3&&crowd>=55)
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
  if(["RISING","NATIONAL","GLOBAL"].includes(e.tier)&&count>=10&&crowd>=70&&
   (!sample||ratio>=.7))
   add("SPONSOR_TECH","SPONSOR",base,.18,0,26,
    "Digital-first sponsorship for a growing and engaged fanbase.",
    "Sustain consistent shows and a distinctive on-screen identity.");
  if(["NATIONAL","GLOBAL"].includes(e.tier)&&count>=10&&crowd>=76&&
   (!sample||ratio>=.8))
   add("SPONSOR_LUXURY","SPONSOR",base,.2,0,52,
    "Prestige partnership for an established, polished promotion.",
    "Present major shows with broadcast-quality consistency.");
 }
 return offers;
}
