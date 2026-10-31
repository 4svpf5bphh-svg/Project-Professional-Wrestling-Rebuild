import test from "node:test";
import assert from "node:assert/strict";
import {createKpWrestlerPersona,validateKpCreatedIdentity} from "../src/domain/kp-create-wrestler.js";
import {KP_CATALOGUE,KP_WEEKLY_AWARD,KP_CREATE_TALENT_COST,KP_STAFF_ALIAS_COST,
 validateKpAction,catalogueItem} from "../src/db/kayfabe-points.js";

test("Kayfabe Points are a deterministic bounded cosmetic and World contribution catalogue",()=>{
 assert.equal(KP_WEEKLY_AWARD,100);
 assert.ok(KP_CREATE_TALENT_COST>KP_WEEKLY_AWARD*20);
 assert.ok(KP_STAFF_ALIAS_COST>0);
 assert.equal(new Set(KP_CATALOGUE.map(x=>x.sku)).size,KP_CATALOGUE.length);
 assert.equal(KP_CATALOGUE.some(x=>/WRESTLER|LEGEND|MATCH_WIN|BOOST/.test(x.sku)),false);
 assert.equal(catalogueItem("BRAND_CHROME")?.kind,"BRAND");
 assert.equal(catalogueItem("CREATED_WRESTLER"),null);
});
test("Kayfabe purchase and Create-a-Wrestler validation rejects unsafe client data",()=>{
 assert.equal(validateKpAction({kind:"CREATE_WRESTLER",requestId:"r1",
  ...{name:"Morgan Vale",division:"WOMEN",primaryStyle:"HIGH_FLYER",
  gimmickId:"UNDERDOG",alignment:"FACE",signatureMove:"Diving Crossbody",
  finishingMove:"Sky's The Limit"}}).kind,"CREATE_WRESTLER");
 const persona=createKpWrestlerPersona({name:"Morgan Vale",division:"WOMEN",primaryStyle:"HIGH_FLYER",
  gimmickId:"UNDERDOG",alignment:"FACE",signatureMove:"Diving Crossbody",
  finishingMove:"Sky's The Limit"});
 assert.equal(persona.finishingMoves[0]?.category,"AERIAL");
 assert.equal(persona.source,"GAME_AUTHORED");
 assert.equal(persona.gimmickId,"UNDERDOG");
 assert.throws(()=>validateKpCreatedIdentity({...{name:"Morgan Vale",division:"WOMEN",primaryStyle:"HIGH_FLYER",
  gimmickId:"UNDERDOG",alignment:"FACE",signatureMove:"Diving Crossbody",
  finishingMove:"Sky's The Limit"},
  gimmickId:"BEST_BOUT_MACHINE" as never}),/generic character/);
 assert.throws(()=>validateKpAction({kind:"CREATE_WRESTLER",name:"<script>",
  division:"MEN",requestId:"r1"} as never),/name/);
 assert.throws(()=>validateKpAction({kind:"RENAME_STAFF",name:"A",
  staffId:"s1",requestId:"r2"}),/name/);
 assert.throws(()=>validateKpAction({kind:"BUY",sku:"NOT_AN_ITEM" as never,
  requestId:"r3"}),/Unknown/);
 assert.throws(()=>validateKpAction({kind:"APPLY_BRAND",sku:"BADGE_GOLD" as never,
  requestId:"r4"}),/Unknown/);
});

test("Purchased milestone appearance can be reset for free",()=>{
 assert.deepEqual(validateKpAction({kind:"CLEAR_BADGE",requestId:"reset-badge"}),
  {kind:"CLEAR_BADGE",requestId:"reset-badge"});
 assert.throws(()=>validateKpAction({kind:"CLEAR_BADGE",requestId:""}),/Kayfabe request/);
});

test("Territory TV is a cosmetic account entitlement with validated selection",()=>{
 assert.equal(catalogueItem("RESULTS_TERRITORY_TV")?.kind,"RESULTS_SKIN");
 assert.equal(catalogueItem("RESULTS_TERRITORY_TV")?.price,1000);
 assert.deepEqual(validateKpAction({kind:"APPLY_RESULTS_SKIN",
  sku:"RESULTS_TERRITORY_TV",requestId:"apply-territory"}),
  {kind:"APPLY_RESULTS_SKIN",sku:"RESULTS_TERRITORY_TV",requestId:"apply-territory"});
 assert.deepEqual(validateKpAction({kind:"CLEAR_RESULTS_SKIN",requestId:"reset-results"}),
  {kind:"CLEAR_RESULTS_SKIN",requestId:"reset-results"});
 assert.throws(()=>validateKpAction({kind:"APPLY_RESULTS_SKIN",
  sku:"BADGE_GOLD" as never,requestId:"bogus"}),/Unknown/);
});

test("Fight Night is an independent cosmetic entitlement, not an outcomes boost",()=>{
 assert.equal(catalogueItem("RESULTS_FIGHT_NIGHT")?.kind,"RESULTS_SKIN");
 assert.equal(catalogueItem("RESULTS_FIGHT_NIGHT")?.price,1000);
 assert.deepEqual(validateKpAction({kind:"APPLY_RESULTS_SKIN",
  sku:"RESULTS_FIGHT_NIGHT",requestId:"fight"}),
  {kind:"APPLY_RESULTS_SKIN",sku:"RESULTS_FIGHT_NIGHT",requestId:"fight"});
 assert.throws(()=>validateKpAction({kind:"APPLY_RESULTS_SKIN",
  sku:"BADGE_GOLD" as never,requestId:"wrong"}),/Unknown/);
});

test("Underground Zine is a separate 1000 KP cosmetic results entitlement",()=>{
 assert.equal(catalogueItem("RESULTS_UNDERGROUND_ZINE")?.kind,"RESULTS_SKIN");
 assert.equal(catalogueItem("RESULTS_UNDERGROUND_ZINE")?.price,1000);
 assert.deepEqual(validateKpAction({kind:"APPLY_RESULTS_SKIN",
  sku:"RESULTS_UNDERGROUND_ZINE",requestId:"zine"}),
  {kind:"APPLY_RESULTS_SKIN",sku:"RESULTS_UNDERGROUND_ZINE",requestId:"zine"});
 assert.throws(()=>validateKpAction({kind:"APPLY_RESULTS_SKIN",
  sku:"BADGE_GOLD" as never,requestId:"bogus"}),/Unknown/);
});

test("Retro Booker 02 is a separately owned 1000 KP skin",()=>{
 assert.equal(catalogueItem("RESULTS_RETRO_BOOKER_02")?.kind,"RESULTS_SKIN");
 assert.equal(catalogueItem("RESULTS_RETRO_BOOKER_02")?.price,1000);
 assert.deepEqual(validateKpAction({kind:"APPLY_RESULTS_SKIN",
  sku:"RESULTS_RETRO_BOOKER_02",requestId:"retro"}),
  {kind:"APPLY_RESULTS_SKIN",sku:"RESULTS_RETRO_BOOKER_02",requestId:"retro"});
});

test("18 CSS poster styles are separate fair cosmetic entitlements",async()=>{
 const {EVENT_POSTER_SKINS,eventPosterByStyle,eventPosterBySku}=await import("../src/domain/event-poster-skins.js");
 assert.equal(EVENT_POSTER_SKINS.length,18);
 assert.equal(new Set(EVENT_POSTER_SKINS.map(x=>x.sku)).size,18);
 for(const skin of EVENT_POSTER_SKINS){
  assert.equal(catalogueItem(skin.sku)?.kind,"EVENT_POSTER");
  assert.equal(catalogueItem(skin.sku)?.price,1250);
  assert.equal(eventPosterByStyle(skin.style)?.sku,skin.sku);
  assert.equal(eventPosterBySku(skin.sku)?.style,skin.style);
  assert.deepEqual(validateKpAction({kind:"APPLY_EVENT_POSTER",
   sku:skin.sku,requestId:skin.sku}),{kind:"APPLY_EVENT_POSTER",sku:skin.sku,requestId:skin.sku});
 }
 assert.deepEqual(validateKpAction({kind:"CLEAR_EVENT_POSTER",requestId:"clear-poster"}),
  {kind:"CLEAR_EVENT_POSTER",requestId:"clear-poster"});
 assert.throws(()=>validateKpAction({kind:"APPLY_EVENT_POSTER",
  sku:"BADGE_GOLD" as never,requestId:"wrong-kind"}),/Unknown/);
});

test("nine Staff Office designs are account-only, selectable and never affect gameplay",async()=>{
 const {STAFF_OFFICE_THEMES,staffOfficeThemeByStyle,staffOfficeThemeClass}=await import(
  "../src/domain/staff-office-themes.js");
 assert.equal(STAFF_OFFICE_THEMES.length,9);
 assert.equal(new Set(STAFF_OFFICE_THEMES.map(t=>t.sku)).size,9);
 for(const theme of STAFF_OFFICE_THEMES){
  assert.equal(catalogueItem(theme.sku)?.price,1250);
  assert.equal(catalogueItem(theme.sku)?.kind,"STAFF_OFFICE_THEME");
  assert.equal(staffOfficeThemeByStyle(theme.style)?.sku,theme.sku);
  assert.equal(staffOfficeThemeClass(theme.style),theme.style.toLowerCase().replaceAll("_","-"));
  assert.deepEqual(validateKpAction({kind:"APPLY_STAFF_OFFICE_THEME",
   sku:theme.sku,requestId:theme.sku}),
   {kind:"APPLY_STAFF_OFFICE_THEME",sku:theme.sku,requestId:theme.sku});
 }
 assert.equal(staffOfficeThemeClass(null),"standard");
 assert.deepEqual(validateKpAction({kind:"CLEAR_STAFF_OFFICE_THEME",requestId:"reset"}),
  {kind:"CLEAR_STAFF_OFFICE_THEME",requestId:"reset"});
 assert.throws(()=>validateKpAction({kind:"APPLY_STAFF_OFFICE_THEME",
  sku:"POSTER_ECLIPSE" as never,requestId:"cross-category"}),/Unknown/);
});

test("nine broadcast packages own unique cosmetic SKUs, have white-on-red labels and cost 1500 KP",async()=>{
 const {BROADCAST_PACKAGES,broadcastPackageClass,broadcastPackageBySku}=await import(
  "../src/domain/broadcast-packages.js");
 assert.equal(BROADCAST_PACKAGES.length,9);
 assert.equal(new Set(BROADCAST_PACKAGES.map(p=>p.sku)).size,9);
 for(const p of BROADCAST_PACKAGES){
  assert.equal(catalogueItem(p.sku)?.price,1500);
  assert.equal(catalogueItem(p.sku)?.kind,"BROADCAST_PACKAGE");
  assert.equal(broadcastPackageClass(p.style),p.key);
  assert.equal(broadcastPackageBySku(p.sku)?.style,p.style);
  assert.deepEqual(validateKpAction({kind:"APPLY_BROADCAST_PACKAGE",
   sku:p.sku,requestId:p.sku}),
   {kind:"APPLY_BROADCAST_PACKAGE",sku:p.sku,requestId:p.sku});
 }
 assert.equal(broadcastPackageClass(null),"standard");
 assert.deepEqual(validateKpAction({kind:"CLEAR_BROADCAST_PACKAGE",requestId:"reset"}),
  {kind:"CLEAR_BROADCAST_PACKAGE",requestId:"reset"});
 assert.throws(()=>validateKpAction({kind:"APPLY_BROADCAST_PACKAGE",
  sku:"POSTER_ECLIPSE" as never,requestId:"wrong-kind"}),/Unknown/);
});
