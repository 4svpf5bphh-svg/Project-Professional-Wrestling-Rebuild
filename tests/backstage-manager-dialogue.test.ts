import {test} from "node:test";
import assert from "node:assert/strict";
import {BACKSTAGE_CHOICES,BACKSTAGE_LABELS,backstageManagerReply,backstageReply}
 from "../src/domain/backstage-conversations.js";
test("every available manager choice has its own natural speech",()=>{
 for(const choices of Object.values(BACKSTAGE_CHOICES))for(const choice of choices){
  const reply=backstageManagerReply(choice);
  assert.ok(reply.length>20);
  assert.notEqual(reply,BACKSTAGE_LABELS[choice]);
  assert.notEqual(reply,backstageReply(choice,"ANSWERED"));
 }
});
