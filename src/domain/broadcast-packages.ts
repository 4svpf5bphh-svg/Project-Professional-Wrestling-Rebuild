/** Account-owned television presentation skins.
 * Never alter a show's participants, finishes, results, simulation or KP earnings. */
export const BROADCAST_PACKAGES=[
 {sku:"BROADCAST_PRIME_TIME_COMBAT",style:"PRIME_TIME_COMBAT",key:"primetime",label:"Prime Time Combat",description:"Big sports television, royal blue and high-impact crimson"},
 {sku:"BROADCAST_SATURDAY_NIGHT_TERRITORY",style:"SATURDAY_NIGHT_TERRITORY",key:"territory",label:"Saturday Night Territory",description:"Vintage territory television, old-fashioned printing and ledger paper"},
 {sku:"BROADCAST_MIDNIGHT_FREQUENCY",style:"MIDNIGHT_FREQUENCY",key:"midnight",label:"Midnight Frequency",description:"Neon cyan, magenta highlights and late-night grid"},
 {sku:"BROADCAST_PRIZEFIGHT",style:"PRIZEFIGHT",key:"prizefight",label:"Prizefight",description:"Serious fight-sports, editorial black, white and red"},
 {sku:"BROADCAST_RENEGADE_TV",style:"RENEGADE_TV",key:"renegade",label:"Renegade TV",description:"Punk flyer, hazard strips and underground energy"},
 {sku:"BROADCAST_THE_GRAND_STAGE",style:"THE_GRAND_STAGE",key:"prestige",label:"The Grand Stage",description:"Champagne gold, dark bronze and championship elegance"},
 {sku:"BROADCAST_BOOKERVISION_2002",style:"BOOKERVISION_2002",key:"booker",label:"BookerVision 2002",description:"Early 2000s computer wrestling television and CRT"},
 {sku:"BROADCAST_STRONG_STYLE_NETWORK",style:"STRONG_STYLE_NETWORK",key:"strongstyle",label:"Strong Style Network",description:"Minimal white, black and crimson wrestling graphics"},
 {sku:"BROADCAST_LUCHA_FIESTA",style:"LUCHA_FIESTA",key:"luchafiesta",label:"Lucha Fiesta",description:"Vivid Mexican fiesta-inspired ringside broadcast colours"},
] as const;
export const BROADCAST_PACKAGE_KP_PRICE=1500;
export type BroadcastPackageSku=typeof BROADCAST_PACKAGES[number]["sku"];
export type BroadcastPackageStyle=typeof BROADCAST_PACKAGES[number]["style"];
export const broadcastPackageBySku=(sku:string)=>BROADCAST_PACKAGES.find(x=>x.sku===sku)??null;
export const broadcastPackageByStyle=(style:string|null|undefined)=>BROADCAST_PACKAGES.find(x=>x.style===style)??null;
export const broadcastPackageClass=(style:string|null|undefined)=>
 broadcastPackageByStyle(style)?.key??"standard";
