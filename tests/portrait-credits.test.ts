import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {portraitCatalogue} from "../src/ui/wrestler-portrait.js";

const credits=readFileSync(new URL("../apps/web/public/portrait-credits.html",import.meta.url),"utf8");
const lines=[...credits.matchAll(/<li>([\s\S]*?)<\/li>/g)].map(x=>x[1]!);
function sourceFile(line:string):string|null{
 const raw=line.match(/https:\/\/commons\.wikimedia\.org\/wiki\/File:([^"]+)/)?.[1];
 return raw?decodeURIComponent(raw).replace(/_/g," "):null;
}
const byFile=new Map(lines.map(line=>[sourceFile(line),line]));
test("every credited Commons file has its own matching attributed source, creator and licence link",()=>{
 assert.equal(byFile.size,lines.length,"duplicate Commons credits are not allowed");
 const files=new Set<string>();
 const licenseUrls:Record<string,string>={
  "CC BY 2.0":"https://creativecommons.org/licenses/by/2.0/",
  "CC BY 4.0":"https://creativecommons.org/licenses/by/4.0/",
  "CC BY-SA 2.0":"https://creativecommons.org/licenses/by-sa/2.0/",
  "CC BY-SA 3.0":"https://creativecommons.org/licenses/by-sa/3.0/",
  "CC BY-SA 4.0":"https://creativecommons.org/licenses/by-sa/4.0/",
  "CC0":"https://creativecommons.org/publicdomain/zero/1.0/"
 };
 for(const [name,credit] of Object.entries(portraitCatalogue)){
  assert.equal(files.has(credit.file.toLowerCase()),false,name+" reuses a photo credited elsewhere");
  files.add(credit.file.toLowerCase());
  const line=byFile.get(credit.file);
  assert.ok(line,name+": Commons attribution does not reference the catalogue file");
  const artist=credit.author.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  assert.ok(line.includes(artist),name+": photographer attribution differs");
  assert.ok(line.includes(credit.license),name+": licence label differs");
  assert.ok(line.includes(licenseUrls[credit.license]!),name+": licence link missing");
 }
 assert.equal(lines.length,Object.keys(portraitCatalogue).length,
  "one independently attributed file must have exactly one attribution entry");
});
