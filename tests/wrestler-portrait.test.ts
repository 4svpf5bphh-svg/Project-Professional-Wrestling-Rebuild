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
 for(const name of names){const credit=portraitCredit(name);assert.ok(credit?.file,name);assert.equal(credit.author,"Diego Serrano");assert.equal(credit.license,"CC BY 2.0");assert.ok(!files.has(credit.file),name);files.add(credit.file);assert.ok(portraitSource(name));}
});
