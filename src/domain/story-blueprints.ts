/** Story Blueprints guide authorship; they do not create a booked fact,
 * outcome, medical effect, relationship or alignment. All suggested scenes
 * reuse the original, validated segment catalogue and current Card Editor.
 * No extra RPC/Neon row/Groq call for this library. */
import type {SegmentKind} from "../simulation/legacy/show-segments.js";
import type {AngleScene} from "./angle-scene.js";

export type BlueprintFamily="RISE"|"FALL"|"RELATIONSHIPS"|"CONFLICT";
export interface StoryBlueprintBeat {
 id:string;title:string;intention:string;
 kind:SegmentKind;purpose:AngleScene["purpose"];
 /** Only actually booked, certified moments count as story history. */
}
export interface StoryBlueprint {
 id:string;family:BlueprintFamily;name:string;description:string;
 motivation:string;desiredFeeling:string;
 beats:readonly StoryBlueprintBeat[];
}
const beat=(id:string,title:string,intention:string,
 kind:SegmentKind,purpose:AngleScene["purpose"]):StoryBlueprintBeat=>
 ({id,title,intention,kind,purpose});
export const STORY_BLUEPRINTS:readonly StoryBlueprint[]=[
 {id:"UNDERDOG",family:"RISE",name:"The Underdog",description:"Earn an opportunity against impossible odds.",
  motivation:"Prove they belong",desiredFeeling:"Sympathy and hope",beats:[
   beat("struggle","Show the struggle","Explain a real setback without inventing a previous loss.","INTERVIEW","BUILD_CHARACTER"),
   beat("defy","Stand up to the obstacle","Put pressure on a genuine opposing wrestler.","CONFRONTATION","BUILD_RIVALRY"),
   beat("chance","Demand a chance","Issue a challenge, never automatically create the match.","CHALLENGE","PROVE_POINT")]},
 {id:"TITLE_CHASE",family:"RISE",name:"Road to the Championship",description:"A patient pursuit of a legitimate title opportunity.",
  motivation:"Earn a championship opportunity",desiredFeeling:"Anticipation",beats:[
   beat("stakes","State the ambition","Speak about the title without claiming a match is signed.","INTERVIEW","TARGET_CHAMPIONSHIP"),
   beat("challenge","Make the challenge","Ask for an actual bout; managers must separately book it.","CHALLENGE","TARGET_CHAMPIONSHIP"),
   beat("build","Build anticipation","Tease the forthcoming moment without claiming a win.","VIDEO_PACKAGE","BUILD_ANTICIPATION")]},
 {id:"REDEMPTION",family:"RISE",name:"Redemption Arc",description:"Rebuild trust after a genuine failure or past action.",
  motivation:"Make amends",desiredFeeling:"Gradually earned respect",beats:[
   beat("own","Own the past","Explain motivation; only reference certified history.","PROMO","REVEAL_MOTIVATION"),
   beat("help","Do the right thing","Book a rescue, not an imagined act of heroism.","RESCUE","EARN_TRUST"),
   beat("face","Face the consequences","Confront someone legitimately affected.","CONFRONTATION","BUILD_RIVALRY")]},
 {id:"LOSING_STREAK",family:"RISE",name:"Comeback from Defeat",description:"A losing wrestler searches for a turning point.",
  motivation:"Rebuild confidence",desiredFeeling:"Concern turning to belief",beats:[
   beat("reflect","Admit frustration","Only count actual certified losses.","INTERVIEW","BUILD_CHARACTER"),
   beat("rebuild","Show the work","Promote an upcoming return without claiming success.","VIDEO_PACKAGE","BUILD_ANTICIPATION"),
   beat("prove","Ask for a test","Issue an on-screen challenge.","CHALLENGE","PROVE_POINT")]},
 {id:"SLOW_BURN_VILLAIN",family:"FALL",name:"Slow-Burn Villain",description:"Resentment becomes selfishness before a deliberate turn.",
  motivation:"Feels overlooked or disrespected",desiredFeeling:"Unease turning to hostility",beats:[
   beat("resent","Show signs of frustration","Voice a grievance without claiming a past relationship.","INTERVIEW","REVEAL_MOTIVATION"),
   beat("line","Cross a line","Steal someone's spotlight without changing alignment.","INTERRUPTION","STEAL_SPOTLIGHT"),
   beat("turn","Complete the transformation","Explicitly book a turn when the manager chooses.","TURN","REINVENT_CHARACTER")]},
 {id:"JEALOUSY",family:"FALL",name:"Jealousy and Obsession",description:"A competitor cannot bear another person's success.",
  motivation:"Craves another's spotlight",desiredFeeling:"Tension and frustration",beats:[
   beat("grudge","Demand respect","Claim the spotlight is undeserved.","PROMO","DEMAND_RESPECT"),
   beat("interrupt","Steal the moment","Interrupt an actual rival's scene.","INTERRUPTION","HUMILIATE_TARGET"),
   beat("attack","Let jealousy explode","Book a real attack with a genuine target.","ATTACK","BUILD_RIVALRY")]},
 {id:"CORRUPTED_CHAMPION",family:"FALL",name:"Corrupted Champion",description:"Success feeds arrogance and moral compromise.",
  motivation:"Keep power at any cost",desiredFeeling:"Growing indignation",beats:[
   beat("crown","Celebrate superiority","Self-congratulation without inventing a title reign.","CELEBRATION","ASSERT_DOMINANCE"),
   beat("mock","Test a challenger","Make a challenge, not a predetermined win.","CHALLENGE","PROVE_POINT"),
   beat("choose","Reveal their true colours","A turn must be booked and certified to change alignment.","TURN","SHOCK_AUDIENCE")]},
 {id:"DESCENT",family:"FALL",name:"Descent into Darkness",description:"A wrestler becomes increasingly volatile under pressure.",
  motivation:"Overcome frustration by any means",desiredFeeling:"Unpredictability",beats:[
   beat("unease","Show the warning signs","Build a character without inventing mental illness.","VIDEO_PACKAGE","BUILD_CHARACTER"),
   beat("explode","Confront the cause","A real face-to-face with no predetermined aftermath.","CONFRONTATION","BUILD_RIVALRY"),
   beat("lash","Lash out","Book a physical scene without assuming blood or injury.","ATTACK","HUMILIATE_TARGET")]},
 {id:"BETRAYAL",family:"RELATIONSHIPS",name:"Impending Betrayal",description:"A real partnership frays until the manager chooses what happens.",
  motivation:"Doubt a trusted ally",desiredFeeling:"Suspicion and heartbreak",beats:[
   beat("hint","Hint at a divide","Tease betrayal; the alliance must already be supported by facts.","INTERVIEW","TEASE_BETRAYAL"),
   beat("trust","Earn trust first","An actual rescue can make the future choice matter.","RESCUE","EARN_TRUST"),
   beat("choice","Make the choice","A real TURN scene is required for an alignment change.","TURN","TEASE_BETRAYAL")]},
 {id:"UNEASY_ALLIANCE",family:"RELATIONSHIPS",name:"Uneasy Alliance",description:"Two people cooperate while trust remains fragile.",
  motivation:"Need each other despite misgivings",desiredFeeling:"Nervous cooperation",beats:[
   beat("aid","Help reluctantly","Rescue another wrestler without inventing a tag team.","RESCUE","PROTECT_ALLY"),
   beat("doubt","Express doubts","Let someone address an awkward alliance.","INTERVIEW","BUILD_CHARACTER"),
   beat("repair","Offer peace","A faction reconciliation requires an actual faction.","STABLE_RECONCILIATION","REPAIR_ALLIANCE")]},
 {id:"MENTOR",family:"RELATIONSHIPS",name:"Mentor and Protégé",description:"Guidance, ambition and different expectations.",
  motivation:"Teach, learn, or surpass a mentor",desiredFeeling:"Affection and tension",beats:[
   beat("teach","Explain the lesson","A conversation is not proof of a prior mentorship.","INTERVIEW","BUILD_CHARACTER"),
   beat("protect","Intervene for them","Book a real rescue if the mentor helps.","RESCUE","EARN_TRUST"),
   beat("test","Set the test","A challenge can become a separate booked match.","CHALLENGE","PROVE_POINT")]},
 {id:"FACTION_CIVIL_WAR",family:"RELATIONSHIPS",name:"Faction Civil War",description:"Leadership and loyalty split an established group.",
  motivation:"Take control of an existing faction",desiredFeeling:"Divided loyalty",beats:[
   beat("recruit","Seek loyalty","Requires a real faction before invitation is saved.","STABLE_INVITATION","RECRUIT_ALLY"),
   beat("power","Assert authority","Make the struggle public.","INTERRUPTION","ASSERT_DOMINANCE"),
   beat("split","Walk away or expel","Only a booked faction exit affects its membership.","STABLE_EXIT","EXPLAIN_SPLIT")]},
 {id:"VENDETTA",family:"CONFLICT",name:"Personal Vendetta",description:"A genuine grievance becomes a consuming rivalry.",
  motivation:"Settle a personal score",desiredFeeling:"Righteous anger",beats:[
   beat("reason","Explain the grudge","Do not invent history or prior attacks.","PROMO","REVEAL_MOTIVATION"),
   beat("answer","Demand an answer","Face the named rival.","CONFRONTATION","SEEK_REVENGE"),
   beat("retaliate","Strike back","Book a real attack with an actual victim.","ATTACK","SEEK_REVENGE")]},
 {id:"RESPECT",family:"CONFLICT",name:"Respect Must Be Earned",description:"Two competitors demand recognition.",
  motivation:"Prove their worth",desiredFeeling:"Competitive respect",beats:[
   beat("demand","Demand respect","Let the wrestler state the issue.","PROMO","DEMAND_RESPECT"),
   beat("prove","Issue the challenge","Request a match without booking it automatically.","CHALLENGE","PROVE_POINT"),
   beat("stand","Stand face to face","Choose an honest confrontation outcome.","CONFRONTATION","BUILD_RIVALRY")]},
 {id:"GENERATIONS",family:"CONFLICT",name:"Generational Clash",description:"A veteran and rising star test each other's values.",
  motivation:"Defend a legacy or challenge convention",desiredFeeling:"Pride and competition",beats:[
   beat("legacy","Defend the legacy","Do not invent a family connection.","INTERVIEW","DEFEND_REPUTATION"),
   beat("challenge","Call for a test","Demand a bout, not an automatic title shot.","CHALLENGE","PROVE_POINT"),
   beat("rival","Trade words","A confrontation to challenge assumptions.","CONFRONTATION","BUILD_RIVALRY")]},
 {id:"POWER_STRUGGLE",family:"CONFLICT",name:"Power Struggle",description:"Two figures battle for influence and authority.",
  motivation:"Control the spotlight or leadership",desiredFeeling:"High-stakes tension",beats:[
   beat("assert","Claim authority","Show ambition, not invented management powers.","PROMO","MAKE_STATEMENT"),
   beat("interrupt","Undermine a rival","Make the disruption happen on screen.","INTERRUPTION","ASSERT_DOMINANCE"),
   beat("face","Force a confrontation","Arrange the public conflict.","CONFRONTATION","BUILD_RIVALRY")]}
] as const;
export function storyBlueprint(id:string):StoryBlueprint|undefined{
 return STORY_BLUEPRINTS.find(p=>p.id===id);
}
export function storyBlueprintFamily(family:BlueprintFamily):readonly StoryBlueprint[]{
 return STORY_BLUEPRINTS.filter(p=>p.family===family);
}
