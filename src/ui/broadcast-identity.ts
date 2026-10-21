/** Static broadcast identities derived from existing names, never new reads. */
export function promotionBrand(name:string){
 const n=name.trim().toLowerCase();
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
 [/crown jewel/,"crown-jewel"],[/grand slam/,"grand-slam"],[/wrestle kingdom/,"wrestle-kingdom"]];
 return {brand:promotionBrand(owner).key,motif:patterns.find(([rx])=>rx.test(name.toLowerCase()))?.[1]??(major?"signature":"weekly")};
}
