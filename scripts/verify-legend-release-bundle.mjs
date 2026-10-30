/** Release-only provenance gate: the actual compiled Vercel static bundle
 * must contain the SHA256-approved 47 original Legend cards and 48 portraits.
 * Source tree assets are intentionally insufficient: they can contain the
 * older Commons fallback photos, while web:build installs the approved ZIP.
 * No network access, World reads or deployment.
 */
import {readFileSync,existsSync} from "node:fs";
import {join} from "node:path";
import {inflateRawSync} from "node:zlib";
import {createHash} from "node:crypto";
import assert from "node:assert/strict";

const zip=readFileSync("PPW_Legends_Fixed.zip");
let end=-1;
for(let pos=zip.length-22;pos>=Math.max(0,zip.length-65557);pos--){
 if(zip.readUInt32LE(pos)===0x06054b50){end=pos;break;}
}
assert.ok(end>=0,"Approved Legends pack is not a valid ZIP");
const count=zip.readUInt16LE(end+10);
assert.equal(count,101,"Original 47 + 48 archive no longer matches the approved edition");
let cursor=zip.readUInt32LE(end+16);
const directory=new Map();
for(let i=0;i<count;i++){
 assert.equal(zip.readUInt32LE(cursor),0x02014b50);
 const method=zip.readUInt16LE(cursor+10);
 const packed=zip.readUInt32LE(cursor+20);
 const expectedSize=zip.readUInt32LE(cursor+24);
 const nameLen=zip.readUInt16LE(cursor+28),extra=zip.readUInt16LE(cursor+30);
 const comment=zip.readUInt16LE(cursor+32);
 const pointer=zip.readUInt32LE(cursor+42);
 const name=zip.subarray(cursor+46,cursor+46+nameLen).toString("utf8");
 assert.equal(method,8,"Only approved deflate archives are accepted");
 assert.ok(!directory.has(name)&&!name.includes("..")&&!name.startsWith("/"));
 const local=pointer+30+zip.readUInt16LE(pointer+26)+zip.readUInt16LE(pointer+28);
 directory.set(name,{offset:local,length:packed,size:expectedSize});
 cursor+=46+nameLen+extra+comment;
}
function entry(name){
 const item=directory.get(name);
 assert.ok(item,"Missing source pack entry: "+name);
 const result=inflateRawSync(zip.subarray(item.offset,item.offset+item.length));
 assert.equal(result.length,item.size,"Damaged source pack entry: "+name);
 return result;
}
const manifest=JSON.parse(entry("overlay/data/legend-user-artwork-manifest.json").toString("utf8"));
assert.equal(manifest.edition,"USER_SUPPLIED_LEGENDS_ARTWORK_DRAFT_2026_10_26");
assert.equal(manifest.catalogueEntries,48);
assert.equal(manifest.entries.length,47);
assert.equal(manifest.cards,47);
assert.equal(manifest.rosterPortraits,48);
const checks=new Map();
for(const row of manifest.entries){
 checks.set(row.cardAsset,row.cardSha256);
 for(const person of row.portraits)checks.set(person.asset,person.sha256);
}
assert.equal(checks.size,95,"Incomplete or duplicated original Legend artwork");
for(const [asset,sha] of checks){
 assert.match(asset,/^\/assets\/legends\/[a-z0-9-]+\.webp$/);
 assert.match(sha,/^[a-f0-9]{64}$/);
 const source=entry("overlay/apps/web/public"+asset);
 const bundled="dist/web"+asset;
 assert.ok(existsSync(bundled),"Missing Vercel built asset: "+bundled);
 const built=readFileSync(bundled);
 assert.ok(built.length>=4096,"Placeholder asset: "+asset);
 assert.equal(createHash("sha256").update(source).digest("hex"),sha,
  "Source artwork does not match owner-approved manifest: "+asset);
 assert.equal(createHash("sha256").update(built).digest("hex"),sha,
  "The actual deployable Vercel asset differs from the owner pack: "+asset);
 assert.equal(built.toString("ascii",0,4),"RIFF");
 assert.equal(built.toString("ascii",8,12),"WEBP");
}
const taz=manifest.entries.find(x=>x.id==="taz");
assert.ok(taz,"Taz is missing from the original Legends pack");
assert.equal(taz.portraits[0].sha256,
 "b3730a15591d9356a4e50610fa2af21e45b717a0f310d3d4cd8a55429e2fbc27",
 "Taz's approved in-ring image must never regress to the old sunglasses photo");
assert.ok(existsSync("dist/web/assets/legends/undertaker-immortal-card.webp"),
 "The original Undertaker pilot must remain intact");
const sw=readFileSync("dist/web/sw.js","utf8");
assert.match(sw,/ppw-static-shell-v4/);
assert.match(sw,/assets\/legends\//);
console.log("READY: deployable build contains all 95 approved original Legends assets, "+
 "including the correct Taz image; Undertaker pilot retained and iPhone cache rotated.");
