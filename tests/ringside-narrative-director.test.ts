import test from "node:test";
import assert from "node:assert/strict";
import type {CompletedShowView,ShowResultEntry} from "../src/db/show-results-view.js";
import {directRingsideMatch,directRingsideAngle,directRingsideShow}
 from "../src/domain/ringside-narrative-director.js";
import {ringsideViewerCallback,type RingsideStoryThread}
 from "../src/domain/ringside-story-threads.js";
import {ringsideBrief,RINGSIDE_STYLE_GUIDE,RINGSIDE_PROMPT_VERSION,ringsideReaderQualityIssue,validateRingsideCopy}
 from "../src/domain/ringside-editorial.js";
import {inspectRingsidePrompt,generateGroqReview,type RingsideGenerationTrace} from "../src/db/ringside-commentary.js";

function match(id:string,position:number,input:{
 sides:string[][];winners:string[];finish:string;stars:number;crowd:number;
 duration:number;title?:boolean;weapon?:"CHAMPIONSHIP_BELT";bump?:boolean
}):ShowResultEntry{
 return {slotId:id,position,type:"MATCH",headline:id,
  summary:"The match ended with "+input.winners.join(" & ")+" winning.",
  outcome:input.finish,crowdResponse:input.crowd,actorIds:[],targetIds:[],
  matchContext:{format:input.sides[0]!.length>1?"2v2":input.sides.length>2?"3-WAY":"SINGLES",
   intent:"COMPETITIVE",plannedMinutes:input.duration,
   sides:input.sides,winnerNames:input.winners,
   championshipContested:input.title??false,
   ...(input.weapon?{finishProp:input.weapon}:{}),
   ...(input.bump?{refereeSpot:"REF_BUMP" as const}:{})},
  fallout:{ratingStars:input.stars,actualMinutes:input.duration,
   injuries:[],eliminations:[],
   ...(input.title?{title:{name:"CWA World Championship",
    winnerName:input.winners[0]!,priorHolderName:input.winners[0]!,
    changed:false}}:{})}
 };
}
function angle(id:string,position:number,kind:string,actors:string[],
 targets:string[],score:number,crowd:number,
 scriptedActions:{action:"SPEAK"|"CHALLENGE";by:string;to?:string;line:string}[]):ShowResultEntry{
 return {slotId:id,position,type:"SEGMENT",headline:id,summary:"A televised "+kind,
  outcome:"HAPPENS",crowdResponse:crowd,segmentRatingStars:score,
  actorIds:actors.map((_,i)=>"actor-"+i),targetIds:targets.map((_,i)=>"target-"+i),
  segmentKind:kind,segmentContext:{actorNames:actors,targetNames:targets,
   targetPresence:targets.length?"MENTIONED":null,
   videoPurpose:kind==="VIDEO_PACKAGE"?"FEUD_RECAP":null,
   stableDecision:null,turnTargetAlignment:null,
   scriptedActions},
  };
}
const regal=angle("regal-debut",0,"DEBUT",["William Regal"],[],4,89.2,
 [{by:"actor-0",action:"SPEAK",line:"I have come to CWA to deal with all these scallywags."}]);
const bayne=match("bayne-threeway",1,{sides:[["Mayu Iwatani"],["Megan Bayne"],["Julia Hart"]],
 winners:["Megan Bayne"],finish:"FLASH_PIN",stars:3.25,crowd:63.9,duration:10});
const joePromo=angle("joe-promo",2,"PROMO",["Samoa Joe"],["Matt Riddle"],3.75,83.1,
 [{by:"actor-0",to:"target-0",action:"SPEAK",line:"Listen you son of a bitch, if I see you, I will end you."}]);
const oreilly=match("oreilly-sabin",3,{sides:[["Kyle O'Reilly"],["Chris Sabin"]],
 winners:["Kyle O'Reilly"],finish:"CLEAN_PIN",stars:3.25,crowd:62.5,duration:20});
const gunn=angle("gunn-interview",4,"INTERVIEW",["Austin Gunn","Colten Gunn"],
 ["Iziah Hunter","Juice Robinson"],3.25,69.1,
 [{by:"actor-0",to:"target-0",action:"SPEAK",line:"I'm not sure you belong here at all."}]);
const joeMatch=match("joe-lethal",5,{sides:[["Samoa Joe"],["Jay Lethal"]],
 winners:["Samoa Joe"],finish:"SUBMISSION",stars:3.25,crowd:69.2,duration:16});
const video=angle("perfect-video",6,"VIDEO_PACKAGE",["Mr. Perfect"],
 ["Konosuke Takeshita"],3.5,77.9,[]);
const title=match("mistico-regal",7,{sides:[["Místico"],["William Regal"]],
 winners:["Místico"],finish:"FOREIGN_OBJECT",stars:4.25,crowd:84.7,duration:25,
 title:true,weapon:"CHAMPIONSHIP_BELT",bump:true});
const taker=angle("undertaker-interview",8,"INTERVIEW",["The Undertaker"],[],
 4,92.9,[{by:"actor-0",action:"SPEAK",
 line:"I'm coming for the CWA World Championship. May you Rest in Peace."}]);
const ascension:CompletedShowView={showId:"ascension-w29",showName:"Ascension",
 year:1,week:29,promotionName:"Chaotic Wrestling Alliance",
 crowdResponse:76.2,matchCount:4,angleCount:5,
 entries:[regal,bayne,joePromo,oreilly,gunn,joeMatch,video,title,taker]};

test("CWA Ascension gets one justified main headline and two recognisable supporting moments",()=>{
 const focus=directRingsideShow(ascension);
 assert.deepEqual(focus,{lead:"card_7",support:["card_0","card_8"]});
 const brief=ringsideBrief(ascension);
 assert.deepEqual(brief.showFocus,focus);
 assert.deepEqual(brief.slots.map(x=>x.key),
  Array.from({length:9},(_,i)=>"card_"+i),"show order never changes");
 assert.equal(brief.slots.length,9);
 assert.deepEqual(brief.slots[7]?.director,directRingsideMatch(title));
 assert.deepEqual(brief.slots[0]?.director,directRingsideAngle(regal));
 assert.equal(brief.slots[7]?.fallout?.title?.changed,false);
 assert.doesNotMatch(JSON.stringify(focus),/Week|star|rating/);
});
test("Match Director understands why a pin is NOT an armbar submission",()=>{
 const clean=directRingsideMatch(oreilly)!;
 assert.match(clean.decisive,/separate legal three-count/);
 assert.match(clean.decisive,/prior hold is released or escaped/);
 assert.match(clean.verdict,/Solid but imperfect/);
 assert.doesNotMatch(clean.verdict,/masterpiece/i);
 const submission=directRingsideMatch(joeMatch)!;
 assert.match(submission.decisive,/tap or referee stoppage, no pinfall/);
 const flash=directRingsideMatch(bayne)!;
 assert.match(flash.setup,/No tags|all rivals|opponents/i);
 assert.match(flash.decisive,/sudden cradle or roll-up/);
 const cheat=directRingsideMatch(title)!;
 assert.match(cheat.decisive,/championship belt/);
 assert.match(cheat.decisive,/referee is down/);
 assert.match(cheat.decisive,/Do not award a new title/);
 assert.match(cheat.verdict,/excellent performance/i);
});
test("Director scales credible drama without over-selling a squash or bad match",()=>{
 const bad=match("poor",0,{sides:[["A"],["B"]],winners:["A"],
  finish:"CLEAN_PIN",stars:1.5,crowd:34,duration:6});
 assert.match(directRingsideMatch(bad)!.turn,/quick tactical opening/);
 assert.match(directRingsideMatch(bad)!.verdict,/disappointing or awkward/);
 const classic=match("classic",0,{sides:[["A"],["B"]],winners:["B"],
  finish:"CLEAN_PIN",stars:4.75,crowd:91,duration:27});
 assert.match(directRingsideMatch(classic)!.turn,/ONE earned near-fall/);
 assert.match(directRingsideMatch(classic)!.verdict,/exceptional contest/);
 const tags=match("teams",0,{sides:[["A","B"],["C","D"]],
  winners:["A","B"],finish:"CLEAN_PIN",stars:3.5,crowd:69,duration:14});
 assert.match(directRingsideMatch(tags)!.setup,/one legal wrestler per team/);
 assert.match(directRingsideMatch(tags)!.decisive,/winning side|A & B/);
});
test("Every verified special finish remains legal in the director, not a normal pin",()=>{
 const finishes=["RETRIEVAL","TABLE_BREAK","TEN_COUNT","MOST_FALLS",
  "SECOND_FALL","VERBAL_SURRENDER","FIRST_BLOOD","CASKET_CLOSE",
  "DISQUALIFICATION","INJURY_STOPPAGE","PROTECTED_FINISH"];
 for(const finish of finishes){
  const e=match(finish,0,{sides:[["A"],["B"]],winners:["A"],
   finish,stars:3.5,crowd:66,duration:18});
  const direction=directRingsideMatch(e)!;
  assert.ok(direction.decisive.includes("A"),finish);
  assert.ok(direction.setup&&direction.turn&&direction.verdict);
  if(finish==="RETRIEVAL"||finish==="VERBAL_SURRENDER"||finish==="CASKET_CLOSE")
   assert.match(direction.decisive,/no|No/);
 }
});
test("Debut, scripted promo, interview, video and attack get different treatments",()=>{
 const debut=directRingsideAngle(regal)!;
 assert.match(debut.focus,/genuine first appearance/);
 assert.match(debut.focus,/major segment/);
 const promo=directRingsideAngle(joePromo)!;
 assert.match(promo.focus,/exact scripted statement/);
 assert.match(promo.screen,/mentioned, not present or replying/);
 const interview=directRingsideAngle(taker)!;
 assert.match(interview.focus,/speaker's actual words/);
 const pkg=directRingsideAngle(video)!;
 assert.match(pkg.focus,/no unverified footage/);
 const attack:ShowResultEntry={...joePromo,slotId:"attack",segmentKind:"ATTACK",
  segmentContext:{...joePromo.segmentContext!,scriptedActions:[
   {action:"ATTACK",by:"actor-0",to:"target-0"}]}};
 assert.match(directRingsideAngle(attack)!.screen,/certified physical sequence/);
 assert.doesNotMatch(debut.focus,/match result|pinfall/);
});
test("Rivalry history is presented as a viewer callback, never angle/week counts",()=>{
 const thread:RingsideStoryThread={
  rivalry:{pairing:"Mr. Perfect vs Konosuke Takeshita",previousMatches:1,
   previousAngles:3,lastMatch:"Year 1, Week 25",lastWinner:"Mr. Perfect"},
  earlierOnThisCard:{card:3,kind:"SEGMENT"}
 };
 const cue=ringsideViewerCallback(thread)!;
 assert.match(cue,/Mr\. Perfect won the last recorded meeting/);
 assert.doesNotMatch(cue,/Week|25|three|3 angles|card 3|prior angles/i);
 assert.equal(ringsideViewerCallback(null),null);
 const noMatch:RingsideStoryThread={rivalry:{pairing:"Samoa Joe vs Matt Riddle",
  previousMatches:0,previousAngles:3,lastMatch:null,lastWinner:null}};
 assert.match(ringsideViewerCallback(noMatch)!,/no specific past incident/);
 assert.doesNotMatch(ringsideViewerCallback(noMatch)!,/\b3\b|angle count|week/i);
});
test("Prompt Inspector receives the SAME bounded one-call focus and director facts",()=>{
 const inspected=inspectRingsidePrompt(ascension);
 assert.equal(inspected.callMade,false);
 assert.equal(inspected.promptVersion,"ringside-v13");
 const facts=inspected.facts as ReturnType<typeof ringsideBrief>;
 assert.deepEqual(facts.showFocus,{lead:"card_7",support:["card_0","card_8"]});
 const matchDirector=facts.slots[3]!.director;
 const angleDirector=facts.slots[0]!.director;
 assert.ok(matchDirector&&"decisive" in matchDirector);
 assert.ok(angleDirector&&"focus" in angleDirector);
 assert.match(matchDirector.decisive,/legal three-count/);
 assert.match(angleDirector.focus,/first appearance/);
 assert.ok(inspected.messages[0]?.content.includes("slot.director"));
 assert.ok(inspected.messages[0]?.content.includes("showFocus.lead"));
 assert.ok(RINGSIDE_STYLE_GUIDE.length<6500);
 assert.ok(JSON.stringify(facts).length<26000,"W29 full show fits existing AI input budget");
 const raw=inspected.messages[1]!.content;
 assert.ok(raw.includes("card_8"),"all nine slots are required once");
 assert.doesNotMatch(raw,/Week 25|third angle/i);
});
test("Story and match directors do not modify the certified article validator",()=>{
 const copy={showHeadline:"Ascension delivers decisive performances",
  opening:"Regal spoke, and the title scene provided the night's controversy.",
  closing:"The audience left with the championship intact and a warning from Undertaker.",
  slots:ascension.entries.map(e=>({slotId:e.slotId,headline:e.headline,
   recap:e.summary}))};
 const result=validateRingsideCopy(copy,ascension,{styleWarningOnly:true});
 assert.equal(result.slots.length,9);
});

test("Historical programme counts and Week 25 never enter the model-facing article facts",()=>{
 const withHistory:CompletedShowView={...ascension,entries:ascension.entries.map((e,i)=>
  i===7?{...e,programmeChapters:[{programmeId:"program-1",
   sideA:"Místico",sideB:"William Regal",programmeFormat:"RIVALRY",
   precedingMatches:1,precedingAngles:3,previousWinner:"A",
   previousMatchWeek:24,currentWinner:"A"}]}:e)};
 const visible=ringsideBrief(withHistory);
 const callback=visible.slots[7]?.storyThread;
 assert.equal(typeof callback,"string");
 assert.match(callback!,/Místico won the last recorded meeting/);
 assert.doesNotMatch(callback!,/Week 25|preceding|previousAngles|three angles|card 7/);
 const inspected=inspectRingsidePrompt(withHistory);
 assert.equal(inspected.callMade,false);
 assert.doesNotMatch(inspected.messages[1]!.content,
  /Week 25|previousMatchWeek|precedingMatches|precedingAngles/);
 assert.ok(JSON.stringify(inspected.facts).length<26000);
});

test("A dense 30-card PPV retains every certified finish within the existing token budget",()=>{
 const identities=[{
  personId:"o-reilly",ringName:"Kyle O'Reilly",character:"SHARP TECHNICIAN",
  style:"TECHNICAL",source:"WORLD_RECORD" as const,
  signatureMoves:Array.from({length:3},(_,i)=>"Technical Grappling Signature Hold "+
   i+" with a distinctive escape pattern for this wrestler"),
  finishingMoves:Array.from({length:3},(_,i)=>"Recorded Technical Finisher "+
   i+" belonging to the only wrestler authorised to execute it")
 },{
  personId:"sabin",ringName:"Chris Sabin",character:"RESILIENT VETERAN",
  style:"ALL_ROUNDER",source:"WORLD_RECORD" as const,
  signatureMoves:Array.from({length:3},(_,i)=>"High Impact Aerial Signature Attack "+
   i+" with a long distinctive ring name"),
  finishingMoves:Array.from({length:3},(_,i)=>"Recorded Aerial Finisher "+
   i+" belonging to the only wrestler authorised to execute it")
 }];
 const dense:CompletedShowView={...ascension,matchCount:30,angleCount:0,
  entries:Array.from({length:30},(_,i)=>({
   ...oreilly,position:i,slotId:"dense-match-"+i,
   performerIdentities:identities,
   headline:"A technically demanding contest between two former title challengers",
   summary:"The two athletes exchanged legal offence and the certified winner scored a clean pin."
  }))};
 assert.ok(JSON.stringify(ringsideBrief(dense)).length>26000,
  "Fixture must exercise the dense-show compaction, not just a short article");
 const result=inspectRingsidePrompt(dense);
 const facts=result.facts as ReturnType<typeof ringsideBrief>;
 assert.equal(result.callMade,false);
 assert.equal(facts.slots.length,30);
 assert.ok(JSON.stringify(facts).length<=26000);
 assert.deepEqual(facts.slots.map(x=>x.key),
  Array.from({length:30},(_,i)=>"card_"+i));
 assert.ok(facts.slots.every(x=>x.finish==="CLEAN_PIN"));
 assert.ok(facts.slots.every(x=>x.match?.winners[0]==="Kyle O'Reilly"));
 assert.ok(facts.slots.every(x=>x.match?.sides[1]?.[0]==="Chris Sabin"));
 assert.ok(facts.slots.some(x=>x.director),
  "Important matches retain detailed direction when lower cards are compacted");
});

test("Phase 66 starts as an entertaining TV wrestling review for real game readers",()=>{
 assert.equal(RINGSIDE_PROMPT_VERSION,"ringside-v13");
 assert.match(RINGSIDE_STYLE_GUIDE.slice(0,430),/experienced WRESTLING JOURNALIST/);
 assert.match(RINGSIDE_STYLE_GUIDE.slice(0,430),/televised wrestling show/);
 assert.match(RINGSIDE_STYLE_GUIDE.slice(0,430),/game's players/);
 assert.match(RINGSIDE_STYLE_GUIDE.slice(0,430),/enjoyable, immersive article/);
 assert.match(RINGSIDE_STYLE_GUIDE,/showFocus\.lead/);
 assert.match(RINGSIDE_STYLE_GUIDE,/never write card numbers/i);
 assert.ok(RINGSIDE_STYLE_GUIDE.length<6500);
});
test("W29 reader safety: mentioned-only targets cannot be face-to-face or react",()=>{
 const copy={showHeadline:"Ascension brought news to the title scene",
  opening:"The night was anchored by Regal's appearance and Místico's title defence.",
  closing:"Undertaker's challenge left the main event with real consequences.",
  slots:ascension.entries.map(e=>({slotId:e.slotId,headline:e.headline,
   recap:e.summary}))};
 for(const [index,recap] of [
  [2,"Samoa Joe faced Matt Riddle in the locker room before issuing a threat."],
  [2,"Joe warned Matt Riddle, whose calm stare suggested he was unimpressed."],
  [2,"Joe issued a warning. Riddle's steady gaze gave nothing away."],
  [4,"Austin Gunn stared at Iziah Hunter and spoke straight to him."],
  [4,"Colten Gunn followed, fixing Juice Robinson with a glare."],
  [4,"Austin gave his challenge while Robinson's face remained impassive."]
 ] as const){
  const broken={...copy,slots:copy.slots.map((s,i)=>i===index?{...s,recap}:s)};
  assert.throws(()=>validateRingsideCopy(broken,ascension),
   /off-screen promo target appearance/,recap);
 }
 for(const [index,recap] of [
  [2,"Samoa Joe addressed the locker-room camera, warning Matt Riddle that he had better stay away."],
  [4,"The Gunn brothers called out Iziah Hunter and Juice Robinson in an interview, neither of whom answered."]
 ] as const){
  const sound={...copy,slots:copy.slots.map((s,i)=>i===index?{...s,recap}:s)};
  assert.doesNotThrow(()=>validateRingsideCopy(sound,ascension),recap);
 }
});
test("W29 headlines, intro and Perfect's video cannot leak backstage card bookkeeping",()=>{
 const base={showHeadline:"Ascension made its mark",
  opening:"The main event ended with a controversial belt strike.",
  closing:"Regal and Undertaker left the fans with plenty to anticipate.",
  slots:ascension.entries.map(e=>({slotId:e.slotId,headline:e.headline,
   recap:e.summary}))};
 for(const bad of ["card 7's headline bout led the night",
  "The showFocus.lead got the biggest pop","Week 29 brought the results"]){
  assert.throws(()=>validateRingsideCopy({...base,opening:bad},ascension),
   /private card or story metadata/);
  assert.throws(()=>validateRingsideCopy({...base,showHeadline:bad},ascension),
   /private card or story metadata/);
 }
 for(const bad of [
  "The video highlighted Perfect's last-night victory.",
  "The package didn't introduce new moves or promos.",
  "The show didn’t introduce new moves or promos."
 ]){
  const copy={...base,slots:base.slots.map((s,i)=>i===6?{...s,recap:bad}:s)};
  assert.throws(()=>validateRingsideCopy(copy,ascension),
   /historical footage or narrated internal video limitations/,bad);
 }
});
test("W29 20-minute O'Reilly match and 4.25-star Místico main event cannot be replaced by scorecards",()=>{
 const base={showHeadline:"Ascension delivers a night of action",
  opening:"The in-ring action was mixed, but the title contest mattered.",
  closing:"The wrestlers left a story for next week.",
  slots:ascension.entries.map(e=>({slotId:e.slotId,headline:e.headline,
   recap:e.summary}))};
 const bad={...base,slots:base.slots.map((s,i)=>i===3?{
  ...s,recap:"In the fourth bout, Kyle O'Reilly against Chris Sabin met in a singles. After 20 minutes, Kyle O'Reilly secured a clean pinfall. The reaction was mixed."
 }:i===7?{
  ...s,recap:"In the eighth bout, Místico against William Regal met in a singles. After 25 minutes, Místico emerged victorious after a controversial ending. The crowd responded strongly to the decision."
 }:s)};
 assert.match(ringsideReaderQualityIssue(bad,ascension)??"",/significant match/);
 assert.match(ringsideReaderQualityIssue(bad,{
  ...ascension,entries:ascension.entries.filter((_,i)=>i!==3)
 })??"",/significant match/);
});
test("The existing correction attempt repairs a major match instead of accepting two bland fallbacks",async()=>{
 const show:CompletedShowView={...ascension,entries:[
  regal,{...joePromo,position:1,
   performerIdentities:[{personId:"person-joe",ringName:"Samoa Joe",
    character:"Submission machine",style:"POWER",
    signatureMoves:["Muscle Buster"],finishingMoves:["Coquina Clutch"],
    source:"WORLD_RECORD"}]},
  {...oreilly,position:2}, {...taker,position:3}
 ]};
 const long="O'Reilly built the match around wrist control while Sabin tried to create "+
  "room to strike. A counter to the opening exchange forced both men to adjust "+
  "their footing, and Sabin found more chances when he stopped letting O'Reilly "+
  "dictate every hold. As the fight entered its later stages, the technical "+
  "exchanges became more deliberate rather than simply faster. O'Reilly "+
  "escaped one last scramble, worked free of the pressure and secured the "+
  "separate, legal three-count. It was a solid match rather than a classic.";
 const write=(wrong:boolean)=>({
  showHeadline:"Ascension has a decisive night",
  opening:"Regal arrived and the singles match rewarded patience.",
  closing:"The wrestlers made their statements and the audience responded.",
  slots:Object.fromEntries(show.entries.map((e,i)=>["card_"+i,{
   headline:i===2?"O'Reilly's hard-earned pin":"The on-air confrontation "+i,
   recap:i===2?(wrong?
    "Kyle O'Reilly hit the Coquina Clutch on Sabin before the winning clean pin.":long):
    e.type==="SEGMENT"?"The segment featured "+(e.segmentContext?.actorNames.join(" & ")??"the roster")+
     " making a declaration. The filmed scene gave fans something to consider.":
    e.summary
  }]))
 });
 const trace:RingsideGenerationTrace={attempts:[],slotOrigins:[]};
 let calls=0;
 const transport:typeof fetch=async()=>{
  calls++;
  return new Response(JSON.stringify({choices:[{message:{
   content:JSON.stringify(write(calls===1))
  }}]}),{status:200});
 };
 const report=await generateGroqReview(show,"fixture",transport,
  undefined,undefined,undefined,"GROQ",false,trace);
 assert.equal(calls,2,"one first attempt plus the existing quality-control retry");
 assert.equal(trace.attempts.length,2);
 assert.equal(trace.attempts[0]?.status,"REJECTED");
 assert.equal(trace.attempts[1]?.status,"ACCEPTED");
 assert.match(report.slots[2]!.recap,/wrist control/);
 assert.doesNotMatch(report.slots[2]!.recap,/In the third bout|Coquina Clutch/);
 assert.ok(report.slots[2]!.recap.length>440);
});

test("Mentioned-only backstage participants trigger a corrective rewrite, not an immediate generic angle",async()=>{
 const show:CompletedShowView={...ascension,matchCount:0,angleCount:4,
  entries:[regal,{...joePromo,position:1},{...gunn,position:2},
   {...taker,position:3}]};
 let calls=0;
 const corrected="Samoa Joe turned toward the locker-room camera and warned "+
  "Matt Riddle in unmistakable terms. No answer came: Joe's speech alone "+
  "made clear that he intended to settle their issue himself.";
 const transport:typeof fetch=async()=>{
  calls++;
  const recaps=[
   "William Regal walked onto the entrance ramp and announced himself as a major new arrival.",
   calls===1?"Samoa Joe faced Matt Riddle and threatened him; Riddle's calm stare filled the silence.":
    corrected,
   "Austin Gunn and Colten Gunn challenged Iziah Hunter and Juice Robinson by name from the interview area.",
   "The Undertaker spoke of his intention to pursue the CWA World Championship."
  ];
  return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({
   showHeadline:"Ascension builds major rivalries",
   opening:"Regal debuted and the roster laid down challenges.",
   closing:"Undertaker's words put the championship on notice.",
   slots:Object.fromEntries(recaps.map((recap,i)=>["card_"+i,{
    headline:"Chapter "+i+" on tonight's wrestling show",recap}]))
  })}}]}));
 };
 const trace:RingsideGenerationTrace={attempts:[],slotOrigins:[]};
 const report=await generateGroqReview(show,"fixture",transport,
  undefined,undefined,undefined,"GROQ",false,trace);
 assert.equal(calls,2);
 assert.deepEqual(trace.attempts.map(x=>x.status),["REJECTED","ACCEPTED"]);
 assert.equal(report.slots[1]?.recap,corrected);
 assert.ok(trace.slotOrigins.every(x=>x.source==="GROQ"));
});
