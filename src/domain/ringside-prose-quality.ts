/** Narrow, testable quality checks for PPW's match journalism.
 * A SINGLE colourful phrase isn't a failure. This catches the clusters
 * repeatedly observed in actual published reports, without using a second
 * provider call or punishing an intentional wrestling character gimmick.
 */
const cliches:readonly [RegExp,string][]=[
 [/\belectric (?:crowd|atmosphere|audience)\b/gi,"electric crowd"],
 [/\b(?:dark |long |looming )?shadow (?:loom(?:s|ed|ing)?|hangs?|cast|over)\b|\blooming (?:shadow|threat|storm|authority figure)\b/gi,"looming menace"],
 [/\b(?:eyes? (?:shone|shining|glistened|sparkled|burned|burning)|(?:shining|glittering) eyes?)\b/gi,"ornamental eyes"],
 [/\b(?:raw power|pure dominance|aura of (?:dominance|power|fear|mystery)|unstoppable aura)\b/gi,"empty powerhouse hype"],
 [/\b(?:paint(?:s|ed|ing)? (?:a|the) picture|written in the stars|weight of (?:his|her|their|the) persona)\b/gi,"metaphorical filler"],
 [/\b(?:the (?:crowd|audience) erupted|collective gasp|hush fell over|atmosphere (?:was|became) electric)\b/gi,"stock crowd response"],
 [/\b(?:a chess match|chess-like (?:match|exchange)|a study in (?:styles|contrasts)|a simmering storm)\b/gi,"stock match metaphor"]
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
/** Submission pressure may be a turning point in a pinfall match, but an
 * active submission cannot be THE mechanism for holding down shoulders.
 * Consider adjacent sentences: live Groq samples put the hold in one sentence
 * and the referee's count in the next, bypassing a single-sentence check.
 */
export function impossibleHoldCount(prose:string):boolean{
 const sentences=prose.split(/(?<=[.!?])\s+|\n+/).filter(Boolean);
 const holds=/\b(?:arm[- ]?bar|heel[- ]?hook|leg[- ]?lock|ankle[- ]?lock|sleeper|crossface|coquina clutch|chokehold|anaconda vise|submission hold|triangle choke|figure[- ]four|kimura|guillotine|submission lock)\b/i;
 const pin=/\b(?:three[- ]?count|counted (?:to )?three|referee['’]?s? (?:count (?:hit|reached)|hand (?:hit|struck)|counted (?:to )?three)|pinfall|clean pin|(?:shoulders? (?:hit|pinned|pressed|forced|down|flat|to)|pinned (?:his|her|their) shoulders?)\b[^.!?]{0,40}\b(?:mat|canvas|three))\b/i;
 const continuation=/\b(?:remained locked|still locked|still applied|kept (?:it|the hold|the pressure) on|kept (?:the )?pressure until|held (?:the )?hold|maintained (?:the )?hold|while (?:the )?hold|as (?:the )?hold|(?:armbar|hook|choke) remained|stretch(?:ed|ing)?[^.!?]{0,55}(?:into|until|forc(?:ed|ing))|forc(?:ed|ing)[^.!?]{0,65}shoulders?)\b/i;
 const released=/\b(?:released? (?:the|his|her|their) hold|let go|escaped (?:the|his|her|their) hold|switched to (?:a )?(?:cover|cradle|roll[- ]?up)|rolled (?:through|into a cover)|broke (?:the )?hold|countered (?:the )?hold|got free|after (?:the )?hold was released)\b/i;
 for(let i=0;i<sentences.length;i++){
  const one=sentences[i]!;
  const adjacent=i+1<sentences.length?one+" "+sentences[i+1]:one;
  if(!holds.test(one))continue;
  if(pin.test(one)&&continuation.test(one)&&!released.test(one))return true;
  if(pin.test(adjacent)&&continuation.test(one)&&!released.test(adjacent))return true;
 }
 return false;
}
/** A certified pinfall cannot also end on an actual tap. Near-taps and
 * refusals are legitimate drama; explicit submission is not.
 */
export function reportedTapInPinfall(prose:string):boolean{
 const taps=/\b(?:tapp(?:ed|ing)(?:\s+out)?|submitted|yielded (?:to|under) (?:the )?hold)\b/gi;
 for(const match of prose.matchAll(taps)){
  const start=match.index??0;
  const before=prose.slice(Math.max(0,start-55),start);
  const after=prose.slice(start+(match[0]?.length??0),start+65);
  if(/\b(?:almost|nearly|never|didn't|did not|wouldn't|would not|refused to|resisted|avoided|not|no intention of|on the verge of)\s+(?:\w+\s+){0,3}$/i.test(before))continue;
  if(/^\s+(?:the\s+)?(?:mat|canvas|foot|boot|apron|shoulder)\b/i.test(after))continue;
  return true;
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
