/** Official, verified, decisive wins can crown champions regardless of match
 * stipulation. Dirty, protected, injury-stoppage and DQ results cannot. */
import {isSpecialStipulationFinish} from "./match-stipulations.js";
export function isDecisiveChampionshipFinish(value:string):boolean{
 return value==="CLEAN_PIN"||value==="FLASH_PIN"||value==="SUBMISSION"||
  isSpecialStipulationFinish(value);
}
