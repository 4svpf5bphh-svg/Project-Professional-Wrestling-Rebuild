/** Follow-through for actual completed faction angles.
 * Original PPW design: scripted exit/invitation/reconciliation does not
 * automatically edit stable membership. Online participation grants choice.
 */
export interface StableStoryFact{
 showId:string;slotId:string;weekIndex:number;kind:string;outcome:string;
 story:unknown;
}
export interface StableFollowThrough{
 showId:string;slotId:string;stableId:string;stableName:string;
 personId:string;personName:string;weekIndex:number;
 action:"ADD"|"REMOVE";
 status:"READY"|"NOT_ON_ROSTER"|"OTHER_STABLE"|"STABLE_FULL"|"STABLE_INACTIVE";
}
export interface StableFollowThroughContext{
 stableId:string;name:string;status:string;members:readonly string[];
}
export function stableStoryFollowThrough(input:{
 stables:readonly StableFollowThroughContext[];
 roster:readonly {personId:string;name:string}[];
 recent:readonly StableStoryFact[];
}):StableFollowThrough[]{
 if(input.recent.length>100||input.stables.length>100)
  throw new Error("Stable story history exceeds bounded window");
 const ordered=[...input.recent].sort((a,b)=>
  b.weekIndex-a.weekIndex||b.slotId.localeCompare(a.slotId));
 const stables=new Map(input.stables.map(s=>[s.stableId,s]));
 const roster=new Map(input.roster.map(p=>[p.personId,p.name]));
 const prior=new Set<string>(),result:StableFollowThrough[]=[];
 for(const event of ordered){
  if(!event.story||typeof event.story!=="object"||Array.isArray(event.story))continue;
  const p=event.story as Record<string,unknown>;
  if(typeof p.stableId!=="string"||!stables.has(p.stableId))continue;
  const who=event.kind==="STABLE_EXIT"?
   (Array.isArray(p.targetIds)&&p.targetIds.length?p.targetIds[0]:
    Array.isArray(p.actorIds)?p.actorIds[0]:null):
   Array.isArray(p.targetIds)?p.targetIds[0]:null;
  if(typeof who!=="string"||!who)continue;
  const key=JSON.stringify([p.stableId,who]);
  if(prior.has(key))continue;
  prior.add(key);
  // REFUSED and INTERRUPTED cancel older pending tasks for this person/faction.
  if(event.outcome!=="HAPPENS")continue;
  const action=event.kind==="STABLE_EXIT"?"REMOVE":
   event.kind==="STABLE_INVITATION"||event.kind==="STABLE_RECONCILIATION"?"ADD":null;
  if(!action)continue;
  const stable=stables.get(p.stableId)!;
  const isMember=stable.members.includes(who);
  if(action==="ADD"&&isMember||action==="REMOVE"&&!isMember)continue;
  const other=input.stables.some(s=>s.status==="ACTIVE"&&s.stableId!==p.stableId&&
   s.members.includes(who));
  const status:StableFollowThrough["status"]=stable.status!=="ACTIVE"?"STABLE_INACTIVE":
   action==="ADD"&&!roster.has(who)?"NOT_ON_ROSTER":
   action==="ADD"&&other?"OTHER_STABLE":
   action==="ADD"&&stable.members.length>=12?"STABLE_FULL":"READY";
  result.push({showId:event.showId,slotId:event.slotId,
   stableId:p.stableId,stableName:stable.name,personId:who,
   personName:roster.get(who)??who,weekIndex:event.weekIndex,
   action,status});
 }
 return result;
}
