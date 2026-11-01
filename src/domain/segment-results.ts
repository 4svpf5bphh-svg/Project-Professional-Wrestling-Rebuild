import {normalizeBookedSegment} from "./segment-booking.js";
import {angleSceneLocationPhrase,initialAngleScene,angleSceneLabel} from "./angle-scene.js";
import type {AuthoredSegment} from "../simulation/legacy/show-segments.js";
import type {SegmentKind,SegmentOutcome} from "../simulation/legacy/show-segments.js";
export interface SegmentResult{
 slotId:string;position:number;kind:SegmentKind;outcome:SegmentOutcome;
 headline:string;summary:string;actorIds:readonly string[];targetIds:readonly string[];
 stableId?:string;stableDecision?:"ACCEPTED"|"REJECTED";
}
/** Narrative is a deterministic presentation of the author's locked decision.
 * No random success, rejection, membership change or alignment change.
 */
export function describeAuthoredSegment(payload:AuthoredSegment,
 names:ReadonlyMap<string,string>):SegmentResult{
 const segment=normalizeBookedSegment(payload,new Set([...payload.actorIds,...payload.targetIds]));
 const actors=segment.actorIds.map(id=>names.get(id)??"Unknown wrestler");
 const targets=segment.targetIds.map(id=>names.get(id)??"Unknown wrestler");
 const subject=actors.join(" & ")||"The promotion";
 const object=targets.join(" & ");
 const labels:Record<SegmentKind,string>={
 PROMO:"Promo",INTERVIEW:"Interview",CONFRONTATION:"Face to face",
 CHALLENGE:"Challenge issued",CELEBRATION:"Celebration",
 ATTACK:"Ambush / assault",INTERRUPTION:"Unexpected interruption",
 RESCUE:"A timely rescue",POST_MATCH_ASSAULT:"Post-match assault",
 TURN:"A change of allegiance",
 CONTRACT_SIGNING:"Contract signing",INTERFERENCE:"Outside interference",
 DEBUT:"A new arrival",VIDEO_PACKAGE:"Video package",
 STABLE_INVITATION:"Stable invitation",STABLE_EXIT:"Stable tension",STABLE_RECONCILIATION:"Stable reconciliation"};
 const purpose=segment.videoPurpose?segment.videoPurpose.replaceAll("_"," ").toLowerCase():"";
 const planned:Record<SegmentKind,string>={
 PROMO:`${subject} delivers a promo`,
 INTERVIEW:`${subject} is interviewed`,
 CONFRONTATION:`${subject} confronts ${object}`,
 CHALLENGE:`${subject} challenges ${object}`,
 CELEBRATION:`${subject} stages a celebration`,
 ATTACK:`${subject} attacks ${object}`,
 INTERRUPTION:`${subject} interrupts ${object}`,
 RESCUE:`${actors[0]??"An attacker"} assaults ${object} before ${actors[1]??"a rescuer"} intervenes`,
 POST_MATCH_ASSAULT:`${subject} attacks ${object} after their bout`,
 TURN:actors.length>1?
   `${subject} turn${object?" on "+object:""}${segment.turnTargetAlignment?
    " and become "+(segment.turnTargetAlignment==="FACE"?"faces":segment.turnTargetAlignment==="HEEL"?"heels":"tweeners"):""}`:
   `${subject} turns${object?" on "+object:""}${segment.turnTargetAlignment?
    " and adopts a "+segment.turnTargetAlignment.toLowerCase()+" alignment":""}`,
 CONTRACT_SIGNING:`${subject} meets for a contract signing`,
 INTERFERENCE:`${subject} interferes against ${object}`,
 DEBUT:`${subject} makes an in-person debut`,
 VIDEO_PACKAGE:`A ${purpose} package features ${subject}`,
 STABLE_INVITATION:`${subject} invites ${object} to join the stable${segment.stableDecision===
   "ACCEPTED"?", and the invitation is accepted":
   segment.stableDecision==="REJECTED"?", but the invitation is rejected":""}`,
 STABLE_EXIT:`${subject} leaves the stable`,
 STABLE_RECONCILIATION:`${subject} attempts to reconcile with ${object}${segment.stableDecision===
   "ACCEPTED"?", and the reconciliation succeeds":
   segment.stableDecision==="REJECTED"?", but the offer is rejected":""}`};
 const scene=segment.scene;
 const located=scene?(segment.kind==="VIDEO_PACKAGE"?
  " with footage filmed "+angleSceneLocationPhrase(scene.location):
  " "+angleSceneLocationPhrase(scene.location)):"";
 const visual=scene&&segment.outcome==="HAPPENS"?
  scene.visual==="BLOODIED"?(object||"The victim")+" was left bloodied.":
  scene.visual==="LEFT_LYING"?(object||"The victim")+" was left sprawled on the floor.":
  scene.visual==="OFFICIALS_SEPARATE"?"Officials rushed in to break it up.":
  scene.visual==="DRIVEN_OFF"?(subject||"The attacker")+" was driven away.":
  "":"";
 const severity=scene&&segment.outcome==="HAPPENS"?
  scene.intensity==="BRUTAL"?" The assault was especially vicious.":
  scene.intensity==="WARNING"?" The exchange was brief but pointed.":"":"";
 const base=planned[segment.kind]+located;
 // The authored on-screen ending changes the write-up, not simulation
 // facts. A failed rescue must never read like the attacker was beaten.
 const beat=segment.creativeBeat;
 let ending="";
 if(segment.outcome==="HAPPENS"&&beat){
  switch(beat.kind){
   case "PROMO":
    ending=beat.purpose==="BOAST"?"The speech was an unapologetic boast.":
     beat.purpose==="RALLY_FANS"?"The message was an appeal to the fans.":
     beat.purpose==="AIR_GRIEVANCE"?"The grievances were laid bare.":
     beat.purpose==="ISSUE_WARNING"?"The promo ended on a warning.":
     beat.purpose==="PROMISE_VICTORY"?"A victory was boldly promised.":
     beat.purpose==="TAUNT_RIVALS"?"The competition came in for ridicule.":
     beat.purpose==="EXPLAIN_ACTIONS"?"They offered an explanation for recent actions.":
     "The wrestler set out their intentions.";break;
   case "INTERVIEW": {
    const topics:Record<typeof beat.topic,string>={
     CAREER_STORY:"their career",RIVALRY_PRESSURE:"rivalry pressure",
     RECENT_FORM:"recent performances",NEXT_STEPS:"what comes next",
     TITLE_AMBITIONS:"title ambitions",FACTION_FUTURE:"the faction's future"};
    const responses:Record<typeof beat.response,string>={
     CANDID:"spoke candidly",EVASIVE:"dodged the difficult questions",
     DEFIANT:"refused to back down",WALKOUT:"walked out of the interview",
     EMOTIONAL:"became visibly emotional",SARCASTIC:"answered with sarcasm"};
    ending="The conversation focused on "+topics[beat.topic]+". "+subject+
     " "+responses[beat.response]+".";break;
   }
   case "CELEBRATION":{
    const occasions:Record<typeof beat.occasion,string>={
     FAN_APPRECIATION:"thanking the fans",SELF_CORONATION:"a self-coronation",
     RIVALRY_TAUNT:"mocking a rival",FACTION_UNITY:"a show of faction unity",
     PERSONAL_MILESTONE:"a personal milestone"};
    const ends:Record<typeof beat.ending,string>={
     SALUTE_CROWD:"saluted the crowd",POSE:"struck a pose",
     TAUNT_RIVALS:"taunted the competition",WALK_OFF:"walked away"};
    ending="The occasion was "+occasions[beat.occasion]+". They "+
     ends[beat.ending]+".";break;
   }
   case "CONFRONTATION":
    ending=beat.ending==="STAREDOWN"?"Neither side broke the stare.":
     beat.ending==="INITIATOR_BACKS_DOWN"?subject+" backed away.":
     beat.ending==="TARGET_BACKS_DOWN"?(object||"The rival")+" backed away.":
     beat.ending==="RELUCTANT_HANDSHAKE"?"An uneasy handshake ended the encounter.":
     beat.ending==="VERBAL_WARNING"?"A pointed verbal warning was delivered.":
     "The confrontation turned into a shoving match.";break;
   case "DEBUT":
    ending=beat.presentation==="SURPRISE_REVEAL"?
     "The arrival caught the crowd by surprise.":
     "The newcomer was formally introduced.";break;
   case "INTERRUPTION":
    ending=beat.ending==="VERBAL_EXCHANGE"?"Both sides traded words.":
     beat.ending==="INTERRUPTER_PREVAILS"?subject+" got the last word.":
     beat.ending==="SPEAKER_PREVAILS"?(object||"The interrupted speaker")+" got the last word.":
     "The exchange erupted into a brawl.";break;
   case "RESCUE":
    ending=beat.ending==="RESCUER_STANDS_TALL"?(actors[1]??"The rescuer")+" stood tall.":
     beat.ending==="ATTACKER_ESCAPES"?subject+" escaped before justice could be served.":
     "The rescue was overwhelmed.";break;
   case "POST_MATCH_ASSAULT":
    ending=beat.ending==="ATTACKER_STANDS_TALL"?subject+" stood tall.":
     beat.ending==="VICTIM_FIGHTS_BACK"?(object||"The victim")+" fought back.":
     "Officials rushed in to separate them.";break;
   case "CHALLENGE":
    ending=beat.response==="ACCEPTED"?"The challenge was accepted.":
     beat.response==="REFUSED"?"The challenge was refused.":
     "No answer was given yet.";break;
   case "CONTRACT_SIGNING":
    ending=beat.ending==="SIGNED"?"The on-screen agreement was signed.":
     beat.ending==="REJECTED"?"The proposed on-screen signing was rejected.":
     beat.ending==="WALKOUT"?"The signing ended with a walkout.":
     "The signing erupted into a brawl.";break;
   case "INTERFERENCE":
    ending=beat.presentation==="DISTRACTION"?
     "A distraction disrupted the action.":
     beat.presentation==="REFEREE_DIVERSION"?
      "The referee's attention was diverted.":"The interference came from ringside.";break;
   case "TURN":
    ending=beat.presentation==="REJECT_OLD_SELF"?"They publicly rejected their old identity.":
     beat.presentation==="TAUNT_CROWD"?"The crowd got a hostile response.":
     beat.presentation==="NEW_ATTITUDE"?"Their change in attitude was plain to see.":
     "They made their position clear.";break;
   case "VIDEO_PACKAGE":
    ending=beat.presentation==="DARK_TEASER"?"The footage left more questions than answers.":
     beat.presentation==="SPOKEN_MESSAGE"?"A direct-to-camera message carried the package.":
     beat.presentation==="BACKSTAGE_FOOTAGE"?"Backstage footage drove the story.":
     beat.presentation==="FEUD_HIGHLIGHTS"?"The rivals' history was the focus.":
     "Career highlights filled the screen.";break;
   case "STABLE_INVITATION":
    ending=beat.approach==="HARD_ULTIMATUM"?"The offer came with an ultimatum.":
     beat.approach==="BACKSTAGE_PITCH"?"The pitch was made behind the scenes.":
     "The offer was made in full view of the crowd.";break;
   case "STABLE_EXIT":
    ending=beat.departure==="EXPULSION_SCENE"?"The expulsion was staged for the cameras.":
     beat.departure==="PUBLIC_DENUNCIATION"?"The split was denounced in public.":
     "The departure played out as a walkout.";break;
   case "STABLE_RECONCILIATION":
    ending=beat.approach==="PUBLIC_APOLOGY"?"The apology was public.":
     beat.approach==="PRIVATE_MEETING"?"The conversation took place away from the crowd.":
     "An olive branch was extended.";break;
   case "ATTACK":
    ending=beat.presentation==="PULL_APART_BRAWL"?
     "Officials had to pull the wrestlers apart.":
     beat.presentation==="BLINDSIDE"?"The strike came from behind. ":
     beat.presentation==="PREMEDITATED_AMBUSH"?"The ambush had clearly been planned. ":
     beat.presentation==="FACE_TO_FACE_ASSAULT"?"The attack came face to face. ":
     beat.presentation==="SURPRISE_RUN_IN"?"A surprise run-in sparked the assault.":
     beat.presentation==="TARGETED_BEATDOWN"?"The attackers focused their punishment on the victim.":
     "The beatdown was sustained.";break;
  }
 }
 const intentDescription=scene?.purpose==="ELEVATE_INITIATOR"?
  "make the aggressor look dangerous":scene?.purpose==="BUILD_CHARACTER"?
   "show another side of the performer":scene?.purpose==="BUILD_RIVALRY"?
    "raise tensions between the rivals":scene?angleSceneLabel(scene.purpose).toLowerCase():"";
 const intention=scene&&scene.purpose!==initialAngleScene(segment.kind).purpose?
  " The intention was to "+intentDescription.replace(/[.!]$/,"")+".":"";
 const repeatedSeparation=scene?.visual==="OFFICIALS_SEPARATE"&&
  ((beat?.kind==="POST_MATCH_ASSAULT"&&beat.ending==="OFFICIALS_SEPARATE")||
   (beat?.kind==="ATTACK"&&beat.presentation==="PULL_APART_BRAWL"));
 const summary=segment.outcome==="HAPPENS"?base+"."+(ending?" "+ending:"")+severity+
  (!repeatedSeparation&&visual?" "+visual:"")+intention:
  segment.outcome==="REFUSED"?`The planned moment does not happen: ${base}.`:
  `The moment is interrupted before completion: ${base}.`;
 return {slotId:segment.slotId,position:segment.position,kind:segment.kind,
  outcome:segment.outcome,headline:labels[segment.kind],summary,
  actorIds:[...segment.actorIds],targetIds:[...segment.targetIds],
  ...(segment.stableId?{stableId:segment.stableId}:{}),
  ...(segment.stableDecision?{stableDecision:segment.stableDecision}:{})};
}
export function describeShowSegments(
 segments:readonly AuthoredSegment[],names:ReadonlyMap<string,string>,
):SegmentResult[]{
 if(segments.length>100)throw new Error("Too many segments");
 const seen=new Set<string>();
 return [...segments].sort((a,b)=>a.position-b.position).map(s=>{
  if(seen.has(s.slotId))throw new Error("Duplicate segment slot");
  seen.add(s.slotId);
  return describeAuthoredSegment(s,names);
 });
}
