/** Release assembly for 81 source-backed collectible Legends.
 * Original 48 definitions are never replaced. The caller must pass an
 * explicit approval switch; default World data passes false until the 174
 * owner artwork WebPs have been committed and signed off.
 */
import {PLANNED_LEGEND_DEFINITIONS} from "./planned-legend-definitions.js";
import {PLANNED_LEGEND_ARTWORK} from "./planned-legend-artwork.js";
import type {LegendDefinition} from "./legends-catalogue.js";

export function reviewedLegendExpansion():readonly LegendDefinition[]{
 const art=new Map(PLANNED_LEGEND_ARTWORK.map(x=>[x.id,x]));
 if(art.size!==81||PLANNED_LEGEND_DEFINITIONS.length!==81)
  throw new Error("Incomplete reviewed Legends expansion");
 return Object.freeze(PLANNED_LEGEND_DEFINITIONS.map(def=>{
  const image=art.get(def.id);
  if(!image||image.name!==def.name||image.tier!==def.tier||
    image.members.length!==def.roster.length||
    image.members.some((m,i)=>m.name!==def.roster[i]?.name||
      m.personId!=="legend:"+def.id+":"+i)||
    image.revealAsset!==image.albumAsset||image.cardAsset!==image.revealAsset||
    image.cardLayoutVersion!=="LEGACY_48_FRAME_SEPARATE_RARITY_BADGE_V1")
   throw new Error("Unreviewed or mismapped Legend artwork: "+def.name);
  return Object.freeze({...def,status:"ACTIVE" as const,cardAsset:image.cardAsset});
 }));
}
/** Exactly the new 93 portrait URLs, supplied to the existing stable-ID
 * lookup only after the artwork release gate is open.
 */
export function reviewedLegendPortraits():Readonly<Record<string,string>>{
 const result:Record<string,string>={};
 for(const card of PLANNED_LEGEND_ARTWORK){
  for(const person of card.members){
   if(result[person.personId])throw new Error("Duplicate Legend portrait");
   result[person.personId]=person.portraitAsset;
  }
 }
 if(Object.keys(result).length!==93)throw new Error("Incomplete reviewed Legend portraits");
 return Object.freeze(result);
}
