/** Private manager tournament hub. First-class signed entrants, genuine
 * vacancies, and a three-match bracket; no background ticks or new World.
 */
import {randomUUID} from "node:crypto";
import type {TransactionPool} from "./transaction.js";
import {withSqlClient} from "./postgres.js";
import {applyWorldCommand} from "./world-commands.js";
import {tournamentInitialBouts} from "../domain/tournament-bracket.js";

type Scope={worldId:string;promotionId:string;playerId:string};
export type CreateTournamentInput=Scope&{
 requestId:string;expectedRevision:number;name:string;
 division:"MEN"|"WOMEN";entrants:readonly string[];
 championshipId?:string|null;
};
const valid=(x:unknown):x is string=>typeof x==="string"&&
 x.trim().length>0&&x.length<=200;
export async function readTournamentWorkspace(pool:TransactionPool,scope:Scope){
 if(![scope.worldId,scope.promotionId,scope.playerId].every(valid))
  throw new Error("Invalid tournament manager");
 return withSqlClient(pool,async tx=>{
  const owners=await tx.query<{year:number;week:number;revision:string;
   can_edit:boolean}>(`
   SELECT w.year,w.week,w.revision::text,
    (w.phase='OPEN' AND w.next_lock_at>clock_timestamp()) AS can_edit
   FROM ppw_worlds w JOIN ppw_promotion_controls ctrl
    ON ctrl.world_id=w.world_id AND ctrl.promotion_id=$2
    AND ctrl.player_id=$3 AND ctrl.active
   JOIN ppw_memberships member ON member.world_id=w.world_id
    AND member.player_id=ctrl.player_id AND member.status='ACTIVE'
   JOIN ppw_promotions promo ON promo.world_id=w.world_id
    AND promo.promotion_id=ctrl.promotion_id AND promo.lifecycle='ACTIVE'
   WHERE w.world_id=$1`,[scope.worldId,scope.promotionId,scope.playerId]);
  if(owners.length!==1)throw new Error("Tournament workspace access denied");
  const owner=owners[0]!,index=(owner.year-1)*52+owner.week-1;
  const tournaments=await tx.query<{
   tournament_id:string;name:string;division:"MEN"|"WOMEN";
   status:"ACTIVE"|"COMPLETE"|"CANCELLED";entrants_count:4|8;championship_id:string|null;
   championship_name:string|null;winner_person_id:string|null;
   winner_name:string|null;
  }>(`
   SELECT t.tournament_id,t.name,t.division,t.status,t.entrants_count,
    t.championship_id,c.name AS championship_name,
    t.winner_person_id,p.name AS winner_name
   FROM ppw_tournaments t
   LEFT JOIN ppw_championships c ON c.world_id=t.world_id
    AND c.promotion_id=t.promotion_id AND c.championship_id=t.championship_id
   LEFT JOIN ppw_people p ON p.world_id=t.world_id
    AND p.person_id=t.winner_person_id
   WHERE t.world_id=$1 AND t.promotion_id=$2
   ORDER BY CASE WHEN t.status='ACTIVE' THEN 0 ELSE 1 END,
    t.created_week_index DESC,t.tournament_id LIMIT 21`,
   [scope.worldId,scope.promotionId]);
  if(tournaments.length>20)throw new Error("Tournament history exceeds page limit");
  const ids=tournaments.map(t=>t.tournament_id);
  const bouts=ids.length?await tx.query<{
   tournament_id:string;bout_no:number;person_a:string|null;
   person_b:string|null;name_a:string|null;name_b:string|null;
   winner_person_id:string|null;winner_name:string|null;
   show_id:string|null;slot_id:string|null;resolved_week_index:number|null;
  }>(`
   SELECT b.tournament_id,b.bout_no,b.person_a,b.person_b,
    a.name AS name_a,z.name AS name_b,b.winner_person_id,w.name AS winner_name,
    b.show_id,b.slot_id,b.resolved_week_index
   FROM ppw_tournament_bouts b
   LEFT JOIN ppw_people a ON a.world_id=b.world_id AND a.person_id=b.person_a
   LEFT JOIN ppw_people z ON z.world_id=b.world_id AND z.person_id=b.person_b
   LEFT JOIN ppw_people w ON w.world_id=b.world_id
    AND w.person_id=b.winner_person_id
   WHERE b.world_id=$1 AND b.promotion_id=$2
    AND b.tournament_id=ANY($3::text[])
   ORDER BY b.tournament_id,b.bout_no LIMIT 141`,
   [scope.worldId,scope.promotionId,ids]):[];
  if(bouts.length>140)throw new Error("Tournament bracket exceeds safe limit");
  const roster=await tx.query<{person_id:string;name:string;division:string}>(`
   SELECT DISTINCT ON (p.person_id) p.person_id,p.name,
    p.booking_division AS division
   FROM ppw_people p JOIN ppw_contracts c
    ON c.world_id=p.world_id AND c.person_id=p.person_id
    AND c.promotion_id=$2 AND c.status='SIGNED'
    AND c.start_week_index<=$3 AND c.expires_week_index>=$3
    AND (c.family='EXCLUSIVE' OR c.remaining_dates>0)
   WHERE p.world_id=$1 AND p.status='ACTIVE'
    AND p.booking_division IN ('MEN','WOMEN')
    AND NOT EXISTS(SELECT 1 FROM ppw_contracts rival
     WHERE rival.world_id=p.world_id AND rival.person_id=p.person_id
      AND rival.promotion_id<>$2 AND rival.family='EXCLUSIVE'
      AND rival.status='SIGNED' AND rival.expires_week_index>=$3)
   ORDER BY p.person_id,p.name LIMIT 201`,
   [scope.worldId,scope.promotionId,index]);
  if(roster.length>200)throw new Error("Tournament roster exceeds safe selector limit");
  const titles=await tx.query<{championship_id:string;name:string}>(`
   SELECT championship_id,name FROM ppw_championships
   WHERE world_id=$1 AND promotion_id=$2 AND division='SINGLES'
    AND status='ACTIVE' AND current_reign_id IS NULL
   ORDER BY name LIMIT 21`,[scope.worldId,scope.promotionId]);
  if(titles.length>20)throw new Error("Too many vacant singles titles");
  return {year:owner.year,week:owner.week,
   worldRevision:Number(owner.revision),canEdit:owner.can_edit,
   roster:roster.map(p=>({personId:p.person_id,name:p.name,
    division:p.division as "MEN"|"WOMEN"})),
   vacantTitles:titles.map(t=>({championshipId:t.championship_id,name:t.name})),
   tournaments:tournaments.map(t=>({
    tournamentId:t.tournament_id,name:t.name,status:t.status,division:t.division,
    entrantsCount:t.entrants_count,
    championshipId:t.championship_id,championshipName:t.championship_name,
    winnerPersonId:t.winner_person_id,winnerName:t.winner_name,
    bouts:bouts.filter(b=>b.tournament_id===t.tournament_id).map(b=>({
     boutNo:b.bout_no,personA:b.person_a,personB:b.person_b,
     nameA:b.name_a,nameB:b.name_b,winnerPersonId:b.winner_person_id,
     winnerName:b.winner_name,showId:b.show_id,slotId:b.slot_id,
     resolvedWeekIndex:b.resolved_week_index
    }))
   }))};
 });
}
export async function createTournament(pool:TransactionPool,input:CreateTournamentInput){
 if(![input.worldId,input.playerId,input.promotionId].every(valid)||
  typeof input.name!=="string"||input.name.trim().length<3||
  input.name.trim().length>64||
  !["MEN","WOMEN"].includes(input.division)||
  input.championshipId!=null&&!valid(input.championshipId))
  throw new Error("Invalid tournament details");
 const initialBouts=tournamentInitialBouts(input.entrants);
 return applyWorldCommand(pool,{
  worldId:input.worldId,playerId:input.playerId,requestId:input.requestId,
  expectedRevision:input.expectedRevision,requiresOpenWeek:true,
  commandType:"CREATE_PROMOTION_TOURNAMENT",
  execute:async tx=>{
   const owner=await tx.query<{year:number;week:number}>(`
    SELECT w.year,w.week FROM ppw_worlds w
    JOIN ppw_promotion_controls c ON c.world_id=w.world_id
     AND c.promotion_id=$2 AND c.player_id=$3 AND c.active
    JOIN ppw_memberships m ON m.world_id=c.world_id
     AND m.player_id=c.player_id AND m.status='ACTIVE'
    JOIN ppw_promotions p ON p.world_id=c.world_id
     AND p.promotion_id=c.promotion_id AND p.lifecycle='ACTIVE'
    WHERE w.world_id=$1 AND w.phase='OPEN'
     AND w.next_lock_at>clock_timestamp()`,
    [input.worldId,input.promotionId,input.playerId]);
   if(owner.length!==1)throw new Error("Tournament creation requires an active manager");
   const active=await tx.query<{tournament_id:string}>(`
    SELECT tournament_id FROM ppw_tournaments
    WHERE world_id=$1 AND promotion_id=$2 AND status='ACTIVE' LIMIT 1`,
    [input.worldId,input.promotionId]);
   if(active.length)throw new Error("Complete the active tournament before starting another");
   const idx=(owner[0]!.year-1)*52+owner[0]!.week-1;
   const entries=await tx.query<{person_id:string;division:string}>(`
    SELECT p.person_id,p.booking_division AS division FROM ppw_people p
    WHERE p.world_id=$1 AND p.person_id=ANY($3::text[])
     AND p.status='ACTIVE' AND p.booking_division=$4
     AND EXISTS(SELECT 1 FROM ppw_contracts c
      WHERE c.world_id=p.world_id AND c.person_id=p.person_id
       AND c.promotion_id=$2 AND c.status='SIGNED'
       AND c.start_week_index<=$5 AND c.expires_week_index>=$5
       AND (c.family='EXCLUSIVE' OR c.remaining_dates>0))
     AND NOT EXISTS(SELECT 1 FROM ppw_contracts rival
      WHERE rival.world_id=p.world_id AND rival.person_id=p.person_id
       AND rival.promotion_id<>$2 AND rival.family='EXCLUSIVE'
       AND rival.status='SIGNED' AND rival.expires_week_index>=$5)`,
    [input.worldId,input.promotionId,input.entrants,input.division,idx]);
   if(entries.length!==input.entrants.length)throw new Error("All entrants need signed active rights in the same division");
   if(input.championshipId){
    const available=await tx.query<{championship_id:string}>(`
     SELECT championship_id FROM ppw_championships
     WHERE world_id=$1 AND promotion_id=$2 AND championship_id=$3
      AND division='SINGLES' AND status='ACTIVE' AND current_reign_id IS NULL`,
     [input.worldId,input.promotionId,input.championshipId]);
    if(available.length!==1)throw new Error("Only a vacant owned singles belt may be the prize");
   }
   const tournamentId=randomUUID();
   await tx.query(`INSERT INTO ppw_tournaments(
    world_id,promotion_id,tournament_id,name,division,status,
    championship_id,created_week_index,entrants_count)
    VALUES($1,$2,$3,$4,$5,'ACTIVE',$6,$7,$8)`,[
    input.worldId,input.promotionId,tournamentId,input.name.trim(),
    input.division,input.championshipId??null,idx,input.entrants.length]);
   const saved=await tx.query<{bout_no:number}>(`
    INSERT INTO ppw_tournament_bouts(world_id,promotion_id,tournament_id,
     bout_no,person_a,person_b)
    SELECT $1,$2,$3,x.n,x.a,x.b FROM jsonb_to_recordset($4::jsonb)
     AS x(n smallint,a text,b text) RETURNING bout_no`,[
     input.worldId,input.promotionId,tournamentId,JSON.stringify(initialBouts)
    ]);
   if(saved.length!==initialBouts.length)throw new Error("Incomplete tournament bracket");
   return {tournamentId,name:input.name.trim(),status:"ACTIVE" as const};
  }
 });
}

/** Cancel a stalled tournament without erasing any certified result.
 * The manager must remove reserved fixtures from future cards first.
 */
export type CancelTournamentInput=Scope&{
 requestId:string;expectedRevision:number;tournamentId:string;
};
export async function cancelTournament(pool:TransactionPool,input:CancelTournamentInput){
 if(![input.worldId,input.promotionId,input.playerId,input.tournamentId].every(valid))
  throw new Error("Invalid tournament cancellation");
 return applyWorldCommand(pool,{
  worldId:input.worldId,playerId:input.playerId,requestId:input.requestId,
  expectedRevision:input.expectedRevision,requiresOpenWeek:true,
  commandType:"CANCEL_PROMOTION_TOURNAMENT",
  execute:async tx=>{
   const owner=await tx.query<{promotion_id:string}>(`
    SELECT c.promotion_id FROM ppw_promotion_controls c
    JOIN ppw_memberships m ON m.world_id=c.world_id
     AND m.player_id=c.player_id AND m.status='ACTIVE'
    JOIN ppw_promotions p ON p.world_id=c.world_id
     AND p.promotion_id=c.promotion_id AND p.lifecycle='ACTIVE'
    WHERE c.world_id=$1 AND c.promotion_id=$2
     AND c.player_id=$3 AND c.active`,
    [input.worldId,input.promotionId,input.playerId]);
   if(owner.length!==1)throw new Error("Tournament cancellation access denied");
   const reserved=await tx.query<{bout_no:number}>(`
    SELECT bout_no FROM ppw_tournament_bouts
    WHERE world_id=$1 AND promotion_id=$2 AND tournament_id=$3
     AND show_id IS NOT NULL AND winner_person_id IS NULL LIMIT 1`,
    [input.worldId,input.promotionId,input.tournamentId]);
   if(reserved.length)throw new Error(
    "Remove remaining tournament bouts from planned show cards before cancelling");
   const done=await tx.query<{tournament_id:string}>(`
    UPDATE ppw_tournaments SET status='CANCELLED'
    WHERE world_id=$1 AND promotion_id=$2 AND tournament_id=$3
     AND status='ACTIVE' AND winner_person_id IS NULL
    RETURNING tournament_id`,
    [input.worldId,input.promotionId,input.tournamentId]);
   if(done.length!==1)throw new Error("Only an active tournament can be cancelled");
   return {tournamentId:input.tournamentId,status:"CANCELLED" as const};
  }
 });
}
