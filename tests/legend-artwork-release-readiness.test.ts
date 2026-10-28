import test from "node:test";
import assert from "node:assert/strict";
import {existsSync,statSync} from "node:fs";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {LEGENDS_EXPANSION_RELEASED} from "../src/domain/legends-catalogue.js";
import {PLANNED_LEGEND_ARTWORK} from "../src/domain/planned-legend-artwork.js";

/** Fail closed if the owner-approved catalogue is ever activated without all
 * 81 original-design collectible cards and 93 stable-person portraits.
 * Assets may be staged on the draft branch while release remains disabled.
 */
test("129-Legend release requires all 174 non-placeholder owner art files",()=>{
 const root=join(fileURLToPath(new URL("..",import.meta.url)),
  "apps","web","public","assets","legends");
 const all=PLANNED_LEGEND_ARTWORK.flatMap(x=>[x.cardAsset,...x.members.map(m=>m.portraitAsset)]);
 assert.equal(all.length,174);
 assert.equal(new Set(all).size,174);
 const unavailable=all.filter(asset=>{
  const full=join(root,asset.split("/").at(-1)!);
  return !existsSync(full)||statSync(full).size<4096;
 });
 if(LEGENDS_EXPANSION_RELEASED)
  assert.deepEqual(unavailable,[],
   "Cannot activate new Legends while artwork files are missing or placeholders");
 else
  assert.equal(LEGENDS_EXPANSION_RELEASED,false);
});
