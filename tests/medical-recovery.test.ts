import test from "node:test";
import assert from "node:assert/strict";
import {medicalClearanceWeek,remainingMedicalWeeks,isMedicallyCleared,
 effectiveMedicalClearance} from "../src/domain/medical-recovery.js";
const incident={personId:"a",incidentWeekIndex:51,weeksOut:2,severity:"MODERATE" as const};
test("recovery spans a 52-week year and never clears early",()=>{
 assert.equal(medicalClearanceWeek(incident),53);
 assert.equal(remainingMedicalWeeks(incident,51),2);
 assert.equal(remainingMedicalWeeks(incident,52),1);
 assert.equal(remainingMedicalWeeks(incident,53),0);
 assert.equal(remainingMedicalWeeks(incident,54),0);
 assert.equal(isMedicallyCleared(incident,52),false);
 assert.equal(isMedicallyCleared(incident,54),true);
});
test("later injury extends clearance without shortening an older absence",()=>{
 assert.equal(effectiveMedicalClearance([]),null);
 assert.equal(effectiveMedicalClearance([incident,
  {...incident,incidentWeekIndex:52,weeksOut:5}]),57);
});
test("malformed records fail closed",()=>{
 assert.throws(()=>medicalClearanceWeek({...incident,weeksOut:0}));
 assert.throws(()=>medicalClearanceWeek({...incident,incidentWeekIndex:-1}));
 assert.throws(()=>remainingMedicalWeeks(incident,-1));
});
