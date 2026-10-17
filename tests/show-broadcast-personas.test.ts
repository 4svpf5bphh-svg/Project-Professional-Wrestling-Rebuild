import test from "node:test";
import assert from "node:assert/strict";
import {projectBroadcastIdentities,broadcastNameplate}
 from "../src/domain/show-broadcast-personas.js";
test("restored real wrestler repertoire appears in the results without invented moves",()=>{
 const people=projectBroadcastIdentities([{
  personId:"cody",name:"Cody Rhodes",portableGimmickId:null,personaRecord:null,
 }]);
 const p=people.get("cody")!;
 assert.equal(p.source,"ROSTER_GUIDE");
 assert.ok(p.finishingMoves.length>0);
 assert.ok(p.character.length>0);
 assert.equal(broadcastNameplate("cody",people,"Cody Rhodes"),"Cody Rhodes");
});
test("a negotiated portable persona overrides static editorial seed",()=>{
 const people=projectBroadcastIdentities([{
  personId:"new",name:"Future Performer",portableGimmickId:"REBEL",
  personaRecord:{personaName:"The Prospect",gimmickId:"REBEL",
   primaryStyle:"BRAWLER",secondaryStyle:null,
   signatureMoves:[{name:"Original Special",category:"STRIKE",source:"PPW_AUTHORED"}],
   finishingMoves:[],source:"NEGOTIATED"},
 }]);
 const p=people.get("new")!;
 assert.equal(p.ringName,"The Prospect");
 assert.equal(p.source,"WORLD_RECORD");
 assert.deepEqual(p.signatureMoves,["Original Special"]);
 assert.equal(broadcastNameplate("new",people,"Future Performer"),
  "The Prospect (Future Performer)");
 assert.throws(()=>projectBroadcastIdentities([
  {personId:"x",name:"One",portableGimmickId:null,personaRecord:null},
  {personId:"x",name:"Two",portableGimmickId:null,personaRecord:null},
 ]),/Duplicate/);
});
