/** Original archived show-flow finish reaction, extracted without WorldState.
 * Caller must supply the actually completed medical/interference outcome and
 * validated side participants. Never use a booked finish if medical stoppage
 * superseded it. Historical matches must be strictly earlier than this week.
 */
export type FinishKind="DISQUALIFICATION"|"FOREIGN_OBJECT"|"PIN"|"SUBMISSION"|"OTHER";
export type FinishAlignment="FACE"|"HEEL"|"TWEENER";
export interface FinishedCheatingMatch {
 matchId:string;promotionId:string;weekIndex:number;
 actualFinish:FinishKind;actualWinnerSide:"A"|"B"|null;
 finishCheaterPersonId:string|null;
 participants:readonly {personId:string;side:"A"|"B";alignment:FinishAlignment}[];
 linkedProgramme:boolean;
}
export interface HistoricalDirtyFinish {
 promotionId:string;weekIndex:number;actualFinish:FinishKind;
 cheaterPersonId:string;participantIds:readonly string[];
 completed:boolean;
}
export interface FinishReaction {
 matchId:string;modifier:number;
 reason:"HEEL_CHEATING_HEAT"|"FACE_CHEATING_BACKLASH"|"DIRTY_FINISH_FAMILIAR"|null;
 repeatCount:number;programmeLinked:boolean;
}
const round1=(n:number)=>Math.round(n*10)/10;
export function evaluateArchivedFinishReactions(
 matches:readonly FinishedCheatingMatch[],history:readonly HistoricalDirtyFinish[],
):FinishReaction[]{
 if(matches.length<1||matches.length>100||history.length>10000)
  throw new Error("Invalid cheating reaction scope");
 const seen=new Set<string>();
 return matches.map(m=>{
  if(!m.matchId||seen.has(m.matchId)||!m.promotionId||
   !Number.isSafeInteger(m.weekIndex)||m.weekIndex<0||
   m.participants.length<2||m.participants.length>100||
   new Set(m.participants.map(p=>p.personId)).size!==m.participants.length||
   m.participants.some(p=>!p.personId||!["A","B"].includes(p.side)||
    !["FACE","HEEL","TWEENER"].includes(p.alignment)))
   throw new Error("Invalid resolved cheating match");
  seen.add(m.matchId);
  const none:FinishReaction={matchId:m.matchId,modifier:0,reason:null,
   repeatCount:0,programmeLinked:false};
  if(m.actualFinish!=="DISQUALIFICATION"&&m.actualFinish!=="FOREIGN_OBJECT")return none;
  if(!m.actualWinnerSide||!m.finishCheaterPersonId)return none;
  const cheaterSide=m.actualFinish==="DISQUALIFICATION"?
   (m.actualWinnerSide==="A"?"B":"A"):m.actualWinnerSide;
  const culprit=m.participants.find(p=>p.personId===m.finishCheaterPersonId);
  if(!culprit||culprit.side!==cheaterSide)return none;
  const cheatedSide=cheaterSide==="A"?"B":"A";
  const opposition=m.participants.filter(p=>p.side===cheatedSide);
  const oppositionAlignment=opposition.length>0&&
   opposition.every(p=>p.alignment===opposition[0]!.alignment)?
    opposition[0]!.alignment:null;
  const participantKey=m.participants.map(p=>p.personId).sort().join("|");
  let repeatCount=0;
  for(const h of history){
   if(!h.completed||h.promotionId!==m.promotionId||
     h.cheaterPersonId!==culprit.personId||h.actualFinish!==m.actualFinish||
     h.weekIndex>=m.weekIndex||h.weekIndex<m.weekIndex-8)continue;
   if(h.participantIds.slice().sort().join("|")===participantKey)repeatCount++;
   if(repeatCount>=2)break;
  }
  if(culprit.alignment==="HEEL"&&oppositionAlignment==="FACE"){
   const fresh=m.actualFinish==="FOREIGN_OBJECT"?1.8:1.2;
   const modifier=Math.max(0,fresh-repeatCount*0.9);
   return {matchId:m.matchId,modifier:round1(modifier),
    reason:modifier>=0.45?"HEEL_CHEATING_HEAT":"DIRTY_FINISH_FAMILIAR",
    repeatCount,programmeLinked:m.linkedProgramme};
  }
  if(culprit.alignment==="FACE")
   return {matchId:m.matchId,modifier:-1.3,reason:"FACE_CHEATING_BACKLASH",
    repeatCount,programmeLinked:m.linkedProgramme};
  return {...none,repeatCount,programmeLinked:m.linkedProgramme};
 });
}
