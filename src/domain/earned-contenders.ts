/** A promotion's earned recent contenders; rank only certified results.
 * No popularity-only placements, invisible random rolls, or mutable rankings.
 * One World year has 52 weeks. The moving 26-week form window makes a previous
 * contender earn their place again while protecting an excellent recent loss.
 */
export type ContenderFormat="SINGLES"|"TAG";
export type ContenderDivision="MEN"|"WOMEN";
export interface ContenderCandidate{
 id:string;name:string;format:ContenderFormat;division:ContenderDivision;
 momentum:number;popularity:number;
}
export interface CertifiedContenderResult{
 id:string;format:ContenderFormat;weekIndex:number;won:boolean;
 /** Relevant opponents' popularity at the actual bell, not today's popularity. */
 opponentStrength:number;
 /** Null means archived match evidence did not contain a star rating. */
 ratingStars:number|null;titleMatch:boolean;majorEvent:boolean;
}
export interface EarnedContender extends ContenderCandidate{
 rank:number;score:number;wins:number;losses:number;
 lastResultWeek:number;titleMatches:number;
}
const finite=(n:number,low=0,high=100)=>Number.isFinite(n)&&n>=low&&n<=high;
export function rankEarnedContenders(input:{
 candidates:readonly ContenderCandidate[];
 results:readonly CertifiedContenderResult[];
 currentWeekIndex:number;format:ContenderFormat;division:ContenderDivision;
 championId?:string|null;limit?:number;
}):EarnedContender[]{
 const {candidates,results,currentWeekIndex,format,division,championId}=input;
 const limit=input.limit??5;
 if(!Number.isSafeInteger(currentWeekIndex)||currentWeekIndex<0||
  !Number.isInteger(limit)||limit<1||limit>30||
  candidates.length>512||results.length>3000)
  throw new Error("Invalid certified contender scope");
 const contenders=new Map<string,{
  candidate:ContenderCandidate;score:number;wins:number;losses:number;
  titleMatches:number;lastResultWeek:number;
 }>();
 for(const p of candidates){
  if(!p.id||!p.name||!finite(p.momentum)||!finite(p.popularity)||
   !["MEN","WOMEN"].includes(p.division)||
   !["SINGLES","TAG"].includes(p.format)||contenders.has(p.id))
   throw new Error("Invalid contender eligibility");
  if(p.format===format&&p.division===division&&p.id!==championId)
   contenders.set(p.id,{candidate:p,score:0,wins:0,losses:0,
    titleMatches:0,lastResultWeek:-1});
 }
  for(const r of results){
  if(!r.id||!["SINGLES","TAG"].includes(r.format)||
   !Number.isSafeInteger(r.weekIndex)||r.weekIndex<0||
   !finite(r.opponentStrength)||r.ratingStars!==null&&
    !finite(r.ratingStars,0,5)||typeof r.won!=="boolean"||
   typeof r.titleMatch!=="boolean"||typeof r.majorEvent!=="boolean")
   throw new Error("Invalid certified contender match facts");
  if(r.format!==format||r.weekIndex>currentWeekIndex||
   currentWeekIndex-r.weekIndex>=26)continue;
  const row=contenders.get(r.id);
  if(!row)continue;
  // The reader emits one candidate result for each distinct sealed bout.
  const age=currentWeekIndex-r.weekIndex;
  const freshness=1-age/40;
  const difficulty=(r.opponentStrength-50)/50;
  const performance=r.ratingStars===null?0:(r.ratingStars-2.5)*.7;
  const value=r.won?
   6.5+difficulty*2.4+performance+(r.titleMatch?2.2:0):
   -2.2+difficulty*.9+performance*.35;
  row.score+=value*freshness*(r.majorEvent?1.2:1);
  if(r.won)row.wins++;else row.losses++;
  if(r.titleMatch)row.titleMatches++;
  row.lastResultWeek=Math.max(row.lastResultWeek,r.weekIndex);
 }
 return [...contenders.values()].filter(x=>x.wins+x.losses>0)
  .map(x=>({...x.candidate,rank:0,
   score:Math.round((x.score+x.candidate.momentum*.025+
    x.candidate.popularity*.008)*10)/10,
   wins:x.wins,losses:x.losses,lastResultWeek:x.lastResultWeek,
   titleMatches:x.titleMatches}))
  .sort((a,b)=>b.score-a.score||b.wins-a.wins||
   b.lastResultWeek-a.lastResultWeek||a.name.localeCompare(b.name,"en")||
   a.id.localeCompare(b.id,"en"))
  .slice(0,limit).map((x,i)=>({...x,rank:i+1}));
}
