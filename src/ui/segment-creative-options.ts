/** Compact creative labels matched to original-main authored segment choices. */
import {CREATIVE_BEAT_FIELDS,supportsCreativeBeat,type SegmentCreativeBeat}
 from "../domain/segment-creative-beats.js";
const labels:Readonly<Record<string,string>>={
 STATEMENT_OF_INTENT:"Statement of intent",BOAST:"Boast to the crowd",
 RALLY_FANS:"Rally the fans",AIR_GRIEVANCE:"Air a grievance",
 ISSUE_WARNING:"Issue a warning",PROMISE_VICTORY:"Promise victory",
 TAUNT_RIVALS:"Mock the competition",EXPLAIN_ACTIONS:"Explain recent actions",
 BACKSTAGE:"Backstage",SIT_DOWN:"Sit-down",
 IN_RING:"In the ring",CAREER_STORY:"Career story",
 RIVALRY_PRESSURE:"Rivalry pressure",RECENT_FORM:"Recent form",
 NEXT_STEPS:"What's next?",TITLE_AMBITIONS:"Title ambitions",
 FACTION_FUTURE:"Faction future",CANDID:"Candid answer",
 EVASIVE:"Dodge the question",DEFIANT:"Defiant answer",
 WALKOUT:"Walk out",EMOTIONAL:"Emotional response",
 SARCASTIC:"Sarcastic response",FAN_APPRECIATION:"Thank the fans",
 SELF_CORONATION:"Crown themselves",RIVALRY_TAUNT:"Taunt a rival",
 FACTION_UNITY:"Faction unites",PERSONAL_MILESTONE:"Personal milestone",
 SALUTE_CROWD:"Salute the crowd",POSE:"Strike a pose",
 TAUNT_RIVALS:"Mock rivals",WALK_OFF:"Leave the ring",
 STAREDOWN:"Staredown",INITIATOR_BACKS_DOWN:"Instigator backs down",
 TARGET_BACKS_DOWN:"Opponent backs down",
 RELUCTANT_HANDSHAKE:"Reluctant handshake",VERBAL_WARNING:"Verbal warning",
 SHOVING_MATCH:"Shoving match",
 ACCEPTED:"Challenge accepted",REFUSED:"Challenge refused",
 LEFT_OPEN:"No answer yet",BLINDSIDE:"Blindside strike",
 PREMEDITATED_AMBUSH:"Planned ambush",FACE_TO_FACE_ASSAULT:"Face-to-face assault",
 BEATDOWN:"Sustained beatdown",PULL_APART_BRAWL:"Pull-apart brawl",
 SURPRISE_RUN_IN:"Surprise run-in",TARGETED_BEATDOWN:"Focused beatdown",
 GENERATE_HEAT:"Stoke hostility",BUILD_SYMPATHY:"Rally sympathy",
 ESCALATE_RIVALRY:"Escalate the feud",SIGNED:"Papers signed",
 REJECTED:"Signing rejected",BRAWL:"Signing erupts into a brawl",
 INTRODUCTION:"Announced arrival",SURPRISE_REVEAL:"Surprise reveal",
 ESTABLISH_STAR:"Establish a new star",BUILD_EXCITEMENT:"Build anticipation",
 CREATE_MYSTERY:"Create mystery",UNSETTLE_RIVAL:"Unsettle a rival",
 REIGNITE_PROGRAMME:"Reignite a rivalry",
 VERBAL_EXCHANGE:"Verbal exchange",INTERRUPTER_PREVAILS:"Interrupter gets the last word",
 SPEAKER_PREVAILS:"Speaker gets the last word",
 RESCUER_STANDS_TALL:"Rescuer stands tall",ATTACKER_ESCAPES:"Attacker escapes",
 RESCUE_OVERWHELMED:"Rescue fails",ATTACKER_STANDS_TALL:"Attacker stands tall",
 VICTIM_FIGHTS_BACK:"Victim fights back",OFFICIALS_SEPARATE:"Officials separate them",
 DISTRACTION:"Distract the opponent",RINGSIDE_RUN_IN:"Rush the ring",
 REFEREE_DIVERSION:"Distract the referee",
 PUBLIC_DECLARATION:"Public declaration",REJECT_OLD_SELF:"Reject their old persona",
 TAUNT_CROWD:"Turn on the crowd",NEW_ATTITUDE:"Show a changed attitude",
 CAREER_HIGHLIGHTS:"Career highlights",BACKSTAGE_FOOTAGE:"Behind-the-scenes footage",
 DARK_TEASER:"Mysterious teaser",SPOKEN_MESSAGE:"Recorded message",
 FEUD_HIGHLIGHTS:"Rivalry montage",PUBLIC_INVITATION:"Offer made in public",
 BACKSTAGE_PITCH:"Private recruitment pitch",HARD_ULTIMATUM:"Join or face consequences",
 EXPULSION_SCENE:"On-screen expulsion",PUBLIC_DENUNCIATION:"Public denunciation",
 PEACE_OFFER:"Offer an olive branch",PUBLIC_APOLOGY:"Public apology",
 PRIVATE_MEETING:"Behind-closed-doors meeting"
};
const fieldNames:Readonly<Record<string,string>>={
 purpose:"The message",format:"Interview setting",topic:"Interview subject",
 response:"The answer",occasion:"Occasion",ending:"How it ends",
 presentation:"Presentation",objective:"The intention",approach:"How they approach it",
 departure:"How they leave"
};
export function creativeLabel(value:string):string{
 return labels[value]??value.replaceAll("_"," ").toLowerCase()
  .replace(/(^|\s)\S/g,c=>c.toUpperCase());
}
export function creativeFields(kind:string):readonly {
 name:string;label:string;options:readonly {value:string;label:string}[]
}[]{
 if(!supportsCreativeBeat(kind))return [];
 const fields=CREATIVE_BEAT_FIELDS[kind] as Record<string,readonly string[]>;
 return Object.entries(fields).map(([name,values])=>({
  name,label:name==="presentation"&&kind==="ATTACK"?
   "Attack style":name==="presentation"&&kind==="VIDEO_PACKAGE"?
    "Footage style":name==="presentation"&&kind==="TURN"?
     "How the turn is shown":fieldNames[name]??name,options:values.map(value=>({
   value,label:creativeLabel(value)
  }))
 }));
}
export function creativeSummary(beat:SegmentCreativeBeat|null):string{
 return beat?Object.entries(beat).filter(([name])=>name!=="kind")
  .map(([,value])=>creativeLabel(value)).join(" · "):"";
}
