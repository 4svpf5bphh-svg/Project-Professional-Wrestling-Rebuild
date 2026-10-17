import type {IncomingMessage,ServerResponse} from "node:http";
import {handleVercelNodeRequest} from "../src/web/vercel-node-adapter.js";
export default function handler(request:IncomingMessage,response:ServerResponse):Promise<void>{
 return handleVercelNodeRequest(request,response);
}
