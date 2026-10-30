import test from "node:test";
import assert from "node:assert/strict";
import {storyDirectionHint} from "../src/ui/story-direction-hint.js";

test("booking continuity respects later certified matches and angles without choosing a finish",()=>{
 const direction={choice:"PURSUE_REMATCH" as const,weekIndex:7,laterBeatRecorded:false,
  laterMatchRecorded:false,laterAngleRecorded:false};
 assert.match(storyDirectionHint(direction,"MATCH"),/return bout/i);
 assert.match(storyDirectionHint(direction,"SEGMENT"),/challenge or face-off/i);
 assert.match(storyDirectionHint({...direction,laterMatchRecorded:true,
  laterBeatRecorded:true},"MATCH"),/return bout has already taken place/i);
 assert.match(storyDirectionHint({...direction,laterAngleRecorded:true},"MATCH"),
  /return bout has not taken place/);
 assert.match(storyDirectionHint({...direction,choice:"PLAN_RETALIATION"},"SEGMENT"),/attack/i);
 assert.match(storyDirectionHint({...direction,choice:"PLAN_RETALIATION",
  laterMatchRecorded:true},"SEGMENT"),/did not fulfil the planned retaliation/);
 assert.match(storyDirectionHint({...direction,choice:"PLAN_RETALIATION",
  laterAngleRecorded:true},"SEGMENT"),/on-screen beat followed/);
 assert.match(storyDirectionHint({...direction,choice:"LET_STAND"},"MATCH"),/let the result stand/i);
 assert.match(storyDirectionHint({...direction,choice:"LET_STAND",
  laterAngleRecorded:true},"MATCH"),/verified chapter/);
 // Old test snapshots still render without misinterpreting unknown fields.
 assert.match(storyDirectionHint({choice:"LET_STAND",weekIndex:2,
  laterBeatRecorded:false},"MATCH"),/let the result stand/);
});
