/** Preview-only, not an accounting write: each performer costs once per show. */
export function forecastCardAppearanceFees(ids:readonly string[],
 roster:ReadonlyMap<string,{appearanceFee?:number|null}>){
 const unique=[...new Set(ids.filter(Boolean))];let amount=0,unknown=0;
 for(const id of unique){
  const fee=roster.get(id)?.appearanceFee;
  if(fee===null||fee===undefined||!Number.isFinite(fee)||fee<0)unknown++;
  else amount+=fee;
 }
 return {amount,performers:unique.length,unknown,complete:unknown===0};
}

/** A booking's *additional* live appearance cost, not another charge for
 * someone already counted elsewhere on the card. This does not book or
 * settle appearances; the authoritative show accounting remains unchanged.
 */
export function forecastIncrementalAppearanceFees(ids:readonly string[],
 alreadyOnCard:readonly string[],
 roster:ReadonlyMap<string,{appearanceFee?:number|null}>){
 const unique=[...new Set(ids.filter(Boolean))],existing=new Set(alreadyOnCard);
 const newIds=unique.filter(id=>!existing.has(id));
 return {...forecastCardAppearanceFees(newIds,roster),
  alreadyBooked:unique.length-newIds.length};
}
