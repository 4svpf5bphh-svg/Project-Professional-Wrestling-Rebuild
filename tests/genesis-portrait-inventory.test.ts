import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {portraitCredit,portraitSource} from "../src/ui/wrestler-portrait.js";
type Person={name:string;division:string;promotions:string[];aliases:string[];photo:{file:string;author:string;license:string}|null};
const snapshot=JSON.parse(readFileSync(new URL("../data/genesis-portrait-worklist.json",import.meta.url),"utf8")) as {
 source:{repository:string;branch:string;men:number;women:number};
 counts:{total:number;existing:number;missing:number};people:Person[]};
test("complete original-main Genesis worklist is independent of synthetic fixture and contains unique talent",()=>{
 assert.equal(snapshot.source.repository,"4svpf5bphh-svg/Project-Professional-Wrestling");
 assert.equal(snapshot.source.branch,"main");
 assert.equal(snapshot.source.men,440);
 assert.equal(snapshot.source.women,203);
 assert.equal(snapshot.people.length,643);
 assert.equal(snapshot.counts.total,643);
 assert.equal(new Set(snapshot.people.map(p=>p.name)).size,643);
 assert.equal(snapshot.people.filter(p=>p.division==="MEN").length,440);
 assert.equal(snapshot.people.filter(p=>p.division==="WOMEN").length,203);
});
test("previous photographs remain credited for every covered Genesis identity",()=>{
 let preserved=0;
 for(const p of snapshot.people){
  if(p.photo){
   assert.deepEqual(portraitCredit(p.name),p.photo,p.name);
   preserved++;
  }
 }
 assert.equal(preserved,snapshot.counts.existing);
 assert.equal(preserved+snapshot.counts.missing,643);
});
test("every Genesis wrestler resolves either a specific photo or the initials fallback",()=>{
 const used=new Map<string,string>();
 for(const p of snapshot.people){
  const credit=portraitCredit(p.name),src=portraitSource(p.name);
  if(!credit){assert.equal(src,null,p.name);continue;}
  assert.ok(credit.file&&credit.author&&credit.license,p.name);
  assert.match(src!,/^https:\/\/commons\.wikimedia\.org\/wiki\/Special:FilePath\//);
  assert.match(credit.license,/^(CC BY(?:-SA)? (?:2\.0|3\.0|4\.0)|CC0)$/);
  const file=credit.file.toLowerCase();
  assert.equal(used.has(file),false,"Image reused for "+p.name+" and "+used.get(file));
  used.set(file,p.name);
 }
});
