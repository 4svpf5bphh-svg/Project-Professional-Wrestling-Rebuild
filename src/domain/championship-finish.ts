/** Official, verified, decisive wins can crown champions regardless of match
 * stipulation. A concealed foul that produces an official victory can also win gold.
 * Disqualifications, protected outcomes and injury stoppages cannot. */
import {isSpecialStipulationFinish} from "./match-stipulations.js";
export function isDecisiveChampionshipFinish(value:string):boolean{
 return value==="CLEAN_PIN"||value==="FLASH_PIN"||value==="SUBMISSION"||value==="FOREIGN_OBJECT"||
  isSpecialStipulationFinish(value);
}
