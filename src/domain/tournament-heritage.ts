/** Promotion-scoped tournament heritage derived from certified bracket winners.
 * No random prestige score or business modifier. A repeated title counts as a
 * tradition only when actual completed editions span different World seasons.
 * All records originate from a bounded manager-authenticated read.
 */
export type TournamentHistoryRow={
 tournamentId:string;name:string;division:"MEN"|"WOMEN";
 status:"ACTIVE"|"COMPLETE"|"CANCELLED";entrantsCount:4|8;
 createdWeekIndex:number;winnerPersonId:string|null;winnerName:string|null;
 finalResolvedWeekIndex:number|null;finalRatingStars:number|null;
};
export type TournamentHeritage={
 key:string;name:string;division:"MEN"|"WOMEN";
 completedEditions:number;seasons:number;firstSeason:number|null;
 lastSeason:number|null;latestChampion:{personId:string;name:string}|null;
 latestCompletedTournamentId:string|null;latestEntrantsCount:4|8;
 lastFinalRatingStars:number|null;averageFinalRatingStars:number|null;
 mostWins:number;leaders:{personId:string;name:string;wins:number}[];
 legacy:"FIRST EDITION"|"RETURNING CUP"|"ESTABLISHED TRADITION"|"ANNUAL FIXTURE"|"LONG-RUNNING CLASSIC";
};
export function tournamentSeason(weekIndex:number){
 if(!Number.isInteger(weekIndex)||weekIndex<0)throw new Error("Invalid certified tournament week");
 return Math.floor(weekIndex/52)+1;
}
export function tournamentSeriesKey(name:string,division:string){
 return division+":"+name.trim().replace(/\s+/g," ").toLocaleLowerCase("en");
}
export function tournamentHeritage(rows:readonly TournamentHistoryRow[]):TournamentHeritage[]{
 const grouped=new Map<string,TournamentHistoryRow[]>();
 // Rows should be newest-first; deterministic ordering protects callers too.
 const ordered=[...rows].sort((a,b)=>b.createdWeekIndex-a.createdWeekIndex||
  b.tournamentId.localeCompare(a.tournamentId));
 for(const t of ordered){
  const k=tournamentSeriesKey(t.name,t.division);
  const group=grouped.get(k)??[];
  group.push(t);grouped.set(k,group);
 }
 return [...grouped].map(([key,editions])=>{
  const completed=editions.filter(e=>e.status==="COMPLETE"&&
   !!e.winnerPersonId&&!!e.winnerName);
  const years=[...new Set(completed.map(e=>tournamentSeason(e.createdWeekIndex)))];
  const latest=completed[0];
  const champions=new Map<string,{personId:string;name:string;wins:number}>();
  for(const e of completed){
   const id=e.winnerPersonId!;
   const row=champions.get(id)??{personId:id,name:e.winnerName!,wins:0};
   row.wins++;champions.set(id,row);
  }
  const leaders=[...champions.values()].sort((a,b)=>b.wins-a.wins||
   a.name.localeCompare(b.name)||a.personId.localeCompare(b.personId));
  const scores=completed.map(e=>e.finalRatingStars).filter(
   (n):n is number=>n!==null&&Number.isFinite(n)&&n>=0&&n<=5);
  const yearCount=years.length;
  // No "annual" claim from repeated copies within one in-game year.
  const sortedYears=[...years].sort((a,b)=>b-a);
  const annualStreak=sortedYears.reduce((longest,year,i)=>{
   let run=1;while(sortedYears[i+run]===year-run)run++;
   return Math.max(longest,run);
  },0);
  const legacy:TournamentHeritage["legacy"]=yearCount>=5&&annualStreak>=3?
   "LONG-RUNNING CLASSIC":annualStreak>=3?"ANNUAL FIXTURE":
   yearCount>=3?"ESTABLISHED TRADITION":
   yearCount>=2?"RETURNING CUP":"FIRST EDITION";
  return {key,name:editions[0]!.name,division:editions[0]!.division,
   completedEditions:completed.length,seasons:yearCount,
   firstSeason:years.length?Math.min(...years):null,
   lastSeason:years.length?Math.max(...years):null,
   latestChampion:latest?{personId:latest.winnerPersonId!,name:latest.winnerName!}:null,
   latestCompletedTournamentId:latest?.tournamentId??null,
   latestEntrantsCount:(latest??editions[0]!).entrantsCount,
   lastFinalRatingStars:latest?.finalRatingStars??null,
   averageFinalRatingStars:scores.length?
    Math.round(scores.reduce((a,b)=>a+b,0)*100/scores.length)/100:null,
   mostWins:leaders[0]?.wins??0,leaders:leaders.slice(0,5),legacy};
 }).sort((a,b)=>b.completedEditions-a.completedEditions||
  (b.lastSeason??0)-(a.lastSeason??0)||a.name.localeCompare(b.name));
}
