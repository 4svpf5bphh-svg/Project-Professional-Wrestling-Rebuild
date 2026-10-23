/**
 * Process previously recovered Commons evidence in one metadata request per
 * 20 candidates. Never scrape, invent identity/attribution, touch Neon or World.
 * Candidates failing verification stay as premium monogram fallbacks.
 */
import {readFile,writeFile} from "node:fs/promises";
import {portraitCredit,normalizePortraitName} from "../src/ui/wrestler-portrait.js";
type Credit={file:string;author:string;license:string};
type Person={name:string;photo:Credit|null;status:string};
type Decision=Person&{reason:string;resolution:string};
const {selection}=JSON.parse(await readFile("data/verified-candidate-shortlist.json","utf8")) as {selection:Record<string,string>};
const roster=JSON.parse(await readFile("data/genesis-portrait-worklist.json","utf8")) as {people:Person[];counts:Record<string,any>};
const assessment=JSON.parse(await readFile("data/portrait-assessment.json","utf8")) as {people:Decision[];summary:Record<string,any>};
const cp=JSON.parse(await readFile("data/portrait-discovery-checkpoint.json","utf8")) as {people:Decision[]};
const norm=(s:string)=>s.normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^\p{L}\p{N}]+/gu," ").trim();
const contains=(s:string,n:string)=>(" "+norm(s)+" ").includes(" "+norm(n)+" ");
const plain=(s:string)=>s.replace(/<[^>]*>/g," ").replace(/&amp;/gi,"&").replace(/&quot;/gi,'"').replace(/&nbsp;/gi," ").replace(/\s+/g," ").trim();
const escape=(s:string)=>s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const licences=new Set(["CC BY 2.0","CC BY 4.0","CC BY-SA 2.0","CC BY-SA 3.0","CC BY-SA 4.0","CC0"]);
const licenceLinks:Record<string,string>={"CC BY 2.0":"https://creativecommons.org/licenses/by/2.0/","CC BY 4.0":"https://creativecommons.org/licenses/by/4.0/","CC BY-SA 2.0":"https://creativecommons.org/licenses/by-sa/2.0/","CC BY-SA 3.0":"https://creativecommons.org/licenses/by-sa/3.0/","CC BY-SA 4.0":"https://creativecommons.org/licenses/by-sa/4.0/","CC0":"https://creativecommons.org/publicdomain/zero/1.0/"};
const chosen=Object.entries(selection);
const known=new Set(roster.people.flatMap(p=>p.photo?[p.photo.file.toLowerCase()]:[]));
const resolved=new Map<string,Credit>();
const rejected:{name:string;reason:string;file:string}[]=[];
let calls=0;
const wait=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function fetchPages(chunk:[string,string][]):Promise<any[]>{
 const params=new URLSearchParams({action:"query",format:"json",formatversion:"2",
 titles:chunk.map(([,file])=>"File:"+file).join("|"),
 prop:"imageinfo",iiprop:"url|mime|extmetadata",iiextmetadatafilter:"Artist|LicenseShortName|ImageDescription"});
 for(let attempt=0;attempt<4;attempt++){
  calls++;
  const response=await fetch("https://commons.wikimedia.org/w/api.php?"+params,{
   headers:{"User-Agent":"PPW-Genesis-SourceMetadata/1.1 (https://github.com/4svpf5bphh-svg/Project-Professional-Wrestling-Rebuild)"},
   signal:AbortSignal.timeout(30000)});
  if(response.ok)return Object.values((await response.json()).query?.pages??{});
  if(![429,502,503,504].includes(response.status))throw Error("Commons HTTP "+response.status);
  const retry=Number(response.headers.get("retry-after"));
  await wait(Number.isFinite(retry)&&retry>0?Math.min(90000,retry*1000):7500*(attempt+1));
 }
 throw Error("Commons metadata endpoint rate-limited: no unverified writes allowed");
}
for(let i=0;i<chosen.length;i+=20){
 const chunk=chosen.slice(i,i+20),pages=await fetchPages(chunk);
 const map=new Map(pages.map((page:any)=>[norm(String(page.title??"").replace(/^File:/,"")),page]));
 for(const [name,file] of chunk){
  const subject=roster.people.find(p=>p.name===name);
  if(!subject||subject.photo||portraitCredit(name)){rejected.push({name,file,reason:"Not a missing Genesis identity"});continue;}
  const page=map.get(norm(file)),info=page?.imageinfo?.[0],meta=info?.extmetadata;
  if(!info?.url||!["image/jpeg","image/png","image/webp"].includes(info.mime)||!meta){
   rejected.push({name,file,reason:"Commons file missing or unsupported image type"});continue;
  }
  const license=plain(meta.LicenseShortName?.value??""),author=plain(meta.Artist?.value??"");
  const description=plain(meta.ImageDescription?.value??"");
  if(!licences.has(license)||author.length<3||author.length>180||description.length<9){
   rejected.push({name,file,reason:"Missing verified photographer or commercially reusable licence"});continue;
  }
  if(!contains(file,name)||!contains(description,name)&&!(name==="Flip Gordon"&&contains(description,"Flip Gordon"))){
   rejected.push({name,file,reason:"Subject identity not present in both independent source fields"});continue;
  }
  if(!/\b(professional wrestler|pro wrestler|wrestler|luchador|lucha libre|njpw|new japan|wwe|aew|stardom|wrestling|tna|roh|ring of honor)\b/i.test(description)){
   rejected.push({name,file,reason:"No independent wrestling identity context"});continue;
  }
  if(/\b(basketball|musician|saxophone|linebacker|singer|cosplay|plant|flower)\b/i.test(description)||
   /\b(vs|versus|with|and|team|tag|poster|collage)\b/i.test(file)){
   rejected.push({name,file,reason:"Potential unrelated person or multiple subjects"});continue;
  }
  if(known.has(file.toLowerCase())){rejected.push({name,file,reason:"Photo already assigned to another wrestler"});continue;}
  resolved.set(name,{file,author,license});known.add(file.toLowerCase());
 }
 await wait(900);
}
const additions=[...resolved];
if(additions.length){
 let cat=await readFile("src/ui/wrestler-portrait.ts","utf8");
 const marker="\n};\nconst knownAliases:",at=cat.indexOf(marker);
 if(at<0)throw Error("Catalogue insertion boundary not found");
 const entry=additions.map(([name,c])=>" "+JSON.stringify(normalizePortraitName(name))+":{file:"+
  JSON.stringify(c.file)+",author:"+JSON.stringify(c.author)+",license:"+JSON.stringify(c.license)+"},");
 cat=cat.slice(0,at)+(/,\s*$/.test(cat.slice(0,at))?"":",")+
  "\n // Recovered Commons evidence, independently metadata-verified.\n"+entry.join("\n")+cat.slice(at);
 await writeFile("src/ui/wrestler-portrait.ts",cat);
 let html=await readFile("apps/web/public/portrait-credits.html","utf8");
 const lines=additions.map(([name,c])=>"<li>"+escape(name)+" — "+escape(c.author)+
  ', <a href="https://commons.wikimedia.org/wiki/File:'+encodeURIComponent(c.file.replace(/ /g,"_"))+
  '">original photograph</a>, <a href="'+licenceLinks[c.license]+'">'+escape(c.license)+
  "</a>. The roster card crops at display time; original photo unchanged.</li>");
 html=html.replace("</ul>",lines.join("\n")+"\n</ul>");
 await writeFile("apps/web/public/portrait-credits.html",html);
}
for(const p of roster.people){
 const credit=resolved.get(p.name);
 if(credit){p.photo=credit;p.status="catalogued";}
}
for(const group of [assessment.people,cp.people]){
 for(const p of group){
  const credit=resolved.get(p.name);
  if(credit){p.photo=credit;p.status="catalogued";p.resolution="added-recovered";
   p.reason="Original solo Commons source title and wrestler-specific description verified with creator and licence";}
 }
}
roster.counts.catalogue+=additions.length;
roster.counts.existing=roster.people.filter(p=>p.photo).length;
roster.counts.missing=643-roster.counts.existing;
assessment.summary={...assessment.summary,genuineGenesisPhotos:roster.counts.existing,
 unresolved:roster.counts.missing,creditedSources:roster.counts.catalogue,
 coveragePercent:Math.round(roster.counts.existing/643*10000)/100,
 recoveredBulkAdditions:additions.length,
 caveat:"All credited files require independent Commons licence audit; identities lacking corroboration keep their initials."};
await Promise.all([
 writeFile("data/genesis-portrait-worklist.json",JSON.stringify(roster,null,2)+"\n"),
 writeFile("data/portrait-assessment.json",JSON.stringify(assessment,null,2)+"\n"),
 writeFile("data/portrait-discovery-checkpoint.json",JSON.stringify(cp,null,2)+"\n"),
 writeFile("data/recovered-source-decisions.json",JSON.stringify({checked:chosen.length,requests:calls,
  added:Object.fromEntries(resolved),rejected},null,2)+"\n")
]);
console.log(JSON.stringify({checked:chosen.length,requests:calls,added:resolved.size,
 rejected:rejected.length,covered:roster.counts.existing,missing:roster.counts.missing}));
