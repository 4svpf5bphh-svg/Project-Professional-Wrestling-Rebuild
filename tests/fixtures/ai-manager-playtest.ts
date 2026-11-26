import assert from "node:assert/strict";
import { chooseShowMarketAsActor, markPreparedShowReadyAsActor, saveCardEditorAsActor } from "../../src/api/world-service.js";
import { insertAiProgrammes } from "../../src/db/ai-programmes.js";
import { withWorldTransaction, type TransactionPool } from "../../src/db/transaction.js";
import { defaults } from "../../src/domain/show-calendar.js";
import { storyBlueprint } from "../../src/domain/story-blueprints.js";
import type { AiProgramme } from "../../src/domain/ai-programmes.js";

export async function prepareAiManagerPlaytest(pool: TransactionPool, worldId: string, playerId: string) {
 await withWorldTransaction(pool, async tx => {
  await tx.query("INSERT INTO ppw_players(player_id) VALUES($1)", [playerId]);
  await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status) VALUES($1,$2,'ACTIVE')", [worldId, playerId]);
  await tx.query("INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id) VALUES($1,$2,'promotion-7')", [worldId, playerId]);
  await tx.query("UPDATE ppw_promotions SET management_mode='HUMAN' WHERE world_id=$1 AND promotion_id='promotion-7'", [worldId]);
  await tx.query(`UPDATE ppw_people SET weekly_service_capacity=
   CASE career_stage WHEN 'SPECIAL_ATTRACTION' THEN 1 WHEN 'PROSPECT' THEN 3 ELSE 2 END
   WHERE world_id=$1`, [worldId]);
  await tx.query(`UPDATE ppw_contracts SET expires_week_index=40,
   remaining_dates=CASE WHEN family='EXCLUSIVE' THEN NULL ELSE 22 END,date_entitlement=22
   WHERE world_id=$1 AND person_id IN ('person-193','person-217','person-10','person-26','person-4',
    'person-28','person-3','person-27','person-51')`, [worldId]);
  await tx.query("UPDATE ppw_people SET presentation=93,recognition=75 WHERE world_id=$1 AND person_id IN ('person-4','person-28')", [worldId]);
  const event = defaults("AEW",1,13).find(s => s.name==="Revolution")!;
  assert.ok(event);
  await tx.query(`INSERT INTO ppw_annual_premium_plans(world_id,promotion_id,year,events,tier_at_commit,confirmed_week_index)
   VALUES($1,'promotion-1',1,$2::jsonb,'NATIONAL',0)`,
   [worldId,JSON.stringify([{seriesId:event.seriesId,week:9}])]);
  await tx.query(`INSERT INTO ppw_tag_teams(world_id,team_id,name,status)
   VALUES($1,'turning-point','The Heatseekers','ACTIVE'),($1,'faction-tag','Syndicate Pair','ACTIVE'),
    ($1,'tag-opponents','The Reinforcements','ACTIVE')`, [worldId]);
  await tx.query(`INSERT INTO ppw_tag_team_members(world_id,team_id,person_id) VALUES
   ($1,'turning-point','person-4'),($1,'turning-point','person-28'),
   ($1,'faction-tag','person-3'),($1,'faction-tag','person-27'),
   ($1,'tag-opponents','person-52'),($1,'tag-opponents','person-76')`,[worldId]);
  await tx.query(`UPDATE ppw_stable_memberships SET person_id=CASE membership_id
   WHEN 'audit-2' THEN 'person-27' ELSE 'person-51' END
   WHERE world_id=$1 AND membership_id IN ('audit-2','audit-3')`,[worldId]);
  await tx.query(`INSERT INTO ppw_championship_reigns(world_id,promotion_id,championship_id,reign_id,holder_type,person_id,status,start_week_index)
   VALUES($1,'promotion-2','founding:singles','review-reign','PERSON','person-26','ACTIVE',0);
  `, [worldId]);
  await tx.query(`UPDATE ppw_championships SET current_reign_id='review-reign'
   WHERE world_id=$1 AND promotion_id='promotion-2' AND championship_id='founding:singles'`,[worldId]);
  const scenario = [
   {promotionId:"promotion-1",programmeId:"aew-spotlight",blueprint:"JEALOUSY",format:"RIVALRY",
    sideA:["person-193"],sideB:["person-217"]},
   {promotionId:"promotion-2",programmeId:"vacant-chase",blueprint:"TITLE_CHASE",format:"RIVALRY",
    sideA:["person-10"],sideB:["person-26"],championshipId:"founding:singles"},
   {promotionId:"promotion-3",programmeId:"syndicate",blueprint:"FACTION_CIVIL_WAR",format:"FACTION",
    sideA:["person-3","person-27","person-51"],sideB:[]},
   {promotionId:"promotion-4",programmeId:"heatseekers",blueprint:"BETRAYAL",format:"RELATIONSHIP",
    sideA:["person-4","person-28"],sideB:[]},
  ] as const;
  await insertAiProgrammes(tx,{worldId,year:1,week:1,weekIndex:0},scenario.map(s=>{
   const blueprint=storyBlueprint(s.blueprint)!;
   const programme:AiProgramme={
    programmeId:s.programmeId,format:s.format,sideA:[...s.sideA],sideB:[...s.sideB],
    championshipId:"championshipId" in s?s.championshipId:null,
    intent:{blueprintId:blueprint.id,motivation:blueprint.motivation,audienceGoal:blueprint.desiredFeeling,destination:"Settle the on-air story"},
    started:0,angleCount:0,matchCount:0,lastWeek:null,lastCrowd:null,lastFinish:null,lastWinnerSide:null,
   };
   return {promotionId:s.promotionId,programme};
  }));
 });
}

/** Publish the manager's actual card through the same actor APIs as the host. */
export async function bookAiPlaytestHumanCard(pool: TransactionPool, worldId: string, playerId: string, index: number) {
 const year=Math.floor(index/52)+1,week=index%52+1;
 const showId="manager-tv-"+index;
 const promotionId="promotion-7";
 const byDivision=await withWorldTransaction(pool,async tx=>{
  const contenders=await tx.query<{person_id:string;contract_id:string}>(`
   SELECT DISTINCT ON (p.person_id) p.person_id,c.contract_id
   FROM ppw_contracts c JOIN ppw_people p USING(world_id,person_id)
   WHERE c.world_id=$1 AND c.promotion_id=$2 AND c.status='SIGNED'
    AND c.start_week_index<=$3 AND c.expires_week_index>=$3
    AND (c.remaining_dates>0 OR c.family='EXCLUSIVE' AND c.remaining_dates IS NULL)
    AND p.status='ACTIVE' AND p.booking_division='MEN'
   ORDER BY p.person_id,c.contract_id LIMIT 24
  `,[worldId,promotionId,index]);
  await tx.query(`INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week,status,
    show_day,venue_id,market_id,booking_class,event_type,event_importance,show_name)
   VALUES($1,$2,$3,$4,$5,'DRAFT',3,'venue-3','market-3','REGULAR','REGULAR',65,'Manager Weekly')`,
   [worldId,showId,promotionId,year,week]);
  return contenders;
 });
 const starters=byDivision.length>=2?byDivision.slice((index*2)%(byDivision.length-1)).slice(0,2):[];
 assert.equal(starters.length,2);
 const participants=starters.map(p=>({personId:p.person_id,contractId:p.contract_id}));
 const revision=async()=>Number((await withWorldTransaction(pool,tx=>
  tx.query<{ revision:string }>("SELECT revision FROM ppw_worlds WHERE world_id=$1",[worldId])))[0]!.revision);
 const scope={worldId,playerId,promotionId,showId};
 const context={pool,actor:{playerId}};
 assert.equal((await chooseShowMarketAsActor(context,{...scope,requestId:"finance-"+index,
  expectedRevision:await revision(),venueId:"venue-3",marketId:"market-3",ticketStrategy:"STANDARD"})).status,"APPLIED");
 const winner=index%2===0?"B":"A";
 const save=await saveCardEditorAsActor(context,{...scope,requestId:"script-"+index,expectedRevision:await revision(),
  matches:[{slotId:"main",payload:{matchType:"SINGLES",family:"INDIVIDUAL",participants,
   sides:[{sideId:"A",participants:[participants[0]!]},{sideId:"B",participants:[participants[1]!]}],
   scriptedWinnerSide:winner,intent:"TECHNICAL",plannedFinish:"SUBMISSION",plannedLengthMinutes:15}}],
  segments:[],runningOrder:["main"]});
 assert.equal(save.status,"APPLIED");
 assert.equal((await markPreparedShowReadyAsActor(context,{...scope,requestId:"ready-"+index,
  expectedRevision:await revision(),confirmReadyToRun:true})).status,"APPLIED");
 return {showId,winner};
}
