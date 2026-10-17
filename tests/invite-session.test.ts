import test from "node:test";
import assert from "node:assert/strict";
import {authenticateInvite,clearSessionCookie,inviteDigest,
 readSessionCookie,requireInviteConfig,sessionCookie,signPlayerSession,verifyPlayerSession}
 from "../src/web/invite-session.js";
const codeA="some-long-invite-code-1234567890-12345678";
const codeB="another-distinct-player-passcode-0123456789";
const config=requireInviteConfig({PPW_SESSION_SECRET:"a".repeat(48),
 PPW_WORLD_ID:"world-genesis",
 PPW_PLAYER_ACCESS_HASHES:JSON.stringify({
  "player-a":inviteDigest(codeA),"player-b":inviteDigest(codeB)
 }),NODE_ENV:"production"});
test("Only independently configured private high-entropy invite code proves actor identity",()=>{
 assert.equal(authenticateInvite(config,"player-a",codeA),true);
 assert.equal(authenticateInvite(config,"player-b",codeB),true);
 assert.equal(authenticateInvite(config,"player-a",codeB),false);
 assert.equal(authenticateInvite(config,"player-b",codeA),false);
 assert.equal(authenticateInvite(config,"ghost",codeA),false);
 assert.equal(authenticateInvite(config,"player-a","tiny"),false);
 assert.throws(()=>requireInviteConfig({PPW_SESSION_SECRET:"short",
  PPW_WORLD_ID:"w",PPW_PLAYER_ACCESS_HASHES:"{}"}),/configuration/);
 assert.throws(()=>requireInviteConfig({PPW_SESSION_SECRET:"x".repeat(50),
  PPW_WORLD_ID:"w",PPW_PLAYER_ACCESS_HASHES:'{"attacker":"plaintext"}'}),/configuration/);
});
test("Signed sessions expire, cannot be tampered with or forged into another player's identity",()=>{
 const now=1781800000000;
 const signed=signPlayerSession(config,"player-a",now);
 assert.equal(verifyPlayerSession(config,signed.token,now+1)?.playerId,"player-a");
 assert.equal(verifyPlayerSession(config,signed.token,now+1)?.csrfToken,
  signed.session.csrfToken);
 assert.equal(verifyPlayerSession(config,signed.token,now+7*86400000+1),null);
 assert.equal(verifyPlayerSession(config,signed.token,now-8*86400000),null);
 const [payload,mac]=signed.token.split(".");
 assert.equal(verifyPlayerSession(config,payload+"."+
  mac!.slice(0,-1)+(mac!.endsWith("x")?"y":"x"),now),null);
 const other=signPlayerSession(config,"player-b",now);
 assert.notEqual(other.session.csrfToken,signed.session.csrfToken);
 assert.equal(verifyPlayerSession(config,other.token,now)?.playerId,"player-b");
 assert.equal(verifyPlayerSession({...config,secret:"b".repeat(48)},signed.token,now),null);
});
test("Session cookie is Secure, HttpOnly, SameSite and not JavaScript-readable",()=>{
 const now=Date.now(),token=signPlayerSession(config,"player-a",now).token;
 const cookie=sessionCookie(token,config);
 assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Lax/);
 assert.match(cookie,/Secure/);assert.match(cookie,/Max-Age=604800/);
 const request=new Request("https://ppw.example/api/session",{
  headers:{cookie:"other=123; "+cookie.split(";")[0]}});
 assert.equal(readSessionCookie(request),token);
 assert.equal(readSessionCookie(new Request("https://ppw.example")),null);
 assert.match(clearSessionCookie(config),/Max-Age=0/);
});
