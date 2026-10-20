/** Initial alignment parity with original/main packages/sim-core/src/alignment.ts
 * and its deterministicSeedFromText FNV-1a hash. Never infer Face/Heel
 * from a gimmick, name, promotion or popularity.
 *
 * Existing canonical alignments always take precedence. This read-side
 * fallback restores historical Genesis Worlds whose aligned columns were
 * left unpopulated without rewriting the live World or increasing SQL calls.
 */
export type WrestlerAlignment="FACE"|"HEEL"|"TWEENER";
export function originalDefaultWrestlerAlignment(seed:number|string,personId:string):WrestlerAlignment{
 const n=typeof seed==="string"?Number(seed):seed;
 if(!Number.isSafeInteger(n)||n<0||typeof personId!=="string"||!personId||personId.length>200)
  throw new Error("Invalid original wrestler alignment scope");
 const text=`${n>>>0}:${personId}:alignment`;
 let hash=0x811c9dc5;
 for(let i=0;i<text.length;i++){
  hash^=text.charCodeAt(i);
  hash=Math.imul(hash,0x01000193);
 }
 const bucket=(hash>>>0)%100;
 return bucket<42?"FACE":bucket<84?"HEEL":"TWEENER";
}
export function effectiveWrestlerAlignment(seed:number|string,personId:string,
 defaultAlignment:string|null|undefined,promotionAlignment:string|null|undefined,
):WrestlerAlignment{
 const known=(x:string|null|undefined):x is WrestlerAlignment=>
  x==="FACE"||x==="HEEL"||x==="TWEENER";
 if(known(promotionAlignment))return promotionAlignment;
 if(known(defaultAlignment))return defaultAlignment;
 return originalDefaultWrestlerAlignment(seed,personId);
}
