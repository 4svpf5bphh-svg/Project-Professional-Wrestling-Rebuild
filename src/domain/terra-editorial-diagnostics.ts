/** Bounded, private lab provenance. Never store raw rejected drafts. */
export const TERRA_EDIT_REASONS=["QUOTE_NORMALIZED","UNSCRIPTED_DIALOGUE",
 "INTERNAL_LABEL","REPEATED_SENTENCE","FACTUAL_CONTRADICTION",
 "MISSING_OR_INVALID_TEXT","HISTORICAL_ASIDE"] as const;
export const TERRA_QUALITY_WARNINGS=["STOCK_PROSE","UNDERWRITTEN_MATCH"] as const;
export type TerraEditReason=typeof TERRA_EDIT_REASONS[number];
export type TerraQualityWarning=typeof TERRA_QUALITY_WARNINGS[number];
export type TerraSlotOrigin={slotId:string;source:"OPENAI"|"CLEANED"|"PPW_FALLBACK";
 reasons:TerraEditReason[]};
export type TerraEditorialDiagnostics={
 version:1;slots:TerraSlotOrigin[];bookendsRepaired:boolean;
 warnings:TerraQualityWarning[];
};
export function isAssistedTerra(d?:TerraEditorialDiagnostics|null):boolean{
 return !!d&&(d.bookendsRepaired||d.slots.some(s=>s.source==="PPW_FALLBACK"));
}
export function validateTerraDiagnostics(value:unknown,slotIds:readonly string[]):
 TerraEditorialDiagnostics{
 if(!value||typeof value!=="object"||Array.isArray(value))
  throw new Error("Invalid Terra editorial metadata");
 const v=value as Record<string,unknown>;
 if(Object.keys(v).some(k=>!["version","slots","bookendsRepaired","warnings"].includes(k))||
  v.version!==1||typeof v.bookendsRepaired!=="boolean"||
  !Array.isArray(v.slots)||v.slots.length!==slotIds.length||v.slots.length>30||
  !Array.isArray(v.warnings)||v.warnings.length>2||
  new Set(v.warnings).size!==v.warnings.length||
  !v.warnings.every(x=>(TERRA_QUALITY_WARNINGS as readonly unknown[]).includes(x)))
  throw new Error("Invalid Terra editorial metadata");
 const slots=v.slots.map((raw:unknown,i:number)=>{
  if(!raw||typeof raw!=="object"||Array.isArray(raw))
   throw new Error("Invalid Terra slot provenance");
  const s=raw as Record<string,unknown>;
  if(Object.keys(s).some(k=>!["slotId","source","reasons"].includes(k))||
   s.slotId!==slotIds[i]||!["OPENAI","CLEANED","PPW_FALLBACK"].includes(String(s.source))||
   !Array.isArray(s.reasons)||s.reasons.length>7||
   new Set(s.reasons).size!==s.reasons.length||
   !s.reasons.every(x=>(TERRA_EDIT_REASONS as readonly unknown[]).includes(x))||
   (s.source==="OPENAI"&&s.reasons.length!==0)||
   (s.source!=="OPENAI"&&s.reasons.length===0))
   throw new Error("Invalid Terra slot provenance");
  return {slotId:s.slotId as string,source:s.source as TerraSlotOrigin["source"],
   reasons:s.reasons as TerraEditReason[]};
 });
 return {version:1,slots,bookendsRepaired:v.bookendsRepaired,
  warnings:v.warnings as TerraQualityWarning[]};
}
