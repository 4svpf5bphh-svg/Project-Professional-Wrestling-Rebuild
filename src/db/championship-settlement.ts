/** Atomic title consequences of *verified, canonical* completed singles.
 * Never trusts a request-side "title changed" flag. The booked result (or
 * authorised medical/interference outcome) controls the winner side.
 */
import type {SqlRows} from "./world-operations.js";
import type {CompletedShowReceipt} from "../domain/completed-show-receipt.js";
export interface BookedSinglesTitle{
 slotId:string;championshipId:string;participants:readonly [string,string];
}
export async function settleCanonicalSinglesTitleContests(
 tx:SqlRows,receipt:CompletedShowReceipt,bookings:readonly BookedSinglesTitle[],
):Promise<{contests:number;transfers:number}>{
 if(bookings.length>16||new Set(bookings.map(x=>x.championshipId)).size!==bookings.length)
  throw new Error("Cannot defend a championship twice at one show");
 const completed=new Map(receipt.matches.map(m=>[m.matchId,m]));
 let transfers=0;
 for(const booking of bookings){
  const bout=completed.get(booking.slotId);
  if(!bout||!booking.championshipId||
    booking.participants.length!==2||
    booking.participants[0]===booking.participants[1])
   throw new Error("Missing verified title bout or invalid opponents");
  if(bout.actualWinnerSide!=="A"&&bout.actualWinnerSide!=="B")
   throw new Error("Title result has no winner side");
  const title=await tx.query<{
   division:string;reign_id:string|null;person_id:string|null;
   reign_status:string|null;holder_type:string|null;reign_defenses:number|null;
  }>(`
   SELECT c.division,r.reign_id,r.person_id,
    r.status AS reign_status,r.holder_type,r.defenses AS reign_defenses
   FROM ppw_championships c
    LEFT JOIN ppw_championship_reigns r ON r.world_id=c.world_id
     AND r.promotion_id=c.promotion_id
     AND r.championship_id=c.championship_id
     AND r.reign_id=c.current_reign_id
   WHERE c.world_id=$1 AND c.promotion_id=$2
    AND c.championship_id=$3 AND c.status='ACTIVE'
   FOR UPDATE OF c`,
   [receipt.worldId,receipt.promotionId,booking.championshipId]);
  const state=title[0];
  if(title.length!==1||!state||state.division!=="SINGLES"||
   !state.reign_id||state.holder_type!=="PERSON"||
   state.reign_status!=="ACTIVE"||!state.person_id||
   !booking.participants.includes(state.person_id))
   throw new Error("Title contest lacks a valid defending singles champion");
  const winner=booking.participants[bout.actualWinnerSide==="A"?0:1]!;
  // A dirty finish, protected finish or referee's medical stoppage never
  // transfers the belt; clean, submission and flash victories can.
  const transfer=winner!==state.person_id&&
   ["CLEAN_PIN","SUBMISSION","FLASH_PIN"].includes(bout.actualFinish);
  if(transfer){
   const ended=await tx.query<{reign_id:string}>(`
     UPDATE ppw_championship_reigns SET status='ENDED',
       ended_week_index=$5 WHERE world_id=$1 AND promotion_id=$2
       AND championship_id=$3 AND reign_id=$4 AND status='ACTIVE'
     RETURNING reign_id`,
     [receipt.worldId,receipt.promotionId,booking.championshipId,
      state.reign_id,(receipt.year-1)*52+receipt.week-1]);
   if(ended.length!==1)throw new Error("Championship was already transferred");
   const nextId=receipt.showId+":"+booking.slotId+":new-reign";
   await tx.query(`
    INSERT INTO ppw_championship_reigns(
     world_id,promotion_id,championship_id,reign_id,holder_type,person_id,status,start_week_index)
    VALUES($1,$2,$3,$4,'PERSON',$5,'ACTIVE',$6)`,
    [receipt.worldId,receipt.promotionId,booking.championshipId,nextId,
     winner,(receipt.year-1)*52+receipt.week-1]);
   await tx.query(`
     UPDATE ppw_championships SET current_reign_id=$4
     WHERE world_id=$1 AND promotion_id=$2 AND championship_id=$3`,
     [receipt.worldId,receipt.promotionId,booking.championshipId,nextId]);
   transfers++;
  }else{
   // A successful defense is credited to the holder, not a losing
   // champion retaining the title through DQ or injury.
   if(winner===state.person_id){
    await tx.query(`
     UPDATE ppw_championship_reigns SET defenses=defenses+1
      WHERE world_id=$1 AND promotion_id=$2
       AND championship_id=$3 AND reign_id=$4`,
     [receipt.worldId,receipt.promotionId,booking.championshipId,state.reign_id]);
   }
  }
  await tx.query(`
   INSERT INTO ppw_championship_contests(
    world_id,promotion_id,championship_id,show_id,slot_id,
    prior_reign_id,winner_person_id,title_changed)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
   [receipt.worldId,receipt.promotionId,booking.championshipId,
    receipt.showId,booking.slotId,state.reign_id,winner,transfer]);
 }
 if(bookings.length)await tx.query(`
    INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)
    VALUES($1,$2,$3,'SINGLES_TITLE_CONTESTS_SETTLED',
     jsonb_build_object('showId',$4::text,'contests',$5::integer,'transfers',$6::integer))`,
   [receipt.worldId,receipt.year,receipt.week,receipt.showId,bookings.length,transfers]);
 return {contests:bookings.length,transfers};
}
