import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,statSync} from "node:fs";
import {join} from "node:path";
import {LIVE_LEGENDS} from "../src/domain/legends-catalogue.js";
import {reviewedLegendPortraits} from "../src/domain/reviewed-legend-expansion.js";

/** The real deployment build serves apps/web/public. An artwork registry
 * with 129 plausible URLs is not enough: every linked WebP must be present.
 * This verifies packaging, NOT the rights or identity of the source photo. */
test("all 129 Legends cards and 93 new individual portraits exist as real WebP assets",()=>{
 assert.equal(LIVE_LEGENDS.length,129);
 const urls=[
  ...LIVE_LEGENDS.map(l=>l.cardAsset),
  ...Object.values(reviewedLegendPortraits())
 ];
 assert.equal(urls.length,129+93);
 assert.equal(urls.every(x=>typeof x==="string"),true);
 const unique=new Set(urls);
 assert.equal(unique.size,urls.length,"Every image path must be unambiguous");
 for(const url of urls){
  assert.ok(url?.startsWith("/assets/legends/"),"Unexpected artwork path "+url);
  assert.ok(!url?.includes(".."),"Unexpected relative traversal "+url);
  const disk=join("apps/web/public",url!.replace(/^\//,""));
  const bytes=readFileSync(disk);
  assert.ok(statSync(disk).size>1000,"Empty or placeholder image "+url);
  assert.equal(bytes.toString("ascii",0,4),"RIFF","Not WebP RIFF: "+url);
  assert.equal(bytes.toString("ascii",8,12),"WEBP","Invalid WebP payload: "+url);
 }
});
