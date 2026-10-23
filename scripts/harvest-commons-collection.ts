/**
 * Bulk, metadata-verified Commons photographer-category sweep; never touches Neon.
 * Only a single person's recognisable title AND independent description may
 * enter the game. Ambiguous / unidentified sources remain review candidates.
 */
import {readFile,writeFile} from "node:fs/promises";
import {portraitCredit,normalizePortraitName} from "../src/ui/wrestler-portrait.js";
type Person={name:string;division:string;promotions:string[];aliases:string[];status:string;photo:{file:string;author:string;license:string}|null};
type Candidate={person:string;file:string;author:string;license:string;source:string;description:string;reason:string};
const inventory=JSON.parse(await readFile("data/genesis-portrait-worklist.json","utf8")) as
 {counts:Record<string,any>;people:Person[]};
const strip=(s:string)=>s.replace(/<[^>]*>/g," ").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&quot;/gi,'"').replace(/\s+/g," ").trim();
const norm=(s:string)=>s.normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase()
 .replace(/[\u2018\u2019\u201c\u201d'"().,_[\]{}\-–—]+/g," ").replace(/\s+/g," ").trim();
const ua="PPW-Genesis-Portraits/1.0 (github.com/4svpf5bphh-svg/Project-Professional-Wrestling-Rebuild; Wikimedia image licence research)";
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function api(args:Record<string,string>){
 const q=new URLSearchParams({...args,format:"json",formatversion:"2"});
 for(let attempt=0;attempt<4;attempt++){
  const r=await fetch("https://commons.wikimedia.org/w/api.php?"+q,{
   headers:{"User-Agent":ua},signal:AbortSignal.timeout(25000)});
  if(r.ok)return r.json() as Promise<any>;
  if(![429,500,502,503,504].includes(r.status))throw Error("Commons HTTP "+r.status);
  await sleep(1000*(attempt+1)**2);
 }
 throw Error("Commons fetch exhausted retries");
}
const allTitles:string[]=[];
const uniqueTitles=new Set<string>();
for(const category of ["Photographs by Joyful Violence",
 "Photographs by KMcWrestling Photography (2026)",
 "Photographs by KMcWrestling Photography (2025)",
 "Photographs by Diego Serrano"]){
 let next="";
 do{
  const result=await api({action:"query",list:"categorymembers",
   cmtitle:"Category:"+category,cmtype:"file",cmlimit:"500",
   ...(next?{cmcontinue:next}:{})});
  for(const title of (result.query?.categorymembers??[]).map((x:{title:string})=>x.title)){
   if(uniqueTitles.has(title))continue;
   uniqueTitles.add(title);allTitles.push(title);
  }
  next=result.continue?.cmcontinue??"";
 }while(next);
}
const aliases:Record<string,string[]>={"alex hammerstone":["alexander hammerstone"],
 "the dkc":["the d k c"],"effy":["effy"],"kzy":["kzy"]};
const singles=(p:Person)=>[p.name,...p.aliases,...(aliases[norm(p.name)]??[])].map(norm).filter(Boolean);
const candidates=new Map<string,Candidate[]>();
const allowed=new Set(["CC BY 2.0","CC BY 4.0","CC BY-SA 2.0","CC BY-SA 3.0","CC BY-SA 4.0","CC0"]);
const selectedFiles=new Set(inventory.people.flatMap(p=>p.photo?[p.photo.file.toLowerCase()]:[]));
let checked=0;
for(let start=0;start<allTitles.length;start+=20){
 const titles=allTitles.slice(start,start+20);
 const result=await api({action:"query",prop:"imageinfo",titles:titles.join("|"),
  iiprop:"url|mime|extmetadata",iiextmetadatafilter:"Artist|LicenseShortName|ImageDescription"});
 for(const page of result.query?.pages??[]){
  const raw=page.title?.replace(/^File:/,"").replace(/_/g," ");
  const image=page.imageinfo?.[0],meta=image?.extmetadata;
  if(!raw||!meta||!image.url||!/^image\/(jpeg|png|webp)$/.test(image.mime??""))continue;
  const title=norm(raw.replace(/\.(jpg|jpeg|png|webp)$/i,""));
  if(/\b(and|with|vs|versus|team|tag|group|cosplay|drawing|illustration|artwork)\b/i.test(title))continue;
  const author=strip(meta.Artist?.value??""),license=strip(meta.LicenseShortName?.value??"");
  const desc=strip(meta.ImageDescription?.value??"");
  if(!allowed.has(license)||author.length<3||author.length>180||!desc)continue;
  for(const p of inventory.people){
   if(p.photo||portraitCredit(p.name))continue;
   const search=singles(p).filter(n=>n.length>=3);
   const match=search.find(n=>{
    if(title===n)return true;
    if(!title.startsWith(n+" "))return false;
    if(n.includes(" "))return true;
    // Single-name wrestlers must not borrow a different person's surname.
    return /^(in |19\\d{2}|20\\d{2}|wrestler\\b)/.test(title.slice(n.length+1));
   });
   if(!match||!search.some(n=>{
    const d=" "+norm(desc)+" ";
    return d.includes(" "+n+" ");
   }))continue;
   const c:Candidate={person:p.name,file:raw,author,license,
    source:"https://commons.wikimedia.org/wiki/File:"+encodeURIComponent(raw.replace(/ /g,"_")),
    description:desc.slice(0,300),
    reason:"Unique performer name corroborated in image title and independent Commons description"};
   candidates.set(p.name,[...(candidates.get(p.name)??[]),c]);
  }
  checked++;
 }
 await sleep(250);
}
let added=0,skipped=0;
let catalogue=await readFile("src/ui/wrestler-portrait.ts","utf8");
let credits=await readFile("apps/web/public/portrait-credits.html","utf8");
const licenseUrls:Record<string,string>={"CC BY 2.0":"https://creativecommons.org/licenses/by/2.0/",
 "CC BY 4.0":"https://creativecommons.org/licenses/by/4.0/",
 "CC BY-SA 2.0":"https://creativecommons.org/licenses/by-sa/2.0/",
 "CC BY-SA 3.0":"https://creativecommons.org/licenses/by-sa/3.0/",
 "CC BY-SA 4.0":"https://creativecommons.org/licenses/by-sa/4.0/",
 "CC0":"https://creativecommons.org/publicdomain/zero/1.0/"};
const escape=(s:string)=>s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const lines:string[]=[],entryLines:string[]=[];
for(const p of inventory.people){
 if(p.photo||portraitCredit(p.name))continue;
 const list=(candidates.get(p.name)??[]).filter(c=>!selectedFiles.has(c.file.toLowerCase()));
 if(!list.length)continue;
 // Multiple distinct candidates can be the same person. Prefer a cropped headshot,
 // but never claim a match if different descriptions introduce ambiguity.
 list.sort((a,b)=>Number(/cropped/i.test(b.file))-Number(/cropped/i.test(a.file)));
 const x=list[0]!;
 const fileNames=list.map(c=>norm(c.description));
 if(fileNames.some(v=>v!==fileNames[0])){skipped++;continue;}
 selectedFiles.add(x.file.toLowerCase());
 p.photo={file:x.file,author:x.author,license:x.license};p.status="catalogued";added++;
 const key=normalizePortraitName(p.name);
 entryLines.push(" "+JSON.stringify(key)+":{file:"+JSON.stringify(x.file)+
  ",author:"+JSON.stringify(x.author)+",license:"+JSON.stringify(x.license)+"},");
 lines.push("<li>"+escape(p.name)+" — "+escape(x.author)+
  ', <a href="'+escape(x.source)+'">source photograph</a>, <a href="'+
  licenseUrls[x.license]+'">'+escape(x.license)+
  "</a>. Existing Commons crops are credited; PPW uses only display-time cropping.</li>");
}
if(entryLines.length){
 const marker="\n};\nconst knownAliases:";
 if(!catalogue.includes(marker))throw Error("Catalogue anchor missing");
 const pos=catalogue.indexOf(marker);
 const before=catalogue.slice(0,pos);
 const joiner=/,\s*$/.test(before)?"":",";
 catalogue=before+joiner+"\n // Metadata corroborated from Commons photographer category.\n"+
  entryLines.join("\n")+catalogue.slice(pos);
 await writeFile("src/ui/wrestler-portrait.ts",catalogue);
 credits=credits.replace("</ul>",lines.join("\n")+"\n</ul>");
 await writeFile("apps/web/public/portrait-credits.html",credits);
}
inventory.counts.existing=inventory.people.filter(p=>p.photo).length;
inventory.counts.missing=inventory.people.length-inventory.counts.existing;
inventory.counts.catalogue=Object.keys((await import("../src/ui/wrestler-portrait.js")).portraitCatalogue).length+added;
await writeFile("data/genesis-portrait-worklist.json",JSON.stringify(inventory,null,2)+"\n");
const report={checkedFiles:checked,catalogueFilesInCategory:allTitles.length,additions:added,ambiguous:skipped,
 nowCovered:inventory.counts.existing,missing:inventory.counts.missing,
 note:"Category photo identities corroborated by source metadata; manual visual review remains important.",
 candidates:Object.fromEntries(candidates)};
await writeFile("data/commons-collection-report.json",JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify({checked,allTitles:allTitles.length,added,skipped,covered:inventory.counts.existing}));
