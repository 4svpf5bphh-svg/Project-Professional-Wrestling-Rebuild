/** Spectator read of verified results from another human-controlled promotion.
 * Only certified outcomes and public match information; no future booking,
 * contracts, staff notes, private backstage data or Groq commentary.
 */
import type {TransactionPool} from "./transaction.js";
import {withSqlClient} from "./postgres.js";
import {readCardParticipants} from "../domain/card-participants.js";
import {readCanonicalMatchLayout} from "../domain/match-sides.js";
import {validateCompletedShowReceipt,type CompletedShowReceipt}
 from "../domain/completed-show-receipt.js";
export interface PublicShowEntry{
 slotId:string;position:number;type:"MATCH"|"SEGMENT";headline:string;
 outcome:string;winner:string|null;ratingStars:number|null;crowdResponse:number;
}
export interface PublicCompletedShow{
 showId:string;promotionName:string;showName:string;year:number;week:number;
 crowdResponse:number;entries:PublicShowEntry[];
}
export async function readPublicCompletedShow(pool:TransactionPool,input:{
 worldId:string;playerId:string;viewerPromotionId:string;
 targetPromotionId:string;showId:string
}):Promise<PublicCompletedShow>{
 if(!Object.values(input).every(s=>typeof s==="string"&&s.trim()&&s.length<=200)||
  input.viewerPromotionId===input.targetPromotionId)
  throw new Error("A rival's completed show must be selected");
 return withSqlClient(pool,async tx=>{
  const shows=await tx.query<{receipt_json:unknown;show_name:string|null;
   promotion_name:string;year:number;week:number;crowd_response:number|string}>([
   "SELECT c.receipt_json,d.show_name,p.name AS promotion_name,",
   "c.year,c.week,c.crowd_response FROM ppw_completed_shows c",
   "JOIN ppw_booking_drafts d ON d.world_id=c.world_id AND d.draft_id=c.show_id",
   "JOIN ppw_promotions p ON p.world_id=c.world_id AND p.promotion_id=c.promotion_id",
   "JOIN ppw_promotion_controls rival ON rival.world_id=c.world_id",
   "AND rival.promotion_id=c.promotion_id AND rival.active",
   "JOIN ppw_promotion_controls viewer ON viewer.world_id=c.world_id",
   "AND viewer.player_id=$2 AND viewer.promotion_id=$3 AND viewer.active",
   "JOIN ppw_memberships member ON member.world_id=c.world_id",
   "AND member.player_id=$2 AND member.status='ACTIVE'",
   "WHERE c.world_id=$1 AND c.promotion_id=$4 AND c.show_id=$5",
   "AND rival.player_id<>viewer.player_id LIMIT 1"
  ].join(" "),[input.worldId,input.playerId,input.viewerPromotionId,
   input.targetPromotionId,input.showId]);
  if(shows.length!==1)throw new Error("Rival completed results unavailable");
  const show=shows[0]!;
  const result=validateCompletedShowReceipt(show.receipt_json as CompletedShowReceipt);
  if(result.worldId!==input.worldId||result.promotionId!==input.targetPromotionId||
   result.showId!==input.showId||result.year!==show.year||result.week!==show.week)
   throw new Error("Completed World receipt does not match the selected show");
  const slots=await tx.query<{slot_id:string;kind:string;position:number;
   payload:unknown;rating_stars:number|string|null;story_json:unknown|null}>([
   "SELECT slot.slot_id,slot.kind,slot.position,slot.payload,",
   "facts.rating_stars,angle.story_json FROM ppw_card_slots slot",
   "LEFT JOIN ppw_completed_match_report_facts facts ON",
   "facts.world_id=slot.world_id AND facts.show_id=slot.draft_id",
   "AND facts.match_id=slot.slot_id",
   "LEFT JOIN ppw_completed_show_segments angle ON",
   "angle.world_id=slot.world_id AND angle.show_id=slot.draft_id",
   "AND angle.slot_id=slot.slot_id",
   "WHERE slot.world_id=$1 AND slot.draft_id=$2",
   "ORDER BY slot.position LIMIT 101"
  ].join(" "),[input.worldId,input.showId]);
  if(slots.length>100||slots.length!==result.matches.length+result.segments.length)
   throw new Error("Completed World card and result count differ");
  const ids=[...new Set(slots.flatMap(x=>readCardParticipants(x.payload)
   .map(p=>p.personId)))];
  if(ids.length>200)throw new Error("Spectator result talent limit exceeded");
  const people=ids.length?await tx.query<{person_id:string;name:string}>(
   "SELECT person_id,name FROM ppw_people WHERE world_id=$1"+
   " AND person_id=ANY($2::text[])",[input.worldId,ids]):[];
  const names=new Map(people.map(p=>[p.person_id,p.name]));
  const name=(id:string)=>names.get(id)??"Unknown wrestler";
  const bySlot=new Map(slots.map(s=>[s.slot_id,s]));
  const entries:PublicShowEntry[]=[];
  for(const match of result.matches){
   const slot=bySlot.get(match.matchId);
   if(!slot||slot.kind!=="MATCH"||slot.position!==match.position)
    throw new Error("Completed match was altered");
   const layout=readCanonicalMatchLayout(slot.payload);
   const sides=layout.sides.map(side=>side.participants.map(p=>name(p.personId)));
   const winningSide=layout.sides.find(side=>side.sideId===match.actualWinnerSide);
   const winner=winningSide?.participants.map(p=>name(p.personId)).join(" & ")||null;
   const rating=slot.rating_stars===null?null:Number(slot.rating_stars);
   if(rating!==null&&(!Number.isFinite(rating)||rating<0||rating>5))
    throw new Error("Invalid public match rating");
   entries.push({slotId:match.matchId,position:match.position,type:"MATCH",
    headline:sides.map(side=>side.join(" & ")).join(" vs "),outcome:match.actualFinish,
    winner,ratingStars:rating,crowdResponse:match.crowdResponse});
  }
  for(const angle of result.segments){
   const slot=bySlot.get(angle.slotId);
   if(!slot||slot.kind!=="SEGMENT"||slot.position!==angle.position)
    throw new Error("Completed segment was altered");
   const story=slot.story_json&&typeof slot.story_json==="object"&&!Array.isArray(slot.story_json)?
    slot.story_json as {headline?:unknown}:null;
   entries.push({slotId:angle.slotId,position:angle.position,type:"SEGMENT",
    headline:typeof story?.headline==="string"?story.headline:
     angle.kind.replaceAll("_"," ").toLowerCase(),
    outcome:angle.outcome,winner:null,ratingStars:null,crowdResponse:angle.crowdResponse});
  }
  entries.sort((a,b)=>a.position-b.position);
  return {showId:input.showId,promotionName:show.promotion_name,
   showName:show.show_name??"Completed show",year:show.year,week:show.week,
   crowdResponse:Number(show.crowd_response),entries};
 });
}
