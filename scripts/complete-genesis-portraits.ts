/** Full Genesis Commons discovery. Offline: no Neon, World writes or deployment. */
import {readFile,writeFile} from "node:fs/promises";
import {portraitCredit} from "../src/ui/wrestler-portrait.js";
type Credit={file:string;author:string;license:string};
type Person={name:string;division:string;promotions:string[];aliases:string[];status:string;photo:Credit|null};
type Candidate=Credit&{source:string;description:string;strong:boolean};
type Assessed=Person&{resolution:"existing"|"existing-alias"|"added"|"added-category"|"unresolved";reason:string;candidates:Candidate[]};
const people=(JSON.parse(await readFile("data/genesis-portrait-worklist.json","utf8")) as {people:Person[]}).people;
if(people.length!==643||new Set(people.map(p=>p.name)).size!==643)throw Error("Unexpected Genesis roster");
const assessed=new Map<string,Assessed>();
try{for(const p of (JSON.parse(await readFile("data/portrait-discovery-checkpoint.json","utf8")) as {people:Assessed[]}).people)if(!(process.env.PPW_RETRY_COMMONS_429==="1"&&p.reason.includes("HTTP 429")))assessed.set(p.name,p);}
catch{/* Fresh assessment. */}
const clean=(s:string)=>s.replace(/<[^>]+>/g," ").replace(/&amp;/gi,"&").replace(/&nbsp;/gi," ").replace(/&quot;/gi,'"').replace(/&#39;/g,"'").replace(/\s+/g," ").trim();
const norm=(s:string)=>s.normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[“”‘’"'()_,.()[\]{}–—\-]+/g," ").replace(/\s+/g," ").trim();
const contains=(hay:string,needle:string)=>(" "+norm(hay)+" ").includes(" "+norm(needle)+" ");
const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const ua="PPW-Genesis-Portrait-Audit/1.0 (github.com/4svpf5bphh-svg/Project-Professional-Wrestling-Rebuild; Commons author and licence research)";
async function request(url:string):Promise<any>{
 let reason="";
 for(let attempt=0;attempt<4;attempt++){
  try{const r=await fetch(url,{headers:{"User-Agent":ua},signal:AbortSignal.timeout(25000)});
   if(r.ok)return r.json();
   reason="HTTP "+r.status;
   if(![429,500,502,503,504].includes(r.status))break;
  }catch(e){reason=String(e);}
  await delay((attempt+1)*(attempt+1)*900);
 }
 throw Error(reason);
}
const permitted=new Set(["CC BY 2.0","CC BY 4.0","CC BY-SA 2.0","CC BY-SA 3.0","CC BY-SA 4.0","CC0"]);
const licenceUrl:Record<string,string>={
 "CC BY 2.0":"https://creativecommons.org/licenses/by/2.0/",
 "CC BY 4.0":"https://creativecommons.org/licenses/by/4.0/",
 "CC BY-SA 2.0":"https://creativecommons.org/licenses/by-sa/2.0/",
 "CC BY-SA 3.0":"https://creativecommons.org/licenses/by-sa/3.0/",
 "CC BY-SA 4.0":"https://creativecommons.org/licenses/by-sa/4.0/",
 "CC0":"https://creativecommons.org/publicdomain/zero/1.0/"};
const source=(f:string)=>"https://commons.wikimedia.org/wiki/File:"+encodeURIComponent(f.replace(/ /g,"_"));
const used=new Set(people.flatMap(p=>p.photo?[p.photo.file.toLowerCase()]:[]));
for(const a of assessed.values())if(a.resolution==="added"&&a.photo)used.add(a.photo.file.toLowerCase());
async function discover(p:Person):Promise<Assessed>{
 const existing=portraitCredit(p.name);
 if(existing)return {...p,photo:existing,resolution:"existing",reason:"Catalogue source retained; independent Commons audit required",candidates:[]};
 const variants=[...new Set([p.name,...p.aliases,p.name.normalize("NFKD").replace(/[\u0300-\u036f]/g,"")])].slice(0,process.env.PPW_RETRY_COMMONS_429==="1"?2:5);
 const hits=new Map<string,any>();let error="";
 for(const name of variants){
  const q=new URLSearchParams({action:"query",format:"json",formatversion:"2",generator:"search",
   gsrsearch:'"'+name.replace(/"/g,"")+'"',gsrnamespace:"6",gsrlimit:"12",prop:"imageinfo",
   iiprop:"url|mime|extmetadata",iiextmetadatafilter:"LicenseShortName|Artist|ImageDescription|Credit"});
  try{const r=await request("https://commons.wikimedia.org/w/api.php?"+q);
   for(const page of r.query?.pages??[])if(page.title&&!page.missing)hits.set(page.title,page);
  }catch(e){error=String(e);}
  if(hits.size>=18)break;
  await delay(process.env.PPW_RETRY_COMMONS_429==="1"?500:150);
 }
 const candidates:Candidate[]=[];
 for(const page of hits.values()){
  const info=page.imageinfo?.[0],meta=info?.extmetadata;
  if(!info?.url||!info.mime?.startsWith("image/")||!meta)continue;
  const file=String(page.title).replace(/^File:/,"").replace(/_/g," ");
  if(!/\.(jpg|jpeg|png|webp)$/i.test(file)||/cosplay|drawing|illustrat|artwork|poster|logo|figure|fan art|\bvs\.?\b|versus|\bteam\b|\band\b|\bwith\b/i.test(file))continue;
  const author=clean(meta.Artist?.value??""),license=clean(meta.LicenseShortName?.value??"");
  const description=clean(meta.ImageDescription?.value??"");
  if(!permitted.has(license)||author.length<3||author.length>180||/^(anonymous|unknown|not provided)$/i.test(author))continue;
  const titleMatch=variants.some(v=>contains(file.replace(/\.[^.]+$/,""),v));
  if(!titleMatch)continue;
  // A shared name is not identity proof (previous passes found a musician and
  // basketball player). Only wrestling-specific, singly identified evidence
  // may be promoted automatically. Everything else stays a review candidate.
  const credible=/\b(wrestler|professional wrestling|pro wrestling|wrestling|wwe|aew|njpw|stardom|tna|smackdown|raw|dynamite|nxt|ring of honor)\b/i.test(description)&&
   !/\b(basketball|musician|saxophone|singer|football|cosplay)\b/i.test(description);
  const independentMatch=credible&&variants.some(v=>norm(v).length>=7&&norm(v).includes(" ")&&
   contains(file.replace(/\.[^.]+$/,""),v)&&contains(description,v));
  candidates.push({file,author,license,source:source(file),
   description:description.slice(0,320),strong:independentMatch});
 }
 candidates.sort((a,b)=>Number(b.strong)-Number(a.strong));
 const strong=candidates.filter(c=>c.strong&&!used.has(c.file.toLowerCase()));
 if(strong.length===1){
  const c=strong[0]!;used.add(c.file.toLowerCase());
  return {...p,photo:{file:c.file,author:c.author,license:c.license},resolution:"added",
   reason:"Identity corroborated by file title and image description, with licensed Commons author",candidates};
 }
 return {...p,photo:null,resolution:"unresolved",
  reason:strong.length>1?"Ambiguous: several plausible photographs":candidates.length?
   "Identity not independently established or photograph duplicated":error?"Commons search problem: "+error:
   "No verifiable, commercially reusable Commons photograph",candidates};
}
const unprocessed=people.filter(p=>!assessed.has(p.name));let cursor=0,done=0;
async function worker(){
 while(cursor<unprocessed.length){
  const p=unprocessed[cursor++]!;
  try{assessed.set(p.name,await discover(p));}
  catch(e){assessed.set(p.name,{...p,photo:null,resolution:"unresolved",reason:"Discovery error: "+String(e),candidates:[]});}
  done++;
  if(done%25===0){
   await writeFile("data/portrait-discovery-checkpoint.json",JSON.stringify({people:[...assessed.values()]},null,2)+"\n");
   console.log("Assessed "+assessed.size+"/643");
  }
 }
}
await Promise.all(Array.from({length:process.env.PPW_RETRY_COMMONS_429==="1"?2:4},()=>worker()));
const ordered=people.map(p=>assessed.get(p.name)!);
await writeFile("data/portrait-discovery-checkpoint.json",JSON.stringify({people:ordered},null,2)+"\n");
const added=ordered.filter(p=>p.resolution==="added"&&p.photo&&!portraitCredit(p.name));
const previouslyCovered=people.filter(p=>portraitCredit(p.name)).length;
const missing=ordered.filter(p=>!p.photo);
const totalCovered=ordered.length-missing.length;
const summary={total:643,previouslyCovered,additionsThisPass:added.length,
 genuineGenesisPhotos:totalCovered,unresolved:missing.length,
 coveragePercent:Math.round(totalCovered*10000/643)/100,checkedAt:new Date().toISOString(),
 rateLimitedSearches:missing.filter(p=>p.reason.includes("HTTP 429")).length,
 caveat:"Name + wrestling-specific metadata corroboration; visual review and the independent Commons source audit remain compulsory. Never treat HTTP 429 as a photograph absence."};
await writeFile("data/portrait-assessment.json",JSON.stringify({summary,people:ordered},null,2)+"\n");
const toAppend=added;
if(toAppend.length){
 let catalogue=await readFile("src/ui/wrestler-portrait.ts","utf8");
 const anchor="\n};\nconst knownAliases:";
 if(!catalogue.includes(anchor))throw Error("Portrait catalogue boundary changed");
 const entries=toAppend.map(p=>{
  const key=p.name.trim().toLowerCase().replace(/[‘’]/g,"'").replace(/\s+/g," ");
  const c=p.photo!;
  return " "+JSON.stringify(key)+":{file:"+JSON.stringify(c.file)+",author:"+JSON.stringify(c.author)+",license:"+JSON.stringify(c.license)+"},";
 }).join("\n");
 const at=catalogue.indexOf(anchor),head=catalogue.slice(0,at);
 catalogue=head+(/,\s*$/.test(head)?"":",")+"\n // Commons corroborated Genesis additions\n"+entries+catalogue.slice(at);
 await writeFile("src/ui/wrestler-portrait.ts",catalogue);
 let credits=await readFile("apps/web/public/portrait-credits.html","utf8");
 const escape=(s:string)=>s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
 const lines=toAppend.map(p=>"<li>"+escape(p.name)+" — "+escape(p.photo!.author)+
  ', <a href="'+escape(source(p.photo!.file))+'">source photo</a>, <a href="'+licenceUrl[p.photo!.license]+
  '">'+escape(p.photo!.license)+"</a>. Display-time crop only; source unmodified.</li>").join("\n");
 if(!credits.includes("</ul>"))throw Error("Missing attribution list");
 credits=credits.replace("</ul>",lines+"\n</ul>");
 await writeFile("apps/web/public/portrait-credits.html",credits);
 // Keep the exact Genesis inventory in sync with newly credited identities.
 const work=JSON.parse(await readFile("data/genesis-portrait-worklist.json","utf8"));
 const byName=new Map(ordered.map(p=>[p.name,p]));
 for(const p of work.people){
  const current=byName.get(p.name);
  if(current?.photo){p.photo=current.photo;p.status="catalogued";}
 }
 work.counts.existing=work.people.filter((p:Person)=>p.photo).length;
 work.counts.missing=643-work.counts.existing;
 work.counts.catalogue+=toAppend.length;
 await writeFile("data/genesis-portrait-worklist.json",JSON.stringify(work,null,2)+"\n");
}
console.log(JSON.stringify(summary));
console.log("Fallback identities: "+missing.map(p=>p.name).join(" | "));
