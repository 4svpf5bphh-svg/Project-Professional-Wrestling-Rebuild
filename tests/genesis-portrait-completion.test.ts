import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {portraitCatalogue,portraitCredit,portraitSource} from "../src/ui/wrestler-portrait.js";

type Credit={file:string;author:string;license:string};
type Person={name:string;division:string;status:string;photo:Credit|null};
type Assessed=Person&{resolution:string;reason:string};
const inventory=JSON.parse(readFileSync(
 new URL("../data/genesis-portrait-worklist.json",import.meta.url),"utf8")) as {
 counts:{total:number;catalogue:number;existing:number;missing:number;
  unmatchedCatalogue:string[]};
 people:Person[];
};
const assessment=JSON.parse(readFileSync(
 new URL("../data/portrait-assessment.json",import.meta.url),"utf8")) as {
 summary:{genuineGenesisPhotos:number;unresolved:number;coveragePercent:number};
 people:Assessed[];
};
test("every one of the 643 canonical Genesis identities is assessed with honest source/fallback status",()=>{
 assert.equal(inventory.people.length,643);
 assert.equal(assessment.people.length,643);
 assert.equal(new Set(inventory.people.map(p=>p.name)).size,643);
 const byName=new Map(assessment.people.map(p=>[p.name,p]));
 assert.equal(byName.size,643);
 let photographed=0,unresolved=0;
 const images=new Set<string>();
 for(const person of inventory.people){
  const result=byName.get(person.name);
  assert.ok(result,"Missing assessment for "+person.name);
  const credited=portraitCredit(person.name);
  assert.deepEqual(person.photo,credited,person.name);
  assert.deepEqual(result.photo,person.photo,person.name);
  if(credited){
   photographed++;
   assert.equal(person.status,"catalogued",person.name);
   assert.ok(portraitSource(person.name)?.includes("Special:FilePath"));
   assert.ok(!images.has(credited.file.toLowerCase()),person.name+" borrowed somebody else's photograph");
   images.add(credited.file.toLowerCase());
  }else{
   unresolved++;
   assert.equal(person.status,"missing",person.name);
   assert.equal(portraitSource(person.name),null,person.name);
   assert.ok(result.reason?.length>=12,"No documented unresolved reason: "+person.name);
  }
 }
 assert.equal(photographed,inventory.counts.existing);
 assert.equal(unresolved,inventory.counts.missing);
 assert.equal(photographed+unresolved,643);
 assert.equal(assessment.summary.genuineGenesisPhotos,photographed);
 assert.equal(assessment.summary.unresolved,unresolved);
 assert.equal(assessment.summary.coveragePercent,Math.round(photographed*10000/643)/100);
});
test("source catalogue preserves honest unmatched credits without inventing Genesis coverage",()=>{
 assert.equal(Object.keys(portraitCatalogue).length,inventory.counts.catalogue);
 const creditedNames=new Set(Object.keys(portraitCatalogue));
 assert.equal(creditedNames.size,inventory.counts.catalogue);
 for(const unused of inventory.counts.unmatchedCatalogue){
  assert.ok(creditedNames.has(unused),"Incorrect unmatched source identity "+unused);
 }
 assert.equal(inventory.people.filter(p=>p.photo).length,inventory.counts.existing);
});
test("retry-limit errors are documented as unresolved, never treated as a missing legal image",()=>{
 const throttled=assessment.people.filter(p=>!p.photo&&p.reason.includes("HTTP 429"));
 for(const p of throttled){
  assert.equal(p.resolution,"unresolved",p.name);
  assert.equal(p.status,"missing",p.name);
 }
 // Commons availability and licensing remain external audits, not runtime Neon reads.
 const moduleText=readFileSync(new URL("../src/ui/wrestler-portrait.ts",import.meta.url),"utf8");
 assert.doesNotMatch(moduleText,/\bfetch\s*\(|\bwithSqlClient\s*\(/);
});
