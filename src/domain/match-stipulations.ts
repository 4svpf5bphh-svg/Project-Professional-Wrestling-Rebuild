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
 {value:"SUBMISSION",label:"Submission Match",summary:"Only a tap-out or referee stoppage settles the bout."}
] as const;
export type MatchStipulation=typeof MATCH_STIPULATIONS[number]["value"];
export type StipulatedWinMethod="RETRIEVAL"|"TABLE_BREAK"|"TEN_COUNT";
const allowed:Record<MatchStipulation,readonly string[]>={
 STANDARD:[],
 HARDCORE:["CLEAN_PIN","FLASH_PIN","SUBMISSION","PROTECTED_FINISH","FOREIGN_OBJECT"],
 STEEL_CAGE:["CLEAN_PIN","SUBMISSION"],
 LADDER:["RETRIEVAL"],TABLES:["TABLE_BREAK"],TLC:["RETRIEVAL"],
 LAST_MAN_STANDING:["TEN_COUNT"],SUBMISSION:["SUBMISSION"]
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
  value==="SUBMISSION"&&singleOrTag.has(format)).map(x=>x.value);
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
  ["TRIPLE_THREAT","FOUR_WAY","MULTI_TEAM"].includes(format)?
   ["CLEAN_PIN","SUBMISSION","FLASH_PIN","PROTECTED_FINISH"]:
   ["CLEAN_PIN","SUBMISSION","FLASH_PIN","PROTECTED_FINISH",
    "DISQUALIFICATION","FOREIGN_OBJECT"];
}
export function defaultStipulationFinish(value:MatchStipulation):string{
 return value==="LADDER"||value==="TLC"?"RETRIEVAL":
  value==="TABLES"?"TABLE_BREAK":
  value==="LAST_MAN_STANDING"?"TEN_COUNT":
  value==="SUBMISSION"?"SUBMISSION":"CLEAN_PIN";
}
export function stipulationScoringFinish(finish:string):string{
 return ["RETRIEVAL","TABLE_BREAK","TEN_COUNT"].includes(finish)?"CLEAN_PIN":finish;
}
export function stipulationInjuryRisk(value:MatchStipulation):number{
 const risk:Record<MatchStipulation,number>={
  STANDARD:1,HARDCORE:1.22,STEEL_CAGE:1.18,LADDER:1.35,
  TABLES:1.25,TLC:1.48,LAST_MAN_STANDING:1.2,SUBMISSION:1.05
 };
 return risk[value];
}
export function isSpecialStipulationFinish(value:string):value is StipulatedWinMethod{
 return value==="RETRIEVAL"||value==="TABLE_BREAK"||value==="TEN_COUNT";
}
