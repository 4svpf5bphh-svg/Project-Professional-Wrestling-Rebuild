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
import {chooseBackstageStoryFollowUp} from "../src/db/backstage-story-follow-up.js";
import {saveProgrammeCreativeIntent} from "../src/db/programme-workspace.js";

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
  const solo=wrestlers.find(m=>m.storyProgrammeId===chapters[0]!.programmeId)!;
  const creativeOnSolo=staff.find(m=>m.storyProgrammeId===solo.storyProgrammeId)!;
  const finale=wrestlers.find(m=>m.storyProgrammeId===chapters[2]!.programmeId)!;
  assert.equal(solo.storySource?.sourceShowId,showId);
  assert.equal(solo.storySource?.sourceSlotId,"scene-0");
  assert.equal(solo.storySource?.crowdResponse,78);
  assert.equal(solo.storySource?.programmeFormat,"SOLO");
  assert.equal(solo.canChooseStoryFollowUp,true);
  assert.equal(creativeOnSolo.canChooseStoryFollowUp,true);
  assert.equal(finale.canChooseStoryFollowUp,undefined,
   "An already completed storyline cannot schedule a follow-up");
  await assert.rejects(chooseBackstageStoryFollowUp(db.pool,{
   ...scope,mailId:"backstage-world:"+"f".repeat(32),
   choice:"SLOW_BURN",requestId:"fake-"+suffix,expectedRevision:2}),
   /can no longer receive/,"A forged mail ID is never a creative command");
  const request={...scope,mailId:solo.id,choice:"CHANGE_PRESENTATION" as const,
   requestId:"reply-"+suffix,expectedRevision:2};
  const decided=await chooseBackstageStoryFollowUp(db.pool,request);
  assert.equal(decided.status,"APPLIED");
  assert.equal(decided.status==="APPLIED"?decided.result.programmeId:"",solo.storyProgrammeId);
  assert.equal((await chooseBackstageStoryFollowUp(db.pool,request)).status,"REPLAYED",
   "A network retry cannot produce a second choice or another World revision");
  const stored=await withWorldTransaction(db.pool,tx=>tx.query<{
   creative_intent:{blueprintId:string;followUp:{choice:string;sourceShowId:string;
    sourceSlotId:string;sourceWeekIndex:number}}}>(
    "SELECT creative_intent FROM ppw_programmes WHERE world_id=$1"+
    " AND promotion_id=$2 AND programme_id=$3",
    [worldId,promotionId,chapters[0]!.programmeId]));
  assert.equal(stored[0]!.creative_intent.blueprintId,"CUSTOM");
  assert.deepEqual(stored[0]!.creative_intent.followUp,{
   choice:"CHANGE_PRESENTATION",sourceShowId:showId,sourceSlotId:"scene-0",
   sourceWeekIndex:0});
  const confirmed=(await unread()).filter(m=>m.storyProgrammeId===solo.storyProgrammeId);
  assert.equal(confirmed.length,2);
  assert.ok(confirmed.every(m=>m.storyFollowUp==="CHANGE_PRESENTATION"&&
   !m.canChooseStoryFollowUp),
   "Wrestler and Creative both reflect one durable Programme decision");
  await assert.rejects(chooseBackstageStoryFollowUp(db.pool,{
   ...scope,mailId:solo.id,choice:"SLOW_BURN",
   requestId:"other-choice-"+suffix,expectedRevision:3}),
   /can no longer receive/);
  await assert.rejects(chooseBackstageStoryFollowUp(db.pool,{
   ...scope,mailId:finale.id,choice:"BUILD_ON_REACTION",
   requestId:"closed-story-"+suffix,expectedRevision:3}),
   /can no longer receive/);
  await assert.rejects(chooseBackstageStoryFollowUp(db.pool,{
   ...scope,promotionId:rivalId,mailId:solo.id,choice:"SLOW_BURN",
   requestId:"rival-"+suffix,expectedRevision:3}));
  const proof=await withWorldTransaction(db.pool,tx=>tx.query<{count:string}>(
   "SELECT count(*)::text AS count FROM ppw_ledger_events WHERE world_id=$1"+
   " AND event_type='BACKSTAGE_STORY_FOLLOW_UP_CHOSEN'",[worldId]));
  assert.equal(proof[0]!.count,"1","Exactly one audit event, not a booking");
  const originalSlots=await withWorldTransaction(db.pool,tx=>tx.query<{count:string}>(
   "SELECT count(*)::text AS count FROM ppw_card_slots WHERE world_id=$1",
   [worldId]));
  assert.equal(originalSlots[0]!.count,"3","No new match, angle or paid appearance was booked");
  // Story notes are editable, but the authenticated certified reply is not.
  // A malicious client cannot inject a fabricated reply through the older
  // creative-intent RPC or erase the genuine response while clearing text.
  const edited=await saveProgrammeCreativeIntent(db.pool,{
   ...scope,programmeId:solo.storyProgrammeId!,requestId:"edit-"+suffix,
   expectedRevision:3,creativeIntent:{
    blueprintId:"CUSTOM",motivation:"Refine the character",audienceGoal:"Respect",
    destination:"Next event",
    followUp:{choice:"SLOW_BURN",sourceShowId:"forged-show",
     sourceSlotId:"fake-slot",sourceWeekIndex:0}}});
  assert.equal(edited.status,"APPLIED");
  const savedNotes=await withWorldTransaction(db.pool,tx=>tx.query<{
   creative_intent:{followUp:{choice:string;sourceShowId:string};
    motivation:string;blueprintId:string}}>(
   "SELECT creative_intent FROM ppw_programmes WHERE world_id=$1"+
   " AND promotion_id=$2 AND programme_id=$3",
   [worldId,promotionId,solo.storyProgrammeId]));
  assert.equal(savedNotes[0]!.creative_intent.followUp.choice,"CHANGE_PRESENTATION");
  assert.equal(savedNotes[0]!.creative_intent.followUp.sourceShowId,showId);
  assert.equal(savedNotes[0]!.creative_intent.motivation,"Refine the character");
  const cleared=await saveProgrammeCreativeIntent(db.pool,{
   ...scope,programmeId:solo.storyProgrammeId!,requestId:"clear-"+suffix,
   expectedRevision:4,creativeIntent:null});
  assert.equal(cleared.status,"APPLIED");
  const afterClear=await withWorldTransaction(db.pool,tx=>tx.query<{
   creative_intent:{followUp:{choice:string};blueprintId:string;motivation:string}}>(
   "SELECT creative_intent FROM ppw_programmes WHERE world_id=$1"+
   " AND promotion_id=$2 AND programme_id=$3",
   [worldId,promotionId,solo.storyProgrammeId]));
  assert.equal(afterClear[0]!.creative_intent.followUp.choice,"CHANGE_PRESENTATION");
  assert.equal(afterClear[0]!.creative_intent.blueprintId,"CUSTOM");
  assert.equal(afterClear[0]!.creative_intent.motivation,"");

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
   for(const table of ["ppw_ledger_events","ppw_player_attention_dismissals","ppw_programme_finales",
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
