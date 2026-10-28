/** Curated clues and historical context for the approved 81 new unlocks.
 * Separate from the 48 live Legends; this module never publishes wrestlers.
 * Keep one authentic wrestling identity and one meaningful in-world clue per
 * person/team. No mass unlock; the certified World cadence remains authoritative.
 */
import {APPROVED_LEGEND_EXPANSION} from "./approved-legend-expansion.js";
import {APPROVED_LEGEND_MILESTONES} from "./approved-legend-milestones.js";
import {approvedPrimeLegend} from "./approved-legend-prime-profiles.js";
import type {LegendDefinition,LegendMetric,LegendVisibility}
 from "./legends-catalogue.js";

const prose:readonly (readonly [string,string,string,string])[]=[
 ["Shane Douglas","ECW franchise wrestling","1990s","A franchise turns a shortcut into a revolution."],
 ["Tommy Dreamer","ECW hardcore wrestling","1990s–2000s","No wound is deep enough to keep the heart of extreme from returning."],
 ["The Sandman","Philadelphia hardcore wrestling","1990s","The sound of breaking glass gives way to a long walk through the crowd."],
 ["Lance Storm","Canadian and ECW technical wrestling","1990s–2000s","The straight-faced technician makes every hold a statement."],
 ["Mike Awesome","FMW and ECW high-impact wrestling","1990s","From the top rope, the giant lands like a freight train."],
 ["Haku","Tongan strong-style wrestling","1980s–1990s","When every locker room fears a grip, the King needs no crown."],
 ["Doink the Clown","WWF character wrestling","1990s","The painted smile conceals an unusually cruel trick."],
 ["Owen Hart","Hart-family technical wrestling","1990s","The younger Hart takes the aerial route to greatness."],
 ["Rick Rude","WWF and WCW main-event wrestling","1980s–1990s","No man admires his own reflection more than this ruthless champion."],
 ["Bam Bam Bigelow","ECW and WWF big-man wrestling","1990s","Flames burn brighter when a heavyweight takes flight."],
 ["Brian Pillman","WCW and WWF high-risk wrestling","1990s","The Loose Cannon has never followed a script on command."],
 ["Jake Roberts","Territory and WWF psychology","1980s–1990s","The snake waits patiently, and one DDT is enough."],
 ["Diamond Dallas Page","WCW main-event wrestling","1990s","An unlikely late bloomer finds a diamond in the rough."],
 ["Big Show","WCW and WWE giant wrestling","1990s–2000s","One raised hand can silence an entire arena."],
 ["Rob Van Dam","ECW and WWE aerial wrestling","1990s–2000s","One of a kind, from the ropes to the final splash."],
 ["Lex Luger","NWA and WCW power wrestling","1980s–1990s","The Total Package believes no opponent can survive the rack."],
 ["Ted DiBiase","WWF championship-era villainy","1980s","Everybody has a price, but some victories cannot be bought."],
 ["Sgt. Slaughter","WWF and AWA territorial wrestling","1980s","A drill sergeant puts the roster through a brutal test."],
 ["Sid Vicious","WCW and WWF powerhouse wrestling","1990s","The ruler of the world arrives with a powerbomb."],
 ["Mark Henry","WWE powerhouse wrestling","2000s–2010s","The Hall of Pain is accepting its next member."],
 ["Big Boss Man","WWF heavyweight character wrestling","1980s–1990s","The law lays down a heavy sentence inside the ropes."],
 ["Nick Bockwinkel","AWA technical championship wrestling","1970s–1980s","The most articulate champion can also outwrestle anybody."],
 ["Barry Windham","NWA and WCW technical wrestling","1980s–1990s","The tall Texan carries Horsemen history into the ring."],
 ["Tully Blanchard","NWA Four Horsemen wrestling","1980s","The Horsemen's sharpest opportunist knows how to steal the moment."],
 ["Kerry Von Erich","World Class Championship Wrestling","1980s","The Modern Day Warrior walks out beneath a Texas sky."],
 ["Rick Martel","AWA and WWF technical wrestling","1980s–1990s","The Model's reflection is matched only by his arrogance."],
 ["Paul Orndorff","NWA and WWF powerhouse wrestling","1980s","Mr Wonderful never doubts his own greatness."],
 ["The Iron Sheik","WWF territorial villainy","1980s","An unforgiving camel clutch ends every argument."],
 ["Ken Shamrock","MMA crossover and WWE wrestling","1990s","The World's Most Dangerous Man is ready to snap."],
 ["Bray Wyatt","WWE psychological and character wrestling","2010s","Follow the buzzards to a firefly-lit darkness."],
 ["Brodie Lee","Independent and AEW powerhouse wrestling","2000s–2020s","A towering leader commands respect with a devastating lariat."],
 ["PAC","Dragon Gate and international high-flying","2010s","The Bastard makes gravity look like a suggestion."],
 ["Rikishi","WWF and WWE Samoan wrestling","1990s–2000s","A dance becomes dangerous when the heavyweight turns around."],
 ["X-Pac","WWF and WCW cruiserweight wrestling","1990s–2000s","The rebel who crossed two wars still moves like lightning."],
 ["The Honky Tonk Man","WWF intercontinental wrestling","1980s","The greatest of all time keeps his guitar close."],
 ["Rhyno","ECW and WWE powerhouse wrestling","2000s","A charging rhinoceros only needs one Gore."],
 ["Abyss","TNA monster wrestling","2000s","The monster's mask hides years of violent memories."],
 ["Jay Briscoe","ROH tag-team and independent wrestling","2000s–2020s","A Delaware fight breeds a wrestler who never backs down."],
 ["Hayabusa","FMW Japanese high-flying","1990s","The phoenix rises above the ropes and changes the sky."],
 ["Triple H","WWE main-event and faction wrestling","2000s","The cerebral assassin knows exactly where the game is won."],
 ["Batista","WWE powerhouse main events","2000s","The Animal has escaped, and the ring is no longer safe."],
 ["Roddy Piper","WWF and NWA talk-and-fight wrestling","1980s","A hot rod rattles every cage until the crowd erupts."],
 ["Goldberg","WCW undefeated-streak wrestling","1990s","Who's next becomes the most dangerous question in wrestling."],
 ["Yokozuna","WWF heavyweight championship wrestling","1990s","The mountain stands still until the ring shakes."],
 ["Hiroshi Tanahashi","NJPW ace wrestling","2000s–2010s","The Ace carries a generation on his shoulders."],
 ["Kane","WWE character and powerhouse wrestling","1990s–2000s","The lights turn red when the Big Red Machine awakens."],
 ["AJ Styles","TNA NJPW and WWE world wrestling","2000s–2010s","Phenomenal is not a nickname, it is a warning."],
 ["Daniel Bryan","ROH and WWE technical wrestling","2000s–2010s","An unlikely champion hears a thousand voices say yes."],
 ["Jerry Lawler","Memphis and WWF territory wrestling","1970s–1990s","The King has held court through every territory."],
 ["The Ultimate Warrior","WWF championship spectacle","1980s–1990s","The ropes shake before the warpaint charges in."],
 ["Brock Lesnar","WWE and MMA heavyweight wrestling","2000s–2010s","A conqueror drags the fight to Suplex City."],
 ["Bruiser Brody","Territorial wild-brawler wrestling","1970s–1980s","The wild man moves through a territory like a storm."],
 ["Superstar Billy Graham","WWWF bodybuilder-era wrestling","1970s","An outrageous champion flexes his way into history."],
 ["John Cena","WWE franchise wrestling","2000s–2010s","The invisible hand has carried an entire generation."],
 ["Harley Race","NWA territorial championship wrestling","1970s–1980s","Eight hard-earned reigns leave a king without a throne."],
 ["Terry Funk","NWA ECW and hardcore legacy","1970s–2000s","The Funkster refuses to let the final bell end his fight."],
 ["Lou Thesz","NWA catch-as-catch-can wrestling","1940s–1960s","The old-world champion sets the rules for everyone after him."],
 ["Verne Gagne","AWA technical championship wrestling","1960s–1970s","The Minnesota champion makes long reigns an art form."],
 ["Molly Holly","WWE women's technical wrestling","2000s","A superhero proves that quiet excellence still matters."],
 ["Gail Kim","TNA and WWE women's wrestling","2000s–2010s","An innovator keeps raising the division's ceiling."],
 ["Victoria","WWE women's championship wrestling","2000s","The Widow's Peak is a warning few can escape."],
 ["Awesome Kong","TNA and Japanese women's powerhouse","2000s","A colossal figure changes the division by force."],
 ["Sensational Sherri","WWF and AWA women's wrestling","1980s–1990s","A sensational voice commands attention before the bell."],
 ["Luna Vachon","WWF and independent women's wrestling","1990s","A vicious family legacy marches to its own rhythm."],
 ["Devil Masami","Japanese joshi wrestling","1980s–1990s","The joshi powerhouse turns a final slam into thunder."],
 ["Wendi Richter","WWF Rock 'n' Wrestling era","1980s","A new generation takes centre stage and changes the division."],
 ["Akira Hokuto","AJW Japanese joshi wrestling","1990s","The Dangerous Queen makes a northern-light bomb legendary."],
 ["Meiko Satomura","Sendai Girls and international joshi","2000s–2010s","The final boss demands brilliance from every challenger."],
 ["Madusa","WWF WCW and Japanese women's wrestling","1990s","A woman's belt crosses a divide and changes wrestling history."],
 ["Mildred Burke","Women's wrestling pioneer","1940s–1950s","The first great queen of the ring refuses to surrender."],
 ["The Dudley Boyz","ECW and WWE tag-team warfare","1990s–2000s","Two brothers bring tables to the neighbourhood."],
 ["The Steiner Brothers","NWA WCW and WWF tag wrestling","1980s–1990s","The university's strongest mathematics is a double-team suplex."],
 ["Demolition","WWF power tag-team wrestling","1980s–1990s","Face paint and an axe leave challengers in pieces."],
 ["The Midnight Express","NWA territory tag-team wrestling","1980s","The midnight flight arrives with a rocket launcher."],
 ["The British Bulldogs","WWF and Stampede tag-team wrestling","1980s","Two Bulldogs combine British power and Calgary precision."],
 ["The Outsiders","WCW nWo faction wrestling","1990s","Two strangers arrive to start a new world order."],
 ["The Wild Samoans","WWF territorial tag wrestling","1970s–1980s","Two brothers from the islands bring a wild storm."],
 ["APA","WWF Attitude Era tag wrestling","1990s–2000s","Business is booming, and the door is always open for a fight."],
 ["The Fabulous Freebirds","WCCW territorial tag wrestling","1980s","Three rebels turn a tag-team rule into their own advantage."],
 ["Beer Money Inc.","TNA heavyweight tag wrestling","2000s–2010s","The last call costs more than a fistful of cash."],
 ["The Natural Disasters","WWF heavyweight tag wrestling","1990s","The earth shakes and the tide rises as two giants arrive."],
];
const profiles=new Map(prose.map(([name,tradition,era,clue])=>
 [name,{tradition,era,clue}]));
const milestones=new Map(APPROVED_LEGEND_MILESTONES.map(x=>[x.name,x]));
const metricDescriptions:Record<LegendMetric,string>={
 CLASSICS:"certified four-and-a-quarter-star matches",
 HOT_ANGLES:"certified angles with an outstanding crowd response",
 DIRTY_FINISHES:"recorded rule-breaking match finishes",
 MASTERPIECES:"certified four-and-three-quarter-star matches",
 WOMENS_CLASSICS:"certified women's matches with at least four stars",
 TAG_CLASSICS:"certified tag-team matches with at least four-and-a-quarter stars",
 TITLE_CHANGES:"verified championship title changes",
 LONGEST_REIGN:"consecutive weeks in a verified championship reign",
 PREMIUM_MAIN_EVENTS:"premium-event main events with at least four-and-a-quarter stars",
 HARDCORE_CLASSICS:"hardcore matches rated at least four stars",
 HARDCORE_MATCHES:"certified hardcore-stipulation matches",
 SUBMISSIONS:"recorded submission finishes",
 WEEKLY_CLASSICS:"regular weekly matches rated at least four stars",
 BIG_REACTIONS:"certified matches with a very strong crowd response",
 TAG_MASTERPIECES:"certified four-and-three-quarter-star tag-team matches",
 WOMENS_MASTERPIECES:"certified four-and-three-quarter-star women's matches",
 PREMIUM_CLASSICS:"premium-event matches with at least four-and-a-quarter stars",
 MAIN_EVENT_CLASSICS:"four-and-a-half-star main events",
 FIVE_STARS:"five-star certified matches",
 STIPULATED_CLASSICS:"stipulated matches with at least four-and-a-quarter stars"
};
const hintByMetric:Record<LegendMetric,string>={
 CLASSICS:"Quality across the World matters more than promotion size.",
 HOT_ANGLES:"Only angles that actually happened with a real crowd response count.",
 DIRTY_FINISHES:"A clean finish is not enough to awaken this mystery.",
 MASTERPIECES:"Only the rarest match ratings advance the challenge.",
 WOMENS_CLASSICS:"The women's division must be given the spotlight.",
 TAG_CLASSICS:"Two sides must deliver excellent certified team wrestling.",
 TITLE_CHANGES:"Championships must genuinely change hands.",
 LONGEST_REIGN:"This is one continuous reign, not a combined career total.",
 PREMIUM_MAIN_EVENTS:"The headline must deliver on a premium stage.",
 HARDCORE_CLASSICS:"Chaos still has to produce a genuinely great match.",
 HARDCORE_MATCHES:"Hardcore stipulations must actually be wrestled.",
 SUBMISSIONS:"A real submission finish settles the argument.",
 WEEKLY_CLASSICS:"Television has to deliver the classics too.",
 BIG_REACTIONS:"The audience must respond inside an actual completed match.",
 TAG_MASTERPIECES:"An exceptional tag match is needed.",
 WOMENS_MASTERPIECES:"The women's division has to deliver something extraordinary.",
 PREMIUM_CLASSICS:"Only premium-event performances count here.",
 MAIN_EVENT_CLASSICS:"The closing match must bring the house down.",
 FIVE_STARS:"Perfection is scarce even across a whole World.",
 STIPULATED_CLASSICS:"The special stipulation must produce a classic."
};
const idOf=(name:string)=>name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
export const PLANNED_LEGEND_DEFINITIONS:readonly LegendDefinition[]=
 Object.freeze(APPROVED_LEGEND_EXPANSION.map((item)=>{
  const c=profiles.get(item.name),m=milestones.get(item.name);
  if(!c||!m)throw new Error("Uncurated new Legend "+item.name);
  const visibility:LegendVisibility=item.tier==="CULT"?"KNOWN":
   item.tier==="LEGEND"?"CLUED":"SECRET";
  return Object.freeze({
   id:idOf(item.name),name:item.name,tier:item.tier,
   division:item.division,tradition:c.tradition,era:c.era,
   visibility,clue:c.clue,
   achievement:m.target+" "+metricDescriptions[m.metric]+" across the certified World",
   metric:m.metric,target:m.target,
   hints:[hintByMetric[m.metric],
     "Earn the achievement through real completed shows; the World reveals one new arrival at a time."] as [string,string],
   roster:Object.freeze((item.members??[item.name]).map(name=>
    approvedPrimeLegend(name,item.division))),
   cardAsset:null, // Await image ingestion, human visual approval and rights clearance.
   status:"PLANNED" as const
  });
 }));
