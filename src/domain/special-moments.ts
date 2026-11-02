/** Premium scripted wrestling spectacles. These are presentation choices, not
 * score modifiers or additional segment types. Bound to a real segment/scene.
 * Account-wide KP entitlements are checked at the authoritative card save.
 */
import type {SegmentKind} from "../simulation/legacy/show-segments.js";
import type {AngleLocation} from "./angle-scene.js";
export const SPECIAL_MOMENTS=[
 {sku:"MOMENT_VEHICLE_HOSING",label:"Vehicle hosedown",price:1800,
  kind:"INTERRUPTION",locations:["RINGSIDE","ENTRANCE_RAMP"],
  needsTarget:true,description:"A bizarre vehicle arrives and sprays rivals with milk, water or another harmless prop."},
 {sku:"MOMENT_ARENA_INVASION",label:"Arena takeover",price:1500,
  kind:"CONFRONTATION",locations:["IN_RING","ENTRANCE_RAMP","IN_CROWD"],
  needsTarget:true,description:"A faction storms the arena and hijacks the segment."},
 {sku:"MOMENT_TITLE_DESECRATION",label:"Championship disrespect",price:1350,
  kind:"PROMO",locations:["IN_RING","RINGSIDE","ENTRANCE_RAMP"],
  needsTarget:true,description:"A champion or contender publicly disrespects a championship and its rival."},
 {sku:"MOMENT_ENTRANCE_SABOTAGE",label:"Entrance sabotage",price:1200,
  kind:"INTERRUPTION",locations:["ENTRANCE_RAMP","RINGSIDE"],
  needsTarget:true,description:"A rival's entrance is hijacked with a humiliating prank."},
 {sku:"MOMENT_UNMASKING",label:"Unmasking attempt",price:1650,
  kind:"ATTACK",locations:["IN_RING","RINGSIDE","BACKSTAGE","LOCKER_ROOM"],
  needsTarget:true,description:"A humiliating attempt to tear away an opponent's mask."},
 {sku:"MOMENT_FALSE_ALLIANCE",label:"Elaborate betrayal",price:1500,
  kind:"TURN",locations:["IN_RING","RINGSIDE","BACKSTAGE","LOCKER_ROOM"],
  needsTarget:true,description:"A supposed ally reveals that the reconciliation was a trap."},
 {sku:"MOMENT_MOCK_CEREMONY",label:"Mock award ceremony",price:1100,
  kind:"CELEBRATION",locations:["IN_RING","RINGSIDE","ENTRANCE_RAMP"],
  needsTarget:true,description:"An over-the-top ceremony designed to embarrass a named rival."},
 {sku:"MOMENT_SPECTACULAR_DEBUT",label:"Spectacular arrival",price:2000,
  kind:"DEBUT",locations:["ENTRANCE_RAMP","IN_RING","IN_CROWD"],
  needsTarget:false,description:"A show-stealing entrance, vehicle arrival or blackout reveal."}
] as const satisfies readonly {sku:string;label:string;price:number;kind:SegmentKind;
 locations:readonly AngleLocation[];needsTarget:boolean;description:string}[];
export type SpecialMomentSku=(typeof SPECIAL_MOMENTS)[number]["sku"];
export function specialMomentBySku(sku:unknown){
 return typeof sku==="string"?SPECIAL_MOMENTS.find(x=>x.sku===sku)??null:null;
}
export function isSpecialMomentForScene(
 sku:unknown,kind:SegmentKind,location:AngleLocation|undefined,
 targetCount:number,
):boolean{
 const moment=specialMomentBySku(sku);
 return !!moment&&moment.kind===kind&&!!location&&
  (moment.locations as readonly string[]).includes(location)&&
  (!moment.needsTarget||targetCount>0);
}
export function specialMomentNarrative(sku:SpecialMomentSku,actors:string,targets:string):string{
 switch(sku){
  case "MOMENT_VEHICLE_HOSING":
   return "A ridiculous vehicle pulled into the arena and "+actors+
    " soaked "+targets+" in a spectacular public humiliation.";
  case "MOMENT_ARENA_INVASION":
   return actors+" stormed the arena, taking over the scene in front of "+targets+".";
  case "MOMENT_TITLE_DESECRATION":
   return actors+" openly disrespected the championship to provoke "+targets+".";
  case "MOMENT_ENTRANCE_SABOTAGE":
   return actors+" sabotaged the entrance of "+targets+" with a humiliating stunt.";
  case "MOMENT_UNMASKING":
   return actors+" attempted to tear away the mask of "+targets+" in front of the cameras.";
  case "MOMENT_FALSE_ALLIANCE":
   return actors+" exposed a carefully staged alliance and betrayed "+targets+".";
  case "MOMENT_MOCK_CEREMONY":
   return actors+" staged a sham award ceremony mocking "+targets+".";
  case "MOMENT_SPECTACULAR_DEBUT":
   return actors+" made an unforgettable arrival with a full arena spectacle.";
 }
}
