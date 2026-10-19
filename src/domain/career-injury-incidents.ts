/** Verified injury *incidents* only; no active/recovered state or clearance
 * can be inferred until the medical lifecycle itself is rebuilt.
 */
export interface InjuryIncident{
 showId:string;matchId:string;year:number;week:number;
 severity:"MINOR"|"MODERATE"|"MAJOR"|"SEVERE";
 originalWeeksOut:number;promotion:string;format:"SINGLES"|"TAG";
}
export function readInjuryIncidents(value:unknown):InjuryIncident[]{
 if(!Array.isArray(value)||value.length>6)return [];
 const valid=(r:unknown):r is InjuryIncident=>{
  if(!r||typeof r!=="object"||Array.isArray(r))return false;
  const x=r as Record<string,unknown>;
  return typeof x.showId==="string"&&!!x.showId&&x.showId.length<=200&&
   typeof x.matchId==="string"&&!!x.matchId&&x.matchId.length<=200&&
   Number.isInteger(x.year)&&Number(x.year)>0&&
   Number.isInteger(x.week)&&Number(x.week)>=1&&Number(x.week)<=52&&
   ["MINOR","MODERATE","MAJOR","SEVERE"].includes(String(x.severity))&&
   Number.isInteger(x.originalWeeksOut)&&Number(x.originalWeeksOut)>=1&&
   Number(x.originalWeeksOut)<=52&&typeof x.promotion==="string"&&
   x.promotion.length<=200&&["SINGLES","TAG"].includes(String(x.format));
 };
 return value.filter(valid).map(x=>({
  showId:x.showId,matchId:x.matchId,year:x.year,week:x.week,
  severity:x.severity,originalWeeksOut:x.originalWeeksOut,
  promotion:x.promotion,format:x.format
 }));
}
