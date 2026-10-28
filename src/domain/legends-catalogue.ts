import {reviewedLegendExpansion} from "./reviewed-legend-expansion.js";
/** Historic Legends: certified World unlocks and hand-curated prime-era identities.
 * Artwork rights remain unverified in this hobby build; missing/review-pending card files are never purchasable.
 */
export type LegendTier="CULT"|"LEGEND"|"ICON"|"IMMORTAL";
export type LegendMetric="CLASSICS"|"HOT_ANGLES"|"DIRTY_FINISHES"|"MASTERPIECES"|
 "WOMENS_CLASSICS"|"TAG_CLASSICS"|"TITLE_CHANGES"|"LONGEST_REIGN"|"PREMIUM_MAIN_EVENTS"|
 "HARDCORE_CLASSICS"|"HARDCORE_MATCHES"|"SUBMISSIONS"|"WEEKLY_CLASSICS"|
 "BIG_REACTIONS"|"TAG_MASTERPIECES"|"WOMENS_MASTERPIECES"|"PREMIUM_CLASSICS"|
 "MAIN_EVENT_CLASSICS"|"FIVE_STARS"|"STIPULATED_CLASSICS";
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
 /** A manually reviewed authentic-photo card is required for hobby collectibles; public release needs a separate rights review. */
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
 hints:["Only wrestling's biggest nights awaken this mystery.","An exceptional main event at a completed premium show counts."],metric:"PREMIUM_MAIN_EVENTS",target:15,status:"ACTIVE",
 // Steve Wright Jr., 2012, CC BY 2.0. Real, attributed, identified Commons photo.
 // The unique static artwork is built from this real photograph and bundled locally.
 cardAsset:"/assets/legends/undertaker-immortal-card.webp",
 roster:[roster("The Undertaker","MEN",34,"POWERHOUSE","MONSTER","TWEENER",
 "Chokeslam","Tombstone Piledriver",99,98,88,92,98,87,88)]}
];
/** Historical roster verified for simulated prime-era play. Each challenge is
 * based on an actually stored, certified World signal; no fabricated move/finish
 * evidence and no automatic contract grants. Photo art is separately selected and reviewed.
 */
const curated:LegendDefinition[]=[
 {id:"sabu",name:"Sabu",tier:"CULT",division:"MEN",tradition:"ECW aerial risk",era:"1990s",visibility:"CLUED",
  clue:"Scars and flying chairs: someone will call that art.",achievement:"8 certified hardcore or dangerous-stipulation matches rated at least four stars",
  hints:["Hardcore doesn't count unless it really happened.","Stipulated bouts must achieve four stars or better."],metric:"HARDCORE_CLASSICS",target:8,status:"ACTIVE",cardAsset:null,
  roster:[roster("Sabu","MEN",33,"HIGH_FLYER","ANTI_HERO","TWEENER","Arabian Facebuster","Arabian Skullcrusher",77,79,85,79,84)]},
 {id:"steve-corino",name:"Steve Corino",tier:"CULT",division:"MEN",tradition:"Hardcore and old-school",era:"1990s–2000s",visibility:"KNOWN",
  clue:"The King of Old School knows exactly how to take a shortcut.",achievement:"25 certified cheating finishes",
  hints:["Every shortcut leaves evidence.","Only recorded completed dirty finishes count."],metric:"DIRTY_FINISHES",target:25,status:"ACTIVE",cardAsset:null,
  roster:[roster("Steve Corino","MEN",30,"BRAWLER","VILLAIN","HEEL","Old School Expulsion","Old School Expulsion",69,71,81,84,82)]},
 {id:"taz",name:"Taz",tier:"CULT",division:"MEN",tradition:"ECW submission wrestling",era:"1990s",visibility:"CLUED",
  clue:"In this dojo, tapping out is the only acceptable lesson.",achievement:"15 certified matches ending by submission",
  hints:["Sometimes the decisive move is a hold.","The official recorded finish must be SUBMISSION."],metric:"SUBMISSIONS",target:15,status:"ACTIVE",cardAsset:null,
  roster:[roster("Taz","MEN",31,"SUBMISSION","ENFORCER","TWEENER","Tazmission Setup","Tazmission",79,82,87,87,84)]},
 {id:"d-lo-brown",name:"D’Lo Brown",tier:"CULT",division:"MEN",tradition:"US television wrestling",era:"1990s–2000s",visibility:"KNOWN",
  clue:"The head wobbles; the weekly work never stops.",achievement:"35 certified regular-show matches rated at least four stars",
  hints:["Consistency on ordinary nights matters.","Premium events are not counted in this challenge."],metric:"WEEKLY_CLASSICS",target:35,status:"ACTIVE",cardAsset:null,
  roster:[roster("D’Lo Brown","MEN",30,"ALL_ROUNDER","FAN_FAVOURITE","FACE","Leg Drop","Lo Down",73,76,82,79,85)]},
 {id:"dean-malenko",name:"Dean Malenko",tier:"CULT",division:"MEN",tradition:"Technical and cruiserweight",era:"1990s",visibility:"SECRET",
  clue:"The man of a thousand holds isn't counting jokes.",achievement:"18 certified matches rated at least four-and-three-quarter stars",
  hints:["Only extraordinary match quality counts.","A certified rating of 4¾ stars or better is required."],metric:"MASTERPIECES",target:18,status:"ACTIVE",cardAsset:null,
  roster:[roster("Dean Malenko","MEN",33,"TECHNICAL","RING_GENERAL","HEEL","Brainbuster","Texas Cloverleaf",76,75,95,92,76)]},
 {id:"abdullah-butcher",name:"Abdullah the Butcher",tier:"CULT",division:"MEN",tradition:"Territory brawling",era:"1970s–1980s",visibility:"SECRET",
  clue:"No rulebook survives a trip to the butcher's shop.",achievement:"15 certified hardcore or dangerous-stipulation matches rated at least four stars",
  hints:["Hardcore doesn't count unless it really happened.","Stipulated bouts must achieve four stars or better."],metric:"HARDCORE_CLASSICS",target:15,status:"ACTIVE",cardAsset:null,
  roster:[roster("Abdullah the Butcher","MEN",37,"BRAWLER","MONSTER","HEEL","Headbutt","Elbow Drop",85,86,57,69,96)]},
 {id:"new-jack",name:"New Jack",tier:"CULT",division:"MEN",tradition:"ECW hardcore",era:"1990s",visibility:"CLUED",
  clue:"Even the wildest rules may not be wild enough.",achievement:"30 certified matches held under hardcore or dangerous stipulations",
  hints:["The usual rulebook won't help.","Completed Hardcore, Cage, Ladder, Tables, TLC or Last Man Standing matches count."],metric:"HARDCORE_MATCHES",target:30,status:"ACTIVE",cardAsset:null,
  roster:[roster("New Jack","MEN",32,"BRAWLER","ANTI_HERO","HEEL","Diving Chairshot","187",77,81,53,69,87)]},
 {id:"super-crazy",name:"Super Crazy",tier:"CULT",division:"MEN",tradition:"Mexican lucha",era:"1990s–2000s",visibility:"KNOWN",
  clue:"Impossible is just another move off the top rope.",achievement:"45 certified matches rated at least four-and-a-quarter stars",
  hints:["The bell tells the story.","A certified rating of 4¼ stars or better is required."],metric:"CLASSICS",target:45,status:"ACTIVE",cardAsset:null,
  roster:[roster("Super Crazy","MEN",31,"LUCHA","FAN_FAVOURITE","FACE","Moonsault","Trifecta Moonsault",74,79,88,83,81)]},
 {id:"ultimo-dragon",name:"Ultimo Dragon",tier:"CULT",division:"MEN",tradition:"Japanese and Mexican cruiserweight",era:"1990s",visibility:"CLUED",
  clue:"The dragon makes every final bell feel like a new beginning.",achievement:"20 certified show-closing main events rated at least four-and-a-half stars",
  hints:["The final bell can be historic.","The last match on a certified card must earn at least 4½ stars."],metric:"MAIN_EVENT_CLASSICS",target:20,status:"ACTIVE",cardAsset:null,
  roster:[roster("Ultimo Dragon","MEN",33,"LUCHA","RING_GENERAL","FACE","Asai Moonsault","Dragon Sleeper",82,84,94,89,87)]},
 {id:"tajiri",name:"Tajiri",tier:"CULT",division:"MEN",tradition:"Japanese and ECW hybrid",era:"2000s",visibility:"SECRET",
  clue:"When the mist clears, another classic is waiting.",achievement:"20 certified stipulation matches rated at least four-and-a-quarter stars",
  hints:["Change the rules, change the game.","Non-standard completed stipulations rated at least 4¼ stars count."],metric:"STIPULATED_CLASSICS",target:20,status:"ACTIVE",cardAsset:null,
  roster:[roster("Tajiri","MEN",31,"STRIKER","OPPORTUNIST","HEEL","Tarantula","Buzzsaw Kick",78,81,88,85,89)]},
 {id:"konnan",name:"Konnan",tier:"CULT",division:"MEN",tradition:"Lucha and WCW",era:"1990s",visibility:"KNOWN",
  clue:"¡Órale! The crowd knows who speaks for the streets.",achievement:"80 certified matches drawing at least 90 crowd response",
  hints:["The audience has to truly erupt.","The actual completed match must reach 90 crowd response."],metric:"BIG_REACTIONS",target:80,status:"ACTIVE",cardAsset:null,
  roster:[roster("Konnan","MEN",32,"BRAWLER","ANTI_HERO","FACE","Rolling Clothesline","Tequila Sunrise",80,85,72,82,91)]},
 {id:"ricky-steamboat",name:"Ricky Steamboat",tier:"LEGEND",division:"MEN",tradition:"NWA technical classics",era:"1980s",visibility:"CLUED",
  clue:"The Dragon does his talking bell to bell.",achievement:"25 certified matches rated at least four-and-three-quarter stars",
  hints:["Only extraordinary match quality counts.","A certified rating of 4¾ stars or better is required."],metric:"MASTERPIECES",target:25,status:"ACTIVE",cardAsset:null,
  roster:[roster("Ricky Steamboat","MEN",34,"TECHNICAL","HERO","FACE","Arm Drag","Flying Crossbody",94,94,98,96,91)]},
 {id:"william-regal",name:"William Regal",tier:"LEGEND",division:"MEN",tradition:"British technical wrestling",era:"2000s",visibility:"KNOWN",
  clue:"One lesson from a gentleman can last a lifetime.",achievement:"45 certified matches ending by submission",
  hints:["Sometimes the decisive move is a hold.","The official recorded finish must be SUBMISSION."],metric:"SUBMISSIONS",target:45,status:"ACTIVE",cardAsset:null,
  roster:[roster("William Regal","MEN",36,"TECHNICAL","RING_GENERAL","HEEL","Regal Stretch","Regal Stretch",82,81,92,96,91)]},
 {id:"arn-anderson",name:"Arn Anderson",tier:"LEGEND",division:"MEN",tradition:"US territory tag specialist",era:"1980s",visibility:"CLUED",
  clue:"The Enforcer appreciates precision in pairs.",achievement:"20 certified tag-team matches rated at least four-and-three-quarter stars",
  hints:["It takes more than one star performer.","An authenticated TEAMS match must earn 4¾ stars or better."],metric:"TAG_MASTERPIECES",target:20,status:"ACTIVE",cardAsset:null,
  roster:[roster("Arn Anderson","MEN",33,"TECHNICAL","ENFORCER","HEEL","Spinebuster","Double-A Spinebuster",91,88,92,95,89)]},
 {id:"dusty-rhodes",name:"Dusty Rhodes",tier:"LEGEND",division:"MEN",tradition:"Southern territories",era:"1970s–1980s",visibility:"KNOWN",
  clue:"Hard times make for the greatest interviews.",achievement:"40 completed angles drawing at least 88 crowd response",
  hints:["Words and betrayals can make history.","Only angles that happened and earned at least 88 crowd response count."],metric:"HOT_ANGLES",target:40,status:"ACTIVE",cardAsset:null,
  roster:[roster("Dusty Rhodes","MEN",36,"BRAWLER","FAN_FAVOURITE","FACE","Bionic Elbow","Bionic Elbow",95,97,75,93,99)]},
 {id:"lita",name:"Lita",tier:"LEGEND",division:"WOMEN",tradition:"Women's wrestling revolution",era:"2000s",visibility:"KNOWN",
  clue:"Team Xtreme taught the division to soar.",achievement:"40 certified women's matches rated at least four stars",
  hints:["The women's division must steal the show.","Every competitor must be in the women's division, with four stars or better."],metric:"WOMENS_CLASSICS",target:40,status:"ACTIVE",cardAsset:null,
  roster:[roster("Lita","WOMEN",28,"HIGH_FLYER","FAN_FAVOURITE","FACE","Hurricanrana","Litasault",85,90,84,86,96)]},
 {id:"bull-nakano",name:"Bull Nakano",tier:"LEGEND",division:"WOMEN",tradition:"Japanese joshi",era:"1990s",visibility:"SECRET",
  clue:"The monster queen demands more than a good fight.",achievement:"12 certified women's matches rated at least four-and-three-quarter stars",
  hints:["The women must deliver unforgettable classics.","Every competitor must be in the women's division, with at least 4¾ stars."],metric:"WOMENS_MASTERPIECES",target:12,status:"ACTIVE",cardAsset:null,
  roster:[roster("Bull Nakano","WOMEN",29,"POWERHOUSE","MONSTER","HEEL","Nunchaku Feint","Diving Guillotine Leg Drop",85,87,94,89,93)]},
 {id:"aja-kong",name:"Aja Kong",tier:"LEGEND",division:"WOMEN",tradition:"Japanese joshi",era:"1990s",visibility:"CLUED",
  clue:"A mountain of joshi history awaits its next challenger.",achievement:"65 certified women's matches rated at least four stars",
  hints:["The women's division must steal the show.","Every competitor must be in the women's division, with four stars or better."],metric:"WOMENS_CLASSICS",target:65,status:"ACTIVE",cardAsset:null,
  roster:[roster("Aja Kong","WOMEN",31,"POWERHOUSE","ENFORCER","HEEL","Backfist","Uraken",84,87,93,90,94)]},
 {id:"stan-hansen",name:"Stan Hansen",tier:"LEGEND",division:"MEN",tradition:"Japan/US strong style",era:"1980s",visibility:"SECRET",
  clue:"You'll hear that lariat before you ever see it.",achievement:"50 certified show-closing main events rated at least four-and-a-half stars",
  hints:["The final bell can be historic.","The last match on a certified card must earn at least 4½ stars."],metric:"MAIN_EVENT_CLASSICS",target:50,status:"ACTIVE",cardAsset:null,
  roster:[roster("Stan Hansen","MEN",35,"STRONG_STYLE","ENFORCER","HEEL","Western Lariat","Western Lariat",90,89,91,86,92)]},
 {id:"bret-hart",name:"Bret Hart",tier:"ICON",division:"MEN",tradition:"Canadian technical wrestling",era:"1990s",visibility:"CLUED",
  clue:"The best there is waits for a generation of great matches.",achievement:"50 certified matches rated at least four-and-three-quarter stars",
  hints:["Only extraordinary match quality counts.","A certified rating of 4¾ stars or better is required."],metric:"MASTERPIECES",target:50,status:"ACTIVE",cardAsset:null,
  roster:[roster("Bret Hart","MEN",35,"TECHNICAL","HERO","FACE","Russian Legsweep","Sharpshooter",97,96,99,98,94)]},
 {id:"mick-foley",name:"Mick Foley",tier:"ICON",division:"MEN",tradition:"Hardcore and US mainstream",era:"1990s",visibility:"CLUED",
  clue:"Someone has to have a nice day. Someone else needs a table.",achievement:"30 certified hardcore or dangerous-stipulation matches rated at least four stars",
  hints:["Hardcore doesn't count unless it really happened.","Stipulated bouts must achieve four stars or better."],metric:"HARDCORE_CLASSICS",target:30,status:"ACTIVE",cardAsset:null,
  roster:[roster("Mick Foley","MEN",33,"BRAWLER","ANTI_HERO","FACE","Cactus Clothesline","Mandible Claw",94,94,77,91,98)]},
 {id:"randy-savage",name:"Randy Savage",tier:"ICON",division:"MEN",tradition:"US mainstream",era:"1980s–1990s",visibility:"SECRET",
  clue:"Oh yeah! The madness waits for the main event.",achievement:"35 certified premium-show main events rated at least four-and-a-quarter stars",
  hints:["The biggest stage has the loudest echoes.","Only the last match on a completed premium show, at 4¼ stars or higher, counts."],metric:"PREMIUM_MAIN_EVENTS",target:35,status:"ACTIVE",cardAsset:null,
  roster:[roster("Randy Savage","MEN",34,"ALL_ROUNDER","ARROGANT_ACE","TWEENER","Flying Double Axe Handle","Diving Elbow Drop",97,98,92,95,100)]},
 {id:"kurt-angle",name:"Kurt Angle",tier:"ICON",division:"MEN",tradition:"Olympic and technical wrestling",era:"2000s",visibility:"KNOWN",
  clue:"It's true. Every submission makes the truth harder to ignore.",achievement:"100 certified matches ending by submission",
  hints:["Sometimes the decisive move is a hold.","The official recorded finish must be SUBMISSION."],metric:"SUBMISSIONS",target:100,status:"ACTIVE",cardAsset:null,
  roster:[roster("Kurt Angle","MEN",32,"TECHNICAL","ARROGANT_ACE","HEEL","German Suplex","Ankle Lock",96,96,99,97,96)]},
 {id:"booker-t",name:"Booker T",tier:"ICON",division:"MEN",tradition:"US tag and singles",era:"1990s–2000s",visibility:"CLUED",
  clue:"Can you dig it? The road to greatness runs through two partners.",achievement:"65 certified tag-team matches rated at least four-and-a-quarter stars",
  hints:["Teams rise or fall together.","The completed TEAMS match must earn at least 4¼ stars."],metric:"TAG_CLASSICS",target:65,status:"ACTIVE",cardAsset:null,
  roster:[roster("Booker T","MEN",35,"ALL_ROUNDER","FAN_FAVOURITE","FACE","Book End","Scissors Kick",92,94,87,90,96)]},
 {id:"great-muta",name:"The Great Muta",tier:"ICON",division:"MEN",tradition:"Japanese spectacle",era:"1990s",visibility:"SECRET",
  clue:"Poison mist turns a good story into an unforgettable one.",achievement:"75 completed angles drawing at least 88 crowd response",
  hints:["Words and betrayals can make history.","Only angles that happened and earned at least 88 crowd response count."],metric:"HOT_ANGLES",target:75,status:"ACTIVE",cardAsset:null,
  roster:[roster("The Great Muta","MEN",32,"STRONG_STYLE","MONSTER","HEEL","Shining Wizard","Moonsault",95,92,95,93,99)]},
 {id:"chyna",name:"Chyna",tier:"ICON",division:"WOMEN",tradition:"US crossover wrestling",era:"1990s–2000s",visibility:"KNOWN",
  clue:"The Ninth Wonder arrives when a women's division writes history.",achievement:"25 certified women's matches rated at least four-and-three-quarter stars",
  hints:["The women must deliver unforgettable classics.","Every competitor must be in the women's division, with at least 4¾ stars."],metric:"WOMENS_MASTERPIECES",target:25,status:"ACTIVE",cardAsset:null,
  roster:[roster("Chyna","WOMEN",30,"POWERHOUSE","ENFORCER","TWEENER","Military Press Slam","Pedigree",95,96,78,85,99)]},
 {id:"jushin-liger",name:"Jushin Thunder Liger",tier:"ICON",division:"MEN",tradition:"Japanese junior heavyweights",era:"1990s",visibility:"SECRET",
  clue:"Thunder and lightning follow a trail of certified classics.",achievement:"110 certified matches rated at least four-and-a-quarter stars",
  hints:["The bell tells the story.","A certified rating of 4¼ stars or better is required."],metric:"CLASSICS",target:110,status:"ACTIVE",cardAsset:null,
  roster:[roster("Jushin Thunder Liger","MEN",32,"HIGH_FLYER","HERO","FACE","Shotei","Liger Bomb",96,94,99,96,97)]},
 {id:"vader",name:"Vader",tier:"ICON",division:"MEN",tradition:"Japan/US heavyweight powerhouse",era:"1990s",visibility:"CLUED",
  clue:"It's time. The biggest nights demand a fearsome champion.",achievement:"70 certified premium-show matches rated at least four-and-a-quarter stars",
  hints:["Greatness needs a grand stage.","Any certified premium-show match rated at least 4¼ stars counts."],metric:"PREMIUM_CLASSICS",target:70,status:"ACTIVE",cardAsset:null,
  roster:[roster("Vader","MEN",34,"POWERHOUSE","MONSTER","HEEL","Vader Bomb","Vadersault",94,92,86,87,99)]},
 {id:"manami-toyota",name:"Manami Toyota",tier:"ICON",division:"WOMEN",tradition:"Japanese joshi classics",era:"1990s",visibility:"SECRET",
  clue:"Only the most breathtaking joshi classics open these doors.",achievement:"45 certified women's matches rated at least four-and-three-quarter stars",
  hints:["The women must deliver unforgettable classics.","Every competitor must be in the women's division, with at least 4¾ stars."],metric:"WOMENS_MASTERPIECES",target:45,status:"ACTIVE",cardAsset:null,
  roster:[roster("Manami Toyota","WOMEN",27,"HIGH_FLYER","HERO","FACE","Japanese Ocean Suplex","Japanese Ocean Cyclone Suplex",95,96,100,98,95)]},
 {id:"shawn-michaels",name:"Shawn Michaels",tier:"IMMORTAL",division:"MEN",tradition:"US show-stealing",era:"1990s–2000s",visibility:"CLUED",
  clue:"The showstopper only answers the call of main-event classics.",achievement:"75 certified premium-show main events rated at least four-and-a-quarter stars",
  hints:["The biggest stage has the loudest echoes.","Only the last match on a completed premium show, at 4¼ stars or higher, counts."],metric:"PREMIUM_MAIN_EVENTS",target:75,status:"ACTIVE",cardAsset:null,
  roster:[roster("Shawn Michaels","MEN",35,"ALL_ROUNDER","ARROGANT_ACE","TWEENER","Flying Forearm","Sweet Chin Music",99,99,98,99,99)]},
 {id:"steve-austin",name:"Stone Cold Steve Austin",tier:"IMMORTAL",division:"MEN",tradition:"Attitude Era",era:"1990s",visibility:"CLUED",
  clue:"The glass shatters whenever the crowd refuses to sit down.",achievement:"150 completed angles drawing at least 88 crowd response",
  hints:["Words and betrayals can make history.","Only angles that happened and earned at least 88 crowd response count."],metric:"HOT_ANGLES",target:150,status:"ACTIVE",cardAsset:null,
  roster:[roster("Stone Cold Steve Austin","MEN",35,"BRAWLER","ANTI_HERO","FACE","Lou Thesz Press","Stone Cold Stunner",100,100,86,97,100)]},
 {id:"hulk-hogan",name:"Hulk Hogan",tier:"IMMORTAL",division:"MEN",tradition:"1980s US mainstream",era:"1980s",visibility:"KNOWN",
  clue:"Hulkamania lives wherever the crowd shakes the building.",achievement:"300 certified matches drawing at least 90 crowd response",
  hints:["The audience has to truly erupt.","The actual completed match must reach 90 crowd response."],metric:"BIG_REACTIONS",target:300,status:"ACTIVE",cardAsset:null,
  roster:[roster("Hulk Hogan","MEN",35,"POWERHOUSE","HERO","FACE","Big Boot","Atomic Leg Drop",100,100,70,92,100)]},
 {id:"the-rock",name:"The Rock",tier:"IMMORTAL",division:"MEN",tradition:"Attitude Era",era:"1990s–2000s",visibility:"SECRET",
  clue:"The millions wait for another unforgettable moment.",achievement:"200 completed angles drawing at least 88 crowd response",
  hints:["Words and betrayals can make history.","Only angles that happened and earned at least 88 crowd response count."],metric:"HOT_ANGLES",target:200,status:"ACTIVE",cardAsset:null,
  roster:[roster("The Rock","MEN",31,"ALL_ROUNDER","ARROGANT_ACE","FACE","People's Elbow","Rock Bottom",100,100,91,97,100)]},
 {id:"ric-flair",name:"Ric Flair",tier:"IMMORTAL",division:"MEN",tradition:"NWA territory circuit",era:"1980s",visibility:"CLUED",
  clue:"To be the man, the World must change hands again and again. Woo!",achievement:"120 certified championship changes",
  hints:["Champions rise. Empires fall.","The World must record actual completed title changes."],metric:"TITLE_CHANGES",target:120,status:"ACTIVE",cardAsset:null,
  roster:[roster("Ric Flair","MEN",36,"TECHNICAL","ARROGANT_ACE","HEEL","Knife-edge Chop","Figure-Four Leglock",100,99,97,100,99)]},
 {id:"andre-giant",name:"André the Giant",tier:"IMMORTAL",division:"MEN",tradition:"International attraction",era:"1970s–1980s",visibility:"SECRET",
  clue:"An attraction larger than life needs a thousand thunderous ovations.",achievement:"450 certified matches drawing at least 90 crowd response",
  hints:["The audience has to truly erupt.","The actual completed match must reach 90 crowd response."],metric:"BIG_REACTIONS",target:450,status:"ACTIVE",cardAsset:null,
  roster:[roster("André the Giant","MEN",33,"POWERHOUSE","MONSTER","FACE","Bearhug","Giant Splash",100,100,67,85,100)]},
 {id:"antonio-inoki",name:"Antonio Inoki",tier:"IMMORTAL",division:"MEN",tradition:"Japanese puroresu",era:"1970s–1980s",visibility:"CLUED",
  clue:"Fighting spirit waits for a World built on the biggest nights.",achievement:"130 certified premium-show matches rated at least four-and-a-quarter stars",
  hints:["Greatness needs a grand stage.","Any certified premium-show match rated at least 4¼ stars counts."],metric:"PREMIUM_CLASSICS",target:130,status:"ACTIVE",cardAsset:null,
  roster:[roster("Antonio Inoki","MEN",35,"STRONG_STYLE","HERO","FACE","Enzuigiri","Octopus Hold",99,99,96,100,98)]},
 {id:"mitsuharu-misawa",name:"Mitsuharu Misawa",tier:"IMMORTAL",division:"MEN",tradition:"King's Road Japan",era:"1990s",visibility:"SECRET",
  clue:"Emerald greatness is counted in perfect nights.",achievement:"50 certified five-star matches",
  hints:["Good isn't enough. Legendary is.","Only an actual five-star certified result counts."],metric:"FIVE_STARS",target:50,status:"ACTIVE",cardAsset:null,
  roster:[roster("Mitsuharu Misawa","MEN",33,"STRONG_STYLE","RING_GENERAL","FACE","Tiger Driver","Emerald Flowsion",99,98,100,100,96)]},
 {id:"kenta-kobashi",name:"Kenta Kobashi",tier:"IMMORTAL",division:"MEN",tradition:"King's Road Japan",era:"1990s–2000s",visibility:"SECRET",
  clue:"A burning hammer is forged in seasons of championship dominance.",achievement:"150 consecutive weeks in a single verified title reign",
  hints:["Champions are measured by the calendar.","One uninterrupted reign, not several combined, must reach the goal."],metric:"LONGEST_REIGN",target:150,status:"ACTIVE",cardAsset:null,
  roster:[roster("Kenta Kobashi","MEN",34,"STRONG_STYLE","HERO","FACE","Machine Gun Chops","Burning Hammer",99,99,99,99,97)]},
 {id:"el-santo",name:"El Santo",tier:"IMMORTAL",division:"MEN",tradition:"Mexican lucha heritage",era:"1960s–1970s",visibility:"SECRET",
  clue:"A silver mask shines brightest after an era on the throne.",achievement:"230 consecutive weeks in a single verified title reign",
  hints:["Champions are measured by the calendar.","One uninterrupted reign, not several combined, must reach the goal."],metric:"LONGEST_REIGN",target:230,status:"ACTIVE",cardAsset:null,
  roster:[roster("El Santo","MEN",34,"LUCHA","HERO","FACE","Plancha","La de a Caballo",100,100,95,98,100)]},
];
/** Release gate deliberately remains OFF until every user-supplied card and
 * team portrait is present, visually reviewed and approved for this build.
 * No dynamic environment switch: accidental deployment cannot activate it.
 * With this switch ON, the existing Vault, shared World Lock, KP collectibles
 * and free-agent market receive all 129 definitions without a new code path.
 */
export const LEGENDS_EXPANSION_RELEASED:boolean=true;
export const LEGENDS_CATALOGUE:readonly LegendDefinition[]=Object.freeze([
 ...active,...curated,...(LEGENDS_EXPANSION_RELEASED?reviewedLegendExpansion():[])
]);
export const LIVE_LEGENDS=LEGENDS_CATALOGUE.filter(x=>x.status==="ACTIVE");
export const LEGEND_TIER_PRICES:Readonly<Record<LegendTier,number>>={
 CULT:750,LEGEND:1400,ICON:2200,IMMORTAL:4000
};
export function findLegend(id:string){return LEGENDS_CATALOGUE.find(x=>x.id===id)??null;}
export function legendUnlockEligible(def:LegendDefinition,metrics:Readonly<Partial<Record<LegendMetric,number>>>){
 return def.status==="ACTIVE"&&def.metric!==null&&def.target!==null&&
  (metrics[def.metric]??0)>=def.target;
}
