/** The wrestler owns their character. Edits are proposals, not overrides.
 * Compact phone-like conversation shows the actual wrestler's response.
 */
import type {readPortablePersonaWorkspace}
 from "../db/portable-persona-workspace.js";
type View=Awaited<ReturnType<typeof readPortablePersonaWorkspace>>;
import {BACKSTAGE_CHOICES,BACKSTAGE_LABELS,backstageManagerReply,backstageMessage,backstageReply,
 type BackstageDecision} from "../domain/backstage-conversations.js";
export interface PersonaDeskPort{
 load(personId?:string):Promise<View>;
 markRead(personId:string):Promise<{readCount:number}>;
 archiveThread(personId:string,archived:boolean):Promise<unknown>;
 decide(input:{conversationId:string;decision:BackstageDecision;
  requestId:string;expectedRevision:number}):Promise<unknown>;
 request(input:{personId:string;gimmickId:string;
  requestId:string;expectedRevision:number}):Promise<unknown>;
 openWrestler?(personId:string):void;
}
const el=(tag:string,cls="",label="")=>{
 const n=document.createElement(tag);n.className=cls;n.textContent=label;return n;
};
const button=(title:string,action:()=>void,disabled=false)=>{
 const x=el("button","ppw-persona-button",title) as HTMLButtonElement;
 x.type="button";x.onclick=action;x.disabled=disabled;return x;
};
export function mountPersonaDesk(root:HTMLElement,
 port:PersonaDeskPort,onBack?:()=>void,onOpenProgrammes?:()=>void,
 initialInboxFilter:"ALL"|"UNREAD"="ALL",initialPersonId?:string){
 let view:View|null=null,loading=false,error="",chosen:string|null=null,
 search="",answer:string|null=null,personId:string|undefined;
 let pane:"INBOX"|"THREAD"|"PROFILE"=initialPersonId?"THREAD":"INBOX";
 let inboxFilter:"ALL"|"UNREAD"|"ACTIVE"|"HISTORY"|"ARCHIVED"=initialInboxFilter;
 let inboxSearch="";
 let lastInboxScroll=0;
 // Private read/archive receipts change presentation, not the wrestler's
 // simulation. Keep the current bounded inbox rather than loading it twice.
 function updateIncoming(person:string,
  transform:(incoming:NonNullable<View["roster"][number]["latestIncoming"]>)=>
   NonNullable<View["roster"][number]["latestIncoming"]>){
  if(!view)return;
  view={...view,roster:view.roster.map(w=>w.personId===person&&w.latestIncoming?
   {...w,latestIncoming:transform(w.latestIncoming)}:w)};
 }
 const returnToMessages=()=>{
  pane="INBOX";render();
  requestAnimationFrame(()=>{
   const inbox=root.querySelector<HTMLElement>(".ppw-backstage-contacts");
   if(inbox)inbox.scrollTop=lastInboxScroll;
  });
 };
 async function load(id?:string){
  personId=id;loading=true;render();
  try{
   view=await port.load(id);
   // An inaccessible or retired target resolves to the normal inbox.
   if(id&&pane==="THREAD"&&view.personId!==id)pane="INBOX";
   if(pane==="THREAD"&&view.personId&&
    view.roster.some(x=>x.personId===view!.personId&&x.isCurrent&&
     x.latestIncoming?.read_week_index===null)){
    const selected=view.personId;
    const marked=await port.markRead(selected);
    if(marked.readCount>0){
     const now=(view.worldYear-1)*52+view.worldWeek-1;
     updateIncoming(selected,old=>({...old,read_week_index:now}));
    }
   }
   chosen=null;search="";error="";
  }
  catch(e){error=e instanceof Error?e.message:"Unable to load wrestler identity";}
  finally{loading=false;render();}
 }
 async function archive(person:string,archived:boolean){
  if(loading)return;
  loading=true;render();
  try{
   const receipt=await port.archiveThread(person,archived);
   if(!receipt||typeof receipt!=="object"||
     !("archivedThroughWeekIndex" in receipt)||
     typeof receipt.archivedThroughWeekIndex!=="number")
    throw new Error("Could not confirm the conversation change");
   const through=receipt.archivedThroughWeekIndex;
   updateIncoming(person,old=>({...old,
    archived:old.created_week_index<=through}));
   error="";pane="INBOX";inboxFilter=archived?"ARCHIVED":"ALL";
  }catch(e){error=e instanceof Error?e.message:"Unable to update archive";}
  finally{loading=false;render();}
 }
 async function decide(conversationId:string,decision:BackstageDecision){
  if(loading||!view?.personId||!view.canEdit)return;
  const selected=view.personId,revision=view.worldRevision;
  loading=true;error="";answer=null;render();
  try{
   const result=await port.decide({conversationId,decision,
    requestId:crypto.randomUUID(),expectedRevision:revision});
   if(!result||typeof result!=="object"||!("status" in result)||
     (result as {status:string}).status==="STALE")
    throw new Error("Backstage has changed. Reload the conversation.");
   view=await port.load(selected);
   answer=null;
  }catch(e){error=e instanceof Error?e.message:"Unable to send reply";}
  finally{loading=false;render();}
 }
 async function request(){
  if(loading||!view?.personId||!chosen||view.worldRevision===null)return;
  const name=view.personId,gimmick=chosen;loading=true;error="";answer=null;render();
  try{
   const outcome=await port.request({personId:name,gimmickId:gimmick,
    requestId:crypto.randomUUID(),expectedRevision:view.worldRevision});
   if(!outcome||typeof outcome!=="object"||!("result" in outcome))
    throw new Error("Wrestler did not respond");
   const result=(outcome as {result:{accepted:boolean;reason:string}}).result;
   view=await port.load(name);chosen=null;
   answer=result.accepted?
    "Agreed. This is my character now — you'll see it wherever I work.":
    result.reason==="ICONIC_PERSONA_PROTECTED"?
     "That identity means too much to me. I'm keeping it.":
    result.reason==="CREATIVE_APPROVAL_WITHHELD"?
     "You need my approval for that, and I'm not giving it.":
     "I hear the pitch, but I'm staying with the character I've built.";
  }catch(e){error=e instanceof Error?e.message:"Proposal could not be reviewed";}
  finally{loading=false;render();}
 }
 let preservedThreadScroll:number|null=null,preservedThreadPerson:string|null=null;
 function render(){
  const previous=root.querySelector<HTMLElement>(".ppw-persona-chat");
  if(previous){preservedThreadScroll=previous.scrollTop;
   preservedThreadPerson=previous.dataset.personId??null;}
  root.classList.add("ppw-editor","ppw-persona-desk","ppw-messenger");
  root.classList.remove("ppw-messenger-inbox","ppw-messenger-thread",
   "ppw-messenger-profile");
  root.classList.add("ppw-messenger-"+pane.toLowerCase());
  root.replaceChildren();
  const head=el("header","ppw-persona-header");
  if(onBack)head.append(button("← Back",onBack));
  if(pane==="INBOX")head.append(el("h1","","Messages"));
  else head.append(el("span","ppw-eyebrow","CONTACTS"),
   el("h1","","Contact details"),
   el("p","ppw-muted","Private career conversations and character history."));
  if(pane!=="THREAD")root.append(head);
  if(error)root.append(el("p","ppw-alert ppw-error",error));
  if(!view){root.append(button(loading?"Loading…":"Retry",()=>void load(personId),loading));return;}
  const tabs=el("nav","ppw-backstage-tabs");
  tabs.setAttribute("aria-label","Backstage messages and contacts");
  for(const [id,label] of [["INBOX","Chats"],["PROFILE","People"]] as const){
   const tab=button(label,()=>{pane=id;render();});
   if(pane===id)tab.classList.add("ppw-persona-selected");
   tabs.append(tab);
  }
  if(pane!=="THREAD")root.append(tabs);
  if(pane==="INBOX"){
   const inbox=el("section","ppw-backstage-inbox");
   const threadCount=view.roster.filter(w=>!!w.latestIncoming||!!w.lastMessage).length;
   const unreadCount=view.roster.filter(w=>w.isCurrent&&w.latestIncoming&&
    w.latestIncoming.read_week_index===null&&!w.latestIncoming.archived).length;
   const topline=el("div","ppw-messenger-inbox-topline");
   topline.append(el("span","ppw-messenger-inbox-label","MY CONVERSATIONS"),
    el("span","ppw-messenger-inbox-count",
     threadCount+" chats"+(unreadCount?" · "+unreadCount+" unread":"")));
   inbox.append(topline);
   const controls=el("div","ppw-backstage-filters");
   for(const [filter,label] of [["ALL","All"],["UNREAD","Unread"],
    ["ACTIVE","Requests"],["HISTORY","History"],
    ["ARCHIVED","Archived"]] as const){
    const b=button(label,()=>{inboxFilter=filter;render();});
    if(filter===inboxFilter)b.classList.add("ppw-persona-selected");
    controls.append(b);
   }
   inbox.append(controls);
   // Local filtering keeps the iPhone keyboard and focus in place.
   const searchInput=document.createElement("input");
   searchInput.type="search";searchInput.value=inboxSearch;
   searchInput.placeholder="Find a conversation";
   searchInput.setAttribute("aria-label","Search Backstage conversations");
   searchInput.className="ppw-backstage-inbox-search";
   const entries=el("div","ppw-backstage-contacts");
   entries.setAttribute("role","list");
   entries.setAttribute("aria-label","Private conversations");
   entries.onscroll=()=>{lastInboxScroll=entries.scrollTop;};
   inbox.append(searchInput);
   let count=0;
   for(const wrestler of [...view.roster].filter(w=>{
    const latest=w.latestIncoming;
    if(inboxFilter==="ARCHIVED")return latest?.archived===true;
    if(latest?.archived)return false;
    if(inboxFilter==="UNREAD")return !!latest&&latest.read_week_index===null;
    if(inboxFilter==="ACTIVE")return latest?.status==="PENDING"||latest?.status==="PROMISED";
    if(inboxFilter==="HISTORY")return !!latest&&
     !["PENDING","PROMISED"].includes(latest.status);
    return !!latest||!!w.lastMessage;
   }).sort((a,b)=>
    Number(b.latestIncoming?.status==="PENDING")-
    Number(a.latestIncoming?.status==="PENDING")||
    (b.latestIncoming?.created_week_index??-1)-
    (a.latestIncoming?.created_week_index??-1)||
    a.name.localeCompare(b.name))){
    const active=wrestler.personId===view.personId;
    const last=wrestler.lastMessage;
    const incoming=wrestler.latestIncoming;
    const concern=wrestler.morale!==null&&wrestler.morale<35?
     " · Wants to talk":wrestler.momentum!==null&&wrestler.momentum<25?
     " · Career check-in":"";
    const preview=incoming&&incoming.status==="PENDING"&&
     Object.hasOwn(BACKSTAGE_CHOICES,incoming.kind)?
      backstageMessage(incoming.kind as keyof typeof BACKSTAGE_CHOICES):null;
    const summary=preview??(incoming?" · "+(incoming.status==="PENDING"?"New message":
     incoming.status==="PROMISED"?"Awaiting your booking":
     incoming.status==="FULFILLED"?"Promise kept":
     incoming.status==="NOTED"?"Locker-room good news":
     incoming.status==="BROKEN"?"Promise broken":"Conversation history")+
     " · "+incoming.kind.replaceAll("_"," ").toLowerCase():
     last?" · "+(last.status==="ACCEPTED"?"Agreed":"Declined")+
     ": "+last.requested_gimmick_id.replaceAll("_"," ").toLowerCase():concern);
    const unread=wrestler.isCurrent&&incoming?.read_week_index===null;
     const stamp=incoming?" · Y"+(Math.floor(incoming.created_week_index/52)+1)+
      " W"+(incoming.created_week_index%52+1):"";
     const item=button("",()=>{
      lastInboxScroll=entries.scrollTop;
      pane="THREAD";if(active&&unread)void load(wrestler.personId);
       else if(active)render();else void load(wrestler.personId);
    });
    item.classList.add("ppw-backstage-contact");
    if(unread)item.classList.add("ppw-backstage-unread");
    const avatar=el("span","ppw-backstage-avatar",
     wrestler.name.trim().split(/\s+/).slice(0,2).map(part=>part[0]??"").join("").toUpperCase());
    avatar.setAttribute("aria-hidden","true");
    avatar.style.setProperty("--messenger-hue",String([...wrestler.personId].reduce(
     (n,ch)=>(n*31+ch.charCodeAt(0))%360,0)));
    const copy=el("span","ppw-backstage-contact-copy");
    const top=el("span","ppw-backstage-contact-top");
    top.append(el("strong","",wrestler.name),
     el("small","ppw-backstage-contact-stamp",stamp.replace(/^ · /,"")));
    copy.append(top,
     el("span","ppw-backstage-contact-preview",
      summary.replace(/^ · /,"")||(wrestler.isCurrent?"Open conversation":"Former talent")));
    item.append(avatar,copy);
    if(incoming?.status==="PENDING")
     item.append(el("span","ppw-messenger-awaiting","REPLY"));
    if(unread)item.append(el("span","ppw-backstage-unread-dot",""));
    entries.append(item);
    count++;
   }
   const empty=el("p","ppw-muted",count?
    "No matching conversations.":"No messages yet. Use Wrestler profile to inspect your roster.");
   const updateSearch=()=>{
    const phrase=inboxSearch.trim().toLowerCase();
    let visible=0;
    for(const child of Array.from(entries.children)){
     const contact=child as HTMLButtonElement;
     const match=!phrase||contact.textContent?.toLowerCase().includes(phrase)===true;
     contact.hidden=!match;
     if(match)visible++;
    }
    empty.hidden=visible>0;
   };
   searchInput.oninput=()=>{inboxSearch=searchInput.value;updateSearch();};
   updateSearch();
   inbox.append(entries,empty);
   root.append(inbox);return;
  }
  if(!view.personId){
   root.append(el("p","ppw-muted","Select a wrestler from Messages to open their conversation."));
   root.append(button("← Messages",()=>{pane="INBOX";render();}));return;
  }
  if(pane==="PROFILE"&&!view.persona){
   root.append(el("p","ppw-muted","No character notes are available yet. The conversation remains accessible."));
   if(port.openWrestler)root.append(button("Open wrestler dossier ↗",
    ()=>port.openWrestler?.(view!.personId!)));
   return;
  }
  const choice=el("label","ppw-field");
  choice.append(el("span","","Select a roster wrestler"));
  const select=document.createElement("select");
  select.disabled=loading;select.setAttribute("aria-label","Select wrestler profile");
  for(const p of view.roster){
   const o=document.createElement("option");o.value=p.personId;o.textContent=p.name;
   select.append(o);
  }
  select.value=view.personId;select.onchange=()=>void load(select.value);
  choice.append(select);
  if(pane==="PROFILE"){
   root.append(choice);
   if(port.openWrestler)root.append(button("Full wrestler dossier ↗",
    ()=>port.openWrestler?.(view!.personId!)));
   if(view.personId)root.append(button("Open conversation →",()=>{
    pane="THREAD";
    const selected=view?.roster.find(x=>x.personId===view?.personId);
    if(selected?.isCurrent&&selected.latestIncoming?.read_week_index===null)
     void load(view!.personId!);
    else render();
   }));
  }
  const persona=view.persona;
  if(persona){
  const live=el("section","ppw-persona-active");
  live.append(el("span","ppw-eyebrow","CURRENT CHARACTER"),
   el("h2","",persona.personaName),
   el("strong","ppw-persona-gimmick",persona.gimmickId.replaceAll("_"," ")),
   el("p","ppw-muted",persona.primaryStyle?
    "Style · "+persona.primaryStyle.replaceAll("_"," ")+
     (persona.secondaryStyle?" / "+persona.secondaryStyle.replaceAll("_"," "):""):
    "Wrestling style not documented yet"));
  for(const [title,moves] of [["Signature moves",persona.signatureMoves],
   ["Finishers",persona.finishingMoves]] as const){
   const section=el("div","ppw-persona-moves");
   section.append(el("h3","",title));
   if(!moves.length)section.append(el("p","ppw-muted","Not documented"));
   else for(const move of moves){
    const row=el("p","",move.name+" · "+move.category.toLowerCase());
    if(move.source==="PPW_AUTHORED")row.append(
     el("small","ppw-muted"," · Custom move"));
    section.append(row);
   }
   live.append(section);
  }
  if(pane==="PROFILE")root.append(live);
  }
  if(pane==="PROFILE"&&view.documentedAlternates.length){
   const alt=el("section","ppw-persona-alternates");
   alt.append(el("h2","","Past ring identities"),
    el("p","ppw-muted","Past characters and alternate names."));
   for(const p of view.documentedAlternates)
    alt.append(el("p","",p.personaName+" · "+p.gimmickId.replaceAll("_"," ")));
   root.append(alt);
  }
  if(pane==="PROFILE"&&view.history.length){
   const history=el("section","ppw-persona-history");
   history.append(el("h2","","Character history"));
   for(const row of view.history){
    const a=row.persona;
    history.append(el("p","",a.personaName+" · "+
     a.gimmickId.replaceAll("_"," ")+" · "+ "Y"+
     (Math.floor(row.startedWeekIndex/52)+1)+" W"+(row.startedWeekIndex%52+1)+
     " – Y"+(Math.floor(row.endedWeekIndex/52)+1)+
     " W"+(row.endedWeekIndex%52+1)));
   }
   root.append(history);
  }
  if(pane==="PROFILE")return;
  const contact=view.roster.find(x=>x.personId===view!.personId)?.latestIncoming;
  let archiveButton:HTMLButtonElement|null=null;
  if(contact&&view.roster.find(x=>x.personId===view!.personId)?.isCurrent){
   archiveButton=button(contact.archived?"Restore conversation":"Archive conversation",
    ()=>void archive(view!.personId!,!contact.archived),loading);
   archiveButton.classList.add("ppw-backstage-archive");
  }
  if(view.roster.find(x=>x.personId===view!.personId)?.isCurrent===false)
   root.append(el("p","ppw-muted",
    "Former talent · retained private conversation. No active contract or booking decisions."));
  const previousScroll=preservedThreadPerson===view.personId?
   preservedThreadScroll:null;
  const chat=el("section","ppw-persona-chat");
  chat.dataset.personId=view.personId;
  chat.setAttribute("aria-label","Conversation with "+view.personName);
  const chatHead=el("header","ppw-backstage-phone-header");
  const returnToInbox=button("← Chats",returnToMessages);
  returnToInbox.classList.add("ppw-backstage-phone-back");
  returnToInbox.setAttribute("aria-label","Back to Backstage inbox");
  const monogram=el("span","ppw-backstage-phone-avatar",
   view.personName.trim().split(/\s+/).slice(0,2).map(part=>part[0]??"").join("").toUpperCase());
  monogram.setAttribute("aria-hidden","true");
  monogram.style.setProperty("--messenger-hue",String([...view.personId].reduce(
   (n,ch)=>(n*31+ch.charCodeAt(0))%360,0)));
  const identity=el("span","ppw-backstage-phone-identity");
  identity.append(el("strong","",view.personName),el("small","","Private conversation"));
  const details=button("Dossier ↗",()=>{
   if(port.openWrestler)port.openWrestler(view!.personId!);
   else{pane="PROFILE";render();}
  });
  details.classList.add("ppw-backstage-phone-details");
  details.setAttribute("aria-label","View "+view.personName+" wrestler dossier");
  chatHead.append(returnToInbox,monogram,identity,details);
  chat.append(chatHead);
  const info=el("details","ppw-backstage-phone-info");
  info.append(el("summary","","Conversation options"),
   el("p","",
    "You can suggest a character change, but the wrestler owns their identity and can refuse. Only the replies you send can influence what happens next."));
  if(archiveButton)info.append(archiveButton);
  chat.append(info);
  const selectedPersonId=view.personId;
  const wrestler=view.roster.find(p=>p.personId===selectedPersonId);
  // Only durable incoming correspondence appears as a wrestler bubble.
  // Store conversations as immutable World facts; UI renders only the last
  // 30 selected messages and never generates messages on opening a thread.
  for(const item of view.conversations){
   const stamp="Y"+(Math.floor(item.createdWeekIndex/52)+1)+
    " · W"+(item.createdWeekIndex%52+1);
   chat.append(el("small","ppw-backstage-date",stamp),
    el("div","ppw-persona-bubble ppw-persona-in",backstageMessage(item.kind,{observedMatchShows:item.observedMatchShows,
     averageCrowd:item.averageCrowd,
     partnerName:view.roster.find(x=>x.personId===item.relatedPersonId)?.name,
     verifiedSinglesShows:item.verifiedSinglesShows,
     professionalTrust:item.professionalTrust,
     verifiedTagShows:item.verifiedTagShows,
     averageExecution:item.averageExecution,
     workingVerifiedShows:item.workingVerifiedShows,
     workingTrustDelta:item.workingTrustDelta})));
   if(item.followThroughWeekIndex!==null)
    chat.append(el("small","ppw-backstage-promise",
     (item.followThroughKind==="RIVALRY_PROGRAMME_STARTED"?
       "Rivalry programme started":
       item.followThroughKind==="MEDIATION_MATCH_COMPLETED"?
       "Partnership back on track":
       item.followThroughKind==="CONTRACT_NEGOTIATION_STARTED"?
       "Actual contract negotiation opened":"Promise delivered")+" · Y"+(Math.floor(item.followThroughWeekIndex/52)+1)+
     " W"+(item.followThroughWeekIndex%52+1)));
   if(item.kind==="ROLE_USAGE"&&item.promisedRole)
    chat.append(el("small","ppw-backstage-promise",
     (item.promisedRole==="MAIN_EVENT"?"Main event":"Upper card")+
     " · "+item.observedMatchShows+" matches together; "+
     item.observedFeaturedShows+" featured"));
   if(item.decision){
    chat.append(el("div","ppw-persona-bubble ppw-persona-out",
     backstageManagerReply(item.decision)));
    if(item.respondedWeekIndex!==null)
     chat.append(el("small","ppw-backstage-sent-stamp","Sent · Y"+
      (Math.floor(item.respondedWeekIndex/52)+1)+" W"+
      (item.respondedWeekIndex%52+1)));
    chat.append(el("div","ppw-persona-bubble ppw-persona-in",
     backstageReply(item.decision,item.status)));
    if(item.kind==="PARTNERSHIP"&&item.decision==="MEDIATE"&&
     item.followThroughWeekIndex===null)
     chat.append(el("small","ppw-backstage-promise",
      "Words will only go so far. Book a strong tag-team performance together to help repair the damage."));
    if(item.kind==="RIVALRY_PITCH"&&item.decision==="EXPLORE_RIVALRY"&&
     item.followThroughWeekIndex===null&&onOpenProgrammes){
     chat.append(button("Build this rivalry →",
      onOpenProgrammes,loading));
    }
    if(item.status==="BROKEN"&&item.trustDelta<0)
     chat.append(el("small","ppw-backstage-promise",
      "Broken promise · promotion trust "+item.trustDelta));
    if(item.status==="EXCUSED")
     chat.append(el("small","ppw-backstage-promise",
      "No penalty · "+item.assessmentReason?.replaceAll("_"," ").toLowerCase()));
    if(item.status==="PROMISED"&&item.dueWeekIndex!==null){
     const remaining=item.dueWeekIndex-((view.worldYear-1)*52+view.worldWeek-1);
     chat.append(el("small","ppw-backstage-promise",
      (item.decision==="PROMISE_SEGMENT"?"Promo/angle":
       item.decision==="PROMISE_FEATURED"?"Featured match":"Match")+
      " promised · "+Math.max(0,remaining)+" weeks remaining"));
    }
   }else if(item.status==="NOTED"){
    chat.append(el("small","ppw-muted",
     "Locker-room update · no reply needed"));
   }else if(item.status==="EXCUSED"){
    chat.append(el("div","ppw-persona-bubble ppw-persona-in",
     "This conversation has closed because the wrestler is no longer available under this contract."));
   }else if(view.canEdit&&wrestler?.isCurrent!==false){
    const actions=el("div","ppw-backstage-replies ppw-backstage-composer");
    actions.append(el("span","ppw-backstage-composer-caption","CHOOSE A REPLY"));
    for(const decision of BACKSTAGE_CHOICES[item.kind]){
     actions.append(button(BACKSTAGE_LABELS[decision],()=>{
      void decide(item.conversationId,decision);},loading));
    }
    chat.append(actions);
   }else{
    chat.append(el("p","ppw-muted",wrestler?.isCurrent===false?
     "Read-only conversation: this wrestler is no longer under contract.":
     "Reply when the next booking window opens."));
   }
  }
  for(const p of [...view.recentRequests].reverse()){
   const out=el("div","ppw-persona-bubble ppw-persona-out",
    "How about a "+p.requested_gimmick_id.replaceAll("_"," ")+
    " character?");
   const response=el("div","ppw-persona-bubble ppw-persona-in",
    p.status==="ACCEPTED"?"Yes — I'll make it mine.":
    p.reason==="ICONIC_PERSONA_PROTECTED"?
     "This character is my legacy. I'm not walking away from it.":
    p.reason==="CREATIVE_APPROVAL_WITHHELD"?
     "My creative approval matters. I won't agree to that change.":
     "I'd rather keep the character that I've built.");
   chat.append(out,response);
  }
  if(answer){const reply=el("div","ppw-persona-bubble ppw-persona-in",answer);
   reply.setAttribute("role","status");chat.append(reply);}
  const now=(view.worldYear-1)*52+view.worldWeek-1;
  const cooldown=view.nextPitchWeek>now;
  if(cooldown)chat.append(el("p","ppw-muted",
   "Reconsideration available in "+(view.nextPitchWeek-now)+" weeks."));
  if(view.canEdit&&!cooldown&&persona){
   chat.append(el("h3","","Pitch a new character"),
    el("p","ppw-muted","These are creative archetypes, not simple face/heel switches. Your wrestler can accept or reject the pitch, and retains ownership of their identity."));
   const filter=document.createElement("input");
   filter.type="search";filter.placeholder="Search gimmicks or families";
   filter.value=search;filter.setAttribute("aria-label","Search gimmick archetypes");
   const options=el("div","ppw-persona-options");
   const availableArchetypes=view.archetypes;
   const refreshOptions=()=>{
    options.replaceChildren();
    // Surface the catalogue's variety on first opening; the initial
    // classic Hero/Villain entries must not hide the deeper wrestling ideas.
    const eligible=availableArchetypes.filter(x=>x.id!==persona.gimmickId&&(
     !search||[x.label,x.familyLabel,x.description].some(y=>
      y.toLowerCase().includes(search.trim().toLowerCase()))));
    const familyFirst=eligible.filter(x=>x.familyLabel!=="Classic Wrestling");
    const perFamily=new Set<string>();
    const featured=familyFirst.filter(x=>{
     if(perFamily.has(x.familyLabel))return false;
     perFamily.add(x.familyLabel);return true;
    });
    const matches=(search?eligible:[...featured,...familyFirst.filter(x=>!featured.includes(x)),
     ...eligible.filter(x=>x.familyLabel==="Classic Wrestling")]).slice(0,24);
    for(const p of matches){
     const item=button("",()=>{chosen=p.id;render();},loading);
     item.classList.add("ppw-gimmick-choice");
     item.append(el("strong","",p.label),el("small","",p.familyLabel),
      el("span","",p.description));
     if(chosen===p.id)item.classList.add("ppw-persona-selected");
     item.title=p.description;options.append(item);
    }
    if(!matches.length)options.append(el("p","ppw-muted","No matching gimmicks."));
   };
   // Keep the actual input node mounted while searching. Replacing the page
   // on every keystroke dismisses the keyboard in iPhone standalone PWAs.
   filter.oninput=()=>{search=filter.value;refreshOptions();};
   chat.append(filter);
   refreshOptions();chat.append(options);
   if(chosen)chat.append(el("p","ppw-muted",
    "Selected · "+availableArchetypes.find(x=>x.id===chosen)?.label));
   chat.append(button(loading?"Asking wrestler…":"Suggest gimmick",()=>{
    void request();},loading||!chosen));
  }
  root.append(chat);
  requestAnimationFrame(()=>{
   if(root.contains(chat))chat.scrollTop=previousScroll??chat.scrollHeight;
  });
 }
 void load(initialPersonId);
 return {refresh:()=>load(personId)};
}
