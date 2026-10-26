import test from "node:test";
import assert from "node:assert/strict";
import {newEditorSegment,addSegmentPerson,buildEditorSegment,restoreEditorSegment}
 from "../src/ui/card-segment-model.js";
test("author-owned confrontation survives editor roundtrip",()=>{
 let s=newEditorSegment("fight","CONFRONTATION");
 s=addSegmentPerson(s,"actors",{personId:"a",contractId:"ca"});
 s=addSegmentPerson(s,"targets",{personId:"b",contractId:"cb"});
 s.outcome="REFUSED";
 const payload=buildEditorSegment(s);
 assert.equal(payload.outcome,"REFUSED");
 assert.deepEqual(payload.actorIds,["a"]);
 assert.deepEqual(payload.targetIds,["b"]);
 assert.deepEqual(buildEditorSegment(restoreEditorSegment("fight",payload)),payload);
});
test("an angle needs declared role and no double-cast",()=>{
 let s=newEditorSegment("s","ATTACK");
 assert.throws(()=>buildEditorSegment(s),/roles/);
 s=addSegmentPerson(s,"actors",{personId:"a",contractId:"ca"});
 assert.throws(()=>addSegmentPerson(s,"targets",{personId:"a",contractId:"ca"}),/two roles/);
 assert.throws(()=>buildEditorSegment(s),/roles/);
});
test("original promo, interview and challenge book as real segments",()=>{
 for(const kind of ["PROMO","INTERVIEW","CELEBRATION","CHALLENGE"] as const){
  let s=newEditorSegment(kind,kind);
  s=addSegmentPerson(s,"actors",{personId:"a",contractId:"ca"});
  if(kind==="CHALLENGE")s=addSegmentPerson(s,"targets",{personId:"b",contractId:"cb"});
  assert.equal(buildEditorSegment(s).kind,kind);
 }
});

test("legacy promo with contracted speaker restores editable roles",()=>{
 const legacy={kind:"PROMO",outcome:"HAPPENS",
  participants:[{personId:"speaker",contractId:"signed"}]};
 const restored=restoreEditorSegment("old",legacy);
 assert.equal(restored.actors[0]!.personId,"speaker");
 assert.equal(buildEditorSegment(restored).actorIds[0],"speaker");
});
test("programme selection belongs to angle editor and never alters scripted outcome",()=>{
 const input={...newEditorSegment("promo"),programmeId:"rivalry"};
 const participant=addSegmentPerson(input,"actors",{personId:"speaker",contractId:"signed"});
 assert.equal(participant.programmeId,"rivalry");
 assert.equal(buildEditorSegment(participant).outcome,"HAPPENS");
});

test("new stable invitation keeps authored target and owned stable identity",()=>{
 let s=newEditorSegment("invite","STABLE_INVITATION");
 s=addSegmentPerson(s,"actors",{personId:"leader",contractId:"leader-deal"});
 s=addSegmentPerson(s,"targets",{personId:"prospect",contractId:"prospect-deal"});
 assert.throws(()=>buildEditorSegment(s),/Choose a stable/);
 s.stableId="stable-one";
 s.stableDecision="ACCEPTED";
 const p=buildEditorSegment(s);
 assert.equal(p.stableId,"stable-one");
 assert.equal(p.outcome,"HAPPENS");
 assert.deepEqual(p.targetIds,["prospect"]);
 assert.equal(restoreEditorSegment("invite",p).stableId,"stable-one");
});

test("faction invitation requires a player-scripted answer before booking",()=>{
 let s=newEditorSegment("story","STABLE_INVITATION");
 s.stableId="stable-one";
 s=addSegmentPerson(s,"actors",{personId:"leader",contractId:"leader-deal"});
 s=addSegmentPerson(s,"targets",{personId:"prospect",contractId:"prospect-deal"});
 assert.throws(()=>buildEditorSegment(s),/accepts or rejects/);
 s.stableDecision="REJECTED";
 const booked=buildEditorSegment(s);
 assert.equal(booked.stableDecision,"REJECTED");
 assert.equal(restoreEditorSegment("story",booked).stableDecision,"REJECTED");
});

test("seven original-main specialist angle deliveries survive saves and reopening",()=>{
 const choices=[
  ["PROMO",{kind:"PROMO",purpose:"AIR_GRIEVANCE"}],
  ["INTERVIEW",{kind:"INTERVIEW",format:"SIT_DOWN",topic:"RECENT_FORM",response:"DEFIANT"}],
  ["CELEBRATION",{kind:"CELEBRATION",occasion:"SELF_CORONATION",ending:"POSE"}],
  ["CONFRONTATION",{kind:"CONFRONTATION",ending:"RELUCTANT_HANDSHAKE"}],
  ["CHALLENGE",{kind:"CHALLENGE",response:"LEFT_OPEN"}],
  ["ATTACK",{kind:"ATTACK",presentation:"PULL_APART_BRAWL",objective:"ESCALATE_RIVALRY"}],
  ["CONTRACT_SIGNING",{kind:"CONTRACT_SIGNING",ending:"BRAWL"}]
 ] as const;
 for(const [kind,beat] of choices){
  let model=newEditorSegment("angle",kind);
  model=addSegmentPerson(model,"actors",{personId:"a",contractId:"ca"});
  if(kind==="CONTRACT_SIGNING")
   model=addSegmentPerson(model,"actors",{personId:"b",contractId:"cb"});
  else if(["ATTACK","CHALLENGE","CONFRONTATION"].includes(kind))
   model=addSegmentPerson(model,"targets",{personId:"b",contractId:"cb"});
  model.creativeBeat=beat;
  const saved=buildEditorSegment(model);
  assert.deepEqual(saved.creativeBeat,beat);
  assert.deepEqual(buildEditorSegment(restoreEditorSegment("angle",saved)),saved);
 }
});
test("older interview remains unscripted but new ones offer full creative direction",()=>{
 const old={kind:"INTERVIEW",outcome:"HAPPENS",
  participants:[{personId:"a",contractId:"ca"}],actorIds:["a"],targetIds:[]};
 assert.equal(restoreEditorSegment("old",old).creativeBeat,null);
 let fresh=newEditorSegment("fresh","INTERVIEW");
 fresh=addSegmentPerson(fresh,"actors",{personId:"a",contractId:"ca"});
 assert.ok(buildEditorSegment(fresh).creativeBeat);
});

test("interruption, rescue and post-match assault retain explicitly directed roles",()=>{
 const actor=(id:string)=>({personId:id,contractId:"deal-"+id});
 for(const kind of ["INTERRUPTION","RESCUE","POST_MATCH_ASSAULT"] as const){
  let scene=newEditorSegment("scene",kind);
  assert.ok(scene.creativeBeat,"New specialist angles must have an authored ending");
  scene=addSegmentPerson(scene,"actors",actor("attacker"));
  if(kind==="RESCUE"){
   assert.throws(()=>buildEditorSegment(scene),/roles/);
   scene=addSegmentPerson(scene,"actors",actor("rescuer"));
   assert.throws(()=>addSegmentPerson(scene,"actors",actor("extra")),/capacity/);
  }else assert.throws(()=>addSegmentPerson(scene,"actors",actor("extra")),/lead wrestler/);
  scene=addSegmentPerson(scene,"targets",actor("victim"));
  assert.throws(()=>addSegmentPerson(scene,"targets",actor("extra")),/capacity/);
  if(kind==="POST_MATCH_ASSAULT"){
   assert.throws(()=>buildEditorSegment(scene),/Invalid authored segment/);
   scene.sourceMatchSlotId="earlier-match";
  }
  const payload=buildEditorSegment(scene);
  assert.deepEqual(buildEditorSegment(restoreEditorSegment("scene",payload)),payload);
  assert.equal(payload.outcome,"HAPPENS");
  assert.equal(payload.actorIds[0],"attacker");
  assert.equal(payload.targetIds[0],"victim");
 }
});

test("booker cannot cast targets into targetless scenes or exceed the shared 30-person limit",()=>{
 const p=(id:string)=>({personId:id,contractId:"contract-"+id});
 for(const kind of ["PROMO","INTERVIEW","CELEBRATION","CONTRACT_SIGNING","DEBUT"] as const){
  const scene=newEditorSegment("scene",kind);
  assert.throws(()=>addSegmentPerson(scene,"targets",p("intruder")),/no target role/);
 }
 let confrontation=newEditorSegment("crowd","CONFRONTATION");
 for(let i=0;i<20;i++)
  confrontation=addSegmentPerson(confrontation,"actors",p("actor-"+i));
 for(let i=0;i<10;i++)
  confrontation=addSegmentPerson(confrontation,"targets",p("target-"+i));
 assert.throws(()=>addSegmentPerson(confrontation,"targets",p("overflow")),/more than 30/);
 assert.equal(buildEditorSegment(confrontation).participants.length,30);
});
test("specialist angle performer capacity remains explicit",()=>{
 const person=(id:string)=>({personId:id,contractId:"contract-"+id});
 let rescue=newEditorSegment("save","RESCUE");
 rescue=addSegmentPerson(rescue,"actors",person("attacker"));
 rescue=addSegmentPerson(rescue,"actors",person("rescuer"));
 assert.throws(()=>addSegmentPerson(rescue,"actors",person("third")),/capacity/);
 let debut=newEditorSegment("arrival","DEBUT");
 debut=addSegmentPerson(debut,"actors",person("entrant"));
 assert.throws(()=>addSegmentPerson(debut,"actors",person("second")),/lead wrestler/);
});

test("original live arrival reveals and objectives survive canonical save and reload",()=>{
 let arrival=newEditorSegment("debut","DEBUT");
 arrival=addSegmentPerson(arrival,"actors",{personId:"newcomer",contractId:"appearance"});
 arrival.creativeBeat={kind:"DEBUT",presentation:"SURPRISE_REVEAL",
  objective:"UNSETTLE_RIVAL"};
 const saved=buildEditorSegment(arrival);
 assert.equal(saved.outcome,"HAPPENS");
 assert.deepEqual(saved.actorIds,["newcomer"]);
 assert.deepEqual(saved.creativeBeat,arrival.creativeBeat);
 assert.deepEqual(buildEditorSegment(restoreEditorSegment("debut",saved)),saved);
 assert.throws(()=>buildEditorSegment({...arrival,creativeBeat:{
  kind:"DEBUT",presentation:"UNSCRIPTED",objective:"UNSETTLE_RIVAL"
 } as never}),/Invalid|creative|segment/i);
});


test("a complete two-person tag team can turn together while scripted direction survives reloading",()=>{
 let turn=newEditorSegment("team-turn","TURN");
 turn=addSegmentPerson(turn,"actors",{personId:"a",contractId:"ca"});
 turn=addSegmentPerson(turn,"actors",{personId:"b",contractId:"cb"});
 assert.throws(()=>addSegmentPerson(turn,"actors",{personId:"c",contractId:"cc"}),/capacity/);
 turn.turnTargetAlignment="FACE";
 const saved=buildEditorSegment(turn);
 assert.deepEqual(saved.actorIds,["a","b"]);
 assert.equal(saved.turnTargetAlignment,"FACE");
 assert.deepEqual(buildEditorSegment(restoreEditorSegment("team-turn",saved)),saved);
});
