/** A hosted PPW World must match one explicitly approved Git deployment,
 * database host, database name and World. No extra queries or credentials.
 * Main is the single development line; alpha preview branches are legacy.
 */
export function requireIsolatedPreviewHost(
 env:Record<string,string|undefined>,dbUrl:string,worldId:string,
):void{
 const mode=env.VERCEL_ENV;
 if(mode!=="preview"&&mode!=="production")return;
 const branch=env.VERCEL_GIT_COMMIT_REF??"";
 const onMain=branch==="main";
 const approved=onMain
  ? env.PPW_MAIN_WORLD_APPROVED==="YES"
  : mode==="preview"&&branch.startsWith("alpha/playtest-")&&
    env.PPW_PREVIEW_ISOLATED==="YES"&&env.PPW_PREVIEW_GIT_BRANCH===branch;
 const expectedWorld=onMain?env.PPW_MAIN_WORLD_ID:env.PPW_PREVIEW_WORLD_ID;
 const expectedHost=onMain?env.PPW_MAIN_DB_HOST:env.PPW_PREVIEW_DB_HOST;
 const expectedName=onMain?env.PPW_MAIN_DB_NAME:env.PPW_PREVIEW_DB_NAME;
 if(!approved||!expectedWorld||worldId!==expectedWorld||
  !expectedHost||!expectedName)
  throw new Error("PPW hosted World configuration is incomplete");
 let url:URL;
 try{url=new URL(dbUrl);}
 catch{throw new Error("PPW hosted database identity is invalid");}
 if(!["postgres:","postgresql:"].includes(url.protocol)||
  url.hostname!==expectedHost||
  decodeURIComponent(url.pathname.slice(1))!==expectedName||
  url.hostname==="localhost"||url.hostname==="127.0.0.1")
  throw new Error("PPW hosted database does not match its approval");
}
