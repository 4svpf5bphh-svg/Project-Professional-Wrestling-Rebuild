import {test} from "node:test";
import assert from "node:assert/strict";
import {portraitCredit,portraitSource} from "../src/ui/wrestler-portrait.js";
test("verified wrestler portraits use credited Commons sources",()=>{
 for(const name of ["Roman Reigns","Cody Rhodes","Rhea Ripley","CM Punk","Will Ospreay","Jon Moxley","Bryan Danielson","Adam Page","AJ Styles","Kazuchika Okada","Mercedes Moné","Samoa Joe","Hiroshi Tanahashi"]){
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
