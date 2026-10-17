/** Vercel Node functions pass IncomingMessage/ServerResponse, not web Request. */
import type {IncomingMessage,ServerResponse} from "node:http";
import {handlePpwHostApi} from "../src/web/ppw-host-api.js";

export async function handleVercelNodeRequest(req:IncomingMessage,res:ServerResponse):Promise<void>{
 try{
  const host=req.headers.host;
  if(!host||!/^[-a-zA-Z0-9.:]+$/.test(host)){
   res.writeHead(400,{"content-type":"application/json"}).end('{"error":"Invalid host"}');return;
  }
  const url=new URL(req.url??"/","https://"+host);
  const headers=new Headers();
  for(const [key,value] of Object.entries(req.headers)){
   if(typeof value==="string")headers.set(key,value);
   else if(Array.isArray(value))headers.set(key,value.join(", "));
  }
  const method=req.method??"GET";
  let body:Buffer|undefined;
  if(method!=="GET"&&method!=="HEAD"){
   const chunks:Buffer[]=[];let size=0;
   for await(const chunk of req){
    const part=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk as Uint8Array);
    size+=part.length;if(size>131072){
     res.writeHead(413,{"content-type":"application/json"}).end('{"error":"Request too large"}');return;
    }
    chunks.push(part);
   }
   body=Buffer.concat(chunks);
  }
  const response=await handlePpwHostApi(new Request(url,{
   method,headers,...(body?{body:Uint8Array.from(body)}:{})
  }));
  res.statusCode=response.status;
  for(const [key,value] of response.headers){
   if(key!=="set-cookie")res.setHeader(key,value);
  }
  const cookies=response.headers.getSetCookie();
  if(cookies.length)res.setHeader("set-cookie",cookies);
  res.end(Buffer.from(await response.arrayBuffer()));
 }catch{
  if(!res.headersSent){res.statusCode=500;res.setHeader("content-type","application/json");}
  res.end('{"error":"Game host unavailable"}');
 }
}
