import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {readPublicCompletedShow} from "../src/db/public-completed-show.js";
import {readCompletedShowView} from "../src/db/show-results-view.js";

const url=process.env.PPW_NEON_TEST_URL;
test("real PostgreSQL permits only completed rival human results and never rival private ringside",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const db=postgresPool(url!,3),id=randomUUID(),world="public-"+id;
 const viewer="viewer-"+id,rival="rival-"+id;
 const sides=[{sideId:"A",participants:[{personId:"joe",contractId:"joe-deal"}]},
  {sideId:"B",participants:[{personId:"riddle",contractId:"riddle-deal"}]}];
 const booked={matchType:"SINGLES",family:"INDIVIDUAL",
  participants:sides.flatMap(s=>s.participants),sides,
  scriptedWinnerSide:"A",plannedFinish:"CLEAN_PIN",
  intent:"COMPETITIVE",plannedLengthMinutes:14};
 const receipt={worldId:world,promotionId:"their-company",showId:"completed",
  year:1,week:1,resolutionId:"final",crowdResponse:84,
  matches:[{matchId:"main",position:0,crowdResponse:90,
   actualFinish:"SUBMISSION",actualWinnerSide:"B"}],segments:[]};
 const request={worldId:world,playerId:viewer,
  viewerPromotionId:"my-company",targetPromotionId:"their-company",showId:"completed"};
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:world,name:"Public Completed CI",seed:12,rulesetVersion:"test"});
   await addPromotion(tx,world,{id:"my-company",name:"Mine",tier:"LOCAL"});
   await addPromotion(tx,world,{id:"their-company",name:"Theirs",tier:"LOCAL"});
   for(const p of [viewer,rival]){
    await tx.query("INSERT INTO ppw_players(player_id) VALUES($1)",[p]);
    await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status) VALUES($1,$2,'ACTIVE')",
     [world,p]);
   }
   await tx.query("INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id) VALUES($1,$2,'my-company'),($1,$3,'their-company')",
    [world,viewer,rival]);
   await tx.query("INSERT INTO ppw_markets(world_id,market_id,name,audience_potential,wrestling_interest,spending_index) VALUES($1,'home','Home',65,75,100)",[world]);
   await tx.query("INSERT INTO ppw_venues(world_id,venue_id,name,market_id) VALUES($1,'arena','Arena','home')",[world]);
   for(const name of ["Joe","Riddle"]){
    const pid=name.toLowerCase();
    await tx.query("INSERT INTO ppw_people(world_id,person_id,name,booking_division) VALUES($1,$2,$3,'MEN')",
     [world,pid,name]);
   }
   await tx.query("INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week,status,show_day,venue_id,market_id,show_name,booking_class) VALUES($1,'completed','their-company',1,1,'SUBMITTED',5,'arena','home','Rival Slam','REGULAR'),($1,'upcoming','their-company',1,2,'DRAFT',5,'arena','home','SECRET FUTURE CARD','REGULAR')",
    [world]);
   await tx.query("INSERT INTO ppw_card_slots(world_id,draft_id,slot_id,position,kind,payload) VALUES($1,'completed','main',0,'MATCH',$2::jsonb)",
    [world,JSON.stringify(booked)]);
   await tx.query("INSERT INTO ppw_completed_shows(world_id,promotion_id,show_id,year,week,resolution_id,crowd_response,receipt_json,receipt_digest) VALUES($1,'their-company','completed',1,1,'final',84,$2::jsonb,repeat('a',64))",
    [world,JSON.stringify(receipt)]);
  });
  const published=await readPublicCompletedShow(db.pool,request);
  assert.equal(published.showName,"Rival Slam");
  assert.equal(published.entries[0]?.winner,"Riddle");
  assert.equal(published.entries[0]?.outcome,"SUBMISSION");
  assert.equal(published.entries[0]?.headline,"Joe vs Riddle");
  assert.equal("staffReport" in published,false);
  await assert.rejects(readPublicCompletedShow(db.pool,{...request,showId:"upcoming"}),/unavailable/);
  await assert.rejects(readPublicCompletedShow(db.pool,{...request,targetPromotionId:"my-company"}),/rival/);
  await assert.rejects(readCompletedShowView(db.pool,{worldId:world,playerId:viewer,
   promotionId:"their-company",showId:"completed"}),/unavailable|controller/);
  await withWorldTransaction(db.pool,tx=>tx.query("UPDATE ppw_promotion_controls SET active=false WHERE world_id=$1 AND player_id=$2",[world,rival]));
  await assert.rejects(readPublicCompletedShow(db.pool,request),/unavailable/);
 }finally{await db.close();}
});
