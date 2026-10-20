/** Mobile running-order mechanics from original main's card-running-order.
 * A post-match assault belongs to its source bout when it follows immediately.
 * A move must never put a linked angle before its referenced match.
 */
export interface LinkedRunningOrderAngle{
 slotId:string;kind:string;sourceMatchSlotId:string|null;
}
export function runningOrderBlocks(order:readonly string[],
 angles:readonly LinkedRunningOrderAngle[]):string[][]{
 const linked=new Map(angles.filter(s=>s.kind==="POST_MATCH_ASSAULT"&&
  s.sourceMatchSlotId).map(s=>[s.slotId,s.sourceMatchSlotId!] as const));
 const blocks:string[][]=[];
 for(let i=0;i<order.length;i++){
  const here=order[i]!,after=order[i+1];
  if(after&&linked.get(after)===here){
   blocks.push([here,after]);i++;
  }else blocks.push([here]);
 }
 return blocks;
}
export function moveLinkedRunningOrder(order:readonly string[],id:string,
 delta:-1|1,angles:readonly LinkedRunningOrderAngle[]):string[]|null{
 const blocks=runningOrderBlocks(order,angles);
 const start=blocks.findIndex(block=>block.includes(id));
 const target=start+delta;
 if(start<0||target<0||target>=blocks.length)return null;
 const reordered=blocks.map(block=>[...block]);
 [reordered[start],reordered[target]]=[reordered[target]!,reordered[start]!];
 const flattened=reordered.flat();
 const positions=new Map(flattened.map((name,i)=>[name,i]));
 for(const angle of angles){
  if(angle.kind!=="POST_MATCH_ASSAULT"||!angle.sourceMatchSlotId)continue;
  const source=positions.get(angle.sourceMatchSlotId);
  const assault=positions.get(angle.slotId);
  if(source===undefined||assault===undefined||source>=assault)return null;
 }
 return flattened;
}

/** Drag a slot onto another slot, moving entire match/linked-angle blocks.
 * Applies exactly the same script integrity checks as the arrow controls.
 * The drop target is the slot whose position the dragged block will occupy.
 */
export function dropLinkedRunningOrder(order:readonly string[],draggedId:string,
 targetId:string,angles:readonly LinkedRunningOrderAngle[]):string[]|null{
 const blocks=runningOrderBlocks(order,angles);
 const from=blocks.findIndex(block=>block.includes(draggedId));
 const to=blocks.findIndex(block=>block.includes(targetId));
 if(from<0||to<0||from===to)return null;
 const reordered=blocks.map(block=>[...block]);
 const moving=reordered.splice(from,1)[0]!;
 reordered.splice(to,0,moving);
 const flattened=reordered.flat();
 const positions=new Map(flattened.map((id,i)=>[id,i]));
 for(const angle of angles){
  if(angle.kind!=="POST_MATCH_ASSAULT"||!angle.sourceMatchSlotId)continue;
  const source=positions.get(angle.sourceMatchSlotId);
  const assault=positions.get(angle.slotId);
  if(source===undefined||assault===undefined||source>=assault)return null;
 }
 return flattened;
}

/** Explicitly choosing a source match places its follow-up immediately next.
 * No match/angle payloads change, only their written running-order sequence.
 */
export function attachPostMatchAngle(order:readonly string[],
 angleId:string,matchId:string):string[]|null{
 if(angleId===matchId||!order.includes(angleId)||!order.includes(matchId))
  return null;
 const without=order.filter(id=>id!==angleId);
 const at=without.indexOf(matchId);
 const next=[...without];
 next.splice(at+1,0,angleId);
 return next;
}
