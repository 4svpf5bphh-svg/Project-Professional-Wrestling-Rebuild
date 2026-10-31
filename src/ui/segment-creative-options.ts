/** Compact creative labels matched to original-main authored segment choices. */
import {CREATIVE_BEAT_FIELDS,supportsCreativeBeat,type SegmentCreativeBeat}
 from "../domain/segment-creative-beats.js";
const labels:Readonly<Record<string,string>>={
 STATEMENT_OF_INTENT:"Statement of intent",BOAST:"Boast to the crowd",
 RALLY_FANS:"Rally the fans",AIR_GRIEVANCE:"Air a grievance",
 ISSUE_WARNING:"Issue a warning",BACKSTAGE:"Backstage",SIT_DOWN:"Sit-down",
 IN_RING:"In the ring",CAREER_STORY:"Career story",
 RIVALRY_PRESSURE:"Rivalry pressure",RECENT_FORM:"Recent form",
 NEXT_STEPS:"What's next?",CANDID:"Candid answer",
 EVASIVE:"Dodge the question",DEFIANT:"Defiant answer",
 WALKOUT:"Walk out",FAN_APPRECIATION:"Thank the fans",
 SELF_CORONATION:"Crown themselves",RIVALRY_TAUNT:"Taunt a rival",
 SALUTE_CROWD:"Salute the crowd",POSE:"Strike a pose",
 TAUNT_RIVALS:"Mock rivals",WALK_OFF:"Leave the ring",
 STAREDOWN:"Staredown",INITIATOR_BACKS_DOWN:"Instigator backs down",
 TARGET_BACKS_DOWN:"Opponent backs down",
 RELUCTANT_HANDSHAKE:"Reluctant handshake",
 ACCEPTED:"Challenge accepted",REFUSED:"Challenge refused",
 LEFT_OPEN:"No answer yet",BLINDSIDE:"Blindside ambush",
 BEATDOWN:"Sustained beatdown",PULL_APART_BRAWL:"Pull-apart brawl",
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
 REFEREE_DIVERSION:"Distract the referee"
};
const fieldNames:Readonly<Record<string,string>>={
 purpose:"The message",format:"Interview setting",topic:"Interview subject",
 response:"The answer",occasion:"Occasion",ending:"How it ends",
 presentation:"Presentation",objective:"The intention"
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
   "Attack style":fieldNames[name]??name,options:values.map(value=>({
   value,label:creativeLabel(value)
  }))
 }));
}
export function creativeSummary(beat:SegmentCreativeBeat|null):string{
 return beat?Object.entries(beat).filter(([name])=>name!=="kind")
  .map(([,value])=>creativeLabel(value)).join(" · "):"";
}
