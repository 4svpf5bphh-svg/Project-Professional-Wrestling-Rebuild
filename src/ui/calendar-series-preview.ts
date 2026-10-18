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
  return {valid:false,message:error instanceof Error?error.message:"Review this schedule",
   occurrences:[] as {year:number;week:number}[]};
 }
 const current=weekIndex(year,week),upcoming:{year:number;week:number}[]=[];
 for(let i=0;i<52&&upcoming.length<4;i++){
  if(seriesDue(candidate,current+i))upcoming.push(dateAt(current+i));
 }
 return {valid:true,message:upcoming.length===0?
  "No appearances in the next 52 weeks. Choose an earlier cycle week or a shorter repeat interval.":
  "These dates are reserved for this series, subject to your final event plans.",
  occurrences:upcoming,anchor};
}
