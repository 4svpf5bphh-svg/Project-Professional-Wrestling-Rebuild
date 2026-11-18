/** A manager's reply to an earned Backstage storyline reaction.
 * Commits an optional creative follow-up to the ORIGINAL Programme record.
 * Never books, simulates or certifies a scene; no parallel message ledger.
 */
import {applyWorldCommand} from "./world-commands.js";
import type {TransactionPool} from "./transaction.js";
import {readWorldMail} from "./backstage-world-mail.js";
import {validStoryFollowUpChoice,type StoryFollowUpChoice}
 from "../domain/programme-story-follow-up.js";

export interface BackstageStoryFollowUpInput{
 worldId:string;promotionId:string;playerId:string;mailId:string;
 choice:StoryFollowUpChoice;requestId:string;expectedRevision:number;
}
export async function chooseBackstageStoryFollowUp(
 pool:TransactionPool,i:BackstageStoryFollowUpInput){
 if(![i.worldId,i.promotionId,i.playerId,i.requestId].every(x=>
   typeof x==="string"&&!!x&&x.length<=200)||
  !/^backstage-world:[a-f0-9]{32}$/.test(i.mailId)||
  !validStoryFollowUpChoice(i.choice))
  throw Error("Invalid certified storyline follow-up");
 return applyWorldCommand(pool,{worldId:i.worldId,playerId:i.playerId,
  requestId:i.requestId,expectedRevision:i.expectedRevision,
  commandType:"BACKSTAGE_STORY_FOLLOW_UP",requiresOpenWeek:true,
  execute:async tx=>{
   // One identical bounded owner-private query validates that this exact
   // immutable certified scene is really in this manager's inbox NOW.
   const source=(await readWorldMail(tx,i)).find(m=>m.id===i.mailId);
   if(!source?.storyChapter||!source.canChooseStoryFollowUp||
    !source.storyProgrammeId||!source.storySource)
    throw Error("This story chapter can no longer receive a creative reply");
   const {sourceShowId,sourceSlotId,sourceWeekIndex}=source.storySource;
   const changed=await tx.query<{programme_id:string;year:number;week:number}>([
    "UPDATE ppw_programmes p SET creative_intent=",
    "COALESCE(p.creative_intent,jsonb_build_object(",
    "'blueprintId','CUSTOM','motivation','','audienceGoal','','destination',''))",
    "||jsonb_build_object('followUp',jsonb_build_object(",
    "'choice',$4::text,'sourceShowId',$5::text,'sourceSlotId',$6::text,",
    "'sourceWeekIndex',$7::integer))",
    "FROM ppw_worlds w",
    "WHERE p.world_id=$1 AND w.world_id=p.world_id AND p.promotion_id=$2 AND p.programme_id=$3",
    "AND p.status='ACTIVE' AND p.programme_format IN ('SOLO','RELATIONSHIP','FACTION')",
    "AND NOT (coalesce(p.creative_intent->'followUp'->>'sourceShowId','')=$5",
    "AND coalesce(p.creative_intent->'followUp'->>'sourceSlotId','')=$6)",
    "RETURNING p.programme_id,w.year,w.week"
   ].join(" "),[i.worldId,i.promotionId,source.storyProgrammeId,
    i.choice,sourceShowId,sourceSlotId,sourceWeekIndex]);
   if(changed.length!==1)throw Error("This storyline has already received a reply");
   await tx.query([
    "INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)",
    "VALUES($1,$2,$3,'BACKSTAGE_STORY_FOLLOW_UP_CHOSEN',",
    "jsonb_build_object('promotionId',$4::text,'programmeId',$5::text,",
    "'sourceShowId',$6::text,'sourceSlotId',$7::text,'choice',$8::text))"
   ].join(" "),[i.worldId,changed[0]!.year,changed[0]!.week,
    i.promotionId,source.storyProgrammeId,sourceShowId,sourceSlotId,i.choice]);
   return {mailId:i.mailId,programmeId:source.storyProgrammeId,
    choice:i.choice,sourceShowId,sourceSlotId,sourceWeekIndex};
  }
 });
}
