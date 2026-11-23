import test from "node:test";
import assert from "node:assert/strict";
import {estimateTerraStandardUsd} from "../src/domain/paid-editorial-cost.js";
test("Terra estimates are based on observed PPW usage and standard list rates",()=>{
 assert.equal(estimateTerraStandardUsd(5014,1768),0.013854);
 assert.equal(estimateTerraStandardUsd(null,1300),null);
 assert.equal(estimateTerraStandardUsd(4700,null),null);
 assert.equal(estimateTerraStandardUsd(-1,1400),null);
 assert.equal(estimateTerraStandardUsd(200,2100),0.0107);
});
