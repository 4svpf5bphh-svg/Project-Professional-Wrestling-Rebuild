import test from "node:test";
import assert from "node:assert/strict";
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
 assert.equal(validateKpAction({kind:"CREATE_WRESTLER",name:"Morgan Vale",
  division:"WOMEN",requestId:"r1"}).kind,"CREATE_WRESTLER");
 assert.throws(()=>validateKpAction({kind:"CREATE_WRESTLER",name:"<script>",
  division:"MEN",requestId:"r1"}),/name/);
 assert.throws(()=>validateKpAction({kind:"RENAME_STAFF",name:"A",
  staffId:"s1",requestId:"r2"}),/name/);
 assert.throws(()=>validateKpAction({kind:"BUY",sku:"NOT_AN_ITEM" as never,
  requestId:"r3"}),/Unknown/);
 assert.throws(()=>validateKpAction({kind:"APPLY_BRAND",sku:"BADGE_GOLD" as never,
  requestId:"r4"}),/Unknown/);
});
