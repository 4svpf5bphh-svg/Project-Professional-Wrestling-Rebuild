/** Owner-authored six-week creative notes, intentionally not authoritative results.
 * At most one short booker's intention per week. No paid AI or new show rows.
 */
export interface CreativeWeekOutline{
 year:number;week:number;note:string;
}
export function validateCreativeOutline(
 input:unknown,currentYear:number,currentWeek:number):CreativeWeekOutline[]{
 if(!Array.isArray(input)||input.length>7)
  throw new Error("A creative outline can contain at most seven weeks");
 if(!Number.isSafeInteger(currentYear)||currentYear<1||
  !Number.isSafeInteger(currentWeek)||currentWeek<1||currentWeek>52)
  throw new Error("Invalid current PPW week");
 const start=(currentYear-1)*52+currentWeek-1;
 const seen=new Set<number>();
 const notes:CreativeWeekOutline[]=[];
 for(const item of input){
  if(!item||typeof item!=="object"||Array.isArray(item))
   throw new Error("Invalid creative outline entry");
  const {year,week,note}=item as Record<string,unknown>;
  if(!Number.isSafeInteger(year)||!Number.isSafeInteger(week)||
   (year as number)<1||(week as number)<1||(week as number)>52||
   typeof note!=="string"||note.length<1||note.length>240||
   note.trim()!==note||/[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F]/u.test(note))
   throw new Error("Invalid creative outline week or note");
  const index=((year as number)-1)*52+(week as number)-1;
  if(index<start||index>start+6||seen.has(index))
   throw new Error("Creative outlines must be for distinct weeks within six weeks ahead");
  seen.add(index);
  notes.push({year:year as number,week:week as number,note});
 }
 return notes.sort((a,b)=>(a.year-b.year)||a.week-b.week);
}
