/** Read-only reports on available young wrestlers. No invented ability,
 * guaranteed potential, contract privilege, mutation or autonomous recruitment.
 */
export interface ScoutProspect {
 personId:string;name:string;division:string|null;
 aptitude:number;ring:number;craft:number;presentation:number;popularity:number;
}
export interface ScoutRecommendation {
 personId:string;name:string;division:string|null;observation:string;
}
export function selectScoutRecommendations(
 prospects:readonly ScoutProspect[],scout:{insight:number;specialism:string}
):ScoutRecommendation[]{
 const score=(p:ScoutProspect)=>{
  const core=p.aptitude*.55+p.ring*.16+p.craft*.16+p.presentation*.13;
  return core+(scout.specialism==="technical upside"?(p.ring+p.craft)*.1:
   scout.specialism==="character potential"?p.presentation*.2:
   scout.specialism==="undiscovered value"?(100-p.popularity)*.15:0);
 };
 return [...prospects].sort((a,b)=>score(b)-score(a)||
  a.name.localeCompare(b.name)||a.personId.localeCompare(b.personId))
  .slice(0,scout.insight>=65?3:2).map(p=>{
   const strength=p.ring+p.craft>=p.presentation*2+14?
    "The in-ring fundamentals stand out":
    p.presentation>=Math.max(p.ring,p.craft)+9?
    "There's on-screen presence worth nurturing":
    "An interesting blend of ring ability and presentation";
   const opportunity=p.popularity<40?
    "The wider audience still needs convincing.":
    "There's already some audience familiarity to build upon.";
   return {personId:p.personId,name:p.name,division:p.division,
    observation:strength+". "+opportunity+
     " It's potential, not a guaranteed future headliner."};
  });
}
