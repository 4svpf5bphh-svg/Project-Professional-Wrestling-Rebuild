/** Author-owned ordered moments inside ONE existing canonical segment.
 * Never schedules matches, changes alignments or settles an extra result.
 * Bounded JSON inside the existing slot costs no Neon reads or tables. */
import type {SegmentKind} from "../simulation/legacy/show-segments.js";

export const ANGLE_SEQUENCE_ACTIONS=[
 "SPEAK","WARN","TAUNT","CHALLENGE","INTERRUPT","REPLY","WALK_AWAY",
 "ATTACK","FIGHT_BACK","RESCUE","BETRAY"
] as const;
export type AngleActionKind=(typeof ANGLE_SEQUENCE_ACTIONS)[number];
export interface AuthoredAngleAction{
 action:AngleActionKind;by:string;to?:string;line?:string;
}
export const ANGLE_SEQUENCE_LABELS:Readonly<Record<AngleActionKind,string>>={
 SPEAK:"Speak",WARN:"Warn",TAUNT:"Provoke",CHALLENGE:"Challenge",
 INTERRUPT:"Interrupt",REPLY:"Respond",WALK_AWAY:"Walk away",
 ATTACK:"Attack",FIGHT_BACK:"Fight back",RESCUE:"Make the save",
 BETRAY:"Betray"
};
const needsTarget=new Set<AngleActionKind>([
 "CHALLENGE","INTERRUPT","REPLY","ATTACK","FIGHT_BACK","RESCUE","BETRAY"]);
const mustBePresent=new Set<AngleActionKind>([
 "INTERRUPT","REPLY","ATTACK","FIGHT_BACK","RESCUE","BETRAY"]);
const physical=new Set<AngleActionKind>(["ATTACK","FIGHT_BACK","RESCUE","BETRAY"]);
const physicalKinds=new Set<SegmentKind>([
 "ATTACK","POST_MATCH_ASSAULT","CONFRONTATION","INTERRUPTION",
 "RESCUE","TURN","CONTRACT_SIGNING","STABLE_EXIT"]);
export const angleActionNeedsTarget=(action:AngleActionKind)=>needsTarget.has(action);
export const angleActionNeedsPresentTarget=(action:AngleActionKind)=>mustBePresent.has(action);
export function angleActionsFor(kind:SegmentKind):readonly AngleActionKind[]{
 return ANGLE_SEQUENCE_ACTIONS.filter(action=>
  action==="BETRAY"?kind==="TURN":
  action==="RESCUE"?kind==="RESCUE":
  physical.has(action)?physicalKinds.has(kind):
  ["INTERRUPT","REPLY"].includes(action)?kind!=="VIDEO_PACKAGE":
  true);
}
export function angleSequenceRoles(input:{
 kind:SegmentKind;actorIds:readonly string[];targetIds:readonly string[];
 targetPresence?:"MENTIONED"|"ON_SCREEN";
}):{visible:string[];mentioned:string[]}{
 const offscreen=["PROMO","INTERVIEW","CHALLENGE"].includes(input.kind)&&
  input.targetPresence!=="ON_SCREEN";
 return {visible:[...input.actorIds,...(offscreen?[]:input.targetIds)],
  mentioned:offscreen?[...input.targetIds]:[]};
}
export function isAuthoredAngleSequence(raw:unknown,input:{
 kind:SegmentKind;actorIds:readonly string[];targetIds:readonly string[];
 targetPresence?:"MENTIONED"|"ON_SCREEN";
}):raw is AuthoredAngleAction[]{
 if(!Array.isArray(raw)||raw.length<1||raw.length>6)return false;
 const {visible,mentioned}=angleSequenceRoles(input);
 const people=new Set([...visible,...mentioned]),live=new Set(visible);
 const allowed=angleActionsFor(input.kind);
 return raw.every((item:unknown)=>{
  if(!item||typeof item!=="object"||Array.isArray(item))return false;
  const s=item as Record<string,unknown>;
  if(Object.keys(s).some(key=>!["action","by","to","line"].includes(key))||
   typeof s.action!=="string"||!allowed.includes(s.action as AngleActionKind)||
   typeof s.by!=="string"||!live.has(s.by)||
   (s.to!==undefined&&(typeof s.to!=="string"||!people.has(s.to)||
    s.to===s.by))||
   (s.line!==undefined&&(typeof s.line!=="string"||s.line.length>160||
    s.line.trim()!==s.line||/[\u0000-\u001f\u007f]/.test(s.line))))
   return false;
  const action=s.action as AngleActionKind;
  if(needsTarget.has(action)&&s.to===undefined)return false;
  if(mustBePresent.has(action)&&
   (typeof s.to!=="string"||!live.has(s.to)))return false;
  if(action==="WALK_AWAY"&&s.to!==undefined)return false;
  return true;
 });
}
/** Deterministic prose, not a new independent simulation event. */
export function describeAngleSequenceStep(step:AuthoredAngleAction,
 names:ReadonlyMap<string,string>):string{
 const who=names.get(step.by)??"The wrestler";
 const to=step.to?names.get(step.to)??"the other wrestler":"";
 const parts:Record<AngleActionKind,string>={
  SPEAK:who+" spoke"+(to?" to "+to:""),
  WARN:who+" warned "+(to||"the audience"),
  TAUNT:who+" provoked "+(to||"the crowd"),
  CHALLENGE:who+" challenged "+to,
  INTERRUPT:who+" interrupted "+to,
  REPLY:who+" answered "+to,
  WALK_AWAY:who+" walked away",
  ATTACK:who+" attacked "+to,
  FIGHT_BACK:who+" fought back against "+to,
  RESCUE:who+" intervened to protect "+to,
  BETRAY:who+" betrayed "+to
 };
 return parts[step.action]+(step.line?" — “"+step.line+"”":"");
}
