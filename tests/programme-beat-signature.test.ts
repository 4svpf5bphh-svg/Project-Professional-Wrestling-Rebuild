import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {certifiedProgrammeBeatSignature} from "../src/domain/programme-beat-signature.js";

const people=["wrestler-alice-long-id","wrestler-bob-long-id"];
test("a certified match retains its exact historic participant signature",()=>{
 const old="MATCH:"+createHash("sha256").update(JSON.stringify([...people].sort())).digest("hex");
 assert.equal(certifiedProgrammeBeatSignature({kind:"MATCH",personIds:people,payload:{}}),old);
});
test("different certified angle types are different beats; exact repetitions stay stale",()=>{
 const promo=certifiedProgrammeBeatSignature({kind:"SEGMENT",personIds:people,payload:{kind:"PROMO"}});
 const attack=certifiedProgrammeBeatSignature({kind:"SEGMENT",personIds:people,payload:{kind:"ATTACK"}});
 const challenge=certifiedProgrammeBeatSignature({kind:"SEGMENT",personIds:people,payload:{kind:"CHALLENGE"}});
 assert.notEqual(promo,attack);
 assert.notEqual(attack,challenge);
 assert.equal(attack,certifiedProgrammeBeatSignature({
  kind:"SEGMENT",personIds:[...people].reverse(),payload:{kind:"ATTACK"}}));
 assert.ok(attack.startsWith("SEGMENT:ATTACK:"));
 assert.ok(!attack.includes("wrestler-alice"));
 assert.ok(attack.length<100);
});
test("invalid certified angle identity is rejected rather than written as fake history",()=>{
 assert.throws(()=>certifiedProgrammeBeatSignature({
  kind:"SEGMENT",personIds:people,payload:{kind:"UNSUPPORTED_FAKE_ANGLE"}}));
 assert.throws(()=>certifiedProgrammeBeatSignature({
  kind:"SEGMENT",personIds:people,payload:null}));
 assert.throws(()=>certifiedProgrammeBeatSignature({
  kind:"MATCH",personIds:[],payload:{}}));
});
