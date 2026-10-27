/** Archived PPW booking.ts / matches.ts adapted for the current singles-
 * capable resolver. Schedules full 2-5 match shows without exceeding the
 * existing modest AI card-size target or fabricating tag/title logic.
 * This AI target is not a human show limit (100 unique appearances allowed).
 */
import {createHash} from "node:crypto";
import {DeterministicRng,deterministicSeedFromText} from "../simulation/legacy/rng.js";
import {chooseStaffFallbackSchedule,type ExistingShowBooking} from "./staff-show-schedule.js";
import type {StaffWrestlerCandidate} from "./staff-fallback-card.js";
import type {EventType} from "./legacy-show-economics.js";
import type {AiPromotionStrategy} from "./ai-promotion-strategy.js";
export interface AiRosterCandidate extends StaffWrestlerCandidate{
 momentum:number;popularity:number;recognition:number;presentation:number;matchCraft:number;
}
export interface AiCardInput{
 worldId:string;worldSeed:string;year:number;week:number;promotionId:string;showId:string;
 roster:readonly AiRosterCandidate[];bookedShows:readonly ExistingShowBooking[];
 activeVenues:readonly string[];eventType:EventType;
 excludedDays?:readonly number[];
 riskTolerance:number;matchQualityPreference:number;starPreference:number;
 strategy?:AiPromotionStrategy;
 recentPairs?:readonly string[];
 establishedPartners?:readonly {aId:string;bId:string}[];
 establishedTeams?:readonly {teamId:string;aId:string;bId:string}[];
 tagTitles?:readonly {championshipId:string;holderTeamId:string;heat:number}[];
 featuredPairs?:readonly {aId:string;bId:string;kind:"PROGRAMME"|"SINGLES_TITLE";
  programmeId?:string;championshipId?:string;holderId?:string;heat:number}[];
}
export type AiCardMatch={
 participants:{personId:string;contractId:string}[];
 matchType?:"SINGLES"|"TAG";family?:"TEAMS";
 sides?:readonly {sideId:"A"|"B";participants:{personId:string;contractId:string}[]}[];
 scriptedWinnerSide?:"A"|"B";
 scriptedWinner:string;bookingDivision:"MEN"|"WOMEN";
 intent:"COMPETITIVE"|"STORY"|"PROTECTIVE"|"SHOWCASE"|"TECHNICAL"|"HIGH_RISK"|"EPIC";
 plannedFinish:"CLEAN_PIN"|"SUBMISSION"|"FLASH_PIN"|"PROTECTED_FINISH";
 plannedLengthMinutes:number;mainEvent:boolean;
 programmeId?:string;championshipId?:string;
};
export type AiCardResult=
 |{status:"READY";schedule:{day:number;venueId:string};matches:AiCardMatch[]}
 |{status:"UNFILLED";reason:"NO_ELIGIBLE_PAIR"|"NO_VENUE_OR_DAY"};
const push=(p:AiRosterCandidate)=>p.momentum*.4+p.popularity*.3+
 p.recognition*.2+p.presentation*.1;
const rank=(p:AiRosterCandidate)=>p.recognition+p.popularity+p.momentum+p.matchCraft;
const key=(a:string,b:string)=>a<b?a+":"+b:b+":"+a;
const hash=(parts:unknown[])=>createHash("sha256").update(JSON.stringify(parts)).digest("hex");
const isStat=(x:number)=>typeof x==="number"&&Number.isFinite(x)&&x>=0&&x<=100;
const best=(a:AiRosterCandidate,b:AiRosterCandidate)=>
 rank(b)-rank(a)||a.personId.localeCompare(b.personId,"en");
function plannedLength(intent:AiCardMatch["intent"],main:boolean){
 const base={EPIC:28,TECHNICAL:20,HIGH_RISK:17,SHOWCASE:11,
  PROTECTIVE:12,STORY:14,COMPETITIVE:15}[intent];
 return base+(main&&intent!=="EPIC"?4:0);
}
function finish(intent:AiCardMatch["intent"],roll:number):AiCardMatch["plannedFinish"]{
 switch(intent){
  case"TECHNICAL":return roll<.45?"SUBMISSION":"CLEAN_PIN";
  case"PROTECTIVE":return roll<.55?"PROTECTED_FINISH":roll<.8?"FLASH_PIN":"CLEAN_PIN";
  case"STORY":return roll<.45?"PROTECTED_FINISH":roll<.72?"FLASH_PIN":"CLEAN_PIN";
  case"SHOWCASE":return roll<.7?"CLEAN_PIN":roll<.88?"SUBMISSION":"FLASH_PIN";
  case"EPIC":return roll<.58?"CLEAN_PIN":roll<.9?"SUBMISSION":"FLASH_PIN";
  case"HIGH_RISK":return roll<.55?"CLEAN_PIN":roll<.78?"FLASH_PIN":"PROTECTED_FINISH";
  case"COMPETITIVE":return roll<.56?"CLEAN_PIN":roll<.8?"SUBMISSION":"FLASH_PIN";
 }
}
function style(input:AiCardInput,order:number,isMain:boolean):AiCardMatch["intent"]{
 if(isMain&&input.eventType==="MAJOR")return "EPIC";
 // Keep a recognisable signature bout even if the seeded rolls differ;
 // other contests still vary and major main events retain EPIC priority.
 if(!isMain&&order===1&&input.strategy){
  const signature={WORKRATE:"TECHNICAL",SPECTACLE:"HIGH_RISK",
   STAR_POWER:"SHOWCASE",STORYTELLING:"STORY"} as const;
  return signature[input.strategy.identity];
 }
 const rng=new DeterministicRng(deterministicSeedFromText(
  `${input.worldSeed}:${input.showId}:intent:${order}`));
 if(input.strategy?.identity==="WORKRATE"&&rng.chance(.62))return "TECHNICAL";
 if(input.strategy?.identity==="SPECTACLE"&&rng.chance(.55))return "HIGH_RISK";
 if(input.strategy?.identity==="STAR_POWER"&&rng.chance(.55))return "SHOWCASE";
 if(input.strategy?.identity==="STORYTELLING"&&rng.chance(.6))return "STORY";
 if(input.riskTolerance>=72&&rng.chance(.18))return "HIGH_RISK";
 if(input.matchQualityPreference>=70&&rng.chance(.35))return "TECHNICAL";
 if(input.starPreference>=70&&rng.chance(.3))return "SHOWCASE";
 return rng.pick(["COMPETITIVE","STORY","PROTECTIVE"] as const);
}
export function chooseAiWorldCard(input:AiCardInput):AiCardResult{
 if(!input.worldId||!input.showId||!input.promotionId||!input.worldSeed||
  !Number.isSafeInteger(input.year)||input.year<1||
  !Number.isInteger(input.week)||input.week<1||input.week>52||
  !["REGULAR","MAJOR"].includes(input.eventType)||
  ![input.riskTolerance,input.matchQualityPreference,input.starPreference].every(isStat)||
  input.roster.length>256||input.activeVenues.length>256||
  input.bookedShows.length>128||(input.recentPairs?.length??0)>1024||
  (input.featuredPairs?.length??0)>256||
  (input.establishedPartners?.length??0)>512||
  (input.establishedTeams?.length??0)>512||
  (input.tagTitles?.length??0)>256)
   throw new Error("Invalid World AI card context");
 const used=new Map<string,number>();
 for(const x of input.bookedShows)for(const id of new Set(x.personIds))
  used.set(id,(used.get(id)??0)+1);
 const unique=new Map<string,AiRosterCandidate>();
 for(const p of input.roster){
  if(!p.personId||!p.contractId||!["MEN","WOMEN"].includes(p.bookingDivision)||
    !Number.isInteger(p.weeklyCapacity)||p.weeklyCapacity<1||p.weeklyCapacity>7||
    ![p.momentum,p.popularity,p.recognition,p.presentation,p.matchCraft].every(isStat))
   throw new Error("Invalid original AI wrestler profile");
  if((used.get(p.personId)??0)>=p.weeklyCapacity)continue;
  const prior=unique.get(p.personId);
  if(!prior||p.contractId<prior.contractId)unique.set(p.personId,p);
 }
 // During a star-building quarter, worthy undercard wrestlers are given
 // opportunities. This cannot override eligibility or a title/feud feature.
 const opportunity=(p:AiRosterCandidate)=>input.strategy?.focus==="BUILD_STARS"&&
  p.popularity<60&&p.momentum>=45&&p.matchCraft>=40?16:0;
 const eligible=[...unique.values()].sort((a,b)=>
  rank(b)+opportunity(b)-rank(a)-opportunity(a)||
  a.personId.localeCompare(b.personId,"en"));
 if(!["MEN","WOMEN"].some(division=>eligible.filter(p=>p.bookingDivision===division).length>=2))
  return {status:"UNFILLED",reason:"NO_ELIGIBLE_PAIR"};
 const occupiedSameDay=(day:number,id:string)=>input.bookedShows.some(show=>
  show.day===day&&show.personIds.includes(id));
 // Reuse the World-seeded schedule policy, but choose the actual top-card
 // wrestlers within its fixed day. A few unavailable stars cannot veto
 // an otherwise valid venue/day for the rest of the roster.
 const schedule=chooseStaffFallbackSchedule({
  worldId:input.worldId,worldSeed:input.worldSeed,year:input.year,week:input.week,
  promotionId:input.promotionId,showId:input.showId,
  preferredDay:null,preferredVenueId:null,personIds:[],
  excludedDays:input.excludedDays,
  availableVenueIds:input.activeVenues,bookedShows:input.bookedShows});
 if(!schedule)return {status:"UNFILLED",reason:"NO_VENUE_OR_DAY"};
 const available=eligible.filter(p=>!occupiedSameDay(schedule.day,p.personId));
 const men=available.filter(p=>p.bookingDivision==="MEN"),women=available.filter(p=>p.bookingDivision==="WOMEN");
 if(men.length<2&&women.length<2)return {status:"UNFILLED",reason:"NO_ELIGIBLE_PAIR"};
 // Original booking ranks the appearances; give both divisions a reasonable
 // showcase when roster allows, even if men's absolute ranking dominates.
 const featured=(input.featuredPairs??[]).filter(f=>
   f.aId&&f.bId&&f.aId!==f.bId&&isStat(f.heat)&&
   (f.kind==="PROGRAMME"?!!f.programmeId:
    f.kind==="SINGLES_TITLE"&&!!f.championshipId&&
       f.holderId===f.aId));
 if(featured.length!==(input.featuredPairs?.length??0))
  throw new Error("Invalid canonical featured programme or title");
 const byId=new Map(available.map(p=>[p.personId,p]));
 const priority=[...featured].filter(f=>
   byId.has(f.aId)&&byId.has(f.bId)&&
   byId.get(f.aId)!.bookingDivision===byId.get(f.bId)!.bookingDivision)
  .sort((a,b)=>
   (a.kind==="SINGLES_TITLE"?0:1)-(b.kind==="SINGLES_TITLE"?0:1)||
   b.heat-a.heat||a.aId.localeCompare(b.aId,"en"));
 const reserve=priority[0]??null;
 const tagCandidates=(input.establishedTeams??[]).map(t=>{
  if(!t.teamId||!t.aId||!t.bId||t.aId===t.bId)
   throw new Error("Invalid established tag team");
  return {...t,a:byId.get(t.aId),b:byId.get(t.bId)};
 }).filter(t=>t.a&&t.b&&t.a.bookingDivision===t.b.bookingDivision &&
  ![t.aId,t.bId].some(id=>id===reserve?.aId||id===reserve?.bId))
  .sort((a,b)=>push(b.a!)+push(b.b!)-push(a.a!)-push(a.b!)||
   a.teamId.localeCompare(b.teamId,"en"));
 const titleCandidates=(input.tagTitles??[]).filter(t=>{
  if(!t.championshipId||!t.holderTeamId||!isStat(t.heat))
   throw new Error("Invalid tag championship context");
  return true;
 }).sort((a,b)=>b.heat-a.heat||
  a.championshipId.localeCompare(b.championshipId,"en"));
 const eligibleTagTitle=input.eventType==="MAJOR"?
   titleCandidates.find(t=>tagCandidates.some(x=>x.teamId===t.holderTeamId)):undefined;
 const firstTeam=eligibleTagTitle?
  tagCandidates.find(t=>t.teamId===eligibleTagTitle.holderTeamId):tagCandidates[0];
 const secondTeam=firstTeam?tagCandidates.find(t=>t.teamId!==firstTeam.teamId&&
  t.a!.bookingDivision===firstTeam.a!.bookingDivision &&
  ![firstTeam.aId,firstTeam.bId].includes(t.aId)&&
  ![firstTeam.aId,firstTeam.bId].includes(t.bId)):undefined;
 const tagChoice=firstTeam&&secondTeam?{first:firstTeam,second:secondTeam,
  titleId:eligibleTagTitle?.championshipId??null}:null;
 const tagIds=new Set(tagChoice?[tagChoice.first.aId,tagChoice.first.bId,
  tagChoice.second.aId,tagChoice.second.bId]:[]);
 const chosen:AiRosterCandidate[]=[];
 if(reserve)chosen.push(byId.get(reserve.aId)!,byId.get(reserve.bId)!);
 if(tagChoice)for(const id of tagIds)chosen.push(byId.get(id)!);
 if(men.length>=2&&women.length>=2&&available.length>=4){
  for(const p of [...men.slice(0,2),...women.slice(0,2)]){
   if(chosen.length<10&&!chosen.some(x=>x.personId===p.personId))chosen.push(p);
  }
 }
 for(const p of available){
  if(chosen.length>=10)break;
  if(!chosen.some(x=>x.personId===p.personId))chosen.push(p);
 }
 // If ten slots leave one wrestler unpaired, use eight rather than using
 // the same performer twice or mixing the divisions.
 const pool=[...chosen].sort((a,b)=>
  rank(b)+opportunity(b)-rank(a)-opportunity(a)||
  a.personId.localeCompare(b.personId,"en"));
 const recent=new Set(input.recentPairs??[]);
 const teammates=new Set((input.establishedPartners??[]).map(x=>{
  if(!x.aId||!x.bId||x.aId===x.bId)
   throw new Error("Invalid established tag identity");
  return key(x.aId,x.bId);
 }));
 const cards:Array<[AiRosterCandidate,AiRosterCandidate]>=[];
 if(tagChoice)for(const id of tagIds){
  const idx=pool.findIndex(p=>p.personId===id);
  if(idx<0)throw new Error("AI tag team was not reserved");
  pool.splice(idx,1);
 }
 if(reserve){
  const a=pool.find(p=>p.personId===reserve.aId)!;
  const b=pool.find(p=>p.personId===reserve.bId)!;
  pool.splice(pool.indexOf(a),1);pool.splice(pool.indexOf(b),1);
  cards.push([a,b]);
 }
 while(pool.length>=2&&cards.length<5){
  const head=pool.shift()!;
  const candidates=pool.filter(p=>p.bookingDivision===head.bookingDivision);
  if(!candidates.length)continue;
  candidates.sort((a,b)=>{
   const ar=recent.has(key(head.personId,a.personId))?1:0;
   const br=recent.has(key(head.personId,b.personId))?1:0;
   const at=teammates.has(key(head.personId,a.personId))?1:0;
   const bt=teammates.has(key(head.personId,b.personId))?1:0;
   return at-bt||ar-br||Math.abs(push(head)-push(a))-Math.abs(push(head)-push(b))||
    rank(b)-rank(a)||a.personId.localeCompare(b.personId,"en");
  });
  const opponent=candidates[0]!;
  pool.splice(pool.findIndex(p=>p.personId===opponent.personId),1);
  cards.push([head,opponent]);
 }
 if(!cards.length)return {status:"UNFILLED",reason:"NO_ELIGIBLE_PAIR"};
 // Strongest star power closes, by the exact archived booking push score.
 cards.sort((a,b)=>(push(a[0])+push(a[1]))/2-
  (push(b[0])+push(b[1]))/2||
  key(a[0].personId,a[1].personId).localeCompare(
   key(b[0].personId,b[1].personId),"en"));
 if(reserve){
  const idx=cards.findIndex(pair=>pair.some(p=>p.personId===reserve.aId)&&
   pair.some(p=>p.personId===reserve.bId));
  if(idx<0)throw new Error("Featured booking was displaced");
  // The title match or established hot programme closes in this small
  // simulation slice, not as a hidden random undercard bout.
  cards.push(cards.splice(idx,1)[0]!);
 }
 const cardEntries:Array<{people:AiRosterCandidate[];tag:boolean}> =
   cards.map(([a,b])=>({people:[a,b],tag:false}));
 if(tagChoice)cardEntries.push({people:[
  byId.get(tagChoice.first.aId)!,byId.get(tagChoice.first.bId)!,
  byId.get(tagChoice.second.aId)!,byId.get(tagChoice.second.bId)!],tag:true});
 cardEntries.sort((a,b)=>
  a.people.reduce((sum,p)=>sum+push(p),0)/a.people.length-
  b.people.reduce((sum,p)=>sum+push(p),0)/b.people.length||
  a.people.map(x=>x.personId).join(":").localeCompare(
   b.people.map(x=>x.personId).join(":"),"en"));
 // The most important canonical title gets the main event. An existing
 // singles rivalry still closes when no title defense takes priority.
 if(reserve){
  const idx=cardEntries.findIndex(c=>!c.tag&&
   c.people.some(p=>p.personId===reserve.aId)&&
   c.people.some(p=>p.personId===reserve.bId));
  if(idx<0)throw new Error("AI singles feature displaced");
  if(reserve.kind==="SINGLES_TITLE"||!tagChoice?.titleId)
   cardEntries.push(cardEntries.splice(idx,1)[0]!);
 }
 if(tagChoice?.titleId&&reserve?.kind!=="SINGLES_TITLE"){
  const idx=cardEntries.findIndex(c=>c.tag);
  cardEntries.push(cardEntries.splice(idx,1)[0]!);
 }
 const matches:AiCardMatch[]=cardEntries.map((entry,i)=>{
  const [a,b]=entry.people as [AiRosterCandidate,AiRosterCandidate];
  const order=i+1,main=i===cardEntries.length-1;
  const intent=style(input,order,main);
  const finalRng=new DeterministicRng(deterministicSeedFromText(
   `${input.worldSeed}:${input.showId}:finish:${order}`));
  const winnerRng=new DeterministicRng(deterministicSeedFromText(
   `${input.worldSeed}:${input.showId}:winner:${order}`));
  // Only AI undercard results may favour a credible rising worker.
  // Main-event title and programme bookings keep their existing authority.
  const development=(p:AiRosterCandidate)=>input.strategy?.focus==="BUILD_STARS"&&
   !main&&p.popularity<60&&p.momentum>=45&&p.matchCraft>=40?13:0;
  const fav=push(a)+development(a)+winnerRng.float(-7,7)>=
   push(b)+development(b)+winnerRng.float(-7,7)?a:b;
  if(entry.tag){
   const [t1a,t1b,t2a,t2b]=entry.people;
   const scoreA=push(t1a!)+push(t1b!)+winnerRng.float(-7,7);
   const scoreB=push(t2a!)+push(t2b!)+winnerRng.float(-7,7);
   const winnerSide=scoreA>=scoreB?"A" as const:"B" as const;
   const grouped=[{sideId:"A" as const,participants:[t1a!,t1b!].map(p=>({
     personId:p.personId,contractId:p.contractId}))},
    {sideId:"B" as const,participants:[t2a!,t2b!].map(p=>({
     personId:p.personId,contractId:p.contractId}))}];
   return {matchType:"TAG",family:"TEAMS",sides:grouped,
    participants:grouped.flatMap(side=>side.participants),
    scriptedWinnerSide:winnerSide,
    scriptedWinner:winnerSide==="A"?t1a!.personId:t2a!.personId,
    bookingDivision:t1a!.bookingDivision,intent,
    plannedFinish:finish(intent,finalRng.next()),
    plannedLengthMinutes:plannedLength(intent,main),mainEvent:main,
    ...(tagChoice?.titleId?{championshipId:tagChoice.titleId}:{})};
  }
  return {
   participants:[{personId:a.personId,contractId:a.contractId},
    {personId:b.personId,contractId:b.contractId}],
   scriptedWinner:fav.personId,bookingDivision:a.bookingDivision,
   intent,plannedFinish:finish(intent,finalRng.next()),
   plannedLengthMinutes:plannedLength(intent,main),mainEvent:main,
   ...(reserve&&[a.personId,b.personId].includes(reserve.aId)&&
     [a.personId,b.personId].includes(reserve.bId)&&reserve.kind==="PROGRAMME"?
     {programmeId:reserve.programmeId}:{}),
   ...(reserve&&[a.personId,b.personId].includes(reserve.aId)&&
     [a.personId,b.personId].includes(reserve.bId)&&reserve.kind==="SINGLES_TITLE"?
     {championshipId:reserve.championshipId}:{}),
  };
 });
 return {status:"READY",schedule,matches};
}
