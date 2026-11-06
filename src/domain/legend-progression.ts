/** World-wide certified achievements, tuned for the total volume produced by
 * every promotion in ONE World. No multiple Worlds, paid unlocks, timers or new
 * queries. All existing ppw_world_legend_unlocks remain authoritative.
 */
import type {LegendDefinition,LegendMetric,LegendTier} from "./legends-catalogue.js";

/** Minimum lifetime counts that stop common World receipts filling the queue
 * during the opening 20 weeks. WEEKLY_CLASSICS=123 and CLASSICS=102 were
 * already reached in the original player World by Week 21.
 * Rare, single-reign milestones retain their original calendar length.
 */
export const LEGEND_WORLD_METRIC_FLOORS:Readonly<Record<LegendMetric,number>>=Object.freeze({
 CLASSICS:135,WEEKLY_CLASSICS:155,SUBMISSIONS:90,
 HOT_ANGLES:55,DIRTY_FINISHES:65,MASTERPIECES:45,
 WOMENS_CLASSICS:65,TAG_CLASSICS:50,TITLE_CHANGES:45,
 LONGEST_REIGN:0,PREMIUM_MAIN_EVENTS:25,HARDCORE_CLASSICS:35,
 HARDCORE_MATCHES:60,BIG_REACTIONS:75,TAG_MASTERPIECES:25,
 WOMENS_MASTERPIECES:25,PREMIUM_CLASSICS:45,
 MAIN_EVENT_CLASSICS:50,FIVE_STARS:15,STIPULATED_CLASSICS:40
});
const tierFloor:Readonly<Record<LegendTier,number>>={
 CULT:1,LEGEND:1.8,ICON:3,IMMORTAL:5
};
const tierScale:Readonly<Record<LegendTier,number>>={
 CULT:3,LEGEND:4,ICON:5,IMMORTAL:6
};
export function pacedWorldLegendTarget(
 metric:LegendMetric,target:number,tier:LegendTier,
):number{
 if(!Number.isSafeInteger(target)||target<1)throw new Error("Invalid legend milestone");
 if(metric==="LONGEST_REIGN")return target;
 return Math.max(target,Math.ceil(target*tierScale[tier]),
  Math.ceil(LEGEND_WORLD_METRIC_FLOORS[metric]*tierFloor[tier]));
}
/** Public clue and numeric progress always match the server settlement target,
 * even for the 81 previously authored expansion cards.
 */
export function worldLegendAchievement(metric:LegendMetric,target:number):string{
 switch(metric){
  case "CLASSICS":return target+" certified matches rated at least 4¼ stars";
  case "WEEKLY_CLASSICS":return target+" regular-show matches rated at least four stars";
  case "SUBMISSIONS":return target+" certified matches ending by submission";
  case "HOT_ANGLES":return target+" completed angles with at least 88 crowd response";
  case "DIRTY_FINISHES":return target+" certified cheating finishes";
  case "MASTERPIECES":return target+" certified matches rated at least 4¾ stars";
  case "WOMENS_CLASSICS":return target+" women's matches rated at least four stars";
  case "TAG_CLASSICS":return target+" certified tag matches rated at least 4¼ stars";
  case "TITLE_CHANGES":return target+" certified championship changes";
  case "LONGEST_REIGN":return "A single uninterrupted championship reign of "+target+" World weeks";
  case "PREMIUM_MAIN_EVENTS":return target+" premium-event main events rated at least 4¼ stars";
  case "HARDCORE_CLASSICS":return target+" hardcore or dangerous-stipulation matches rated at least four stars";
  case "HARDCORE_MATCHES":return target+" certified hardcore or dangerous-stipulation matches";
  case "BIG_REACTIONS":return target+" certified matches drawing at least 90 crowd response";
  case "TAG_MASTERPIECES":return target+" certified tag matches rated at least 4¾ stars";
  case "WOMENS_MASTERPIECES":return target+" women's matches rated at least 4¾ stars";
  case "PREMIUM_CLASSICS":return target+" premium-show matches rated at least 4¼ stars";
  case "MAIN_EVENT_CLASSICS":return target+" show-closing main events rated at least 4½ stars";
  case "FIVE_STARS":return target+" certified five-star matches";
  case "STIPULATED_CLASSICS":return target+" special-stipulation matches rated at least 4¼ stars";
 }
}
export function paceLegendForOneWorld(def:LegendDefinition):LegendDefinition{
 if(def.metric===null||def.target===null)return def;
 const target=pacedWorldLegendTarget(def.metric,def.target,def.tier);
 return {...def,target,achievement:worldLegendAchievement(def.metric,target)};
}

/** Apply the original World milestone design in catalogue order, then
 * separate any newly collided metric+target pairs. The original 48 (and
 * previously released World unlocks) remain ahead of the new collection.
 * No achievement requires resetting, joining or creating another World.
 */
export function paceWorldLegendCatalogue(
 definitions:readonly LegendDefinition[],
):LegendDefinition[]{
 const used=new Set<string>();
 return definitions.map(def=>{
  const paced=paceLegendForOneWorld(def);
  if(paced.metric===null||paced.target===null)return paced;
  let target=paced.target;
  // Metric-specific spacing prevents duplicate release thresholds when a
  // common floor raises two different authored milestones to one number.
  const increment=paced.metric==="LONGEST_REIGN"?1:
   Math.max(1,Math.ceil(LEGEND_WORLD_METRIC_FLOORS[paced.metric]*.08));
  while(used.has(paced.metric+":"+target))target+=increment;
  used.add(paced.metric+":"+target);
  return target===paced.target?paced:
   {...paced,target,achievement:worldLegendAchievement(paced.metric,target)};
 });
}
