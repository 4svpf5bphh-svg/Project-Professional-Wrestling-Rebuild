/**
 * Bulk Commons audit. Run: npm run portraits:audit
 * No Neon usage, no writes, and no runtime requests from the game.
 * Requests are batched, with a pause and retry for Wikimedia rate limits.
 */
import {portraitCatalogue} from "../src/ui/wrestler-portrait.js";
import {writeFile} from "node:fs/promises";

type Finding={name:string;file:string;status:"verified"|"missing"|"mismatch"|"error";reason?:string;actualLicense?:string;actualArtist?:string};
const entries=Object.entries(portraitCatalogue);
const findings:Finding[]=[];
const strip=(s:string)=>s.replace(/<[^>]*>/g," ").replace(/&amp;/g,"&").replace(/&nbsp;/g," ").replace(/\s+/g," ").trim();
const wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function query(files:string[]):Promise<any>{
 const params=new URLSearchParams({action:"query",format:"json",formatversion:"2",prop:"imageinfo",iiprop:"url|extmetadata",iiextmetadatafilter:"LicenseShortName|Artist|Credit",titles:files.map(file=>"File:"+file).join("|")});
 for(let attempt=0;attempt<4;attempt++){
  const response=await fetch("https://commons.wikimedia.org/w/api.php?"+params,{headers:{"User-Agent":"PPWPortraitAudit/1.1 (source, creator and commercial-reuse licence verification; PPW-Rebuild)"}});
  if(response.ok)return response.json();
  if(![429,502,503,504].includes(response.status))throw Error("Commons HTTP "+response.status);
  const retryHeader=Number(response.headers.get("retry-after"));
  // Commons frequently responds 429 when larger catalogues burst requests.
  // Honour its retry guidance, otherwise back off sufficiently to recover.
  const ms=response.status===429?
   Number.isFinite(retryHeader)&&retryHeader>0?Math.min(120000,retryHeader*1000):
    12000*(attempt+1):
   2500*(attempt+1);
  await wait(ms);
 }
 throw Error("Commons rate limit or service unavailable");
}
for(let offset=0;offset<entries.length;offset+=25){
 const batch=entries.slice(offset,offset+25);
 try{
  const data=await query(batch.map(([,credit])=>credit.file));
  const pages=new Map<string,any>((data.query?.pages??[]).map((page:any)=>[page.title.replace(/^File:/,"").replace(/_/g," "),page]));
  for(const [name,credit] of batch){
   const page=pages.get(credit.file.replace(/_/g," "));
   const meta=page?.imageinfo?.[0]?.extmetadata;
   const license=strip(meta?.LicenseShortName?.value??"");
   const artist=strip(meta?.Artist?.value??"");
   if(!page||page.missing||!page.imageinfo?.length)findings.push({name,file:credit.file,status:"missing",reason:"Commons file not found"});
   else if(!license||!artist)findings.push({name,file:credit.file,status:"mismatch",reason:"Missing Commons artist/license metadata",actualLicense:license,actualArtist:artist});
   else if(license.toLowerCase().replace(/[^a-z0-9]/g,"")!==credit.license.toLowerCase().replace(/[^a-z0-9]/g,"")||!artist.toLowerCase().includes(credit.author.toLowerCase()))findings.push({name,file:credit.file,status:"mismatch",reason:"Commons license or artist differs",actualLicense:license,actualArtist:artist});
   else findings.push({name,file:credit.file,status:"verified",actualLicense:license,actualArtist:artist});
  }
 }catch(error){
  for(const [name,credit] of batch)findings.push({name,file:credit.file,status:"error",reason:String(error)});
 }
 await wait(2800);
}
const counts=Object.fromEntries(["verified","missing","mismatch","error"].map(status=>[status,findings.filter(x=>x.status===status).length]));
const output={checkedAt:new Date().toISOString(),counts,findings};
await writeFile("portrait-audit.json",JSON.stringify(output,null,2)+"\n");
console.log(JSON.stringify(counts));
for(const f of findings.filter(x=>x.status!=="verified"))console.log(f.status+" "+f.name+": "+f.reason+" "+(f.actualLicense??""));
if(findings.some(x=>x.status!=="verified"))process.exitCode=1;
