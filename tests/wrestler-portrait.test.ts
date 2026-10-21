import {test} from "node:test";
import assert from "node:assert/strict";
import {portraitCredit,portraitSource} from "../src/ui/wrestler-portrait.js";
test("verified wrestler portraits use credited Commons sources",()=>{
 for(const name of ["Roman Reigns","Cody Rhodes","Rhea Ripley","CM Punk","Will Ospreay"]){
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
