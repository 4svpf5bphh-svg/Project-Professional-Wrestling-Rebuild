/** Single-World hosted deployment boundary. No alternative Git branch or
 * database World can silently inherit the main release credentials.
 * Validation is performed before any PostgreSQL pool is created.
 */
export const PPW_AI_BENCHMARK_BRANCH="phase43-ai-benchmark-safe-preview";

/** Separate, expressly enabled owner-only testing path; never a main World exception. */
export function aiBenchmarkPreviewEnvironment(
 env:Record<string,string|undefined>,worldId:string,
):boolean{
 return env.VERCEL_ENV==="preview"&&
  env.VERCEL_GIT_COMMIT_REF===PPW_AI_BENCHMARK_BRANCH&&
  env.PPW_AI_BENCHMARK_PREVIEW==="YES"&&
  !!worldId&&env.PPW_AI_BENCHMARK_WORLD_ID===worldId;
}

export function requireIsolatedPreviewHost(
 env:Record<string,string|undefined>,dbUrl:string,worldId:string,
):void{
 const mode=env.VERCEL_ENV;
 if(mode!=="preview"&&mode!=="production")return;
 // This explicit branch fails closed unless every independently scoped preview
 // setting matches. The main host guard remains unchanged for all other refs.
 if(mode==="preview"&&env.VERCEL_GIT_COMMIT_REF===PPW_AI_BENCHMARK_BRANCH){
  if(!aiBenchmarkPreviewEnvironment(env,worldId)||
   !env.PPW_AI_BENCHMARK_DB_HOST||!env.PPW_AI_BENCHMARK_DB_NAME||
   !env.PPW_MAIN_DB_HOST||
   env.PPW_AI_BENCHMARK_DB_HOST===env.PPW_MAIN_DB_HOST)
   throw new Error("PPW AI benchmark preview is not isolated");
  let testUrl:URL;
  try{testUrl=new URL(dbUrl);}catch{
   throw new Error("PPW AI benchmark database identity is invalid");
  }
  if(!["postgres:","postgresql:"].includes(testUrl.protocol)||
   testUrl.hostname!==env.PPW_AI_BENCHMARK_DB_HOST||
   decodeURIComponent(testUrl.pathname.slice(1))!==env.PPW_AI_BENCHMARK_DB_NAME||
   ["localhost","127.0.0.1"].includes(testUrl.hostname)||
   [...testUrl.searchParams.keys()].some(k=>
    ["host","hostaddr","dbname","database","port","service"].includes(k.toLowerCase())))
   throw new Error("PPW AI benchmark database identity does not match isolation");
  return;
 }
 if(env.VERCEL_GIT_COMMIT_REF!=="main"||
  env.PPW_MAIN_WORLD_APPROVED!=="YES"||
  !env.PPW_MAIN_WORLD_ID||env.PPW_MAIN_WORLD_ID!==worldId||
  !env.PPW_MAIN_DB_HOST||!env.PPW_MAIN_DB_NAME)
  throw new Error("PPW hosted main World configuration is incomplete");
 let url:URL;
 try{url=new URL(dbUrl);}
 catch{throw new Error("PPW hosted main database identity is invalid");}
 if(!["postgres:","postgresql:"].includes(url.protocol)||
  url.hostname!==env.PPW_MAIN_DB_HOST||
  decodeURIComponent(url.pathname.slice(1))!==env.PPW_MAIN_DB_NAME||
  url.hostname==="localhost"||url.hostname==="127.0.0.1")
  throw new Error("PPW hosted main database does not match its approval");
}
