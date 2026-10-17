/** Calendar recurrence from the original PPW: one normal show slot per week,
 * independently recurring premium/special events. Projection is pure and
 * bounded; it never stores per-week occurrences or advances the World.
 */
export type ShowRole="FLAGSHIP"|"SECONDARY"|"DEVELOPMENTAL"|"SPECIAL"|"PREMIUM";
export type ShowKind="REGULAR"|"MAJOR";
export interface ShowSeries {
 seriesId:string;name:string;role:ShowRole;eventType:ShowKind;
 cadenceWeeks:number;anchorWeek:number;importance:number;active:boolean;
}
export const weekIndex=(year:number,week:number)=>(year-1)*52+week-1;
export function dateAt(index:number){
 return {year:Math.floor(index/52)+1,week:index%52+1};
}
export function seriesDue(series:ShowSeries,index:number){
 return series.active&&index>=series.anchorWeek&&
  (index-series.anchorWeek)%series.cadenceWeeks===0;
}
/** Adapted from the original real-show-series roster. PPW compresses
 * WWE/AEW A/B television into alternating weeks rather than two normal
 * cards every week; special and crown PPVs retain separate identities.
 */
type Profile={regular:{name:string;role:"FLAGSHIP"|"SECONDARY";every:number;
 anchor:number;importance:number}[];special:string;crown:string;crownImportance:number};
const profiles:Record<string,Profile>={
 WWE:{regular:[
  {name:"Monday Night Raw",role:"FLAGSHIP",every:2,anchor:0,importance:76},
  {name:"Friday Night SmackDown",role:"SECONDARY",every:2,anchor:1,importance:75}],
  special:"WWE Premium Live Event",crown:"WrestleMania",crownImportance:100},
 AEW:{regular:[
  {name:"AEW Dynamite",role:"FLAGSHIP",every:2,anchor:0,importance:72},
  {name:"AEW Collision",role:"SECONDARY",every:2,anchor:1,importance:66}],
  special:"AEW PPV",crown:"AEW All In",crownImportance:97},
 NJPW:{regular:[{name:"NJPW Road Series",role:"FLAGSHIP",every:1,anchor:0,importance:68}],
  special:"NJPW Major Event",crown:"Wrestle Kingdom",crownImportance:99},
 NXT:{regular:[{name:"NXT",role:"FLAGSHIP",every:1,anchor:0,importance:63}],
  special:"NXT Special Event",crown:"NXT Stand & Deliver",crownImportance:93},
 TNA:{regular:[{name:"TNA iMPACT!",role:"FLAGSHIP",every:1,anchor:0,importance:64}],
  special:"TNA Special Event",crown:"Bound For Glory",crownImportance:94},
 CMLL:{regular:[{name:"CMLL Super Viernes",role:"FLAGSHIP",every:1,anchor:0,importance:66}],
  special:"CMLL Major Event",crown:"CMLL Anniversary Show",crownImportance:96},
 ROH:{regular:[{name:"ROH Wrestling",role:"FLAGSHIP",every:1,anchor:0,importance:60}],
  special:"ROH Special Event",crown:"ROH Supercard of Honor",crownImportance:92},
 STARDOM:{regular:[{name:"STARDOM Live",role:"FLAGSHIP",every:1,anchor:0,importance:64}],
  special:"STARDOM Major Event",crown:"STARDOM Dream Queendom",crownImportance:95}
};
export function defaults(name:string,cadence:number,majorInterval:number):ShowSeries[]{
 const regular=Math.max(1,Math.floor(cadence||1));
 const interval=Math.max(2,Math.floor(majorInterval||4));
 const profile=profiles[name.trim().toUpperCase()==="TNA WRESTLING"?
  "TNA":name.trim().toUpperCase()];
 if(profile){
  const specialEvery=regular*interval;
  return [
   ...profile.regular.map((show,i):ShowSeries=>({
    seriesId:i===0?"calendar-default-flagship":"calendar-default-secondary-"+i,
    name:show.name,role:show.role,eventType:"REGULAR",
    cadenceWeeks:regular*show.every,anchorWeek:show.anchor,
    importance:show.importance,active:true
   })),
   {seriesId:"calendar-default-special",name:profile.special,role:"SPECIAL",
    eventType:"MAJOR",cadenceWeeks:specialEvery,
    anchorWeek:Math.min(specialEvery-1,regular*3),
    importance:87,active:true},
   {seriesId:"calendar-default-crown",name:profile.crown,role:"PREMIUM",
    eventType:"MAJOR",cadenceWeeks:52,anchorWeek:13,
    importance:profile.crownImportance,active:true}
  ];
 }
 return [
  {seriesId:"calendar-default-flagship",name:name+" Flagship",role:"FLAGSHIP",
   eventType:"REGULAR",cadenceWeeks:regular,anchorWeek:0,importance:58,active:true},
  {seriesId:"calendar-default-premium",name:name+" Premium",role:"PREMIUM",
   eventType:"MAJOR",cadenceWeeks:regular*interval,
   anchorWeek:regular*(interval-1),importance:85,active:true}
 ];
}
export function validateSeries(series:ShowSeries){
 if(!series.seriesId||series.seriesId.length>200||
  !series.name.trim()||series.name.trim().length>80)
  throw new Error("Show calendar identity or name is invalid");
 if(!["FLAGSHIP","SECONDARY","DEVELOPMENTAL","SPECIAL","PREMIUM"].includes(series.role))
  throw new Error("Invalid show calendar role");
 if(series.eventType!==(regularRole(series.role)?"REGULAR":"MAJOR"))
  throw new Error("Regular and premium show roles cannot be mixed");
 if(!Number.isSafeInteger(series.cadenceWeeks)||series.cadenceWeeks<1||
  series.cadenceWeeks>260||!Number.isSafeInteger(series.anchorWeek)||
  series.anchorWeek<0||series.anchorWeek>=series.cadenceWeeks||
  !Number.isFinite(series.importance)||series.importance<1||
  series.importance>100)throw new Error("Invalid show recurrence or importance");
}
export function regularRole(role:ShowRole){
 return role==="FLAGSHIP"||role==="SECONDARY"||role==="DEVELOPMENTAL";
}
function gcd(a:number,b:number):number{
 while(b){const r=a%b;a=b;b=r;}return a;
}
/** Exact modular-collision test, not an unreliable six-week sample. */
export function validateSchedule(series:readonly ShowSeries[]){
 const active=series.filter(x=>x.active);
 if(active.length>16)throw new Error("Calendar has too many active series");
 for(const s of active)validateSeries(s);
 if(active.filter(s=>s.role==="FLAGSHIP").length!==1)
  throw new Error("Each promotion must retain exactly one flagship");
 const names=new Set<string>();
 for(const s of active){
  const key=s.name.trim().toLocaleLowerCase("en-GB");
  if(names.has(key))throw new Error("Duplicate show names are not allowed");
  names.add(key);
 }
 const regular=active.filter(s=>regularRole(s.role));
 for(let i=0;i<regular.length;i++)for(let j=i+1;j<regular.length;j++){
  const a=regular[i]!,b=regular[j]!;
  if(Math.abs(a.anchorWeek-b.anchorWeek)%gcd(a.cadenceWeeks,b.cadenceWeeks)===0)
   throw new Error("Only one normal A/B show may run per PPW week");
 }
}
export function occurrences(series:readonly ShowSeries[],start:number,weeks:number){
 if(!Number.isSafeInteger(weeks)||weeks<1||weeks>52)
  throw new Error("Invalid calendar horizon");
 return Array.from({length:weeks},(_,offset)=>{
  const index=start+offset;
  return {...dateAt(index),offset,
   shows:series.filter(s=>seriesDue(s,index)).sort((a,b)=>
    Number(regularRole(b.role))-Number(regularRole(a.role))||
    b.importance-a.importance||a.name.localeCompare(b.name))};
 });
}
