import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {joinWorld} from "../src/db/membership-operations.js";
import {submitPromotionClaim} from "../src/db/promotion-commands.js";
import {readWorldMail,markWorldMailRead} from "../src/db/backstage-world-mail.js";
import {worldStaff} from "../src/domain/world-staff.js";

const url=process.env.PPW_NEON_TEST_URL;
test("solo, relationship and faction reactions require certified linked cast, respect ownership, and keep read receipts",
 {skip:!url?"No disposable PostgreSQL":false},async()=>{
 const suffix=randomUUID(),worldId="story-reaction-"+suffix,
  promotionId="cwa-"+suffix,rivalId="other-"+suffix,playerId="booker-"+suffix;
 const scope={worldId,promotionId,playerId};
 const db=postgresPool(url!,4),showId="story-card-"+suffix;
 const ids=Array.from({length:4},(_,i)=>"cast-"+i+"-"+suffix);
 const chapters=[
  {programmeId:"solo-"+suffix,format:"SOLO",speaker:ids[0]!,crowd:78,position:0},
  {programmeId:"relationship-"+suffix,format:"RELATIONSHIP",speaker:ids[1]!,crowd:52,position:1},
  {programmeId:"faction-"+suffix,format:"FACTION",speaker:ids[2]!,crowd:30,position:2},
 ] as const;
 const creative=worldStaff("123").find(s=>s.role==="CREATIVE")!;
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:worldId,name:"Certified Story Backstage",seed:123,rulesetVersion:"test"});
   await addPromotion(tx,worldId,{id:promotionId,name:"CWA",tier:"LOCAL"});
   await addPromotion(tx,worldId,{id:rivalId,name:"Rival",tier:"LOCAL"});
   for(const [i,personId] of ids.entries()){
    await tx.query("INSERT INTO ppw_people(world_id,person_id,name) VALUES($1,$2,$3)",
     [worldId,personId,"Character "+(i+1)]);
    await tx.query("INSERT INTO ppw_contracts"+
     "(world_id,contract_id,person_id,promotion_id,family,status,remaining_dates,expires_week_index)"+
     " VALUES($1,$2,$3,$4,'EXCLUSIVE','SIGNED',NULL,52)",
     [worldId,"signed-"+i+"-"+suffix,personId,promotionId]);
   }
   await tx.query("INSERT INTO ppw_staff_employments"+
    "(world_id,employment_id,staff_id,promotion_id,role,status,weekly_salary,"+
    "start_week_index,expires_week_index,term_weeks,morale)"+
    " VALUES($1,$2,$3,$4,'CREATIVE','ACTIVE',500,0,51,52,70)",
    [worldId,"creative-"+suffix,creative.staffId,promotionId]);
   await tx.query("INSERT INTO ppw_booking_drafts"+
    "(world_id,draft_id,promotion_id,year,week,status,show_name)"+
    " VALUES($1,$2,$3,1,1,'DRAFT','Our First Chapter')",
    [worldId,showId,promotionId]);
   for(const chapter of chapters){
    await tx.query("INSERT INTO ppw_programmes"+
     "(world_id,promotion_id,programme_id,status,programme_format,repetition,heat,started_week_index)"+
     " VALUES($1,$2,$3,'ACTIVE',$4,0,50,0)",
     [worldId,promotionId,chapter.programmeId,chapter.format]);
    await tx.query("INSERT INTO ppw_programme_participants"+
     "(world_id,promotion_id,programme_id,person_id,side)"+
     " VALUES($1,$2,$3,$4,'A')",
     [worldId,promotionId,chapter.programmeId,chapter.speaker]);
    const slotId="scene-"+chapter.position;
    await tx.query("INSERT INTO ppw_card_slots"+
     "(world_id,draft_id,slot_id,position,kind,payload)"+
     " VALUES($1,$2,$3,$4,'SEGMENT',$5::jsonb)",
     [worldId,showId,slotId,chapter.position,JSON.stringify({
      kind:"INTERVIEW",outcome:"HAPPENS",actorIds:[chapter.speaker],
      targetIds:chapter.position===0?[ids[3]!]:[],
      targetPresence:chapter.position===0?"MENTIONED":"ON_SCREEN",
      participants:[
       {personId:chapter.speaker,contractId:"signed-"+ids.indexOf(chapter.speaker)+"-"+suffix},
       ...(chapter.position===0?[{personId:ids[3]!,contractId:"signed-3-"+suffix}]:[])
      ],
      scene:{location:"INTERVIEW_AREA",purpose:"BUILD_CHARACTER"},
     })]);
    await tx.query("INSERT INTO ppw_programme_match_activities"+
     "(world_id,promotion_id,programme_id,draft_id,slot_id,kind)"+
     " VALUES($1,$2,$3,$4,$5,'SEGMENT')",
     [worldId,promotionId,chapter.programmeId,showId,slotId]);
   }
   // A named-only target is not a performer and must not be given a voice.
   const unrelated="unrelated-"+suffix;
   await tx.query("INSERT INTO ppw_programmes"+
    "(world_id,promotion_id,programme_id,status,programme_format,repetition,heat)"+
    " VALUES($1,$2,$3,'ACTIVE','SOLO',0,50)",
    [worldId,promotionId,unrelated]);
   await tx.query("INSERT INTO ppw_programme_participants"+
    "(world_id,promotion_id,programme_id,person_id,side)"+
    " VALUES($1,$2,$3,$4,'A')",[worldId,promotionId,unrelated,ids[3]]);
   await tx.query("INSERT INTO ppw_programme_match_activities"+
    "(world_id,promotion_id,programme_id,draft_id,slot_id,kind)"+
    " VALUES($1,$2,$3,$4,'scene-0','SEGMENT')",
    [worldId,promotionId,unrelated,showId]);
  });
  assert.equal((await joinWorld(db.pool,{worldId,playerId,
   requestId:"join-"+suffix,expectedRevision:0})).status,"APPLIED");
  assert.equal((await submitPromotionClaim(db.pool,{worldId,playerId,promotionId,
   requestId:"claim-"+suffix,expectedRevision:1})).status,"APPLIED");
  const unread=async()=>withWorldTransaction(db.pool,tx=>readWorldMail(tx,scope));
  assert.equal((await unread()).filter(m=>m.storyChapter).length,0,
   "Draft angles and saved links cannot trigger earned messages");
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query("UPDATE ppw_booking_drafts SET status='SUBMITTED'"+
    " WHERE world_id=$1 AND draft_id=$2",[worldId,showId]);
   await tx.query("INSERT INTO ppw_completed_shows"+
    "(world_id,promotion_id,show_id,year,week,resolution_id,crowd_response,receipt_json,receipt_digest)"+
    " VALUES($1,$2,$3,1,1,$4,58,'{}'::jsonb,$5)",
    [worldId,promotionId,showId,"resolution-"+suffix,"0".repeat(64)]);
   for(const chapter of chapters){
    const slotId="scene-"+chapter.position;
    await tx.query("INSERT INTO ppw_completed_show_segments"+
     "(world_id,show_id,slot_id,position,kind,authored_outcome,crowd_response)"+
     " VALUES($1,$2,$3,$4,'INTERVIEW','HAPPENS',$5)",
     [worldId,showId,slotId,chapter.position,chapter.crowd]);
    await tx.query("INSERT INTO ppw_programme_resolved_activities"+
     "(world_id,promotion_id,programme_id,show_id,slot_id,week_index,kind,signature,crowd_response,impact)"+
     " VALUES($1,$2,$3,$4,$5,0,'SEGMENT',$6,$7,60)",
     [worldId,promotionId,chapter.programmeId,showId,slotId,
      "verified-"+slotId,chapter.crowd]);
   }
   // A linked character was only mentioned by an on-screen actor: never invent their voice.
   await tx.query("INSERT INTO ppw_programme_resolved_activities"+
    "(world_id,promotion_id,programme_id,show_id,slot_id,week_index,kind,signature,crowd_response,impact)"+
    " VALUES($1,$2,$3,$4,'scene-0',0,'SEGMENT','unrelated',78,60)",
    [worldId,promotionId,"unrelated-"+suffix,showId]);
   const finale=chapters[2]!;
   await tx.query("INSERT INTO ppw_programme_finales"+
    "(world_id,promotion_id,programme_id,show_id,slot_id,kind,payoff,"+
    "planned_week_index,resolved_week_index,resolved_crowd_response)"+
    " VALUES($1,$2,$3,$4,'scene-2','SEGMENT','FINAL_CHAPTER',0,0,30)",
    [worldId,promotionId,finale.programmeId,showId]);
   await tx.query("UPDATE ppw_programmes SET status='COMPLETED',ended_week_index=0"+
    " WHERE world_id=$1 AND promotion_id=$2 AND programme_id=$3",
    [worldId,promotionId,finale.programmeId]);
  });
  const messages=(await unread()).filter(m=>m.storyChapter);
  assert.equal(messages.length,6,"Exactly three actual performers and three Creative reviews");
  const wrestlers=messages.filter(m=>m.kind==="LOCKER_ROOM");
  const staff=messages.filter(m=>m.kind==="STAFF");
  assert.equal(wrestlers.length,3);assert.equal(staff.length,3);
  assert.deepEqual(wrestlers.map(m=>m.sender).sort(),
   ["Character 1","Character 2","Character 3"]);
  assert.ok(wrestlers.some(m=>m.body.includes("relationship story")));
  assert.ok(wrestlers.some(m=>m.body.includes("That story is finished")));
  assert.ok(staff.some(m=>m.body.includes("The faction story")));
  assert.ok(staff.some(m=>m.body.includes("approved ending was certified")));
  assert.ok(staff.every(m=>m.sender===creative.name));
  assert.ok(messages.every(m=>m.action==="PROGRAMMES"&&!m.canStaffRespond));
  assert.ok(messages.every(m=>!m.read));
  const first=wrestlers[0]!;
  assert.deepEqual(await markWorldMailRead(db.pool,{...scope,mailId:first.id}),{readCount:1});
  assert.deepEqual(await markWorldMailRead(db.pool,{...scope,mailId:first.id}),{readCount:0});
  const reopened=(await unread()).filter(m=>m.storyChapter);
  assert.equal(reopened.find(m=>m.id===first.id)?.read,true);
  assert.equal(reopened.filter(m=>m.read).length,1);
  assert.deepEqual(await withWorldTransaction(db.pool,tx=>readWorldMail(tx,
   {...scope,promotionId:rivalId})),[],
   "Another promotion cannot read a manager's story correspondence");
  // Even an anomalous stale resolved link cannot speak for a refused scene.
  await withWorldTransaction(db.pool,tx=>tx.query(
   "UPDATE ppw_completed_show_segments SET authored_outcome='REFUSED'"+
   " WHERE world_id=$1 AND show_id=$2 AND slot_id='scene-0'",[worldId,showId]));
  const afterRefusal=(await unread()).filter(m=>m.storyChapter);
  assert.equal(afterRefusal.length,4);
  assert.ok(afterRefusal.every(m=>!m.body.includes("Character 1")));
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_player_attention_dismissals","ppw_programme_finales",
    "ppw_programme_resolved_activities","ppw_completed_show_segments",
    "ppw_completed_shows","ppw_programme_match_activities","ppw_card_slots",
    "ppw_booking_drafts","ppw_programme_participants","ppw_programme_side_refs",
    "ppw_programmes","ppw_staff_employments","ppw_command_receipts",
    "ppw_contracts","ppw_people","ppw_promotion_controls","ppw_memberships",
    "ppw_promotions"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[playerId]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
  }).finally(()=>db.close());
 }
});
