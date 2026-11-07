import {activateWorkspaceRoot} from "./workspace-root.js";
/** PPW Ringside: a results broadcast, not a spreadsheet of resolution receipts.
 * Player-authored finishes remain sovereign; editorial copy is derived from
 * verified scores, written stories and the original locked card.
 */
import type {CompletedShowView,ShowResultEntry} from "../db/show-results-view.js";
import {projectShowBreakdown} from "./show-breakdown.js";
import {programmeBroadcastRecap,programmeManagementNote}
 from "../domain/verified-programme-broadcast.js";
import {postShowHandoff,type NextStepDestination} from "../domain/post-show-handoff.js";
import {postShowStaffObservations} from "../domain/post-show-staff-observations.js";
import {projectPostShowScorecard} from "./post-show-scorecard.js";
import type {RingsideCopy} from "../domain/ringside-editorial.js";
import {createWrestlerPortrait} from "./wrestler-portrait.js";
import {showBroadcastHighlights} from "../domain/show-broadcast-highlights.js";
import {writeFinalBellEditorial} from "../domain/show-broadcast-editorial.js";
import {showReactionWire} from "../domain/show-reaction-wire.js";
import {projectPopFeed} from "../domain/pop-social.js";
import {projectHotTagShowWrestlerPosts} from "../domain/hot-tag-wrestler-voice.js";
import {HOT_TAG_NAME,HOT_TAG_TAGLINE} from "../domain/hot-tag-news.js";
import "./territory-results-skin.css";
import "./fight-night-results-skin.css";
import "./underground-zine-results-skin.css";
import "./retro-booker-results-skin.css";
import "./results-skin-contrast.css";
import {createBroadcastPackageFrame} from "./broadcast-package-frame.js";
import {createAnimatedEventPoster} from "./animated-event-poster.js";
import {eventPosterByStyle} from "../domain/event-poster-skins.js";
import {showCrowdFlow} from "../domain/show-crowd-flow.js";
import {replayVerifiedMatchFinish} from "../domain/show-finish-replay.js";
import {shortResultColour} from "../domain/show-result-colour.js";
import {broadcastShowPulse,broadcastTone,reviewCompletedEntry}
 from "../domain/show-broadcast-review.js";

const label=(s:string)=>s.replaceAll("_"," ").toLowerCase()
 .replace(/(^|\s)\S/g,x=>x.toUpperCase());
function finishLabel(entry:ShowResultEntry):string{
 if(entry.type==="SEGMENT")return entry.outcome==="HAPPENS"?"On air":
  entry.outcome==="REFUSED"?"Declined":"Cut short";
 const labels:Record<string,string>={
  CLEAN_PIN:"Pinfall",FLASH_PIN:"Surprise pin",SUBMISSION:"Tap-out",
  DISQUALIFICATION:"Disqualification",FOREIGN_OBJECT:"Controversial win",
  PROTECTED_FINISH:"Disputed decision",INJURY_STOPPAGE:"Referee stoppage",
  OVER_THE_TOP_ROPE:"Final elimination",
  RETRIEVAL:"Prize retrieval",TABLE_BREAK:"Table break",TEN_COUNT:"Ten-count knockout",
  VERBAL_SURRENDER:"I quit"};
 return labels[entry.outcome]??"Decision";
}
function node(tag:string,className:string,content=""):HTMLElement{
 const el=document.createElement(tag);el.className=className;
 if(content)el.textContent=content;return el;
}
function append(parent:HTMLElement,...children:HTMLElement[]){
 parent.append(...children);return parent;
}
function showError(root:HTMLElement,e:unknown){
 root.replaceChildren(node("p","ppw-alert ppw-error",
  e instanceof Error?e.message:"Unable to load show results"));
}
function entryIcon(entry:ShowResultEntry){
 if(entry.type==="MATCH")return "◈";
 if(entry.outcome==="REFUSED")return "×";
 if(entry.outcome==="INTERRUPTED")return "↯";
 return "✦";
}
/** The results show audited portraits; the running-order editor stays small. */
function matchPortraits(entry:ShowResultEntry):HTMLElement|null{
 const sides=entry.matchContext?.sideParticipants;
 if(entry.type!=="MATCH"||!sides?.length)return null;
 const strip=node("div","ppw-result-lineup");
 strip.setAttribute("aria-label","Match competitors");
 for(const [index,side] of sides.slice(0,4).entries()){
  if(index)strip.append(node("span","ppw-result-vs","VS"));
  const group=node("div","ppw-result-team");
  for(const person of side.slice(0,3)){
   const competitor=node("div","ppw-result-competitor");
   const photoWell=node("span","ppw-result-photo");
   const fallback=node("span","ppw-result-photo-fallback",
    person.name.trim().split(" ").slice(0,2).map(x=>x[0]?.toUpperCase()??"").join(""));
   photoWell.append(fallback);
   const photo=createWrestlerPortrait(person.name,140,person.personId);
   if(photo){
    photo.addEventListener("load",()=>{fallback.hidden=true;});
    photo.addEventListener("error",()=>{photo.remove();fallback.hidden=false;});
    photoWell.append(photo);
   }
   competitor.append(photoWell,node("span","ppw-result-competitor-name",person.name));
   group.append(competitor);
  }
  if(side.length>3)group.append(node("span","ppw-result-more",
   "+"+(side.length-3)+" more"));
  strip.append(group);
 }
 if(sides.length>4)strip.append(node("span","ppw-result-more",
  "+"+(sides.length-4)+" entrants / sides"));
 return strip;
}
/** Grounded bridges make the card read like one event when Groq is unavailable.
 * These use only completed card facts, never invent a wrestler's actions. */
function transitionFor(entries:ShowResultEntry[],index:number,showName:string):string{
 const current=entries[index]!,previous=index?entries[index-1]:null;
 const competitors=current.matchContext?.sides.flat().join(", ")??"the competitors";
 if(!previous)return current.type==="MATCH"?
  showName+" opened with a contest featuring "+competitors+".":
  showName+" opened with "+current.headline.toLowerCase()+".";
 if(current.type==="MATCH"){
  const openers=previous.type==="SEGMENT"?
   ["The talking was done; now it was time for "+competitors+".",
    "That set the scene. Next came a contest featuring "+competitors+"."]:
   ["There was more wrestling to come, with "+competitors+" up next.",
    "The bell rang again, and "+competitors+" stepped into the spotlight."];
  return openers[index%openers.length]!;
 }
 return previous.type==="MATCH"?
  ["There was barely time to digest that finish before the next chapter unfolded.",
   "Wrestling gave way to the next twist in the evening's story."][index%2]!:
  ["And the drama didn't stop there.","The stories kept moving between the bells."][index%2]!;
}
/** One async bounded read. Filtering, opening reviews and highlights never refetch. */
export async function mountShowResults(root:HTMLElement,port:{
 load():Promise<CompletedShowView>;
 commentary?():Promise<{status:"ready"|"pending"|"unavailable";review?:RingsideCopy}>;
 openPress?:()=>void;
 openNext?:(section:NextStepDestination)=>void;
 openRatings?():void;
 openWrestler?:(personId:string)=>void;
 openProgrammes?:(personId:string)=>void;
}){
 activateWorkspaceRoot(root,"ppw-results");
 root.replaceChildren(node("p","ppw-muted","Preparing the ringside report…"));
 try{
  const show=await port.load();
  renderBroadcast(root,show,port.openNext,port.openPress,
   port.openWrestler,port.openRatings,port.openProgrammes);
  if(port.commentary)void port.commentary().then(result=>{
   if(root.querySelector(".ppw-ringside-dispatch")?.getAttribute("data-show-id")!==show.showId)return;
   if(result.status==="ready"&&result.review&&
    Array.isArray(result.review.slots)&&
    result.review.slots.length===show.entries.length&&
    result.review.slots.every((slot,i)=>slot.slotId===show.entries[i]?.slotId))
    insertRingsideEditorial(root,show,result.review);
   else markRingsideFallback(root,show);
  }).catch(()=>markRingsideFallback(root,show));
  else markRingsideFallback(root,show);
 }catch(e){showError(root,e);}
}
export function renderBroadcast(root:HTMLElement,show:CompletedShowView,
 openNext?:(section:NextStepDestination)=>void,openPress?:()=>void,
 openWrestler?:(personId:string)=>void,openRatings?:()=>void,
 openProgrammes?:(personId:string)=>void):void{
 root.classList.remove("ppw-editorial-ready");
 const poster=show.bookingClass==="PREMIUM"?eventPosterByStyle(show.eventPosterStyle):null;
 const effectiveSkin=poster?null:show.resultsSkin;
 if(poster)root.dataset.premiumPoster=poster.style.toLowerCase().replaceAll("_","-");
 else delete root.dataset.premiumPoster;
 if(effectiveSkin==="TERRITORY_TV")root.dataset.resultsSkin="territory-tv";
 else if(effectiveSkin==="FIGHT_NIGHT")root.dataset.resultsSkin="fight-night";
 else if(effectiveSkin==="UNDERGROUND_ZINE")root.dataset.resultsSkin="underground-zine";
 else if(effectiveSkin==="RETRO_BOOKER_02")root.dataset.resultsSkin="retro-booker-02";
 else delete root.dataset.resultsSkin;
 const pulse=broadcastShowPulse(show.entries);
 const tone=broadcastTone(show.crowdResponse);
 let changePage:(page:0|1|2)=>void=()=>{};
 let revealNarrative:()=>void=()=>{};
 const header=node("header","ppw-result-hero ppw-tone-"+tone.toLowerCase());
 if(effectiveSkin==="TERRITORY_TV")
  header.append(node("div","ppw-territory-station",
   "★ PPW TERRITORY TELEVISION  ·  ON THE AIR"));
 if(effectiveSkin==="FIGHT_NIGHT")
  header.append(node("div","ppw-fight-station",
   "PPW / FIGHT NIGHT  ·  OFFICIAL EVENT REPORT"));
 if(effectiveSkin==="UNDERGROUND_ZINE")
  header.append(node("div","ppw-zine-station",
   "THE UNDERGROUND REPORT · ISSUE "+String(show.week).padStart(3,"0")));
 if(effectiveSkin==="RETRO_BOOKER_02")
  header.append(node("div","ppw-retro-station",
   "■ PPW BOOKER 2002  /  RESULTS.DAT  /  WEEK "+String(show.week).padStart(2,"0")));
 const titleWrap=node("div","ppw-result-title-wrap");
 append(titleWrap,
  node("span","ppw-eyebrow","PPW / RINGSIDE REPORT"+
   (show.bookingClass==="PREMIUM"?" · PPV":"")),
  node("h1","",show.showName??"THE NIGHT IN REVIEW"),
  node("p","ppw-result-edition","Year "+show.year+" · Week "+show.week));
 const scoreWrap=node("div","ppw-result-score-wrap");
 append(scoreWrap,node("span","ppw-result-score",String(Math.round(show.crowdResponse))),
  node("span","ppw-result-score-label","CROWD / 100"));
 append(header,append(node("div","ppw-result-hero-main"),titleWrap));
 let audiencePanel:HTMLElement|null=null;
 if(show.audience){
  const report=show.audience,block=node("section","ppw-result-broadcast-audience");
  block.setAttribute("aria-label","Broadcast performance");
  const title=node("div","ppw-audience-head");
  title.append(node("span","ppw-result-audience-label","BROADCAST PERFORMANCE"),
   node("span","ppw-audience-format",report.format==="TV"?
    typeof report.ratingsWarChange==="number"&&report.ratingsWarChange!==0?
     "TV WAR "+(report.ratingsWarChange>0?"+":"")+report.ratingsWarChange.toFixed(1):
     "TELEVISION":"PAY-PER-VIEW"));
  const metrics=node("div","ppw-audience-metrics");
  const metric=(caption:string,value:string)=>{
   const item=node("div","ppw-audience-metric");
   item.append(node("small","",caption),node("strong","",value));
   return item;
  };
  if(report.format==="TV"&&report.householdRating!==null){
   metrics.append(metric("TV RATING",report.householdRating.toFixed(1)));
   if(report.estimatedViewers!==null){
    const viewers=metric("EST. VIEWERS",new Intl.NumberFormat("en-GB",{
     notation:"compact",maximumFractionDigits:1
    }).format(report.estimatedViewers).replace(/m$/,"M").replace(/k$/,"K"));
    const precise=report.estimatedViewers.toLocaleString("en-GB")+" estimated viewers";
    viewers.setAttribute("aria-label",precise);viewers.title=precise;
    metrics.append(viewers);
   }
  }else if(report.format==="PPV"&&report.ppvBuys!==null)
   metrics.append(metric("EST. PPV BUYS",report.ppvBuys.toLocaleString("en-GB")));
  if(metrics.childElementCount){
   block.append(title,metrics);
   if(report.format==="TV"&&openRatings){
    const compare=document.createElement("button");
    compare.type="button";compare.className="ppw-audience-ratings-link";
    compare.textContent="Ratings War";compare.onclick=openRatings;
    compare.setAttribute("aria-label","Compare TV ratings in Ratings War");
    block.append(compare);
   }
   audiencePanel=block;
  }
 }

 const firstMoment=showBroadcastHighlights(show.entries)[0];
 if(firstMoment)header.append(node("p","ppw-result-lead",firstMoment.headline));
 const pulseRow=node("div","ppw-result-pulse");
 append(pulseRow,
  metric(String(show.matchCount),"MATCHES"),
  metric(String(show.angleCount),"ANGLES"),
  metric(String(pulse.hotMoments),"HOT MOMENTS"));
 // Verified operational numbers live in optional manager analysis, not the headline.
 const flowScores=showCrowdFlow(show);
 const crowdFlow=node("section","ppw-crowd-flow");
 if(flowScores.length>=2){
  append(crowdFlow,node("span","ppw-eyebrow","PPW / AUDIENCE RESPONSE"),
   node("h2","ppw-crowd-flow-heading","THE CROWD FLOW"),
   node("p","ppw-crowd-flow-detail",
    "Verified audience score after each card item. Not a minute-by-minute action replay."));
  const bars=node("div","ppw-crowd-flow-bars");
  bars.setAttribute("role","group");
  bars.setAttribute("aria-label","Crowd response for each completed card item");
  for(const point of flowScores){
   const button=document.createElement("button");button.type="button";
   button.className="ppw-crowd-flow-point"+
    (point.standout?" ppw-flow-peak":"")+
    (point.cold?" ppw-flow-cold":"");
   const kind=point.kind==="MATCH"?"match":"angle";
   button.setAttribute("aria-label","Card "+(point.position+1)+", "+kind+
    ", audience response "+point.crowdResponse.toFixed(1)+
    " out of 100. Open the completed report.");
   button.title=point.title;
   const graph=node("span","ppw-flow-track");
   const fill=node("span","ppw-flow-fill");
   fill.style.width=Math.min(100,Math.max(0,point.crowdResponse))+"%";
   append(graph,fill);
   append(button,node("span","ppw-flow-score",
    String(Math.round(point.crowdResponse))),
    graph,
    node("span","ppw-flow-slot",String(point.position+1)),
    node("span","ppw-flow-kind",kind.toUpperCase()));
   button.onclick=()=>{
    revealNarrative();changePage(1);
    const target=storyLinks.get(point.slotId);
    if(target instanceof HTMLDetailsElement)target.open=true;
    target?.scrollIntoView({behavior:"smooth",block:"center"});
   };
   append(bars,button);
  }
  append(crowdFlow,bars);
 }
 const feature=node("section","ppw-final-bell ppw-ringside-dispatch");
 feature.dataset.showId=show.showId;
 append(feature,node("span","ppw-eyebrow","PPW / RINGSIDE"),
  node("span","ppw-ringside-ai-status","AI dispatch · checking"),
  node("h2","ppw-final-bell-headline","THE NIGHT AT RINGSIDE"),
  node("p","ppw-ringside-await","The results are final. The ringside dispatch is being prepared."));
 const reactions=projectPopFeed(show,showReactionWire(show));
 const wrestlerPosts=projectHotTagShowWrestlerPosts(show).map(post=>
  show.shortform?.wrestler?.personId===post.personId&&
  show.shortform.wrestler.slotId===post.slotId?
   {...post,text:show.shortform.wrestler.text}:post);
 const noise=node("section","ppw-crowd-noise ppw-pop-social");
 if(reactions.length||wrestlerPosts.length){
  append(noise,
   node("span","ppw-pop-kicker",HOT_TAG_TAGLINE),
   node("h2","ppw-crowd-noise-title ppw-pop-title",HOT_TAG_NAME),
   node("p","ppw-pop-intro","Wrestler voices and fans react to tonight's completed show."));
  const wall=node("div","ppw-crowd-noise-wall ppw-pop-timeline");
  wall.setAttribute("aria-label","HOT TAG fictional wrestling social timeline");
  for(const post of wrestlerPosts){
   const card=node("article","ppw-crowd-noise-card ppw-pop-post ppw-pop-wrestler-post");
   const head=node("div","ppw-pop-post-head");
   const avatar=node("span","ppw-pop-avatar","🎤");
   const image=createWrestlerPortrait(post.displayName,70,post.personId);
   if(image)avatar.replaceChildren(image);
   const who=node("div","ppw-pop-who");
   who.append(node("strong","ppw-pop-display-name",post.displayName),
    node("small","ppw-pop-handle",post.handle+" · Wrestler"));
   head.append(avatar,who,node("span","ppw-pop-mood","✓"));
   card.append(head,node("p","ppw-crowd-noise-quote ppw-pop-copy",post.text));
   const metrics=node("div","ppw-pop-metrics");
   metrics.append(node("span","","❤️ "+post.likes.toLocaleString("en-GB")),
    node("span","","💬 "+post.replies.toLocaleString("en-GB")),
    node("span","","🔁 "+post.reposts.toLocaleString("en-GB")));
   card.append(metrics);
   const actions=node("div","ppw-pop-wrestler-actions");
   const moment=node("button","ppw-pop-wrestler-action","See moment") as HTMLButtonElement;
   moment.type="button";
   moment.onclick=()=>{
    revealNarrative();changePage(1);
    const target=storyLinks.get(post.slotId);
    if(target instanceof HTMLDetailsElement)target.open=true;
    target?.scrollIntoView({behavior:"smooth",block:"center"});
   };
   actions.append(moment);
   if(openWrestler){
    const dossier=node("button","ppw-pop-wrestler-action","View dossier") as HTMLButtonElement;
    dossier.type="button";
    dossier.onclick=()=>openWrestler(post.personId);
    actions.append(dossier);
   }
   if(openProgrammes){
    const develop=node("button","ppw-pop-wrestler-action","Develop programme") as HTMLButtonElement;
    develop.type="button";
    develop.onclick=()=>openProgrammes(post.personId);
    actions.append(develop);
   }
   card.append(actions);
   wall.append(card);
  }
  for(const reaction of reactions){
   const card=document.createElement("button");card.type="button";
   card.className="ppw-crowd-noise-card ppw-pop-post ppw-reaction-"+reaction.mood.toLowerCase();
   card.setAttribute("aria-label","Open source result for "+reaction.identity.handle+": "+reaction.text);
   const head=node("span","ppw-pop-post-head");
   head.append(node("span","ppw-pop-avatar",reaction.identity.avatar));
   const who=node("span","ppw-pop-who");
   who.append(node("strong","ppw-pop-display-name",reaction.identity.displayName),
    node("small","ppw-pop-handle",reaction.identity.handle+" · After the bell"));
   head.append(who,node("span","ppw-pop-mood",reaction.emoji));
   card.append(head,node("span","ppw-crowd-noise-quote ppw-pop-copy",reaction.text));
   if(reaction.reply&&reaction.replyIdentity){
    const reply=node("span","ppw-crowd-noise-reply ppw-pop-reply");
    append(reply,node("span","ppw-crowd-noise-reply-voice",
     reaction.replyIdentity.avatar+" "+reaction.replyIdentity.handle),
     node("span","ppw-crowd-noise-reply-text",reaction.reply.text));
    card.append(reply);
   }
   const metrics=node("span","ppw-pop-metrics");
   metrics.append(node("span","",reaction.emoji+" "+reaction.likes.toLocaleString("en-GB")),
    node("span","","💬 "+reaction.comments.toLocaleString("en-GB")),
    node("span","","🔁 "+reaction.reposts.toLocaleString("en-GB")));
   card.append(metrics,node("span","ppw-crowd-noise-read","OPEN THE RECORDED MOMENT ↗"));
   card.onclick=()=>{
    revealNarrative();changePage(1);
    const target=storyLinks.get(reaction.slotId);
    if(target instanceof HTMLDetailsElement)target.open=true;
    target?.scrollIntoView({behavior:"smooth",block:"center"});
   };
   wall.append(card);
  }
  noise.append(wall);
 }
 const highlights=node("section","ppw-broadcast-highlights");
 const featured=showBroadcastHighlights(show.entries);
 const storyLinks=new Map<string,HTMLElement>();
 if(featured.length){
  append(highlights,node("h2","ppw-broadcast-section-title","TONIGHT'S HEADLINES"));
  for(const item of featured){
   const button=document.createElement("button");
   button.type="button";button.className="ppw-broadcast-headline";
   append(button,node("span","ppw-eyebrow",item.category),
    node("strong","",item.headline),node("p","",item.detail),
    node("span","ppw-result-read","READ THE STORY  ↗"));
   button.addEventListener("click",()=>{
    revealNarrative();changePage(1);
    const target=storyLinks.get(item.slotId);
    if(target instanceof HTMLDetailsElement)target.open=true;
    target?.scrollIntoView({behavior:"smooth",block:"center"});
   });
   append(highlights,button);
  }
 }
 const timeline=node("section","ppw-result-timeline");
 append(timeline,node("h2","ppw-broadcast-section-title","THE FULL SHOW"));
 const entries:({element:HTMLElement;lead:HTMLElement;type:ShowResultEntry["type"]})[]=[];
 // Single chronological narrative: highlights always reveal their verified card slot.

 if(!show.entries.length)append(timeline,node("p","ppw-muted","There are no recorded card items."));
 for(const [index,entry] of show.entries.entries()){
  const review=reviewCompletedEntry(entry,show.showId);
  const details=document.createElement("details");
  details.className="ppw-result-entry "+(entry.type==="MATCH"?
   "ppw-result-match":"ppw-result-angle")+
   " ppw-tone-"+review.tone.toLowerCase();
  details.open=true;
  const summary=document.createElement("summary");
  const meta=node("span","ppw-result-meta");
  append(meta,node("span","ppw-result-category",
   entryIcon(entry)+"  "+review.tag.toUpperCase()),
   node("span","ppw-result-meter",String(Math.round(entry.crowdResponse))+" / 100"));
  if(entry.matchContext?.isMainEvent)
   append(meta,node("span","ppw-result-main-event","MAIN EVENT"));
  if(entry.fallout?.ratingStars!==undefined)
   append(meta,node("span","ppw-result-rating",
    "★ "+entry.fallout.ratingStars.toFixed(2)+" / 5"));
  if(entry.fallout?.actualMinutes!==undefined)
   append(meta,node("span","ppw-result-minutes",
    entry.fallout.actualMinutes+" MIN"));
  if(entry.fallout?.linkedProgrammes)
   append(meta,node("span","ppw-result-programme",
    "● "+entry.fallout.linkedProgrammes+" "+(entry.fallout.linkedProgrammes===1?
     "RIVALRY":"RIVALRIES")));
  const heading=node("span","ppw-result-headline",review.headline);
  if(entry.fallout?.title?.changed)
   append(meta,node("span","ppw-result-flag ppw-flag-gold","NEW CHAMPION"));
  if(entry.fallout?.injuries.length)
   append(meta,node("span","ppw-result-flag ppw-flag-medical","MEDICAL UPDATE"));
  const trail=node("span","ppw-result-trail",
   "CARD "+String(entry.position+1)+"  ·  "+finishLabel(entry));
  append(summary,meta,heading);
  const portraits=matchPortraits(entry);
  if(portraits)summary.append(portraits);
  summary.append(trail);
  append(details,summary);
  const body=node("div","ppw-result-story");
  const narrative=node("div","ppw-ringside-slot");
  narrative.dataset.slotId=entry.slotId;narrative.hidden=true;
  append(body,narrative);
  // Official finish remains verifiable without repeating the result in a huge box.
  const finish=replayVerifiedMatchFinish(entry);
  if(finish){
   const finishNotes=document.createElement("details");
   finishNotes.className="ppw-verified-finish-details ppw-finish-"+finish.tone.toLowerCase();
   finishNotes.open=true; // Offline fallback if the editorial isn't ready.
   finishNotes.append(node("summary","","Official finish · "+finish.title),
    node("p","ppw-finish-description",finish.description));
   body.append(finishNotes);
  }
  if(review.bulletins.length){
   append(body,node("h3","ppw-result-fallout-title","CONFIRMED FALLOUT"));
   const bullets=document.createElement("ul");bullets.className="ppw-result-fallout";
   for(const bulletin of review.bulletins)
    append(bullets,node("li","",bulletin));
   append(body,bullets);
  }
  if(entry.type==="MATCH"&&entry.matchContext?.winnerNames.length)
   append(body,node("p","ppw-result-verdict",
    "WINNER  ·  "+entry.matchContext.winnerNames.join(" & ")));
  const chapters=entry.programmeChapters??[];
  if(chapters.length){
   const context=node("section","ppw-rivalry-at-ringside");
   context.append(node("span","ppw-eyebrow","THE RIVALRY SO FAR"));
   for(const chapter of chapters){
    const record=node("div","ppw-ringside-rivalry-chapter");
    record.append(node("strong","",chapter.sideA+" vs "+chapter.sideB),
     node("p","",programmeBroadcastRecap(chapter,entry.type)));
    context.append(record);
   }
   body.append(context);
  }
  append(details,body);
  storyLinks.set(entry.slotId,details);
  const lead=node("p","ppw-show-transition",
   transitionFor(show.entries,index,show.showName??"The show"));
  entries.push({element:details,lead,type:entry.type});
  append(timeline,lead,details);
 }
 // Re-rendering the report is fully client-side; caller controls the show scope.
 const report=show.staffReport;
 const management=node("section","ppw-post-show-brief");
 management.append(node("span","ppw-eyebrow","PPW / MANAGEMENT"),
  node("h2","","POST-SHOW MANAGEMENT BRIEF"));
 // The historical show report does not claim these concerns are still live.
 const handoff=postShowHandoff(show);
 const snapshot=projectPostShowScorecard(show);
 const overview=node("section","ppw-manager-snapshot");
 overview.setAttribute("aria-label","The night in numbers");
 const summary=node("div","ppw-manager-snapshot-toggle");
 summary.append(node("span","ppw-eyebrow","CERTIFIED / THIS SHOW"),
  node("h3","","The night in numbers"),
  node("span","ppw-manager-snapshot-hint","Ratings, audience, injuries and event finances"));
 overview.append(summary);
 const facts=node("div","ppw-manager-snapshot-grid");
 const fact=(label:string,value:string,detail:string)=>{
  const tile=node("article","ppw-manager-snapshot-fact");
  tile.append(node("small","",label),node("strong","",value),
   node("p","",detail));facts.append(tile);
 };
 if(snapshot.bestMatch)fact("TOP-RATED MATCH",
  snapshot.bestMatch.value.toFixed(2)+"★",snapshot.bestMatch.headline);
 if(snapshot.lowestRatedMatch)fact("LOWEST-RATED MATCH",
  snapshot.lowestRatedMatch.value.toFixed(2)+"★",
  snapshot.lowestRatedMatch.headline);
 if(snapshot.crowdPeak)fact("BIGGEST CROWD RESPONSE",
  Math.round(snapshot.crowdPeak.value)+"/100",snapshot.crowdPeak.headline);
 if(snapshot.crowdLow)fact("QUIETEST MOMENT",
  Math.round(snapshot.crowdLow.value)+"/100",snapshot.crowdLow.headline);
 if(show.audience?.format==="TV"&&show.audience.estimatedViewers!==null)
  fact("TELEVISION AUDIENCE",
   show.audience.estimatedViewers.toLocaleString("en-GB")+" viewers",
   show.audience.householdRating===null?"Certified broadcast estimate":
    show.audience.householdRating.toFixed(1)+" household rating");
 if(show.audience?.format==="PPV"&&show.audience.ppvBuys!==null)
  fact("PAY-PER-VIEW BUYS",
   show.audience.ppvBuys.toLocaleString("en-GB"),
   "Certified event purchase estimate");
 if(snapshot.medical.length)fact("RECORDED INJURIES",
  String(snapshot.medical.length),
  snapshot.medical.map(x=>x.name+" · "+(x.weeksOut===null?
   "return date not recorded":x.weeksOut+" weeks out")).join(" / "));
 if(snapshot.titleChanges.length)fact("TITLE CHANGES",
  String(snapshot.titleChanges.length),
  snapshot.titleChanges.map(x=>x.winner+" · "+x.name).join(" / "));
 if(show.economics){
  const number=(value:string)=>BigInt(value).toLocaleString("en-GB");
  const usd=(value:string)=>"$"+number(value);
  fact("LIVE ATTENDANCE",show.economics.attendance.toLocaleString("en-GB"),
   "Recorded event attendance");
  fact("TICKET GATE",usd(show.economics.gateRevenue),"Recorded ticket receipts");
  fact("EVENT COST",usd(show.economics.totalCost),
   "Includes venue, production, travel and appearance fees");
  fact("EVENT PROFIT / LOSS",
   (BigInt(show.economics.netResult)<0n?"−$":"$")+
    number(BigInt(show.economics.netResult)<0n?
     (-BigInt(show.economics.netResult)).toString():show.economics.netResult),
   "Event-only P&L; not the promotion's overall weekly profit");
 }
 overview.append(scoreWrap,pulseRow,facts);
 if(show.economics)overview.append(node("p","ppw-manager-snapshot-note",
  "Appearance fees are included in event costs but already settled by World accounting. "+
  "Event profit/loss is not a second cash payment; weekly salaries and other business costs are separate."));
 if(!facts.childElementCount)overview.append(node("p","ppw-muted",
  "This show has no detailed certified ratings or business figures to compare."));
 const intro=node("div","ppw-post-show-decision-lead");
 intro.append(node("span","ppw-eyebrow","DECISIONS / NEXT WEEK"),
  node("h3","","What needs your attention"),
  node("p","","These are recorded events from this show, not automatic orders. "+
   "You decide what to carry forward."));
 management.append(intro);
 const choices=node("div","ppw-next-show-actions");
 for(const task of handoff.actions){
  const item=node("article","ppw-next-show-choice");
  const copy=node("div","ppw-next-show-copy");
  copy.append(node("span","ppw-eyebrow",task.eyebrow),
   node("h3","",task.headline),
   node("p","",task.detail));
  item.append(copy);
  const actionRow=node("div","ppw-next-show-buttons");
  if(task.evidenceSlotId&&storyLinks.has(task.evidenceSlotId)){
   const source=node("button","ppw-next-show-evidence","See the recorded moment") as HTMLButtonElement;
   source.type="button";
   source.onclick=()=>{
    revealNarrative();changePage(1);
    const detail=storyLinks.get(task.evidenceSlotId!);
    if(detail instanceof HTMLDetailsElement)detail.open=true;
    detail?.scrollIntoView({block:"start",behavior:"instant"});
   };
   actionRow.append(source);
  }
  if(task.personId&&openWrestler){
   const profile=node("button","ppw-next-show-evidence","Open wrestler dossier") as HTMLButtonElement;
   profile.type="button";profile.onclick=()=>openWrestler(task.personId!);
   actionRow.append(profile);
  }
  if(openNext){
   const control=node("button","ppw-next-show-route",task.action) as HTMLButtonElement;
   control.type="button";control.onclick=()=>openNext(task.destination);
   actionRow.append(control);
  }
  if(actionRow.childElementCount)item.append(actionRow);
  choices.append(item);
 }
 management.append(choices);
 if(report){
  const office=node("div","ppw-post-show-road-agent");
  office.append(node("span","ppw-eyebrow","FROM THE LOCKER ROOM"),
   node("h3","",report.reporter+" · Road Agent"),
   node("strong","",report.headline),
   node("p","ppw-road-agent-voice",report.praise),
   node("p","ppw-road-agent-voice",report.concern),
   node("p","ppw-road-agent-next",report.recommendation));
  // Show the concrete evidence even when it came from the show's
  // strongest match: a real injury or nine-minute overrun still needs care.
  // These are bounded verified notes, never fabricated staff conversations.
  const observations=postShowStaffObservations(show);
  if(observations.length){
   const specific=node("div","ppw-road-agent-observations");
   specific.append(node("strong","","On my desk tonight"));
   for(const observation of observations){
    const line=node("article","ppw-road-agent-observation");
    line.append(node("h4","",observation.headline),
     node("p","",observation.note));
    specific.append(line);
   }
   office.append(specific);
  }
  if(show.shortform?.roadAgent){
   const note=node("article","ppw-road-agent-observation");
   note.append(node("h4","","From the Road Agent's notebook"),
    node("p","",show.shortform.roadAgent.note));
   office.append(note);
  }
  management.append(office);
 }
 // Without a hired Road Agent, the factual hand-off still belongs in the
 // management brief. No extra generated staff report or database read.
 if(!report){
  const storylineNote=programmeManagementNote(show.entries.flatMap(e=>e.programmeChapters??[]));
  if(storylineNote)management.append(node("p","ppw-road-agent-continuity",
   "Storylines from tonight: "+storylineNote));
 }
 const gorilla=show.gorillaLog;
 const position=gorilla?node("section","ppw-staff-show-report ppw-gorilla-log"):null;
 if(position&&gorilla){
  append(position,node("span","ppw-eyebrow","PPW / GORILLA POSITION"),
   node("h2","","AT THE CURTAIN"),
   node("p","",gorilla.staffName+" · "+
    gorilla.policy.replaceAll("_"," ").toLowerCase()),
   node("p","","The crew's account of what happened between the curtain and the ring."));
  if(!gorilla.incidents.length)position.append(node("p","",
   "The crew kept the show on course. No production intervention was needed."));
  for(const incident of gorilla.incidents.slice(0,12)){
   const line=node("article","ppw-gorilla-incident");
   const source=show.entries.find(entry=>entry.position===incident.position);
   line.append(node("strong","",incident.kind.replaceAll("_"," ")+
    " · "+(source?.headline??"During the show")),
    node("p","",incident.evidence),
    node("p","",incident.choice.replaceAll("_"," ")+": "+incident.reason));
   position.append(line);
  }
  if(gorilla.incidents.length>12)position.append(node("p","ppw-muted",
   "Additional production incidents remain in the official show log."));
  if(gorilla.crowdAdjustment>0)position.append(node("p","",
   "Production recovered its rhythm, and the building responded."));
 }
 // All three chapters reuse one immutable completed show; no extra reads.
 const headlines=node("section","ppw-results-page");headlines.dataset.page="headlines";
 let premiumOpening:HTMLElement|null=null;
 // A permanent television identity, before the actual Results Skin report.
 // The certified narrative, manager analysis and results are untouched.
 if(poster){
  // A settled PPV cannot still be advertising an unannounced card.
  // Name participants only when the locked show certified a main event.
  const main=show.entries.find(entry=>
   entry.type==="MATCH"&&entry.matchContext?.isMainEvent);
  const sides=main?.matchContext?.sides.filter(side=>side.length>0)
   .map(side=>side.join(" & "));
  const mainEvent=sides&&sides.length>=2?sides.join(" vs "):null;
  const opening=createAnimatedEventPoster({
   style:poster.style,eventName:show.showName??"Premium event",
   promotionName:show.promotionName??"PPW",compact:true,
   mainEvent,completed:true
  });
  if(opening){
   const wrap=node("section","ppw-results-event-poster");
   wrap.append(opening);premiumOpening=wrap;
  }
 }else if(show.broadcastPackage){
  const opening=createBroadcastPackageFrame({style:show.broadcastPackage,kind:"OPEN",
   promotion:show.promotionName??"PPW",show:show.showName??"Weekly show"});
  if(opening){
   const wrap=node("section","ppw-tv-opening-wrap");
   wrap.append(opening);headlines.append(wrap);
  }
 }
 headlines.append(header,...(featured.length?[highlights]:[]));
 const full=node("section","ppw-results-page");full.dataset.page="full";
 if(premiumOpening)full.append(premiumOpening);
 else{
  const identity=node("header","ppw-results-show-intro");
  identity.append(node("span","ppw-eyebrow","PPW / RINGSIDE"),
   node("h1","",show.showName??"The completed show"),
   node("p","ppw-muted","Year "+show.year+" · Week "+show.week));
  full.append(identity);
 }
 if(audiencePanel)full.append(audiencePanel);
 full.append(feature);
 if(effectiveSkin==="TERRITORY_TV"){
  const station=node("header","ppw-territory-chapter-head");
  station.append(node("span","ppw-territory-eyebrow","★ PPW TERRITORY TELEVISION · FULL CARD"),
   node("h2","","THE COMPLETE NIGHT"),
   node("p","","OFFICIAL MATCHES, RESULTS & ON-AIR MOMENTS"));
  full.append(station);
 }
 if(effectiveSkin==="FIGHT_NIGHT"){
  const station=node("header","ppw-fight-chapter-head");
  station.append(node("span","ppw-fight-eyebrow","PPW / FIGHT NIGHT · OFFICIAL RECORD"),
   node("h2","","MATCH REPORT"),
   node("p","","COMPLETE CARD · IN EVENT ORDER"));
  full.append(station);
 }
 if(effectiveSkin==="UNDERGROUND_ZINE"){
  const station=node("header","ppw-zine-chapter-head");
  station.append(node("span","ppw-zine-eyebrow","THE UNDERGROUND REPORT · COMPLETE CARD"),
   node("h2","","EVERY BELL. EVERY BRAWL."),
   node("p","","THE COMPLETE SHOW · AS IT HAPPENED"));
  full.append(station);
 }
 if(effectiveSkin==="RETRO_BOOKER_02"){
  const station=node("header","ppw-retro-chapter-head");
  station.append(node("span","ppw-retro-eyebrow","FILE 02 / COMPLETE CARD"),
   node("h2","","MATCH RESULTS"),
   node("p","","WRESTLERS · FINISHES · SEGMENTS"));
  full.append(station);
 }
 // A second reading mode for the same completed show: compact certified
 // rundown vs existing immersive narrative. No extra API or World query.
 const breakdown=node("section","ppw-show-breakdown");
 breakdown.append(node("h2","ppw-broadcast-section-title","SHOW BREAKDOWN"),
  node("p","ppw-muted","Every match and angle, in running order. Tap any chapter to read its full broadcast."));
 const breakdownRows=projectShowBreakdown(show.entries);
 const portraitJobs:{card:HTMLElement;entry:ShowResultEntry}[]=[];
 const breakdownSwitch=node("div","ppw-show-breakdown-switch");
 breakdownSwitch.setAttribute("role","group");
 breakdownSwitch.setAttribute("aria-label","Full show display");
 const narrativeButton=node("button","ppw-show-breakdown-toggle","Broadcast play-by-play") as HTMLButtonElement;
 const rundownButton=node("button","ppw-show-breakdown-toggle","Show Breakdown") as HTMLButtonElement;
 narrativeButton.type="button";rundownButton.type="button";
 let compactFullShow=true;
 const setBreakdown=(compact:boolean)=>{
  compactFullShow=compact;
  breakdown.hidden=!compact;timeline.hidden=compact;
  // Portraits are created only while browsing the breakdown. Keeping a
  // hidden second copy would duplicate wrestler content for screen readers,
  // needlessly allocate images and break the original broadcast view.
  for(const job of portraitJobs){
   const existing=job.card.querySelector(".ppw-breakdown-portraits");
   if(compact&&!existing&&full.isConnected&&!full.hidden){
    const strip=matchPortraits(job.entry);
    if(strip){strip.classList.add("ppw-breakdown-portraits");job.card.append(strip);}
   }else if(!compact)existing?.remove();
  }
  narrativeButton.setAttribute("aria-pressed",String(!compact));
  rundownButton.setAttribute("aria-pressed",String(compact));
 };
 narrativeButton.onclick=()=>setBreakdown(false);
 rundownButton.onclick=()=>setBreakdown(true);
 breakdownSwitch.append(narrativeButton,rundownButton);
 for(const entry of breakdownRows){
  const real=show.entries.find(x=>x.slotId===entry.slotId)!;
  const card=node("article","ppw-breakdown-card");
  card.dataset.kind=entry.kind;card.dataset.slotId=entry.slotId;
  const meta=node("div","ppw-breakdown-meta");
  meta.append(node("strong","","#"+(entry.position+1)+" · "+entry.kind),
   node("span","","CROWD "+Math.round(entry.crowd)+"/100"));
  if(entry.stars!==null)meta.append(node("span","ppw-breakdown-stars",
   "★ "+entry.stars.toFixed(2)+"/5"));
  if(entry.minutes!==null)meta.append(node("span","",entry.minutes+" MIN"));
  card.append(meta,node("h3","",entry.headline),
   node("p","ppw-breakdown-cast",entry.participants));
  if(real.matchContext?.sideParticipants?.length)portraitJobs.push({card,entry:real});
  const facts=node("div","ppw-breakdown-facts");
  if(entry.winner)facts.append(node("strong","","WINNER · "+entry.winner));
  facts.append(node("span","","RESULT · "+finishLabel(real)));
  for(const moment of entry.keyMoments)facts.append(node("small","",moment));
  card.append(facts);
  const open=node("button","ppw-breakdown-open","Read the full chapter") as HTMLButtonElement;
  open.type="button";
  open.setAttribute("aria-label","Read full chapter for slot "+(entry.position+1));
  open.onclick=()=>{
   setBreakdown(false);
   const target=storyLinks.get(entry.slotId);
   if(target instanceof HTMLDetailsElement)target.open=true;
   target?.scrollIntoView({block:"start",behavior:"instant"});
  };
  card.append(open);breakdown.append(card);
 }
 // Enter the chronological broadcast; the compact rundown remains one tap away.
 revealNarrative=()=>setBreakdown(false);
 setBreakdown(false);
 full.append(breakdownSwitch,breakdown,timeline);
 const after=node("section","ppw-results-page");after.dataset.page="after";
 if(effectiveSkin==="TERRITORY_TV"){
  const station=node("header","ppw-territory-chapter-head");
  station.append(node("span","ppw-territory-eyebrow","★ PPW TERRITORY TELEVISION · AFTER THE BELL"),
   node("h2","","THE AFTERMATH"),
   node("p","","FANS, RUMOURS & PRIVATE MANAGEMENT"));
  after.append(station);
 }
 if(effectiveSkin==="FIGHT_NIGHT"){
  const station=node("header","ppw-fight-chapter-head");
  station.append(node("span","ppw-fight-eyebrow","PPW / FIGHT NIGHT · THE FALLOUT"),
   node("h2","","AFTER THE BELL"),
   node("p","","FAN REACTIONS · PRIVATE MANAGEMENT REPORT"));
  after.append(station);
 }
 if(effectiveSkin==="UNDERGROUND_ZINE"){
  const station=node("header","ppw-zine-chapter-head");
  station.append(node("span","ppw-zine-eyebrow","THE UNDERGROUND REPORT · THE AFTERMATH"),
   node("h2","","AFTER THE BELL!"),
   node("p","","THE INTERNET REACTS · THE OFFICE ASSESSES"));
  after.append(station);
 }
 if(effectiveSkin==="RETRO_BOOKER_02"){
  const station=node("header","ppw-retro-chapter-head");
  station.append(node("span","ppw-retro-eyebrow","FILE 03 / POST-SHOW DESK"),
   node("h2","","AFTER THE SHOW"),
   node("p","","FAN CHAT · BACKSTAGE NOTES · MANAGEMENT"));
  after.append(station);
 }
 const officialDispatch=show.shortform?.news?node("section","ppw-news-story ppw-postshow-dispatch"):null;
 if(officialDispatch&&show.shortform?.news)
  officialDispatch.append(node("span","ppw-news-desk","OFFICIAL / CERTIFIED POST-SHOW WIRE"),
   node("h3","",show.shortform.news.headline),
   node("p","",show.shortform.news.summary));
 after.append(node("h2","ppw-broadcast-section-title","AFTER THE BELL"),
  overview,...(flowScores.length>=2?[crowdFlow]:[]),
  ...(officialDispatch?[officialDispatch]:[]),
  ...(reactions.length||wrestlerPosts.length?[noise]:[]),management,
  ...(position?[position]:[]));
 if(show.bookingClass==="PREMIUM"&&openPress){
  const press=node("section","ppw-media-scrum");
  press.append(node("span","ppw-eyebrow","FROM THE PRESS ROOM"),
   node("h2","","Meet the Press"));
  const action=node("button","ppw-results-next","Revisit press conference") as HTMLButtonElement;
  action.type="button";action.onclick=openPress;
  press.append(action);after.append(press);
 }
 const pages=[headlines,full,after];
 const goButton=(label:string,dest:0|1|2)=>{
  const button=node("button","ppw-results-next",label) as HTMLButtonElement;
  button.type="button";button.onclick=()=>changePage(dest);return button;
 };
 headlines.append(goButton("Read the Full Show",1));
 if(reactions.length||wrestlerPosts.length)
  headlines.append(goButton("HOT TAG · After the Bell",2));
 full.append(goButton("Read Post-show Brief",2));
 after.append(goButton("Return to Headlines",0));
 root.replaceChildren(...pages);
 changePage=(index:0|1|2)=>{
  for(const [i,page] of pages.entries())page.hidden=i!==index;
  // Images for the compact rundown are not fetched while headlines or
  // HOT TAG are on screen. Source links select the narrative first.
  if(index===1)setBreakdown(compactFullShow);
  window.scrollTo({top:0,behavior:"instant"});
 };
 changePage(1);
}
function metric(value:string,caption:string){
 return append(node("div","ppw-result-pulse-stat"),
  node("strong","",value),node("span","",caption));
}

/** The review region begins empty; an existing article is never replaced. */
function insertRingsideEditorial(root:HTMLElement,show:CompletedShowView,copy:RingsideCopy){
 const region=root.querySelector<HTMLElement>(".ppw-ringside-dispatch");
 if(!region||region.dataset.showId!==show.showId||
  copy.slots.length!==show.entries.length||
  !copy.slots.every((slot,i)=>slot.slotId===show.entries[i]?.slotId))return;
 region.querySelector(".ppw-ringside-await")?.remove();
 region.dataset.aiStatus="ready";
 // Verified editorial joins these scenes; mechanical interstitials belong
 // only to the offline fallback, which has no authored transitions.
 for(const bridge of root.querySelectorAll(".ppw-show-transition"))bridge.remove();
 for(const finish of root.querySelectorAll<HTMLDetailsElement>(".ppw-verified-finish-details"))
  finish.open=false; // The columnist tells the story; the source decision remains one tap away.
 root.classList.add("ppw-editorial-ready");
 const status=region.querySelector(".ppw-ringside-ai-status");
 if(status)status.textContent="GROQ ARTICLE · VERIFIED RECORD";
 const headline=region.querySelector(".ppw-final-bell-headline");
 if(headline)headline.textContent=copy.showHeadline;
 region.append(node("p","ppw-final-bell-paragraph",copy.opening));
 const full=root.querySelector<HTMLElement>('.ppw-results-page[data-page="full"]');
 if(full){
  const conclusion=node("section","ppw-ringside-conclusion");
  conclusion.append(node("span","ppw-eyebrow","FINAL WORD"),
   node("p","",copy.closing));
  full.insertBefore(conclusion,full.querySelector(".ppw-results-next"));
 }
 for(const slot of copy.slots){
  const report=Array.from(root.querySelectorAll<HTMLElement>(".ppw-ringside-slot"))
   .find(el=>el.dataset.slotId===slot.slotId);
  if(report){
   // The Groq passage is a part of one chronological article. Keep its own
   // heading and paragraphs, while the immutable match receipt stays separate.
   const paragraphs=slot.recap.split(/\n\s*\n/).map(p=>p.trim()).filter(Boolean);
   report.replaceChildren(node("h3","ppw-ringside-slot-headline",slot.headline),
    ...paragraphs.map(p=>node("p","ppw-ringside-slot-paragraph",p)));
   report.hidden=false;
  }
 }
}
function markRingsideFallback(root:HTMLElement,show:CompletedShowView){
 const region=root.querySelector<HTMLElement>(".ppw-ringside-dispatch");
 if(!region||region.dataset.showId!==show.showId)return;
 region.querySelector(".ppw-ringside-await")?.remove();
 region.dataset.aiStatus="fallback";
 const status=region.querySelector(".ppw-ringside-ai-status");
 if(status)status.textContent="RECORDED RESULT · AI ARTICLE UNAVAILABLE";
 const peak=show.entries.reduce((best,e)=>!best||e.crowdResponse>best.crowdResponse?e:best,
  undefined as ShowResultEntry|undefined);
 region.append(node("p","ppw-final-bell-paragraph",peak?.headline??
  "The completed results are in the books."));
 for(const e of show.entries){
  const report=Array.from(root.querySelectorAll<HTMLElement>(".ppw-ringside-slot"))
   .find(x=>x.dataset.slotId===e.slotId);
  if(report){report.textContent=shortResultColour(e,show.showId);report.hidden=false;}
 }
}
