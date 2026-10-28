import test from "node:test";
import assert from "node:assert/strict";
import {APPROVED_LEGEND_EXPANSION} from "../src/domain/approved-legend-expansion.js";
import {APPROVED_LEGEND_MILESTONES} from "../src/domain/approved-legend-milestones.js";
import {APPROVED_LEGEND_PRIME_PROFILES,approvedPrimeLegend}
 from "../src/domain/approved-legend-prime-profiles.js";
import {PLANNED_LEGEND_DEFINITIONS}
 from "../src/domain/planned-legend-definitions.js";
import {PLANNED_LEGEND_ARTWORK}
 from "../src/domain/planned-legend-artwork.js";
import {LEGENDS_CATALOGUE,LIVE_LEGENDS}
 from "../src/domain/legends-catalogue.js";
import {validatePortablePersona,WRESTLING_STYLES}
 from "../src/domain/portable-persona.js";
const category=(style:string)=>
 style==="POWERHOUSE"?"POWER":style==="HIGH_FLYER"||style==="LUCHA"?"AERIAL":
 style==="TECHNICAL"?"GRAPPLE":style==="SUBMISSION"?"SUBMISSION":
 style==="STRIKER"?"STRIKE":"OTHER";

test("81 new Legends have genuinely distinct prime-era roster definitions, no auto-activation",()=>{
 assert.equal(LEGENDS_CATALOGUE.length,48);
 assert.equal(LIVE_LEGENDS.length,48);
 assert.equal(PLANNED_LEGEND_DEFINITIONS.length,81);
 assert.equal(APPROVED_LEGEND_PRIME_PROFILES.size,93);
 assert.deepEqual(PLANNED_LEGEND_DEFINITIONS.map(x=>x.name),
  APPROVED_LEGEND_EXPANSION.map(x=>x.name));
 const original=new Set(LEGENDS_CATALOGUE.map(x=>x.id));
 const clues=new Set<string>(),people=new Set<string>();
 const moves=new Set<string>();
 for(const [i,def] of PLANNED_LEGEND_DEFINITIONS.entries()){
  const agreed=APPROVED_LEGEND_EXPANSION[i]!;
  const metric=APPROVED_LEGEND_MILESTONES.find(x=>x.name===agreed.name)!;
  assert.ok(!original.has(def.id),"Duplicate original Legend "+def.id);
  assert.equal(def.name,agreed.name);
  assert.equal(def.tier,agreed.tier);
  assert.equal(def.division,agreed.division);
  assert.equal(def.status,"PLANNED","Cannot activate before owner and asset verification");
  assert.equal(def.cardAsset,null,"Cannot sell a card without a vetted asset");
  assert.equal(def.metric,metric.metric);
  assert.equal(def.target,metric.target);
  assert.ok(def.achievement.includes(String(metric.target)));
  assert.ok(def.tradition.length>=12&&def.era.length>=4);
  assert.ok(def.clue.length>30);
  assert.ok(!clues.has(def.clue),"Every unlock needs its own wrestling clue");
  clues.add(def.clue);
  assert.equal(def.hints?.length,2);
  assert.ok(def.hints?.every(s=>s.length>=20));
  assert.deepEqual(def.roster.map(x=>x.name),agreed.members??[agreed.name]);
  for(const profile of def.roster){
   assert.ok(!people.has(profile.name),"Duplicated prime-era wrestler "+profile.name);
   people.add(profile.name);
   assert.ok(profile.age>=20&&profile.age<=45);
   assert.ok(WRESTLING_STYLES.includes(profile.style as typeof WRESTLING_STYLES[number]));
   assert.ok(["FACE","HEEL","TWEENER"].includes(profile.alignment));
   for(const key of ["ring","craft","recognition","popularity","presentation","stamina","safety"] as const)
    assert.ok(Number.isFinite(profile[key])&&profile[key]>=0&&profile[key]<=100,
     profile.name+" "+key);
   assert.ok(profile.signature.length>=3&&profile.finisher.length>=3);
   const validated=validatePortablePersona({
    personaName:profile.name,gimmickId:profile.gimmickId,
    primaryStyle:profile.style,secondaryStyle:null,
    signatureMoves:[{name:profile.signature,category:category(profile.style),source:"VERIFIED"}],
    finishingMoves:[{name:profile.finisher,category:category(profile.style),source:"VERIFIED"}],
    source:"CURATED"
   },profile.name);
   assert.equal(validated.personaName,profile.name);
   moves.add(profile.finisher);
  }
 }
 assert.equal(clues.size,81);
 assert.equal(people.size,93);
 assert.ok(moves.size>=76,"Do not give everybody the same generic finisher");
 assert.equal(PLANNED_LEGEND_DEFINITIONS.filter(x=>x.roster.length>1).length,11);
 assert.equal(PLANNED_LEGEND_DEFINITIONS.filter(x=>x.division==="WOMEN").length,12);
});

test("team member portraits and shared card IDs match the 81 staged full definitions",()=>{
 const planned=new Map(PLANNED_LEGEND_ARTWORK.map(x=>[x.id,x]));
 for(const entry of PLANNED_LEGEND_DEFINITIONS){
  const art=planned.get(entry.id);
  assert.ok(art,"Artwork entry missing "+entry.id);
  assert.equal(art.members.length,entry.roster.length);
  assert.equal(art.tier,entry.tier);
  assert.equal(art.albumAsset,art.revealAsset);
  for(const [n,p] of entry.roster.entries()){
   assert.equal(art.members[n]?.name,p.name);
   assert.equal(art.members[n]?.personId,"legend:"+entry.id+":"+n);
   assert.match(art.members[n]?.portraitAsset??"",/\/assets\/legends\/.*-portrait\.webp$/);
  }
  assert.equal(art.activation,"BLOCKED_PENDING_PHOTO_AND_ARTWORK_REVIEW");
 }
});
