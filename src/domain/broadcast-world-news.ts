/** Verified broadcaster statements and TV clashes for the already certified
 * PPW World News desk. Never sources a story from private contract negotiation,
 * an unplayed draft, rumours or synthetic social likes.
 */
import type {WorldNewsStory} from "../db/world-news.js";
import type {NetworkAudit} from "../db/broadcast-network-audit.js";
import type {RatingsWarHighlight} from "../db/ratings-war-week.js";
import {COMMERCIAL_COMPANIES} from "./commercial-offers.js";
import {broadcasterReaction} from "./broadcast-network-review.js";
import {stableHotTagHash} from "./hot-tag-news.js";
const short=(id:string)=>stableHotTagHash(id).toString(36);
export function composeBroadcastWorldNews(
 audits:readonly NetworkAudit[],highlights:readonly RatingsWarHighlight[]
):WorldNewsStory[]{
 const stories:WorldNewsStory[]=[];
 const topClashes=[...highlights].sort((a,b)=>b.gain-a.gain||
  a.promotionId.localeCompare(b.promotionId)).slice(0,2);
 for(const h of topClashes){
  if(!h.showId||h.gain<=0||h.opponents<1)continue;
  stories.push({key:"broadcast:clash:"+short(h.showId),
   desk:"OFFICIAL",certainty:"CONFIRMED",sourceKind:"EVENT",
   promotionId:h.promotionId,promotionName:h.promotionName,showId:h.showId,
   title:h.promotionName+" wins viewers in a live ratings clash",
   summary:h.promotionName+" earned a certified "+h.rating.toFixed(1)+
    " household TV rating, gaining "+h.gain.toFixed(1)+
    " points while airing head-to-head with "+h.rivalName+
    ". The programmes occupied the same day and "+
    String(h.hour).padStart(2,"0")+":00 broadcast window."});
 }
 const news=audits.filter(a=>a.review.showId&&a.review.milestone)
  .sort((a,b)=>a.promotionId.localeCompare(b.promotionId)||
   a.dealId.localeCompare(b.dealId)).slice(0,3);
 for(const a of news){
  const milestone=a.review.milestone!;
  const network=COMMERCIAL_COMPANIES[a.offerCode];
  if(!network)continue;
  const event=milestone==="RECOVERED"?"recovery":
   milestone==="FINAL_WARNING"?"final-warning":"warning";
  const duration=a.review.missedConsecutively;
  const title=milestone==="RECOVERED"?
   network.name+" praises "+a.promotionName+"'s TV turnaround":
   network.name+" demands better television from "+a.promotionName;
  const report=milestone==="RECOVERED"?
   "The latest certified broadcast met the network target of "+
    a.review.target.toFixed(2)+" after three or more consecutive misses. ":
   "The promotion has fallen short of its broadcast delivery or audience "+
    "requirements for "+duration+" consecutive weeks. "+
    (a.review.status==="OFF_SLOT"?
     "This week's completed show aired outside its agreed weekday. ":
     a.review.status==="BELOW_TARGET"?
     "Its latest certified household TV rating was "+
      a.review.rating!.toFixed(1)+" against a "+
      a.review.target.toFixed(2)+" target. ":"");
  stories.push({key:"broadcast:network:"+a.offerCode+":"+
    event+":"+short(a.dealId+":"+a.review.reviewWeekIndex),
   desk:"OFFICIAL",certainty:"CONFIRMED",sourceKind:"EVENT",
   promotionId:a.promotionId,promotionName:a.promotionName,
   showId:a.review.showId!,title,
   summary:report+network.name+' responded: "'+
    broadcasterReaction(a.review)+'" The signed agreement continues on its original terms.'});
 }
 return stories;
}
