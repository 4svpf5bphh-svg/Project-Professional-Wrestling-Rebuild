
/** Retirement never awards staff credentials for celebrity alone.
 * Only completed career evidence can qualify an agent, trainer, commentator
 * or creative voice; medical and production require separate qualifications.
 */
import {createHash} from "node:crypto";
import type {StaffRole,WorldStaffMember} from "./world-staff.js";
export interface RetiredCareerEvidence{
 personId:string;name:string;status:string;
 inRingQuality:number|null;matchCraft:number|null;presentation:number|null;
 safety:number|null;careerExperience:number|null;
 matches:number;wins:number;tagMatches:number;
}
export interface QualifiedAlumnus extends WorldStaffMember{
 formerWrestlerId:string;careerNote:string;qualifiedWeekIndex:number;
}
const clamp=(x:number)=>Math.min(100,Math.max(0,Math.round(x)));
export function retiredStaffCandidate(p:RetiredCareerEvidence,qualifiedWeekIndex:number):
 QualifiedAlumnus|null{
 if(p.status!=="RETIRED"||!Number.isSafeInteger(qualifiedWeekIndex)||
  qualifiedWeekIndex<0||p.matches<12||
  p.careerExperience===null||p.careerExperience<35||
  p.inRingQuality===null||p.matchCraft===null||
  p.presentation===null||p.safety===null)return null;
 const ring=clamp(p.inRingQuality),craft=clamp(p.matchCraft),
  presentation=clamp(p.presentation),safety=clamp(p.safety),
  experience=clamp(p.careerExperience);
 const choices:{role:Extract<StaffRole,"ROAD_AGENT"|"TRAINER"|"COMMENTATOR"|"CREATIVE">;
  score:number;specialism:string}[]=[];
 if(p.matches>=16&&craft>=62)
  choices.push({role:"ROAD_AGENT",score:craft*.58+ring*.3+experience*.12,
   specialism:p.tagMatches>=8?"tag wrestling":"match psychology"});
 if(safety>=65)
  choices.push({role:"TRAINER",score:safety*.46+ring*.36+experience*.18,
   specialism:p.tagMatches>=8?"team fundamentals":"ring fundamentals"});
 if(presentation>=70)
  choices.push({role:"COMMENTATOR",score:presentation*.7+experience*.2+craft*.1,
   specialism:"in-ring colour"});
 if(p.matches>=18&&craft>=72&&presentation>=55)
  choices.push({role:"CREATIVE",score:craft*.65+presentation*.35,
   specialism:"wrestler character work"});
 choices.sort((a,b)=>b.score-a.score||a.role.localeCompare(b.role));
 const choice=choices[0];
 if(!choice)return null;
 const staffId="alumni-"+createHash("sha256").update(p.personId).digest("hex").slice(0,28);
 const people=clamp(presentation*.55+experience*.3+safety*.15);
 const reliability=clamp(safety*.65+experience*.35);
 const staffCraft=clamp(choice.score);
 const temperament=(p.tagMatches>p.matches*.65?"LOYAL":
  p.wins>p.matches*.7?"AMBITIOUS":
  safety>=82?"PATIENT":presentation>=85?"ECCENTRIC":"FRANK") as QualifiedAlumnus["personality"];
 const salary=Math.round((200+staffCraft*9)/10)*10;
 return {staffId,formerWrestlerId:p.personId,name:p.name,role:choice.role,
  craft:staffCraft,people,reliability,insight:clamp((staffCraft*2+people+reliability)/4),
  weeklySalary:salary,personality:temperament,specialism:choice.specialism,
  careerNote:p.matches+" certified matches · "+p.wins+" wins · "+
   p.tagMatches+" tag bouts",qualifiedWeekIndex};
}
