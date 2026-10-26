import {test} from "node:test";
import assert from "node:assert/strict";
import {existsSync} from "node:fs";
import {LEGEND_PORTRAIT_ASSETS,legendPortraitSource} from "../src/ui/legend-portrait-assets.js";
import {LEGENDS_CATALOGUE} from "../src/domain/legends-catalogue.js";
import {portraitSource} from "../src/ui/wrestler-portrait.js";

test("static Legend photographs follow immutable person IDs across roster transfers",()=>{
 for(const [id,source] of Object.entries(LEGEND_PORTRAIT_ASSETS)){
  assert.match(id,/^legend:[a-z0-9-]+:\d+$/);
  assert.ok(LEGENDS_CATALOGUE.some(x=>x.id===id.split(":")[1]));
  assert.match(source,/^\/assets\/legends\/[a-z0-9-]+-\d+-portrait\.webp$/);
  assert.ok(existsSync("apps/web/public"+source),id+" must reference a real file");
  assert.equal(legendPortraitSource(id),source);
  assert.equal(portraitSource("Changed Ring Name",220,id),source);
 }
 assert.equal(legendPortraitSource("unrelated-id"),null);
 assert.equal(legendPortraitSource("legend:unknown:0"),null);
});
test("tag duo images cannot be misidentified as individual wrestlers before review",()=>{
 assert.equal(legendPortraitSource("legend:road-warriors:0"),null);
 assert.equal(legendPortraitSource("legend:road-warriors:1"),null);
});
