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
 prospects:readonly ScoutProspect[],scout:{insight:number;specialism:string;weekIndex?:number}
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
   // The report uses measured ratings only. Weekly phrasing can change while
   // the ranking, evidence and contract rights remain exactly the same.
   const ratings=[
    {name:"in-ring ability",value:p.ring},
    {name:"match craft",value:p.craft},
    {name:"presentation",value:p.presentation}
   ].sort((a,b)=>b.value-a.value||a.name.localeCompare(b.name));
   const best=ratings[0]!,weakest=ratings[2]!;
   const strength=best.name+" "+Math.round(best.value)+
    (best.value-weakest.value>=15?
     " is well ahead of "+weakest.name+" "+Math.round(weakest.value):
     "; the three main ratings are comparatively balanced");
   const risk=p.presentation+18<Math.max(p.ring,p.craft)?
    "Character work trails their wrestling; avoid leaning on long promos early.":
    p.craft+18<Math.max(p.ring,p.presentation)?
     "Match craft is the development gap; keep early finishes straightforward.":
    p.ring+18<Math.max(p.craft,p.presentation)?
     "In-ring work needs development; don't ask for a technical marathon immediately.":
     "There is no single glaring gap across ring, craft and presentation.";
   const reach=p.popularity<35?
    "Popularity "+Math.round(p.popularity)+
     " means the audience would need an introduction.":
    p.popularity>=70?"Popularity "+Math.round(p.popularity)+
     " gives this prospect an existing audience base.":
    "Popularity "+Math.round(p.popularity)+
     " suggests some recognition, but no established star status.";
   const specialism=scout.specialism==="technical upside"?
    "My technical read: ":scout.specialism==="character potential"?
     "My character read: ":scout.specialism==="undiscovered value"?
     "My value watch: ":"My scouting note: ";
   const week=Math.max(0,Math.trunc(scout.weekIndex??0));
   const order=(week+(p.personId.split("").reduce((n,ch)=>
    (n*31+ch.charCodeAt(0))>>>0,0)%3))%3;
   const facts=[strength+".",risk,reach];
   const brief=order===0?facts:order===1?[facts[2],facts[0],facts[1]]:
    [facts[1],facts[2],facts[0]];
   return {personId:p.personId,name:p.name,division:p.division,
    observation:specialism+brief.join(" ")+
     " Consider the short-term offer before a year-long commitment; "+
     "this is a lead, not a guaranteed future headliner."};
  });
}
