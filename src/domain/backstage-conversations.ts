/** Text is presentation; request, decision and certified match evidence are gameplay. */
export type BackstageKind="CONTRACT"|"MORALE"|"MOMENTUM"|"CREATIVE"|"PARTNERSHIP"|"ROLE_USAGE"|"GIMMICK_PITCH"|"TAG_TEAM_PITCH";
export type BackstageDecision="TALK"|"DECLINE"|"PROMISE_APPEARANCE"|
 "PROMISE_SEGMENT"|"PROMISE_FEATURED"|"EXPLORE_RENEWAL"|"MEDIATE"|
 "CONSIDER_REPACKAGE"|"KEEP_CHARACTER"|"EXPLORE_TEAM"|"NOT_NOW";
export const BACKSTAGE_CHOICES:Record<BackstageKind,readonly BackstageDecision[]>={
 CONTRACT:["EXPLORE_RENEWAL","TALK","DECLINE"],
 MORALE:["PROMISE_APPEARANCE","TALK","DECLINE"],
 MOMENTUM:["PROMISE_APPEARANCE","TALK","DECLINE"],
 CREATIVE:["PROMISE_SEGMENT","TALK","DECLINE"],
 PARTNERSHIP:["MEDIATE","TALK","DECLINE"],
 ROLE_USAGE:["PROMISE_FEATURED","TALK","DECLINE"],
 GIMMICK_PITCH:["CONSIDER_REPACKAGE","KEEP_CHARACTER"],
 TAG_TEAM_PITCH:["EXPLORE_TEAM","NOT_NOW"],
};
export const BACKSTAGE_LABELS:Record<BackstageDecision,string>={
 TALK:"Hear them out",DECLINE:"Turn down request",
 PROMISE_APPEARANCE:"Promise an in-ring appearance",
 PROMISE_SEGMENT:"Promise time for a promo or angle",
 PROMISE_FEATURED:"Promise a featured match",
 CONSIDER_REPACKAGE:"Explore a different character",
 KEEP_CHARACTER:"Keep the current character",
 EXPLORE_TEAM:"Explore a tag partnership",NOT_NOW:"Not right now",
 EXPLORE_RENEWAL:"Discuss new contract terms",MEDIATE:"Mediate backstage",
};
export function backstageDecisionEffect(kind:BackstageKind,decision:BackstageDecision){
 if(!BACKSTAGE_CHOICES[kind]?.includes(decision))
  throw new Error("This wrestler request does not offer that response");
 // Conversation engagement alone cannot award competitive stats.
 return {moraleDelta:0,
  promise:["PROMISE_APPEARANCE","PROMISE_SEGMENT","PROMISE_FEATURED"].includes(decision),
  status:(decision==="DECLINE"||decision==="KEEP_CHARACTER"||decision==="NOT_NOW")?"DECLINED" as const:
   ["PROMISE_APPEARANCE","PROMISE_SEGMENT","PROMISE_FEATURED"].includes(decision)?
    "PROMISED" as const:"ANSWERED" as const};
}
export function backstageMessage(kind:BackstageKind,evidence?:{
 observedMatchShows?:number|null;averageCrowd?:number|null;
 partnerName?:string;verifiedTagShows?:number|null;averageExecution?:number|null;
}){
 switch(kind){
  case "CONTRACT":return "My deal is nearly up. Can we talk about what happens next?";
  case "MORALE":return "I'm not happy with how things are going. I need to feel valued.";
  case "MOMENTUM":return "I've lost momentum. Can you get me back in the ring?";
  case "CREATIVE":return "I need more of a voice on this show. Can I get some mic time or an angle?";
  case "PARTNERSHIP":return "There's tension backstage with someone I've worked with. Can you help us settle it?";
  case "ROLE_USAGE":return "My contract says I should feature near the top of the card. I've worked the matches, but where's that promised spot?";
  case "TAG_TEAM_PITCH":return "We've got chemistry in the ring with "+
   (evidence?.partnerName??"my partner")+". Two or more strong tag matches ("+
   (evidence?.verifiedTagShows??"several")+" together). Could we build on that?";
  case "GIMMICK_PITCH":return "The crowd response has been cold across "+
   (evidence?.observedMatchShows??"several")+" matches"+
   (evidence?.averageCrowd!==null&&evidence?.averageCrowd!==undefined?
    " (average "+evidence.averageCrowd+"/100)":"")+
   ". Maybe a different character could work? I'm open to hearing a pitch.";
 }
}
export function backstageReply(decision:BackstageDecision,status:string){
 if(status==="FULFILLED")return "You kept your word. That match meant a lot to me.";
 if(status==="BROKEN")return "You made me a booking promise and didn't deliver. I won't forget.";
 if(status==="EXCUSED")return "The circumstances changed. We couldn't reasonably follow through this time.";
 switch(decision){
  case "TALK":return "Thanks for hearing me out. It helps.";
  case "DECLINE":return "That's disappointing. I thought we could work something out.";
  case "PROMISE_APPEARANCE":return "I'll hold you to that. Two weeks to book me in a match.";
  case "PROMISE_SEGMENT":return "Thanks. Give me a promo or an angle in the next two weeks.";
  case "PROMISE_FEATURED":return "Four weeks to put me in my contracted featured spot. I will remember.";
  case "EXPLORE_RENEWAL":return "Good. Let's talk terms at the Contract Desk.";
  case "MEDIATE":return "I appreciate you trying to make things right backstage.";
  case "CONSIDER_REPACKAGE":return "I'm open to a new direction. Pitch a specific character below; I still need to agree.";
  case "KEEP_CHARACTER":return "Fair enough. We'll keep the character for now.";
  case "EXPLORE_TEAM":return "Love it. Book us together and let's see where this goes.";
  case "NOT_NOW":return "No worries. We'll keep doing our own thing.";
 }
}
