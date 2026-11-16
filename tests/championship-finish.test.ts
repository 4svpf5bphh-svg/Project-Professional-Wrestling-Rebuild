import {test} from "node:test";
import {strict as assert} from "node:assert";
import {isDecisiveChampionshipFinish} from "../src/domain/championship-finish.js";
test("every verified special match win may win an eligible title",()=>{
 for(const f of ["CLEAN_PIN","FLASH_PIN","SUBMISSION","RETRIEVAL","TABLE_BREAK",
  "TEN_COUNT","MOST_FALLS","SECOND_FALL","VERBAL_SURRENDER",
  "FIRST_BLOOD","CASKET_CLOSE"])
  assert.equal(isDecisiveChampionshipFinish(f),true,f);
});
test("dirty, protected, injury and battle-royal outcomes never win a title",()=>{
 for(const f of ["PROTECTED_FINISH","DISQUALIFICATION","FOREIGN_OBJECT",
  "INJURY_STOPPAGE","OVER_THE_TOP_ROPE","","UNKNOWN"])
  assert.equal(isDecisiveChampionshipFinish(f),false,f);
});
