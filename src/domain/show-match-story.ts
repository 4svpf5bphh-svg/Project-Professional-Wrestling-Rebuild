
/** Deterministic wrestling result copy derived from the finished match only.
 * No hallucinated signature moves, crowd events or surprise stipulations.
 */
export function describeMatchFinish(input:{
 actualFinish:string;actualWinnerSide:string|null;
 winnerNames:readonly string[];participants:readonly string[];
}):{headline:string;summary:string}{
 const winners=input.winnerNames;
 const finish=input.actualFinish;
 const headline=winners.length?winners.join(" & ")+" victorious":
  input.participants.length?input.participants.join(" vs "):"The contest";
 const descriptions:Record<string,string>={
  CLEAN_PIN:"The referee counted three. A clean pinfall settled the contest.",
  FLASH_PIN:"A sudden flash pin turned the match on its head.",
  SUBMISSION:"A submission forced the deciding tap-out.",
  DISQUALIFICATION:"The referee called for a disqualification.",
  FOREIGN_OBJECT:"A foreign object brought a controversial finish.",
  PROTECTED_FINISH:"A protected finish ended the contest without a clean decision.",
  INJURY_STOPPAGE:"The match was stopped because of an injury.",
  OVER_THE_TOP_ROPE:"The last elimination settled the battle royal.",
 };
 const base=descriptions[finish]??"The bout reached its official finish: "+
  finish.toLowerCase().replaceAll("_"," ")+".";
 if(finish==="INJURY_STOPPAGE")return {headline,summary:base};
 if(!winners.length)return {headline,summary:base};
 return {headline,summary:base+" "+winners.join(" & ")+
  (winners.length>1?" are":" is")+" recorded as the winner"+(winners.length>1?"s":"")+"."};
}
