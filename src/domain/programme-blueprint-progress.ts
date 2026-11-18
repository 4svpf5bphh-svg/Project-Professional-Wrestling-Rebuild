/** A Story Blueprint becomes readable progress ONLY through certified World
 * programme history or an actual saved card. Neither a manager's intention nor
 * a skipped/interrupted scene can complete a beat. No state is persisted here.
 */
import type {StoryBlueprint} from "./story-blueprints.js";
export interface BlueprintCertifiedEvidence{
 beatId:string;weekIndex:number|null;crowdResponse:number|null;
}
export interface BlueprintBookedEvidence{
 showId:string;slotId:string;kind:string;segmentKind:string|null;
 scenePurpose?:string|null;
 year:number;week:number;showName:string;status:"DRAFT"|"SUBMITTED";
}
export interface BlueprintBeatProgress{
 beatId:string;status:"PLAYED"|"BOOKED"|"AVAILABLE";
 playedWeekIndex:number|null;crowdResponse:number|null;
 bookedAt:{draftId:string;slotId:string;year:number;week:number;
  showName:string;submitted:boolean}|null;
}
export interface ProgrammeBlueprintProgress{
 blueprintId:string;played:number;booked:number;available:number;
 suggestedBeatId:string|null;beats:readonly BlueprintBeatProgress[];
}
export function readProgrammeBlueprintProgress(blueprint:StoryBlueprint,
 certified:readonly BlueprintCertifiedEvidence[],
 planned:readonly BlueprintBookedEvidence[]):ProgrammeBlueprintProgress{
 const beats=blueprint.beats.map(beat=>{
  const proven=certified.find(x=>x.beatId===beat.id&&
   x.weekIndex!==null&&Number.isSafeInteger(x.weekIndex)&&x.weekIndex>=0&&
   x.crowdResponse!==null&&Number.isFinite(x.crowdResponse)&&
   x.crowdResponse>=0&&x.crowdResponse<=100);
  if(proven)return {beatId:beat.id,status:"PLAYED" as const,
   playedWeekIndex:proven.weekIndex!,crowdResponse:proven.crowdResponse!,
   bookedAt:null};
  const booked=planned.find(x=>x.kind==="SEGMENT"&&
   x.segmentKind===beat.kind&&x.scenePurpose===beat.purpose&&
   x.showId.length>0&&x.slotId.length>0&&
   Number.isSafeInteger(x.year)&&Number.isSafeInteger(x.week));
  if(booked)return {beatId:beat.id,status:"BOOKED" as const,
   playedWeekIndex:null,crowdResponse:null,
   bookedAt:{draftId:booked.showId,slotId:booked.slotId,
    year:booked.year,week:booked.week,showName:booked.showName,
    submitted:booked.status==="SUBMITTED"}};
  return {beatId:beat.id,status:"AVAILABLE" as const,
   playedWeekIndex:null,crowdResponse:null,bookedAt:null};
 });
 return {blueprintId:blueprint.id,
  played:beats.filter(x=>x.status==="PLAYED").length,
  booked:beats.filter(x=>x.status==="BOOKED").length,
  available:beats.filter(x=>x.status==="AVAILABLE").length,
  suggestedBeatId:beats.find(x=>x.status==="AVAILABLE")?.beatId??null,
  beats};
}
