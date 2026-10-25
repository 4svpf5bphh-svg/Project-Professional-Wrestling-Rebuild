/** Rights-aware research only. Does not create art or make a photograph collectible.
 * Each candidate still requires a person-by-person image/identity/licence review.
 * Runs on the isolated development branch; no game database or browser network.
 */
import {writeFile,mkdir} from "node:fs/promises";
import {LEGENDS_CATALOGUE} from "../src/domain/legends-catalogue.js";
type Metadata={value?:string};
type Picture={url?:string;mime?:string;width?:number;height?:number;
 extmetadata?:{Artist?:Metadata;LicenseShortName?:Metadata;ImageDescription?:Metadata}};
type CommonsPage={title?:string;imageinfo?:Picture[]};
type SearchResult={query?:{pages?:CommonsPage[]}};
type Candidate={file:string;url:string;sourcePage:string;author:string;
 license:string;description:string;identityInTitle:boolean;identityInDescription:boolean;
 width:number;height:number;score:number;approved:false};
type LegendReport={id:string;name:string;state:"APPROVED_ASSET"|"RESEARCHED"|"NO_CLEAR_CANDIDATES"|"LOOKUP_FAILED";
 candidates:Candidate[];error?:string};
const allowed=new Set(["CC BY 2.0","CC BY 3.0","CC BY 4.0",
 "CC BY-SA 2.0","CC BY-SA 3.0","CC BY-SA 4.0","CC0"]);
const norm=(s:string)=>s.normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
 .toLowerCase().replace(/&[^;]+;/g," ").replace(/[^a-z0-9]+/g," ").trim()
 .replace(/\s+/g," ");
const plain=(s:string)=>s.replace(/<[^>]*>/g," ").replace(/&nbsp;/gi," ")
 .replace(/&amp;/gi,"&").replace(/&quot;/gi,'"').replace(/&#039;/g,"'")
 .replace(/\s+/g," ").trim().slice(0,1000);
const meta=(x?:Metadata)=>plain(x?.value??"");
const delay=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
async function commonsSearch(name:string):Promise<CommonsPage[]>{
 const url=new URL("https://commons.wikimedia.org/w/api.php");
 const params={action:"query",generator:"search",gsrsearch:'"'+name+'"',
  gsrnamespace:"6",gsrlimit:"20",prop:"imageinfo",iiprop:"url|size|mime|extmetadata",
  iiextmetadatafilter:"Artist|LicenseShortName|ImageDescription",
  formatversion:"2",format:"json",maxlag:"5"};
 Object.entries(params).forEach(([k,v])=>url.searchParams.set(k,v));
 for(let attempt=0;attempt<4;attempt++){
  try{
   const r=await fetch(url,{
    headers:{"User-Agent":"PPW-Legends-Image-Research/1.0 (https://github.com/4svpf5bphh-svg/Project-Professional-Wrestling-Rebuild; attribution audit)"},
    signal:AbortSignal.timeout(30000)
   });
   if(r.ok)return ((await r.json()) as SearchResult).query?.pages??[];
   if(![429,500,502,503,504].includes(r.status))throw Error("HTTP "+r.status);
  }catch(error){if(attempt===3)throw error;}
  await delay(1800*(attempt+1));
 }
 return [];
}
const reports:LegendReport[]=[];
for(const def of LEGENDS_CATALOGUE){
 if(def.cardAsset){
  reports.push({id:def.id,name:def.name,state:"APPROVED_ASSET",candidates:[]});
  continue;
 }
 let candidates:Candidate[]=[];
 let error:string|undefined;
 try{
  const pages=await commonsSearch(def.name);
  const needle=norm(def.name).replace(/^the /,"");
  candidates=pages.flatMap((p):Candidate[]=>{
   const info=p.imageinfo?.[0],file=p.title?.replace(/^File:/,"")??"";
   if(!info?.url||!/^https:\/\//.test(info.url)||!file||
      !/^image\/(jpeg|png|webp)$/.test(info.mime??""))return [];
   const licence=meta(info.extmetadata?.LicenseShortName);
   const author=meta(info.extmetadata?.Artist);
   const description=meta(info.extmetadata?.ImageDescription);
   if(!allowed.has(licence)||author.length<3||description.length<6||
      (info.width??0)<500||(info.height??0)<500)return [];
   const t=norm(file),d=norm(description),inTitle=t.includes(needle),
    inDescription=d.includes(needle);
   // Both independent metadata fields should name the person for fast review.
   // Even two matches never mean that artwork is approved or downloadable.
   if(!inTitle&&!inDescription)return [];
   const score=Number(inTitle)*3+Number(inDescription)*3+
     Number(/cropp?ed|portrait|headshot/i.test(file))*2+
     Number((info.height??0)>(info.width??0));
   return [{file,url:info.url,sourcePage:"https://commons.wikimedia.org/wiki/"+
    encodeURIComponent(p.title!.replace(/ /g,"_")),author,license:licence,
    description,identityInTitle:inTitle,identityInDescription:inDescription,
    width:info.width??0,height:info.height??0,score,approved:false}];
  }).sort((a,b)=>b.score-a.score).slice(0,5);
 }catch(e){error=e instanceof Error?e.message:String(e)}
 reports.push({id:def.id,name:def.name,state:error?"LOOKUP_FAILED":
  candidates.length?"RESEARCHED":"NO_CLEAR_CANDIDATES",candidates,...(error?{error}:{})});
 await delay(350);
}
const report={generatedAt:new Date().toISOString(),
 warning:"Candidate research, NOT visual/source approval or likeness clearance. Never use these as sellable card art without individually verifying the actual image, photographer and licence.",
 roster:reports.length,approvedAssets:reports.filter(x=>x.state==="APPROVED_ASSET").length,
 researchCandidates:reports.filter(x=>x.candidates.length).length,
 failed:reports.filter(x=>x.state==="LOOKUP_FAILED").length,legends:reports};
await mkdir("data",{recursive:true});
await writeFile("data/legend-photo-candidates.json",JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify({roster:report.roster,approvedAssets:report.approvedAssets,
 researchCandidates:report.researchCandidates,failed:report.failed,
 topMatches:reports.filter(x=>x.candidates.length).map(x=>({
  legend:x.name,files:x.candidates.slice(0,2).map(c=>c.file)}))}));
