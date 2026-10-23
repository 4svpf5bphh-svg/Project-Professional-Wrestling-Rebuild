/**
 * Promotes only individually evidenced Commons headshot candidates into PPW.
 * Reads the complete Genesis assessment and original source metadata; makes no
 * production, Neon, World or Vercel calls. Re-running is idempotent.
 */
import {readFile,writeFile} from "node:fs/promises";
import {portraitCredit,normalizePortraitName} from "../src/ui/wrestler-portrait.js";
type Credit={file:string;author:string;license:string};
type Person={name:string;aliases:string[];photo:Credit|null;status:string};
type Candidate=Credit&{description:string;source:string;singleSubject:boolean;wrestlingContext:boolean};
type Decision=Person&{reason:string;resolution:string};
const work=JSON.parse(await readFile("data/genesis-portrait-worklist.json","utf8")) as {
 people:Person[];counts:Record<string,any>};
const findings=JSON.parse(await readFile("data/genesis-individual-candidates.json","utf8")) as {
 people:Record<string,{candidates:Candidate[];error:string|null}>;summary:Record<string,any>};
const assessment=JSON.parse(await readFile("data/portrait-assessment.json","utf8")) as {
 people:Decision[];summary:Record<string,any>};
const checkpoint=JSON.parse(await readFile("data/portrait-discovery-checkpoint.json","utf8")) as {
 people:Decision[]};
const norm=(s:string)=>s.normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase()
 .replace(/[^\p{L}\p{N}]+/gu," ").trim();
const has=(s:string,n:string)=>(" "+norm(s)+" ").includes(" "+norm(n)+" ");
const licences=new Set(["CC BY 2.0","CC BY 4.0","CC BY-SA 2.0","CC BY-SA 3.0","CC BY-SA 4.0","CC0"]);
const urls:Record<string,string>={"CC BY 2.0":"https://creativecommons.org/licenses/by/2.0/","CC BY 4.0":"https://creativecommons.org/licenses/by/4.0/","CC BY-SA 2.0":"https://creativecommons.org/licenses/by-sa/2.0/","CC BY-SA 3.0":"https://creativecommons.org/licenses/by-sa/3.0/","CC BY-SA 4.0":"https://creativecommons.org/licenses/by-sa/4.0/","CC0":"https://creativecommons.org/publicdomain/zero/1.0/"};
const esc=(s:string)=>s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const used=new Set(work.people.flatMap(p=>p.photo?[p.photo.file.toLowerCase()]:[]));
const results:{name:string;file:string;author:string;license:string;reason:string}[]=[];
const rejected:{name:string;reason:string;candidateCount:number}[]=[];
for(const person of work.people){
 if(person.photo||portraitCredit(person.name))continue;
 const search=findings.people[person.name];
 if(!search?.candidates?.length)continue;
 const eligible=search.candidates.filter(c=>{
  if(!c.singleSubject||!c.wrestlingContext||!licences.has(c.license))return false;
  if(c.author.length<3||c.author.length>160||!c.description||!c.source.startsWith("https://commons.wikimedia.org/wiki/File:"))return false;
  if(used.has(c.file.toLowerCase()))return false;
  if(/\b(basketball|musician|saxophone|linebacker|football player|singer|rapper|botanical|flower|cosplay)\b/i.test(c.description))return false;
  if(!/\.(jpg|jpeg|png|webp)$/i.test(c.file))return false;
  const options=[person.name,...person.aliases].map(norm).filter(s=>s.length>=5);
  return options.some(name=>
   has(c.description,name)&&(norm(c.file.replace(/\.[^.]+$/,""))===name||
    norm(c.file.replace(/\.[^.]+$/,"")).startsWith(name+" ")));
 });
 if(!eligible.length){
  rejected.push({name:person.name,reason:"No safely identified solo licensed source",candidateCount:search.candidates.length});
  continue;
 }
 // A pre-existing Commons crop outranks unmodified ringside action. We do
 // not create derivative files or invent identities, photographers or rights.
 eligible.sort((a,b)=>Number(/\bcropped?\b/i.test(b.file))-Number(/\bcropped?\b/i.test(a.file))||
  a.file.length-b.file.length||a.file.localeCompare(b.file));
 const chosen=eligible[0]!;
 const credit={file:chosen.file,author:chosen.author,license:chosen.license};
 person.photo=credit;person.status="catalogued";
 used.add(chosen.file.toLowerCase());
 results.push({name:person.name,...credit,reason:"Solo wrestler confirmed in Commons filename and independent photo description"});
}
if(results.length){
 const map=new Map(results.map(x=>[x.name,x]));
 for(const group of [assessment.people,checkpoint.people]){
  for(const p of group){
   const c=map.get(p.name);
   if(c){p.photo={file:c.file,author:c.author,license:c.license};
    p.status="catalogued";p.resolution="added-individual";p.reason=c.reason;}
  }
 }
 let cat=await readFile("src/ui/wrestler-portrait.ts","utf8");
 const marker="\n};\nconst knownAliases:",at=cat.indexOf(marker);
 if(at<0)throw Error("Photo catalogue marker missing");
 const entries=results.map(x=>" "+JSON.stringify(normalizePortraitName(x.name))+
  ":{file:"+JSON.stringify(x.file)+",author:"+JSON.stringify(x.author)+",license:"+JSON.stringify(x.license)+"},");
 cat=cat.slice(0,at)+(/,\s*$/.test(cat.slice(0,at))?"":",")+
  "\n // Single-subject Commons photos corroborated in individual search\n"+entries.join("\n")+cat.slice(at);
 await writeFile("src/ui/wrestler-portrait.ts",cat);
 let credits=await readFile("apps/web/public/portrait-credits.html","utf8");
 const lines=results.map(c=>"<li>"+esc(c.name)+" — "+esc(c.author)+
  ', <a href="https://commons.wikimedia.org/wiki/File:'+encodeURIComponent(c.file.replace(/ /g,"_"))+
  '">Commons photograph</a>, <a href="'+urls[c.license]+'">'+esc(c.license)+
  "</a>. The card crops at display time; source file unmodified.</li>");
 credits=credits.replace("</ul>",lines.join("\n")+"\n</ul>");
 await writeFile("apps/web/public/portrait-credits.html",credits);
}
work.counts.existing=work.people.filter(p=>p.photo).length;
work.counts.missing=643-work.counts.existing;
work.counts.catalogue+=results.length;
assessment.summary={...assessment.summary,genuineGenesisPhotos:work.counts.existing,
 unresolved:work.counts.missing,creditedSources:work.counts.catalogue,
 coveragePercent:Math.round(work.counts.existing/643*10000)/100,
 newlyVerifiedIndividualCandidates:results.length,
 caveat:"Individual Commons photographs require passing full external author/licence audit; unresolved and throttled people retain premium initials."};
await Promise.all([
 writeFile("data/genesis-portrait-worklist.json",JSON.stringify(work,null,2)+"\n"),
 writeFile("data/portrait-assessment.json",JSON.stringify(assessment,null,2)+"\n"),
 writeFile("data/portrait-discovery-checkpoint.json",JSON.stringify(checkpoint,null,2)+"\n"),
 writeFile("data/genesis-individual-review.json",JSON.stringify({
  checked:work.people.length,newPhotos:results.length,results,rejected
 },null,2)+"\n")
]);
console.log(JSON.stringify({newPhotos:results.length,totalCovered:work.counts.existing,
 unresolved:work.counts.missing,needsManualReview:rejected.length}));
