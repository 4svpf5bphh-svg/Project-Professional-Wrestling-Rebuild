/** PPW Ringside: a results broadcast, not a spreadsheet of resolution receipts.
 * Player-authored finishes remain sovereign; editorial copy is derived from
 * verified scores, written stories and the original locked card.
 */
import type {CompletedShowView,ShowResultEntry} from "../db/show-results-view.js";
import type {ScrumQuestionId} from "../domain/premium-media-scrum.js";
type MediaScrumView={showId:string;showName?:string;questions:{
 id:ScrumQuestionId;journalist:string;question:string;
 answers:readonly [string,string,string];answerIndex:number|null
}[]};
type MediaScrumPort={
 read():Promise<MediaScrumView>;
 answer(questionId:ScrumQuestionId,answerIndex:number):Promise<{
  questionId:ScrumQuestionId;answerIndex:number;answer:string;saved:boolean
 }>;
};
import {postShowHandoff,type NextStepDestination} from "../domain/post-show-handoff.js";
import type {RingsideCopy} from "../domain/ringside-editorial.js";
import {createWrestlerPortrait} from "./wrestler-portrait.js";
import {showBroadcastHighlights} from "../domain/show-broadcast-highlights.js";
import {writeFinalBellEditorial} from "../domain/show-broadcast-editorial.js";
import {showReactionWire} from "../domain/show-reaction-wire.js";
import {showCrowdFlow} from "../domain/show-crowd-flow.js";
import {replayVerifiedMatchFinish} from "../domain/show-finish-replay.js";
import {shortResultColour} from "../domain/show-result-colour.js";
import {broadcastShowPulse,broadcastTone,reviewCompletedEntry}
 from "../domain/show-broadcast-review.js";

type ResultFilter="ALL"|"MATCH"|"SEGMENT";
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
  RETRIEVAL:"Prize retrieval",TABLE_BREAK:"Table break",TEN_COUNT:"Ten-count knockout"};
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
 mediaScrum?:MediaScrumPort;
 openNext?:(section:NextStepDestination)=>void;
}){
 root.classList.add("ppw-editor","ppw-results");
 root.replaceChildren(node("p","ppw-muted","Preparing the ringside report…"));
 try{
  const show=await port.load();
  renderBroadcast(root,show,port.openNext,port.mediaScrum);
  if(port.commentary)void port.commentary().then(result=>{
   if(root.querySelector(".ppw-ringside-dispatch")?.getAttribute("data-show-id")!==show.showId)return;
   if(result.status==="ready"&&result.review)
    insertRingsideEditorial(root,show,result.review);
   else markRingsideFallback(root,show);
  }).catch(()=>markRingsideFallback(root,show));
  else markRingsideFallback(root,show);
 }catch(e){showError(root,e);}
}
export function renderBroadcast(root:HTMLElement,show:CompletedShowView,
 openNext?:(section:NextStepDestination)=>void,mediaScrum?:MediaScrumPort):void{
 root.classList.remove("ppw-editorial-ready");
 const pulse=broadcastShowPulse(show.entries);
 const tone=broadcastTone(show.crowdResponse);
 let changePage:(page:0|1|2)=>void=()=>{};
 const header=node("header","ppw-result-hero ppw-tone-"+tone.toLowerCase());
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
    changePage(1);setFilter("ALL");
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
 const reactions=showReactionWire(show);
 const noise=node("section","ppw-crowd-noise");
 if(reactions.length){
  append(noise,node("span","ppw-eyebrow","PPW / FICTIONAL FAN REACTIONS"),
   node("h2","ppw-crowd-noise-title","THE NOISE AFTER THE BELL"),
   node("p","ppw-crowd-noise-disclaimer",
    "Fictional in-World fan chatter inspired by the completed show. Not real posts or accounts."));
  const wall=node("div","ppw-crowd-noise-wall");
  for(const reaction of reactions){
   const card=document.createElement("button");card.type="button";
   card.className="ppw-crowd-noise-card ppw-reaction-"+reaction.mood.toLowerCase();
   card.setAttribute("aria-label","Open source result for "+reaction.voice+": "+reaction.text);
   append(card,node("span","ppw-crowd-noise-voice",reaction.voice),
    node("span","ppw-crowd-noise-quote",reaction.text));
   if(reaction.reply){
    const reply=node("span","ppw-crowd-noise-reply");
    append(reply,node("span","ppw-crowd-noise-reply-voice",reaction.reply.voice),
     node("span","ppw-crowd-noise-reply-text",reaction.reply.text));
    card.append(reply);
   }
   card.append(node("span","ppw-crowd-noise-read","VIEW RECORDED MOMENT ↗"));
   card.onclick=()=>{
    changePage(1);setFilter("ALL");
    const target=storyLinks.get(reaction.slotId);
    if(target instanceof HTMLDetailsElement)target.open=true;
    target?.scrollIntoView({behavior:"smooth",block:"center"});
   };
   append(wall,card);
  }
  append(noise,wall);
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
    changePage(1);setFilter("ALL");
    const target=storyLinks.get(item.slotId);
    if(target instanceof HTMLDetailsElement)target.open=true;
    target?.scrollIntoView({behavior:"smooth",block:"center"});
   });
   append(highlights,button);
  }
 }
 const timeline=node("section","ppw-result-timeline");
 append(timeline,node("h2","ppw-broadcast-section-title","THE FULL SHOW"));
 const controls=node("div","ppw-result-filters");
 const filters:Record<ResultFilter,HTMLButtonElement>={} as Record<ResultFilter,HTMLButtonElement>;
 const entries:({element:HTMLElement;lead:HTMLElement;type:ShowResultEntry["type"]})[]=[];
 let activeFilter:ResultFilter="ALL";
 const setFilter=(filter:ResultFilter)=>{
  activeFilter=filter;
  for(const key of Object.keys(filters) as ResultFilter[]){
   filters[key].setAttribute("aria-pressed",String(key===filter));
  }
  for(const row of entries){row.element.hidden=filter!=="ALL"&&row.type!==filter;
   row.lead.hidden=row.element.hidden;}
 };
 for(const [filter,buttonText] of [["ALL","Full show"],["MATCH","Matches"],["SEGMENT","Angles"]] as const){
  const button=document.createElement("button");button.type="button";
  button.className="ppw-result-filter";button.textContent=buttonText;
  button.addEventListener("click",()=>setFilter(filter));
  filters[filter]=button;
  append(controls,button);
 }
 append(timeline,controls);
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
  // The columnist's account precedes the permanently visible verified finish.
  // Staff will eventually deliver analysis; no simulated Booker Breakdown.
  const finish=replayVerifiedMatchFinish(entry);
  if(finish){
   const replay=node("section","ppw-finish-replay ppw-finish-"+finish.tone.toLowerCase());
   replay.setAttribute("aria-label","Finish replay");
   append(replay,node("span","ppw-finish-eyebrow","◉ OFFICIAL FINISH"),
    node("strong","ppw-finish-title",finish.title));
   const finishNotes=document.createElement("details");
   finishNotes.className="ppw-verified-finish-details";
   finishNotes.open=true; // Readable when AI editorial is unavailable.
   finishNotes.append(node("summary","","Read the certified finish"),
    node("p","ppw-finish-description",finish.description));
   replay.append(finishNotes);
   if(finish.winnerLabel)
    append(replay,node("p","ppw-finish-winner","WINNER: "+finish.winnerLabel));
   append(body,replay);
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
  if(entry.performerIdentities?.length){
   const profiles=node("div","ppw-result-personas");
   for(const person of entry.performerIdentities){
    const tag=node("div","ppw-result-persona");
    append(tag,node("strong","",person.ringName),
     node("span","",label(person.character)));
    if(person.style)append(tag,node("small","",label(person.style)));
    append(profiles,tag);
   }
   append(body,profiles);
  }
  append(details,body);
  storyLinks.set(entry.slotId,details);
  const lead=node("p","ppw-show-transition",
   transitionFor(show.entries,index,show.showName??"The show"));
  entries.push({element:details,lead,type:entry.type});
  append(timeline,lead,details);
 }
 setFilter("ALL");
 // Re-rendering the report is fully client-side; caller controls the show scope.
 const report=show.staffReport;
 const management=node("section","ppw-post-show-brief");
 management.append(node("span","ppw-eyebrow","PPW / MANAGEMENT"),
  node("h2","","POST-SHOW MANAGEMENT BRIEF"));
 // The historical show report does not claim these concerns are still live.
 const handoff=postShowHandoff(show);
 management.append(node("p","ppw-post-show-guidance",
  "Your call. These observations are from this show; check the current World before acting."));
 const choices=node("div","ppw-next-show-actions");
 for(const task of handoff.actions){
  const item=node("article","ppw-next-show-choice");
  const copy=node("div","ppw-next-show-copy");
  copy.append(node("span","ppw-eyebrow",task.eyebrow),
   node("h3","",task.headline),
   node("p","",task.detail));
  item.append(copy);
  if(openNext){
   const control=node("button","ppw-next-show-route",task.action) as HTMLButtonElement;
   control.type="button";control.onclick=()=>openNext(task.destination);
   item.append(control);
  }
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
  const strongest=show.entries.find(entry=>entry.slotId===report.strongestMatchId);
  if(strongest)office.append(node("p","ppw-road-agent-standout",
   "If I were showing the locker room one match from tonight, it'd be "+
    strongest.headline+"."));
  management.append(office);
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
 const analysis=document.createElement("details");
 analysis.className="ppw-results-analysis";
 analysis.append(node("summary","","MANAGER ANALYSIS · Audience & production"));
 const stats=node("div","ppw-results-analysis-stats");
 stats.append(scoreWrap,pulseRow);analysis.append(stats);
 if(flowScores.length>=2)analysis.append(crowdFlow);
 if(gorilla&&gorilla.crowdAdjustment>0)analysis.append(node("p","ppw-muted",
  "Internal recovery adjustment: +"+gorilla.crowdAdjustment.toFixed(1)+
  " audience response. Certified results remain unchanged."));
 // All three chapters reuse one immutable completed show; no extra reads.
 const headlines=node("section","ppw-results-page");headlines.dataset.page="headlines";
 headlines.append(header,feature,...(featured.length?[highlights]:[]));
 const full=node("section","ppw-results-page");full.dataset.page="full";
 full.append(timeline);
 const after=node("section","ppw-results-page");after.dataset.page="after";
 after.append(node("h2","ppw-broadcast-section-title","AFTER THE BELL"),
  ...(reactions.length?[noise]:[]),management,
  ...(position?[position]:[]),analysis);
 if(show.bookingClass==="PREMIUM"&&mediaScrum){
  const scrumPort=mediaScrum;
  const press=node("section","ppw-media-scrum");
  press.append(node("span","ppw-eyebrow","AFTER THE MAIN EVENT"),
   node("h2","","The Media Scrum"),
   node("p","ppw-muted",
    "Answer the wrestling press in your own voice. The questions follow the certified show; your quotes are recorded once."));
  const open=node("button","ppw-results-next","Meet the press") as HTMLButtonElement;
  open.type="button";open.setAttribute("aria-expanded","false");
  const content=node("div","ppw-media-scrum-content");
  let loaded=false,working=false,view:MediaScrumView|null=null;
  function draw(){
   content.replaceChildren();
   if(!view)return;
   for(const q of view.questions){
    const article=node("article","ppw-media-scrum-question");
    article.append(node("span","ppw-eyebrow",q.journalist),
     node("p","ppw-media-scrum-prompt",q.question));
    if(q.answerIndex!==null){
     article.append(node("p","ppw-media-scrum-quote",
      "You: “"+q.answers[q.answerIndex]+"”"));
    }else{
     const choices=node("div","ppw-media-scrum-choices");
     q.answers.forEach((answer,index)=>{
      const selection=node("button","ppw-legend-button",answer) as HTMLButtonElement;
      selection.type="button";selection.disabled=working;
      selection.onclick=async()=>{
       if(working||!view)return;working=true;
       choices.querySelectorAll("button").forEach(b=>(b as HTMLButtonElement).disabled=true);
       try{
        const recorded=await scrumPort.answer(q.id,index);
        q.answerIndex=recorded.answerIndex;draw();
       }catch(e){choices.append(node("p","ppw-alert ppw-error",
         e instanceof Error?e.message:"Could not save the answer"));working=false;}
       finally{working=false;}
      };
      choices.append(selection);
     });
     article.append(choices);
    }
    content.append(article);
   }
  }
  open.onclick=async()=>{
   if(working)return;
   if(open.getAttribute("aria-expanded")==="true"){
    open.setAttribute("aria-expanded","false");content.hidden=true;return;
   }
   open.setAttribute("aria-expanded","true");content.hidden=false;
   if(loaded){draw();return;}
   open.disabled=true;
   content.replaceChildren(node("p","ppw-muted","The journalists are gathering…"));
   try{view=await scrumPort.read();loaded=true;draw();}
   catch(e){content.replaceChildren(node("p","ppw-alert ppw-error",
     e instanceof Error?e.message:"Press scrum unavailable"));}
   finally{open.disabled=false;}
  };
  press.append(open,content);content.hidden=true;after.append(press);
 }
 const steps=node("nav","ppw-results-steps");
 steps.setAttribute("aria-label","Results chapters");
 const pages=[headlines,full,after];
 const labels=["Headlines & Ringside","The Full Show","Post-show Brief"];
 const tabButtons:HTMLButtonElement[]=[];
 const goButton=(label:string,dest:0|1|2)=>{
  const button=node("button","ppw-results-next",label) as HTMLButtonElement;
  button.type="button";button.onclick=()=>changePage(dest);return button;
 };
 for(const [index,label] of labels.entries()){
  const button=goButton(label,index as 0|1|2);
  button.className="ppw-results-step";tabButtons.push(button);steps.append(button);
 }
 headlines.append(goButton("Read the Full Show",1));
 full.append(goButton("Read Post-show Brief",2));
 after.append(goButton("Return to Headlines",0));
 root.replaceChildren(steps,...pages);
 changePage=(index:0|1|2)=>{
  for(const [i,page] of pages.entries())page.hidden=i!==index;
  for(const [i,button] of tabButtons.entries())
   button.setAttribute("aria-current",i===index?"step":"false");
  window.scrollTo({top:0,behavior:"instant"});
 };
 changePage(0);
}
function metric(value:string,caption:string){
 return append(node("div","ppw-result-pulse-stat"),
  node("strong","",value),node("span","",caption));
}

/** The review region begins empty; an existing article is never replaced. */
function insertRingsideEditorial(root:HTMLElement,show:CompletedShowView,copy:RingsideCopy){
 const region=root.querySelector<HTMLElement>(".ppw-ringside-dispatch");
 if(!region||region.dataset.showId!==show.showId||
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
