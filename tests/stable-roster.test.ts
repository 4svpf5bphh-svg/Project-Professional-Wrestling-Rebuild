import test from "node:test";
import assert from "node:assert/strict";
import {validateStableFounders} from "../src/domain/stable-roster.js";
test("original PPW accepts three-to-twelve distinct founders",()=>{
 assert.deepEqual(validateStableFounders("  The Outsiders  ",["a","b","c"]),{
  name:"The Outsiders",personIds:["a","b","c"]});
 assert.throws(()=>validateStableFounders("n",["a","b"]),/3–12/);
 assert.throws(()=>validateStableFounders("n",["a","a","b"]),/distinct/);
 assert.throws(()=>validateStableFounders("n",Array.from({length:13},(_,i)=>String(i))),/3–12/);
 assert.throws(()=>validateStableFounders("  ",["a","b","c"]),/1–60/);
});
