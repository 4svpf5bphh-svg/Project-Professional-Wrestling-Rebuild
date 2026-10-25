/** The one certified-week World News publisher. Only immutable completed receipts,
 * genuine match ratings and completed angles are admissible evidence. No AI,
 * backstage conversations, contract desk, plans or rival private data is read.
 * Called within ADVANCE_RESOLVED_WORLD_WEEK's existing World transaction.
 */
import type {SqlRows} from "./world-operations.js";
import {readCardParticipants} from "../domain/card-participants.js";
import {readCanonicalMatchLayout} from "../domain/match-sides.js";
import {publishCertifiedWorldHeritage} from "./world-honours.js";

type Broadcast = {
 show_id:string;promotion_id:string;promotion_name:string;show_name:string;
 crowd_response:number|string;booking_class:string;
};
interface Bout extends Broadcast{
 slot_id:string;position:number;rating_stars:string|number|null;
 match_crowd:string|number;payload:unknown;
}
interface Angle extends Broadcast{
 slot_id:string;position:number;kind:string;authored_outcome:string;
 angle_crowd:string|number;story_json:unknown;
}
interface TitleChange extends Broadcast{slot_id:string;title_name:string;}
export interface WeeklyAward{
 kind:"MATCH"|"ANGLE";promotionId:string;promotionName:string;
 showId:string;showName:string;slotId:string;title:string;
 peopleNames:string[];personIds:string[];rating:number;ratingUnit:"STARS"|"CROWD";
}
export interface WorldNewsStory{
 key:string;desk:"OFFICIAL"|"DIRT";certainty:"CONFIRMED"|"SPECULATION";
 promotionId:string;promotionName:string;showId:string;title:string;
 summary:string;sourceKind:"MATCH"|"ANGLE"|"TITLE"|"EVENT"|"CROWD";
}
const significant=new Set(["TURN","ATTACK","POST_MATCH_ASSAULT","DEBUT",
 "STABLE_EXIT","STABLE_INVITATION","RESCUE","CONFRONTATION","CHALLENGE"]);
const impact=(k:string)=>{
 const index=["TURN","POST_MATCH_ASSAULT","ATTACK","DEBUT","STABLE_EXIT",
  "RESCUE","STABLE_INVITATION","CHALLENGE","CONFRONTATION"].indexOf(k);
 return index<0?99:index;
};
const name=(s:string)=>s.replaceAll("_"," ").toLowerCase().replace(/(^|\s)\S/g,x=>x.toUpperCase());
function participants(raw:unknown):string[]{
 try{return readCardParticipants(raw).map(x=>x.personId);}catch{return [];}
}
function storyPeople(raw:unknown):string[]{
 if(!raw||typeof raw!=="object"||Array.isArray(raw))return [];
 const x=raw as {actorIds?:unknown;targetIds?:unknown};
 const ids=[...(Array.isArray(x.actorIds)?x.actorIds:[]),
  ...(Array.isArray(x.targetIds)?x.targetIds:[])];
 return [...new Set(ids.filter((id):id is string=>
  typeof id==="string"&&id.length>0&&id.length<=200))].slice(0,12);
}
const byId=(a:{slot_id:string;show_id:string;promotion_id:string},
 b:{slot_id:string;show_id:string;promotion_id:string})=>
 a.promotion_id.localeCompare(b.promotion_id)||
 a.show_id.localeCompare(b.show_id)||a.slot_id.localeCompare(b.slot_id);
export function chooseWeeklyAwards(bouts:readonly Bout[],angles:readonly Angle[],
 names:ReadonlyMap<string,string>):WeeklyAward[]{
 const eligible=[...bouts].filter(x=>x.rating_stars!==null&&
  Number.isFinite(Number(x.rating_stars))&&Number(x.rating_stars)>=0&&
  Number(x.rating_stars)<=5&&participants(x.payload).length>=2);
 eligible.sort((a,b)=>Number(b.rating_stars)-Number(a.rating_stars)||
  Number(b.match_crowd)-Number(a.match_crowd)||byId(a,b));
 const results:WeeklyAward[]=[];
 const best=eligible[0];
 if(best){
  const ids=participants(best.payload);
  let sides:string[][]=[];
  try{
   sides=readCanonicalMatchLayout(best.payload).sides.map(s=>s.participants
    .map(x=>names.get(x.personId)??"Unknown wrestler"));
  }catch{sides=ids.map(id=>[names.get(id)??"Unknown wrestler"]);}
  results.push({kind:"MATCH",promotionId:best.promotion_id,
   promotionName:best.promotion_name,showId:best.show_id,
   showName:best.show_name,slotId:best.slot_id,
   title:sides.map(side=>side.join(" & ")).join(" vs "),
   peopleNames:ids.map(id=>names.get(id)??"Unknown wrestler"),personIds:ids.slice(0,8),
   rating:Number(best.rating_stars),ratingUnit:"STARS"});
 }
 const actual=angles.filter(a=>a.authored_outcome==="HAPPENS"&&
  Number.isFinite(Number(a.angle_crowd))&&a.story_json!==null);
 actual.sort((a,b)=>Number(b.angle_crowd)-Number(a.angle_crowd)||
  impact(a.kind)-impact(b.kind)||byId(a,b));
 const top=actual[0];
 if(top){
  const ids=storyPeople(top.story_json),roster=ids.map(id=>
   names.get(id)??"Unknown wrestler");
  results.push({kind:"ANGLE",promotionId:top.promotion_id,
   promotionName:top.promotion_name,showId:top.show_id,
   showName:top.show_name,slotId:top.slot_id,
   title:(roster.length?roster.slice(0,4).join(" · ")+" — ":"")+name(top.kind),
   peopleNames:roster,personIds:ids.slice(0,8),
   rating:Number(top.angle_crowd),ratingUnit:"CROWD"});
 }
 return results;
}
export function composeWorldNews(bouts:readonly Bout[],angles:readonly Angle[],
 shows:readonly Broadcast[],changes:readonly TitleChange[],
 names:ReadonlyMap<string,string>):WorldNewsStory[]{
 const official:WorldNewsStory[]=[],dirt:WorldNewsStory[]=[];
 const add=(desk:"OFFICIAL"|"DIRT",s:Broadcast,key:string,title:string,
  summary:string,sourceKind:WorldNewsStory["sourceKind"])=>{
  const item:WorldNewsStory={key,desk,certainty:desk==="OFFICIAL"?"CONFIRMED":"SPECULATION",
   promotionId:s.promotion_id,promotionName:s.promotion_name,showId:s.show_id,
   title:title.slice(0,240),summary:summary.slice(0,600),sourceKind};
  (desk==="OFFICIAL"?official:dirt).push(item);
 };
 for(const c of [...changes].sort((a,b)=>byId(a,b))){
  add("OFFICIAL",c,"title:"+c.show_id+":"+c.slot_id,
   c.title_name+" changes hands at "+c.show_name,
   "The title change was confirmed in the completed results.", "TITLE");
 }
 for(const a of [...angles].filter(x=>x.authored_outcome==="HAPPENS"&&
  significant.has(x.kind)).sort((a,b)=>{
   return impact(a.kind)-impact(b.kind)||
    Number(b.angle_crowd)-Number(a.angle_crowd)||byId(a,b);
  }).slice(0,5)){
  const cast=storyPeople(a.story_json).map(id=>names.get(id)).filter(
   (x):x is string=>!!x).slice(0,4);
  add("OFFICIAL",a,"angle:"+a.show_id+":"+a.slot_id,
   (cast.length?cast.join(" and ")+": ":"")+name(a.kind)+" at "+a.show_name,
   "The "+name(a.kind).toLowerCase()+" took place on the completed broadcast.", "ANGLE");
 }
 for(const b of [...bouts].filter(x=>x.rating_stars!==null&&
  Number(x.rating_stars)>=4).sort((a,b)=>Number(b.rating_stars)-
  Number(a.rating_stars)||byId(a,b)).slice(0,3)){
  const cast=participants(b.payload).map(id=>names.get(id)).filter(
   (x):x is string=>!!x).slice(0,4);
  add("OFFICIAL",b,"match:"+b.show_id+":"+b.slot_id,
   (cast.length?cast.join(" vs ")+" ":"")+"steals the show",
   "Awarded "+Number(b.rating_stars).toFixed(2)+" stars in the official match report at "+
    b.show_name+".","MATCH");
 }
 for(const s of shows.filter(s=>s.booking_class==="PREMIUM")
  .sort((a,b)=>Number(b.crowd_response)-Number(a.crowd_response)||
   a.show_id.localeCompare(b.show_id)).slice(0,2)){
  add("OFFICIAL",s,"event:"+s.show_id,s.show_name+" makes headlines",
   s.promotion_name+" presented a major completed event to a crowd response of "+
    Math.round(Number(s.crowd_response))+"/100.","EVENT");
 }
 // The rumour mill must be explicitly framed as public-result analysis,
 // NEVER as leaked information or a fabricated confidential conversation.
 const rough=shows.filter(s=>Number(s.crowd_response)<50).sort((a,b)=>
  Number(a.crowd_response)-Number(b.crowd_response)||
  a.show_id.localeCompare(b.show_id))[0];
 if(rough)add("DIRT",rough,"crowd:"+rough.show_id,
  "Questions for "+rough.promotion_name+" after a rough night",
  rough.show_name+" drew a "+Math.round(Number(rough.crowd_response))+
   "/100 crowd response. Is a creative shake-up coming? That's speculation, not a report from backstage. "+
   "The rumour mill has seen less smoke from a barbecue.","CROWD");
 const hot=angles.filter(a=>a.authored_outcome==="HAPPENS"&&
  ["TURN","ATTACK","POST_MATCH_ASSAULT","STABLE_EXIT"].includes(a.kind)&&
  Number(a.angle_crowd)>=75).sort((a,b)=>Number(b.angle_crowd)-
  Number(a.angle_crowd)||byId(a,b))[0];
 if(hot)add("DIRT",hot,"rumour:angle:"+hot.show_id+":"+hot.slot_id,
  "What follows "+name(hot.kind).toLowerCase()+" at "+hot.promotion_name+"?",
  "The completed "+hot.show_name+" broadcast featured a "+name(hot.kind).toLowerCase()+
   " with a "+Math.round(Number(hot.angle_crowd))+
   "/100 reaction. Talk of the next big programme is speculation; nobody has confirmed any plans. "+
   "But you can practically hear the fantasy bookers warming up.","ANGLE");
 return [...official.slice(0,8),...dirt.slice(0,2)];
}
export async function publishCertifiedWorldNews(tx:SqlRows,worldId:string,year:number,week:number){
 if(!worldId||worldId.length>200||!Number.isSafeInteger(year)||year<1||
  !Number.isSafeInteger(week)||week<1||week>52)throw new Error("Invalid World news week");
 const certified=await tx.query<{certified_promotions:number}>(`
  SELECT seal.certified_promotions FROM ppw_week_resolution_seals seal
  JOIN ppw_worlds w ON w.world_id=seal.world_id AND w.phase='RESOLVING'
   AND w.year=seal.year AND w.week=seal.week
  WHERE seal.world_id=$1 AND seal.year=$2 AND seal.week=$3`,[worldId,year,week]);
 if(certified.length!==1||certified[0]!.certified_promotions<1)
  throw new Error("World news cannot precede certification");
 const begun=await tx.query<{world_id:string}>(`
  INSERT INTO ppw_world_news_weeks(world_id,year,week)
  VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING world_id`,[worldId,year,week]);
 if(!begun.length)return {published:false,awards:0,stories:0};
 const shows=await tx.query<Broadcast>(`
  SELECT c.show_id,c.promotion_id,p.name AS promotion_name,
   COALESCE(d.show_name,CASE WHEN d.booking_class='PREMIUM'
    THEN 'Premium event' ELSE 'Weekly show' END) AS show_name,
   c.crowd_response,d.booking_class
  FROM ppw_completed_shows c
  JOIN ppw_booking_drafts d ON d.world_id=c.world_id AND d.draft_id=c.show_id
   AND d.promotion_id=c.promotion_id AND d.status='SUBMITTED'
  JOIN ppw_promotions p ON p.world_id=c.world_id AND p.promotion_id=c.promotion_id
  WHERE c.world_id=$1 AND c.year=$2 AND c.week=$3
  ORDER BY c.promotion_id,c.show_id LIMIT 257`,[worldId,year,week]);
 if(shows.length>256)throw new Error("World news show limit exceeded");
 const sources=new Map(shows.map(s=>[s.show_id,s]));
 const [matches,segments,changes]=await Promise.all([
  tx.query<{show_id:string;slot_id:string;position:number;
   rating_stars:string|number|null;match_crowd:string|number;payload:unknown}>(`
   SELECT m.show_id,m.match_id AS slot_id,m.position,
    f.rating_stars,m.crowd_response AS match_crowd,slot.payload
   FROM ppw_completed_shows c
   JOIN ppw_completed_show_matches m ON m.world_id=c.world_id AND m.show_id=c.show_id
   JOIN ppw_card_slots slot ON slot.world_id=m.world_id
    AND slot.draft_id=m.show_id AND slot.slot_id=m.match_id
   LEFT JOIN ppw_completed_match_report_facts f ON f.world_id=m.world_id
    AND f.show_id=m.show_id AND f.match_id=m.match_id
   WHERE c.world_id=$1 AND c.year=$2 AND c.week=$3
   ORDER BY m.show_id,m.position LIMIT 3001`,[worldId,year,week]),
  tx.query<{show_id:string;slot_id:string;position:number;kind:string;
   authored_outcome:string;angle_crowd:string|number;story_json:unknown}>(`
   SELECT a.show_id,a.slot_id,a.position,a.kind,a.authored_outcome,
    a.crowd_response AS angle_crowd,a.story_json
   FROM ppw_completed_shows c
   JOIN ppw_completed_show_segments a ON a.world_id=c.world_id AND a.show_id=c.show_id
   WHERE c.world_id=$1 AND c.year=$2 AND c.week=$3
   ORDER BY a.show_id,a.position LIMIT 3001`,[worldId,year,week]),
  tx.query<{show_id:string;slot_id:string;title_name:string}>(`
   SELECT x.show_id,x.slot_id,t.name AS title_name
   FROM ppw_completed_shows c
   JOIN ppw_championship_contests x ON x.world_id=c.world_id
    AND x.show_id=c.show_id AND x.promotion_id=c.promotion_id AND x.title_changed
   JOIN ppw_championships t ON t.world_id=x.world_id
    AND t.promotion_id=x.promotion_id AND t.championship_id=x.championship_id
   WHERE c.world_id=$1 AND c.year=$2 AND c.week=$3
   ORDER BY x.show_id,x.slot_id LIMIT 501`,[worldId,year,week])
 ]);
 if(matches.length>3000||segments.length>3000||changes.length>500)
  throw new Error("World news results exceed safe batch");
 const join=<T extends {show_id:string}>(rows:readonly T[]):(T&Broadcast)[]=>
  rows.flatMap(row=>{const show=sources.get(row.show_id);return show?[{...show,...row}]:[];});
 const bouts=join(matches),angles=join(segments),titles=join(changes);
 const ids=[...new Set([...bouts.flatMap(b=>participants(b.payload)),
  ...angles.flatMap(a=>storyPeople(a.story_json))])].slice(0,6000);
 const people=ids.length?await tx.query<{person_id:string;name:string}>(`
  SELECT person_id,name FROM ppw_people WHERE world_id=$1
  AND person_id=ANY($2::text[])`,[worldId,ids]):[];
 const names=new Map(people.map(p=>[p.person_id,p.name]));
 const awards=chooseWeeklyAwards(bouts,angles,names);
 const stories=composeWorldNews(bouts,angles,shows,titles,names);
 if(awards.length)await tx.query(`
  INSERT INTO ppw_world_news_awards(world_id,year,week,kind,
   promotion_id,promotion_name,show_id,show_name,slot_id,title,
   people_names,person_ids,rating,rating_unit)
  SELECT $1,$2,$3,x.kind,x.promotion_id,x.promotion_name,x.show_id,
   x.show_name,x.slot_id,x.title,x.people_names,x.person_ids,x.rating,x.rating_unit
  FROM jsonb_to_recordset($4::jsonb) AS x(kind text,promotion_id text,
   promotion_name text,show_id text,show_name text,slot_id text,title text,
   people_names text[],person_ids text[],rating numeric,rating_unit text)`,[
   worldId,year,week,JSON.stringify(awards.map(a=>({
    kind:a.kind,promotion_id:a.promotionId,promotion_name:a.promotionName,
    show_id:a.showId,show_name:a.showName,slot_id:a.slotId,title:a.title,
    people_names:a.peopleNames,person_ids:a.personIds,rating:a.rating,
    rating_unit:a.ratingUnit
   })))]);
 if(stories.length)await tx.query(`
  INSERT INTO ppw_world_news_items(world_id,year,week,story_key,desk,certainty,
   promotion_id,promotion_name,show_id,title,summary,source_kind)
  SELECT $1,$2,$3,x.story_key,x.desk,x.certainty,x.promotion_id,
   x.promotion_name,x.show_id,x.title,x.summary,x.source_kind
  FROM jsonb_to_recordset($4::jsonb) AS x(story_key text,desk text,certainty text,
   promotion_id text,promotion_name text,show_id text,title text,
   summary text,source_kind text)`,[worldId,year,week,
   JSON.stringify(stories.map(s=>({story_key:s.key,desk:s.desk,
    certainty:s.certainty,promotion_id:s.promotionId,promotion_name:s.promotionName,
    show_id:s.showId,title:s.title,summary:s.summary,source_kind:s.sourceKind})))]);
 // Shares the authoritative certification transaction and replay seal.
 await publishCertifiedWorldHeritage(tx,worldId,year,week,awards,stories);
 return {published:true,awards:awards.length,stories:stories.length};
}
