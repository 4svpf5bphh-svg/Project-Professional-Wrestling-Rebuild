/** Pure show-series recurrence preview, using exactly the save validator.
 * Never writes a planned event or fetches remote schedule data.
 */
import {dateAt,seriesDue,validateSeries,validateSchedule,weekIndex,
 type ShowSeries} from "../domain/show-calendar.js";

export const SERIES_CADENCES=[
 {label:"Weekly",weeks:1},{label:"Alternate weeks",weeks:2},
 {label:"Every four weeks",weeks:4},{label:"Every thirteen weeks",weeks:13},
 {label:"Twice a year",weeks:26},{label:"Every year",weeks:52},
] as const;
export function setSeriesCadence(series:ShowSeries,cadenceWeeks:number):ShowSeries{
 if(!Number.isSafeInteger(cadenceWeeks)||cadenceWeeks<1||cadenceWeeks>260)
  return {...series,cadenceWeeks:0};
 return {...series,cadenceWeeks,
  anchorWeek:Math.min(Math.max(0,series.anchorWeek),cadenceWeeks-1)};
}
export function calendarSeriesPreview(candidate:ShowSeries,
 existing:readonly ShowSeries[],year:number,week:number){
 const anchor=(Number.isSafeInteger(candidate.anchorWeek)?candidate.anchorWeek:-1);
 const clash=existing.filter(s=>s.seriesId!==candidate.seriesId);
 try{
  validateSeries(candidate);
  validateSchedule([...clash,candidate]);
 }catch(error){
  const source=error instanceof Error?error.message:"Review this schedule";
  const explanations:Record<string,string>={
   "Show calendar identity or name is invalid":"Give this event a name before saving.",
   "Only one normal A/B show may run per PPW week":
    "Only one regular A/B broadcast may run in the same week.",
   "Only one additional PPV or special may run per PPW week":
    "Only one additional PPV or special may run in the same week.",
   "Each promotion must retain exactly one flagship":"Keep one flagship broadcast on your calendar.",
   "Duplicate show names are not allowed":"Another event already uses that name.",
   "Invalid show recurrence or importance":
    "Choose a valid repeat interval, first week and importance.",
   "Regular and premium show roles cannot be mixed":
    "Choose either a regular broadcast or a special event."
  };
  return {valid:false,message:explanations[source]??source,
   occurrences:[] as {year:number;week:number}[]};
 }
 const current=weekIndex(year,week),upcoming:{year:number;week:number}[]=[];
 for(let i=0;i<260&&upcoming.length<4;i++){
  if(seriesDue(candidate,current+i))upcoming.push(dateAt(current+i));
 }
 return {valid:true,message:upcoming.length===0?
  "No upcoming dates are currently scheduled. Choose an earlier cycle week or a shorter repeat interval.":
  "These dates are reserved for this series, subject to your final event plans.",
  occurrences:upcoming,anchor};
}
