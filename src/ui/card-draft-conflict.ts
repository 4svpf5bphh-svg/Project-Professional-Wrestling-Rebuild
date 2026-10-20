/** Compare only the server-owned booking fields, never a global World
 * revision or derived talent/market/creative scores. Another promotion's
 * routine action must not wipe the current booker's unsaved screenplay.
 */
export interface CardDraftSnapshot{
 slots:readonly {slotId:string;position:number;kind:string;payload:unknown}[];
 programmeLinks:readonly {slotId:string;programmeId:string}[];
 ready:boolean;canEdit:boolean;venueId:string|null;day:number|null;
}
export function hasConcurrentCardChange(
 before:CardDraftSnapshot,latest:CardDraftSnapshot,
):boolean{
 const meaningful=(v:CardDraftSnapshot)=>JSON.stringify({
  slots:v.slots,programmeLinks:v.programmeLinks,
  ready:v.ready,canEdit:v.canEdit,venueId:v.venueId,day:v.day
 });
 return meaningful(before)!==meaningful(latest);
}
