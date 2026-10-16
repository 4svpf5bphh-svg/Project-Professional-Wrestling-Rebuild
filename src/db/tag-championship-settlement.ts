/** A real 2v2 contest can transfer only to an ACTIVE canonical World team.
 * This is called after evidence-verified completed results, in that exact
 * World-locked transaction. No winners or team identities are guessed.
 */
import type {SqlRows} from "./world-operations.js";
import type {CompletedShowReceipt} from "../domain/completed-show-receipt.js";
export interface BookedTagTitle{
 slotId:string;championshipId:string;
 sides:readonly [{sideId:"A";personIds:readonly string[]},
                 {sideId:"B";personIds:readonly string[]}];
}
const sorted=(ids:readonly string[])=>[...ids].sort().join("\u0000");
export async function settleCanonicalTagTitleContests(
 tx:SqlRows,receipt:CompletedShowReceipt,bookings:readonly BookedTagTitle[],
):Promise<{contests:number;transfers:number}>{
 if(bookings.length>16||new Set(bookings.map(x=>x.championshipId)).size!==bookings.length)
  throw new Error("Duplicate tag title defenses on a show");
 const completed=new Map(receipt.matches.map(m=>[m.matchId,m]));
 const participants=[...new Set(bookings.flatMap(b=>b.sides.flatMap(x=>x.personIds)))];
 const matches=bookings.map(b=>{
  const bout=completed.get(b.slotId);
  if(!b.championshipId||!b.slotId||!bout||
    bout.actualWinnerSide!=="A"&&bout.actualWinnerSide!=="B"||
    b.sides.length!==2||b.sides[0]?.sideId!=="A"||
    b.sides[1]?.sideId!=="B"||
    b.sides.some(s=>s.personIds.length!==2)||
    new Set(b.sides.flatMap(x=>x.personIds)).size!==4)
   throw new Error("Invalid resolved tag title bout");
  return {booking:b,bout};
 });
 if(!matches.length)return {contests:0,transfers:0};
 const realTeams=await tx.query<{team_id:string;members:string[]}>(`
  SELECT t.team_id,array_agg(m.person_id ORDER BY m.person_id) AS members
  FROM ppw_tag_teams t
  JOIN ppw_tag_team_members m ON m.world_id=t.world_id
   AND m.team_id=t.team_id AND m.active
  WHERE t.world_id=$1 AND t.status='ACTIVE'
    AND m.person_id=ANY($2::text[])
  GROUP BY t.team_id
  HAVING count(*)=2
  ORDER BY t.team_id LIMIT 513`,[receipt.worldId,participants]);
 if(realTeams.length>512)throw new Error("Active team lookup exceeds bound");
 const byPeople=new Map<string,string[]>();
 for(const team of realTeams){
  const key=sorted(team.members);
  const matches=byPeople.get(key)??[];
  matches.push(team.team_id);byPeople.set(key,matches);
 }
 let transfers=0;
 for(const {booking,bout} of matches){
  const ids=booking.sides.map(s=>{
   const teamIds=byPeople.get(sorted(s.personIds))??[];
   if(teamIds.length!==1)throw new Error("Tag title participants must form one active World team");
   return teamIds[0]!;
  });
  if(ids[0]===ids[1])throw new Error("A tag team cannot challenge itself");
  const state=await tx.query<{division:string;reign_id:string|null;
    team_id:string|null;status:string|null;holder_type:string|null}>(`
   SELECT c.division,r.reign_id,r.team_id,r.status,r.holder_type
   FROM ppw_championships c
   LEFT JOIN ppw_championship_reigns r ON r.world_id=c.world_id
     AND r.promotion_id=c.promotion_id
     AND r.championship_id=c.championship_id
     AND r.reign_id=c.current_reign_id
   WHERE c.world_id=$1 AND c.promotion_id=$2
     AND c.championship_id=$3 AND c.status='ACTIVE'
   FOR UPDATE OF c`,[receipt.worldId,receipt.promotionId,booking.championshipId]);
  const current=state[0];
  if(state.length!==1||!current||current.division!=="TAG"||
    !current.reign_id||current.status!=="ACTIVE"||
    current.holder_type!=="TEAM"||!current.team_id||
    !ids.includes(current.team_id))
   throw new Error("Only the reigning active tag champions can defend");
  const winner=ids[bout.actualWinnerSide==="A"?0:1]!;
  const transfer=winner!==current.team_id&&
    ["CLEAN_PIN","FLASH_PIN","SUBMISSION"].includes(bout.actualFinish);
  if(transfer){
   const updated=await tx.query<{reign_id:string}>(`
    UPDATE ppw_championship_reigns SET status='ENDED',
      ended_week_index=$5
    WHERE world_id=$1 AND promotion_id=$2 AND championship_id=$3
      AND reign_id=$4 AND status='ACTIVE'
    RETURNING reign_id`,[receipt.worldId,receipt.promotionId,
     booking.championshipId,current.reign_id,(receipt.year-1)*52+receipt.week-1]);
   if(updated.length!==1)throw new Error("Tag title reign was already ended");
   const nextReign=receipt.showId+":"+booking.slotId+":tag-reign";
   await tx.query(`
    INSERT INTO ppw_championship_reigns(
     world_id,promotion_id,championship_id,reign_id,holder_type,
     team_id,status,start_week_index)
    VALUES($1,$2,$3,$4,'TEAM',$5,'ACTIVE',$6)`,
    [receipt.worldId,receipt.promotionId,booking.championshipId,
     nextReign,winner,(receipt.year-1)*52+receipt.week-1]);
   await tx.query(`
    UPDATE ppw_championships SET current_reign_id=$4
    WHERE world_id=$1 AND promotion_id=$2 AND championship_id=$3`,
    [receipt.worldId,receipt.promotionId,booking.championshipId,nextReign]);
   transfers++;
  }else if(winner===current.team_id){
   await tx.query(`
    UPDATE ppw_championship_reigns SET defenses=defenses+1
    WHERE world_id=$1 AND promotion_id=$2 AND championship_id=$3
      AND reign_id=$4`,[receipt.worldId,receipt.promotionId,
     booking.championshipId,current.reign_id]);
  }
  await tx.query(`
   INSERT INTO ppw_championship_contests(world_id,promotion_id,
    championship_id,show_id,slot_id,prior_reign_id,winner_team_id,title_changed)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
   [receipt.worldId,receipt.promotionId,booking.championshipId,
    receipt.showId,booking.slotId,current.reign_id,winner,transfer]);
 }
 await tx.query(`
  INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)
  VALUES($1,$2,$3,'TAG_TITLE_CONTESTS_SETTLED',
  jsonb_build_object('showId',$4::text,'contests',$5::integer,'transfers',$6::integer))`,
  [receipt.worldId,receipt.year,receipt.week,receipt.showId,matches.length,transfers]);
 return {contests:matches.length,transfers};
}
