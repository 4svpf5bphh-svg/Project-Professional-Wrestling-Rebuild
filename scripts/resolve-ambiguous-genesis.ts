/** Offline identity-sensitive review of previously ambiguous Commons metadata.
 * Filename choices below come from actual search candidates, never fabricated.
 * No photos enter the game unless the exact same source record has author,
 * reusable licence and independent identity support. No Neon or remote writes.
 */
import {readFile,writeFile} from "node:fs/promises";
import {portraitCredit,normalizePortraitName} from "../src/ui/wrestler-portrait.js";
const curated:Readonly<Record<string,string>>={
  "Aaron Rourke": "Aaron Rourke posing 12162019.jpg",
  "Akira Tozawa": "Akira Tozawa YLC.jpg",
  "Baron Corbin": "Baron Corbin WrestleMania 32 Axxess.jpg",
  "Je'Von Evans": "Je'Von Evans (cropped).jpg",
  "Johnny Gargano": "Johnny Gargano YLC 2008 7.jpg",
  "Josh Briggs": "Josh Briggs, July 2019 (cropped).jpg",
  "Tony D'Angelo": "Tony D’Angelo (cropped).jpg",
  "Alex Reynolds": "Alex Reynolds September 2018 (cropped).jpg",
  "Alex Shelley": "Alex Shelley February 2016.png",
  "Ariya Daivari": "Ariya Daivari in 2025 (cropped).jpg",
  "Austin Gunn": "Austin Gunn, June 2022.jpg",
  "Billy Gunn": "Billy Gunn 2012.png",
  "Brandon Cutler": "Brandon Cutler (cropped).jpg",
  "Brian Cage": "Brian Cage 2017 (cropped).jpg",
  "Dezmond Xavier": "Dezmond Xavier 2019.jpg",
  "Dustin Rhodes": "Dustin Rhodes, October 2019 (cropped).jpg",
  "Evil Uno": "Evil Uno (cropped).jpg",
  "Josh Alexander": "Josh Alexander SCW 2012.jpg",
  "Josh Woods": "Josh Woods 2025 (cropped).jpg",
  "Jack Perry": "Jack Perry as AEW TNT Champion (cropped2).jpg",
  "Katsuyori Shibata": "Katsuyori Shibata November 2016.png",
  "Kevin Knight": "Kevin Knight at AEW Dynamite - August 27 2025 (cropped).jpg",
  "Kip Sabian": "Kip Sabian in September 2024 (cropped).jpg",
  "Mason Madden": "Mason Madden (cropped).jpg",
  "Matt Sydal": "Matt Sydal - Evan Bourne.jpg",
  "Max Caster": "Max Caster Nov 2019 (cropped).jpg",
  "Mike Bennett": "Mike Bennett, February 2010 02.jpg",
  "Myron Reed": "Myron Reed 2025.png",
  "Dick Togo": "Dick Togo Chikara.jpg",
  "El Phantasmo": "El Phantasmo at ASW.jpg",
  "Master Wato": "Master Wato.jpg",
  "Taiji Ishimori": "Taiji Ishimori 22 Sep 2015.jpg",
  "Bear Bronson": "Bear Bronson 2023.jpg",
  "John Skyler": "John Skyler.jpg",
  "Leon Slater": "Leon Slater (SovPro) (cropped).jpg",
  "Mustafa Ali": "Mustafa Ali Wm34 crop.jpg",
  "Rich Swann": "Rich Swann 2019-07-05 (cropped).jpg",
  "Masato Tanaka": "Masato Tanaka.jpg",
  "La Parka": "La Parka, Campeonato XX del Vive Latino.jpg",
  "Laredo Kid": "Laredo Kid 2.jpg",
  "Mr. Iguana": "Mr Iguana at San Diego Comic Con 2026.jpg",
  "Psycho Clown": "Psycho Clown 2024 08 (cropped).jpg",
  "Matt Riddle": "Matt Riddle as EVOLVE Champion, June 2018 02.jpg",
  "Tom Lawlor": "Tom Lawlor june 2019.jpg",
  "Colin Delaney": "Colin Delaney, February 2010 02.jpg",
  "Joey Janela": "Joey Janela Oct 2019 (cropped).jpg",
  "Sammy Guevara": "Sammy Guevara (2021-07-14) (cropped).jpg",
  "Shelton Benjamin": "Shelton Benjamin ROH Cropped (cropped).jpg",
  "Wheeler Yuta": "Wheeler Yuta (2021-07-14) (cropped).jpg",
  "Toa Liona": "Toa Liona at All In 2024 (cropped).jpg",
  "Tony Nese": "Tony Nese.jpg",
  "Sha Samuels": "Sha Samuels at Night 1 of CHIKARA's King of Trios (cropped).jpg",
  "Keith Lee": "Keith Lee, May 2018 (cropped).jpg",
  "Axel Tischer": "Axel Tischer, June 2022 17 (cropped).jpg",
  "Mark Haskins": "Mark Haskins with Smash belt.jpg",
  "Satnam Singh": "Satnam Singh FULL GEAR 2023 11 18 005 (cropped).jpg",
  "Tommy End": "Wrestler TOMMY END cr.jpg",
  "Tomohiro Ishii": "Tomohiro Ishii in 2025.jpg",
  "Tetsuya Naito": "Tetsuya Naito november 2018.jpg",
  "Maxxine Dupri": "Maxxine dupri main event 12 january 2026 (cropped).jpg",
  "Nikkita Lyons": "Nikkita Lyons Powerful Look (cropped).jpg",
  "Sol Ruca": "Sol Ruca as women's IC Champion (cropped).jpg",
  "Taya Valkyrie": "Taya Valkyrie, April 2016 (cropped).jpg",
  "Madison Rayne": "Madison Rayne October 2010.jpg",
  "Tasha Steelz": "Tasha Steelz, April 2018 (cropped).jpg",
  "Lady Shani": "Lady Shani Ecatepec.jpg",
  "Bea Priestley": "Bea Priestley, October 2019 (cropped).jpg",
  "Maki Itoh": "Maki Itoh at Ryogoku Kokugikan, 2026-08-23.jpg",
  "Miu Watanabe": "TJPW's wrestler Miu Watanabe 1.jpg",
  "Shoko Nakajima": "TJPW's wrestler Shoko Nakajima 2 (cropped).jpg",
  "Billie Starkz": "Billie Starkz AEW.jpg",
  "Lady Frost": "Lady Frost, November 2019 (cropped).jpg",
  "Danhausen": "Danhausen, November 2019 (headshot).jpg",
  "Hechicero": "Hechicero at ROH Death Before Dishonor - August 29 2025.jpg",
  "Komander": "Komander Luchador (cropped).jpg",
  "Místico": "Mistico posing BW crop.jpg",
  "Kushida": "KUSHIDA at BCW East meets West 2.jpg",
  "Xelhua": "Xelhua conectando con la audiencia en la Arena Puebla.jpg",
  "Ethan Page": "Ethan Page (cropped).jpg",
  "Ricky Sosa": "Ricky Sosa (cropped).jpg"
};
type Credit={file:string;author:string;license:string};
type Person={name:string;aliases:string[];status:string;photo:Credit|null};
type Candidate=Credit&{strong:boolean;description:string;source:string};
type Decision=Person&{resolution:string;reason:string;candidates?:Candidate[]};
const accepted=new Set(["CC BY 2.0","CC BY 4.0","CC BY-SA 2.0","CC BY-SA 3.0","CC BY-SA 4.0","CC0"]);
const licenseUrls:Record<string,string>={"CC BY 2.0":"https://creativecommons.org/licenses/by/2.0/",
 "CC BY 4.0":"https://creativecommons.org/licenses/by/4.0/",
 "CC BY-SA 2.0":"https://creativecommons.org/licenses/by-sa/2.0/",
 "CC BY-SA 3.0":"https://creativecommons.org/licenses/by-sa/3.0/",
 "CC BY-SA 4.0":"https://creativecommons.org/licenses/by-sa/4.0/",
 "CC0":"https://creativecommons.org/publicdomain/zero/1.0/"};
const esc=(s:string)=>s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const names=new Set(Object.keys(curated));
const data=JSON.parse(await readFile("data/portrait-assessment.json","utf8")) as {summary:Record<string,unknown>;people:Decision[]};
const work=JSON.parse(await readFile("data/genesis-portrait-worklist.json","utf8")) as {counts:Record<string,any>;people:Person[]};
const cp=JSON.parse(await readFile("data/portrait-discovery-checkpoint.json","utf8")) as {people:Decision[]};
const byName=new Map(data.people.map(p=>[p.name,p]));
const rows=new Map(work.people.map(p=>[p.name,p]));
const taken=new Set(work.people.flatMap(p=>p.photo?[p.photo.file.toLowerCase()]:[]));
let catalogue=await readFile("src/ui/wrestler-portrait.ts","utf8");
let credits=await readFile("apps/web/public/portrait-credits.html","utf8");
const presentFiles=new Set([...credits.matchAll(/wiki\/File:([^"]+)/g)].map(m=>decodeURIComponent(m[1]!).replace(/_/g," ").toLowerCase()));
const additions:{name:string;credit:Credit;source:string;description:string}[]=[];
const unresolved:{name:string;reason:string}[]=[];
for(const [name,file] of Object.entries(curated)){
 const p=byName.get(name),person=rows.get(name);
 if(!p||!person){throw Error("Curated name absent from Genesis: "+name);}
 if(p.photo||portraitCredit(name)){unresolved.push({name,reason:"Already covered"});continue;}
 const candidate=p.candidates?.find(x=>x.file===file);
 const wikilinkDescription=candidate?.description.includes("w:"+name)&&
  /professional wrestler/i.test(candidate.description)&&candidate.file.startsWith(name);
 const namedWrestlingSubject=candidate&&
  /\b(wrestler|wrestling|luchador|lucha libre|post-match|ring of honor|arena puebla|bcw)\b/i.test(candidate.description)&&
  (" "+candidate.description.toLowerCase().replace(/[^\p{L}\p{N}]+/gu," ")+" ")
   .includes(" "+name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[^\p{L}\p{N}]+/gu," ").trim()+" ");
 if(!candidate||(!candidate.strong&&!wikilinkDescription&&!namedWrestlingSubject)){
  unresolved.push({name,reason:"No independent identity corroboration for selected file"});continue;
 }
 if(!accepted.has(candidate.license)||candidate.author.trim().length<3||
  !/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/.test(candidate.source)||
  !candidate.description||candidate.description.length<8){
  unresolved.push({name,reason:"Missing verified source/author/licence/description"});continue;
 }
 const lower=candidate.description.toLowerCase();
 if(/\b(basketball|linebacker|musician|saxophone|flower|hemerocallis|football player|singer)\b/.test(lower)){
  unresolved.push({name,reason:"Unrelated person or misleading same-name photograph"});continue;
 }
 if(/\b(vs|versus|\band\b|tag team|trios)\b/i.test(file)&&!file.toLowerCase().includes("(cropped)")){
  unresolved.push({name,reason:"Multi-person/uncropped action photo"});continue;
 }
 if(taken.has(file.toLowerCase())||presentFiles.has(file.toLowerCase())){
  unresolved.push({name,reason:"Photo already attributed to another identity"});continue;
 }
 // Deliberately authored file selection is the identity review. This check
 // independently requires that the Commons description actually names the
 // same performer, not merely a similarly named artist or unrelated athlete.
 const normalized=(s:string)=>s.normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
  .toLowerCase().replace(/[^\p{L}\p{N}]+/gu," ").trim();
 const subject=normalized(name),desc=normalized(candidate.description),title=normalized(file);
 if(!(" "+desc+" ").includes(" "+subject+" ")||
   !(" "+title+" ").includes(" "+subject+" ")){
  unresolved.push({name,reason:"Identity not present independently in source title and description"});continue;
 }
 const credit={file:candidate.file,author:candidate.author,license:candidate.license};
 additions.push({name,credit,source:candidate.source,description:candidate.description});
 taken.add(file.toLowerCase());presentFiles.add(file.toLowerCase());
}
const restoredAliases:Readonly<Record<string,string>>={
 "zelina":"zelina vega",
 "britt baker d.m.d.":"britt baker",
 "killer kross":"karrion kross"
};
const entries=additions.map(({name,credit})=>" "+JSON.stringify(normalizePortraitName(name))+":{file:"+
 JSON.stringify(credit.file)+",author:"+JSON.stringify(credit.author)+",license:"+JSON.stringify(credit.license)+"},");
const anchor="\n};\nconst knownAliases:",pos=catalogue.indexOf(anchor);
if(pos<0)throw Error("Catalogue closing boundary moved");
if(entries.length){
 catalogue=catalogue.slice(0,pos)+(/,\s*$/.test(catalogue.slice(0,pos))?"":",")+
  "\n // Manually identity-selected and evidence corroborated Commons photographs\n"+
  entries.join("\n")+catalogue.slice(pos);
 const aliasAnchor="const knownAliases:Readonly<Record<string,string>>={\n";
 if(!catalogue.includes(aliasAnchor))throw Error("Missing known ring names");
 catalogue=catalogue.replace(aliasAnchor,aliasAnchor+
  Object.entries(restoredAliases).map(([alias,identity])=>
   " "+JSON.stringify(alias)+":"+JSON.stringify(identity)+",").join("\n")+"\n");
 await writeFile("src/ui/wrestler-portrait.ts",catalogue);
 const html=additions.map(({name,credit,source})=>"<li>"+esc(name)+" — "+esc(credit.author)+
  ', <a href="'+esc(source)+'">source photo</a>, <a href="'+licenseUrls[credit.license]+'">'+
  esc(credit.license)+"</a>. Card crop is a display-time modification; source unchanged.</li>");
 credits=credits.replace("</ul>",html.join("\n")+"\n</ul>");
 await writeFile("apps/web/public/portrait-credits.html",credits);
 const found=new Map(additions.map(x=>[x.name,x]));
 for(const p of work.people){
  const c=found.get(p.name);
  if(c){p.photo=c.credit;p.status="catalogued";}
 }
 const reclaimed:string[]=[];
 for(const [alias,identity] of Object.entries(restoredAliases)){
  const p=work.people.find(x=>normalizePortraitName(x.name)===alias);
  const credit=portraitCredit(identity);
  if(!p||!credit)throw Error("Verified legacy ring-name photo cannot be reconciled: "+alias);
  if(!p.photo){p.photo=credit;p.status="catalogued";reclaimed.push(p.name);}
 }
 work.counts.unmatchedCatalogue=(work.counts.unmatchedCatalogue as string[])
  .filter(key=>!Object.values(restoredAliases).includes(key));
 for(const group of [data.people,cp.people]){
  for(const p of group){
   const c=found.get(p.name);
   if(c){p.photo=c.credit;p.resolution="added-curated";p.reason="Selected individual authenticated Commons subject from independent title and description";}
   else if(reclaimed.includes(p.name)){
    const original=restoredAliases[normalizePortraitName(p.name)]!;
    p.photo=portraitCredit(original);
    p.resolution="existing-alias";
    p.reason="Verified historical ring name reuses the original wrestler's licensed photo";
   }
  }
 }
 work.counts.existing=work.people.filter(p=>p.photo).length;
 work.counts.missing=work.people.length-work.counts.existing;
 work.counts.catalogue+=additions.length;
 await writeFile("data/genesis-portrait-worklist.json",JSON.stringify(work,null,2)+"\n");
}
const covered=work.people.filter(p=>p.photo).length;
data.summary={...data.summary,curatedPhotoAdditions:additions.length,recoveredAliases:3,genuineGenesisPhotos:covered,
 creditedSources:work.counts.catalogue,unresolved:643-covered,
 coveragePercent:Math.round(covered/643*10000)/100,
 note:"Evidence-selected individual Commons photographs; independently audit all Commons metadata and licence links before publishing."};
await writeFile("data/portrait-assessment.json",JSON.stringify(data,null,2)+"\n");
await writeFile("data/portrait-discovery-checkpoint.json",JSON.stringify(cp,null,2)+"\n");
await writeFile("data/curated-portrait-review.json",JSON.stringify({reviewedNames:names.size,recoveredAliases:["Zelina","Britt Baker D.M.D.","Killer Kross"],
 additions,unresolved,checkedAt:new Date().toISOString()},null,2)+"\n");
console.log(JSON.stringify({reviewed:names.size,accepted:additions.length,rejected:unresolved.length,coverage:covered,missing:643-covered}));
