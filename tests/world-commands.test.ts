import assert from "node:assert/strict";
import test from "node:test";
import { applyWorldCommand } from "../src/db/world-commands.js";
import type { TransactionPool } from "../src/db/transaction.js";

function harness(initial = 0, bookingOpen = true) {
  let revision = initial, receipt: {player_id:string;command_type:string;committed_revision:number;result:{ok:boolean}} | null = null;
  let executions = 0;
  const calls: string[] = [];
  const pool: TransactionPool = { async connect() {
    return {
      async query<T extends Record<string,unknown>>(sql:string, params:readonly unknown[]) {
        calls.push(sql);
        if (sql.includes("SELECT revision")) return [{revision}] as unknown as T[];
        if (sql.includes("LEFT JOIN ppw_command_receipts")) return [{booking_open:bookingOpen,player_id:receipt?.player_id??null,command_type:receipt?.command_type??null,committed_revision:receipt?.committed_revision??null,result:receipt?.result??null}] as unknown as T[];
        if (sql.startsWith("UPDATE ppw_worlds")) revision = Number(params[1]);
        if (sql.startsWith("INSERT INTO ppw_command_receipts")) receipt = {
          player_id:String(params[2]),command_type:String(params[3]),result:JSON.parse(String(params[4])),committed_revision:Number(params[5]),
        };
        return [] as T[];
      },
      release() {},
    };
  }};
  const command = (expectedRevision:number, requestId="req-1", playerId="player-1") => ({
    worldId:"world-1",playerId,requestId,commandType:"TEST",expectedRevision,
    async execute() { executions++; return {ok:true}; },
  });
  return {pool,command,calls,revision:()=>revision,executions:()=>executions};
}

test("new command writes one receipt and increments revision", async () => {
  const f=harness();
  assert.deepEqual(await applyWorldCommand(f.pool,f.command(0)),{status:"APPLIED",revision:1,result:{ok:true}});
  assert.equal(f.revision(),1);
  assert.equal(f.executions(),1);
});
test("retry replays receipt even when expected revision is stale", async () => {
  const f=harness();
  await applyWorldCommand(f.pool,f.command(0));
  assert.deepEqual(await applyWorldCommand(f.pool,f.command(0)),{status:"REPLAYED",revision:1,result:{ok:true}});
  assert.equal(f.executions(),1);
});
test("new request with stale revision does not execute", async () => {
  const f=harness(4);
  assert.deepEqual(await applyWorldCommand(f.pool,f.command(3)),{status:"STALE",revision:4});
  assert.equal(f.executions(),0);
  assert.equal(f.calls.filter(s=>s.startsWith("INSERT")).length,0);
});
test("same request ID from different player is rejected", async () => {
  const f=harness();
  await applyWorldCommand(f.pool,f.command(0));
  await assert.rejects(applyWorldCommand(f.pool,f.command(0,"req-1","player-2")),/collision/);
});

test("late player booking is denied without any writes or extra queries",async()=>{
  const f=harness(0,false);
  await assert.rejects(applyWorldCommand(f.pool,{...f.command(0),requiresOpenWeek:true}),/World booking deadline passed/);
  assert.equal(f.executions(),0);
  assert.equal(f.revision(),0);
  assert.equal(f.calls.filter(q=>q.startsWith("SELECT")).length,2);
});
test("a booking submitted before lock retains constant two-query validation",async()=>{
  const f=harness(0,true);
  assert.equal((await applyWorldCommand(f.pool,{...f.command(0),requiresOpenWeek:true})).status,"APPLIED");
  assert.equal(f.calls.filter(q=>q.startsWith("SELECT")).length,2);
});
