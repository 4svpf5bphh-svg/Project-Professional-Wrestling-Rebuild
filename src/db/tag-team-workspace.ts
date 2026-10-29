/** Manual two-person tag teams adapted from original PPW's portable
 * World team identities. A pair is created once across the World, not copied
 * per promotion; membership is scripted, never guessed by simulation.
 */
import {randomUUID} from "node:crypto";
import {withSqlClient} from "./postgres.js";
import {applyWorldCommand} from "./world-commands.js";
import type {TransactionPool} from "./transaction.js";
import type {SqlRows} from "./world-operations.js";
import {originalPersonaBaseline} from "../domain/portable-persona.js";
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
  const roster=await tx.query<{person_id:string;name:string;booking_division:string;
    popularity:number|null;recognition:number|null;momentum:number|null;
    in_ring_quality:number|null;match_craft:number|null;presentation:number|null;
    default_alignment:string|null;portable_gimmick_id:string|null}>([
   "SELECT DISTINCT p.person_id,p.name,p.booking_division,p.popularity,p.recognition,",
    "p.momentum,p.in_ring_quality,p.match_craft,p.presentation,",
    "p.default_alignment,p.portable_gimmick_id FROM ppw_people p",
   "JOIN ppw_contracts c ON c.world_id=p.world_id AND c.person_id=p.person_id",
   "WHERE p.world_id=$1 AND c.promotion_id=$2 AND p.status='ACTIVE'",
   "AND c.status='SIGNED' AND c.start_week_index<=$3",
   "AND c.expires_week_index>=$3",
   "ORDER BY p.name,p.person_id,p.booking_division LIMIT 501"
  ].join(" "),[who.worldId,who.promotionId,auth.weekIndex]);
  if(roster.length>500)throw new Error("Tag team roster too large");
  const teams=roster.length?await tx.query<{team_id:string;name:string;
   members:string[];naming_promotion_id:string|null;
   formed_week_index:number|null}>([
   "SELECT t.team_id,t.name,t.naming_promotion_id,t.formed_week_index,",
   "array_agg(m.person_id ORDER BY m.person_id) AS members",
   "FROM ppw_tag_teams t JOIN ppw_tag_team_members m",
   "ON m.world_id=t.world_id AND m.team_id=t.team_id AND m.active",
   "WHERE t.world_id=$1 AND t.status='ACTIVE' AND m.person_id=ANY($2::text[])",
   "GROUP BY t.team_id,t.name,t.naming_promotion_id,t.formed_week_index",
   "HAVING count(*)=2",
   "ORDER BY t.name,t.team_id LIMIT 201"
  ].join(" "),[who.worldId,roster.map(x=>x.person_id)]):[];
  if(teams.length>200)throw new Error("Too many active roster teams");
  // An official trio requires all three partners on the current signed roster.
  // Do not present partial groups from another promotion as bookable.
  const trios=roster.length?await tx.query<{trio_id:string;name:string;
   formed_week_index:number;naming_promotion_id:string|null;members:string[]}>([
   "SELECT t.trio_id,t.name,t.formed_week_index,t.naming_promotion_id,",
   "array_agg(m.person_id ORDER BY m.person_id) AS members",
   "FROM ppw_trios t JOIN ppw_trio_members m",
   "ON m.world_id=t.world_id AND m.trio_id=t.trio_id AND m.active",
   "WHERE t.world_id=$1 AND t.status='ACTIVE' AND m.person_id=ANY($2::text[])",
   "GROUP BY t.trio_id,t.name,t.formed_week_index,t.naming_promotion_id",
   "HAVING count(*)=3 AND count(*)=(SELECT count(*) FROM ppw_trio_members",
   "other WHERE other.world_id=t.world_id AND other.trio_id=t.trio_id",
   "AND other.active) ORDER BY t.name,t.trio_id LIMIT 101"
  ].join(" "),[who.worldId,roster.map(x=>x.person_id)]):[];
  if(trios.length>100)throw new Error("Too many active roster trios");
  // History is restricted to named teams on this promotion's CURRENT roster.
  const chemistry=teams.length?await tx.query<{
   person_a_id:string;person_b_id:string;matches_together:number;familiarity:number
  }>([
   "SELECT person_a_id,person_b_id,matches_together,familiarity",
   "FROM ppw_working_chemistry WHERE world_id=$1 AND context='TAG'",
   "AND (person_a_id,person_b_id) IN (",
   "SELECT LEAST(a.person_id,b.person_id),GREATEST(a.person_id,b.person_id)",
   "FROM ppw_tag_team_members a JOIN ppw_tag_team_members b",
   "ON b.world_id=a.world_id AND b.team_id=a.team_id AND b.active",
   "AND b.person_id<>a.person_id",
   "WHERE a.world_id=$1 AND a.active AND a.team_id=ANY($2::text[]))",
   "LIMIT 201"
  ].join(" "),[who.worldId,teams.map(x=>x.team_id)]):[];
  if(chemistry.length>200)throw new Error("Team chemistry limit reached");
  const reigns=teams.length?await tx.query<{
   team_id:string;championship_id:string;championship_name:string;
   promotion_name:string;defenses:number;is_current:boolean
  }>([
   "SELECT r.team_id,c.championship_id,c.name AS championship_name,",
   "p.name AS promotion_name,r.defenses,",
   "(r.status='ACTIVE' AND c.current_reign_id=r.reign_id) AS is_current",
   "FROM ppw_championship_reigns r JOIN ppw_championships c",
   "ON c.world_id=r.world_id AND c.promotion_id=r.promotion_id",
   "AND c.championship_id=r.championship_id",
   "JOIN ppw_promotions p ON p.world_id=c.world_id AND p.promotion_id=c.promotion_id",
   "WHERE r.world_id=$1 AND r.team_id=ANY($2::text[])",
   "ORDER BY r.start_week_index DESC,r.reign_id DESC LIMIT 201"
  ].join(" "),[who.worldId,teams.map(x=>x.team_id)]):[];
  if(reigns.length>200)throw new Error("Team title history limit reached");
  const byName=new Map(roster.map(x=>[x.person_id,x]));
  const byPair=new Map(chemistry.map(x=>[x.person_a_id+"|"+x.person_b_id,x]));
  const band=(n:number)=>n===0?"UNTESTED":n<3?"NEW":n<8?"DEVELOPING":
   n<16?"ESTABLISHED":"VETERAN";
  return {year:auth.year,week:auth.week,worldRevision:Number(auth.revision),
   canEdit:auth.can_edit,
   roster:roster.map(x=>{
    const persona=originalPersonaBaseline(x.name,x.portable_gimmick_id);
    return {personId:x.person_id,name:x.name,division:x.booking_division,
     ringName:persona.personaName,gimmickId:persona.gimmickId,
     primaryStyle:persona.primaryStyle,alignment:x.default_alignment,
     popularity:x.popularity,recognition:x.recognition,momentum:x.momentum,
     inRingQuality:x.in_ring_quality,matchCraft:x.match_craft,
     presentation:x.presentation};
   }),
   trios:trios.map(t=>({
    trioId:t.trio_id,name:t.name,formedWeekIndex:t.formed_week_index,
    canRename:t.naming_promotion_id===null||t.naming_promotion_id===who.promotionId,
    members:t.members.map(personId=>({personId,
     name:byName.get(personId)?.name??personId,
     division:byName.get(personId)?.booking_division??"UNKNOWN"}))
   })),
   teams:teams.map(x=>{
    const pair=byPair.get(x.members[0]+"|"+x.members[1]);
    const matchesTogether=pair?.matches_together??0;
    const titles=reigns.filter(r=>r.team_id===x.team_id);
    return {teamId:x.team_id,name:x.name,formedWeekIndex:x.formed_week_index,
     canRename:x.naming_promotion_id===null||
      x.naming_promotion_id===who.promotionId,
     members:x.members.map(personId=>({personId,
      name:byName.get(personId)?.name??personId,
      division:byName.get(personId)?.booking_division??"UNKNOWN"})),
     matchesTogether,familiarity:Number(pair?.familiarity??0),
     experience:matchesTogether===0&&Number(pair?.familiarity??0)>=70?
      "ESTABLISHED":band(matchesTogether),
     historicalPartnership:matchesTogether===0&&Number(pair?.familiarity??0)>=70,
     currentTitles:titles.filter(t=>t.is_current).map(t=>({
      championshipId:t.championship_id,name:t.championship_name,
      promotionName:t.promotion_name,defenses:t.defenses})),
     totalTitleReigns:titles.length,
     totalTitleDefenses:titles.reduce((sum,t)=>sum+t.defenses,0)};
   })};
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
   const members=await tx.query<{person_id:string;booking_division:string|null}>([
    "SELECT p.person_id,p.booking_division FROM ppw_people p WHERE p.world_id=$1",
    "AND p.person_id=ANY($3::text[]) AND p.status='ACTIVE'",
    "AND EXISTS(SELECT 1 FROM ppw_contracts c WHERE c.world_id=p.world_id",
    "AND c.person_id=p.person_id AND c.promotion_id=$2 AND c.status='SIGNED'",
    "AND c.start_week_index<=$4 AND c.expires_week_index>=$4)"
   ].join(" "),[input.worldId,input.promotionId,ids,auth.weekIndex]);
   if(members.length!==2)throw new Error("Both team partners must be on your active roster");
   if(!members[0]!.booking_division||
    members[0]!.booking_division!==members[1]!.booking_division)
    throw new Error("Tag partners must belong to the same division");
   // A pair must have only one active World identity, or the verified tag
   // championship settlement could not select a unique team.
   const existing=await tx.query<{team_id:string}>([
    "SELECT t.team_id FROM ppw_tag_teams t JOIN ppw_tag_team_members m",
    "ON m.world_id=t.world_id AND m.team_id=t.team_id AND m.active",
    "WHERE t.world_id=$1 AND t.status='ACTIVE'",
    "AND m.person_id=ANY($2::text[]) GROUP BY t.team_id",
    "HAVING count(*)=2 AND",
    "(SELECT count(*) FROM ppw_tag_team_members allm WHERE",
    "allm.world_id=$1 AND allm.team_id=t.team_id AND allm.active)=2",
    "LIMIT 1"
   ].join(" "),[input.worldId,ids]);
   if(existing.length)throw new Error("This pairing already has an active World tag team");
   const teamId="tag-"+randomUUID();
   await tx.query(`INSERT INTO ppw_tag_teams(world_id,team_id,name,status,
    naming_promotion_id,formed_week_index)
    VALUES($1,$2,$3,'ACTIVE',$4,$5)`,
    [input.worldId,teamId,name,input.promotionId,auth.weekIndex]);
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

/** The original manually named/organic team is a portable World identity.
 * The first eligible promotion to name an unnamed organic pair receives
 * naming authority; another promotion cannot overwrite that name.
 */
export type NameTagTeam=Scope&{requestId:string;expectedRevision:number;
 teamId:string;name:string};
export async function nameTagTeam(pool:TransactionPool,input:NameTagTeam){
 const name=input.name?.trim();
 if(typeof name!=="string"||name.length<2||name.length>70||!id(input.teamId))
  throw new Error("Invalid team naming request");
 return applyWorldCommand(pool,{worldId:input.worldId,playerId:input.playerId,
  requestId:input.requestId,expectedRevision:input.expectedRevision,
  commandType:"NAME_TAG_TEAM",requiresOpenWeek:true,execute:async tx=>{
   const auth=await scope(tx,input);
   if(!auth.can_edit)throw new Error("Team naming closed for World Lock");
   const existing=await tx.query<{team_id:string;naming_promotion_id:string|null;
    person_ids:string[]}>([
    "SELECT t.team_id,t.naming_promotion_id,",
    "array_agg(m.person_id ORDER BY m.person_id) AS person_ids",
    "FROM ppw_tag_teams t JOIN ppw_tag_team_members m",
    "ON m.world_id=t.world_id AND m.team_id=t.team_id AND m.active",
    "WHERE t.world_id=$1 AND t.team_id=$2 AND t.status='ACTIVE'",
    "GROUP BY t.team_id,t.naming_promotion_id"
   ].join(" "),[input.worldId,input.teamId]);
   const team=existing[0];
   if(existing.length!==1||team.person_ids.length!==2||
    (team.naming_promotion_id!==null&&team.naming_promotion_id!==input.promotionId))
    throw new Error("Your promotion cannot rename this World tag team");
   const entitled=await tx.query<{person_id:string}>([
    "SELECT p.person_id FROM ppw_people p WHERE p.world_id=$1",
    "AND p.person_id=ANY($3::text[]) AND p.status='ACTIVE'",
    "AND EXISTS(SELECT 1 FROM ppw_contracts c WHERE c.world_id=p.world_id",
    "AND c.person_id=p.person_id AND c.promotion_id=$2 AND c.status='SIGNED'",
    "AND c.start_week_index<=$4 AND c.expires_week_index>=$4)"
   ].join(" "),[input.worldId,input.promotionId,team.person_ids,auth.weekIndex]);
   if(entitled.length!==2)
    throw new Error("Both partners must remain on your active roster");
   const changed=await tx.query<{team_id:string}>([
    "UPDATE ppw_tag_teams SET name=$3,naming_promotion_id=$4",
    "WHERE world_id=$1 AND team_id=$2 AND status='ACTIVE'",
    "AND (naming_promotion_id IS NULL OR naming_promotion_id=$4)",
    "RETURNING team_id"
   ].join(" "),[input.worldId,input.teamId,name,input.promotionId]);
   if(changed.length!==1)throw new Error("Tag team name was not saved");
   await tx.query(`INSERT INTO ppw_ledger_events(
    world_id,year,week,event_type,payload)
    VALUES($1,$2,$3,'TAG_TEAM_NAMED',
     jsonb_build_object('teamId',$4::text,'promotionId',$5::text,'name',$6::text))`,
    [input.worldId,auth.year,auth.week,input.teamId,input.promotionId,name]);
   return {teamId:input.teamId,name};
  }});
}

/** Trio identity is independent of a 2v2 tag team and a local faction.
 * The same three wrestlers may represent both, but neither grants a title
 * reign or any fabricated completed-match experience.
 */
export type CreateTrio=Scope&{requestId:string;expectedRevision:number;
 name:string;personIds:readonly string[]};
export async function createTrio(pool:TransactionPool,input:CreateTrio){
 const name=input.name?.trim();
 if(typeof name!=="string"||name.length<2||name.length>70)
  throw new Error("Trio name must contain 2–70 characters");
 if(!Array.isArray(input.personIds)||input.personIds.length!==3||
  !input.personIds.every(id)||new Set(input.personIds).size!==3)
  throw new Error("Choose three different wrestlers");
 const ids=[...input.personIds].sort();
 return applyWorldCommand(pool,{
  worldId:input.worldId,playerId:input.playerId,requestId:input.requestId,
  expectedRevision:input.expectedRevision,commandType:"CREATE_TRIO",
  requiresOpenWeek:true,execute:async tx=>{
   const auth=await scope(tx,input);
   if(!auth.can_edit)throw new Error("Trio creation closed for World Lock");
   const members=await tx.query<{person_id:string;booking_division:string|null}>([
    "SELECT p.person_id,p.booking_division FROM ppw_people p WHERE p.world_id=$1",
    "AND p.person_id=ANY($3::text[]) AND p.status='ACTIVE'",
    "AND EXISTS(SELECT 1 FROM ppw_contracts c WHERE c.world_id=p.world_id",
    "AND c.person_id=p.person_id AND c.promotion_id=$2 AND c.status='SIGNED'",
    "AND c.start_week_index<=$4 AND c.expires_week_index>=$4)"
   ].join(" "),[input.worldId,input.promotionId,ids,auth.weekIndex]);
   if(members.length!==3)throw new Error("All trio members must be on your active roster");
   if(!members[0]!.booking_division||members.some(m=>
    m.booking_division!==members[0]!.booking_division))
    throw new Error("Trio members must belong to the same division");
   const existing=await tx.query<{trio_id:string}>([
    "SELECT t.trio_id FROM ppw_trios t JOIN ppw_trio_members m",
    "ON m.world_id=t.world_id AND m.trio_id=t.trio_id AND m.active",
    "WHERE t.world_id=$1 AND t.status='ACTIVE' AND m.person_id=ANY($2::text[])",
    "GROUP BY t.trio_id HAVING count(*)=3 AND",
    "(SELECT count(*) FROM ppw_trio_members allm WHERE",
    "allm.world_id=$1 AND allm.trio_id=t.trio_id AND allm.active)=3 LIMIT 1"
   ].join(" "),[input.worldId,ids]);
   if(existing.length)throw new Error("This trio already has an active World identity");
   const trioId="trio-"+randomUUID();
   await tx.query(`INSERT INTO ppw_trios(
    world_id,trio_id,name,status,naming_promotion_id,formed_week_index)
    VALUES($1,$2,$3,'ACTIVE',$4,$5)`,
    [input.worldId,trioId,name,input.promotionId,auth.weekIndex]);
   const inserted=await tx.query<{person_id:string}>(`
    INSERT INTO ppw_trio_members(world_id,trio_id,person_id)
    SELECT $1,$2,unnest($3::text[]) RETURNING person_id`,
    [input.worldId,trioId,ids]);
   if(inserted.length!==3)throw new Error("Trio members not recorded");
   await tx.query(`
    INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)
    VALUES($1,$2,$3,'TRIO_CREATED',
     jsonb_build_object('trioId',$4::text,'promotionId',$5::text,
      'memberIds',$6::text[]))`,
    [input.worldId,auth.year,auth.week,trioId,input.promotionId,ids]);
   return {trioId,name,personIds:ids};
  }
 });
}
