/** A human promotion earns its creative fingerprint from certified matches.
 * This is an editorial observation, never a mechanic that rewards, penalises,
 * constrains or rewrites how the player books a card.
 */
export interface CompletedCreativeEvidence {
 workrate:number;spectacle:number;stars:number;stories:number;
 knownMatches:number;completedShows:number;
}
export interface EarnedPromotionIdentity {
 title:string;description:string;sampleMatches:number;completedShows:number;
 category:"WORKRATE"|"SPECTACLE"|"STAR_POWER"|"STORYTELLING"|"VARIED";
}
export function earnedPromotionIdentity(
 e:CompletedCreativeEvidence,
):EarnedPromotionIdentity|null {
 const values=[e.workrate,e.spectacle,e.stars,e.stories,
  e.knownMatches,e.completedShows];
 if(values.some(x=>!Number.isSafeInteger(x)||x<0)||
  e.workrate+e.spectacle+e.stars+e.stories!==e.knownMatches)
  throw new Error("Invalid certified creative evidence");
 if(e.knownMatches<6||e.completedShows<3)return null;
 const categories=[
  {category:"WORKRATE" as const,count:e.workrate,title:"In-ring wrestling",
   description:"Your completed cards favour competitive wrestling and technical craft."},
  {category:"SPECTACLE" as const,count:e.spectacle,title:"Big-match spectacle",
   description:"High-risk encounters and epic match presentations define recent shows."},
  {category:"STAR_POWER" as const,count:e.stars,title:"Star showcases",
   description:"Your booked matches frequently put the spotlight on featured performers."},
  {category:"STORYTELLING" as const,count:e.stories,title:"Story-driven wrestling",
   description:"The promotion emphasises rivalry-driven and protective match presentations."}
 ].sort((a,b)=>b.count-a.count);
 const leader=categories[0]!,runner=categories[1]!;
 if(leader.count/e.knownMatches<.4||
  (leader.count-runner.count)/e.knownMatches<.12)
  return {title:"A varied wrestling identity",category:"VARIED",
   description:"Your completed shows draw on several wrestling styles. No one approach dominates.",
   sampleMatches:e.knownMatches,completedShows:e.completedShows};
 return {title:leader.title,category:leader.category,
  description:leader.description,sampleMatches:e.knownMatches,
  completedShows:e.completedShows};
}
