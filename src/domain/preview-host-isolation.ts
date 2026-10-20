/** Single-World hosted deployment boundary. No alternative Git branch or
 * database World can silently inherit the main release credentials.
 * Validation is performed before any PostgreSQL pool is created.
 */
export function requireIsolatedPreviewHost(
 env:Record<string,string|undefined>,dbUrl:string,worldId:string,
):void{
 const mode=env.VERCEL_ENV;
 if(mode!=="preview"&&mode!=="production")return;
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
