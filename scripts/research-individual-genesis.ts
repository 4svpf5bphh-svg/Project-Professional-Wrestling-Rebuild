/** Batch research of rate-limited Genesis identities. Never changes the game or Neon. */
import {readFile,writeFile} from "node:fs/promises";
type Person={name:string;aliases:string[];photo:unknown;reason:string};
const previous=JSON.parse(await readFile("data/portrait-assessment.json","utf8")) as {people:Person[]};
const pending=previous.people.filter(p=>!p.photo&&p.reason.includes("HTTP 429"));
const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const clean=(s:string)=>s.replace(/<[^>]+>/g," ").replace(/&amp;/g,"&").replace(/&nbsp;/g," ").replace(/\s+/g," ").trim();
const norm=(s:string)=>s.normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase()
 .replace(/[^\p{L}\p{N}]+/gu," ").trim();
const contains=(s:string,n:string)=>(" "+norm(s)+" ").includes(" "+norm(n)+" ");
const allowed=new Set(["CC BY 2.0","CC BY 4.0","CC BY-SA 2.0","CC BY-SA 3.0","CC BY-SA 4.0","CC0"]);
const byName:Record<string,any>={};
let processed=0;
let calls=0,rateLimited=false;
async function search(q:string){
 const params=new URLSearchParams({action:"query",format:"json",formatversion:"2",generator:"search",
 gsrsearch:q,gsrnamespace:"6",gsrlimit:"90",prop:"imageinfo",
 iiprop:"url|mime|extmetadata",iiextmetadatafilter:"Artist|LicenseShortName|ImageDescription"});
 for(let attempt=0;attempt<3;attempt++){
  calls++;
  const response=await fetch("https://commons.wikimedia.org/w/api.php?"+params,{
   headers:{"User-Agent":"PPW-PortraitIndividual/1.1 (source and licence research; github.com/4svpf5bphh-svg/Project-Professional-Wrestling-Rebuild)"},
   signal:AbortSignal.timeout(30000)});
  if(response.ok)return (await response.json()).query?.pages??[];
  if(response.status===429){
   const after=Number(response.headers.get("retry-after"));
   await pause(Number.isFinite(after)&&after>0?Math.min(after*1000,60000):10000*(attempt+1));
  }else if([502,503,504].includes(response.status))await pause(2000*(attempt+1));
  else throw Error("Commons HTTP "+response.status);
 }
 rateLimited=true;throw Error("Commons HTTP 429");
}
for(let i=0;i<pending.length;i++){
 const six=[pending[i]!],query='"'+six[0]!.name.replace(/"/g,"")+'"';
 let pages:any[]=[];
 try{pages=await search(query);}catch(e){for(const p of six)byName[p.name]={error:String(e),candidates:[]};}
 for(const p of six){
  if(byName[p.name])continue;
  const aliases=[p.name,...p.aliases].filter(s=>norm(s).length>=5);
  const candidates:any[]=[];
  for(const page of pages){
   const file=String(page.title??"").replace(/^File:/,"").replace(/_/g," ");
   const info=page.imageinfo?.[0],metadata=info?.extmetadata;
   if(!info?.url||!metadata||!["image/jpeg","image/png","image/webp"].includes(info.mime))continue;
   const license=clean(metadata.LicenseShortName?.value??"");
   const author=clean(metadata.Artist?.value??"");
   const description=clean(metadata.ImageDescription?.value??"");
   if(!allowed.has(license)||author.length<3||!description)continue;
   if(!aliases.some(a=>contains(file,a)&&contains(description,a)))continue;
   candidates.push({file,author,license,description:description.slice(0,280),
    source:"https://commons.wikimedia.org/wiki/File:"+encodeURIComponent(file.replace(/ /g,"_")),
    singleSubject:!/\b(and|with|vs|versus|team|trios|cosplay|illustration)\b/i.test(file),
    wrestlingContext:/\b(wrestler|pro wrestling|professional wrestling|luchador|lucha libre|wwe|aew|njpw|tna|stardom)\b/i.test(description)});
  }
  byName[p.name]={candidates,error:candidates.length?null:"No matching credited image in this grouped search"};
 }
 if(rateLimited){
  for(const p of pending.slice(i+1))byName[p.name]={candidates:[],error:"Commons HTTP 429: deferred"};
  break;
 }
 processed++;
 if(processed%15===0)await writeFile("data/genesis-individual-candidates.json",JSON.stringify({summary:{targeted:pending.length,requests:calls,processed,rateLimited},people:byName},null,2)+"\n");
 await pause(1600);
}
const summary={targeted:pending.length,requests:calls,rateLimited,processed,
 candidates:Object.values(byName).reduce((n:any,v:any)=>n+v.candidates.length,0),
 withCandidates:Object.values(byName).filter((v:any)=>v.candidates.length).length};
await writeFile("data/genesis-individual-candidates.json",JSON.stringify({summary,people:byName},null,2)+"\n");
console.log(JSON.stringify(summary));
