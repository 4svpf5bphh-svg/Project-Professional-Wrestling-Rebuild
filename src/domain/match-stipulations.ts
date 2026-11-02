/** A stipulation is part of the authoritative match contract, NOT just billing.
 * Existing STANDARD and historical cards retain their original outcomes.
 * Physical risk and win methods are enforced by the World resolver.
 */
export const MATCH_STIPULATIONS=[
 {value:"STANDARD",label:"Standard rules",summary:"Pinfall, submission or an allowed booked finish."},
 {value:"HARDCORE",label:"Hardcore / No DQ",summary:"No disqualifications; higher physical risk and weapon finishes."},
 {value:"STEEL_CAGE",label:"Steel Cage",summary:"Contained contest; pinfall or submission, no outside interference."},
 {value:"LADDER",label:"Ladder Match",summary:"Win by retrieving the prize above the ring."},
 {value:"TABLES",label:"Tables Match",summary:"Win by putting an opponent through a table."},
 {value:"TLC",label:"Tables, Ladders & Chairs",summary:"Win by retrieval in a demanding, high-risk match."},
 {value:"LAST_MAN_STANDING",label:"Last Man Standing",summary:"Win when your opponent cannot answer a ten-count."},
 {value:"SUBMISSION",label:"Submission Match",summary:"Only a tap-out or referee stoppage settles the bout."},
 {value:"IRON_MAN",label:"Iron Man Match",summary:"30 or 60 minutes; most falls when time expires wins."},
 {value:"TWO_OUT_OF_THREE",label:"Two out of Three Falls",summary:"The first competitor or team to earn two falls wins."},
 {value:"FALLS_COUNT_ANYWHERE",label:"Falls Count Anywhere",summary:"Falls count around the arena; no count-outs."},
 {value:"I_QUIT",label:"I Quit Match",summary:"Victory only when an opponent verbally surrenders."},
 {value:"FIRST_BLOOD",label:"First Blood",summary:"The first wrestler made to bleed loses."},
 {value:"BACKSTAGE_BRAWL",label:"Backstage Brawl",summary:"A dangerous fight through the backstage area."},
 {value:"CASKET",label:"Casket Match",summary:"Victory comes by placing an opponent inside a casket and closing the lid."}
] as const;
export type MatchStipulation=typeof MATCH_STIPULATIONS[number]["value"];
export type StipulatedWinMethod="RETRIEVAL"|"TABLE_BREAK"|"TEN_COUNT"|
 "MOST_FALLS"|"SECOND_FALL"|"VERBAL_SURRENDER"|"FIRST_BLOOD"|"CASKET_CLOSE";
const allowed:Record<MatchStipulation,readonly string[]>={
 STANDARD:[],
 HARDCORE:["CLEAN_PIN","FLASH_PIN","SUBMISSION","PROTECTED_FINISH","FOREIGN_OBJECT"],
 STEEL_CAGE:["CLEAN_PIN","SUBMISSION"],
 LADDER:["RETRIEVAL"],TABLES:["TABLE_BREAK"],TLC:["RETRIEVAL"],
 LAST_MAN_STANDING:["TEN_COUNT"],SUBMISSION:["SUBMISSION"],
 IRON_MAN:["MOST_FALLS"],TWO_OUT_OF_THREE:["SECOND_FALL"],
 FALLS_COUNT_ANYWHERE:["CLEAN_PIN","FLASH_PIN","SUBMISSION","PROTECTED_FINISH"],
 I_QUIT:["VERBAL_SURRENDER"],FIRST_BLOOD:["FIRST_BLOOD"],
 BACKSTAGE_BRAWL:["CLEAN_PIN","SUBMISSION","PROTECTED_FINISH"],
 CASKET:["CASKET_CLOSE"]
};
const singleOrTag=new Set(["SINGLES","TAG"]);
const field=new Set(["SINGLES","TAG","TRIPLE_THREAT","FOUR_WAY"]);
export function compatibleStipulations(format:string):MatchStipulation[]{
 return MATCH_STIPULATIONS.filter(({value})=>value==="STANDARD"||
  value==="HARDCORE"&&field.has(format)||
  value==="LADDER"&&field.has(format)||
  value==="STEEL_CAGE"&&singleOrTag.has(format)||
  value==="TABLES"&&singleOrTag.has(format)||
  value==="TLC"&&singleOrTag.has(format)||
  value==="LAST_MAN_STANDING"&&format==="SINGLES"||
  value==="SUBMISSION"&&singleOrTag.has(format)||
  value==="IRON_MAN"&&singleOrTag.has(format)||
  value==="TWO_OUT_OF_THREE"&&singleOrTag.has(format)||
  value==="FALLS_COUNT_ANYWHERE"&&field.has(format)||
  value==="I_QUIT"&&format==="SINGLES"||
  value==="FIRST_BLOOD"&&format==="SINGLES"||
  value==="BACKSTAGE_BRAWL"&&singleOrTag.has(format)||
  value==="CASKET"&&format==="SINGLES").map(x=>x.value);
}
export function readMatchStipulation(value:unknown,format:string):MatchStipulation{
 const actual=value===undefined?"STANDARD":value;
 if(typeof actual!=="string"||
  !compatibleStipulations(format).some(x=>x===actual))
  throw new Error("This stipulation is not permitted for the chosen match format");
 return actual as MatchStipulation;
}
export function stipulationLabel(value:MatchStipulation):string{
 return MATCH_STIPULATIONS.find(x=>x.value===value)!.label;
}
export function permittedStipulationFinishes(value:MatchStipulation,
 format:string):readonly string[]{
 if(value!=="STANDARD")return allowed[value].filter(f=>
  !["TRIPLE_THREAT","FOUR_WAY"].includes(format)||f!=="FOREIGN_OBJECT");
 return format==="BATTLE_ROYAL"?["OVER_THE_TOP_ROPE"]:
  ["TRIPLE_THREAT","FOUR_WAY"].includes(format)?
   ["CLEAN_PIN","SUBMISSION","FLASH_PIN","PROTECTED_FINISH"]:
   ["CLEAN_PIN","SUBMISSION","FLASH_PIN","PROTECTED_FINISH",
    "DISQUALIFICATION","FOREIGN_OBJECT"];
}
export function defaultStipulationFinish(value:MatchStipulation):string{
 return value==="LADDER"||value==="TLC"?"RETRIEVAL":
  value==="TABLES"?"TABLE_BREAK":
  value==="LAST_MAN_STANDING"?"TEN_COUNT":
  value==="SUBMISSION"?"SUBMISSION":
  value==="IRON_MAN"?"MOST_FALLS":
  value==="TWO_OUT_OF_THREE"?"SECOND_FALL":
  value==="I_QUIT"?"VERBAL_SURRENDER":
  value==="FIRST_BLOOD"?"FIRST_BLOOD":
  value==="CASKET"?"CASKET_CLOSE":"CLEAN_PIN";
}
export function stipulationScoringFinish(finish:string):string{
 return ["RETRIEVAL","TABLE_BREAK","TEN_COUNT","MOST_FALLS",
  "SECOND_FALL","FIRST_BLOOD","CASKET_CLOSE"].includes(finish)?"CLEAN_PIN":
  finish==="VERBAL_SURRENDER"?"SUBMISSION":finish;
}
export function stipulationInjuryRisk(value:MatchStipulation):number{
 const risk:Record<MatchStipulation,number>={
  STANDARD:1,HARDCORE:1.22,STEEL_CAGE:1.18,LADDER:1.35,
  TABLES:1.25,TLC:1.48,LAST_MAN_STANDING:1.2,SUBMISSION:1.05,
  IRON_MAN:1.16,TWO_OUT_OF_THREE:1.09,FALLS_COUNT_ANYWHERE:1.3,
  I_QUIT:1.25,FIRST_BLOOD:1.22,BACKSTAGE_BRAWL:1.37,CASKET:1.23
 };
 return risk[value];
}
export function isSpecialStipulationFinish(value:string):value is StipulatedWinMethod{
 return ["RETRIEVAL","TABLE_BREAK","TEN_COUNT","MOST_FALLS",
  "SECOND_FALL","VERBAL_SURRENDER","FIRST_BLOOD","CASKET_CLOSE"].includes(value);
}

/** Different matches reward different strengths. Never grant a fixed
 * quality bonus simply for choosing a stipulation; poor fit can lose points.
 * The multiplier applies to execution opportunity, not star ratings.
 */
export function stipulationExecutionFit(stip:MatchStipulation,context:{
 inRing:number;craft:number;presentation:number;stamina:number;safety:number;
 fatigue:number;length:number;intent:string;
}):number{
 if(stip==="STANDARD")return 0;
 const c=context;
 const technical=(c.inRing*.45+c.craft*.4+c.stamina*.15);
 const physical=(c.inRing*.32+c.craft*.18+c.presentation*.23+c.safety*.27);
 const showmanship=(c.presentation*.4+c.craft*.25+c.inRing*.2+c.safety*.15);
 const fits:Record<Exclude<MatchStipulation,"STANDARD">,number>={
  HARDCORE:physical,LADDER:physical,STEEL_CAGE:technical*.4+physical*.6,
  TABLES:physical,TLC:physical*.7+showmanship*.3,
  LAST_MAN_STANDING:physical*.6+c.stamina*.4,
  SUBMISSION:technical,IRON_MAN:technical*.6+c.stamina*.4,
  TWO_OUT_OF_THREE:technical,FALLS_COUNT_ANYWHERE:physical,
  I_QUIT:showmanship*.5+physical*.5,FIRST_BLOOD:physical,
  BACKSTAGE_BRAWL:physical,CASKET:showmanship*.65+physical*.35
 };
 const fit=fits[stip];
 const suitedIntent=
  ["IRON_MAN","TWO_OUT_OF_THREE","SUBMISSION"].includes(stip)?
   ["TECHNICAL","COMPETITIVE","EPIC"].includes(c.intent):
   ["HIGH_RISK","EPIC","STORY"].includes(c.intent);
 const endurance=["IRON_MAN","TWO_OUT_OF_THREE","LAST_MAN_STANDING"].includes(stip);
 const fatiguePenalty=(endurance?0.07:0.035)*c.fatigue;
 const lengthPenalty=stip==="IRON_MAN"&&c.length<30?8:0;
 // Maximum ~+5 execution points; maximum ~-6 for a poorly matched stunt.
 return Math.round(Math.max(-6,Math.min(5,
  (fit-64)*.105+(suitedIntent?1.2:-.7)-fatiguePenalty-lengthPenalty))*10)/10;
}
export function stipulationMinimumMinutes(stip:MatchStipulation):number{
 return stip==="IRON_MAN"?30:stip==="TWO_OUT_OF_THREE"?15:
  stip==="LAST_MAN_STANDING"||stip==="I_QUIT"?10:3;
}
