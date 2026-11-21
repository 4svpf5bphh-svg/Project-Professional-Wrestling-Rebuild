/** Transparent writing signals for human playtest reviewers.
 * These are NOT truth verdicts, automatic rejections, or a replacement for
 * actually reading the article. No provider, database or token cost.
 */
import type {CompletedShowView} from "../db/show-results-view.js";
import type {RingsideCopy} from "./ringside-editorial.js";

export type RingsideQualityCode=
 "GENERIC_HYPE"|"REPEATED_HYPE"|"MECHANICAL_FALLBACK"|"THIN_MAIN_BOUT"|"SQUASH_OVERWRITTEN"|
 "NO_IN_RING_DETAIL"|"OVERSOLD_QUIET_CROWD"|"THIN_CHARACTER_SCENE";
export interface RingsideQualityWarning{
 code:RingsideQualityCode;slotId:string;description:string;
}
const words=(s:string)=>s.match(/[\p{L}\p{N}][\p{L}\p{N}'’\-]*/gu)?.length??0;
const actions=/\b(?:counter(?:ed|s|ing)?|revers(?:ed|es|al)|dodg(?:ed|es|ing)|catch(?:es|ing)?|caught|grappl(?:ed|es|ing)|strike|strikes|struck|hit|hits|kick(?:ed|s|ing)?|pin(?:ned|s|ning)?|cover(?:ed|s|ing)?|retriev(?:ed|es|al)|tag(?:ged|s|ging)?|roll(?:ed|s|ing)?|lift(?:ed|s|ing)?|climb(?:ed|s|ing)?|slam(?:med|s|ming)?|submitt?(?:ed|s|ing)?|surrender(?:ed|s|ing)?|tapp?(?:ed|s|ing)?|locked|land(?:ed|s|ing)?|fall(?:s|en)?|fell|tackle(?:d|s)?|chop(?:ped|s)?|suplex|lariat|powerbomb|elbow|forearm|submission|three.count|roll.up)\b/i;
const emptyPhrases=/\b(?:the result settled the contest|the audience has seen the outcome|the crowd gathered for a full night of wrestling|the final bell gave the audience plenty to discuss|the decision in the ring|a moment outside the ring)\b/i;
const artificial=/\b(?:looming storm|unstoppable aura|hushed reverence|the electric (?:crowd|audience)|electric audience|eyes (?:shone|shining|sparkled)|every fiber of (?:his|her|their) being|the air was thick with anticipation|inevitable clash|one could only wonder|the crowd erupted)\b/i;
/** This audit may flag a good deliberate literary choice; reviewers decide.
 * A warning costs no extra AI request and never silently rewrites an article.
 */
export function ringsideQualitySignals(show:CompletedShowView,copy:RingsideCopy){
 const warnings:RingsideQualityWarning[]=[];
 const add=(slotId:string,code:RingsideQualityCode,description:string)=>
  warnings.push({slotId,code,description});
 for(const [i,slot] of copy.slots.entries()){
  const entry=show.entries[i];
  if(!entry||entry.slotId!==slot.slotId)continue;
  const prose=slot.headline+" "+slot.recap;
  const n=words(slot.recap);
  if(artificial.test(prose))
   add(slot.slotId,"GENERIC_HYPE","Stock hype or melodrama replaced an observed moment");
  if(emptyPhrases.test(prose))
   add(slot.slotId,"MECHANICAL_FALLBACK","Generic result narration lacks a wrestler's perspective");
  if(entry.type==="MATCH"){
   const mins=entry.fallout?.actualMinutes??entry.matchContext?.plannedMinutes??0;
   const rating=entry.fallout?.ratingStars??null;
   if(mins>=15&&rating!==null&&rating>=3.6&&n<45)
    add(slot.slotId,"THIN_MAIN_BOUT","A significant match needs more than a finish sentence");
   if(mins>0&&mins<=6&&n>135)
    add(slot.slotId,"SQUASH_OVERWRITTEN","A very short bout reads like a marathon");
   if(n>=30&&!actions.test(prose))
    add(slot.slotId,"NO_IN_RING_DETAIL","The review discusses the result but not the action");
  }else if(n<18&&entry.crowdResponse>=65)
   add(slot.slotId,"THIN_CHARACTER_SCENE","An important character chapter gets little storytelling");
  if(entry.crowdResponse<45&&
   /\b(?:crowd erupted|standing ovation|crowd went wild|building shook|everyone rose to their feet)\b/i.test(prose))
   add(slot.slotId,"OVERSOLD_QUIET_CROWD","Reaction contradicts the recorded quiet audience");
 }
 // Across an entire multi-segment show, perfectly valid single sentences
 // can still create the same synthetic voice. This specifically catches the
 // repeated 'electric / erupted / looming' vocabulary in stored PPW v9 articles.
 const full=[copy.opening,...copy.slots.map(x=>x.recap),copy.closing].join(" ");
 const stock=["electric","erupted","looming","inevitable","unstoppable"];
 const repetition=stock.map(word=>({
  word,count:(full.match(new RegExp("\\b"+word+"\\b","gi"))??[]).length
 })).filter(x=>x.count>=3);
 if(copy.slots.length>=3&&repetition.length)
  add("show","REPEATED_HYPE","The same atmospheric vocabulary dominates this show: "+
   repetition.map(x=>x.word+" ("+x.count+")").join(", "));
 const unique=new Set(warnings.map(w=>w.code));
 return {warningCount:warnings.length,flagTypes:[...unique].sort(),
  warnings,requiresHumanReview:true as const};
}
