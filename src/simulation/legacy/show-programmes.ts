/** Exact programme-heat/repetition formula from archived sim-core/show-flow.ts.
 * A programme is World-owned and active only in its promotion. Match linkage
 * must be explicit; never infer feuds from two wrestlers sharing a card.
 * No writes, no RNG and no global WorldState hydration.
 */
export interface ArchivedProgramme {
 programmeId:string;promotionId:string;status:"ACTIVE"|"INACTIVE"|"COMPLETED";
 heat:number|null;repetition:number;
}
export interface ArchivedProgrammeMatch {
 matchId:string;promotionId:string;linkedProgrammeIds:readonly string[];
}
export interface ArchivedProgrammeReaction {
 matchId:string;modifier:number;reason:"HOT_PROGRAMME"|
 "COOL_PROGRAMME"|"PROGRAMME_REPETITION"|null;
 linkedActiveProgrammeCount:number;
}
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
export function evaluateArchivedProgrammeReactions(
 matches:readonly ArchivedProgrammeMatch[],programmes:readonly ArchivedProgramme[],
):ArchivedProgrammeReaction[]{
 if(matches.length<1||matches.length>100||programmes.length>500)
   throw new Error("Invalid programme evaluation scope");
 const byId=new Map<string,ArchivedProgramme>();
 for(const p of programmes){
  if(!p.programmeId||!p.promotionId||byId.has(p.programmeId)||
   !["ACTIVE","INACTIVE","COMPLETED"].includes(p.status)||
   (p.heat!==null&&(!Number.isFinite(p.heat)||p.heat<0||p.heat>100))||
   !Number.isFinite(p.repetition)||p.repetition<0||p.repetition>100000)
   throw new Error("Invalid canonical programme");
  byId.set(p.programmeId,p);
 }
 const seen=new Set<string>();
 return matches.map(m=>{
  if(!m.matchId||seen.has(m.matchId)||!m.promotionId||
    m.linkedProgrammeIds.length>100||
    m.linkedProgrammeIds.some(id=>!id))
    throw new Error("Invalid match programme links");
  seen.add(m.matchId);
  const unique=[...new Set(m.linkedProgrammeIds)];
  const components=unique.flatMap(id=>{
   const p=byId.get(id);
   if(!p||p.status!=="ACTIVE"||p.promotionId!==m.promotionId)return [];
   return [{heatEffect:p.heat===null?0:clamp((p.heat-50)/15,-2,2.5),
     repetitionPenalty:Math.min(3.5,p.repetition*0.04)}];
  });
  if(components.length===0)return {matchId:m.matchId,modifier:0,reason:null,
    linkedActiveProgrammeCount:0};
  const heatEffect=components.reduce((sum,c)=>sum+c.heatEffect,0)/components.length;
  const repetitionPenalty=components.reduce((sum,c)=>sum+c.repetitionPenalty,0)/components.length;
  const modifier=clamp(heatEffect-repetitionPenalty,-3.5,2.5);
  let reason:ArchivedProgrammeReaction["reason"]=null;
  if(repetitionPenalty>=Math.abs(heatEffect)&&repetitionPenalty>=0.25)
   reason="PROGRAMME_REPETITION";
  else if(heatEffect>=0.25)reason="HOT_PROGRAMME";
  else if(heatEffect<=-0.25)reason="COOL_PROGRAMME";
  else if(repetitionPenalty>=0.25)reason="PROGRAMME_REPETITION";
  return {matchId:m.matchId,modifier,reason,
    linkedActiveProgrammeCount:components.length};
 });
}
