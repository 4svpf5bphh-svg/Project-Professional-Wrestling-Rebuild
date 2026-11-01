import type {TransactionPool} from "./transaction.js";
import {applyWorldCommand} from "./world-commands.js";
import {chooseEmergencyStaffCard,orderStaffPromotions,type StaffWrestlerCandidate}
  from "../domain/staff-fallback-card.js";
import type {ExistingShowBooking} from "../domain/staff-show-schedule.js";
import {inspectWeekConflicts} from "./week-conflicts.js";
import {defaults,seriesDue,regularRole} from "../domain/show-calendar.js";
import {readWorldAiBookingContext} from "./ai-booking-context.js";
import {chooseAiWorldCard,chooseAiTitleChallenger,type AiRosterCandidate,type AiCardMatch} from "../domain/ai-world-card.js";
import {aiPromotionStrategy} from "../domain/ai-promotion-strategy.js";

export interface GenerateStaffFallbackCardsInput{
  worldId:string;requestId:string;expectedRevision:number;
}
type Delegated={
  promotion_id:string;show_id:string|null;controller_player_id:string|null;
  owner_player_id:string|null;current_controller:string|null;
  delegated:boolean|null;status:string;management_mode:string;
  promotion_name:string;cadence:number;
};
type SignedCandidate={
  promotion_id:string;person_id:string;contract_id:string;
  booking_division:"MEN"|"WOMEN";weekly_service_capacity:number|null;
  momentum:number|null;recognition:number|null;popularity:number|null;
  presentation:number|null;match_craft:number|null;
  remaining_dates:number|null;
};
type Generated={promotionId:string;showId:string;day:number;venueId:string;
  participants:{personId:string;contractId:string}[];
  scriptedWinner:string;bookingDivision:"MEN"|"WOMEN";origin:"STAFF_FALLBACK"|"AI";
  matches?:AiCardMatch[];bookingClass:"REGULAR"|"PREMIUM";
  eventType:"REGULAR"|"MAJOR";importance:number;
  seriesId:string|null;showName:string|null};
type Unfilled={promotionId:string;reason:string};
/** Real contenders only. Reigns are awarded by certified show settlement. */
function inauguralPair(roster:readonly AiRosterCandidate[],division:"MEN"|"WOMEN"|null){
 const strength=(p:AiRosterCandidate)=>p.popularity+p.momentum+p.recognition;
 const eligible=[...roster].filter(p=>!division||p.bookingDivision===division)
  .sort((a,b)=>strength(b)-strength(a)||a.personId.localeCompare(b.personId,"en"));
 const first=eligible.find(p=>eligible.some(q=>q.personId!==p.personId&&q.bookingDivision===p.bookingDivision));
 const second=first&&eligible.find(p=>p.personId!==first.personId&&p.bookingDivision===first.bookingDivision);
 return first&&second?{aId:first.personId,bId:second.personId}:null;
}

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
          m.player_id AS current_controller,p.management_mode,a.status,
           p.name AS promotion_name,p.event_cadence_weeks AS cadence
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
      const draftRows=await tx.query<{promotion_id:string;booking_class:"REGULAR"|"PREMIUM"}>(
        `SELECT promotion_id,booking_class FROM ppw_booking_drafts
          WHERE world_id=$1 AND year=$2 AND week=$3 AND status IN ('DRAFT','SUBMITTED')
            AND promotion_id=ANY($4::text[]) LIMIT 257`,
        [input.worldId,year,week,priority],
      );
      if(draftRows.length>256)throw new Error("Too many draft records");
      const existingDrafts=new Set(draftRows.filter(x=>x.booking_class==="REGULAR").map(x=>x.promotion_id));
      const existingPremiums=new Set(draftRows.filter(x=>x.booking_class==="PREMIUM").map(x=>x.promotion_id));
      const candidates=await tx.query<SignedCandidate>(
        `SELECT booking.promotion_id,c.person_id,c.contract_id,p.booking_division,
                p.weekly_service_capacity,p.momentum,p.recognition,p.popularity,
                p.presentation,p.match_craft,c.remaining_dates
           FROM ppw_promotions booking
           JOIN ppw_contracts c ON c.world_id=booking.world_id
            AND (c.promotion_id=booking.promotion_id OR
             (c.promotion_id=booking.parent_promotion_id AND EXISTS (
              SELECT 1 FROM ppw_wrestler_promotion_affiliations affiliation
               WHERE affiliation.world_id=c.world_id
                AND affiliation.person_id=c.person_id
                AND affiliation.promotion_id=booking.promotion_id
                AND affiliation.basis='PARENT_COMPANY')))
           JOIN ppw_people p ON p.world_id=c.world_id AND p.person_id=c.person_id
          WHERE booking.world_id=$1 AND booking.promotion_id=ANY($2::text[])
            AND c.status='SIGNED' AND c.expires_week_index >= $3
            AND c.start_week_index <= $3
            AND (c.remaining_dates>0 OR (c.family='EXCLUSIVE' AND c.remaining_dates IS NULL))
            AND p.status='ACTIVE' AND p.booking_division IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM ppw_contracts x
                 WHERE x.world_id=c.world_id AND x.person_id=c.person_id
                   AND x.promotion_id<>c.promotion_id AND x.status='SIGNED'
                   AND x.family='EXCLUSIVE' AND x.expires_week_index >= $3)
          ORDER BY booking.promotion_id,c.person_id,c.contract_id LIMIT 10001`,
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
      const context=aiNeeded?await readWorldAiBookingContext(tx,input.worldId,
        all.filter(x=>x.status==="AI_MANAGED").map(x=>x.promotion_id)):null;
      const generated:Generated[]=[];
      const unfilled:Unfilled[]=[];
      const contractBalances=new Map(candidates.map(c=>[c.contract_id,c.remaining_dates]));
      const duePremium=new Map<string,ReturnType<typeof defaults>[number]>();
      for(const d of all){
        if(d.status!=="AI_MANAGED"||d.current_controller!==null||
          !["WWE","AEW"].includes(d.promotion_name.trim().toUpperCase()))continue;
        const ppv=defaults(d.promotion_name,d.cadence,
          worlds[0]!.major_event_interval_weeks??4).find(s=>
            !regularRole(s.role)&&seriesDue(s,weekIndex));
        if(ppv&&!existingPremiums.has(d.promotion_id))
          duePremium.set(d.promotion_id,ppv);
      }
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
          const branded=["WWE","AEW"].includes(d.promotion_name.trim().toUpperCase());
          const tv=branded?defaults(d.promotion_name,d.cadence,majorInterval??4)
            .find(s=>regularRole(s.role)&&seriesDue(s,weekIndex)):undefined;
          const eventType:"REGULAR"|"MAJOR"=branded?"REGULAR":
            majorInterval&&((weekIndex+1)%majorInterval===0)?"MAJOR":"REGULAR";
          const importance=branded?tv?.importance??70:eventType==="MAJOR"?85:58;
          const roster=aiRoster.get(promotionId)??[];
          const byId=new Map(roster.map(p=>[p.personId,p]));
          const rivals=context?.programmes.get(promotionId)??[];
          const titles=eventType==="MAJOR"?context?.championships.get(promotionId)??[]:[];
          const challengers=titles.flatMap(t=>{
            if(t.holderId===null){
              const pair=inauguralPair(roster,t.bookingDivision);
              return pair?[{...pair,kind:"VACANT_SINGLES_TITLE" as const,
               championshipId:t.championshipId,heat:t.heat}]:[];
            }
            const champ=byId.get(t.holderId);
            if(!champ)return [];
            const candidate=chooseAiTitleChallenger({
              roster,holderId:t.holderId,championshipId:t.championshipId,
              worldSeed:String(worlds[0]!.seed),promotionId,year,week,
              recentPairs:recent.get(promotionId)??[],
            });
            return candidate?[{kind:"SINGLES_TITLE" as const,
              aId:t.holderId,bId:candidate.personId,holderId:t.holderId,
              championshipId:t.championshipId,heat:t.heat}]:[];
          });
          const establishedPartners=[...byId.keys()].flatMap(aId=>
            (context?.partners.get(aId)??[]).filter(bId=>aId<bId)
              .map(bId=>({aId,bId})));
          const card=chooseAiWorldCard({
            worldId:input.worldId,worldSeed:String(worlds[0]!.seed),year,week,
            promotionId,showId,roster,
            activeVenues:venueRows.map(x=>x.venue_id),bookedShows:booked,
            eventType,riskTolerance:profile.ai_risk_tolerance,
            matchQualityPreference:profile.ai_match_quality_preference,
            starPreference:profile.ai_star_preference,
            strategy:aiPromotionStrategy({
            worldSeed:String(worlds[0]!.seed),promotionId,year,week,
            riskTolerance:profile.ai_risk_tolerance,
            matchQualityPreference:profile.ai_match_quality_preference,
            starPreference:profile.ai_star_preference
          }),
            recentPairs:recent.get(promotionId)??[],
            featuredPairs:[...challengers,...rivals],
            establishedPartners,
            establishedTeams:context?.teams,
            tagTitles:context?.tagChampionships.get(promotionId),
          });
          if(card.status==="UNFILLED"){
            unfilled.push({promotionId,reason:card.reason});continue;
          }
          const main=card.matches[card.matches.length-1]!;
          generated.push({promotionId,showId,day:card.schedule.day,
            venueId:card.schedule.venueId,participants:main.participants,
            scriptedWinner:main.scriptedWinner,bookingDivision:main.bookingDivision,
            origin:"AI",matches:card.matches,bookingClass:"REGULAR",
            eventType,importance,seriesId:tv?.seriesId??null,showName:tv?.name??null});
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
            origin:"STAFF_FALLBACK",bookingClass:"REGULAR",
            eventType:worlds[0]!.major_event_interval_weeks!==null&&
             (weekIndex+1)%(worlds[0]!.major_event_interval_weeks??1)===0?
              "MAJOR":"REGULAR",
            importance:worlds[0]!.major_event_interval_weeks!==null&&
             (weekIndex+1)%(worlds[0]!.major_event_interval_weeks??1)===0?85:58,
            seriesId:null,showName:null});
          booked.push({showId,day:choice.schedule.day,venueId:choice.schedule.venueId,
            personIds:[a.personId,b.personId]});
        }
      }
      // The AI books its PPV after normal shows, with no second World Lock.
      // Fallback to no PPV when there is no feasible roster or venue.
      for(const [promotionId,ppv] of duePremium){
        const profile=profilesByPromotion.get(promotionId);
        if(!generated.some(g=>g.promotionId===promotionId&&g.bookingClass==="REGULAR")||
          !profile||profile.ai_risk_tolerance===null||
          profile.ai_match_quality_preference===null||profile.ai_star_preference===null)
          continue;
        const used=new Map<string,number>();
        for(const g of generated.filter(g=>g.promotionId===promotionId))
          for(const id of new Set(g.matches?
            g.matches.flatMap(m=>m.participants.map(p=>p.personId)):
            g.participants.map(p=>p.personId)))
            used.set(id,(used.get(id)??0)+1);
        const roster=(aiRoster.get(promotionId)??[]).filter(p=>{
          const appearances=used.get(p.personId)??0;
          const balance=contractBalances.get(p.contractId);
          return balance!==undefined&&appearances<p.weeklyCapacity&&
            (balance===null||balance>appearances);
        });
        // World-scoped title-holder context is already in the single AI
        // preparation batch. A premium show should prioritize a defensible
        // title challenge, not merely rebrand an ordinary television card.
        const rosterById=new Map(roster.map(p=>[p.personId,p]));
        const titleChallenges=(context?.championships.get(promotionId)??[])
         .flatMap(title=>{
          if(title.holderId===null){
            const pair=inauguralPair(roster,title.bookingDivision);
            return pair?[{...pair,kind:"VACANT_SINGLES_TITLE" as const,
             championshipId:title.championshipId,heat:title.heat}]:[];
           }
           const champion=rosterById.get(title.holderId);
          if(!champion)return [];
          const challenger=roster.filter(x=>
           x.personId!==title.holderId&&
           x.bookingDivision===champion.bookingDivision)
           .sort((a,b)=>(b.popularity+b.momentum+b.recognition)-
            (a.popularity+a.momentum+a.recognition)||
            a.personId.localeCompare(b.personId,"en"))[0];
          return challenger?[{kind:"SINGLES_TITLE" as const,
           aId:title.holderId,bId:challenger.personId,
           holderId:title.holderId,championshipId:title.championshipId,
           heat:title.heat}]:[];
         });
        const showId="ai-ppv-"+year+"-"+week+"-"+promotionId;
        const card=chooseAiWorldCard({
          worldId:input.worldId,worldSeed:String(worlds[0]!.seed),year,week,
          promotionId,showId,roster,bookedShows:booked,
          excludedDays:booked.filter(x=>generated.some(g=>
            g.showId===x.showId&&g.promotionId===promotionId)).map(x=>x.day),
          activeVenues:venueRows.map(x=>x.venue_id),eventType:"MAJOR",
          riskTolerance:profile.ai_risk_tolerance,
          matchQualityPreference:profile.ai_match_quality_preference,
          starPreference:profile.ai_star_preference,
          strategy:aiPromotionStrategy({
            worldSeed:String(worlds[0]!.seed),promotionId,year,week,
            riskTolerance:profile.ai_risk_tolerance,
            matchQualityPreference:profile.ai_match_quality_preference,
            starPreference:profile.ai_star_preference
          }),
          recentPairs:recent.get(promotionId)??[],
          featuredPairs:[...titleChallenges,
           ...(context?.programmes.get(promotionId)??[])],
          establishedTeams:context?.teams,
          establishedPartners:roster.flatMap(p=>
            (context?.partners.get(p.personId)??[])
              .filter(bId=>p.personId<bId).map(bId=>({aId:p.personId,bId}))),
          tagTitles:context?.tagChampionships.get(promotionId)
        });
        if(card.status==="UNFILLED"){
          unfilled.push({promotionId,reason:"OPTIONAL_PPV_"+card.reason});
          continue;
        }
        const main=card.matches[card.matches.length-1]!;
        generated.push({promotionId,showId,day:card.schedule.day,
          venueId:card.schedule.venueId,participants:main.participants,
          scriptedWinner:main.scriptedWinner,bookingDivision:main.bookingDivision,
          origin:"AI",matches:card.matches,bookingClass:"PREMIUM",
          eventType:"MAJOR",importance:ppv.importance,
          seriesId:ppv.seriesId,showName:ppv.name});
        booked.push({showId,day:card.schedule.day,venueId:card.schedule.venueId,
          personIds:card.matches.flatMap(m=>m.participants.map(p=>p.personId))});
      }
      if(generated.length){
        const drafts=await tx.query<{draft_id:string}>(`
          INSERT INTO ppw_booking_drafts
           (world_id,draft_id,promotion_id,year,week,status,show_day,venue_id,
            booking_origin,booking_class,event_type,event_importance,show_series_id,show_name)
          SELECT $1,x.show_id,x.promotion_id,$2,$3,'SUBMITTED',x.day,x.venue_id,
           x.origin,x.booking_class,x.event_type,x.importance,x.series_id,x.show_name
          FROM jsonb_to_recordset($4::jsonb) AS x(
           show_id text,promotion_id text,day smallint,venue_id text,
           origin text,booking_class text,event_type text,importance integer,
           series_id text,show_name text)
          RETURNING draft_id`,
          [input.worldId,year,week,JSON.stringify(generated.map(g=>({
           show_id:g.showId,promotion_id:g.promotionId,day:g.day,
           venue_id:g.venueId,origin:g.origin,booking_class:g.bookingClass,
           event_type:g.eventType,importance:g.importance,
           series_id:g.seriesId,show_name:g.showName
          })))]
         );
        if(drafts.length!==generated.length)throw new Error("Staff draft batch insert mismatch");
        const slotRows=generated.flatMap<{
          showId:string;slotId:string;position:number;payload:unknown
        }>(show=>show.matches?
          show.matches.map((match,index)=>({
            showId:show.showId,slotId:"ai-"+(match.matchType==="TAG"?"tag":"singles")+"-"+
              String(index+1).padStart(2,"0"),
            position:index,payload:{
              participants:match.participants,scriptedWinner:match.scriptedWinner,
              scriptedBy:"AI_WORLD_BOOKER",matchType:match.matchType??"SINGLES",
              ...(match.matchType==="TAG"?{family:"TEAMS",sides:match.sides,
                scriptedWinnerSide:match.scriptedWinnerSide}:{}),
              bookingDivision:match.bookingDivision,intent:match.intent,
              plannedFinish:match.plannedFinish,
              plannedLengthMinutes:match.plannedLengthMinutes,
              mainEvent:match.mainEvent,
              ...(match.programmeId?{programmeId:match.programmeId}:{}),
              ...(match.championshipId?{championshipId:match.championshipId}:{}),
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
        const linked=slotRows.flatMap(row=>{
          const payload=row.payload as Record<string,unknown>;
          return typeof payload.programmeId==="string"?[
           {showId:row.showId,slotId:row.slotId,
            programmeId:payload.programmeId}]:[];
        });
        if(linked.length){
          const byShow=new Map(generated.map(x=>[x.showId,x.promotionId]));
          const links=await tx.query<{slot_id:string}>(`
           INSERT INTO ppw_programme_match_activities
             (world_id,promotion_id,programme_id,draft_id,slot_id,kind)
           SELECT $1,x.promotion_id,x.programme_id,x.show_id,x.slot_id,'MATCH'
           FROM jsonb_to_recordset($2::jsonb) AS x(
             promotion_id text,programme_id text,show_id text,slot_id text)
           RETURNING slot_id`,
           [input.worldId,JSON.stringify(linked.map(x=>({
            ...x,promotion_id:byShow.get(x.showId),programme_id:x.programmeId,
            show_id:x.showId,slot_id:x.slotId})))]);
          if(links.length!==linked.length)throw new Error("Programme links incomplete");
        }
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
            participants:x.matches?
              x.matches.flatMap(m=>m.participants.map(p=>p.personId)):
              x.participants.map(p=>p.personId)})),
          unfilled,staffAuthored:true,simulationConsequencesPending:true,
          matchCount:generated.reduce((sum,x)=>sum+(x.matches?.length??1),0),
        })],
      );
      return {year,week,generated:generated.map(x=>({promotionId:x.promotionId,
        showId:x.showId,day:x.day,venueId:x.venueId,origin:x.origin})),unfilled};
    },
  });
}
