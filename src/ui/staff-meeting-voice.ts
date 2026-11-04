import type {StaffRole} from "../domain/world-staff.js";
/** Tone only. Never changes the named department's verified observations. */
export type MeetingPersonality="FRANK"|"PATIENT"|"ECCENTRIC"|"LOYAL"|"AMBITIOUS"|null;
export function staffMeetingDialogue(input:{
 role:StaffRole;staffName:string|null;personality:MeetingPersonality;message:string;
}):string{
 const {staffName,personality,message}=input;
 if(!staffName)return "House office note: "+message;
 const calm=/^(?:No |Nothing |We have no |There are no |Our referees )/i.test(message);
 const openings:Record<Exclude<MeetingPersonality,null>,readonly [string,string]>={
  FRANK:["Straight answer? ","Good, no drama there. "],
  PATIENT:["Here's how I'd approach it. ","For now, let's keep it steady. "],
  ECCENTRIC:["Here's the part that caught my eye. ","No fire to put out here. "],
  LOYAL:["Let's look after the people involved. ","The team's in a good place here. "],
  AMBITIOUS:["Here's where I would push further. ","Good, now let's build on it. "]
 };
 const ambitiousCues:Partial<Record<StaffRole,string>>={
  CREATIVE:"The creative opportunity: ",COMMENTATOR:"For the broadcast: ",
  SCOUT:"From the scouting desk: ",TALENT_MANAGER:"On the contracts: ",
  ROAD_AGENT:"From Gorilla: ",PRODUCTION:"For the next show: ",
  MEDICAL:"On wrestler fitness: ",REFEREE:"From the referee: ",
  TRAINER:"On the training side: "
 };
 const intro=personality==="AMBITIOUS"?
  ambitiousCues[input.role]??"Here's the opportunity: ":
  personality?openings[personality][calm?1:0]:"";
 return intro+message;
}
