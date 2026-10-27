/** A tournament is a three-bout elimination structure, not a second
 * match simulator. Draw order is user-seeded; actual winners come from
 * canonical certified show receipts only.
 */
export type TournamentSize=4|8;
export type TournamentBoutNo=1|2|3|4|5|6|7;
export function tournamentFinalBoutNo(size:TournamentSize):3|7{
 return size===8?7:3;
}
export function tournamentOpeningPairings(entrants:readonly string[]){
 if(![4,8].includes(entrants.length)||new Set(entrants).size!==entrants.length||
  entrants.some(p=>typeof p!=="string"||!p||p.length>200))
  throw new Error("Choose four or eight distinct tournament entrants");
 if(entrants.length===4)return seededSemifinals(entrants);
 return [[entrants[0]!,entrants[7]!],
  [entrants[3]!,entrants[4]!],[entrants[1]!,entrants[6]!],
  [entrants[2]!,entrants[5]!]] as const;
}
export function tournamentInitialBouts(entrants:readonly string[]){
 const opening=tournamentOpeningPairings(entrants);
 return Array.from({length:entrants.length-1},(_,i)=>({
  n:i+1,a:opening[i]?.[0]??null,b:opening[i]?.[1]??null
 }));
}
export function tournamentBoutLabel(size:TournamentSize,n:number){
 if(n===tournamentFinalBoutNo(size))return "Final";
 if(size===8&&n<=4)return "Quarterfinal "+n;
 if(size===8&&n>=5&&n<=6)return "Semifinal "+(n-4);
 if(size===4&&n<=2)return "Semifinal "+n;
 return "Unknown round";
}
export function tournamentAdvancement(size:TournamentSize){
 return size===4?[[1,2,3]] as const:
  [[1,2,5],[3,4,6],[5,6,7]] as const;
}
export function seededSemifinals(entrants:readonly string[]){
 if(entrants.length!==4||new Set(entrants).size!==4||
  entrants.some(p=>typeof p!=="string"||!p||p.length>200))
  throw new Error("Choose four distinct tournament entrants");
 return [[entrants[0]!,entrants[3]!],
         [entrants[1]!,entrants[2]!]] as const;
}
export function isTournamentBoutNo(n:unknown):n is TournamentBoutNo{
 return typeof n==='number'&&Number.isInteger(n)&&n>=1&&n<=7;
}
export function verifiedTournamentWinner(a:string,b:string,
 bookedSides:readonly {sideId:string;personIds:readonly string[]}[],
 actualWinnerSide:string|null){
 if(!a||!b||a===b||bookedSides.length!==2||
  bookedSides.some(s=>s.personIds.length!==1)||
  new Set(bookedSides.flatMap(s=>s.personIds)).size!==2||
  !bookedSides.some(s=>s.sideId===actualWinnerSide)||
  ![a,b].every(p=>bookedSides.some(s=>s.personIds[0]===p)))
  throw new Error("Certified tournament match does not match the bracket");
 const winner=bookedSides.find(s=>s.sideId===actualWinnerSide)!.personIds[0]!;
 return {winner,loser:winner===a?b:a};
}
