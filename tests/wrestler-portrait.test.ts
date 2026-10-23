import {test} from "node:test";
import assert from "node:assert/strict";
import {portraitCredit,portraitSource} from "../src/ui/wrestler-portrait.js";
test("verified wrestler portraits use credited Commons sources",()=>{
 for(const name of ["Roman Reigns","Cody Rhodes","Rhea Ripley","CM Punk","Will Ospreay","Jon Moxley","Bryan Danielson","Adam Page","AJ Styles","Kazuchika Okada","Mercedes Moné","Samoa Joe","Hiroshi Tanahashi","Bianca Belair","Sami Zayn","John Cena"]){
  const info=portraitCredit(name);
  assert.ok(info?.file);
  assert.ok(info?.author);
  assert.match(portraitSource(name)!,/^https:\/\/commons\.wikimedia\.org\/wiki\/Special:FilePath\//);
 }
});
test("unknown wrestler identity does not silently borrow someone else's portrait",()=>{
 assert.equal(portraitSource("A Generated Wrestler"),null);
 assert.equal(portraitCredit("Not A Real Person"),null);
});

test("documented ring-name aliases resolve to the same genuine credited photo",()=>{
 for(const [alias,identity] of [
  ["Sasha Banks","Mercedes Moné"],["Dean Ambrose","Jon Moxley"],
  ["Daniel Bryan","Bryan Danielson"],["Tyler Black","Seth Rollins"],
  ["The American Nightmare","Cody Rhodes"],["The Rainmaker","Kazuchika Okada"],["Adam Page","Hangman Adam Page"]
 ]){
  assert.equal(portraitSource(alias),portraitSource(identity));
  assert.deepEqual(portraitCredit(alias),portraitCredit(identity));
 }
});
test("portrait widths are bounded without database requests",()=>{
 assert.match(portraitSource("Cody Rhodes",999)!,/width=420$/);
 assert.match(portraitSource("Cody Rhodes",1)!,/width=100$/);
});

test("batch of 25 credited AEW wrestler portraits resolves to individual source files",()=>{
 const names=["jade cargill","thunder rosa","brody king","dante martin","darius martin","eddie kingston","harley cameron","jamie hayter","jay white","juice robinson","julia hart","jun akiyama","konosuke takeshita","kota ibushi","kyle fletcher","leila grey","marina shafir","matt menard","ricochet","riho","saraya","serena deeb","yuka sakazaki","skye blue","angelo parker"];
 assert.equal(names.length,25);
 const files=new Set<string>();
 for(const name of names){const credit=portraitCredit(name);assert.ok(credit?.file,name);assert.equal(credit.license,"CC BY-SA 4.0");assert.ok(!files.has(credit.file),name);files.add(credit.file);assert.ok(portraitSource(name));}
});

test("25 Diego Serrano wrestler photographs have unique credited Wikimedia Commons files",()=>{
 const names=["alexa bliss","angelo dawkins","asuka","austin theory","b-fab","bayley","bobby lashley","braun strowman","bray wyatt","brock lesnar","bubba ray dudley","candice lerae","carmelo hayes","charlotte flair","chelsea green","dakota kai","damian priest","dominik mysterio","drew mcintyre","finn bálor","giulia","gunther","ivy nile","iyo sky","jacob fatu"];
 assert.equal(names.length,25);
 const files=new Set<string>();
 for(const name of names){const credit=portraitCredit(name);assert.ok(credit?.file,name);assert.equal(credit.author,["bobby lashley","bray wyatt"].includes(name)?"diegofernandophotography":"Diego Serrano");assert.equal(credit.license,"CC BY 2.0");assert.ok(!files.has(credit.file),name);files.add(credit.file);assert.ok(portraitSource(name));}
});

test("second 25-photo batch resolves unique credited WWE wrestler identities",()=>{
 const names=["akam","jaida parker","jey uso","jimmy uso","joe hendry","kairi sane","karrion kross","kevin owens","la knight","liv morgan","logan paul","lyra valkyria","michin","montez ford","naomi","nia jax","nikki bella","penta","r-truth","randy orton","raquel rodriguez","rey mysterio","rezar","roxanne perez","stephanie vaquer"];
 assert.equal(names.length,25);
 const files=new Set<string>();
 for(const name of names){const credit=portraitCredit(name);assert.ok(credit?.file,name);assert.equal(credit.author,["bobby lashley","bray wyatt"].includes(name)?"diegofernandophotography":"Diego Serrano");assert.equal(credit.license,"CC BY 2.0");assert.ok(!files.has(credit.file),name);files.add(credit.file);assert.ok(portraitSource(name));}
});

test("missing Wikimedia images return a real, consistent initials placeholder",()=>{
 const withheld=["sheamus","solo sikoa","tama tonga","tonga loa","tiffany stratton","trick williams","zelina vega","zoey stark","xavier woods","kofi kingston","the miz","otis","chad gable","ludwig kaiser","ilja dragunov","bron breakker","bronson reed","grayson waller","andrade","carlito","dragon lee","elektra lopez","ashante thee adonis"];
 assert.equal(withheld.length,23);
 for(const name of withheld){assert.equal(portraitCredit(name),null,name);assert.equal(portraitSource(name),null,name);}
 assert.ok(portraitSource("santos escobar"));
});
test("original Commons creator identity is credited accurately",()=>{
 for(const [name,author] of Object.entries({"jeff hardy":"EGGE","matt hardy":"EGGE","bobby lashley":"diegofernandophotography","bray wyatt":"diegofernandophotography"}))
  assert.equal(portraitCredit(name)?.author,author,name);
});
test("verified Nakamura file is independent of batch photographer assumption",()=>{assert.equal(portraitCredit("Shinsuke Nakamura")?.file,"Shinsuke Nakamura 2024 (cropped).jpg");assert.equal(portraitCredit("Shinsuke Nakamura")?.author,"Carter Sterling");});

test("25 new portrait candidates are unique and resolve to accountable photo sources",()=>{
 const names=["orange cassidy","toni storm","swerve strickland","mjf",
  "willow nightingale","chris jericho","rey fenix","adam cole",
  "claudio castagnoli","hikaru shida","kris statlander","zack sabre jr.",
  "jeff hardy","matt hardy","aj lee","jordynne grace","bandido",
  "matt cardona","nic nemeth","christian cage","athena","pac",
  "darby allin","cash wheeler","dax harwood"];
 assert.equal(names.length,25);
 const files=new Set<string>();
 for(const name of names){
  const info=portraitCredit(name);
  assert.ok(info?.file, name+" needs original file");
  assert.ok(info.author?.trim(),name+" needs real creator attribution");
  assert.match(info.license,/^(CC0|CC BY 2.0|CC BY-SA (2.0|3.0|4.0))$/);
  assert.equal(files.has(info.file),false,name+" must not reuse another portrait");
  files.add(info.file);
  assert.match(portraitSource(name)!,/^https:\/\/commons\.wikimedia\.org\/wiki\/Special:FilePath\//);
 }
});
test("renamed wrestlers and ring-name variants keep the same photo attribution",()=>{
 for(const [alias,person] of [
  ['"Hangman" Adam Page',"Hangman Adam Page"],["Dolph Ziggler","Nic Nemeth"],
  ["Cesaro","Claudio Castagnoli"],["Rey Fénix","Rey Fenix"],
  ["Zack Sabre Jr","Zack Sabre Jr."],["Christian","Christian Cage"]
 ]){
  assert.deepEqual(portraitCredit(alias),portraitCredit(person),alias);
  assert.equal(portraitSource(alias),portraitSource(person));
 }
});
