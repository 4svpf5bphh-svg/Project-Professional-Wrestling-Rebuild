import {test} from "node:test";
import assert from "node:assert/strict";
import {createCardClient} from "../src/web/card-client.js";
test("Profile and move editing pass authorised transport without a show",async()=>{
 const methods:string[]=[];
 const transport=(async(_url:string,init?:RequestInit)=>{
  const body=JSON.parse(String(init?.body)) as Record<string,unknown>;
  methods.push(String(body.method));
  assert.equal(body.playerId,undefined);
  return {ok:true,status:200,json:async()=>({status:"APPLIED"})};
 }) as typeof fetch;
 const call=createCardClient({worldId:"world",promotionId:"promotion",
  showId:"",csrfToken:"csrf"},transport);
 await call("wrestlerProfile",{personId:"wrestler"});
 await call("wrestlerCareer",{personId:"wrestler"});
 await call("saveWrestlerRepertoire",{personId:"wrestler",requestId:"save",
  expectedRevision:1,primaryStyle:"TECHNICAL",secondaryStyle:null,
  signatureMoves:["Clothesline"],finishingMoves:["Chokeslam"]});
 assert.deepEqual(methods,["wrestlerProfile","wrestlerCareer","saveWrestlerRepertoire"]);
 await assert.rejects(call("forged-method"),/Unknown card action/);
});
