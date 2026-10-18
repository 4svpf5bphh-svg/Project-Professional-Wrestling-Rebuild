/** Temporary, one-off cost probe. Never merge this route into main. */
import type {IncomingMessage,ServerResponse} from "node:http";
import {timingSafeEqual} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {lockWorldWeek} from "../src/db/world-lock.js";
import {driveWorldResolution,planNextWorldResolutionAction} from "../src/db/world-resolution-pipeline.js";

const WORLD="world-20261017";
const RESOLUTION="probe-20261018-isolated-week1";
const safeEqual=(a:string,b:string)=>{
 const aa=Buffer.from(a),bb=Buffer.from(b);
 return aa.length===bb.length&&timingSafeEqual(aa,bb);
};
export default async function handler(req:IncomingMessage,res:ServerResponse){
 res.setHeader("Cache-Control","no-store, no-cache, must-revalidate");
 res.setHeader("X-Robots-Tag","noindex, nofollow");
 const uri=new URL(req.url??"/","https://private.invalid");
 const mode=uri.searchParams.get("mode");
 const supplied=uri.searchParams.get("auth")??"";
 const expected=process.env.PPW_COST_PROBE_KEY??"";
 const url=process.env.DATABASE_URL??"";
 let branchHost="";
 try{branchHost=new URL(url).hostname;}catch{}
 if(req.method!=="GET"||!["status","lock","step"].includes(mode??"")||
    !expected||expected.length<32||!safeEqual(supplied,expected)||
    !branchHost||branchHost!==process.env.PPW_COST_PROBE_ALLOWED_HOST||
    process.env.PPW_COST_PROBE_WORLD_ID!==WORLD){
   res.statusCode=404;res.end("Not found");return;
 }
 const db=postgresPool(url,2);
 const started=Date.now();
 try{
   const state=await withWorldTransaction(db.pool,async tx=>{
     const rows=await tx.query<{world_id:string;year:number;week:number;phase:string;revision:string|number;name:string}>(
       "SELECT world_id,year,week,phase,revision,name FROM ppw_worlds WHERE world_id=$1",
       [WORLD]);
     if(rows.length!==1||rows[0]!.year!==1||rows[0]!.week!==1||
       rows[0]!.name!=="PPW Rebuild Genesis")
       throw new Error("Cost-probe week/world assertion failed");
     return rows[0]!;
   });
   let result:unknown=null;
   if(mode==="lock"){
     if(state.phase!=="OPEN")throw new Error("World not OPEN for test lock");
     result=await lockWorldWeek(db.pool,{
       worldId:WORLD,requestId:"cost-probe-lock-20261018",
       expectedRevision:Number(state.revision),
     });
   } else if(mode==="step"){
     if(!["LOCKED","RESOLVING"].includes(state.phase))
       throw new Error("World not ready for resolver step");
     result=await driveWorldResolution(db.pool,{
       worldId:WORLD,resolutionId:RESOLUTION,maxStages:1});
   }else{
     result=await planNextWorldResolutionAction(db.pool,WORLD);
   }
   const payload={ok:true,mode,elapsedMs:Date.now()-started,initialState:{
     week:state.week,phase:state.phase,revision:state.revision},result};
   res.setHeader("Content-Type","application/json");
   res.statusCode=200;res.end(JSON.stringify(payload));
 }catch(e){
   res.setHeader("Content-Type","application/json");
   res.statusCode=500;res.end(JSON.stringify({ok:false,mode,
     elapsedMs:Date.now()-started,error:e instanceof Error?e.message:"Test failed"}));
 }finally{await db.close();}
}
