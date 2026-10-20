import test from "node:test";
import assert from "node:assert/strict";
import {bookingErrorCode,bookingErrorMessage}
 from "../src/web/card-error-feedback.js";
test("player-actionable canonical booking errors resolve to safe, stable categories",()=>{
 const examples=[
  ["World booking deadline passed","DEADLINE"],
  ["Show must be planned in the current six-week window","SCHEDULE"],
  ["This week already has a planned show","SCHEDULE"],
  ["Choose an available venue in that market","VENUE"],
  ["One wrestler is unavailable for this show","TALENT"],
  ["A contract has no remaining dates","TALENT"],
  ["Invalid match participants","MATCH"],
  ["Book at least one match","MATCH"],
  ["This angle has no target role","ANGLE"],
  ["Choose a wrestler from the linked rivalry before adding this angle","PROGRAMME"]
 ] as const;
 for(const [message,code] of examples){
  assert.equal(bookingErrorCode(message),code,message);
  assert.ok(bookingErrorMessage(code)?.length);
 }
});
test("never leak arbitrary SQL, private promotion names or returned strings",()=>{
 for(const secret of [
  "duplicate key value violates unique constraint ppw_contracts_private",
  "sql error SELECT ... FROM confidential",
  "Current show not accessible to this controller",
  "Unknown booking action",
  "Postgres password found"
 ])assert.equal(bookingErrorCode(secret),null,secret);
 assert.equal(bookingErrorMessage("SQL_SECRET"),null);
 assert.equal(bookingErrorMessage({code:"VENUE"}),null);
 assert.equal(bookingErrorMessage("__proto__"),null);
});
