/** Invite-only, signed, HttpOnly player sessions for the PPW alpha.
 * Player IDs are NEVER authenticated by the browser alone. A valid
 * high-entropy access code must match the configured digest for that player.
 */
import {createHash,createHmac,randomBytes,timingSafeEqual} from "node:crypto";
export interface PlayerSession{
 playerId:string;csrfToken:string;expiresAt:number;
}
export interface InviteConfig{
 secret:string;accessHashes:Record<string,string>;
 worldId:string;secureCookies?:boolean;
}
const enc=(v:string|Buffer)=>Buffer.from(v).toString("base64url");
const safeEqual=(a:string,b:string)=>{
 const aa=Buffer.from(a),bb=Buffer.from(b);
 return aa.length===bb.length&&timingSafeEqual(aa,bb);
};
export const inviteDigest=(code:string)=>
 createHash("sha256").update(code,"utf8").digest("hex");

export function requireInviteConfig(env:Record<string,string|undefined>):InviteConfig{
 const secret=env.PPW_SESSION_SECRET??"";
 const worldId=env.PPW_WORLD_ID??"";
 if(secret.length<32||!worldId||worldId.length>200)
  throw new Error("PPW signed session and existing World configuration missing");
 let parsed:unknown;
 try{parsed=JSON.parse(env.PPW_PLAYER_ACCESS_HASHES??"");}
 catch{throw new Error("Invalid player invite configuration");}
 if(!parsed||typeof parsed!=="object"||Array.isArray(parsed)||
   !Object.keys(parsed).length||Object.keys(parsed).length>40||
   Object.entries(parsed).some(([id,digest])=>
    !id||id.length>200||typeof digest!=="string"||!/^[0-9a-f]{64}$/.test(digest)))
  throw new Error("Invalid player invite configuration");
 return {secret,worldId,accessHashes:parsed as Record<string,string>,
  secureCookies:env.NODE_ENV==="production"||env.PPW_ALLOW_LOCAL_HTTP!=="1"};
}
export function authenticateInvite(config:InviteConfig,playerId:string,
 code:string):boolean{
 if(typeof playerId!=="string"||playerId.length>200||
    typeof code!=="string"||code.length<16||code.length>500)return false;
 const expected=config.accessHashes[playerId]??"0".repeat(64);
 const actual=inviteDigest(code);
 return safeEqual(expected,actual)&&Object.hasOwn(config.accessHashes,playerId);
}
export function signPlayerSession(config:InviteConfig,playerId:string,
 now=Date.now()):{token:string;session:PlayerSession}{
 if(!Object.hasOwn(config.accessHashes,playerId))
  throw new Error("Unknown player session");
 const session={playerId,csrfToken:enc(randomBytes(24)),
  expiresAt:now+7*86400000};
 const payload=enc(JSON.stringify(session));
 const signature=enc(createHmac("sha256",config.secret).update(payload).digest());
 return {token:payload+"."+signature,session};
}
export function verifyPlayerSession(config:InviteConfig,token:string,
 now=Date.now()):PlayerSession|null{
 if(typeof token!=="string"||token.length>1600)return null;
 const parts=token.split(".");
 if(parts.length!==2||!parts[0]||!parts[1])return null;
 const expected=enc(createHmac("sha256",config.secret)
  .update(parts[0]).digest());
 if(!safeEqual(expected,parts[1]))return null;
 try{
  const x:unknown=JSON.parse(Buffer.from(parts[0],"base64url").toString("utf8"));
  if(!x||typeof x!=="object"||Array.isArray(x))return null;
  const s=x as Record<string,unknown>;
  if(typeof s.playerId!=="string"||
   !Object.hasOwn(config.accessHashes,s.playerId)||
   typeof s.csrfToken!=="string"||s.csrfToken.length<20||
   typeof s.expiresAt!=="number"||
   s.expiresAt<=now||s.expiresAt>now+7*86400000)return null;
  return {playerId:s.playerId,csrfToken:s.csrfToken,expiresAt:s.expiresAt};
 }catch{return null;}
}
export function sessionCookie(token:string,config:InviteConfig){
 return "ppw_session="+encodeURIComponent(token)+
  "; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800"+
  (config.secureCookies!==false?"; Secure":"");
}
export function clearSessionCookie(config:InviteConfig){
 return "ppw_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"+
  (config.secureCookies!==false?"; Secure":"");
}
export function readSessionCookie(request:Request):string|null{
 const header=request.headers.get("cookie")??"";
 const match=header.match(/(?:^|;\s*)ppw_session=([^;]*)/);
 if(!match)return null;
 try{return decodeURIComponent(match[1]!);}
 catch{return null;}
}
