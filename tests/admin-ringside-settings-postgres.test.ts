import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld} from "../src/db/world-operations.js";
import {readAdminRingsideSettings,changeAdminRingsideSettings}
 from "../src/db/admin-ringside-settings.js";
import {validateRingsideSettings} from "../src/domain/ringside-settings.js";
const url=process.env.PPW_NEON_TEST_URL;
test("audited owner Groq settings persist, support one versioned writer, and never alter results",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const worldId="admin-settings-"+randomUUID(),db=postgresPool(url!,3);
 const standard={model:"openai/gpt-oss-20b",voice:"SATIRE",detail:"LONG",
  creativity:0.8,reasoning:"medium",additionalGuidance:"More character and wrestling humour"};
 try{
  await withWorldTransaction(db.pool,tx=>createWorld(tx,{id:worldId,
   name:"Admin Settings",seed:32,rulesetVersion:"test"}));
  const defaults=await readAdminRingsideSettings(db.pool,worldId);
  assert.equal(defaults.version,0);
  assert.equal(defaults.model,"openai/gpt-oss-120b");
  assert.equal(defaults.voice,"MARTY");
  assert.throws(()=>validateRingsideSettings({...standard,model:"unsafe/custom"}),/Unsupported/);
  assert.throws(()=>validateRingsideSettings({...standard,creativity:99}),/Unsupported/);
  assert.throws(()=>validateRingsideSettings({...standard,additionalGuidance:"A".repeat(901)}),/Unsupported/);
  const first=await changeAdminRingsideSettings(db.pool,worldId,"operator",standard,0);
  assert.equal(first.version,1);assert.equal(first.model,"openai/gpt-oss-20b");
  assert.equal((await readAdminRingsideSettings(db.pool,worldId)).voice,"SATIRE");
  await assert.rejects(changeAdminRingsideSettings(db.pool,worldId,"operator",
   {...standard,voice:"SPORTS"},0),/changed/);
  const races=await Promise.allSettled([
   changeAdminRingsideSettings(db.pool,worldId,"operator",{...standard,voice:"SPORTS"},1),
   changeAdminRingsideSettings(db.pool,worldId,"operator",{...standard,voice:"MARTY"},1)
  ]);
  assert.equal(races.filter(x=>x.status==="fulfilled").length,1);
  assert.equal((await readAdminRingsideSettings(db.pool,worldId)).version,2);
  const events=await withWorldTransaction(db.pool,tx=>tx.query<{action:string;player_id:string}>(`
   SELECT action,player_id FROM ppw_admin_action_audit WHERE world_id=$1`,[worldId]));
  assert.equal(events.length,2);
  assert.ok(events.every(x=>x.action==="RINGSIDE_SETTINGS_UPDATED"&&x.player_id==="operator"));
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query("DELETE FROM ppw_admin_action_audit WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_admin_ringside_settings WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
  }).finally(()=>db.close());
 }
});
