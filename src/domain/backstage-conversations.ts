/** Text is presentation; request, decision and certified match evidence are gameplay. */
export type BackstageKind="CONTRACT"|"MORALE"|"MOMENTUM"|"CREATIVE"|"PARTNERSHIP";
export type BackstageDecision="TALK"|"DECLINE"|"PROMISE_APPEARANCE"|
 "PROMISE_SEGMENT"|"EXPLORE_RENEWAL"|"MEDIATE";
export const BACKSTAGE_CHOICES:Record<BackstageKind,readonly BackstageDecision[]>={
 CONTRACT:["EXPLORE_RENEWAL","TALK","DECLINE"],
 MORALE:["PROMISE_APPEARANCE","TALK","DECLINE"],
 MOMENTUM:["PROMISE_APPEARANCE","TALK","DECLINE"],
 CREATIVE:["PROMISE_SEGMENT","TALK","DECLINE"],
 PARTNERSHIP:["MEDIATE","TALK","DECLINE"],
};
export const BACKSTAGE_LABELS:Record<BackstageDecision,string>={
 TALK:"Hear them out",DECLINE:"Turn down request",
 PROMISE_APPEARANCE:"Promise an in-ring appearance",
 PROMISE_SEGMENT:"Promise time for a promo or angle",
 EXPLORE_RENEWAL:"Discuss new contract terms",MEDIATE:"Mediate backstage",
};
export function backstageDecisionEffect(kind:BackstageKind,decision:BackstageDecision){
 if(!BACKSTAGE_CHOICES[kind]?.includes(decision))
  throw new Error("This wrestler request does not offer that response");
 return {moraleDelta:decision==="DECLINE"?-4:
  decision==="TALK"?2:decision==="MEDIATE"?3:1,
  promise:decision==="PROMISE_APPEARANCE"||decision==="PROMISE_SEGMENT",
  status:decision==="DECLINE"?"DECLINED" as const:
   (decision==="PROMISE_APPEARANCE"||decision==="PROMISE_SEGMENT")?
    "PROMISED" as const:"ANSWERED" as const};
}
export function backstageMessage(kind:BackstageKind){
 switch(kind){
  case "CONTRACT":return "My deal is nearly up. Can we talk about what happens next?";
  case "MORALE":return "I'm not happy with how things are going. I need to feel valued.";
  case "MOMENTUM":return "I've lost momentum. Can you get me back in the ring?";
  case "CREATIVE":return "I need more of a voice on this show. Can I get some mic time or an angle?";
  case "PARTNERSHIP":return "There's tension backstage with someone I've worked with. Can you help us settle it?";
 }
}
export function backstageReply(decision:BackstageDecision,status:string){
 if(status==="FULFILLED")return "You kept your word. That match meant a lot to me.";
 if(status==="BROKEN")return "You made me a booking promise and didn't deliver. I won't forget.";
 switch(decision){
  case "TALK":return "Thanks for hearing me out. It helps.";
  case "DECLINE":return "That's disappointing. I thought we could work something out.";
  case "PROMISE_APPEARANCE":return "I'll hold you to that. Two weeks to book me in a match.";
  case "PROMISE_SEGMENT":return "Thanks. Give me a promo or an angle in the next two weeks.";
  case "EXPLORE_RENEWAL":return "Good. Let's talk terms at the Contract Desk.";
  case "MEDIATE":return "I appreciate you trying to make things right backstage.";
 }
}
