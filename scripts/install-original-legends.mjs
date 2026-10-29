/** Materialise the owner-approved original 47 Legend cards and 48 portraits
 * from the exact ZIP uploaded on the current development branch.
 * Vercel's real npm run web:build executes this before Vite copies public/.
 * No new dependency, outbound network request, player data or DB migration.
 */
import {readFileSync,writeFileSync,mkdirSync,existsSync} from "node:fs";
import {join,dirname,normalize} from "node:path";
import {inflateRawSync} from "node:zlib";
import {createHash} from "node:crypto";
const archive="PPW_Legends_Fixed.zip";
if(!existsSync(archive))throw new Error("Missing owner Legends ZIP: "+archive);
const input=readFileSync(archive);
if(input.length>12_000_000)throw new Error("Unexpectedly large Legends archive");
const signature=0x06054b50;
let directory=-1;
for(let i=input.length-22;i>=Math.max(0,input.length-65557);i--)
 if(input.readUInt32LE(i)===signature){directory=i;break;}
if(directory<0)throw new Error("Invalid ZIP central directory");
const total=input.readUInt16LE(directory+10);
let offset=input.readUInt32LE(directory+16);
if(total!==101||total>150)throw new Error("Unexpected Legends archive entries: "+total);
const entries=new Map();
for(let n=0;n<total;n++){
 if(input.readUInt32LE(offset)!==0x02014b50)throw new Error("Corrupt ZIP directory");
 const flags=input.readUInt16LE(offset+8),method=input.readUInt16LE(offset+10);
 const packed=input.readUInt32LE(offset+20),size=input.readUInt32LE(offset+24);
 const nameLength=input.readUInt16LE(offset+28);
 const extra=input.readUInt16LE(offset+30),comment=input.readUInt16LE(offset+32);
 const pointer=input.readUInt32LE(offset+42);
 const name=input.subarray(offset+46,offset+46+nameLength).toString("utf8");
 offset+=46+nameLength+extra+comment;
 if(entries.has(name)||name.includes("..")||name.startsWith("/")||name.includes("\\"))
  throw new Error("Unsafe or repeated artwork path: "+name);
 if(flags!==0||method!==8||packed>12_000_000||size>12_000_000||
  input.readUInt32LE(pointer)!==0x04034b50)
  throw new Error("Unsupported or corrupt artwork ZIP: "+name);
 const start=pointer+30+input.readUInt16LE(pointer+26)+input.readUInt16LE(pointer+28);
 if(start+packed>input.length)throw new Error("Truncated archive: "+name);
 const bytes=inflateRawSync(input.subarray(start,start+packed));
 if(bytes.length!==size)throw new Error("Invalid extracted file length: "+name);
 entries.set(name,bytes);
}
const manifestName="overlay/data/legend-user-artwork-manifest.json";
const manifest=JSON.parse(entries.get(manifestName)?.toString("utf8")??"null");
if(manifest?.edition!=="USER_SUPPLIED_LEGENDS_ARTWORK_DRAFT_2026_10_26"||
 manifest.catalogueEntries!==48||manifest.userSources!==47||
 manifest.cards!==47||manifest.rosterPortraits!==48||
 manifest.undertaker!=="EXISTING_PILOT_UNCHANGED"||
 !Array.isArray(manifest.entries)||manifest.entries.length!==47)
 throw new Error("Owner Legends archive manifest was not approved");
const expected=new Map();
for(const entry of manifest.entries){
 const record=(url,sha)=>{
  if(typeof url!=="string"||!/^\/assets\/legends\/[a-z0-9-]+\.webp$/.test(url)||
   typeof sha!=="string"||!(/^[0-9a-f]{64}$/.test(sha))||
   url.includes("undertaker"))
   throw new Error("Unsafe or unexpected owner artwork entry");
  const name="overlay/apps/web/public"+url;
  if(expected.has(name))throw new Error("Repeated owner artwork "+name);
  expected.set(name,sha);
 };
 record(entry.cardAsset,entry.cardSha256);
 if(!Array.isArray(entry.portraits))throw new Error("Missing member portraits");
 for(const p of entry.portraits)record(p.asset,p.sha256);
}
if(expected.size!==95)throw new Error("Incomplete owner artwork: "+expected.size);
const available=[...entries.keys()].filter(x=>x.startsWith("overlay/apps/web/public/assets/legends/"));
if(available.length!==95||available.some(x=>!expected.has(x)))
 throw new Error("Unknown additional artwork in owner archive");
for(const [name,hash] of expected){
 const bytes=entries.get(name);
 if(!bytes||bytes.length<4096||
  bytes.toString("ascii",0,4)!=="RIFF"||
  bytes.toString("ascii",8,12)!=="WEBP"||
  createHash("sha256").update(bytes).digest("hex")!==hash)
  throw new Error("Owner artwork checksum mismatch: "+name);
}
for(const name of expected.keys()){
 const destination=normalize(name.slice("overlay/".length));
 mkdirSync(dirname(destination),{recursive:true});
 writeFileSync(destination,entries.get(name));
}
console.log("Installed and SHA256-verified 95 user-supplied original Legend assets; Undertaker retained.");
console.log("Original source-photo usage rights remain unverified for wider publication.");
