/** On-demand owner-only media scrum. Published show facts are revalidated
 * before every answer; a journalist cannot change any settled result.
 */
import type {TransactionPool} from "./transaction.js";
import {withWorldTransaction} from "./transaction.js";
import {withSqlClient} from "./postgres.js";
import {readCompletedShowView} from "./show-results-view.js";
import {premiumScrumQuestions,type ScrumQuestionId} from "../domain/premium-media-scrum.js";
import {publishablePressEditorial} from "../domain/premium-press-editorial.js";
export interface PremiumScrumScope{
 worldId:string;promotionId:string;playerId:string;showId:string;
}
const valid=(x:string)=>typeof x==="string"&&x.length>0&&x.length<=200;
export async function readPremiumScrum(pool:TransactionPool,s:PremiumScrumScope){
 if(!Object.values(s).every(valid))throw new Error("Invalid media session");
 const show=await readCompletedShowView(pool,s);
 if(show.bookingClass!=="PREMIUM")throw new Error("Press scrums follow premium events only");
 const questions=premiumScrumQuestions(show);
 const rows=await withSqlClient(pool,tx=>tx.query<{
  question_id:ScrumQuestionId|"DISMISSED";answer_index:number}>(`
  SELECT a.question_id,a.answer_index FROM ppw_premium_media_scrum_answers a
  JOIN ppw_promotion_controls c ON c.world_id=a.world_id
   AND c.promotion_id=a.promotion_id AND c.player_id=a.player_id AND c.active
  WHERE a.world_id=$1 AND a.promotion_id=$2
   AND a.player_id=$3 AND a.show_id=$4
  ORDER BY a.question_id LIMIT 4`,[s.worldId,s.promotionId,s.playerId,s.showId]));
 const answered=new Map(rows.map(r=>[r.question_id,r.answer_index]));
 return {showId:show.showId,showName:show.showName,
  dismissed:answered.has("DISMISSED"),questions:questions.map(q=>({
  ...q,answerIndex:answered.get(q.id)??null
 }))};
}
export async function answerPremiumScrum(pool:TransactionPool,s:PremiumScrumScope,
 questionId:string,answerIndex:number){
 if(!Object.values(s).every(valid))throw new Error("Invalid media session");
 const show=await readCompletedShowView(pool,s);
 if(show.bookingClass!=="PREMIUM")throw new Error("Press scrums follow premium events only");
 const question=premiumScrumQuestions(show).find(q=>q.id===questionId);
 if(!question||!Number.isInteger(answerIndex)||answerIndex<0||answerIndex>2)
  throw new Error("Choose a published journalist question and answer");
 return withWorldTransaction(pool,async tx=>{
  const owned=await tx.query<{promotion_id:string}>(`
   SELECT c.promotion_id FROM ppw_promotion_controls c
   JOIN ppw_memberships m ON m.world_id=c.world_id
    AND m.player_id=c.player_id AND m.status='ACTIVE'
   WHERE c.world_id=$1 AND c.promotion_id=$2 AND c.player_id=$3
    AND c.active LIMIT 1 FOR UPDATE OF c`,[s.worldId,s.promotionId,s.playerId]);
  if(owned.length!==1)throw new Error("Owner permission required");
  // Serialise every answer/closure via this owner's existing control row.
  const closed=await tx.query<{question_id:string}>(`
   SELECT question_id FROM ppw_premium_media_scrum_answers
   WHERE world_id=$1 AND show_id=$2 AND player_id=$3
    AND question_id='DISMISSED' LIMIT 1`,
   [s.worldId,s.showId,s.playerId]);
  if(closed.length)throw new Error("This press conference has ended");
  const existing=await tx.query<{answer_index:number}>(`
   INSERT INTO ppw_premium_media_scrum_answers
    (world_id,promotion_id,show_id,player_id,question_id,answer_index)
   VALUES($1,$2,$3,$4,$5,$6)
   ON CONFLICT(world_id,show_id,player_id,question_id) DO NOTHING
   RETURNING answer_index`,
   [s.worldId,s.promotionId,s.showId,s.playerId,question.id,answerIndex]);
  if(existing.length)return {questionId:question.id,answerIndex,answer:question.answers[answerIndex]!,saved:true};
  const stored=await tx.query<{answer_index:number}>(`
   SELECT answer_index FROM ppw_premium_media_scrum_answers
   WHERE world_id=$1 AND show_id=$2 AND player_id=$3 AND question_id=$4`,
   [s.worldId,s.showId,s.playerId,question.id]);
  if(stored.length!==1||stored[0]!.answer_index!==answerIndex)
   throw new Error("This answer is already on the record");
  return {questionId:question.id,answerIndex,answer:question.answers[answerIndex]!,saved:false};
 });
}

/** Persistent, owner-scoped 'session ended' marker in the existing answer table. */
export async function dismissPremiumScrum(pool:TransactionPool,s:PremiumScrumScope){
 if(!Object.values(s).every(valid))throw new Error("Invalid media session");
 const show=await readCompletedShowView(pool,s);
 if(show.bookingClass!=="PREMIUM")throw new Error("Press scrums follow premium events only");
 return withWorldTransaction(pool,async tx=>{
  const owned=await tx.query<{promotion_id:string}>(`
   SELECT c.promotion_id FROM ppw_promotion_controls c
   JOIN ppw_memberships m ON m.world_id=c.world_id
    AND m.player_id=c.player_id AND m.status='ACTIVE'
   WHERE c.world_id=$1 AND c.promotion_id=$2 AND c.player_id=$3
    AND c.active LIMIT 1 FOR UPDATE OF c`,[s.worldId,s.promotionId,s.playerId]);
  if(owned.length!==1)throw new Error("Owner permission required");
  const rows=await tx.query<{question_id:string}>(`
   INSERT INTO ppw_premium_media_scrum_answers
    (world_id,promotion_id,show_id,player_id,question_id,answer_index)
   SELECT c.world_id,c.promotion_id,$4,c.player_id,'DISMISSED',0
   FROM ppw_promotion_controls c
   JOIN ppw_memberships m ON m.world_id=c.world_id
    AND m.player_id=c.player_id AND m.status='ACTIVE'
   WHERE c.world_id=$1 AND c.promotion_id=$2 AND c.player_id=$3 AND c.active
   ON CONFLICT(world_id,show_id,player_id,question_id) DO NOTHING
   RETURNING question_id`,[s.worldId,s.promotionId,s.playerId,s.showId]);
  // A completed press session contributes to World News only AFTER its
  // certified week has been published. Replays never duplicate stories.
  const publishedAnswers=await tx.query<{question_id:ScrumQuestionId|"DISMISSED";
   answer_index:number;display_name:string|null;promotion_name:string}>(`
   SELECT a.question_id,a.answer_index,profile.display_name,p.name AS promotion_name
   FROM ppw_premium_media_scrum_answers a
   JOIN ppw_promotion_controls c ON c.world_id=a.world_id
    AND c.promotion_id=a.promotion_id AND c.player_id=a.player_id AND c.active
   JOIN ppw_memberships m ON m.world_id=c.world_id
    AND m.player_id=c.player_id AND m.status='ACTIVE'
   JOIN ppw_promotions p ON p.world_id=c.world_id AND p.promotion_id=c.promotion_id
   LEFT JOIN ppw_player_profiles profile ON profile.player_id=a.player_id
   WHERE a.world_id=$1 AND a.promotion_id=$2 AND a.player_id=$3 AND a.show_id=$4
   ORDER BY a.question_id LIMIT 4`,
   [s.worldId,s.promotionId,s.playerId,s.showId]);
  const picked=new Map<ScrumQuestionId,number>();
  for(const a of publishedAnswers){
   if(a.question_id!=="DISMISSED")picked.set(a.question_id,a.answer_index);
  }
  const manager=publishedAnswers[0]?.display_name?.trim()||
   (show.promotionName??"Promotion")+" management";
  const articles=publishablePressEditorial(show,manager,picked,{sessionEnded:true});
  for(const article of articles){
   await tx.query(`
    INSERT INTO ppw_world_news_items(world_id,year,week,story_key,desk,certainty,
      promotion_id,promotion_name,show_id,title,summary,source_kind)
    SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'EVENT'
    WHERE EXISTS(SELECT 1 FROM ppw_world_news_weeks
     WHERE world_id=$1 AND year=$2 AND week=$3)
    ON CONFLICT(world_id,year,week,story_key) DO NOTHING`,[
    s.worldId,show.year,show.week,article.storyKey,article.desk,
    article.certainty,s.promotionId,
    publishedAnswers[0]?.promotion_name??show.promotionName??"Promotion",
    s.showId,article.title,article.summary]);
  }
  if(rows.length)return {dismissed:true,saved:true};
  const stored=await tx.query<{question_id:string}>(`
   SELECT a.question_id FROM ppw_premium_media_scrum_answers a
   WHERE a.world_id=$1 AND a.promotion_id=$2 AND a.player_id=$3
    AND a.show_id=$4 AND a.question_id='DISMISSED'`,
   [s.worldId,s.promotionId,s.playerId,s.showId]);
  if(stored.length!==1)throw new Error("Owner permission required");
  return {dismissed:true,saved:false};
 });
}
