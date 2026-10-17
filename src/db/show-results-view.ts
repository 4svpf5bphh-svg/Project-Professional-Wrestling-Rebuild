/** Controller-scoped results, composed from persisted World-authoritative receipts.
 * Four bounded indexed reads; no World JSON, client-supplied scores or resimulation.
 */
import type {TransactionPool} from "./transaction.js";
import {withSqlClient} from "./postgres.js";
import {validateCompletedShowReceipt,type CompletedShowReceipt}
 from "../domain/completed-show-receipt.js";
import type {CompletedSegmentStory} from "./completed-show-results.js";
import {readCardParticipants} from "../domain/card-participants.js";
import {readCanonicalMatchLayout} from "../domain/match-sides.js";
import {describeMatchFinish} from "../domain/show-match-story.js";
import {projectBroadcastIdentities,broadcastNameplate,type BroadcastIdentity}
 from "../domain/show-broadcast-personas.js";
import type {SegmentConsequenceIntent} from "../domain/segment-consequences.js";
export interface CompletedMatchBroadcastContext{
 /** Locked card context, not an invented account of the match action. */
 format:string;intent:string;plannedMinutes:number|null;
 sides:string[][];winnerNames:string[];championshipContested:boolean;
}
export interface ShowResultEntry{
 slotId:string;position:number;type:"MATCH"|"SEGMENT";
 headline:string;summary:string;crowdResponse:number;
 outcome:string;actorIds:string[];targetIds:string[];
 intent?:SegmentConsequenceIntent|null;
 matchContext?:CompletedMatchBroadcastContext;
 segmentKind?:string;
 performerIdentities?:BroadcastIdentity[];
}
export interface CompletedShowView {
 showId:string;year:number;week:number;crowdResponse:number;
 matchCount:number;angleCount:number;entries:ShowResultEntry[];
}
const human=(v:string)=>v.toLowerCase().replaceAll("_"," ")
 .replace(/(^|\s)\S/g,c=>c.toUpperCase());
export async function readCompletedShowView(
 pool:TransactionPool,input:{worldId:string;playerId:string;
  promotionId:string;showId:string},
):Promise<CompletedShowView>{
 if(!Object.values(input).every(x=>typeof x==="string"&&x.trim()&&x.length<=200))
  throw new Error("Invalid results scope");
 return withSqlClient(pool,async tx=>{
  const rows=await tx.query<{receipt_json:unknown}>(`
   SELECT c.receipt_json FROM ppw_completed_shows c
   JOIN ppw_promotion_controls p ON p.world_id=c.world_id
    AND p.promotion_id=c.promotion_id AND p.player_id=$2 AND p.active
   JOIN ppw_memberships m ON m.world_id=p.world_id
    AND m.player_id=p.player_id AND m.status='ACTIVE'
   WHERE c.world_id=$1 AND c.promotion_id=$3 AND c.show_id=$4`,
   [input.worldId,input.playerId,input.promotionId,input.showId]);
  if(rows.length!==1)throw new Error("Completed show unavailable to this controller");
  const receipt=validateCompletedShowReceipt(rows[0]!.receipt_json as CompletedShowReceipt);
  const slots=await tx.query<{slot_id:string;kind:string;position:number;payload:unknown}>(`
   SELECT slot_id,kind,position,payload FROM ppw_card_slots
   WHERE world_id=$1 AND draft_id=$2 ORDER BY position LIMIT 101`,
   [input.worldId,input.showId]);
  if(slots.length>100)throw new Error("Completed card exceeds slot capacity");
  const ids=[...new Set(slots.flatMap(s=>readCardParticipants(s.payload).map(p=>p.personId)))];
  if(ids.length>100)throw new Error("Completed card exceeds talent capacity");
  const people=ids.length?await tx.query<{person_id:string;name:string;
   portable_gimmick_id:string|null;persona_record:unknown|null}>(`
   SELECT p.person_id,p.name,p.portable_gimmick_id,
    identity.persona AS persona_record
   FROM ppw_people p LEFT JOIN ppw_portable_personas identity
    ON identity.world_id=p.world_id AND identity.person_id=p.person_id
   WHERE p.world_id=$1 AND p.person_id=ANY($2::text[])`,
   [input.worldId,ids]):[];
  const identities=projectBroadcastIdentities(people.map(p=>({
   personId:p.person_id,name:p.name,portableGimmickId:p.portable_gimmick_id??null,
   personaRecord:p.persona_record??null,
  })));
  const names=new Map(people.map(p=>[p.person_id,p.name]));
  const name=(id:string)=>broadcastNameplate(id,identities,
   names.get(id)??"Unknown wrestler");
  const personaFor=(ids:readonly string[])=>ids.flatMap(id=>{
   const persona=identities.get(id);return persona?[persona]:[];
  });
  const stories=receipt.segments.length?await tx.query<{slot_id:string;story_json:unknown}>(`
   SELECT slot_id,story_json FROM ppw_completed_show_segments
   WHERE world_id=$1 AND show_id=$2 ORDER BY position LIMIT 101`,
   [input.worldId,input.showId]):[];
  const byStory=new Map(stories.map(s=>[s.slot_id,s.story_json as CompletedSegmentStory|null]));
  const bySlot=new Map(slots.map(s=>[s.slot_id,s]));
  if(slots.length!==receipt.matches.length+receipt.segments.length)
   throw new Error("Completed show card changed since resolution");
  const entries:ShowResultEntry[]=[];
  for(const match of receipt.matches){
   const slot=bySlot.get(match.matchId);
   if(!slot||slot.kind!=="MATCH"||slot.position!==match.position)
    throw new Error("Completed match card changed since resolution");
   let winnerNames:string[]=[];
   let matchContext:CompletedMatchBroadcastContext|undefined;
   let participants=readCardParticipants(slot.payload).map(p=>p.personId);
   try{
    const layout=readCanonicalMatchLayout(slot.payload);
    const winners=layout.sides.find(s=>s.sideId===match.actualWinnerSide);
    winnerNames=winners?.participants.map(p=>name(p.personId))??[];
    participants=layout.participants.map(p=>p.personId);
    const payload=slot.payload as Record<string,unknown>;
    const size=layout.sides[0]?.participants.length??1;
    const format=layout.family==="TEAMS"?
     (layout.sides.length===2?String(size)+"v"+String(size):
      String(layout.sides.length)+"-team "+String(size)+"v"+String(size)):
     payload.matchType==="BATTLE_ROYAL"?"BATTLE ROYAL":
     layout.sides.length===2?"SINGLES":String(layout.sides.length)+"-WAY";
    matchContext={format,
     intent:typeof payload.intent==="string"?payload.intent:"COMPETITIVE",
     plannedMinutes:typeof payload.plannedLengthMinutes==="number"?
      payload.plannedLengthMinutes:null,
     sides:layout.sides.map(side=>side.participants.map(p=>name(p.personId))),
     winnerNames:[...winnerNames],
     championshipContested:typeof payload.championshipId==="string"&&
      payload.championshipId.length>0};
   }catch{/* Older completed matches still retain their finish and score. */}
   const {headline,summary}=describeMatchFinish({
    actualFinish:match.actualFinish,actualWinnerSide:match.actualWinnerSide,
    winnerNames,participants:participants.map(name),
   });
   entries.push({slotId:match.matchId,position:match.position,type:"MATCH",
    headline,summary,crowdResponse:match.crowdResponse,
    outcome:match.actualFinish,actorIds:participants,targetIds:[],
    performerIdentities:personaFor(participants),
    ...(matchContext?{matchContext}:{})});
  }
  for(const segment of receipt.segments){
   const slot=bySlot.get(segment.slotId);
   if(!slot||slot.kind!=="SEGMENT"||slot.position!==segment.position)
    throw new Error("Completed angle card changed since resolution");
   const story=byStory.get(segment.slotId);
   if(story&&(story.kind!==segment.kind||story.outcome!==segment.outcome||
    story.position!==segment.position))
    throw new Error("Segment story differs from World resolution");
   entries.push({slotId:segment.slotId,position:segment.position,type:"SEGMENT",
    headline:story?.headline??human(segment.kind),
    summary:story?.summary??"Authored outcome: "+human(segment.outcome)+".",
    crowdResponse:segment.crowdResponse,outcome:segment.outcome,
    actorIds:story?[...story.actorIds]:[],targetIds:story?[...story.targetIds]:[],
    intent:story?.intent??null,segmentKind:segment.kind,
    performerIdentities:personaFor(story?[
     ...story.actorIds,...story.targetIds]:readCardParticipants(slot.payload)
      .map(x=>x.personId))});
  }
  entries.sort((a,b)=>a.position-b.position);
  return {showId:input.showId,year:receipt.year,week:receipt.week,
   crowdResponse:receipt.crowdResponse,matchCount:receipt.matches.length,
   angleCount:receipt.segments.length,entries};
 });
}
