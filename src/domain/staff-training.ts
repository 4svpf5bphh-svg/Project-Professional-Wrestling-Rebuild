/** Immediate, deliberately modest training utility on PPW's existing
 * fatigue recovery. Coaches do not boost innate wrestler skill or override
 * recorded injuries. Wrestlers shared non-exclusively cannot stack trainers.
 */
export function trainerFatigueBonus(craft:number):number{
 if(!Number.isSafeInteger(craft)||craft<0||craft>100)
  throw new Error("Invalid staff training craft");
 return Math.min(2.5,Math.max(.5,Math.round(craft/40*10)/10));
}
