/** Creative navigation adapted from the original card's story-goal choices.
 * Each goal selects an already-supported segment, not a new outcome type.
 */
import {ANGLE_TYPES,type EditorSegment} from "./card-segment-model.js";
export type AngleGoal="CHARACTER"|"RIVALRY"|"CHALLENGE"|"FACTION"|"ARRIVAL"|"VIDEO";
type Kind=EditorSegment["kind"];
export const ANGLE_STORY_GOALS:readonly{
 value:AngleGoal;label:string;description:string;types:readonly Kind[];
}[]=[
 {value:"CHARACTER",label:"Character",description:"Give someone a microphone, spotlight or chance to celebrate.",
  types:["PROMO","INTERVIEW","CELEBRATION"]},
 {value:"RIVALRY",label:"Rivalry",description:"Put the heat on an opponent, spark a confrontation or cause trouble.",
  types:["CONFRONTATION","ATTACK","INTERFERENCE"]},
 {value:"CHALLENGE",label:"Challenge",description:"Issue a challenge or stage a tense signing in front of the crowd.",
  types:["CHALLENGE","CONTRACT_SIGNING"]},
 {value:"FACTION",label:"Alliances",description:"Invite, reject, betray, expel or reunite wrestlers.",
  types:["STABLE_INVITATION","STABLE_EXIT","STABLE_RECONCILIATION","TURN"]},
 {value:"ARRIVAL",label:"Arrival",description:"Introduce a new face live in front of the audience.",
  types:["DEBUT"]},
 {value:"VIDEO",label:"Video",description:"Build anticipation with a package, recap or teaser.",
  types:["VIDEO_PACKAGE"]}
];
export function angleGoalFor(kind:Kind):AngleGoal{
 const goal=ANGLE_STORY_GOALS.find(group=>group.types.includes(kind));
 if(!goal)throw new Error("Unsupported creative direction");
 return goal.value;
}
export function anglesForGoal(goal:AngleGoal):readonly Kind[]{
 const group=ANGLE_STORY_GOALS.find(x=>x.value===goal);
 if(!group)throw new Error("Unknown creative direction");
 return group.types;
}
export function firstAngleFor(goal:AngleGoal):Kind{
 const first=anglesForGoal(goal)[0];
 if(!first)throw new Error("Creative direction has no angle");
 return first;
}
/** Guidance is advisory; match finishes and scripted angles never change here. */
export function angleDirection(kind:Kind):string{
 switch(kind){
  case "PROMO":return "Choose who addresses the crowd and how the speech ends.";
  case "INTERVIEW":return "Give a wrestler the floor, whether they answer or walk away.";
  case "CELEBRATION":return "A victory lap, a taunt or an awkward celebration.";
  case "CONFRONTATION":return "The rivals face off. You decide who gets the last word.";
  case "ATTACK":return "Choose the aggressor and target before staging the assault.";
  case "INTERFERENCE":return "Put one wrestler in another's path and direct the disruption.";
  case "CHALLENGE":return "Make the offer public and decide how it is received.";
  case "CONTRACT_SIGNING":return "Stage a televised signing or breakdown; employment deals stay separate.";
  case "STABLE_INVITATION":return "Invite someone into an existing faction. Choose their response.";
  case "STABLE_EXIT":return "A walkout or expulsion on camera doesn't instantly change faction membership.";
  case "STABLE_RECONCILIATION":return "Repair an old alliance or have the outcast turn it down.";
  case "TURN":return "Set a new allegiance and let the crowd see the change.";
  case "DEBUT":return "Bring a contracted wrestler onto the show for their introduction.";
  case "VIDEO_PACKAGE":return "Air a teaser, a return announcement, or a rivalry recap.";
 }
}
export const SEGMENT_TYPES_ARE_COVERED=ANGLE_TYPES.every(kind=>
 ANGLE_STORY_GOALS.filter(goal=>goal.types.includes(kind.value)).length===1);
