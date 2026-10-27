/** A tournament is a three-bout elimination structure, not a second
 * match simulator. Draw order is user-seeded; actual winners come from
 * canonical certified show receipts only.
 */
export type TournamentBoutNo=1|2|3;
export function seededSemifinals(entrants:readonly string[]){
 if(entrants.length!==4||new Set(entrants).size!==4||
  entrants.some(p=>typeof p!=="string"||!p||p.length>200))
  throw new Error("Choose four distinct tournament entrants");
 return [[entrants[0]!,entrants[3]!],
         [entrants[1]!,entrants[2]!]] as const;
}
export function isTournamentBoutNo(n:unknown):n is TournamentBoutNo{
 return n===1||n===2||n===3;
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
