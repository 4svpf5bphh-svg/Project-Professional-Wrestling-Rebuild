/** Configurable editorial presentation, NEVER authoritative show facts. */
export type RingsideVoice="MARTY"|"SPORTS"|"SATIRE";
export type RingsideDetail="SHORT"|"BALANCED"|"LONG";
export type RingsideModel="openai/gpt-oss-120b"|"openai/gpt-oss-20b";
export type RingsideReasoning="low"|"medium"|"high";
export interface RingsideSettings{
 model:RingsideModel;voice:RingsideVoice;detail:RingsideDetail;
 creativity:number;reasoning:RingsideReasoning;additionalGuidance:string;version:number;
}
export const DEFAULT_RINGSIDE_SETTINGS:RingsideSettings={
 model:"openai/gpt-oss-120b",voice:"MARTY",detail:"BALANCED",
 creativity:0.92,reasoning:"low",additionalGuidance:"",version:0
};
export function validateRingsideSettings(value:unknown):Omit<RingsideSettings,"version">{
 if(!value||typeof value!=="object"||Array.isArray(value))
  throw new Error("Invalid Ringside settings");
 const o=value as Record<string,unknown>;
 const allowed=["model","voice","detail","creativity","reasoning","additionalGuidance"];
 if(Object.keys(o).some(x=>!allowed.includes(x))||
   !["openai/gpt-oss-120b","openai/gpt-oss-20b"].includes(String(o.model))||
   !["MARTY","SPORTS","SATIRE"].includes(String(o.voice))||
   !["SHORT","BALANCED","LONG"].includes(String(o.detail))||
   !["low","medium","high"].includes(String(o.reasoning))||
   typeof o.creativity!=="number"||!Number.isFinite(o.creativity)||
   o.creativity<0||o.creativity>1.5||
   typeof o.additionalGuidance!=="string"||o.additionalGuidance.length>900||
   /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(o.additionalGuidance))
  throw new Error("Unsupported Ringside setting");
 return {model:o.model as RingsideModel,voice:o.voice as RingsideVoice,
  detail:o.detail as RingsideDetail,creativity:Math.round(o.creativity*100)/100,
  reasoning:o.reasoning as RingsideReasoning,additionalGuidance:o.additionalGuidance.trim()};
}
export function ringsideVoiceInstruction(settings:RingsideSettings):string{
 const voice=settings.voice==="SPORTS"
  ?"Write like a traditional ringside sports correspondent: crisp, fair, vivid and analytical. Still report the whole story."
  :settings.voice==="SATIRE"
  ?"More witty wrestling-business colour, dry jokes and sharp criticism when earned. Never demean the actual performers or repeat a catchphrase."
  :"Keep Marty Vale's opinionated veteran-wrestling-journalist character; vivid, funny when earned and serious when called for.";
 const length=settings.detail==="SHORT"
  ?"Keep each normal match recap roughly 45-85 words. Angles 25-50 words."
  :settings.detail==="LONG"
  ?"Important matches may run 130-220 words in two paragraphs. Other matches 75-120 words; angles 55-95 words."
  :"Strong matches 90-150 words, short bouts 55-100 words, angles 35-85 words.";
 return "\nADMIN EDITORIAL PREFERENCE (presentation only; never supersedes any factual or safety constraint):\n"+
  voice+"\n"+length+
  (settings.additionalGuidance?"\nWriting preference: "+settings.additionalGuidance:"");
}
