/** Static broadcast identities derived from existing names, never new reads. */
export const originalFictionalPromotionBrands=Object.freeze({
 "Crown Wrestling":"crown-wrestling",
 "Revolution Pro":"revolution-pro",
 "Frontier Wrestling":"frontier-wrestling",
 "Atlas Wrestling":"atlas-wrestling",
 "Titan Combat":"titan-combat"
} as const);
export function promotionBrand(name:string){
 const n=name.trim().toLowerCase();
 // Exact original Genesis name, not a fuzzy substring. If a player renames
 // this company, it must not keep displaying the old identity.
 const fictional=Object.entries(originalFictionalPromotionBrands)
  .find(([original])=>original.toLowerCase()===n);
 if(fictional)return {key:fictional[1],mark:name.trim().split(/\\s+/).map(x=>x[0]).join("").toUpperCase()};
 const brands:[RegExp,string,string][]=[
 [/\bnxt\b/,"nxt","NXT"],[/\baew\b|all elite wrestling/,"aew","AEW"],
 [/\bnjpw\b|new japan pro/,"njpw","NJPW"],[/\broh\b|ring of honor/,"roh","ROH"],
 [/\btna\b|total nonstop action/,"tna","TNA"],[/stardom/,"stardom","STARDOM"],
 [/\bcml[l]?\b|consejo mundial/,"cmll","CMLL"],
 [/\bwwe\b|world wrestling entertainment/,"wwe","WWE"]];
 const match=brands.find(([re])=>re.test(n));
 return match?{key:match[1],mark:match[2]}:
  {key:"custom",mark:name.trim().split(/\s+/).slice(0,3).map(x=>x[0]).join("").toUpperCase()||"PPW"};
}
export function eventDesign(name:string,owner:string,major:boolean){
 const patterns:[RegExp,string][]=[
 [/wrestlemania/,"wrestlemania"],[/royal rumble/,"rumble"],[/summerslam/,"summerslam"],
 [/survivor series/,"survivor"],[/money in the bank/,"mitb"],[/elimination chamber/,"chamber"],
 [/smackdown/,"smackdown"],[/\braw\b/,"raw"],[/dynamite/,"dynamite"],[/collision/,"collision"],
 [/\ball in\b/,"all-in"],[/\ball out\b/,"all-out"],[/double or nothing/,"double-or-nothing"],
 [/revolution/,"revolution"],[/full gear/,"full-gear"],[/forbidden door/,"forbidden-door"],
 [/wrestledream/,"wrestledream"],[/worlds end|world's end/,"worlds-end"],
 [/dynasty/,"dynasty"],[/backlash/,"backlash"],[/night of champions/,"night-of-champions"],
 [/clash in italy/,"clash-in-italy"],[/wrestlepalooza/,"wrestlepalooza"],
 [/\bredemption\b/,"redemption"],[/\bimpact!?\b/,"impact"],
 [/bound for glory/,"bound-for-glory"],[/stand\s*(?:and|&)\s*deliver/,"stand-and-deliver"],
 [/supercard of honor/,"supercard-of-honor"],[/super viernes/,"super-viernes"],
 [/anniversary show/,"anniversary"],[/dream queendom/,"dream-queendom"],
 [/\bstardom live\b/,"stardom-live"],[/road series/,"road-series"],
 [/crown jewel/,"crown-jewel"],[/grand slam/,"grand-slam"],
 [/wrestle kingdom/,"wrestle-kingdom"],[/\bnxt\b/,"nxt-weekly"]];
 return {brand:promotionBrand(owner).key,motif:patterns.find(([rx])=>rx.test(name.toLowerCase()))?.[1]??(major?"signature":"weekly")};
}
