/** Explicit filmed direction: the physical aftermath is kayfabe and must
 * not produce a medical absence or a guaranteed popularity/heat gain. */
import type {SegmentKind} from "../simulation/legacy/show-segments.js";
/** Grouped location choices are an editor concern; one precise place persists. */
export const ANGLE_LOCATION_AREAS={
 ARENA:["IN_RING","RINGSIDE","ENTRANCE_RAMP","CROWD_BARRICADE"],
 BACKSTAGE:["BACKSTAGE","HALLWAY","LOCKER_ROOM","GORILLA_POSITION","INTERVIEW_AREA","PRODUCTION_AREA","OFFICE"],
 OUTSIDE:["PARKING_LOT","LOADING_BAY","OUTSIDE_ARENA","STREET_ENTRANCE"]
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
 "TARGET_CHAMPIONSHIP"
] as const;
export interface AngleScene{
 location:AngleLocation;
 visual:(typeof ANGLE_VISUALS)[number];
 purpose:(typeof ANGLE_PURPOSES)[number];
 /** Physical severity is on-screen storytelling, NOT a certified injury. */
 intensity?:(typeof ANGLE_INTENSITIES)[number];
}
const physical=new Set<SegmentKind>(["ATTACK","POST_MATCH_ASSAULT"]);
export function angleLocationArea(place:AngleLocation):keyof typeof ANGLE_LOCATION_AREAS{
 for(const area of Object.keys(ANGLE_LOCATION_AREAS) as (keyof typeof ANGLE_LOCATION_AREAS)[])
  if((ANGLE_LOCATION_AREAS[area] as readonly string[]).includes(place))return area;
 return "ARENA";
}
export function initialAngleScene(kind:SegmentKind):AngleScene{
 return {location:kind==="ATTACK"?"BACKSTAGE":"IN_RING",
  visual:"NONE",purpose:physical.has(kind)?"BUILD_RIVALRY":"MAKE_STATEMENT",
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
 if(kind==="POST_MATCH_ASSAULT"&&
  !["IN_RING","RINGSIDE","ENTRANCE_RAMP"].includes(String(s.location)))return false;
 return true;
}
const names:Record<string,string>={
 ARENA:"Inside the arena",BACKSTAGE:"Backstage",OUTSIDE:"Outside the arena",
 IN_RING:"In the ring",RINGSIDE:"At ringside",ENTRANCE_RAMP:"Entrance ramp",
 CROWD_BARRICADE:"By the crowd barricade",HALLWAY:"Backstage corridor",
 LOCKER_ROOM:"Locker room",GORILLA_POSITION:"Gorilla position",
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
 TARGET_CHAMPIONSHIP:"Send a title warning"
};
export function angleSceneLabel(value:string){return names[value]??value;}
