import test from "node:test";
import assert from "node:assert/strict";
import {storyDirectionHint} from "../src/ui/story-direction-hint.js";

test("booking continuity respects a newer chapter and leaves every outcome authored",()=>{
 const direction={choice:"PURSUE_REMATCH" as const,weekIndex:7,laterBeatRecorded:false};
 assert.match(storyDirectionHint(direction,"MATCH"),/return bout/i);
 assert.match(storyDirectionHint(direction,"SEGMENT"),/challenge or face-off/i);
 assert.match(storyDirectionHint({...direction,laterBeatRecorded:true},"MATCH"),
  /another chapter/i);
 assert.match(storyDirectionHint({...direction,choice:"PLAN_RETALIATION"},"SEGMENT"),/attack/i);
 assert.match(storyDirectionHint({...direction,choice:"LET_STAND"},"MATCH"),/let the result stand/i);
});
