/** Text is presentation; request, decision and certified match evidence are gameplay. */
export type BackstageKind="CONTRACT"|"MORALE"|"MOMENTUM"|"CREATIVE"|"PARTNERSHIP"|"ROLE_USAGE"|"GIMMICK_PITCH"|"TAG_TEAM_PITCH"|"RIVALRY_PITCH"|"TEAM_MOMENT"|"MEDICAL_SUPPORT"|"BOOKING_OMISSION"|"LOSS_STREAK"|"TITLE_AMBITION"|"TRUST_CHECK_IN";
export type BackstageDecision="TALK"|"DECLINE"|"PROMISE_APPEARANCE"|
 "PROMISE_SEGMENT"|"PROMISE_FEATURED"|"EXPLORE_RENEWAL"|"MEDIATE"|
 "CONSIDER_REPACKAGE"|"KEEP_CHARACTER"|"EXPLORE_TEAM"|"EXPLORE_RIVALRY"|"NOT_NOW";
export const BACKSTAGE_CHOICES:Record<BackstageKind,readonly BackstageDecision[]>={
 CONTRACT:["EXPLORE_RENEWAL","TALK","DECLINE"],
 MORALE:["PROMISE_APPEARANCE","TALK","DECLINE"],
 MOMENTUM:["PROMISE_APPEARANCE","TALK","DECLINE"],
 CREATIVE:["PROMISE_SEGMENT","TALK","DECLINE"],
 PARTNERSHIP:["MEDIATE","TALK","DECLINE"],
 ROLE_USAGE:["PROMISE_FEATURED","TALK","DECLINE"],
 GIMMICK_PITCH:["CONSIDER_REPACKAGE","KEEP_CHARACTER"],
 TAG_TEAM_PITCH:["EXPLORE_TEAM","NOT_NOW"],
 RIVALRY_PITCH:["EXPLORE_RIVALRY","NOT_NOW"],
 TEAM_MOMENT:[],
 MEDICAL_SUPPORT:["TALK","DECLINE"],
 BOOKING_OMISSION:["PROMISE_APPEARANCE","TALK","DECLINE"],
 LOSS_STREAK:["TALK","PROMISE_APPEARANCE","DECLINE"],
 TITLE_AMBITION:["TALK","DECLINE"],
 TRUST_CHECK_IN:["TALK","DECLINE"],
};
export const BACKSTAGE_LABELS:Record<BackstageDecision,string>={
 TALK:"Hear them out",DECLINE:"Turn down request",
 PROMISE_APPEARANCE:"Promise an in-ring appearance",
 PROMISE_SEGMENT:"Promise time for a promo or angle",
 PROMISE_FEATURED:"Promise a featured match",
 CONSIDER_REPACKAGE:"Explore a different character",
 KEEP_CHARACTER:"Keep the current character",
 EXPLORE_TEAM:"Explore a tag partnership",
 EXPLORE_RIVALRY:"Explore a rivalry programme",
 NOT_NOW:"Not right now",
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
 workingVerifiedShows?:number|null;workingTrustDelta?:number|null;
 verifiedSinglesShows?:number|null;professionalTrust?:number|null;
 observedAbsentWeeks?:number|null;observedLosses?:number|null;
 relevantTitle?:string|null;
},requestId=""){
 // Pure, deterministic conversational inflection; never generate a new
 // message just because a wrestler thread is reopened.
 let hash=0;
 for(const ch of requestId)hash=(Math.imul(hash,31)+ch.charCodeAt(0))|0;
 const voice=requestId?Math.abs(hash%3):0;
 const partner=evidence?.partnerName??"that wrestler";
 const alternatives:Partial<Record<BackstageKind,string[]>>={
  CONTRACT:["My deal is nearly up. Can we talk about what happens next?",
   "My contract's coming up. I need to know where I stand with you.",
   "I'd rather hear the plan before my deal runs out. Can we talk?"],
  MORALE:["I'm not happy with how things are going. I need to feel valued.",
   "I want to matter here. Right now I'm struggling to see how I fit.",
   "We need a chat. This isn't the run I imagined."],
  MOMENTUM:["I've lost momentum. Can you get me back in the ring?",
   "I'm slipping off the radar. I'd love a match I can get my teeth into.",
   "The buzz has gone quiet. What's the plan for me?"],
  CREATIVE:["I need more of a voice on this show. Can I get some mic time or an angle?",
   "Let me show some personality out there. I've got more than another entrance.",
   "Give me a story or something worthwhile to say."],
  PARTNERSHIP:["Our tag work with "+partner+" has slipped. Can we talk about fixing it?",
   "Something isn't right between me and "+partner+". I'd rather sort it out.",
   "I'm not asking to break up with "+partner+". I want this partnership to work."],
  ROLE_USAGE:["My deal says I should feature near the top. I've done the matches. Where's the spot?",
   "I signed to be a big part of the show, not an afterthought. Where's my featured match?",
   "I've done my part in the ring. The featured spot we agreed on hasn't happened."],
  RIVALRY_PITCH:["There's something there with "+partner+". The crowd feels it. Can we build a rivalry?",
   "Every time I face "+partner+", there's an edge to it. We could make a proper story.",
   "Give me a programme with "+partner+". We've shown the spark in our matches."],
  TEAM_MOMENT:["The tag chemistry with "+partner+" is clicking. Let's keep building.",
   "That felt good out there with "+partner+". We're understanding each other.",
   "I think "+partner+" and I have something special together."],
  TAG_TEAM_PITCH:["We have chemistry with "+partner+". Could we make this team official?",
   "I reckon "+partner+" and I could be a real team. What do you say?",
   "We have put the work in as a pair. Let's give the team a name."],
  GIMMICK_PITCH:["The crowd response has been cold. Maybe a different character could work?",
   "I'm not getting through to the audience with this character. Got another idea?",
   "This version of me isn't clicking. Could we agree on a new direction?"],
  MEDICAL_SUPPORT:["That injury has me on the sidelines. Can we talk about a plan for my return?",
   "Recovery isn't fun. I'd like to know you'll still have a place for me when I'm cleared.",
   "I'm doing the rehab work. Just don't forget about me while I'm out."],
  BOOKING_OMISSION:["It's been a while since I appeared on a show. Is there still a place for me?",
   "I keep seeing cards without my name on them. Can we change that?",
   "I'm ready to wrestle, but I need to be booked first. What's the plan?"],
  LOSS_STREAK:["I've taken a run of losses lately. I can handle losing, but where's the story going?",
   "Another match, another loss. Tell me there's a direction to this.",
   "I'm not afraid to put someone over. I don't want it to become my whole career."],
  TITLE_AMBITION:["I had a shot at "+(evidence?.relevantTitle??"the championship")+". I want to earn another.",
   "That title match still stays with me. Is there a path back into the picture?",
   "I've tasted a championship chance. I'm not done chasing that belt."],
  TRUST_CHECK_IN:["I remember that booking promise you made. It never happened. We need to talk.",
   "You gave me your word and it fell through. Can I get a straight answer this time?",
   "It's hard to put that missed promise behind us. Can we clear the air?"]
 };
 if(alternatives[kind])return alternatives[kind]![voice]!;
 switch(kind){
  case "CONTRACT":return "My deal is nearly up. Can we talk about what happens next?";
  case "MORALE":return "I'm not happy with how things are going. I need to feel valued.";
  case "MOMENTUM":return "I've lost momentum. Can you get me back in the ring?";
  case "CREATIVE":return "I need more of a voice on this show. Can I get some mic time or an angle?";
  case "PARTNERSHIP":return "Our tag work has slipped with "+
   (evidence?.partnerName??"my partner")+". After "+
   (evidence?.workingVerifiedShows??"several")+" matches, "+
   "our working trust took a hit. Can we sort it out?";
  case "ROLE_USAGE":return "My contract says I should feature near the top of the card. I've worked the matches, but where's that promised spot?";
  case "RIVALRY_PITCH":return "We have something with "+
   (evidence?.partnerName??"that opponent")+". The crowd has responded across "+
   (evidence?.verifiedSinglesShows??"multiple")+" singles shows"+
   (evidence?.averageCrowd!==null&&evidence?.averageCrowd!==undefined?
    " (average "+evidence.averageCrowd+"/100)":"")+
   ". We trust each other to make it work. Want to build a rivalry?";
  case "TEAM_MOMENT":return "The tag chemistry with "+
   (evidence?.partnerName??"my partner")+
   " is clicking. Two strong shows together — the crowd and locker room can feel it.";
  case "TAG_TEAM_PITCH":return "We've got chemistry in the ring with "+
   (evidence?.partnerName??"my partner")+". We have been tearing it up together ("+
   (evidence?.verifiedTagShows??"several")+" matches so far). Could we make it official?";
  case "GIMMICK_PITCH":return "The crowd response has been cold across "+
   (evidence?.observedMatchShows??"several")+" matches"+
   (evidence?.averageCrowd!==null&&evidence?.averageCrowd!==undefined?
    " (average "+evidence.averageCrowd+"/100)":"")+
   ". Maybe a different character could work? I'm open to hearing a pitch.";
 }
}
/** The manager speaks naturally; labels remain brief buttons, not dialogue. */
export function backstageManagerReply(decision:BackstageDecision):string{
 switch(decision){
  case "TALK":return "You've got my attention. Tell me what you've got in mind.";
  case "DECLINE":return "I've heard your case, but I can't agree right now.";
  case "PROMISE_APPEARANCE":return "I'll put you in a match within the next two weeks.";
  case "PROMISE_SEGMENT":return "I'll give you promo or angle time within two weeks.";
  case "PROMISE_FEATURED":return "I'll get you a featured match within four weeks.";
  case "EXPLORE_RENEWAL":return "Let's discuss a new deal. We still need to agree the terms.";
  case "MEDIATE":return "I'll speak to both of you. The trust still has to be earned in the ring.";
  case "CONSIDER_REPACKAGE":return "Let's explore a character that fits you. Nothing changes without your approval.";
  case "KEEP_CHARACTER":return "We're keeping your current character. It still belongs to you.";
  case "EXPLORE_TEAM":return "There could be something here. Let's see how it develops.";
  case "EXPLORE_RIVALRY":return "That rivalry has possibilities. Let's discuss the story.";
  case "NOT_NOW":return "Not right now. Keep at it and we'll revisit the idea.";
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
  case "MEDIATE":return "I'll try, but our trust needs to be rebuilt through working together.";
  case "CONSIDER_REPACKAGE":return "I'm open to a new direction. Pitch a specific character below; I still need to agree.";
  case "KEEP_CHARACTER":return "Fair enough. We'll keep the character for now.";
  case "EXPLORE_TEAM":return "Love it. Book us together and let's see where this goes.";
  case "EXPLORE_RIVALRY":return "Let's tell this story right. Start the programme when you're ready; you call the shots.";
  case "NOT_NOW":return "No worries. We'll keep doing our own thing.";
 }
}
