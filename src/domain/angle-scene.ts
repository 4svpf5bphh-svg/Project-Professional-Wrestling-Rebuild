/** Explicit filmed direction: the physical aftermath is kayfabe and must
 * not produce a medical absence or a guaranteed popularity/heat gain. */
import type {SegmentKind} from "../simulation/legacy/show-segments.js";
export const ANGLE_LOCATIONS=[
 "IN_RING","ENTRANCE_RAMP","BACKSTAGE","LOCKER_ROOM","PARKING_LOT","OFFICE"
] as const;
export const ANGLE_VISUALS=[
 "NONE","LEFT_LYING","BLOODIED","OFFICIALS_SEPARATE","DRIVEN_OFF"
] as const;
export const ANGLE_PURPOSES=[
 "BUILD_RIVALRY","ELEVATE_INITIATOR","BUILD_TARGET_SYMPATHY",
 "SET_UP_MATCH","MAKE_STATEMENT"
] as const;
export interface AngleScene{
 location:(typeof ANGLE_LOCATIONS)[number];
 visual:(typeof ANGLE_VISUALS)[number];
 purpose:(typeof ANGLE_PURPOSES)[number];
}
const physical=new Set<SegmentKind>(["ATTACK","POST_MATCH_ASSAULT"]);
export function initialAngleScene(kind:SegmentKind):AngleScene{
 return {location:kind==="ATTACK"?"BACKSTAGE":"IN_RING",
  visual:"NONE",purpose:physical.has(kind)?"BUILD_RIVALRY":"MAKE_STATEMENT"};
}
export function isAngleScene(value:unknown,kind:string):value is AngleScene{
 if(!value||typeof value!=="object"||Array.isArray(value))return false;
 const s=value as Record<string,unknown>;
 if(Object.keys(s).length!==3||
  !ANGLE_LOCATIONS.includes(s.location as AngleScene["location"])||
  !ANGLE_VISUALS.includes(s.visual as AngleScene["visual"])||
  !ANGLE_PURPOSES.includes(s.purpose as AngleScene["purpose"]))return false;
 if(!physical.has(kind as SegmentKind)&&s.visual!=="NONE")return false;
 if(kind==="POST_MATCH_ASSAULT"&&
  s.location!=="IN_RING"&&s.location!=="ENTRANCE_RAMP")return false;
 return true;
}
const names:Record<string,string>={
 IN_RING:"In the ring",ENTRANCE_RAMP:"Entrance ramp",BACKSTAGE:"Backstage",
 LOCKER_ROOM:"Locker room",PARKING_LOT:"Parking lot",OFFICE:"Office",
 NONE:"No physical aftermath",LEFT_LYING:"Leave them laid out",
 BLOODIED:"Leave them bloodied",OFFICIALS_SEPARATE:"Officials break it up",
 DRIVEN_OFF:"Attacker driven off",BUILD_RIVALRY:"Escalate the rivalry",
 ELEVATE_INITIATOR:"Get the initiator over",
 BUILD_TARGET_SYMPATHY:"Make the victim sympathetic",
 SET_UP_MATCH:"Build towards a match",MAKE_STATEMENT:"Make a statement"
};
export function angleSceneLabel(value:string){return names[value]??value;}
