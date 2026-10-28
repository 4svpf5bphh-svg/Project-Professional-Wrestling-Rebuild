/** Owner-approved Phase 12 roster, 28 October 2026.
 * A planning catalogue only: never imported into active LEGENDS_CATALOGUE until
 * owner-supplied photography, unlock evidence and gameplay integration are done.
 * One team counts as one unlock; no wrestler appears twice.
 */
import type {LegendTier,LegendDivision} from "./legends-catalogue.js";
export interface ApprovedLegend {
 name:string;tier:LegendTier;division:LegendDivision;members?:readonly string[];
}
const group=(tier:LegendTier,names:readonly string[],division:LegendDivision="MEN"):
 ApprovedLegend[]=>names.map(name=>({name,tier,division}));
export const APPROVED_LEGEND_EXPANSION:readonly ApprovedLegend[]=Object.freeze([
 ...group("CULT",[
  "Shane Douglas","Tommy Dreamer","The Sandman","Lance Storm","Mike Awesome",
  "Haku","Doink the Clown"
 ]),
 ...group("LEGEND",[
  "Owen Hart","Rick Rude","Bam Bam Bigelow","Brian Pillman",
  "Jake Roberts","Diamond Dallas Page","Big Show","Rob Van Dam",
  "Lex Luger","Ted DiBiase","Sgt. Slaughter","Sid Vicious","Mark Henry",
  "Big Boss Man","Nick Bockwinkel","Barry Windham","Tully Blanchard",
  "Kerry Von Erich","Rick Martel","Paul Orndorff","The Iron Sheik",
  "Ken Shamrock","Bray Wyatt","Brodie Lee","PAC","Rikishi","X-Pac",
  "The Honky Tonk Man","Rhyno","Abyss","Jay Briscoe","Hayabusa"
 ]),
 ...group("ICON",[
  "Triple H","Batista","Roddy Piper","Goldberg","Yokozuna",
  "Hiroshi Tanahashi","Kane","AJ Styles","Daniel Bryan",
  "Jerry Lawler","The Ultimate Warrior","Brock Lesnar",
  "Bruiser Brody","Superstar Billy Graham","Tiger Mask I","Big Daddy"
 ]),
 ...group("IMMORTAL",[
  "John Cena","Harley Race","Terry Funk","Lou Thesz","Verne Gagne"
 ]),
 ...group("LEGEND",[
  "Molly Holly","Gail Kim","Victoria","Awesome Kong",
  "Sensational Sherri","Luna Vachon","Devil Masami","Wendi Richter"
 ],"WOMEN"),
 ...group("ICON",["Akira Hokuto","Meiko Satomura","Madusa"],"WOMEN"),
 ...group("IMMORTAL",["Mildred Burke"],"WOMEN"),
 {name:"The Dudley Boyz",tier:"ICON",division:"MEN",members:["Bubba Ray Dudley","D-Von Dudley"]},
 {name:"The Steiner Brothers",tier:"ICON",division:"MEN",members:["Rick Steiner","Scott Steiner"]},
 {name:"Demolition",tier:"ICON",division:"MEN",members:["Ax","Smash"]},
 {name:"The Midnight Express",tier:"LEGEND",division:"MEN",members:["Bobby Eaton","Stan Lane"]},
 {name:"The British Bulldogs",tier:"LEGEND",division:"MEN",members:["Davey Boy Smith","Dynamite Kid"]},
 {name:"The Outsiders",tier:"ICON",division:"MEN",members:["Scott Hall","Kevin Nash"]},
 {name:"The Wild Samoans",tier:"LEGEND",division:"MEN",members:["Afa","Sika"]},
 {name:"APA",tier:"LEGEND",division:"MEN",members:["Bradshaw","Ron Simmons"]},
 {name:"The Fabulous Freebirds",tier:"ICON",division:"MEN",
  members:["Michael Hayes","Terry Gordy","Buddy Roberts"]},
 {name:"Beer Money Inc.",tier:"LEGEND",division:"MEN",members:["Bobby Roode","James Storm"]},
 {name:"The Natural Disasters",tier:"LEGEND",division:"MEN",members:["Earthquake","Typhoon"]}
]);
export const EXCLUDED_LEGENDS=Object.freeze([
 "Giant Baba","Jumbo Tsuruta","Toshiaki Kawada","Shinya Hashimoto",
 "Blue Demon","Mil Máscaras","Umaga","Bob Backlund","Fit Finlay",
 "Pedro Morales","Masahiro Chono","Minoru Suzuki","Kendo Nagasaki",
 "Giant Haystacks","Johnny Saint","Chris Candido","Stevie Richards",
 "The Hurricane","Gangrel","Billy Kidman","Paul London"
]);
