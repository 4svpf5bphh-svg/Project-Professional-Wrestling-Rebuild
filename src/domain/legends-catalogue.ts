/** Curated historic candidates. "PLANNED" never unlocks without certified evidence,
 * identity/portrait clearance and a deliberate promotion to ACTIVE.
 * World skills below are prime-era baselines, not tier-based match modifiers.
 */
export type LegendTier="CULT"|"LEGEND"|"ICON"|"IMMORTAL";
export type LegendMetric="CLASSICS"|"HOT_ANGLES"|"DIRTY_FINISHES"|"MASTERPIECES"|
 "WOMENS_CLASSICS"|"TAG_CLASSICS"|"TITLE_CHANGES"|"LONGEST_REIGN"|"PREMIUM_MAIN_EVENTS";
export type LegendDivision="MEN"|"WOMEN";
export type LegendVisibility="KNOWN"|"CLUED"|"SECRET";
export interface PrimeLegend {
 name:string;division:LegendDivision;age:number;style:string;gimmickId:string;
 alignment:"FACE"|"HEEL"|"TWEENER";signature:string;finisher:string;
 recognition:number;popularity:number;ring:number;craft:number;presentation:number;
 stamina:number;safety:number;
}
export interface LegendDefinition {
 id:string;name:string;tier:LegendTier;division:LegendDivision;
 tradition:string;era:string;visibility:LegendVisibility;
 clue:string;achievement:string;
 metric:LegendMetric|null;target:number|null;
 hints?:readonly [string,string];
 roster:readonly PrimeLegend[];
 /** Art may only become collectible with a genuinely cleared photograph. */
 cardAsset:string|null;
 status:"ACTIVE"|"PLANNED";
}
const roster=(name:string,division:LegendDivision,age:number,style:string,
 gimmickId:string,alignment:PrimeLegend["alignment"],signature:string,finisher:string,
 recognition:number,popularity:number,ring:number,craft:number,presentation:number,
 stamina=82,safety=82):PrimeLegend=>({
 name,division,age,style,gimmickId,alignment,signature,finisher,
 recognition,popularity,ring,craft,presentation,stamina,safety
});
const active:LegendDefinition[]=[
 {id:"jerry-lynn",name:"Jerry Lynn",tier:"CULT",division:"MEN",tradition:"US independent wrestling",
 era:"1990s–2000s",visibility:"KNOWN",clue:"A workhorse rewards nights the crowd will never forget.",
 achievement:"Eight certified matches of at least 4¼ stars anywhere in the World",
 hints:["The World remembers great matches, whether or not gold is involved.","Look for repeated four-and-a-quarter-star performances."],metric:"CLASSICS",target:8,status:"ACTIVE",cardAsset:null,
 roster:[roster("Jerry Lynn","MEN",35,"TECHNICAL","RING_GENERAL","FACE",
 "Tornado DDT","Cradle Piledriver",65,72,91,91,73,88,87)]},
 {id:"raven",name:"Raven",tier:"CULT",division:"MEN",tradition:"ECW and US alternative",
 era:"1990s",visibility:"CLUED",clue:"Quote the raven. The sharpest angles turn the crowd into believers.",
 achievement:"Twelve completed angles with at least 88 crowd response",
 hints:["The audience must respond to something more than a bell.","Only angles that actually happen, to enormous crowd reaction, count."],metric:"HOT_ANGLES",target:12,status:"ACTIVE",cardAsset:null,
 roster:[roster("Raven","MEN",33,"BRAWLER","ANTI_HERO","HEEL",
 "Drop Toe Hold","Evenflow DDT",79,83,73,88,93,75,72)]},
 {id:"eddie-guerrero",name:"Eddie Guerrero",tier:"LEGEND",division:"MEN",tradition:"Mexican-American lucha",
 era:"1990s–2000s",visibility:"CLUED",clue:"Lie, cheat, steal. Someone has to get away with a little mischief.",
 achievement:"Twelve recorded cheating finishes across certified World matches",
 hints:["Rules are there to be bent.","Only certified finishes where cheating really happened count."],metric:"DIRTY_FINISHES",target:12,status:"ACTIVE",cardAsset:null,
 roster:[roster("Eddie Guerrero","MEN",36,"LUCHA","OPPORTUNIST","FACE",
 "Three Amigos","Frog Splash",88,91,96,95,95,91,90)]},
 {id:"mr-perfect",name:"Mr. Perfect",tier:"LEGEND",division:"MEN",tradition:"American technical wrestling",
 era:"1980s–1990s",visibility:"KNOWN",clue:"Anything less than perfect simply will not do.",
 achievement:"Eight certified matches rated at least 4¾ stars",
 hints:["Very good is not good enough.","The ratings must reach four-and-three-quarter stars or higher."],metric:"MASTERPIECES",target:8,status:"ACTIVE",cardAsset:null,
 roster:[roster("Mr. Perfect","MEN",31,"TECHNICAL","ARROGANT_ACE","HEEL",
 "Perfect Dropkick","Perfect-Plex",84,84,96,95,92,86,91)]},
 {id:"trish-stratus",name:"Trish Stratus",tier:"LEGEND",division:"WOMEN",tradition:"Canadian women's wrestling",
 era:"2000s",visibility:"KNOWN",clue:"The division makes history when its best performances can't be ignored.",
 achievement:"Ten women's matches rated at least four stars",
 hints:["The women's division is the key.","Certified women's matches of four stars or better add to this mystery."],metric:"WOMENS_CLASSICS",target:10,status:"ACTIVE",cardAsset:null,
 roster:[roster("Trish Stratus","WOMEN",29,"ALL_ROUNDER","FAN_FAVOURITE","FACE",
 "Stratusphere","Stratusfaction",87,90,82,87,96,86,85)]},
 {id:"road-warriors",name:"The Road Warriors",tier:"ICON",division:"MEN",tradition:"American power tag team",
 era:"1980s–1990s",visibility:"CLUED",clue:"Two monsters. One united force. No one survives the rush.",
 achievement:"Fifteen certified tag-team matches rated at least 4¼ stars",
 hints:["Two wrestlers working as one.","This mystery needs exceptional tag-team matches, not singles showcases."],metric:"TAG_CLASSICS",target:15,status:"ACTIVE",cardAsset:null,
 roster:[roster("Road Warrior Hawk","MEN",30,"POWERHOUSE","ENFORCER","FACE",
 "Flying Clothesline","Doomsday Device",88,90,80,85,91,86,78),
 roster("Road Warrior Animal","MEN",30,"POWERHOUSE","ENFORCER","FACE",
 "Powerslam","Doomsday Device",88,89,78,84,91,86,79)]},
 {id:"sting",name:"Sting",tier:"ICON",division:"MEN",tradition:"NWA, WCW and American wrestling",
 era:"1980s–2000s",visibility:"SECRET",clue:"When the balance of championship power keeps shifting, a watchful shadow stirs.",
 achievement:"Fifteen certified championship changes",
 hints:["Championship gold must move through the World.","Only genuine, recorded title changes count."],metric:"TITLE_CHANGES",target:15,status:"ACTIVE",cardAsset:null,
 roster:[roster("Sting","MEN",33,"ALL_ROUNDER","FAN_FAVOURITE","FACE",
 "Stinger Splash","Scorpion Deathlock",92,94,85,88,97,90,85)]},
 {id:"bruno-sammartino",name:"Bruno Sammartino",tier:"IMMORTAL",division:"MEN",
 tradition:"North American territory champion",era:"1960s–1970s",visibility:"SECRET",
 clue:"A reign measured not in days, but in seasons.",
 achievement:"A verified championship reign lasting at least 52 World weeks",
 hints:["The calendar is as important as the championship.","A single uninterrupted reign is the measure, not combined reigns."],metric:"LONGEST_REIGN",target:52,status:"ACTIVE",cardAsset:null,
 roster:[roster("Bruno Sammartino","MEN",33,"POWERHOUSE","RING_GENERAL","FACE",
 "Canadian Backbreaker","Bearhug",96,97,83,92,96,91,91)]},
 {id:"undertaker",name:"The Undertaker",tier:"IMMORTAL",division:"MEN",
 tradition:"American sports entertainment",era:"1990s–2000s",visibility:"SECRET",
 clue:"Under the brightest lights, the dead refuse to stay buried.",
 achievement:"Fifteen premium-event main events rated at least 4¼ stars",
 hints:["Only wrestling's biggest nights awaken this mystery.","An exceptional main event at a completed premium show counts."],metric:"PREMIUM_MAIN_EVENTS",target:15,status:"ACTIVE",cardAsset:null,
 roster:[roster("The Undertaker","MEN",34,"POWERHOUSE","MONSTER","TWEENER",
 "Chokeslam","Tombstone Piledriver",99,98,88,92,98,87,88)]}
];
/** Long-range curation pool. Conditions are thematic proposals, NOT implemented
 * eligibility rules; no unseen mechanic is silently treated as evidence.
 */
const planned:[string,string,LegendTier,LegendDivision,string,string][]=[
 ["sabu","Sabu","CULT","MEN","ECW aerial risk","Landmark hardcore contests, subject to real recorded ruleset evidence"],
 ["steve-corino","Steve Corino","CULT","MEN","Hardcore and old-school","A sustained completed rivalry with multiple verified chapters"],
 ["taz","Taz","CULT","MEN","ECW submission wrestling","A streak of certified submission finishes once winner evidence is audited"],
 ["d-lo-brown","D’Lo Brown","CULT","MEN","US television wrestling","A run of strong weekly broadcasts"],
 ["dean-malenko","Dean Malenko","CULT","MEN","Technical and cruiserweight","Elite technical contests only with an actual recorded match-style signal"],
 ["abdullah-butcher","Abdullah the Butcher","CULT","MEN","Territory brawling","Chaotic stipulation contests with genuine recorded rules"],
 ["new-jack","New Jack","CULT","MEN","ECW hardcore","A series of authentic violent stipulations, not fabricated botches"],
 ["super-crazy","Super Crazy","CULT","MEN","Mexican lucha","A completed high-flying showcase supported by genuine match-style data"],
 ["ultimo-dragon","Ultimo Dragon","CULT","MEN","Japanese and Mexican cruiserweight","Cruiserweight showcase with genuine division and title evidence"],
 ["tajiri","Tajiri","CULT","MEN","Japanese and ECW hybrid","Decisive striking success when match style is recorded"],
 ["konnan","Konnan","CULT","MEN","Lucha and WCW","Major cross-promotion milestones"],
 ["ricky-steamboat","Ricky Steamboat","LEGEND","MEN","NWA technical classics","A succession of historic-rated bouts"],
 ["william-regal","William Regal","LEGEND","MEN","British technical wrestling","Successful ring-general performances with tracked technical style"],
 ["arn-anderson","Arn Anderson","LEGEND","MEN","US territory tag specialist","A verified tag championship dynasty"],
 ["dusty-rhodes","Dusty Rhodes","LEGEND","MEN","Southern territories","An extraordinary crowd-led promotion rise"],
 ["lita","Lita","LEGEND","WOMEN","2000s women's wrestling","A major women's division moment and title success"],
 ["bull-nakano","Bull Nakano","LEGEND","WOMEN","Japanese joshi","Women's championships and hard-earned title defenses"],
 ["aja-kong","Aja Kong","LEGEND","WOMEN","Japanese joshi","A dominant cross-promotion women's division milestone"],
 ["stan-hansen","Stan Hansen","LEGEND","MEN","Japan/US strong style","A major title streak across completed big shows"],
 ["bret-hart","Bret Hart","ICON","MEN","Canadian technical wrestling","Technical excellence, pending trustworthy style evidence"],
 ["mick-foley","Mick Foley","ICON","MEN","Hardcore and US mainstream","A run of genuinely recorded hardcore main events"],
 ["randy-savage","Randy Savage","ICON","MEN","US mainstream","An iconic pay-per-view championship moment"],
 ["kurt-angle","Kurt Angle","ICON","MEN","Olympic and technical wrestling","A sequence of technical championship classics"],
 ["booker-t","Booker T","ICON","MEN","US tag and singles","Complete an iconic rise from tag to singles gold"],
 ["great-muta","The Great Muta","ICON","MEN","Japanese spectacle","A breakthrough of distinctive character-driven angles"],
 ["chyna","Chyna","ICON","WOMEN","US crossover wrestling","Verified cross-division breakthrough once division rules support it"],
 ["jushin-liger","Jushin Thunder Liger","ICON","MEN","Japanese junior heavyweights","A landmark junior heavyweight championship run"],
 ["vader","Vader","ICON","MEN","Japan/US heavyweight powerhouse","Major-event dominance reflected in certified results"],
 ["manami-toyota","Manami Toyota","ICON","WOMEN","Japanese joshi classics","Extraordinary certified women's match quality"],
 ["shawn-michaels","Shawn Michaels","IMMORTAL","MEN","US show-stealing","A large collection of main-event classics"],
 ["steve-austin","Steve Austin","IMMORTAL","MEN","Attitude Era","A generation-shifting crowd and championship milestone"],
 ["hulk-hogan","Hulk Hogan","IMMORTAL","MEN","1980s US mainstream","A dominant run of major-event crowd successes"],
 ["the-rock","The Rock","IMMORTAL","MEN","Attitude Era","A run of audience-shattering moments and main events"],
 ["ric-flair","Ric Flair","IMMORTAL","MEN","NWA territory circuit","Exceptional, verified World title reigns"],
 ["andre-giant","André the Giant","IMMORTAL","MEN","International attraction","A landmark drawing-power career achievement"],
 ["antonio-inoki","Antonio Inoki","IMMORTAL","MEN","Japanese puroresu","A sustained major-event promotion breakthrough"],
 ["mitsuharu-misawa","Mitsuharu Misawa","IMMORTAL","MEN","King's Road Japan","An extraordinary run of five-star classics"],
 ["kenta-kobashi","Kenta Kobashi","IMMORTAL","MEN","King's Road Japan","A legendary title defense streak"],
 ["el-santo","El Santo","IMMORTAL","MEN","Mexican lucha heritage","A landmark lucha championship dynasty"]
];
const proposed=planned.map(([id,name,tier,division,tradition,achievement],i):LegendDefinition=>({
 id,name,tier,division,tradition,era:"Historic",visibility:i%4===0?"KNOWN":i%4===1?"CLUED":"SECRET",
 clue:"A chapter of wrestling history awaits its moment.",achievement,
 metric:null,target:null,roster:[],cardAsset:null,status:"PLANNED"
}));
export const LEGENDS_CATALOGUE:readonly LegendDefinition[]=Object.freeze([...active,...proposed]);
export const LIVE_LEGENDS=LEGENDS_CATALOGUE.filter(x=>x.status==="ACTIVE");
export const LEGEND_TIER_PRICES:Readonly<Record<LegendTier,number>>={
 CULT:750,LEGEND:1400,ICON:2200,IMMORTAL:4000
};
export function findLegend(id:string){return LEGENDS_CATALOGUE.find(x=>x.id===id)??null;}
export function legendUnlockEligible(def:LegendDefinition,metrics:Readonly<Partial<Record<LegendMetric,number>>>){
 return def.status==="ACTIVE"&&def.metric!==null&&def.target!==null&&
  (metrics[def.metric]??0)>=def.target;
}
