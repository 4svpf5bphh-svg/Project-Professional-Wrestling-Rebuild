/** Offline genuine PPW main-branch fresh World exporter.
 * Explicit original clone; no DB credentials, no GitHub writes, no live World.
 * Run via rebuild's tsx so relative TypeScript imports resolve in both repos.
 */
import {execFileSync} from "node:child_process";
import {realpath,writeFile} from "node:fs/promises";
import {resolve,join} from "node:path";
import {pathToFileURL} from "node:url";
import {extractOriginalMainFreshGenesis,type OriginalMainFreshState}
 from "../src/domain/original-main-fresh-export.js";

export interface OriginalExportArgs{
 root:string;out:string;seed:number;name:string;
}
export function parseOriginalExportArgs(args:readonly string[]):OriginalExportArgs{
 const allowed=new Set(["--original-root","--out","--seed","--name"]);
 const values=new Map<string,string>();
 for(let i=0;i<args.length;i++){
  const key=args[i]!,value=args[++i];
  if(!allowed.has(key)||values.has(key)||!value||value.startsWith("--"))
   throw new Error("Unknown, repeated or missing export option: "+key);
  values.set(key,value);
 }
 for(const key of ["--original-root","--out","--seed"])
  if(!values.has(key))throw new Error("Missing required original-main export option: "+key);
 const number=Number(values.get("--seed"));
 const name=values.get("--name")??"PPW Rebuild Playtest";
 if(!Number.isSafeInteger(number)||number<0||number>4294967295||
  !name.trim()||name.length>100)
  throw new Error("Invalid original-main fresh World seed or name");
 return {root:values.get("--original-root")!,out:values.get("--out")!,
  seed:number,name};
}
export function verifyOriginalMainRepository(
 root:string,git:(...args:string[])=>string,
):string{
 const branch=git("-C",root,"branch","--show-current").trim();
 if(branch!=="main")
  throw new Error("Original PPW reference must be on main, never alpha-1a");
 const remote=git("-C",root,"remote","get-url","origin").trim();
 if(!/(?:^|[:/])4svpf5bphh-svg\/Project-Professional-Wrestling(?:\.git)?$/i.test(remote))
  throw new Error("Source is not the exact original PPW repository");
 if(git("-C",root,"status","--porcelain","--untracked-files=no").trim())
  throw new Error("Original main has uncommitted changes; export requires a clean checkout");
 const sha=git("-C",root,"rev-parse","HEAD").trim();
 if(!/^[0-9a-f]{40}$/.test(sha))
  throw new Error("Original main commit could not be verified");
 return sha;
}
async function main(){
 if(process.argv.includes("--help")){
  console.log("npm run playtest:export-original -- --original-root <read-only-clone-of-original-main>"+
   " --out <new-genesis.json> --seed <uint32> [--name <world-name>]");
  return;
 }
 const args=parseOriginalExportArgs(process.argv.slice(2));
 const root=await realpath(resolve(args.root));
 const sourceSha=verifyOriginalMainRepository(root,(...cmd)=>
  execFileSync("git",cmd,{encoding:"utf8",maxBuffer:65536}));
 // Source is an explicitly checked out original-main clone, never an API
 // endpoint or an authenticated production state.
 const entry=pathToFileURL(join(root,"packages/web-adapter/src/alpha-service.ts")).href;
 const original=await import(entry) as {
  createAlphaWorldAggregate(input:{seed:number;playerId:string;worldName:string}):
   {state:OriginalMainFreshState};
 };
 if(typeof original.createAlphaWorldAggregate!=="function")
  throw new Error("Original main lacks its verified fresh World factory");
 const generated=original.createAlphaWorldAggregate({
  seed:args.seed,playerId:"rebuild-export-offline",worldName:args.name});
 // The original main creates standings lazily in its canonical reputation
 // system. Materialise those *actual original rules* on this disposable
 // in-memory World, not inferred tier values in the rebuild.
 const reputationUrl=pathToFileURL(join(root,"packages/sim-core/src/reputation.ts")).href;
 const reputation=await import(reputationUrl) as {
  ensurePromotionStandings(state:OriginalMainFreshState):unknown;
 };
 if(typeof reputation.ensurePromotionStandings!=="function")
  throw new Error("Original main promotion standings factory is missing");
 reputation.ensurePromotionStandings(generated.state);
 const source=extractOriginalMainFreshGenesis(generated.state);
 // Exclusive create; never overwrite another source or checkout artifact.
 const out=resolve(args.out);
 await writeFile(out,JSON.stringify(source),{encoding:"utf8",flag:"wx",mode:0o600});
 console.log(JSON.stringify({status:"AUTHENTIC_ORIGINAL_MAIN_GENESIS_EXPORTED",
  sourceMainCommit:sourceSha,worldId:source.world.id,output:out,
  wrestlers:source.people.length,promotions:source.promotions.length,
  eligibleTakeovers:source.promotions.filter(x=>
   x.playerTakeoverEligibility==="STANDARD").length}));
}
if(process.argv[1]&&/playtest-export-original\.(?:ts|js)$/.test(process.argv[1]))
 main().catch(error=>{
  console.error(error instanceof Error?error.message:"Original main export failed");
  process.exitCode=1;
 });
