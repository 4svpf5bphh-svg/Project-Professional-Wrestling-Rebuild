/** Deployment boundary: a PPW preview may only read the precise, explicitly
 * isolated database and World for its own Git branch.
 * Does not inspect credentials or require an additional database query.
 */
export function requireIsolatedPreviewHost(
 env:Record<string,string|undefined>,dbUrl:string,worldId:string,
):void{
 if(env.VERCEL_ENV!=="preview")return;
 const branch=env.VERCEL_GIT_COMMIT_REF??"";
 if(env.PPW_PREVIEW_ISOLATED!=="YES"||
  !branch.startsWith("alpha/playtest-")||
  env.PPW_PREVIEW_GIT_BRANCH!==branch||
  env.PPW_PREVIEW_WORLD_ID!==worldId||!worldId||
  !env.PPW_PREVIEW_DB_HOST||!env.PPW_PREVIEW_DB_NAME)
  throw new Error("PPW isolated preview configuration is incomplete");
 let url:URL;
 try{url=new URL(dbUrl);}
 catch{throw new Error("PPW preview database identity is invalid");}
 if(!["postgres:","postgresql:"].includes(url.protocol)||
  url.hostname!==env.PPW_PREVIEW_DB_HOST||
  decodeURIComponent(url.pathname.slice(1))!==env.PPW_PREVIEW_DB_NAME||
  url.hostname==="localhost"||url.hostname==="127.0.0.1")
  throw new Error("PPW preview database does not match its isolated approval");
}
