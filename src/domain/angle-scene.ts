/** Explicit filmed direction: the physical aftermath is kayfabe and must
 * not produce a medical absence or a guaranteed popularity/heat gain. */
import type {SegmentKind} from "../simulation/legacy/show-segments.js";
/** Grouped location choices are an editor concern; one precise place persists. */
export const ANGLE_LOCATION_AREAS={
 ARENA:["IN_RING","RINGSIDE","ENTRANCE_RAMP","CROWD_BARRICADE"],
 BACKSTAGE:["BACKSTAGE","HALLWAY","LOCKER_ROOM","GORILLA_POSITION","INTERVIEW_AREA","PRODUCTION_AREA","OFFICE","CATERING","TRAINING_AREA","MEDICAL_ROOM"],
 OUTSIDE:["PARKING_LOT","LOADING_BAY","OUTSIDE_ARENA","STREET_ENTRANCE","HOTEL_LOBBY"]
} as const;
export const ANGLE_LOCATIONS=Object.values(ANGLE_LOCATION_AREAS).flat();
export type AngleLocation=(typeof ANGLE_LOCATIONS)[number];
export const ANGLE_VISUALS=[
 "NONE","LEFT_LYING","BLOODIED","OFFICIALS_SEPARATE","DRIVEN_OFF"
] as const;
export const ANGLE_INTENSITIES=["WARNING","BEATDOWN","BRUTAL"] as const;
export const ANGLE_PURPOSES=[
 "BUILD_RIVALRY","START_RIVALRY","ELEVATE_INITIATOR","BUILD_TARGET_SYMPATHY",
 "SET_UP_MATCH","MAKE_STATEMENT","SEEK_REVENGE","HUMILIATE_TARGET",
 "TARGET_CHAMPIONSHIP","BUILD_CHARACTER","RALLY_SUPPORT","DEMAND_RESPECT",
 "SEND_WARNING","REVEAL_MOTIVATION","DEFEND_REPUTATION","TEASE_BETRAYAL",
 "PROVE_POINT","CELEBRATE_SUCCESS","ASSERT_DOMINANCE","STEAL_SPOTLIGHT",
 "PROTECT_ALLY","EARN_TRUST","EXPLAIN_TURN","SHOCK_AUDIENCE",
 "REINVENT_CHARACTER","COST_RIVAL_VICTORY","INTRODUCE_WRESTLER",
 "BUILD_ANTICIPATION","RECAP_RIVALRY","PROMOTE_EVENT","UNSETTLE_RIVAL",
 "RECRUIT_ALLY","BUILD_FACTION","EXPLOIT_TENSION","EXPLAIN_SPLIT",
 "ASSERT_INDEPENDENCE","REPAIR_ALLIANCE"
] as const;
export interface AngleScene{
 location:AngleLocation;
 visual:(typeof ANGLE_VISUALS)[number];
 purpose:(typeof ANGLE_PURPOSES)[number];
 /** Physical severity is on-screen storytelling, NOT a certified injury. */
 intensity?:(typeof ANGLE_INTENSITIES)[number];
}
/** Context-driven options shape new bookings. Historical directions remain valid
 * even if they would no longer appear in this kind's short picker. */
export const ANGLE_PURPOSE_OPTIONS:Readonly<Record<SegmentKind,readonly AngleScene["purpose"][]>>={
 PROMO:["MAKE_STATEMENT","BUILD_CHARACTER","RALLY_SUPPORT","DEMAND_RESPECT","SET_UP_MATCH","TARGET_CHAMPIONSHIP","BUILD_RIVALRY","SEND_WARNING"],
 INTERVIEW:["REVEAL_MOTIVATION","BUILD_CHARACTER","DEFEND_REPUTATION","BUILD_RIVALRY","TARGET_CHAMPIONSHIP","TEASE_BETRAYAL"],
 CONFRONTATION:["BUILD_RIVALRY","START_RIVALRY","HUMILIATE_TARGET","SET_UP_MATCH","SEEK_REVENGE","TARGET_CHAMPIONSHIP","SEND_WARNING"],
 CHALLENGE:["SET_UP_MATCH","TARGET_CHAMPIONSHIP","SEEK_REVENGE","PROVE_POINT","MAKE_STATEMENT"],
 CELEBRATION:["CELEBRATE_SUCCESS","RALLY_SUPPORT","HUMILIATE_TARGET","MAKE_STATEMENT","ASSERT_DOMINANCE"],
 ATTACK:["BUILD_RIVALRY","START_RIVALRY","ELEVATE_INITIATOR","BUILD_TARGET_SYMPATHY","SET_UP_MATCH","MAKE_STATEMENT","SEEK_REVENGE","HUMILIATE_TARGET","TARGET_CHAMPIONSHIP","PROTECT_ALLY"],
 INTERRUPTION:["STEAL_SPOTLIGHT","BUILD_RIVALRY","HUMILIATE_TARGET","SEND_WARNING","START_RIVALRY","ASSERT_DOMINANCE"],
 RESCUE:["PROTECT_ALLY","EARN_TRUST","BUILD_RIVALRY","SET_UP_MATCH","MAKE_STATEMENT"],
 POST_MATCH_ASSAULT:["BUILD_RIVALRY","SEEK_REVENGE","HUMILIATE_TARGET","BUILD_TARGET_SYMPATHY","TARGET_CHAMPIONSHIP","MAKE_STATEMENT"],
 TURN:["EXPLAIN_TURN","SHOCK_AUDIENCE","REINVENT_CHARACTER","TEASE_BETRAYAL","BUILD_RIVALRY"],
 CONTRACT_SIGNING:["SET_UP_MATCH","BUILD_RIVALRY","HUMILIATE_TARGET","TARGET_CHAMPIONSHIP","MAKE_STATEMENT"],
 INTERFERENCE:["COST_RIVAL_VICTORY","PROTECT_ALLY","BUILD_RIVALRY","SEEK_REVENGE","SEND_WARNING"],
 DEBUT:["INTRODUCE_WRESTLER","BUILD_ANTICIPATION","MAKE_STATEMENT","UNSETTLE_RIVAL"],
 VIDEO_PACKAGE:["BUILD_ANTICIPATION","RECAP_RIVALRY","PROMOTE_EVENT","INTRODUCE_WRESTLER","SEND_WARNING","BUILD_CHARACTER"],
 STABLE_INVITATION:["RECRUIT_ALLY","BUILD_FACTION","HUMILIATE_TARGET","EXPLOIT_TENSION"],
 STABLE_EXIT:["EXPLAIN_SPLIT","ASSERT_INDEPENDENCE","START_RIVALRY","REINVENT_CHARACTER"],
 STABLE_RECONCILIATION:["REPAIR_ALLIANCE","EARN_TRUST","EXPLOIT_TENSION","BUILD_FACTION"]
};
const preferredLocations:Partial<Record<SegmentKind,readonly AngleLocation[]>>={
 PROMO:["IN_RING","RINGSIDE","ENTRANCE_RAMP","BACKSTAGE","INTERVIEW_AREA","LOCKER_ROOM","OFFICE","PARKING_LOT"],
 INTERVIEW:["INTERVIEW_AREA","BACKSTAGE","LOCKER_ROOM","IN_RING","OFFICE","PARKING_LOT","HOTEL_LOBBY"],
 CELEBRATION:["IN_RING","RINGSIDE","ENTRANCE_RAMP","BACKSTAGE","LOCKER_ROOM","OFFICE"],
 POST_MATCH_ASSAULT:["IN_RING","RINGSIDE","ENTRANCE_RAMP"],
 CONTRACT_SIGNING:["IN_RING","RINGSIDE","INTERVIEW_AREA","OFFICE","BACKSTAGE"],
 INTERFERENCE:["IN_RING","RINGSIDE","ENTRANCE_RAMP","CROWD_BARRICADE","BACKSTAGE"],
 DEBUT:["IN_RING","ENTRANCE_RAMP","BACKSTAGE","PRODUCTION_AREA"],
 VIDEO_PACKAGE:["PRODUCTION_AREA","BACKSTAGE","LOCKER_ROOM","IN_RING","TRAINING_AREA","OUTSIDE_ARENA","PARKING_LOT"],
 STABLE_INVITATION:["IN_RING","BACKSTAGE","LOCKER_ROOM","OFFICE","INTERVIEW_AREA"],
 STABLE_EXIT:["IN_RING","BACKSTAGE","LOCKER_ROOM","OFFICE","PARKING_LOT"],
 STABLE_RECONCILIATION:["IN_RING","BACKSTAGE","LOCKER_ROOM","OFFICE","INTERVIEW_AREA"]
};
export function angleLocationsFor(kind:SegmentKind):readonly AngleLocation[]{
 return preferredLocations[kind]??ANGLE_LOCATIONS;
}
export function anglePurposesFor(kind:SegmentKind):readonly AngleScene["purpose"][]{
 return ANGLE_PURPOSE_OPTIONS[kind];
}
const defaultLocation:Partial<Record<SegmentKind,AngleLocation>>={
 INTERVIEW:"INTERVIEW_AREA",ATTACK:"BACKSTAGE",INTERFERENCE:"RINGSIDE",
 DEBUT:"ENTRANCE_RAMP",VIDEO_PACKAGE:"PRODUCTION_AREA",
 STABLE_EXIT:"BACKSTAGE",STABLE_RECONCILIATION:"BACKSTAGE"
};
const physical=new Set<SegmentKind>(["ATTACK","POST_MATCH_ASSAULT"]);
export function angleLocationArea(place:AngleLocation):keyof typeof ANGLE_LOCATION_AREAS{
 for(const area of Object.keys(ANGLE_LOCATION_AREAS) as (keyof typeof ANGLE_LOCATION_AREAS)[])
  if((ANGLE_LOCATION_AREAS[area] as readonly string[]).includes(place))return area;
 return "ARENA";
}
export function initialAngleScene(kind:SegmentKind):AngleScene{
 return {location:defaultLocation[kind]??"IN_RING",
  visual:"NONE",purpose:ANGLE_PURPOSE_OPTIONS[kind][0]!,
  ...(physical.has(kind)?{intensity:"BEATDOWN" as const}:{})};
}
export function isAngleScene(value:unknown,kind:string):value is AngleScene{
 if(!value||typeof value!=="object"||Array.isArray(value))return false;
 const s=value as Record<string,unknown>;
 if(Object.keys(s).some(k=>!["location","visual","purpose","intensity"].includes(k))||
  !("location" in s)||!("visual" in s)||!("purpose" in s)||
  !ANGLE_LOCATIONS.includes(s.location as AngleLocation)||
  !ANGLE_VISUALS.includes(s.visual as AngleScene["visual"])||
  !ANGLE_PURPOSES.includes(s.purpose as AngleScene["purpose"]))return false;
 if(s.intensity!==undefined&&(!physical.has(kind as SegmentKind)||
  !ANGLE_INTENSITIES.includes(s.intensity as NonNullable<AngleScene["intensity"]>)))return false;
 if(!physical.has(kind as SegmentKind)&&s.visual!=="NONE")return false;
 if(s.intensity==="WARNING"&&s.visual==="BLOODIED")return false;
 if(kind==="POST_MATCH_ASSAULT"&&
  !["IN_RING","RINGSIDE","ENTRANCE_RAMP"].includes(String(s.location)))return false;
 return true;
}
const names:Record<string,string>={
 ARENA:"Inside the arena",BACKSTAGE:"Backstage",OUTSIDE:"Outside the arena",
 IN_RING:"In the ring",RINGSIDE:"At ringside",ENTRANCE_RAMP:"Entrance ramp",
 CROWD_BARRICADE:"By the crowd barricade",HALLWAY:"Backstage corridor",
 LOCKER_ROOM:"Locker room",GORILLA_POSITION:"Gorilla position",
 CATERING:"Catering area",TRAINING_AREA:"Training room",MEDICAL_ROOM:"Medical room",
 HOTEL_LOBBY:"Hotel lobby",
 INTERVIEW_AREA:"Interview area",PRODUCTION_AREA:"Production area",
 PARKING_LOT:"Arena car park",LOADING_BAY:"Loading bay",
 OUTSIDE_ARENA:"Outside the arena",STREET_ENTRANCE:"Street entrance",OFFICE:"Management office",
 NONE:"No physical aftermath",LEFT_LYING:"Leave them laid out",
 BLOODIED:"Leave them bloodied",OFFICIALS_SEPARATE:"Officials break it up",
 DRIVEN_OFF:"Attacker driven off",WARNING:"Warning / brief scuffle",
 BEATDOWN:"Sustained attack",BRUTAL:"Brutal beatdown",
 BUILD_RIVALRY:"Escalate an existing feud",START_RIVALRY:"Start a new rivalry",
 ELEVATE_INITIATOR:"Get the attacker over",BUILD_TARGET_SYMPATHY:"Build sympathy for the victim",
 SET_UP_MATCH:"Set up a future match",MAKE_STATEMENT:"Make a statement",
 SEEK_REVENGE:"Settle an old score",HUMILIATE_TARGET:"Humiliate the target",
 TARGET_CHAMPIONSHIP:"Send a title warning",
 BUILD_CHARACTER:"Develop their character",RALLY_SUPPORT:"Win the crowd over",
 DEMAND_RESPECT:"Demand respect",SEND_WARNING:"Issue a warning",
 REVEAL_MOTIVATION:"Reveal their motivation",DEFEND_REPUTATION:"Defend their reputation",
 TEASE_BETRAYAL:"Hint at a betrayal",PROVE_POINT:"Prove a point",
 CELEBRATE_SUCCESS:"Celebrate an achievement",ASSERT_DOMINANCE:"Assert dominance",
 STEAL_SPOTLIGHT:"Steal the spotlight",PROTECT_ALLY:"Protect an ally",
 EARN_TRUST:"Earn somebody's trust",EXPLAIN_TURN:"Explain the change of heart",
 SHOCK_AUDIENCE:"Shock the audience",REINVENT_CHARACTER:"Reinvent their identity",
 COST_RIVAL_VICTORY:"Spoil a rival's chances",INTRODUCE_WRESTLER:"Introduce the wrestler",
 BUILD_ANTICIPATION:"Build anticipation",RECAP_RIVALRY:"Remind fans of the feud",
 PROMOTE_EVENT:"Promote an upcoming show",UNSETTLE_RIVAL:"Unsettle a rival",
 RECRUIT_ALLY:"Recruit an ally",BUILD_FACTION:"Strengthen the faction",
 EXPLOIT_TENSION:"Exploit a faction's tension",EXPLAIN_SPLIT:"Explain the split",
 ASSERT_INDEPENDENCE:"Strike out alone",REPAIR_ALLIANCE:"Try to repair the alliance"
};
export function angleSceneLabel(value:string){return names[value]??value;}

/** Natural on-air scene placement, never technical field labels. */
export function angleSceneLocationPhrase(place:AngleLocation):string{
 const phrases:Record<AngleLocation,string>={
  IN_RING:"in the ring",RINGSIDE:"at ringside",
  ENTRANCE_RAMP:"on the entrance ramp",CROWD_BARRICADE:"by the crowd barricade",
  BACKSTAGE:"backstage",HALLWAY:"in the backstage corridor",
  LOCKER_ROOM:"in the locker room",GORILLA_POSITION:"at gorilla position",
  INTERVIEW_AREA:"in the interview area",PRODUCTION_AREA:"in the production area",
  OFFICE:"in the management office",CATERING:"in catering",
  TRAINING_AREA:"in the training room",MEDICAL_ROOM:"in the medical room",
  HOTEL_LOBBY:"in the hotel lobby",PARKING_LOT:"in the arena car park",
  LOADING_BAY:"at the loading bay",OUTSIDE_ARENA:"outside the arena",
  STREET_ENTRANCE:"at the street entrance"
 };
 return phrases[place];
}
