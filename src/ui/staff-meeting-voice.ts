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
  AMBITIOUS:["There's something we can improve here. ","One less thing holding us back. "]
 };
 return (personality?openings[personality][calm?1:0]:"My view? ")+message;
}
