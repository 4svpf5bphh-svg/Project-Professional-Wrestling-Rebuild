/** Certified rivalry recap, projected from completed activity and its locked card.
 * Describes only recorded script and official match result, never inferred reactions.
 */
export interface CertifiedChapter{
 kind:string;weekIndex:number;winnerSide?:"A"|"B"|null;
 segmentKind?:string|null;sceneLocation?:string|null;
 sceneIntensity?:string|null;sceneVisual?:string|null;
 scenePurpose?:string|null;angleOutcome?:string|null;
 turnAlignment?:string|null;stableDecision?:string|null;
}
const words=(value:string)=>value.replaceAll("_"," ").toLowerCase()
 .replace(/(^|\s)\S/g,c=>c.toUpperCase());
export function describeProgrammeChapter(
 beat:CertifiedChapter,sideA:string,sideB:string
):{headline:string;detail:string;kind:"MATCH"|"ANGLE"}{
 if(beat.kind==="MATCH"){
  const result=beat.winnerSide==="A"?sideA+" won":beat.winnerSide==="B"?
   sideB+" won":"Match completed";
  return {headline:result,detail:"Official rivalry match result",kind:"MATCH"};
 }
 const type=words(beat.segmentKind??"On-screen angle");
 const parts:string[]=[];
 if(beat.sceneLocation)parts.push("at "+words(beat.sceneLocation));
 if(beat.sceneIntensity&&["ATTACK","POST_MATCH_ASSAULT"].includes(beat.segmentKind??""))
  parts.push(words(beat.sceneIntensity)+" attack");
 if(beat.sceneVisual&&beat.sceneVisual!=="NONE")
  parts.push(words(beat.sceneVisual)+" aftermath");
 if(beat.turnAlignment&&beat.segmentKind==="TURN")
  parts.push("alignment: "+words(beat.turnAlignment));
 if(beat.stableDecision&&["STABLE_INVITATION","STABLE_RECONCILIATION"].includes(beat.segmentKind??""))
  parts.push("decision: "+words(beat.stableDecision));
 if(beat.angleOutcome&&beat.angleOutcome!=="HAPPENS")
  parts.push("on-screen outcome: "+words(beat.angleOutcome));
 return {headline:type,detail:parts.length?parts.join(" · "):"Recorded on-screen chapter",kind:"ANGLE"};
}
