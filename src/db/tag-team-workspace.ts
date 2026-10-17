/** Manual two-person tag teams adapted from original PPW's portable
 * World team identities. A pair is created once across the World, not copied
 * per promotion; membership is scripted, never guessed by simulation.
 */
import {randomUUID} from "node:crypto";
import {withSqlClient} from "./postgres.js";
import {applyWorldCommand} from "./world-commands.js";
import type {TransactionPool} from "./transaction.js";
import type {SqlRows} from "./world-operations.js";
type Scope={worldId:string;promotionId:string;playerId:string};
export type CreateTagTeam=Scope&{requestId:string;expectedRevision:number;
 name:string;personIds:readonly string[]};
const id=(x:unknown)=>typeof x==="string"&&x.length>0&&x.length<=200;
async function scope(tx:SqlRows,who:Scope){
 if(![who.worldId,who.promotionId,who.playerId].every(id))
  throw new Error("Invalid team workspace");
 const rows=await tx.query<{year:number;week:number;revision:string|number;can_edit:boolean}>([
  "SELECT w.year,w.week,w.revision,",
  "(w.phase='OPEN' AND w.next_lock_at>clock_timestamp()) AS can_edit",
  "FROM ppw_worlds w JOIN ppw_promotion_controls c",
  "ON c.world_id=w.world_id AND c.player_id=$2 AND c.promotion_id=$3 AND c.active",
  "JOIN ppw_memberships m ON m.world_id=c.world_id",
  "AND m.player_id=c.player_id AND m.status='ACTIVE'",
  "JOIN ppw_promotions p ON p.world_id=c.world_id",
  "AND p.promotion_id=c.promotion_id AND p.lifecycle='ACTIVE'",
  "WHERE w.world_id=$1"
 ].join(" "),[who.worldId,who.playerId,who.promotionId]);
 if(rows.length!==1)throw new Error("Tag team access denied");
 return {...rows[0]!,weekIndex:(rows[0]!.year-1)*52+rows[0]!.week-1};
}
export async function readTagTeamWorkspace(pool:TransactionPool,who:Scope){
 return withSqlClient(pool,async tx=>{
  const auth=await scope(tx,who);
  const roster=await tx.query<{person_id:string;name:string}>([
   "SELECT DISTINCT p.person_id,p.name FROM ppw_people p",
   "JOIN ppw_contracts c ON c.world_id=p.world_id AND c.person_id=p.person_id",
   "WHERE p.world_id=$1 AND c.promotion_id=$2 AND p.status='ACTIVE'",
   "AND c.status='SIGNED' AND c.start_week_index<=$3",
   "AND c.expires_week_index>=$3",
   "ORDER BY p.name,p.person_id LIMIT 501"
  ].join(" "),[who.worldId,who.promotionId,auth.weekIndex]);
  if(roster.length>500)throw new Error("Tag team roster too large");
  const teams=roster.length?await tx.query<{team_id:string;name:string;
   members:string[]}>([
   "SELECT t.team_id,t.name,array_agg(m.person_id ORDER BY m.person_id) AS members",
   "FROM ppw_tag_teams t JOIN ppw_tag_team_members m",
   "ON m.world_id=t.world_id AND m.team_id=t.team_id AND m.active",
   "WHERE t.world_id=$1 AND t.status='ACTIVE' AND m.person_id=ANY($2::text[])",
   "GROUP BY t.team_id,t.name HAVING count(*)=2",
   "ORDER BY t.name,t.team_id LIMIT 201"
  ].join(" "),[who.worldId,roster.map(x=>x.person_id)]):[];
  if(teams.length>200)throw new Error("Too many active roster teams");
  const names=new Map(roster.map(x=>[x.person_id,x.name]));
  return {year:auth.year,week:auth.week,worldRevision:Number(auth.revision),
   canEdit:auth.can_edit,
   roster:roster.map(x=>({personId:x.person_id,name:x.name})),
   teams:teams.map(x=>({teamId:x.team_id,name:x.name,
    members:x.members.map(personId=>({personId,name:names.get(personId)??personId}))}))};
 });
}
export async function createTagTeam(pool:TransactionPool,input:CreateTagTeam){
 const name=input.name?.trim();
 if(typeof name!=="string"||name.length<2||name.length>70)
  throw new Error("Team name must contain 2–70 characters");
 if(!Array.isArray(input.personIds)||input.personIds.length!==2||
  !input.personIds.every(id)||new Set(input.personIds).size!==2)
  throw new Error("Choose two different wrestlers");
 const ids=[...input.personIds].sort();
 return applyWorldCommand(pool,{
  worldId:input.worldId,playerId:input.playerId,requestId:input.requestId,
  expectedRevision:input.expectedRevision,commandType:"CREATE_TAG_TEAM",
  requiresOpenWeek:true,execute:async tx=>{
   const auth=await scope(tx,input);
   if(!auth.can_edit)throw new Error("Team creation closed for World Lock");
   const members=await tx.query<{person_id:string}>([
    "SELECT p.person_id FROM ppw_people p WHERE p.world_id=$1",
    "AND p.person_id=ANY($3::text[]) AND p.status='ACTIVE'",
    "AND EXISTS(SELECT 1 FROM ppw_contracts c WHERE c.world_id=p.world_id",
    "AND c.person_id=p.person_id AND c.promotion_id=$2 AND c.status='SIGNED'",
    "AND c.start_week_index<=$4 AND c.expires_week_index>=$4)"
   ].join(" "),[input.worldId,input.promotionId,ids,auth.weekIndex]);
   if(members.length!==2)throw new Error("Both team partners must be on your active roster");
   // A pair must have only one active World identity, or the verified tag
   // championship settlement could not select a unique team.
   const existing=await tx.query<{team_id:string}>([
    "SELECT t.team_id FROM ppw_tag_teams t JOIN ppw_tag_team_members m",
    "ON m.world_id=t.world_id AND m.team_id=t.team_id AND m.active",
    "WHERE t.world_id=$1 AND t.status='ACTIVE'",
    "AND m.person_id=ANY($2::text[]) GROUP BY t.team_id",
    "HAVING count(*)=2 AND",
    "(SELECT count(*) FROM ppw_tag_team_members allm WHERE",
    "allm.world_id=t.world_id AND allm.team_id=t.team_id AND allm.active)=2",
    "LIMIT 1"
   ].join(" "),[input.worldId,ids]);
   if(existing.length)throw new Error("This pairing already has an active World tag team");
   const teamId="tag-"+randomUUID();
   await tx.query(`INSERT INTO ppw_tag_teams(world_id,team_id,name,status)
    VALUES($1,$2,$3,'ACTIVE')`,[input.worldId,teamId,name]);
   const inserted=await tx.query<{person_id:string}>(`
    INSERT INTO ppw_tag_team_members(world_id,team_id,person_id)
    SELECT $1,$2,unnest($3::text[]) RETURNING person_id`,
    [input.worldId,teamId,ids]);
   if(inserted.length!==2)throw new Error("Tag partners not recorded");
   await tx.query(`
    INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)
    VALUES($1,$2,$3,'TAG_TEAM_CREATED',
      jsonb_build_object('teamId',$4::text,'promotionId',$5::text,
       'memberIds',$6::text[]))`,
    [input.worldId,auth.year,auth.week,teamId,input.promotionId,ids]);
   return {teamId,name,personIds:ids};
  }
 });
}
