/** Narrow, testable quality checks for PPW's match journalism.
 * A SINGLE colourful phrase isn't a failure. This catches the clusters
 * repeatedly observed in actual published reports, without using a second
 * provider call or punishing an intentional wrestling character gimmick.
 */
const cliches:readonly [RegExp,string][]=[
 [/electric (?:crowd|atmosphere|audience)/gi,"electric crowd"],
 [/(?:dark |long |looming )?shadow (?:loom(?:s|ed|ing)?|hangs?|cast|over)|looming (?:shadow|threat|storm|authority figure)/gi,"looming menace"],
 [/(?:eyes? (?:shone|shining|glistened|sparkled|burned|burning)|(?:shining|glittering) eyes?)/gi,"ornamental eyes"],
 [/(?:raw power|pure dominance|aura of (?:dominance|power|fear|mystery)|unstoppable aura)/gi,"empty powerhouse hype"],
 [/(?:paint(?:s|ed|ing)? (?:a|the) picture|written in the stars|weight of (?:his|her|their|the) persona)/gi,"metaphorical filler"],
 [/(?:the (?:crowd|audience) erupted|collective gasp|hush fell over|atmosphere (?:was|became) electric)/gi,"stock crowd response"],
 [/(?:a chess match|chess-like (?:match|exchange)|a study in (?:styles|contrasts)|a simmering storm)/gi,"stock match metaphor"]
];
export function ringsideClicheSignals(text:string):string[]{
 const signals:string[]=[];
 for(const [pattern,label] of cliches){
  pattern.lastIndex=0;
  for(const hit of text.matchAll(pattern))if(hit[0])signals.push(label);
 }
 return signals;
}
/** Conservative hard barrier: only clustered purple prose is rejected.
 * One honest phrase remains permitted; tone can still be judged by people.
 */
export function ringsideProseQualityFailure(input:{
 opening:string;closing:string;slots:readonly {headline:string;recap:string}[];
}):string|null{
 let total=0;
 for(const slot of input.slots){
  const found=ringsideClicheSignals(slot.headline+" "+slot.recap);
  if(found.length>=2)return "Ringside stacked stock metaphors in one match or angle";
  total+=found.length;
 }
 const bookends=ringsideClicheSignals(input.opening+" "+input.closing);
 return total+bookends.length>=5?
  "Ringside repeated stock metaphors across the show":null;
}
/** A technical hold may build to a pin, but the referee must not count a
 * clean pin while that hold is still being applied as the decisive method.
 */
export function impossibleHoldCount(prose:string):boolean{
 for(const sentence of prose.split(/(?<=[.!?])\s+|\n+/)){
  const activeHold=/\b(?:armbar|sleeper|crossface|coquina clutch|chokehold|anaconda vise|submission hold|triangle choke|figure[- ]four)\b/i.test(sentence);
  const counted=/\b(?:referee['’]?s? (?:count (?:hit|reached)|hand (?:hit|struck)|counted (?:to )?three)|three[- ]count|counted three|clean pin(?:fall)?|pinfall victory)\b/i.test(sentence);
  const ongoing=/\b(?:remained locked|still locked|still applied|kept (?:it|the hold) on|while (?:the )?hold|as (?:the )?hold|armbar remained|choke remained)\b/i.test(sentence);
  const released=/\b(?:released? the hold|let go|escaped the hold|switched to (?:a )?(?:cover|cradle|roll[- ]?up)|rolled (?:through|into a cover)|broke the hold)\b/i.test(sentence);
  if(activeHold&&counted&&ongoing&&!released)return true;
 }
 return false;
}
/** A clean fall cannot be counted by a referee who is explicitly still
 * looking away. A later return to position removes the contradiction.
 */
export function unseenCleanCount(prose:string):boolean{
 if(!/\breferee['’]?s? back (?:was |is )?turned\b|\breferee (?:was |is )?(?:looking away|distracted)\b/i.test(prose))
  return false;
 if(!/\b(?:clean (?:pin|fall)|referee (?:counted|count|hit) three|three[- ]count|flash[- ]?pin)\b/i.test(prose))
  return false;
 return !/\breferee (?:turned back|returned|spun around|turned around|regained (?:his|her|their) view|saw the cover)\b/i.test(prose);
}
