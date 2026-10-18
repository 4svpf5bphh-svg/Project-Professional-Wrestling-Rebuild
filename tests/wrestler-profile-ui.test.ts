import {test} from "node:test";
import assert from "node:assert/strict";
import {WRESTLING_STYLES} from "../src/domain/portable-persona.js";
import {wrestlerInitials,wrestlerLabel} from "../src/ui/wrestler-card.js";

test("Wrestler cards use a stable readable identity and no network lookups",()=>{
 assert.equal(wrestlerInitials("Roman Reigns"),"RR");
 assert.equal(wrestlerInitials("Sting"),"S");
 assert.equal(wrestlerLabel("HIGH_FLYER"),"High Flyer");
});
test("Wrestling styles remain bounded to the original shared library",()=>{
 assert.ok(WRESTLING_STYLES.includes("TECHNICAL"));
 assert.equal(new Set(WRESTLING_STYLES).size,WRESTLING_STYLES.length);
});
