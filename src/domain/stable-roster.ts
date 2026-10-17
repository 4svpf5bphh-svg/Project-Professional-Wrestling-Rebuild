/** Same original PPW membership rules: promotions own factions, not wrestlers.
 * Wrestling is scripted; stable story segments never mutate this roster.
 */
export const STABLE_MIN_FOUNDERS=3;
export const STABLE_MAX_MEMBERS=12;
export function validateStableFounders(name:unknown,ids:unknown):{
 name:string;personIds:string[]}{
 if(typeof name!=="string"||!name.trim()||name.trim().length>60)
  throw new Error("Stable name must be 1–60 characters");
 if(!Array.isArray(ids)||ids.length<STABLE_MIN_FOUNDERS||
  ids.length>STABLE_MAX_MEMBERS||ids.some(x=>
   typeof x!=="string"||!x.trim()||x.length>200)||
  new Set(ids).size!==ids.length)
  throw new Error("A stable requires 3–12 distinct wrestlers");
 return {name:name.trim(),personIds:[...ids]};
}
export function validateStableMemberId(v:unknown):string{
 if(typeof v!=="string"||!v.trim()||v.length>200)
  throw new Error("Invalid stable wrestler identity");
 return v;
}
