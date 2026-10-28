/** On-demand owner-only media scrum. Published show facts are revalidated
 * before every answer; a journalist cannot change any settled result.
 */
import type {TransactionPool} from "./transaction.js";
import {withWorldTransaction} from "./transaction.js";
import {withSqlClient} from "./postgres.js";
import {readCompletedShowView} from "./show-results-view.js";
import {premiumScrumQuestions,type ScrumQuestionId} from "../domain/premium-media-scrum.js";
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
  question_id:ScrumQuestionId;answer_index:number}>(`
  SELECT a.question_id,a.answer_index FROM ppw_premium_media_scrum_answers a
  JOIN ppw_promotion_controls c ON c.world_id=a.world_id
   AND c.promotion_id=a.promotion_id AND c.player_id=a.player_id AND c.active
  WHERE a.world_id=$1 AND a.promotion_id=$2
   AND a.player_id=$3 AND a.show_id=$4
  ORDER BY a.question_id LIMIT 3`,[s.worldId,s.promotionId,s.playerId,s.showId]));
 const answered=new Map(rows.map(r=>[r.question_id,r.answer_index]));
 return {showId:show.showId,showName:show.showName,questions:questions.map(q=>({
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
    AND c.active LIMIT 1`,[s.worldId,s.promotionId,s.playerId]);
  if(owned.length!==1)throw new Error("Owner permission required");
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
