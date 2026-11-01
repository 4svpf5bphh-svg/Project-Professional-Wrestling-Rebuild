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
