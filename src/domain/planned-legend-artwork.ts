/** Phase 14 artwork registry — DRAFT ONLY; not imported by LIVE_LEGENDS.
 * Source photos and their reviewed derivative WebPs are required before
 * artwork is eligible for the player-facing reveal, album or market.
 *
 * A single team card is shared by reveal and collection. Each member gets
 * a distinct portrait under their stable World person ID.
 */
import {APPROVED_LEGEND_EXPANSION} from "./approved-legend-expansion.js";
import type {LegendTier} from "./legends-catalogue.js";

export interface PlannedLegendMemberArt {
 readonly name:string;
 readonly personId:string;
 readonly portraitAsset:string;
}
export interface PlannedLegendArtwork {
 readonly id:string;
 readonly name:string;
 readonly tier:LegendTier;
 readonly team:boolean;
 readonly cardAsset:string;
 readonly revealAsset:string;
 readonly albumAsset:string;
 /** Previous 48-card geometry and below-photo rarity badge design. */
 readonly cardLayoutVersion:"LEGACY_48_FRAME_SEPARATE_RARITY_BADGE_V1";
 readonly members:readonly PlannedLegendMemberArt[];
 /** Draft materials must not silently become available in World markets. */
 readonly activation:"BLOCKED_PENDING_PHOTO_AND_ARTWORK_REVIEW";
}
const slug=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
export const PLANNED_LEGEND_ARTWORK:readonly PlannedLegendArtwork[]=
 Object.freeze(APPROVED_LEGEND_EXPANSION.map(approved=>{
  const id=slug(approved.name);
  const path="/assets/legends/"+id+"-"+approved.tier.toLowerCase()+"-card.webp";
  const members=(approved.members??[approved.name]).map((name,i)=>Object.freeze({
   name,personId:"legend:"+id+":"+i,
   portraitAsset:"/assets/legends/"+slug(name)+"-portrait.webp"
  }));
  return Object.freeze({
   id,name:approved.name,tier:approved.tier,team:Boolean(approved.members),
   cardAsset:path,revealAsset:path,albumAsset:path,
   cardLayoutVersion:"LEGACY_48_FRAME_SEPARATE_RARITY_BADGE_V1" as const,
   members:Object.freeze(members),
   activation:"BLOCKED_PENDING_PHOTO_AND_ARTWORK_REVIEW" as const
  });
 }));
export const findPlannedLegendArtwork=(id:string):PlannedLegendArtwork|undefined=>
 PLANNED_LEGEND_ARTWORK.find(x=>x.id===id);
