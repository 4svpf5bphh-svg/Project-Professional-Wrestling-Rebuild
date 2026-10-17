import {handlePpwHostApi} from "../src/web/ppw-host-api.js";
// Vercel Node.js web-standard Request/Response adapter; no scheduler.
export default async function handler(request:Request):Promise<Response>{
 return handlePpwHostApi(request);
}
