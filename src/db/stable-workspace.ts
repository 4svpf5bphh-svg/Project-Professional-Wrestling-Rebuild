/** Original stable creation, membership, history and disbanding using bounded
 * promotion-scoped PostgreSQL. Never simulate an author's membership choice.
 */
import {randomUUID} from "node:crypto";
import {applyWorldCommand} from "./world-commands.js";
import {withSqlClient} from "./postgres.js";
import type {TransactionPool} from "./transaction.js";
import type {SqlRows} from "./world-operations.js";
import {stableStoryFollowThrough} from "../domain/stable-story-followthrough.js";
import {validateStableFounders,validateStableMemberId,STABLE_MAX_MEMBERS}
 from "../domain/stable-roster.js";
export type StableScope={worldId:string;promotionId:string;playerId:string};
export type StableCommand=StableScope&{requestId:string;expectedRevision:number};
export type CreateStableInput=StableCommand&{name:string;personIds:string[]};
export type ChangeStableInput=StableCommand&{stableId:string;personId:string};
export type DisbandStableInput=StableCommand&{stableId:string};
const valid=(v:unknown):v is string=>typeof v==="string"&&!!v.trim()&&v.length<=200;
async function controlledPromotion(tx:SqlRows,s:StableScope){
 if(![s.worldId,s.promotionId,s.playerId].every(valid))
  throw new Error("Invalid stable scope");
 const result=await tx.query<{year:number;week:number;booking_open:boolean;revision:string|number}>([
  "SELECT w.year,w.week,w.revision,",
  "(w.phase='OPEN' AND w.next_lock_at>clock_timestamp()) AS booking_open",
  "FROM ppw_worlds w JOIN ppw_promotion_controls c ON c.world_id=w.world_id",
  "JOIN ppw_memberships m ON m.world_id=c.world_id AND m.player_id=c.player_id",
  "JOIN ppw_promotions p ON p.world_id=c.world_id AND p.promotion_id=c.promotion_id",
  "WHERE w.world_id=$1 AND c.player_id=$2 AND c.promotion_id=$3",
  "AND c.active AND m.status='ACTIVE' AND p.lifecycle='ACTIVE'"
 ].join(" "),[s.worldId,s.playerId,s.promotionId]);
 if(result.length!==1)throw new Error("Stable promotion access denied");
 return {...result[0]!,weekIndex:(result[0]!.year-1)*52+result[0]!.week-1};
}
async function requireSignedRoster(tx:SqlRows,s:StableScope,ids:readonly string[],week:number){
 if(ids.length>STABLE_MAX_MEMBERS)throw new Error("Stable member limit exceeded");
 const rows=await tx.query<{person_id:string}>([
  "SELECT p.person_id FROM ppw_people p",
  "WHERE p.world_id=$1 AND p.person_id=ANY($3::text[]) AND p.status='ACTIVE'",
  "AND EXISTS(SELECT 1 FROM ppw_contracts c WHERE c.world_id=p.world_id",
  "AND c.person_id=p.person_id AND c.promotion_id=$2 AND c.status='SIGNED'",
  "AND c.start_week_index<=$4 AND c.expires_week_index>=$4)"
 ].join(" "),[s.worldId,s.promotionId,ids,week]);
 if(rows.length!==ids.length)
  throw new Error("Stable members must be active wrestlers on your roster");
}
async function writeStableEvent(tx:SqlRows,s:StableScope,year:number,week:number,
 type:string,stableId:string,personIds:readonly string[]){
 await tx.query([
  "INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)",
  "VALUES($1,$2,$3,$4,jsonb_build_object('promotionId',$5::text,",
  "'stableId',$6::text,'memberIds',$7::text[]))"
 ].join(" "),[s.worldId,year,week,type,s.promotionId,stableId,personIds]);
}
export async function readStableWorkspace(pool:TransactionPool,s:StableScope){
 return withSqlClient(pool,async tx=>{
  const auth=await controlledPromotion(tx,s);
  const stables=await tx.query<{stable_id:string;name:string;status:string;
   formed_week_index:number;disbanded_week_index:number|null}>([
   "SELECT stable_id,name,status,formed_week_index,disbanded_week_index",
   "FROM ppw_stables WHERE world_id=$1 AND promotion_id=$2",
   "ORDER BY CASE WHEN status='ACTIVE' THEN 0 ELSE 1 END,name,stable_id LIMIT 101"
  ].join(" "),[s.worldId,s.promotionId]);
  if(stables.length>100)throw new Error("Stable workspace limit reached");
  const roster=await tx.query<{person_id:string;name:string}>([
   "SELECT DISTINCT p.person_id,p.name FROM ppw_people p",
   "JOIN ppw_contracts c ON c.world_id=p.world_id AND c.person_id=p.person_id",
   "WHERE p.world_id=$1 AND c.promotion_id=$2 AND p.status='ACTIVE'",
   "AND c.status='SIGNED' AND c.start_week_index<=$3",
   "AND c.expires_week_index>=$3 ORDER BY p.name,p.person_id LIMIT 501"
  ].join(" "),[s.worldId,s.promotionId,auth.weekIndex]);
  if(roster.length>500)throw new Error("Stable roster exceeds supported size");
  const members=stables.length?await tx.query<{
   stable_id:string;membership_id:string;person_id:string;name:string;
   joined_week_index:number;left_week_index:number|null;active:boolean}>([
   "SELECT m.stable_id,m.membership_id,m.person_id,p.name,",
   "m.joined_week_index,m.left_week_index,m.active",
   "FROM ppw_stable_memberships m JOIN ppw_people p",
   "ON p.world_id=m.world_id AND p.person_id=m.person_id",
   "WHERE m.world_id=$1 AND m.promotion_id=$2",
   "AND m.stable_id=ANY($3::text[])",
   "ORDER BY m.stable_id,m.joined_week_index DESC,m.membership_id LIMIT 1201"
  ].join(" "),[s.worldId,s.promotionId,stables.map(x=>x.stable_id)]):[];
  if(members.length>1200)throw new Error("Stable membership history is too large");
  const stories=stables.length?await tx.query<{
   show_id:string;slot_id:string;kind:string;authored_outcome:string;
   week_index:number;story_json:unknown}>([
   "SELECT c.show_id,s.slot_id,s.kind,s.authored_outcome,",
   "(c.year-1)*52+c.week-1 AS week_index,s.story_json",
   "FROM ppw_completed_show_segments s JOIN ppw_completed_shows c",
   "ON c.world_id=s.world_id AND c.show_id=s.show_id",
   "WHERE c.world_id=$1 AND c.promotion_id=$2",
   "AND (c.year-1)*52+c.week-1 BETWEEN $3 AND $4",
   "AND s.kind IN('STABLE_INVITATION','STABLE_EXIT','STABLE_RECONCILIATION')",
   "ORDER BY c.year DESC,c.week DESC,s.position DESC,s.slot_id DESC LIMIT 101"
  ].join(" "),[s.worldId,s.promotionId,Math.max(0,auth.weekIndex-6),
   auth.weekIndex]):[];
  if(stories.length>100)throw new Error("Too many recent stable story events");
  const assigned=new Map(members.filter(m=>m.active).map(m=>[m.person_id,m.stable_id]));
  const storyFollowThrough=stableStoryFollowThrough({
   stables:stables.map(st=>({stableId:st.stable_id,name:st.name,status:st.status,
    members:members.filter(x=>x.stable_id===st.stable_id&&x.active).map(x=>x.person_id)})),
   roster:roster.map(p=>({personId:p.person_id,name:p.name})),
   recent:stories.map(x=>({showId:x.show_id,slotId:x.slot_id,
    weekIndex:x.week_index,kind:x.kind,outcome:x.authored_outcome,
    story:x.story_json}))
  });
  return {storyFollowThrough,year:auth.year,week:auth.week,worldRevision:Number(auth.revision),
   canEdit:auth.booking_open,
   roster:roster.map(p=>({personId:p.person_id,name:p.name,
    stableId:assigned.get(p.person_id)??null})),
   stables:stables.map(st=>({
    stableId:st.stable_id,name:st.name,status:st.status,
    formedWeekIndex:st.formed_week_index,disbandedWeekIndex:st.disbanded_week_index,
    currentMembers:members.filter(m=>m.stable_id===st.stable_id&&m.active)
     .map(m=>({personId:m.person_id,name:m.name,joinedWeekIndex:m.joined_week_index})),
    memberHistory:members.filter(m=>m.stable_id===st.stable_id)
     .map(m=>({personId:m.person_id,name:m.name,joinedWeekIndex:m.joined_week_index,
      leftWeekIndex:m.left_week_index,active:m.active}))
   }))};
 });
}
export async function createStable(pool:TransactionPool,input:CreateStableInput){
 const {name,personIds}=validateStableFounders(input.name,input.personIds);
 return applyWorldCommand(pool,{worldId:input.worldId,playerId:input.playerId,
  requestId:input.requestId,expectedRevision:input.expectedRevision,
  commandType:"CREATE_STABLE",requiresOpenWeek:true,execute:async tx=>{
   const auth=await controlledPromotion(tx,input);
   if(!auth.booking_open)throw new Error("Stable changes closed");
   await requireSignedRoster(tx,input,personIds,auth.weekIndex);
   const stableId="stable-"+randomUUID();
   const inserted=await tx.query<{stable_id:string}>([
    "INSERT INTO ppw_stables(world_id,promotion_id,stable_id,name,status,formed_week_index)",
    "VALUES($1,$2,$3,$4,'ACTIVE',$5) RETURNING stable_id"
   ].join(" "),[input.worldId,input.promotionId,stableId,name,auth.weekIndex]);
   if(inserted.length!==1)throw new Error("Stable was not created");
   const members=await tx.query<{person_id:string}>([
    "INSERT INTO ppw_stable_memberships(",
    "world_id,promotion_id,stable_id,membership_id,person_id,joined_week_index)",
    "SELECT $1,$2,$3,x.membership_id,x.person_id,$4 FROM",
    "jsonb_to_recordset($5::jsonb) AS x(membership_id text,person_id text)",
    "RETURNING person_id"
   ].join(" "),[input.worldId,input.promotionId,stableId,auth.weekIndex,
    JSON.stringify(personIds.map(person_id=>({
     person_id,membership_id:"member-"+randomUUID()})))]);
   if(members.length!==personIds.length)throw new Error("Incomplete stable founders");
   await writeStableEvent(tx,input,auth.year,auth.week,"STABLE_FORMED",stableId,personIds);
   return {stableId,name,status:"ACTIVE" as const,memberCount:personIds.length};
  }});
}
async function lockedStable(tx:SqlRows,s:StableScope,stableId:string){
 if(!valid(stableId))throw new Error("Invalid stable identity");
 const row=await tx.query<{stable_id:string;status:string;count:number}>([
  "SELECT s.stable_id,s.status,",
  "(SELECT count(*)::integer FROM ppw_stable_memberships m",
  "WHERE m.world_id=s.world_id AND m.promotion_id=s.promotion_id",
  "AND m.stable_id=s.stable_id AND m.active) AS count",
  "FROM ppw_stables s WHERE s.world_id=$1 AND s.promotion_id=$2",
  "AND s.stable_id=$3 FOR UPDATE"
 ].join(" "),[s.worldId,s.promotionId,stableId]);
 if(row.length!==1||row[0]!.status!=="ACTIVE")
  throw new Error("Stable is not active in your promotion");
 return row[0]!;
}
export async function addStableMember(pool:TransactionPool,input:ChangeStableInput){
 const personId=validateStableMemberId(input.personId);
 return applyWorldCommand(pool,{worldId:input.worldId,playerId:input.playerId,
  requestId:input.requestId,expectedRevision:input.expectedRevision,
  commandType:"ADD_STABLE_MEMBER",requiresOpenWeek:true,execute:async tx=>{
   const auth=await controlledPromotion(tx,input);
   if(!auth.booking_open)throw new Error("Stable changes closed");
   const stable=await lockedStable(tx,input,input.stableId);
   if(stable.count>=STABLE_MAX_MEMBERS)throw new Error("Stable has 12 members");
   await requireSignedRoster(tx,input,[personId],auth.weekIndex);
   const memberId="member-"+randomUUID();
   await tx.query([
    "INSERT INTO ppw_stable_memberships(world_id,promotion_id,stable_id,",
    "membership_id,person_id,joined_week_index) VALUES($1,$2,$3,$4,$5,$6)"
   ].join(" "),[input.worldId,input.promotionId,input.stableId,
    memberId,personId,auth.weekIndex]);
   await writeStableEvent(tx,input,auth.year,auth.week,
    "STABLE_MEMBER_JOINED",input.stableId,[personId]);
   return {stableId:input.stableId,personId,active:true};
  }});
}
export async function removeStableMember(pool:TransactionPool,input:ChangeStableInput){
 const personId=validateStableMemberId(input.personId);
 return applyWorldCommand(pool,{worldId:input.worldId,playerId:input.playerId,
  requestId:input.requestId,expectedRevision:input.expectedRevision,
  commandType:"REMOVE_STABLE_MEMBER",requiresOpenWeek:true,execute:async tx=>{
   const auth=await controlledPromotion(tx,input);
   if(!auth.booking_open)throw new Error("Stable changes closed");
   await lockedStable(tx,input,input.stableId);
   const row=await tx.query<{membership_id:string}>([
    "UPDATE ppw_stable_memberships SET active=false,left_week_index=$5",
    "WHERE world_id=$1 AND promotion_id=$2 AND stable_id=$3",
    "AND person_id=$4 AND active RETURNING membership_id"
   ].join(" "),[input.worldId,input.promotionId,input.stableId,personId,auth.weekIndex]);
   if(row.length!==1)throw new Error("Wrestler is not an active stable member");
   await writeStableEvent(tx,input,auth.year,auth.week,
    "STABLE_MEMBER_LEFT",input.stableId,[personId]);
   return {stableId:input.stableId,personId,active:false};
  }});
}
export async function disbandStable(pool:TransactionPool,input:DisbandStableInput){
 return applyWorldCommand(pool,{worldId:input.worldId,playerId:input.playerId,
  requestId:input.requestId,expectedRevision:input.expectedRevision,
  commandType:"DISBAND_STABLE",requiresOpenWeek:true,execute:async tx=>{
   const auth=await controlledPromotion(tx,input);
   if(!auth.booking_open)throw new Error("Stable changes closed");
   await lockedStable(tx,input,input.stableId);
   const former=await tx.query<{person_id:string}>([
    "UPDATE ppw_stable_memberships SET active=false,left_week_index=$4",
    "WHERE world_id=$1 AND promotion_id=$2 AND stable_id=$3 AND active",
    "RETURNING person_id"
   ].join(" "),[input.worldId,input.promotionId,input.stableId,auth.weekIndex]);
   const updated=await tx.query<{stable_id:string}>([
    "UPDATE ppw_stables SET status='DISBANDED',disbanded_week_index=$4",
    "WHERE world_id=$1 AND promotion_id=$2 AND stable_id=$3",
    "AND status='ACTIVE' RETURNING stable_id"
   ].join(" "),[input.worldId,input.promotionId,input.stableId,auth.weekIndex]);
   if(updated.length!==1)throw new Error("Stable disbanding failed");
   await writeStableEvent(tx,input,auth.year,auth.week,
    "STABLE_DISBANDED",input.stableId,former.map(x=>x.person_id));
   return {stableId:input.stableId,status:"DISBANDED" as const,
    memberCount:former.length};
  }});
}

/** Load only on request while editing a faction angle, not on every card read. */
export async function readActiveStableChoices(pool:TransactionPool,s:StableScope){
 return withSqlClient(pool,async tx=>{
  await controlledPromotion(tx,s);
  const rows=await tx.query<{stable_id:string;name:string}>([
   "SELECT stable_id,name FROM ppw_stables WHERE world_id=$1",
   "AND promotion_id=$2 AND status='ACTIVE'",
   "ORDER BY name,stable_id LIMIT 101"
  ].join(" "),[s.worldId,s.promotionId]);
  if(rows.length>100)throw new Error("Too many active stables");
  return rows.map(x=>({stableId:x.stable_id,name:x.name}));
 });
}
