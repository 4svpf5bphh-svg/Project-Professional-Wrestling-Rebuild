/** Book tournament matches on the ordinary card. The World Lock validates
 * certified results and advances this same bracket inside show resolution.
 * No alternate results, AI runs, scheduled jobs or separate World state.
 */
import type {SqlRows} from "./world-operations.js";
import type {CompletedShowReceipt} from "../domain/completed-show-receipt.js";
import type {BookableMatch} from "../domain/bookable-match.js";
import {readCanonicalMatchLayout} from "../domain/match-sides.js";
import {verifiedTournamentWinner} from "../domain/tournament-bracket.js";

type Scope={worldId:string;promotionId:string;showId:string};
type Match={slotId:string;payload:BookableMatch};
export async function readBookableTournamentBouts(tx:SqlRows,
 scope:Scope,weekIndex:number){
 const rows=await tx.query<{
  tournament_id:string;name:string;bout_no:number;
  person_a:string;person_b:string;name_a:string;name_b:string;
  contract_a:string;contract_b:string;championship_id:string|null;
 }>(`
  SELECT t.tournament_id,t.name,b.bout_no,b.person_a,b.person_b,
   a.name AS name_a,z.name AS name_b,ca.contract_id AS contract_a,
   cb.contract_id AS contract_b,t.championship_id
  FROM ppw_tournament_bouts b JOIN ppw_tournaments t
   ON t.world_id=b.world_id AND t.promotion_id=b.promotion_id
   AND t.tournament_id=b.tournament_id AND t.status='ACTIVE'
  JOIN ppw_people a ON a.world_id=b.world_id AND a.person_id=b.person_a
   AND a.status='ACTIVE'
  JOIN ppw_people z ON z.world_id=b.world_id AND z.person_id=b.person_b
   AND z.status='ACTIVE'
  JOIN LATERAL(SELECT c.contract_id FROM ppw_contracts c
   WHERE c.world_id=b.world_id AND c.promotion_id=b.promotion_id
    AND c.person_id=b.person_a AND c.status='SIGNED'
    AND c.start_week_index<=$4 AND c.expires_week_index>=$4
    AND (c.family='EXCLUSIVE' OR c.remaining_dates>0)
   ORDER BY CASE WHEN c.family='EXCLUSIVE' THEN 0 ELSE 1 END,
    c.contract_id LIMIT 1) ca ON TRUE
  JOIN LATERAL(SELECT c.contract_id FROM ppw_contracts c
   WHERE c.world_id=b.world_id AND c.promotion_id=b.promotion_id
    AND c.person_id=b.person_b AND c.status='SIGNED'
    AND c.start_week_index<=$4 AND c.expires_week_index>=$4
    AND (c.family='EXCLUSIVE' OR c.remaining_dates>0)
   ORDER BY CASE WHEN c.family='EXCLUSIVE' THEN 0 ELSE 1 END,
    c.contract_id LIMIT 1) cb ON TRUE
  WHERE b.world_id=$1 AND b.promotion_id=$2
   AND b.winner_person_id IS NULL
   AND NOT EXISTS(SELECT 1 FROM ppw_contracts other
    WHERE other.world_id=b.world_id AND other.status='SIGNED'
     AND other.family='EXCLUSIVE' AND other.promotion_id<>b.promotion_id
     AND other.person_id IN(b.person_a,b.person_b)
     AND other.expires_week_index>=$4)
   AND (b.show_id IS NULL OR b.show_id=$3)
   AND NOT EXISTS(SELECT 1 FROM ppw_medical_absences med
    WHERE med.world_id=b.world_id AND med.person_id IN(b.person_a,b.person_b)
     AND med.status='ACTIVE' AND med.injured_week_index<$4
     AND med.cleared_week_index>$4)
  ORDER BY t.created_week_index,b.bout_no LIMIT 5`,
  [scope.worldId,scope.promotionId,scope.showId,weekIndex]);
 if(rows.length>3)throw new Error("Tournament fixtures exceed safe booker limit");
 return rows.map(x=>({tournamentId:x.tournament_id,tournamentName:x.name,
  boutNo:x.bout_no,championshipId:x.bout_no===3?x.championship_id:null,
  personA:{personId:x.person_a,name:x.name_a,contractId:x.contract_a},
  personB:{personId:x.person_b,name:x.name_b,contractId:x.contract_b}}));
}
export async function reserveBookedTournamentBouts(tx:SqlRows,scope:Scope,
 matches:readonly Match[]){
 const tagged=matches.filter(m=>m.payload.tournamentId!==undefined);
 const tournamentIds=[...new Set(tagged.map(m=>m.payload.tournamentId!))];
 // Existing reservations must be explicitly cleared if their slot is deleted
 // or changed by a full-card save. This query also serializes bout claims.
 const rows=await tx.query<{
  tournament_id:string;bout_no:number;person_a:string|null;person_b:string|null;
  show_id:string|null;slot_id:string|null;winner_person_id:string|null;
  status:string;championship_id:string|null;
 }>(`
  SELECT b.tournament_id,b.bout_no,b.person_a,b.person_b,
   b.show_id,b.slot_id,b.winner_person_id,t.status,t.championship_id
  FROM ppw_tournament_bouts b JOIN ppw_tournaments t
   ON t.world_id=b.world_id AND t.promotion_id=b.promotion_id
    AND t.tournament_id=b.tournament_id
  WHERE b.world_id=$1 AND b.promotion_id=$2
   AND (b.show_id=$3 OR b.tournament_id=ANY($4::text[]))
  ORDER BY b.tournament_id,b.bout_no LIMIT 21 FOR UPDATE OF b`,
  [scope.worldId,scope.promotionId,scope.showId,tournamentIds]);
 if(rows.length>20)throw new Error("Tournament save exceeds safe fixture limit");
 const seen=new Set<string>();
 for(const match of tagged){
  const p=match.payload, key=p.tournamentId+":"+p.tournamentBoutNo;
  if(seen.has(key))throw new Error("A tournament bout may appear only once on a card");
  seen.add(key);
  const found=rows.find(b=>b.tournament_id===p.tournamentId&&b.bout_no===p.tournamentBoutNo);
  const layout=readCanonicalMatchLayout(p);
  if(!found||found.status!=="ACTIVE"||found.winner_person_id!==null||
   !found.person_a||!found.person_b||
   found.show_id!==null&&found.show_id!==scope.showId||
   layout.family!=="INDIVIDUAL"||layout.sides.length!==2||
   layout.sides.some(s=>s.participants.length!==1)||
   ![found.person_a,found.person_b].every(id=>
    layout.participants.some(person=>person.personId===id))||
   (p.tournamentBoutNo===3?p.championshipId!==found.championship_id:
    p.championshipId!==undefined))
   throw new Error("Tournament booking must use its actual available pair and championship prize");
 }
 if(!rows.some(b=>b.show_id===scope.showId)&&!tagged.length)return;
 await tx.query(`
  UPDATE ppw_tournament_bouts SET show_id=NULL,slot_id=NULL
  WHERE world_id=$1 AND promotion_id=$2 AND show_id=$3
   AND winner_person_id IS NULL`,
  [scope.worldId,scope.promotionId,scope.showId]);
 if(tagged.length){
  const reserved=await tx.query<{bout_no:number}>(`
   UPDATE ppw_tournament_bouts b SET show_id=$3,slot_id=x.slot_id
   FROM jsonb_to_recordset($4::jsonb) x(tournament_id text,bout_no smallint,slot_id text)
   WHERE b.world_id=$1 AND b.promotion_id=$2
    AND b.tournament_id=x.tournament_id AND b.bout_no=x.bout_no
    AND b.show_id IS NULL AND b.winner_person_id IS NULL
   RETURNING b.bout_no`,
   [scope.worldId,scope.promotionId,scope.showId,
    JSON.stringify(tagged.map(m=>({tournament_id:m.payload.tournamentId,
     bout_no:m.payload.tournamentBoutNo,slot_id:m.slotId})))]);
  if(reserved.length!==tagged.length)
   throw new Error("Tournament fixture already reserved for another show");
 }
}
/** This function executes in the same canonical show transaction *after* title
 * changes and immutable match evidence. All bout results are receipt-derived.
 */
export async function settleCertifiedTournamentBouts(tx:SqlRows,
 receipt:CompletedShowReceipt){
 const rows=await tx.query<{
  tournament_id:string;bout_no:number;person_a:string;person_b:string;
  slot_id:string;payload:unknown;championship_id:string|null;
 }>(`
  SELECT b.tournament_id,b.bout_no,b.person_a,b.person_b,
   b.slot_id,s.payload,t.championship_id
  FROM ppw_tournament_bouts b JOIN ppw_tournaments t
   ON t.world_id=b.world_id AND t.promotion_id=b.promotion_id
    AND t.tournament_id=b.tournament_id AND t.status='ACTIVE'
  JOIN ppw_card_slots s ON s.world_id=b.world_id
   AND s.draft_id=b.show_id AND s.slot_id=b.slot_id AND s.kind='MATCH'
  WHERE b.world_id=$1 AND b.promotion_id=$2 AND b.show_id=$3
    AND b.winner_person_id IS NULL
  ORDER BY b.bout_no LIMIT 4`,
  [receipt.worldId,receipt.promotionId,receipt.showId]);
 if(rows.length>3)throw new Error("Too many certified tournament matches");
 const week=(receipt.year-1)*52+receipt.week-1;
 for(const bout of rows){
  const result=receipt.matches.find(m=>m.matchId===bout.slot_id);
  if(!result)throw new Error("Tournament fixture missing certified match result");
  const layout=readCanonicalMatchLayout(bout.payload);
  const sides=layout.sides.map(s=>({sideId:s.sideId,
   personIds:s.participants.map(p=>p.personId)}));
  const outcome=verifiedTournamentWinner(
   bout.person_a,bout.person_b,sides,result.actualWinnerSide);
  const updated=await tx.query<{bout_no:number}>(`
   UPDATE ppw_tournament_bouts SET winner_person_id=$5,resolved_week_index=$6
   WHERE world_id=$1 AND promotion_id=$2 AND tournament_id=$3
    AND bout_no=$4 AND winner_person_id IS NULL
   RETURNING bout_no`,[
   receipt.worldId,receipt.promotionId,bout.tournament_id,bout.bout_no,
   outcome.winner,week]);
  if(updated.length!==1)throw new Error("Tournament match already certified");
  if(bout.bout_no===3){
   const finished=await tx.query<{tournament_id:string}>(`
    UPDATE ppw_tournaments SET status='COMPLETE',winner_person_id=$4
    WHERE world_id=$1 AND promotion_id=$2 AND tournament_id=$3
     AND status='ACTIVE' AND winner_person_id IS NULL
    RETURNING tournament_id`,[
     receipt.worldId,receipt.promotionId,bout.tournament_id,outcome.winner]);
   if(finished.length!==1)throw new Error("Tournament winner not recorded");
  }
 }
 // On first/second semifinal certification, make the final available only
 // when BOTH certified winners exist. Never decide the next winner here.
 if(rows.some(x=>x.bout_no<3)){
  await tx.query(`
   UPDATE ppw_tournament_bouts final SET
    person_a=a.winner_person_id,person_b=b.winner_person_id
   FROM ppw_tournament_bouts a,ppw_tournament_bouts b
   WHERE final.world_id=$1 AND final.promotion_id=$2
    AND final.bout_no=3 AND final.person_a IS NULL
    AND a.world_id=final.world_id AND a.promotion_id=final.promotion_id
    AND a.tournament_id=final.tournament_id AND a.bout_no=1
    AND a.winner_person_id IS NOT NULL
    AND b.world_id=final.world_id AND b.promotion_id=final.promotion_id
    AND b.tournament_id=final.tournament_id AND b.bout_no=2
    AND b.winner_person_id IS NOT NULL`,
   [receipt.worldId,receipt.promotionId]);
 }
 return {settled:rows.length};
}
