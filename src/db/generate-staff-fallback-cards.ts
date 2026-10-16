import type {TransactionPool} from "./transaction.js";
import {applyWorldCommand} from "./world-commands.js";
import {chooseEmergencyStaffCard,orderStaffPromotions,type StaffWrestlerCandidate}
  from "../domain/staff-fallback-card.js";
import type {ExistingShowBooking} from "../domain/staff-show-schedule.js";
import {inspectWeekConflicts} from "./week-conflicts.js";
import {chooseAiWorldCard,type AiRosterCandidate,type AiCardMatch} from "../domain/ai-world-card.js";

export interface GenerateStaffFallbackCardsInput{
  worldId:string;requestId:string;expectedRevision:number;
}
type Delegated={
  promotion_id:string;show_id:string|null;controller_player_id:string|null;
  owner_player_id:string|null;current_controller:string|null;
  delegated:boolean|null;status:string;management_mode:string;
};
type SignedCandidate={
  promotion_id:string;person_id:string;contract_id:string;
  booking_division:"MEN"|"WOMEN";weekly_service_capacity:number|null;
  momentum:number|null;recognition:number|null;popularity:number|null;
  presentation:number|null;match_craft:number|null;
};
type Generated={promotionId:string;showId:string;day:number;venueId:string;
  participants:[{personId:string;contractId:string},{personId:string;contractId:string}];
  scriptedWinner:string;bookingDivision:"MEN"|"WOMEN";origin:"STAFF_FALLBACK"|"AI";
  matches?:AiCardMatch[]};
type Unfilled={promotionId:string;reason:string};

/** A single World-locked, server-only STAFF fallback BATCH.
 * Every eligible promotion is processed in a seed-derived order to prevent
 * first worker, first request ID or submission timing determining scarce
 * resources. Never player callable. Does not resolve the match or spend dates.
 */
export async function generateWeekStaffFallbackCards(pool:TransactionPool,input:GenerateStaffFallbackCardsInput){
  return applyWorldCommand(pool,{
    worldId:input.worldId,playerId:"system",requestId:input.requestId,
    expectedRevision:input.expectedRevision,commandType:"GENERATE_WEEK_STAFF_FALLBACK_CARDS",
    execute:async tx=>{
      const worlds=await tx.query<{year:number;week:number;phase:string;seed:string|number;
        show_economics_enabled:boolean;major_event_interval_weeks:number|null}>(
        "SELECT year,week,phase,seed,show_economics_enabled,major_event_interval_weeks FROM ppw_worlds WHERE world_id=$1",[input.worldId],
      );
      if(worlds.length!==1||worlds[0]!.phase!=="RESOLVING")
        throw new Error("Staff fallback requires World resolution");
      const {year,week}=worlds[0]!,weekIndex=(year-1)*52+week-1;
      if(!Number.isSafeInteger(weekIndex)||weekIndex<0)throw new Error("Invalid PPW week");
      const gating=await tx.query<{
        finalised:boolean;prior:boolean;cleared:boolean;resolved:boolean;
      }>(
        `SELECT
          EXISTS(SELECT 1 FROM ppw_week_prepared_finalizations
            WHERE world_id=$1 AND year=$2 AND week=$3) AS finalised,
          EXISTS(SELECT 1 FROM ppw_week_staff_fallback_runs
            WHERE world_id=$1 AND year=$2 AND week=$3) AS prior,
          EXISTS(SELECT 1 FROM ppw_week_resource_clearances
            WHERE world_id=$1 AND year=$2 AND week=$3) AS cleared,
          EXISTS(SELECT 1 FROM ppw_show_resolutions
            WHERE world_id=$1 AND resolved_week_index=$4) AS resolved`,
        [input.worldId,year,week,weekIndex],
      );
      if(gating.length!==1||!gating[0]!.finalised||gating[0]!.cleared||gating[0]!.resolved)
        throw new Error("Staff card generation must precede weekly resource clearance");
      if(gating[0]!.prior)throw new Error("Staff card fallback already evaluated this week");
      const all=await tx.query<Delegated>(
        `SELECT a.promotion_id,a.show_id,a.controller_player_id,
          s.owner_player_id,s.allow_unfinished_fallback AS delegated,
          m.player_id AS current_controller,p.management_mode,a.status
         FROM ppw_week_continuity_assessments a
         JOIN ppw_promotions p ON p.world_id=a.world_id AND p.promotion_id=a.promotion_id
         LEFT JOIN ppw_promotion_controls c ON c.world_id=a.world_id
            AND c.promotion_id=a.promotion_id AND c.active
         LEFT JOIN ppw_memberships m ON m.world_id=c.world_id AND m.player_id=c.player_id
            AND m.status='ACTIVE'
         LEFT JOIN ppw_staff_continuity_settings s ON s.world_id=a.world_id
            AND s.promotion_id=a.promotion_id
         WHERE a.world_id=$1 AND a.year=$2 AND a.week=$3
           AND a.show_id IS NULL AND p.lifecycle='ACTIVE'
           AND (a.status='STAFF_FALLBACK_ELIGIBLE' OR
             (a.status='AI_MANAGED' AND p.management_mode='AI'
              AND NOT EXISTS(SELECT 1 FROM ppw_promotion_controls active_c
               WHERE active_c.world_id=p.world_id AND active_c.promotion_id=p.promotion_id
                AND active_c.active)))
         ORDER BY a.promotion_id LIMIT 129`,
        [input.worldId,year,week],
      );
      if(all.length>128)throw new Error("Too many AI/delegated missing-card shows");
      if(all.length===0)throw new Error("No missing AI or delegated staff show required");
      const priority=orderStaffPromotions(input.worldId,String(worlds[0]!.seed),year,week,
        all.map(x=>x.promotion_id));
      const delegations=new Map(all.map(x=>[x.promotion_id,x]));
      const draftRows=await tx.query<{promotion_id:string}>(
        `SELECT promotion_id FROM ppw_booking_drafts
          WHERE world_id=$1 AND year=$2 AND week=$3 AND status IN ('DRAFT','SUBMITTED')
            AND promotion_id=ANY($4::text[]) LIMIT 129`,
        [input.worldId,year,week,priority],
      );
      if(draftRows.length>128)throw new Error("Too many draft records");
      const existingDrafts=new Set(draftRows.map(x=>x.promotion_id));
      const candidates=await tx.query<SignedCandidate>(
        `SELECT c.promotion_id,c.person_id,c.contract_id,p.booking_division,
                p.weekly_service_capacity,p.momentum,p.recognition,p.popularity,
                p.presentation,p.match_craft
           FROM ppw_contracts c
           JOIN ppw_people p ON p.world_id=c.world_id AND p.person_id=c.person_id
          WHERE c.world_id=$1 AND c.promotion_id=ANY($2::text[])
            AND c.status='SIGNED' AND c.expires_week_index >= $3
            AND (c.remaining_dates>0 OR (c.family='EXCLUSIVE' AND c.remaining_dates IS NULL))
            AND p.status='ACTIVE' AND p.booking_division IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM ppw_contracts x
                 WHERE x.world_id=c.world_id AND x.person_id=c.person_id
                   AND x.promotion_id<>c.promotion_id AND x.status='SIGNED'
                   AND x.family='EXCLUSIVE' AND x.expires_week_index >= $3)
          ORDER BY c.promotion_id,c.person_id,c.contract_id LIMIT 10001`,
        [input.worldId,priority,weekIndex],
      );
      if(candidates.length>10000)throw new Error("Staff roster eligibility batch too large");
      const byPromotion=new Map<string,StaffWrestlerCandidate[]>();
      const aiRoster=new Map<string,AiRosterCandidate[]>();
      for(const c of candidates){
        const list=byPromotion.get(c.promotion_id)??[];
        if(list.length>=256)throw new Error("Staff fallback roster limit exceeded");
        list.push({personId:c.person_id,contractId:c.contract_id,
          bookingDivision:c.booking_division,weeklyCapacity:c.weekly_service_capacity??7});
        byPromotion.set(c.promotion_id,list);
        if([c.momentum,c.recognition,c.popularity,c.presentation,c.match_craft]
          .every(v=>v!==null)){
          const ranked=aiRoster.get(c.promotion_id)??[];
          ranked.push({personId:c.person_id,contractId:c.contract_id,
           bookingDivision:c.booking_division,weeklyCapacity:c.weekly_service_capacity??7,
           momentum:c.momentum!,recognition:c.recognition!,popularity:c.popularity!,
           presentation:c.presentation!,matchCraft:c.match_craft!});
          aiRoster.set(c.promotion_id,ranked);
        }
      }
      const venueRows=await tx.query<{venue_id:string}>(
        "SELECT venue_id FROM ppw_venues WHERE world_id=$1 AND status='ACTIVE' AND ($2::boolean=false OR (market_id IS NOT NULL AND capacity IS NOT NULL AND weekly_hire_cost IS NOT NULL)) ORDER BY venue_id LIMIT 257",
        [input.worldId,worlds[0]!.show_economics_enabled],
      );
      if(venueRows.length>256)throw new Error("Venue catalogue limit exceeded");
      const before=await inspectWeekConflicts(tx,input.worldId);
      const existing=new Map<string,ExistingShowBooking>();
      for(const claim of before.arbitrationClaims){
        if(claim.kind==="VENUE")existing.set(claim.showId,{
          showId:claim.showId,day:claim.day,venueId:claim.resourceId,personIds:[],
        });
      }
      for(const claim of before.arbitrationClaims){
        if(claim.kind==="WRESTLER"){
          const item=existing.get(claim.showId);
          if(!item)throw new Error("Existing wrestler claim lacks scheduled venue");
          (item.personIds as string[]).push(claim.resourceId);
        }
      }
      const booked=[...existing.values()];
      // One bounded, narrow 2-week lookback per World batch—not an archive
      // scan and never a full wrestler/profile download.
      const aiNeeded=all.some(x=>x.status==="AI_MANAGED");
      const cutoff=Math.max(0,weekIndex-2);
      const prior=aiNeeded?await tx.query<{
        promotion_id:string;person_a:string|null;person_b:string|null}>(`
       SELECT c.promotion_id,
        s.payload->'participants'->0->>'personId' AS person_a,
        s.payload->'participants'->1->>'personId' AS person_b
       FROM ppw_completed_shows c
       JOIN ppw_completed_show_matches m ON m.world_id=c.world_id
        AND m.show_id=c.show_id
       JOIN ppw_card_slots s ON s.world_id=m.world_id
        AND s.draft_id=m.show_id AND s.slot_id=m.match_id
       WHERE c.world_id=$1
        AND (c.year>$2 OR (c.year=$2 AND c.week>=$3))
        AND (c.year<$4 OR (c.year=$4 AND c.week<$5))
        AND jsonb_array_length(s.payload->'participants')=2
       ORDER BY c.year DESC,c.week DESC,c.promotion_id,m.match_id LIMIT 513`,
       [input.worldId,Math.floor(cutoff/52)+1,cutoff%52+1,year,week]):[];
      if(prior.length>512)throw new Error("Recent AI pairing history exceeds bound");
      const recent=new Map<string,string[]>();
      for(const r of prior){
        if(!r.person_a||!r.person_b)continue;
        const keys=recent.get(r.promotion_id)??[];
        keys.push(r.person_a<r.person_b?r.person_a+":"+r.person_b:r.person_b+":"+r.person_a);
        recent.set(r.promotion_id,keys);
      }
      const profiles=aiNeeded?await tx.query<{
        promotion_id:string;ai_risk_tolerance:number|null;
        ai_match_quality_preference:number|null;ai_star_preference:number|null}>(`
       SELECT promotion_id,ai_risk_tolerance,ai_match_quality_preference,
        ai_star_preference FROM ppw_promotions
       WHERE world_id=$1 AND promotion_id=ANY($2::text[]) ORDER BY promotion_id`,
       [input.worldId,all.filter(x=>x.status==="AI_MANAGED").map(x=>x.promotion_id)]):[];
      const profilesByPromotion=new Map(profiles.map(x=>[x.promotion_id,x]));
      const generated:Generated[]=[];
      const unfilled:Unfilled[]=[];
      for(const promotionId of priority){
        const d=delegations.get(promotionId)!;
        const ai=d.status==="AI_MANAGED"&&d.management_mode==="AI"&&
          d.current_controller===null;
        const delegated=d.status==="STAFF_FALLBACK_ELIGIBLE"&&
          !!d.controller_player_id&&d.controller_player_id===d.current_controller&&
          d.owner_player_id===d.current_controller&&d.delegated===true;
        if(!ai&&!delegated){
          unfilled.push({promotionId,reason:"OWNER_PERMISSION_CHANGED"});continue;
        }
        if(existingDrafts.has(promotionId)){
          unfilled.push({promotionId,reason:"EXISTING_DRAFT_PRESERVED"});continue;
        }
        const showId=(ai?"ai-week-":"staff-fallback-")+year+"-"+week+"-"+promotionId;
        if(ai){
          const profile=profilesByPromotion.get(promotionId);
          if(!profile||profile.ai_risk_tolerance===null||
            profile.ai_match_quality_preference===null||profile.ai_star_preference===null)
            throw new Error("Original AI booking profile missing");
          const majorInterval=worlds[0]!.major_event_interval_weeks;
          if(worlds[0]!.show_economics_enabled&&!majorInterval)
            throw new Error("Original major-event schedule missing");
          const eventType=majorInterval&&((weekIndex+1)%majorInterval===0)?"MAJOR":"REGULAR";
          const card=chooseAiWorldCard({
            worldId:input.worldId,worldSeed:String(worlds[0]!.seed),year,week,
            promotionId,showId,roster:aiRoster.get(promotionId)??[],
            activeVenues:venueRows.map(x=>x.venue_id),bookedShows:booked,
            eventType,riskTolerance:profile.ai_risk_tolerance,
            matchQualityPreference:profile.ai_match_quality_preference,
            starPreference:profile.ai_star_preference,
            recentPairs:recent.get(promotionId)??[],
          });
          if(card.status==="UNFILLED"){
            unfilled.push({promotionId,reason:card.reason});continue;
          }
          const main=card.matches[card.matches.length-1]!;
          generated.push({promotionId,showId,day:card.schedule.day,
            venueId:card.schedule.venueId,participants:main.participants,
            scriptedWinner:main.scriptedWinner,bookingDivision:main.bookingDivision,
            origin:"AI",matches:card.matches});
          booked.push({showId,day:card.schedule.day,venueId:card.schedule.venueId,
            personIds:card.matches.flatMap(m=>m.participants.map(p=>p.personId))});
        }else{
          const choice=chooseEmergencyStaffCard({
            worldId:input.worldId,worldSeed:String(worlds[0]!.seed),year,week,
            promotionId,showId,roster:byPromotion.get(promotionId)??[],
            activeVenues:venueRows.map(v=>v.venue_id),bookedShows:booked,
          });
          if(choice.status==="UNFILLED"){
            unfilled.push({promotionId,reason:choice.reason});continue;
          }
          const [a,b]=choice.performers;
          generated.push({promotionId,showId,day:choice.schedule.day,
            venueId:choice.schedule.venueId,
            participants:[{personId:a.personId,contractId:a.contractId},
              {personId:b.personId,contractId:b.contractId}],
            scriptedWinner:choice.scriptedWinner,bookingDivision:a.bookingDivision,
            origin:"STAFF_FALLBACK"});
          booked.push({showId,day:choice.schedule.day,venueId:choice.schedule.venueId,
            personIds:[a.personId,b.personId]});
        }
      }
      if(generated.length){
        const drafts=await tx.query<{draft_id:string}>(
          `INSERT INTO ppw_booking_drafts
             (world_id,draft_id,promotion_id,year,week,status,show_day,venue_id,booking_origin,
              event_type,event_importance)
           SELECT $1,show_id,promotion_id,$2,$3,'SUBMITTED',day,venue_id,origin,
              CASE WHEN $9::integer IS NOT NULL AND $8::integer%$9::integer=0
                 THEN 'MAJOR' ELSE 'REGULAR' END,
              CASE WHEN $9::integer IS NOT NULL AND $8::integer%$9::integer=0
                 THEN 85 ELSE 58 END
             FROM unnest($4::text[],$5::text[],$6::smallint[],$7::text[],$10::text[])
               AS proposals(show_id,promotion_id,day,venue_id,origin)
              RETURNING draft_id`,
          [input.worldId,year,week,generated.map(x=>x.showId),
            generated.map(x=>x.promotionId),generated.map(x=>x.day),
            generated.map(x=>x.venueId),
            weekIndex+1,worlds[0]!.major_event_interval_weeks,
            generated.map(x=>x.origin)],
        );
        if(drafts.length!==generated.length)throw new Error("Staff draft batch insert mismatch");
        const slotRows=generated.flatMap<{
          showId:string;slotId:string;position:number;payload:unknown
        }>(show=>show.matches?
          show.matches.map((match,index)=>({
            showId:show.showId,slotId:"ai-singles-"+String(index+1).padStart(2,"0"),
            position:index,payload:{
              participants:match.participants,scriptedWinner:match.scriptedWinner,
              scriptedBy:"AI_WORLD_BOOKER",matchType:"SINGLES",
              bookingDivision:match.bookingDivision,intent:match.intent,
              plannedFinish:match.plannedFinish,
              plannedLengthMinutes:match.plannedLengthMinutes,
              mainEvent:match.mainEvent,
            },
          })):
          [{showId:show.showId,slotId:"emergency-singles",position:0,
           payload:{participants:show.participants,
            scriptedWinner:show.scriptedWinner,
            scriptedBy:"DELEGATED_STAFF",staffFallback:true,
            matchType:"SINGLES",bookingDivision:show.bookingDivision,
            consequencesPolicy:"EMERGENCY_LIMITED_PENDING_SIMULATION"}}]);
        const slots=await tx.query<{slot_id:string}>(`
          INSERT INTO ppw_card_slots(world_id,draft_id,slot_id,position,kind,payload)
          SELECT $1,v.show_id,v.slot_id,v.position,'MATCH',v.payload
          FROM jsonb_to_recordset($2::jsonb) AS v(
           show_id text,slot_id text,position integer,payload jsonb)
          RETURNING slot_id`,
          [input.worldId,JSON.stringify(slotRows.map(x=>({
            show_id:x.showId,slot_id:x.slotId,position:x.position,payload:x.payload})))]);
        if(slots.length!==slotRows.length)throw new Error("Generated match card insert mismatch");
        const after=await inspectWeekConflicts(tx,input.worldId);
        const staffShowIds=new Set(generated.map(x=>x.showId));
        if(after.blockers.some(b=>b.showIds.some(id=>staffShowIds.has(id))))
          throw new Error("Staff cards failed World-wide resource and contract verification");
      }
      await tx.query(
        `INSERT INTO ppw_week_staff_fallback_runs
         (world_id,year,week,generated_count,unfilled_count,command_request_id)
         VALUES($1,$2,$3,$4,$5,$6)`,
        [input.worldId,year,week,generated.length,unfilled.length,input.requestId],
      );
      await tx.query(
        `INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)
         VALUES($1,$2,$3,'STAFF_FALLBACK_CARDS_CREATED',$4::jsonb)`,
        [input.worldId,year,week,JSON.stringify({
          generated:generated.map(x=>({promotionId:x.promotionId,showId:x.showId,
            day:x.day,venueId:x.venueId,origin:x.origin,winner:x.scriptedWinner,
            participants:x.participants.map(p=>p.personId)})),
          unfilled,staffAuthored:true,simulationConsequencesPending:true,
          matchCount:generated.reduce((sum,x)=>sum+(x.matches?.length??1),0),
        })],
      );
      return {year,week,generated:generated.map(x=>({promotionId:x.promotionId,
        showId:x.showId,day:x.day,venueId:x.venueId,origin:x.origin})),unfilled};
    },
  });
}
