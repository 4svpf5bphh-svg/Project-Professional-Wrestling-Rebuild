import {test} from "node:test";
import assert from "node:assert/strict";
import {newEditorMatch} from "../src/ui/card-editor-model.js";
import {projectMatchGraphic} from "../src/ui/match-broadcast.js";
const make=(format:Parameters<typeof newEditorMatch>[1])=>newEditorMatch("m",format);
const context={show:"WrestleMania",promotion:"WWE",premium:true,mainEvent:true};
const titles=[{championshipId:"world",name:"World Championship",division:"SINGLES" as const,holderName:"Cody Rhodes"}];
test("broadcast singles uses only explicitly booked talent and booked championship",()=>{
 const match=make("SINGLES");
 match.teams=[[{personId:"a",contractId:"c"}],[{personId:"b",contractId:"d"}]];
 match.championshipId="world";
 const p=projectMatchGraphic(match,x=>x.personId==="a"?"Cody Rhodes":"Roman Reigns",titles,context);
 assert.deepEqual(p.participants,[["Cody Rhodes"],["Roman Reigns"]]);
 assert.equal(p.championship,"World Championship");
 assert.equal(p.motif,"wrestlemania");assert.equal(p.mainEvent,true);
});
test("tag teams and battle royals retain original booking sides",()=>{
 const tag=make("TAG");
 tag.teams=[[{personId:"a",contractId:"1"},{personId:"b",contractId:"2"}],
  [{personId:"c",contractId:"3"},{personId:"d",contractId:"4"}]];
 const p=projectMatchGraphic(tag,x=>x.personId,[],context);
 assert.deepEqual(p.participants,[["a","b"],["c","d"]]);
 const royal=make("BATTLE_ROYAL");royal.teams[0]=[{personId:"a",contractId:"1"}];
 const r=projectMatchGraphic(royal,x=>x.personId,[],context);
 assert.equal(r.entrants,1);assert.equal(r.totalEntrants,20);
 assert.equal(r.championship,null);
});
