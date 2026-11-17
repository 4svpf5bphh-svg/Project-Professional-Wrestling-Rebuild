import test from "node:test";
import assert from "node:assert/strict";
import {validateCreativeOutline} from "../src/domain/creative-outline.js";

test("manager can outline a PPV build through the next seven actual World weeks",()=>{
 const notes=[{year:1,week:52,note:"Give the underdog one final setback"},
  {year:2,week:2,note:"Complete the turn at the confirmed PPV"}];
 assert.deepEqual(validateCreativeOutline(notes,1,50),notes);
 assert.deepEqual(validateCreativeOutline([],1,50),[]);
});
test("reject invented past/far-future, duplicate, too-long or control-character intentions",()=>{
 const note=(year:number,week:number,note:string)=>({year,week,note});
 for(const payload of [
  [note(1,49,"Past")],
  [note(2,5,"Too far")],
  [note(1,52,"One"),note(1,52,"Two")],
  [note(1,50,"x".repeat(241))],
  [note(1,50," Newline space ")],
  [note(1,50,"Bad\u0000character")],
  Array.from({length:8},(_,i)=>note(1,50+i,"Too many"))
 ]){
  assert.throws(()=>validateCreativeOutline(payload,1,50));
 }
});
