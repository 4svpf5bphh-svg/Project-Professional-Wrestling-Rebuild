/** High-value recorded career moments from the existing on-demand history.
 * A current title is not evidence of a first title or a fabricated milestone. */
export interface CareerHighlightEvidence{
 status:string;careerStage:string|null;
 summary:{matches:number;wins:number};
 currentChampionships:readonly {name:string;promotion:string;
  startWeekIndex:number;defenses:number;holderType:"PERSON"|"TEAM";
  teamName:string|null}[];
 singlesTitles:readonly {name:string;promotion:string;startWeekIndex:number;
  endedWeekIndex:number|null;defenses:number}[];
}
export interface CareerHighlight{key:string;headline:string;detail:string}
const week=(n:number)=>"Y"+(Math.floor(n/52)+1)+" W"+(n%52+1);
const valid=(n:number)=>Number.isSafeInteger(n)&&n>=0;
export function recordedCareerHighlights(e:CareerHighlightEvidence):CareerHighlight[]{
 const found:CareerHighlight[]=[];
 if(e.status==="RETIRED")found.push({key:"retirement",headline:"The final bell",
  detail:"Retired · "+(valid(e.summary.matches)?e.summary.matches:0)+
   " documented bouts in this World. Past results and honours remain on record."});
 for(const t of e.currentChampionships.slice(0,2)){
  if(!t.name||!t.promotion||!valid(t.startWeekIndex)||!valid(t.defenses))continue;
  found.push({key:"current:"+t.promotion+":"+t.name,
   headline:t.holderType==="TEAM"?"Reigning tag champion":"Reigning singles champion",
   detail:t.name+" · "+t.promotion+
    (t.holderType==="TEAM"&&t.teamName?" · "+t.teamName:"")+
    " · Since "+week(t.startWeekIndex)+" · "+
    t.defenses+" recorded defence"+(t.defenses===1?"":"s")});
 }
 const best=e.singlesTitles.filter(t=>t.endedWeekIndex!==null&&
  valid(t.startWeekIndex)&&valid(t.endedWeekIndex!)&&
  valid(t.defenses)&&t.defenses>=3&&t.name&&t.promotion)
  .sort((a,b)=>b.defenses-a.defenses||
   b.startWeekIndex-a.startWeekIndex)[0];
 if(best)found.push({key:"defended:"+best.promotion+":"+best.name,
  headline:"A title reign worth remembering",
  detail:best.name+" · "+best.promotion+" · "+
   best.defenses+" verified defences · "+week(best.startWeekIndex)+
   "–"+week(best.endedWeekIndex!)});
 if(e.careerStage==="SPECIAL_ATTRACTION")found.push({
  key:"stage",headline:"Special attraction",
  detail:"Current recorded career stage. This alone does not grant a championship or special booking rights."});
 return found.slice(0,3);
}
