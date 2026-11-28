import {AsyncLocalStorage} from "node:async_hooks";
import {execFileSync} from "node:child_process";
import {randomBytes} from "node:crypto";
import {mkdtemp,readFile,rm} from "node:fs/promises";
import {createServer as httpsServer} from "node:https";
import {createConnection,createServer as netServer,type AddressInfo} from "node:net";
import {tmpdir} from "node:os";
import {extname,join,resolve,sep} from "node:path";
import {pathToFileURL} from "node:url";
import {gzipSync} from "node:zlib";
import pg from "pg";
import {disposableDatabaseUrl,inviteHash,managerId,rivalManagerId} from "./milestone8-local-world.js";

export interface ApiSample {
 path:string;
 status:number;
 bytes:number;
 sqlStatements:number;
 sqlResultRows:number;
 sqlChangedRows:number;
 sqlResultBytes:number;
 milliseconds:number;
}

const mime:Record<string,string>={
 ".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",
 ".css":"text/css; charset=utf-8",".json":"application/json",".webmanifest":"application/manifest+json",
 ".svg":"image/svg+xml",".webp":"image/webp",".png":"image/png",".jpg":"image/jpeg",
 ".woff2":"font/woff2",".mp4":"video/mp4"
};

export async function startMilestone8Host(root:string,rawUrl:string,worldId:string){
 const postgres=disposableDatabaseUrl(rawUrl);
 const environment:Record<string,string|undefined>={
  DATABASE_URL:postgres.href,PPW_WORLD_ID:worldId,PPW_SESSION_SECRET:randomBytes(40).toString("hex"),
  PPW_PLAYER_ACCESS_HASHES:JSON.stringify({[managerId]:inviteHash,[rivalManagerId]:inviteHash}),
  VERCEL_ENV:"preview",VERCEL_GIT_COMMIT_REF:"main",PPW_MANUAL_ADVANCE_ENABLED:"YES",
  PPW_MAIN_WORLD_APPROVED:"YES",PPW_MAIN_WORLD_ID:worldId,PPW_MANUAL_OPERATOR_ID:managerId,
  PPW_MAIN_DB_HOST:postgres.hostname,PPW_MAIN_DB_NAME:postgres.pathname.slice(1),
 };
 for(const key of Object.keys(process.env))
  if(/^(?:OPENAI|GROQ|TERRA|PPW_.*(?:PROVIDER|EDITORIAL|AI_BENCHMARK))/.test(key))
   environment[key]=undefined;
 // The released hosted guard accepts this IPv6 loopback database identity.
 // The relay forwards solely to the explicitly named local disposable database.
 const relay=postgres.hostname==="127.0.0.1"?netServer(incoming=>{
  const outgoing=createConnection({host:"127.0.0.1",port:Number(postgres.port)||5432});
  incoming.pipe(outgoing).pipe(incoming);
  incoming.on("error",()=>outgoing.destroy());outgoing.on("error",()=>incoming.destroy());
  incoming.on("close",()=>outgoing.destroy());outgoing.on("close",()=>incoming.destroy());
 }):null;
 if(relay){
  await new Promise<void>((ready,reject)=>relay.once("error",reject).listen(0,"::1",ready));
  const port=(relay.address() as AddressInfo).port;
  environment.DATABASE_URL=postgres.href.replace("127.0.0.1"+(postgres.port?":"+postgres.port:""),"[::1]:"+port);
  environment.PPW_MAIN_DB_HOST="[::1]";
 }
 const originalEnvironment=new Map(Object.keys(environment).map(key=>[key,process.env[key]]));
 for(const [key,value] of Object.entries(environment)){
  if(value===undefined)delete process.env[key];
  else process.env[key]=value;
 }
 const originalFetch=globalThis.fetch;
 let providerRequests=0;
 globalThis.fetch=async()=>{
  providerRequests++;
  throw new Error("The disposable PPW browser host blocks server-side external requests.");
 };
 const samples:ApiSample[]=[];
 const active=new AsyncLocalStorage<ApiSample>();
 const originalQuery=pg.Client.prototype.query;
 pg.Client.prototype.query=function(this:pg.Client,...args:unknown[]){
  const stats=active.getStore();
  const result=Reflect.apply(originalQuery,this,args);
  if(!stats)return result;
  stats.sqlStatements++;
  if(!(result instanceof Promise))return result;
  return result.then((data:pg.QueryResult)=>{
   stats.sqlResultRows+=data.rows.length;
   stats.sqlResultBytes+=Buffer.byteLength(JSON.stringify(data.rows));
   if(["INSERT","UPDATE","DELETE","MERGE"].includes(data.command))stats.sqlChangedRows+=data.rowCount??0;
   return data;
  });
 } as typeof originalQuery;
 const tls=await mkdtemp(join(tmpdir(),"ppw-m8-tls-"));
 execFileSync("openssl",["req","-x509","-newkey","rsa:2048","-nodes","-days","1",
  "-subj","/CN=127.0.0.1","-keyout",join(tls,"key.pem"),"-out",join(tls,"cert.pem")],{stdio:"ignore"});
 const {handleVercelNodeRequest}=await import(pathToFileURL(join(root,"src/web/vercel-node-adapter.ts")).href) as typeof import("../../src/web/vercel-node-adapter.js");
 const assets=resolve(root,"dist/web");
 await readFile(join(assets,"index.html"));
 const [key,cert]=await Promise.all([readFile(join(tls,"key.pem")),readFile(join(tls,"cert.pem"))]);
 const server=httpsServer({key,cert},(req,res)=>{
  const path=new URL(req.url??"/","https://127.0.0.1").pathname;
  if(path.startsWith("/api/")){
   const started=performance.now();
   const stats={path,status:0,bytes:0,sqlStatements:0,sqlResultRows:0,
    sqlChangedRows:0,sqlResultBytes:0,milliseconds:0};
   const end=res.end;
   res.end=function(this:typeof res,...args:unknown[]){
    stats.status=res.statusCode;
    const content=args[0];
    stats.bytes=Buffer.isBuffer(content)?content.byteLength:typeof content==="string"?Buffer.byteLength(content):0;
    stats.milliseconds=Number((performance.now()-started).toFixed(2));
    samples.push(stats);
    return Reflect.apply(end,this,args);
   } as typeof end;
   void active.run(stats,()=>handleVercelNodeRequest(req,res));
   return;
  }
  const file=resolve(assets,"."+decodeURIComponent(path==="/"?"/index.html":path));
  if(!file.startsWith(assets+sep)){res.writeHead(404).end();return;}
  void readFile(file).then(content=>{
   const extension=extname(file),compressed=[".js",".css"].includes(extension)&&
    /\bgzip\b/.test(req.headers["accept-encoding"]??"");
   const body=compressed?gzipSync(content):content;
   res.setHeader("content-type",mime[extension]??"application/octet-stream");
   res.setHeader("content-length",body.byteLength);
   res.setHeader("cache-control",path.startsWith("/assets/")?"public, max-age=31536000, immutable":"no-cache");
   if(compressed)res.setHeader("content-encoding","gzip");
   res.end(body);
  },()=>res.writeHead(404).end());
 });
 await new Promise<void>((ready,reject)=>server.once("error",reject).listen(0,"127.0.0.1",ready));
 return {
  origin:"https://127.0.0.1:"+(server.address() as AddressInfo).port,samples,
  get providerRequests(){return providerRequests;},
  async close(){
   server.closeAllConnections();
   await new Promise<void>(ready=>server.close(()=>ready()));
   pg.Client.prototype.query=originalQuery;
   globalThis.fetch=originalFetch;
   for(const [name,value] of originalEnvironment){
    if(value===undefined)delete process.env[name];
    else process.env[name]=value;
   }
   // Host adapter clients expire on their normal idle timeout.
   relay?.close();
   await rm(tls,{force:true,recursive:true});
  }
 };
}
