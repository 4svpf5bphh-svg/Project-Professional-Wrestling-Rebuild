/** Shared expanded profile for roster, market and booking inspection.
 * Loaded explicitly on open; quick cards use their existing bounded pages.
 */
import {createWrestlerCard,wrestlerLabel} from "./wrestler-card.js";
import {portraitCredit} from "./wrestler-portrait.js";
import type {readWrestlerProfile} from "../db/wrestler-profile.js";
import type {editWrestlerRepertoire} from "../db/wrestler-profile.js";
import type {CareerView} from "../db/wrestler-career.js";
import {verifiedCareerForm} from "../domain/verified-career-form.js";
import {recordedCareerHighlights} from "../domain/recorded-career-highlights.js";
import {WRESTLING_STYLES} from "../domain/portable-persona.js";
type View=Awaited<ReturnType<typeof readWrestlerProfile>>;
type Save=Awaited<ReturnType<typeof editWrestlerRepertoire>>;
export interface WrestlerProfilePort{
 load(personId:string):Promise<View>;
 career(personId:string):Promise<CareerView>;
 save(input:{personId:string;requestId:string;expectedRevision:number;
  primaryStyle:string|null;secondaryStyle:string|null;
  signatureMoves:string[];finishingMoves:string[]}):Promise<Save>;
 openBackstage?(personId:string):void;
 openContracts?():void;
}
const el=(tag:string,cls="",text="")=>{
 const e=document.createElement(tag);e.className=cls;e.textContent=text;return e;
};
const button=(label:string,cb:()=>void,disabled=false)=>{
 const b=el("button","ppw-profile-action",label) as HTMLButtonElement;
 b.type="button";b.disabled=disabled;b.onclick=cb;return b;
};
const fmt=(n:number|null|undefined)=>n==null?"—":Math.round(n).toString();
function stat(label:string,value:number|null|undefined){
 const node=el("div","ppw-profile-stat");
 node.append(el("span","",label),el("strong","",fmt(value)));
 if(value!=null){
  const track=el("span","ppw-profile-meter");
  const bar=el("span","ppw-profile-meter-fill");
  bar.style.width=Math.max(0,Math.min(100,value))+"%";
  track.append(bar);node.append(track);
 }
 return node;
}
export function mountWrestlerProfile(root:HTMLElement,port:WrestlerProfilePort,
 personId:string,onBack?:()=>void){
 // Each dossier is a new top-level reading experience. A route from the
 // talent market or a news notification must not inherit the old scrollY.
 // Overlay dossiers own their own scroll surface and must remain scrollable.
 root.scrollTop=0;
 if(!root.classList.contains("ppw-profile-overlay"))window.scrollTo(0,0);
 let view:View|null=null,loading=false,saving=false,error="",success="";
 let career:CareerView|null=null,careerLoading=false,careerError="";
 const names=(moves:View["persona"]["signatureMoves"])=>moves.map(m=>m.name).join("\n");
 async function load(){
  loading=true;render();
  try{view=await port.load(personId);error="";}
  catch(e){error=e instanceof Error?e.message:"Wrestler profile unavailable";}
  finally{loading=false;render();}
 }
 async function save(signature:string,finisher:string,primary:string|null,secondary:string|null){
  if(!view||!view.canEdit||saving)return;
  const parse=(x:string)=>x.split(/\r?\n/).map(n=>n.trim()).filter(Boolean);
  saving=true;error="";success="";
  try{
   const result=await port.save({personId,requestId:crypto.randomUUID(),
    expectedRevision:view.worldRevision,
    primaryStyle:primary,secondaryStyle:secondary,
    signatureMoves:parse(signature),finishingMoves:parse(finisher)});
   if(result.status==="STALE")
    throw new Error("Someone has updated this wrestler. Reopen the profile before making changes.");
   success="Wrestler repertoire updated.";
   view=await port.load(personId);
  }catch(e){error=e instanceof Error?e.message:"Unable to update move names";}
  finally{saving=false;render();}
 }
 function section(title:string,description?:string){
  const x=el("section","ppw-profile-section");
  x.append(el("h2","",title));
  if(description)x.append(el("p","ppw-profile-muted",description));
  return x;
 }
 function render(){
  root.replaceChildren();root.classList.add("ppw-wrestler-profile");
  const heading=el("header","ppw-profile-header");
  if(onBack)heading.append(button("‹ Back",onBack));
  heading.append(el("span","ppw-profile-kicker","SCOUTING / WRESTLER DOSSIER"));
  root.append(heading);
  if(error)root.append(el("p","ppw-profile-message ppw-profile-error",error));
  if(!view){root.append(el("p","ppw-profile-muted",loading?
   "Opening wrestler dossier…":"Profile not available."));return;}
  if(success)root.append(el("p","ppw-profile-message",success));
  root.append(createWrestlerCard({
   personId:view.personId,name:view.name,ringName:view.persona.personaName,
   division:view.division,alignment:view.alignment,championships:view.championships,
   gimmickId:view.persona.gimmickId,primaryStyle:view.persona.primaryStyle,
   popularity:view.popularity,recognition:view.recognition,momentum:view.momentum,
   inRingQuality:view.inRingQuality,matchCraft:view.matchCraft,presentation:view.presentation,
   signatureMove:view.persona.signatureMoves[0]?.name,
   finisherMove:view.persona.finishingMoves[0]?.name,
   status:view.status==="RETIRED"?"RETIRED":
    view.medicalWeeksRemaining!=null?
     "INJURED · "+view.medicalWeeksRemaining+" WEEKS TO CLEARANCE":
    view.onYourRoster?"SIGNED TO YOUR PROMOTION":"SCOUTING REPORT"
  },{context:view.onYourRoster?"ROSTER":"MARKET",
   label:view.onYourRoster?"SIGNED TO YOUR PROMOTION":"NOT ON YOUR ROSTER"}));
  if(portraitCredit(view.name)){
   const credit=el("a","ppw-profile-photo-credit","Photo attribution and licence ↗") as HTMLAnchorElement;
   credit.href="/portrait-credits.html";credit.target="_blank";credit.rel="noopener noreferrer";
   root.append(credit);
  }

  const attrs=section("Performance & standing");
  if(view.medicalWeeksRemaining!=null)
  root.append(el("p","ppw-profile-message",
   "MEDICAL ABSENCE · "+(view.medicalSeverity??"INJURY")+
   " · "+view.medicalWeeksRemaining+" week"+
   (view.medicalWeeksRemaining===1?"":"s")+
   " until medically cleared. Booking is unavailable until recovery."));
 const grid=el("div","ppw-profile-statgrid");
  for(const [label,number] of [
   ["Popularity",view.popularity],["Recognition",view.recognition],
   ["Momentum",view.momentum],["In-ring",view.inRingQuality],
   ["Match craft",view.matchCraft],["Presentation",view.presentation],
   ["Stamina",view.stamina],["Safety",view.safety],
   ["Morale",view.morale],["Fatigue",view.fatigue],["Wear",view.wear]
  ] as const)grid.append(stat(label,number));
  attrs.append(grid);root.append(attrs);
  const character=section("Character & repertoire",
   "Their character follows them between promotions. Any change needs the wrestler's approval.");
  character.append(el("p","ppw-profile-info",
   "Character · "+wrestlerLabel(view.persona.gimmickId)+"  /  "+
   "Style · "+wrestlerLabel(view.persona.primaryStyle)+
   (view.persona.secondaryStyle?" / "+wrestlerLabel(view.persona.secondaryStyle):"")));
  const styleInputs=el("div","ppw-profile-style-inputs");
  const makeStyle=(title:string,current:string|null)=>{
   const box=el("label","ppw-profile-style");
   box.append(el("span","",title));
   const select=document.createElement("select");
   select.setAttribute("aria-label",title);select.disabled=!view!.canEdit||saving;
   const choices=[["","Not documented"],...WRESTLING_STYLES.map(x=>[x,wrestlerLabel(x)])];
   for(const [key,label] of choices){
    const opt=document.createElement("option");opt.value=key;opt.textContent=label;
    select.append(opt);
   }
   select.value=current??"";box.append(select);styleInputs.append(box);return select;
  };
  const primaryStyle=makeStyle("Primary style",view.persona.primaryStyle);
  const secondaryStyle=makeStyle("Secondary style",view.persona.secondaryStyle);
  character.append(styleInputs);
  const editor=el("div","ppw-profile-moves");
  const moveInputs:{signature?:HTMLTextAreaElement;finisher?:HTMLTextAreaElement}={};
  for(const [key,title,moves] of [
   ["signature","Signature moves",view.persona.signatureMoves],
   ["finisher","Finishers",view.persona.finishingMoves]
  ] as const){
   const group=el("label","ppw-profile-move-group");
   group.append(el("strong","",title));
   const input=document.createElement("textarea");
   input.rows=Math.max(2,Math.min(5,moves.length+1));
   input.value=names(moves);input.disabled=!view.canEdit||saving;
   input.placeholder="Not documented";input.maxLength=1000;
   input.setAttribute("aria-label",title+" (one move per line)");
   moveInputs[key]=input;group.append(input);editor.append(group);
  }
  character.append(editor);
  if(view.canEdit)character.append(button(saving?"Saving…":"Save move names",
   ()=>void save(moveInputs.signature!.value,moveInputs.finisher!.value,
    primaryStyle.value||null,secondaryStyle.value||null),saving));
  else character.append(el("p","ppw-profile-locked",
   !view.onYourRoster?"Available to inspect · editing requires a signed roster wrestler.":
    view.sharedHuman?"Editing requires agreement from all human employers.":
     "Editing is closed until next week."));
  if(view.onYourRoster&&port.openBackstage)character.append(button(
   "Discuss a gimmick change in Backstage",()=>port.openBackstage?.(personId)));
  root.append(character);
  const contract=section("Contract & availability");
  const ownContract=view.contracts.find(c=>c.isYours);
  if(ownContract){
   const c=ownContract;
   contract.append(el("p","ppw-profile-info",
    wrestlerLabel(c.family)+"  ·  "+wrestlerLabel(c.role)+
    "  ·  "+(c.remainingDates===null?"Unlimited dates":c.remainingDates+" dates left")+
    "  ·  "+(c.expiresWeekIndex-view.currentWeekIndex+1)+" weeks remaining"+
    (c.startWeekIndex>view.currentWeekIndex?
     " · starts in "+(c.startWeekIndex-view.currentWeekIndex)+" weeks":"")));
   contract.append(el("p","ppw-profile-muted",
    "Creative control · "+wrestlerLabel(c.creativeControl)+
    " · Weekly guarantee $"+Number(c.weeklyGuarantee??0).toLocaleString("en-GB")));
   if(view.onYourRoster&&port.openContracts)contract.append(button(
    "Manage contract",()=>port.openContracts?.()));
  }else contract.append(el("p","ppw-profile-muted",
   "Not signed to your promotion. Review current availability in Talent Market."));
  if(view.contracts.length){
   const other=view.contracts.filter(c=>!c.isYours);
   if(other.length)contract.append(el("p","ppw-profile-muted",
    "Also appearing for · "+other.map(c=>c.promotion+" ("+
     wrestlerLabel(c.family)+")").join(" · ")));
  }
  root.append(contract);
  const connections=section("Alliances & chemistry");
  const list=(title:string,values:string[])=>{
   const wrap=el("div","ppw-profile-affiliation");
   wrap.append(el("strong","",title),el("p","",values.join(" · ")||"None recorded"));
   return wrap;
  };
  connections.append(list("Tag teams",view.teams.map(t=>t.name)),
   list("Stables in your promotion",view.stables.map(t=>t.name)));
  if(view.connections.length)
   connections.append(list("Working relationships",view.connections.map(r=>
    r.name+" · Trust "+fmt(r.professionalTrust)+" · Familiarity "+fmt(r.familiarity))));
  root.append(connections);
  const history=section("Career & character timeline");
  history.append(el("p","ppw-profile-info","Career stage · "+
   wrestlerLabel(view.careerStage)+" · "+
   (view.status==="RETIRED"?"Retired identity":"Current identity")+" · "+
   view.persona.personaName));
  if(typeof view.biologicalAge==="number"&&Number.isFinite(view.biologicalAge)){
   history.append(el("p","ppw-profile-info","Age · "+
    view.biologicalAge.toLocaleString("en-GB",{maximumFractionDigits:1})+
    (typeof view.careerExperience!=="number"||
     !Number.isFinite(view.careerExperience)?"":
     " · Career experience · "+Math.round(view.careerExperience)+"/100")));
  }else history.append(el("p","ppw-profile-muted",
   "Original career age was not recorded for this wrestler."));
  if(view.generatedTalent&&view.debutWeekIndex!==null)
   history.append(el("p","ppw-profile-info",
    "Next generation · Entered the industry in Y"+
    (Math.floor(view.debutWeekIndex/52)+1)+" W"+
    (view.debutWeekIndex%52+1)));
  for(const era of view.history){
   history.append(el("p","ppw-profile-history",
    "Y"+(Math.floor(era.from/52)+1)+" W"+(era.from%52+1)+
    " – Y"+(Math.floor(era.to/52)+1)+" W"+(era.to%52+1)+
    "  /  "+era.persona.personaName+" · "+wrestlerLabel(era.persona.gimmickId)));
  }
  if(!view.history.length)history.append(el("p","ppw-profile-muted",
   "No earlier character changes on record."));
  root.append(history);

  // Career is consciously absent from the basic dossier response:
  // an explicit open triggers three indexed SQL reads once, not a load per card.
  const drilldown=el("details","ppw-profile-career") as HTMLDetailsElement;
  const summary=el("summary","ppw-profile-career-trigger");
  summary.append(el("span","ppw-profile-kicker","THE RECORD BOOK"),
   el("strong","","Matches, appearances, victories & championships"),
   el("small","","See their full career record"));
  drilldown.append(summary);
  const careerBody=el("div","ppw-profile-career-body");
  drilldown.append(careerBody);
  const timelineWeek=(index:number)=>"Y"+(Math.floor(index/52)+1)+" W"+(index%52+1);
  const paintCareer=()=>{
   if(!root.contains(drilldown))return;
   careerBody.replaceChildren();
   if(careerLoading)careerBody.append(el("p","ppw-profile-muted","Checking the record books…"));
   if(careerError){
    careerBody.append(el("p","ppw-profile-message ppw-profile-error",careerError),
     button("Retry career record",()=>void loadCareer()));return;
   }
   if(!career)return;
   const stats=el("div","ppw-profile-career-scoreboard");
   for(const [title,value] of [
    ["MATCHES",String(career.summary.matches)],
    ["WINS",String(career.summary.wins)],
    ["LOSSES",String(career.summary.losses)],
    ["SINGLES",String(career.summary.singles)],
    ["TAG",String(career.summary.tag)],
    ["AVG RATING",career.summary.averageStars===null?
     "Not rated":career.summary.averageStars.toFixed(2)+"★"],
    ["BEST",career.summary.bestStars===null?
     "Not rated":career.summary.bestStars.toFixed(2)+"★"],
    ["INJURIES",String(career.summary.injuries)]
   ] as const){
    const tile=el("article","ppw-profile-career-stat");
    tile.append(el("small","",title),el("strong","",value));stats.append(tile);
   }
   careerBody.append(stats);
   // Spotlight recorded reigns and career stage without another API read.
   const highlights=recordedCareerHighlights({
    status:view!.status,careerStage:view!.careerStage,
    summary:career.summary,currentChampionships:career.currentChampionships??[],
    singlesTitles:career.singlesTitles
   });
   if(highlights.length){
    const spotlight=el("section","ppw-career-spotlight");
    spotlight.append(el("span","ppw-profile-kicker","CAREER SPOTLIGHT"),
     el("h3","","Chapters written in the ring"));
    for(const highlight of highlights){
     const item=el("article","ppw-career-spotlight-item");
     item.append(el("strong","",highlight.headline),
      el("p","",highlight.detail));spotlight.append(item);
    }
    careerBody.append(spotlight);
   }
   const form=verifiedCareerForm(career.recent);
   const formSection=el("section","ppw-career-form");
   formSection.append(el("span","ppw-profile-kicker","RECENT FORM"),
    el("h3","","The last five matches"));
   if(!form.sequence.length)formSection.append(
    el("p","ppw-profile-muted",form.note));
   else{
    const rail=el("div","ppw-career-form-rail");
    rail.setAttribute("aria-label","Recent results, newest first: "+
     form.sequence.map(outcome=>outcome==="W"?"Win":"Loss").join(", "));
    for(const [i,outcome] of form.sequence.entries()){
     const chip=el("span","ppw-career-form-chip "+(outcome==="W"?
      "ppw-career-form-win":"ppw-career-form-loss"),outcome);
     chip.title="Match "+(i+1)+(i===0?" (most recent)":"")+
      ": "+(outcome==="W"?"Win":"Loss");
     rail.append(chip);
    }
    formSection.append(rail,
     el("p","ppw-career-form-record",form.wins+" wins · "+
      form.losses+" losses in the last "+form.recentCount+
      " completed match"+(form.recentCount===1?"":"es")));
    if(form.currentRun&&form.currentRun.length>=2){
     formSection.append(el("p","ppw-career-form-run",
      (form.currentRun.result==="W"?"Won ":"Lost ")+form.currentRun.length+
      " consecutive verified matches"));
    }
    formSection.append(el("p","ppw-profile-muted",form.note));
   }
   if(form.ratingTrend){
    const trend=form.ratingTrend;
    const direction=form.breakoutRun?"A breakout stretch in the ring":
     trend.direction==="HIGHER"?"Higher match ratings":
     trend.direction==="LOWER"?"Lower match ratings":"Similar match ratings";
    const detail=trend.direction==="SIMILAR"?
     "The last four bouts drew similar ratings to the preceding four.":
     "The latest four matches averaged "+trend.recentAverage.toFixed(2)+
      "★ against "+trend.previousAverage.toFixed(2)+"★ in the prior four.";
    const pulse=el("div","ppw-career-rating-trend"+
     (form.breakoutRun?" ppw-career-rating-breakout":""));
    pulse.append(el("strong","",direction),el("p","",detail),
     el("small","ppw-profile-muted",
      "Rated matches: "+trend.recentRated+" recent, "+
      trend.previousRated+" earlier. Ratings describe bouts, not skill changes."));
    formSection.append(pulse);
   }else if(career.recent.length>=4)
    formSection.append(el("p","ppw-profile-muted",
     "A reliable match-rating comparison needs at least three rated bouts in each of two four-match windows."));
   careerBody.append(formSection);
   const earned=el("section","ppw-profile-career-honors");
   earned.append(el("h3","","Earned reputations"),
    el("p","ppw-profile-muted","Verified matches and championship honours; current form can change."));
   if(!(career.reputations??[]).length)earned.append(el("p","ppw-profile-muted",
    "No reputation has met the evidence threshold yet."));
   for(const reputation of career.reputations??[]){
    const item=el("article","ppw-profile-career-match");
    item.append(el("strong","",reputation.name),el("span","",reputation.evidence));
    earned.append(item);
   }
   careerBody.append(earned);
   const appearances=el("section","ppw-profile-career-honors");
   appearances.append(el("h3","","On-screen appearances"),
    el("p","ppw-profile-muted",
     "Only completed matches and live moments count. Video packages and unused bookings do not."));
   const history=career.liveAppearances??[];
   if(!history.length)appearances.append(el("p","ppw-profile-muted",
    "No verified promotion appearance history is available."));
   for(const record of history){
    const row=el("article","ppw-profile-career-match");
    const note=record.status==="DEBUT_ELIGIBLE"?
     "First in-person appearance available":
     record.status==="RETURN_ELIGIBLE"?
      "Return available · "+record.weeksSinceLast+" weeks since last appearance":
     record.status==="ESTABLISHED"?"Recently seen in person":
     "Earlier on-screen history is incomplete";
    row.append(el("strong","",record.promotion),
     el("span","",note));
    if(record.recordedShows>0){
     row.append(el("p","ppw-profile-muted",
      record.historyComplete?"Shows appeared on: "+record.recordedShows:
       "Verified appearances: "+record.recordedShows+" · older records may be missing"),
      el("small","ppw-profile-muted",
       "First verified: "+
       (record.firstWeekIndex===null?"Unknown":timelineWeek(record.firstWeekIndex))+
       " · Latest verified: "+
       (record.lastWeekIndex===null?"Unknown":timelineWeek(record.lastWeekIndex))));
    }else if(record.status==="DEBUT_ELIGIBLE")row.append(
     el("p","ppw-profile-muted","No completed in-person appearance recorded here."));
    appearances.append(row);
   }
   careerBody.append(appearances);
   const championship=el("section","ppw-profile-career-honors");
   championship.append(el("h3","","Current championships"));
   const held=career.currentChampionships??[];
   if(!held.length)championship.append(el("p","ppw-profile-muted",
    "No currently held singles or tag titles on record."));
   for(const belt of held){
    const item=el("article","ppw-profile-career-match");
    item.append(el("strong","",belt.name),
     el("span","",belt.promotion+" · "+
      (belt.holderType==="TEAM"?"Tag champions"+(belt.teamName?" · "+belt.teamName:""):
       "Singles champion")+" · Since "+timelineWeek(belt.startWeekIndex)+
      " · "+belt.defenses+" defences"));
    championship.append(item);
   }
   careerBody.append(championship);
   const honors=el("section","ppw-profile-career-honors");
   honors.append(el("h3","","Singles championship honours"));
   if(!career.singlesTitles.length)honors.append(el("p","ppw-profile-muted",
    "No singles championship reigns on record."));
   for(const belt of career.singlesTitles){
    const row=el("article","ppw-profile-career-match");
    row.append(el("strong","",belt.name),
     el("span","",belt.promotion+" · "+timelineWeek(belt.startWeekIndex)+
      " – "+(belt.endedWeekIndex===null?"Current":timelineWeek(belt.endedWeekIndex))+
      " · "+belt.defenses+" defences"));
    honors.append(row);
   }
   careerBody.append(honors);
   const medical=el("section","ppw-profile-career-honors");
   medical.append(el("h3","","Recorded match injuries"));
   medical.append(el("p","ppw-profile-muted",
    view?.medicalWeeksRemaining!=null?
     "Current medical status: "+view.medicalWeeksRemaining+" week"+
     (view.medicalWeeksRemaining===1?"":"s")+" to clearance.":
     "No current medical absence is recorded."));
   const incidents=career.injuryHistory??[];
   if(!incidents.length)medical.append(el("p","ppw-profile-muted",
    "No verified match injuries on record."));
   for(const injury of incidents){
    const item=el("article","ppw-profile-career-match");
    item.append(el("strong","",wrestlerLabel(injury.severity)+" injury"),
     el("span","",injury.promotion+" · Y"+injury.year+" W"+injury.week+
      " · "+injury.format+" · original estimate "+
      injury.originalWeeksOut+" week"+(injury.originalWeeksOut===1?"":"s")+" out"),
     el("small","ppw-profile-muted",
      "Original scheduled return · "+timelineWeek(
        (injury.year-1)*52+injury.week-1+injury.originalWeeksOut)+
       ". Current eligibility is shown in the medical status above."));
    medical.append(item);
   }
   careerBody.append(medical);
   const recents=el("section","ppw-profile-career-recents");
   recents.append(el("h3","","Latest completed matches"));
   if(!career.recent.length)recents.append(el("p","ppw-profile-muted",
    "No completed matches on record yet."));
   for(const match of career.recent){
    const row=el("article","ppw-profile-career-match");
    const outcome=el("span","ppw-profile-career-outcome "+(match.won?
     "ppw-profile-career-win":"ppw-profile-career-loss"),match.won?"WIN":"LOSS");
    const top=el("div","ppw-profile-career-matchtop");
    top.append(outcome,el("strong","",match.showName),
     el("span","ppw-profile-career-stars",
      match.stars===null?"Unrated":match.stars.toFixed(2)+"★"));
    row.append(top,el("p","ppw-profile-muted",
     match.promotion+" · Y"+match.year+" W"+match.week+" · "+
     match.format+" · "+match.finish.replaceAll("_"," ").toLowerCase()+
     (match.minutes===null?"":" · "+match.minutes+" min")));
    if(Array.isArray(match.partners)&&Array.isArray(match.opponents)){
     const participants=[
      ...(match.partners.length?["Tag partners: "+match.partners.join(" & ")]:[]),
      ...(match.opponents.length?["Opponents: "+match.opponents.join(" · ")]:[])
     ];
     if(participants.length)row.append(el("p","ppw-profile-career-lineup",
      participants.join("  /  ")));
    }else row.append(el("p","ppw-profile-muted",
     "Opponents not verified in older match records."));
    if(match.injury!==null)
     row.append(el("p","ppw-profile-career-injury",
      match.injury+" injury"+(match.weeksOut===null?"":" · "+match.weeksOut+" weeks out")));
    recents.append(row);
   }
   careerBody.append(recents);
   if(career.recent.length>=12)careerBody.append(el("p","ppw-profile-muted",
    "Showing the 12 most recent matches. Career totals include earlier appearances."));
  };
  async function loadCareer(){
   if(careerLoading||career)return;
   careerError="";careerLoading=true;paintCareer();
   try{career=await port.career(personId);}
   catch(e){careerError=e instanceof Error?e.message:"Career records unavailable";}
   finally{careerLoading=false;paintCareer();}
  }
  drilldown.addEventListener("toggle",()=>{
   if(drilldown.open){if(!career&&!careerLoading)void loadCareer();else paintCareer();}
  });
  root.append(drilldown);
 }
 void load();return {reload:load};
}
