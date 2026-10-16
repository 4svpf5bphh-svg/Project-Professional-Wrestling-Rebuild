import assert from "node:assert/strict";
import test from "node:test";
import {calculateRunwayWeeks,determineFinancialDistress} from "../src/domain/legacy-finance.js";
test("Original financial health: rounded runway, exact threshold boundaries and zero cash",()=>{
 assert.equal(calculateRunwayWeeks(2006,-100),20.1);
 assert.equal(determineFinancialDistress(2006,-100),"HEALTHY");
 assert.equal(determineFinancialDistress(2001,-100),"WATCH"); // rounds to 20.0
 assert.equal(determineFinancialDistress(2000,-100),"WATCH");
 assert.equal(determineFinancialDistress(850,-100),"WATCH");
 assert.equal(determineFinancialDistress(800,-100),"DISTRESSED");
 assert.equal(determineFinancialDistress(250,-100),"DISTRESSED");
 assert.equal(determineFinancialDistress(200,-100),"CRISIS");
 assert.equal(determineFinancialDistress(0,300),"CRISIS");
 assert.equal(determineFinancialDistress(-40,0),"CRISIS");
 assert.equal(determineFinancialDistress(1,0),"HEALTHY");
 assert.equal(calculateRunwayWeeks(0,-100),0);
 assert.equal(calculateRunwayWeeks(1000,1),null);
 assert.equal(calculateRunwayWeeks(333,-200),1.7);
 assert.throws(()=>calculateRunwayWeeks(Infinity,-1),/Invalid/);
});
