import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

/** Regression: the authenticated host router alone is not a Vercel function.
 * The mobile recovery button must have its own deployed server entry point. */
test("booking recovery has a physical Vercel serverless route",async()=>{
 const [booking,week]=await Promise.all([
  readFile(new URL("../api/playtest-booking.ts",import.meta.url),"utf8"),
  readFile(new URL("../api/playtest-week.ts",import.meta.url),"utf8")
 ]);
 assert.match(booking,/handleVercelNodeRequest\(request,response\)/);
 assert.equal(booking,week);
 assert.equal(booking.includes("GROQ_API_KEY"),false);
});
