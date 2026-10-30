/** Once-per-new-article, verified retrospective only. No mutable AI memory,
 * no other promotion's results and no additional reads on READY cache hits.
 * Historical matches are filtered strictly BEFORE the reviewed show's week.
 */
import {withSqlClient} from "./postgres.js";
import type {TransactionPool} from "./transaction.js";
import {readCanonicalMatchLayout} from "../domain/match-sides.js";
import type {CompletedShowView} from "./show-results-view.js";

export type RingsideMemory={
 priorMatches:{when:string;wrestlers:string[];winners:string[];finish:string}[];
 programmes:{wrestlers:string[];began:string;beats:number;latest:string|null}[];
};
export const EMPTY_RINGSIDE_MEMORY:RingsideMemory={priorMatches:[],programmes:[]};
type Scope={worldId:string;promotionId:string;showId:string;playerId:string};
type HistoricRow={promotion_id:string;year:number;week:number;actual_finish:string;
 actual_winner_side:string;payload:unknown};
const valid=(s:string)=>typeof s==="string"&&!!s&&s.length<=200;

export async function readRingsideMemory(pool:TransactionPool,scope:Scope,
 show:CompletedShowView):Promise<RingsideMemory>{
 if(!Object.values(scope).every(valid)||show.showId!==scope.showId)
  throw new Error("Invalid Ringside history scope");
 // Card actor IDs come from the certified receipt, even for wrestlers
 // without a portable persona or a verified broadcast photograph.
 const ids=[...new Set(show.entries.flatMap(e=>
  [...e.actorIds,...e.targetIds]))].slice(0,120);
 if(!ids.length)return EMPTY_RINGSIDE_MEMORY;
 const weekIndex=(show.year-1)*52+show.week-1;
 return withSqlClient(pool,async db=>{
  // The same authenticated human controller must own the promotion.
  // One bounded set of recent historical cards (not the entire World).
  const rows=await db.query<HistoricRow>(`
   SELECT old.promotion_id,old.year,old.week,match.actual_finish,match.actual_winner_side,
    card.payload FROM (
     SELECT c.world_id,c.promotion_id,c.show_id,c.year,c.week FROM ppw_completed_shows c
     JOIN ppw_promotion_controls pc ON pc.world_id=c.world_id
      AND pc.promotion_id=c.promotion_id AND pc.player_id=$3 AND pc.active
     JOIN ppw_memberships membership ON membership.world_id=pc.world_id
      AND membership.player_id=pc.player_id AND membership.status='ACTIVE'
     WHERE c.world_id=$1 AND c.promotion_id=$2 AND c.show_id<>$4
      AND ((c.year-1)*52+c.week-1)<$5
     ORDER BY c.year DESC,c.week DESC,c.completed_at DESC LIMIT 10
    ) old JOIN ppw_completed_show_matches match
     ON match.world_id=old.world_id AND match.show_id=old.show_id
    JOIN ppw_card_slots card ON card.world_id=match.world_id
     AND card.draft_id=match.show_id AND card.slot_id=match.match_id
     AND card.kind='MATCH'
   ORDER BY old.year DESC,old.week DESC,match.position DESC LIMIT 36`,
   [scope.worldId,scope.promotionId,scope.playerId,scope.showId,weekIndex]);
  const shortlist:{year:number;week:number;finish:string;
   winners:string[];people:string[]}[]=[];
  const people=new Set<string>(ids);
  for(const row of rows){
   // Defence in depth: reject future or other-promotion receipts even if a
   // future SQL refactor accidentally widens the bounded owner-scoped query.
   const then=(row.year-1)*52+row.week-1;
   if(row.promotion_id!==scope.promotionId||!Number.isInteger(then)||then<0||then>=weekIndex)continue;
   try{
    const match=readCanonicalMatchLayout(row.payload);
    const cast=match.participants.map(x=>x.personId);
    if(!cast.some(id=>people.has(id)))continue;
    const winning=match.sides.find(x=>x.sideId===row.actual_winner_side);
    if(!winning)continue;
    shortlist.push({year:row.year,week:row.week,finish:row.actual_finish,
     winners:winning.participants.map(p=>p.personId),people:cast});
    if(shortlist.length>=8)break;
   }catch{/* Older incompatible lineups never become historical claims. */}
  }
  const requested=[...new Set(shortlist.flatMap(s=>s.people))].slice(0,160);
  const names=requested.length?await db.query<{person_id:string;name:string}>(`
    SELECT person_id,name FROM ppw_people
    WHERE world_id=$1 AND person_id=ANY($2::text[]) LIMIT 160`,
    [scope.worldId,requested]):[];
  const byName=new Map(names.map(x=>[x.person_id,x.name]));
  const priorMatches=shortlist.flatMap(row=>{
   const wrestlers=row.people.map(id=>byName.get(id)).filter((s):s is string=>!!s);
   const winners=row.winners.map(id=>byName.get(id)).filter((s):s is string=>!!s);
   if(winners.length!==row.winners.length||wrestlers.length!==row.people.length)return [];
   return [{when:"Y"+row.year+" W"+row.week,wrestlers,winners,finish:row.finish}];
  }).slice(0,5);
  // Settled, promotion-owned programme chapters already arrive with each
  // completed show slot in readCompletedShowView. Re-querying every active
  // programme here used another Neon round trip and provided less reliable
  // relevance than the exact linked slot. Keep only last shared matches.
  return {priorMatches,programmes:[]};
 });
}
