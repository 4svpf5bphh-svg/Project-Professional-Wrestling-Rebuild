/** A bounded, zero-provider-call editorial desk for paid Ringside articles.
 * Every returned passage must pass the existing hard factual validator.
 */
import type {CompletedShowView,ShowResultEntry} from "../db/show-results-view.js";
import {buildVerifiedRingsideFallback,RingsideSlotValidationError,
 removeVerbatimRecapEchoes,scrubRingsidePrivateMetadata,validateRingsideCopy,
 ringsideReaderQualityIssue,withOccasionalWrestlingHistory,verifiedRingsideDialogue,type RingsideCopy}
 from "./ringside-editorial.js";
import {ringsideProseQualityFailure} from "./ringside-prose-quality.js";
import type {TerraEditorialDiagnostics,TerraEditReason} from "./terra-editorial-diagnostics.js";
const textOk=(value:unknown,max:number):value is string=>
 typeof value==="string"&&value.trim().length>0&&value.length<=max&&!/[<>\x00-\x08]/.test(value);
const quoteKey=(line:string)=>line.normalize("NFKC").toLowerCase()
 .replace(/[’‘ʼ]/g,"'").replace(/[–—]/g,"-")
 .replace(/[^\p{L}\p{N}']+/gu," ").trim();
const quotePattern=/[“"]([^”"\r\n]{1,500})[”"]|(?<![\p{L}\p{N}])‘((?:[^‘’\r\n]|’(?=[\p{L}\p{N}])){1,500})’(?![\p{L}\p{N}])|(?<![\p{L}\p{N}])'((?:[^'\r\n]|'(?=[\p{L}\p{N}])){1,500})'(?![\p{L}\p{N}])/gu;
const escaped=(s:string)=>s.replace(/[-/\\^$*+?.()|[\]{}]/g,"\\$&");
const alias=(name:string)=>[...new Set([name,name.split(/\s+/).at(-1)??name])].filter(x=>x.length>=2);
const speech="(?:said|says|shouted|declared|announced|replied|warned|demanded|promised|asked|told|added|claimed|snarled|yelled)";
function nearbySpeakers(text:string,at:number,length:number,names:string[]):string[]{
 const before=text.slice(Math.max(0,at-90),at);
 const after=text.slice(at+length,at+length+70);
 const leading=names.filter(name=>alias(name).some(a=>
  new RegExp("(?:^|[^\\p{L}\\p{N}])"+escaped(a)+"\\s+"+speech+"\\b[^.!?]{0,45}$","iu").test(before)));
 if(leading.length)return leading;
 // A full stop ends attribution. Do not mistake the next speaker's
 // sentence for the owner of the preceding, correctly authored quotation.
 return names.filter(name=>alias(name).some(a=>{
  const n=escaped(a);
  return new RegExp("^\\s*[,—-]?\\s*(?:"+speech+"\\s+"+n+"|"+n+"\\s+"+speech+")\\b","iu").test(after);
 }));
}
/** Restore the exact author-written line only when its words and speaker
 * agree. Unknown or ambiguous direct speech is not laundered as fact. */
export function restoreTerraAuthoredDialogue(text:string,entry:ShowResultEntry):
 {text:string;changed:boolean;unsupported:boolean}{
 if(entry.type!=="SEGMENT")return {text,changed:false,unsupported:false};
 const lines=verifiedRingsideDialogue(entry);
 const visible=[...new Set([...(entry.segmentContext?.actorNames??[]),
  ...(entry.segmentContext?.targetPresence==="ON_SCREEN"?entry.segmentContext.targetNames:[])])];
 const names=[...new Set([...visible,...(entry.segmentContext?.targetNames??[])])];
 let unsupported=false;
 const next=text.replace(quotePattern,(whole:string,double:string|undefined,
  curly:string|undefined,single:string|undefined,at:number)=>{
  const quoted=double??curly??single??"";
  const key=quoteKey(quoted);
  const exact=lines.filter(a=>key&&quoteKey(a.line)===key);
  const excerpts=key.split(" ").length>=4?lines.filter(a=>a.line.includes(quoted.trim())):[];
  const matching=exact.length?exact:excerpts;
  const speakers=nearbySpeakers(text,at,whole.length,names);
  const eligible=matching.filter(a=>speakers.length===1?speakers[0]===a.speaker:
   speakers.length===0&&visible.length===1&&visible[0]===a.speaker);
  const unique=[...new Set(eligible.map(a=>exact.length?a.line:quoted.trim()))];
  if(unique.length===1)return "“"+unique[0]+"”";
  unsupported=true;return whole;
 });
 return {text:next,changed:next!==text,unsupported};
}
/** Mask whole quotations before splitting; punctuation within fabricated
 * speech cannot leave half of the invented claim in the final recap. */
function dialogueSentences(text:string):string[]{
 const saved:string[]=[];
 const masked=text.replace(quotePattern,whole=>"\x00"+(saved.push(whole)-1)+"\x00");
 return masked.split(/(?<=[.!?])\s+|\n+/).map(part=>
  part.replace(/\x00(\d+)\x00/g,(_whole,i:string)=>saved[Number(i)]??"").trim()).filter(Boolean);
}
const wordCount=(s:string)=>s.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)?.length??0;
function repairDialoguePassage(text:string,entry:ShowResultEntry):string|null{
 const kept=dialogueSentences(text).flatMap(sentence=>{
  const result=restoreTerraAuthoredDialogue(sentence,entry);
  return result.unsupported?[]:[result.text];
 });
 const body=kept.join(" ");
 if(wordCount(body)<20||wordCount(body)<wordCount(text.replace(quotePattern," "))*0.5)
  return null;
 const authored=verifiedRingsideDialogue(entry).filter(a=>!body.includes(a.line))
  .map(a=>a.speaker+" said: “"+a.line+"”");
 const restored=body+(authored.length?" "+authored.join(" "):"");
 if(!textOk(restored,1800))return null;
 const result=restoreTerraAuthoredDialogue(restored,entry);
 return result.unsupported?null:result.text;
}
const sameSlot=(a:RingsideCopy["slots"][number],b:RingsideCopy["slots"][number])=>
 a.headline===b.headline&&a.recap===b.recap;
const reasonFor=(reason:string):TerraEditReason=>
 /quotation/.test(reason)?"UNSCRIPTED_DIALOGUE":
 /repeated/.test(reason)?"REPEATED_SENTENCE":
 /metadata|terminology|numerical score/.test(reason)?"INTERNAL_LABEL":
 /shape|slot facts/.test(reason)?"MISSING_OR_INVALID_TEXT":"FACTUAL_CONTRADICTION";

export function finalizeTerraEditorial(input:RingsideCopy,show:CompletedShowView):
 {review:RingsideCopy;diagnostics:TerraEditorialDiagnostics}{
 if(!input||!Array.isArray(input.slots)||input.slots.length!==show.entries.length||
  input.slots.some((s,i)=>s?.slotId!==show.entries[i]?.slotId))
  throw new Error("Untrusted ringside review shape or card order");
 const fallback=buildVerifiedRingsideFallback(show);
 const diagnostics:TerraEditorialDiagnostics={version:1,
  slots:show.entries.map(e=>({slotId:e.slotId,source:"OPENAI",reasons:[]})),
  bookendsRepaired:false,warnings:[]};
 const maxFallback=show.entries.length>1?Math.max(1,Math.min(2,Math.floor(show.entries.length/3))):0;
 const working:RingsideCopy={...input,slots:input.slots.map(s=>({...s}))};
 function mark(i:number,reason:TerraEditReason,replaced=false){
  const s=diagnostics.slots[i]!;
  if(!s.reasons.includes(reason))s.reasons.push(reason);
  if(replaced)s.source="PPW_FALLBACK";
  else if(s.source==="OPENAI")s.source="CLEANED";
 }
 function replaceSlot(i:number,reason:TerraEditReason){
  const origin=diagnostics.slots[i];
  if(!origin||origin.source==="PPW_FALLBACK"||
   diagnostics.slots.filter(s=>s.source==="PPW_FALLBACK").length>=maxFallback)
   throw new Error("Terra exceeded the bounded factual repair allowance at card "+(i+1)+
    " ("+reason.toLowerCase().replaceAll("_"," ")+")");
  working.slots[i]={...fallback.slots[i]!};mark(i,reason,true);
 }
 let bookendsReplaced=false;
 function replaceBookends(){
  if(bookendsReplaced)throw new Error("Terra could not validate the show introduction or close");
  working.showHeadline=fallback.showHeadline;
  working.opening=fallback.opening;working.closing=fallback.closing;
  diagnostics.bookendsRepaired=true;bookendsReplaced=true;
 }
 if(!textOk(working.showHeadline,140)||!textOk(working.opening,900)||
  !textOk(working.closing,650))replaceBookends();
 for(const [i,s] of working.slots.entries()){
  if(!textOk(s.headline,150)||!textOk(s.recap,1800)){
   replaceSlot(i,"MISSING_OR_INVALID_TEXT");continue;
  }
  const headline=restoreTerraAuthoredDialogue(s.headline,show.entries[i]!);
  const recap=restoreTerraAuthoredDialogue(s.recap,show.entries[i]!);
  if(headline.unsupported||recap.unsupported){
   const repaired=recap.unsupported?repairDialoguePassage(s.recap,show.entries[i]!):recap.text;
   if(!repaired){replaceSlot(i,"UNSCRIPTED_DIALOGUE");continue;}
   s.headline=headline.unsupported?fallback.slots[i]!.headline:headline.text;
   s.recap=repaired;mark(i,"UNSCRIPTED_DIALOGUE");
  }else if(headline.changed||recap.changed){
   s.headline=headline.text;s.recap=recap.text;mark(i,"QUOTE_NORMALIZED");
  }
  // Polish narrow mechanical echoes in otherwise valid copy, never change
  // the winner or how the fall was awarded. Revalidate below.
  if(show.entries[i]?.type==="MATCH"){
   const polished=s.recap.replace(/\b(?:a|the) separate (?:legal )?cover\b/gi,"a cover")
    .replace(/\bsecured a legal cover\b/gi,"made the cover");
   if(polished!==s.recap){s.recap=polished;mark(i,"INTERNAL_LABEL");}
  }
  const deduped=removeVerbatimRecapEchoes(s.recap);
  if(deduped!==s.recap){s.recap=deduped;mark(i,"REPEATED_SENTENCE");}
 }
 const scrubbed=scrubRingsidePrivateMetadata(working,show);
 if(scrubbed){
  if(scrubbed.showHeadline!==working.showHeadline||scrubbed.opening!==working.opening||
   scrubbed.closing!==working.closing)diagnostics.bookendsRepaired=true;
  working.showHeadline=scrubbed.showHeadline;working.opening=scrubbed.opening;
  working.closing=scrubbed.closing;
  scrubbed.slots.forEach((s,i)=>{
   if(!sameSlot(s,working.slots[i]!)){working.slots[i]=s;mark(i,"INTERNAL_LABEL");}
  });
 }
 // Keep every hard fact gate; subjective style/length warnings do not
 // trigger another billable request. The Groq pipeline retains its own rules.
 const check=(copy:RingsideCopy,view=show)=>{
  // The completed match receipt has no recorded kickout, near-fall or move beats.
  const unrecorded=/\b(?:kicks? out|kicked out|kick[- ]?outs?|near[- ]falls?)\b|\b(?:hit|hits|lands?|landed|delivered|connected with) (?:a |the )?(?:suplex|powerbomb|moonsault|ddt|clothesline|chokeslam|dropkick|brainbuster|piledriver)\b/i;
  const moves=[...new Set(view.entries.flatMap(entry=>(entry.performerIdentities??[])
   .flatMap(p=>[...p.signatureMoves,...p.finishingMoves])).filter(move=>move.length>=7))];
  const knownAction=(prose:string)=>moves.some(move=>
   new RegExp("\\b(?:hit|hits|landed|lands|delivered|used|executed|unleashed|connected with)\\b[^.!?]{0,55}"+
    escaped(move)+"(?![\\p{L}\\p{N}])","iu").test(prose));
  copy.slots.forEach((slot,i)=>{
   if(view.entries[i]?.type==="MATCH"&&(unrecorded.test(slot.headline+" "+slot.recap)||
    knownAction(slot.headline+" "+slot.recap)))
    throw new RingsideSlotValidationError(i,"Terra reported an unrecorded match spot");
  });
  if(unrecorded.test(copy.showHeadline+" "+copy.opening+" "+copy.closing))
   throw new Error("Terra reported an unrecorded match spot in the show summary");
  return validateRingsideCopy(copy,view,{styleWarningOnly:true});
 };
 let verified:RingsideCopy|null=null;
 for(let pass=0;pass<=maxFallback+2;pass++){
  try{verified=check(working);break;}
  catch(error){
   if(error instanceof RingsideSlotValidationError){
    replaceSlot(error.slotIndex,reasonFor(error.message));continue;
   }
   const reason=error instanceof Error?error.message:"Editorial facts did not validate";
   if(/show-level finish count/.test(reason)){replaceBookends();continue;}
   let found=-1;
   for(let i=0;i<working.slots.length;i++){
    if(diagnostics.slots[i]!.source==="PPW_FALLBACK")continue;
    try{check({...fallback,slots:[working.slots[i]!]},
      {...show,entries:[show.entries[i]!]});}
    catch{found=i;break;}
   }
   if(found>=0){replaceSlot(found,reasonFor(reason));continue;}
   if(!bookendsReplaced){replaceBookends();continue;}
   throw error;
  }
 }
 if(!verified)throw new Error("Terra could not validate the complete repaired article");
 if(ringsideProseQualityFailure(verified))diagnostics.warnings.push("STOCK_PROSE");
 if(ringsideReaderQualityIssue(verified,show))diagnostics.warnings.push("UNDERWRITTEN_MATCH");
 const final=withOccasionalWrestlingHistory(verified,show);
 final.slots.forEach((slot,i)=>{
  if(!sameSlot(slot,verified!.slots[i]!))mark(i,"HISTORICAL_ASIDE");
 });
 for(const [i,s] of final.slots.entries()){
  if(restoreTerraAuthoredDialogue(s.headline,show.entries[i]!).unsupported||
   restoreTerraAuthoredDialogue(s.recap,show.entries[i]!).unsupported)
   throw new Error("Terra could not verify quoted speech at card "+(i+1));
 }
 return {review:check(final),diagnostics};
}
