import type {Family} from "./contract-economics.js";

export const CONTRACT_TERM_PRESETS=[
 {id:"LONG",label:"Long term",weeks:52,dates:40},
 {id:"MID",label:"Mid term",weeks:26,dates:20},
 {id:"SHORT",label:"Short term",weeks:12,dates:9}
] as const;
export type ContractTermPreset=(typeof CONTRACT_TERM_PRESETS)[number]["id"]|"ONE_NIGHT"|"CUSTOM";

/** Presentation defaults only. The original contracts, economics and signing
 * validation remain authoritative; selecting a preset never submits a deal. */
export function applyContractTermPreset(family:Family,
 preset:Exclude<ContractTermPreset,"CUSTOM">){
 if(preset==="ONE_NIGHT")
  return {family:"ONE_OFF" as const,weeks:1,dates:1};
 const choice=CONTRACT_TERM_PRESETS.find(p=>p.id===preset)!;
 const target=family==="ONE_OFF"?"LIMITED_NON_EXCLUSIVE" as const:family;
 return {family:target,weeks:choice.weeks,
  dates:target==="EXCLUSIVE"?choice.weeks:choice.dates};
}
export function selectedContractTermPreset(family:Family,weeks:number,dates:number):
 ContractTermPreset{
 if(family==="ONE_OFF"&&weeks===1&&dates===1)return "ONE_NIGHT";
 if(family==="ONE_OFF")return "CUSTOM";
 return CONTRACT_TERM_PRESETS.find(p=>p.weeks===weeks&&
  (family==="EXCLUSIVE"||p.dates===dates))?.id??"CUSTOM";
}
