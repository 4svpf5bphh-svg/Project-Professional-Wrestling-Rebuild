import test from "node:test";
import assert from "node:assert/strict";
import {stableStoryFollowThrough} from "../src/domain/stable-story-followthrough.js";
const stables=[{stableId:"one",name:"The Faction",status:"ACTIVE",members:["leader","a"]},
 {stableId:"other",name:"The Rivals",status:"ACTIVE",members:["other-person"]}];
const roster=["leader","a","b","other-person"].map(personId=>({personId,name:personId}));
const story=(slotId:string,kind:string,outcome:string,weekIndex:number,person="b")=>({
 showId:"show",slotId,kind,outcome,weekIndex,
 story:{stableId:"one",actorIds:["leader"],targetIds:[person]}});
test("completed invitations need author confirmation; rejected later stories cancel older tasks",()=>{
 const yes=stableStoryFollowThrough({stables,roster,
  recent:[story("a","STABLE_INVITATION","HAPPENS",1)]});
 assert.deepEqual(yes.map(x=>[x.action,x.status,x.personId]),[["ADD","READY","b"]]);
 const cancelled=stableStoryFollowThrough({stables,roster,recent:[
  story("older","STABLE_INVITATION","HAPPENS",1),
  story("latest","STABLE_INVITATION","REFUSED",2),
 ]});
 assert.deepEqual(cancelled,[]);
});
test("a faction exit never removes a wrestler until an explicit roster command",()=>{
 const exit=stableStoryFollowThrough({stables,roster,recent:[
  {...story("exit","STABLE_EXIT","HAPPENS",5,"a"),story:{
   stableId:"one",actorIds:["a"],targetIds:[]}},
 ]});
 assert.equal(exit[0]!.action,"REMOVE");
 assert.equal(exit[0]!.status,"READY");
});
test("existing memberships and other factions prevent duplicate or conflicting instructions",()=>{
 const facts=[story("joined","STABLE_INVITATION","HAPPENS",5,"a"),
  story("other","STABLE_INVITATION","HAPPENS",4,"other-person")];
 const r=stableStoryFollowThrough({stables,roster,recent:facts});
 assert.equal(r.length,1);
 assert.equal(r[0]!.status,"OTHER_STABLE");
});
