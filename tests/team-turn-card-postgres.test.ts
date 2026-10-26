import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {showCardEditorAsActor,saveCardEditorAsActor} from "../src/api/world-service.js";

const url=process.env.PPW_NEON_TEST_URL;
test("real PostgreSQL card rejects arbitrary double turns and accepts named tag-team turns",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const db=postgresPool(url!,3),id=randomUUID();
 const world="turn-pair-"+id,player="owner-"+id,promotion="crown",show="friday";
 const names=["Joe","Riddle","Alex","Sabin","Another"];
 const pair=(n:number)=>({personId:"p"+n,contractId:"deal-"+n});
 const bout={matchType:"SINGLES",family:"INDIVIDUAL",
  participants:[pair(0),pair(1)],
  sides:[{sideId:"A",participants:[pair(0)]},{sideId:"B",participants:[pair(1)]}],
  scriptedWinnerSide:"A",plannedFinish:"CLEAN_PIN",intent:"COMPETITIVE",
  plannedLengthMinutes:15};
 const segment=(ids:number[])=>({kind:"TURN",actorIds:ids.map(n=>"p"+n),
  targetIds:[],participants:ids.map(pair),outcome:"HAPPENS" as const,
  durationMinutes:5,turnTargetAlignment:"HEEL"});
 const context={pool:db.pool,actor:{playerId:player}};
 const identity={worldId:world,promotionId:promotion,showId:show};
 const save=(ids:number[],requestId:string)=>saveCardEditorAsActor(context,{
  ...identity,requestId,expectedRevision:0,
  matches:[{slotId:"bout",payload:bout}],
  segments:[{slotId:"turn",payload:segment(ids)}],
  runningOrder:["bout","turn"]});
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:world,name:"Team Turn Test",seed:41,rulesetVersion:"test"});
   await addPromotion(tx,world,{id:promotion,name:"Crown",tier:"LOCAL"});
   await tx.query("INSERT INTO ppw_players(player_id) VALUES($1)",[player]);
   await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status) VALUES($1,$2,'ACTIVE')",[world,player]);
   await tx.query("INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id) VALUES($1,$2,$3)",[world,player,promotion]);
   await tx.query("INSERT INTO ppw_markets(world_id,market_id,name,audience_potential,wrestling_interest,spending_index) VALUES($1,'home','Home',65,75,100)",[world]);
   await tx.query("INSERT INTO ppw_venues(world_id,venue_id,name,market_id) VALUES($1,'arena','Arena','home')",[world]);
   for(let n=0;n<5;n++){
    await tx.query("INSERT INTO ppw_people(world_id,person_id,name,booking_division,default_alignment) VALUES($1,$2,$3,'MEN','FACE')",
     [world,"p"+n,names[n]]);
    await tx.query("INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,family,status,remaining_dates,expires_week_index) VALUES($1,$2,$3,$4,'LIMITED_NON_EXCLUSIVE','SIGNED',5,52)",
     [world,"deal-"+n,"p"+n,promotion]);
   }
   await tx.query("INSERT INTO ppw_tag_teams(world_id,team_id,name,status) VALUES($1,'motor-city','Machine Guns','ACTIVE')",[world]);
   await tx.query("INSERT INTO ppw_tag_team_members(world_id,team_id,person_id,active) VALUES($1,'motor-city','p2',true),($1,'motor-city','p3',true)",[world]);
   await tx.query("INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week,status,show_day,venue_id,market_id,show_name,booking_class) VALUES($1,$2,$3,1,1,'DRAFT',5,'arena','home','Friday Live','REGULAR')",
    [world,show,promotion]);
  });
  const card=await showCardEditorAsActor(context,world,promotion,show);
  const realTeam=card.bookableTeams.find(t=>t.teamId==="motor-city");
  assert.equal(realTeam?.name,"Machine Guns");
  assert.deepEqual(realTeam?.members.map(p=>p.name),["Alex","Sabin"]);
  await assert.rejects(save([2,4],"forged-pair"),/same active tag team/);
  const valid=await save([2,3],"approved-pair");
  assert.equal(valid.status,"APPLIED");
  const completed=await showCardEditorAsActor(context,world,promotion,show);
  const turn=completed.slots.find(s=>s.slotId==="turn")?.payload as
   {kind:string;actorIds:string[];turnTargetAlignment:string}|undefined;
  assert.equal(turn?.kind,"TURN");
  assert.deepEqual(turn?.actorIds,["p2","p3"]);
  assert.equal(turn?.turnTargetAlignment,"HEEL");
 }finally{await db.close();}
});
