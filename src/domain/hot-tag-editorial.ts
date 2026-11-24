/** The show owns the facts and the existing reaction wire owns the identities.
 * Groq supplies bounded opinions, never new accounts, results, or events.
 * Reuse the exact same projection on generation, cache read and rendering. */
import type {CompletedShowView} from "../db/show-results-view.js";
import {showReactionWire,type ReactionVoice} from "./show-reaction-wire.js";
export interface HotTagEditorialAnchor{
 key:string;slotId:string;voice:ReactionVoice;replyVoice?:ReactionVoice;
 participants:string[];subject:string;context:string;
 otherPerformers?:string[];
}
export interface HotTagEditorialCopy{
 slotId:string;voice:ReactionVoice;text?:string;
 reply?:{voice:ReactionVoice;text:string};
}
const tidy=(s:string,max:number)=>s.replace(/[\u0000-\u001f]/g," ").trim().slice(0,max);
const normalize=(s:string)=>s.normalize("NFKC").toLowerCase().replace(/[’‘]/g,"'").replace(/[^\p{L}\p{N}]+/gu," ").trim();
export function hotTagEditorialAnchors(show:CompletedShowView):HotTagEditorialAnchor[]{
 // Two existing public threads: prefer an argument (reply), then the
 // important moments selected by our existing certified reaction wire.
 // Do not expand injury coverage into trolling or private speculation.
 const selected=showReactionWire(show).filter(r=>r.source!=="MEDICAL");
 return selected.sort((a,b)=>Number(!!b.reply)-Number(!!a.reply)).slice(0,2).flatMap((r,i)=>{
  const entry=show.entries.find(e=>e.slotId===r.slotId);
  if(!entry)return [];
  const participants=[...new Set(entry.type==="MATCH"?
   entry.matchContext?.sides.flat()??[]:
   [...(entry.segmentContext?.actorNames??[]),...(entry.segmentContext?.targetNames??[])])]
   .filter(n=>typeof n==="string"&&n.trim()).slice(0,6).map(n=>tidy(n,100));
  if(!participants.length)return [];
  return [{key:"f"+i,slotId:r.slotId,voice:r.voice,
   ...(r.reply?{replyVoice:r.reply.voice}:{}),participants,
   subject:tidy(entry.headline,130),
   context:tidy(r.text,210),
   otherPerformers:[...new Set(show.entries.filter(e=>e.slotId!==r.slotId).flatMap(e=>
    e.matchContext?.sides.flat()??[...(e.segmentContext?.actorNames??[]),
     ...(e.segmentContext?.targetNames??[])]))]
    .filter(n=>n.trim().length>=4&&!participants.some(p=>normalize(p)===normalize(n)))
    .map(n=>tidy(n,100)).slice(0,60)}];
 });
}
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};
// Fan commentary should add a perspective, not recount a finish. The
// receipt already supplies that information. Reject factual claims about
// results, medical/contract matters, real backstage knowledge, and newly
// booked events even when a model phrases them as a fan rumour.
const factClaim=/\b(?:won|wins|winning streak|lost|loses|defeated|beat|pinned|pinfall|tapped|submitted|surrendered|eliminated|retained|retains|title change|new champion|injur(?:y|ies|ed)|concussion|hospital|medical|fractur\w*|broken (?:neck|leg|arm)|fired|signed|contract|released|suspended|arrested|dead|died|backstage|locker.room|insider|sources?|leak\w*|confirmed|officially|booked|scheduled|announced|guaranteed|next week's match|referee (?:saw|missed|counted)|hit (?:him|her|them)|struck|attacked|blood|bleed\w*)\b/i;
const meta=/\b(?:certified|simulation|game engine|player controlled|ai generated|prompt|slot id|crowd response|verified result)\b/i;
const hostile=/\b(?:kill yourself|go die|death threat|rape|racial slur)\b/i;
const opinion=/\b(?:i|my|me|we|our|think|thought|love|hate|want|prefer|hope|wish|deserv\w*|should|could|would|better|worse|great|brilliant|awful|ridiculous|boring|perfect|shame|seriously|please|imagine|fair|unfair|what a|why|really|good|bad|come on|nah|nope|lol|lmao|hell|fuck|shit|damn|ffs|cry|cope)\b/i;
function opinionText(raw:unknown,anchor:HotTagEditorialAnchor,reply=false):string|null{
 if(typeof raw!=="string"||raw.length>230||/[\u0000-\u001f<>]/.test(raw))return null;
 const text=raw.trim(),words=text.split(/\s+/).length;
 if(words<5||words>36||factClaim.test(text)||meta.test(text)||hostile.test(text)||
  !opinion.test(text)||/[“”"]/.test(text)||/https?:|@[a-z0-9_]/i.test(text))return null;
 // The first post must refer to the actual subject; a reply may disagree
 // directly without restating its name. Exact word-boundary name match.
 const norm=" "+normalize(text)+" ";
 if(!reply&&!anchor.participants.some(n=>norm.includes(" "+normalize(n)+" ")))return null;
 // Don't let a fan transplant an unrelated wrestler into this slot.
 if(anchor.otherPerformers?.some(n=>norm.includes(" "+normalize(n)+" ")))return null;
 if(normalize(text)===normalize(anchor.context))return null;
 return text;
}
export function validateHotTagEditorial(anchors:readonly HotTagEditorialAnchor[],candidate:unknown):HotTagEditorialCopy[]{
 const raw=object(candidate),used=new Set<string>();
 const copy:HotTagEditorialCopy[]=[];
 for(const anchor of anchors){
  const item=object(raw[anchor.key]);
  const text=opinionText(item.text,anchor);
  const response=anchor.replyVoice?opinionText(item.reply,anchor,true):null;
  const accepted=text&&!used.has(normalize(text))?text:null;
  if(accepted)used.add(normalize(accepted));
  // A model reply must respond to its model-written first post, not an
  // unrelated local fallback; if the lead fails retain the original thread.
  const reply=accepted&&response&&!used.has(normalize(response))&&anchor.replyVoice?
   {voice:anchor.replyVoice,text:response}:undefined;
  if(reply)used.add(normalize(reply.text));
  // Treat a two-person conversation as a unit. Never combine a model
  // opinion with an unrelated deterministic answer.
  if(accepted&&(!anchor.replyVoice||reply))copy.push({
   slotId:anchor.slotId,voice:anchor.voice,text:accepted,...(reply?{reply}:{})});
 }
 return copy;
}
/** Bind stored text to the same immutable slot AND persona. Old v1 records
 * without fan text remain readable; no new writes or provider request. */
export function readHotTagEditorial(anchors:readonly HotTagEditorialAnchor[],candidate:unknown):HotTagEditorialCopy[]{
 if(!Array.isArray(candidate)||candidate.length>2)return [];
 const raw:Record<string,unknown>={};
 for(const anchor of anchors){
  const matches=candidate.map(object).filter(s=>s.slotId===anchor.slotId&&s.voice===anchor.voice);
  if(matches.length!==1)continue;
  const item=matches[0]!,reply=object(item.reply);
  raw[anchor.key]={text:item.text,
   ...(reply.voice===anchor.replyVoice?{reply:reply.text}:{})};
 }
 return validateHotTagEditorial(anchors,raw);
}
