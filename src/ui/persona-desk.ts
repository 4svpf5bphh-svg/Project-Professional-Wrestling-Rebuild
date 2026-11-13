/** The wrestler owns their character. Edits are proposals, not overrides.
 * Compact phone-like conversation shows the actual wrestler's response.
 */
import type {readPortablePersonaWorkspace}
 from "../db/portable-persona-workspace.js";
type View=Awaited<ReturnType<typeof readPortablePersonaWorkspace>>;
import {describeWrestlerRivalryMemory} from "../domain/verified-wrestler-rivalry-memory.js";
import {livingWrestlerMotivation} from "../domain/living-character-motivation.js";
import {describeBookingCommitment} from "../domain/backstage-booking-commitment.js";
import {BACKSTAGE_CHOICES,BACKSTAGE_LABELS,backstageManagerReply,backstageMessage,backstageReply,
 type BackstageDecision} from "../domain/backstage-conversations.js";
import type {WorldMail,WorldMailAction} from "../db/backstage-world-mail.js";
export interface PersonaDeskPort{
 load(personId?:string):Promise<View>;
 markRead(personId:string):Promise<{readCount:number}>;
 markWorldRead?(mailId:string):Promise<{readCount:number}>;
 respondNetwork?(input:{mailId:string;decision:"COMMIT_RECOVERY"|"COMMIT_STANDARDS"|"STAND_FIRM";
  requestId:string;expectedRevision:number}):Promise<{status:string;revision:number;
  result?:{mailId:string;decision:"COMMIT_RECOVERY"|"COMMIT_STANDARDS"|"STAND_FIRM";
   status:"PENDING"|"ACKNOWLEDGED";dueWeekIndex:number}}>;
 respondStaff?(input:{mailId:string;decision:"COMMIT"|"DEFER";
  requestId:string;expectedRevision:number}):Promise<{status:string;revision:number;
  result?:{mailId:string;decision:"COMMIT"|"DEFER";
   status:"PENDING"|"ACKNOWLEDGED";dueWeekIndex:number}}>;
 openDepartment?(action:WorldMailAction):void;
 archiveThread(personId:string,archived:boolean):Promise<unknown>;
 decide(input:{conversationId:string;decision:BackstageDecision;
  requestId:string;expectedRevision:number}):Promise<unknown>;
 request(input:{personId:string;gimmickId:string;
  requestId:string;expectedRevision:number}):Promise<unknown>;
 openWrestler?(personId:string):void;
 openPlanner?():void;
}
const el=(tag:string,cls="",label="")=>{
 const n=document.createElement(tag);n.className=cls;n.textContent=label;return n;
};
const button=(title:string,action:()=>void,disabled=false)=>{
 const x=el("button","ppw-persona-button",title) as HTMLButtonElement;
 x.type="button";x.onclick=action;x.disabled=disabled;return x;
};
export function mountPersonaDesk(root:HTMLElement,
 port:PersonaDeskPort,onBack?:()=>void,
 onOpenProgrammes?:(personId:string,opponentId:string)=>void,
 initialInboxFilter:"ALL"|"UNREAD"="ALL",initialPersonId?:string){
 // Keep the company inbox in memory while the manager opens a wrestler thread.
 let inboxWorldMessages:WorldMail[]|null=null;
 let inboxWorldRevision:number|null=null;
 let view:View|null=null,loading=false,error="",chosen:string|null=null,
 search="",answer:string|null=null,personId:string|undefined;
 let pane:"INBOX"|"THREAD"|"PROFILE"|"WORLD_THREAD"=initialPersonId?"THREAD":"INBOX";
 let selectedWorldMailId:string|null=null;
 let pendingNetwork:{mailId:string;decision:"COMMIT_RECOVERY"|"COMMIT_STANDARDS"|"STAND_FIRM";
  requestId:string;expectedRevision:number}|null=null;
 let pendingStaff:{mailId:string;decision:"COMMIT"|"DEFER";
  requestId:string;expectedRevision:number}|null=null;
 let inboxFilter:"ALL"|"UNREAD"|"ACTIVE"|"HISTORY"|"ARCHIVED"|
  "STAFF"|"NETWORK"|"SCOUT"|"FREE_AGENT"|"WRESTLERS"=initialInboxFilter;
 let inboxSearch="";
 let lastInboxScroll=0;
 let scrollToLatest=false;
 let pendingDecision:{conversationId:string;decision:BackstageDecision;revision:number;requestId:string}|null=null;
 let pendingPitch:{personId:string;gimmickId:string;revision:number;requestId:string}|null=null;
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
  pane="INBOX";
  // Direct wrestler deep links return without fetching the whole company.
  // Network/staff/scout channels can be opened explicitly below.
  render();
  requestAnimationFrame(()=>{
   const inbox=root.querySelector<HTMLElement>(".ppw-backstage-contacts");
   if(inbox)inbox.scrollTop=lastInboxScroll;
  });
 };
 function withInboxWorldMessages(next:View,id?:string):View{
  if(!id){
   inboxWorldMessages=next.worldMessages??[];
   inboxWorldRevision=next.worldRevision;
   return next;
  }
  if(inboxWorldRevision!==next.worldRevision){
   inboxWorldMessages=null;inboxWorldRevision=null;return next;
  }
  return inboxWorldMessages!==null?
   {...next,worldMessages:inboxWorldMessages}:next;
 }
 async function load(id?:string){
  personId=id;loading=true;render();
  if(pendingDecision&&id!==view?.personId)pendingDecision=null;
  if(pendingPitch&&id!==view?.personId)pendingPitch=null;
  try{
   view=withInboxWorldMessages(await port.load(id),id);
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
  if(!pendingDecision||pendingDecision.conversationId!==conversationId||
   pendingDecision.decision!==decision||pendingDecision.revision!==revision)
   pendingDecision={conversationId,decision,revision,requestId:crypto.randomUUID()};
  const requestId=pendingDecision.requestId;
  loading=true;error="";answer=null;render();
  try{
   const response=await port.decide({conversationId,decision,requestId,
    expectedRevision:revision}) as {status?:string};
   if(response?.status==="STALE"){pendingDecision=null;
    throw Error("The World changed. Refresh the conversation before replying.");
   }
   if(response?.status!=="APPLIED"&&response?.status!=="REPLAYED")
    throw Error("Reply not confirmed. Retrying will reuse your original message.");
   view=withInboxWorldMessages(await port.load(selected),selected);
   pendingDecision=null;scrollToLatest=true;answer=null;
  }catch(e){
   const reason=e instanceof Error?e.message:"Unable to send reply";
   error=(pendingDecision?"Your reply was not confirmed. Retrying sends the same message. ":"")+reason;
  }
  finally{loading=false;render();}
 }
 async function request(){
  if(loading||!view?.personId||!chosen||view.worldRevision===null)return;
  const name=view.personId,gimmick=chosen,revision=view.worldRevision;
  if(!pendingPitch||pendingPitch.personId!==name||pendingPitch.gimmickId!==gimmick||
   pendingPitch.revision!==revision)
   pendingPitch={personId:name,gimmickId:gimmick,revision,requestId:crypto.randomUUID()};
  loading=true;error="";answer=null;render();
  try{
   const outcome=await port.request({personId:name,gimmickId:gimmick,
    requestId:pendingPitch.requestId,expectedRevision:revision}) as {
     status?:string;result?:{accepted:boolean;reason:string}};
   if(outcome?.status==="STALE"){pendingPitch=null;
    throw Error("The World changed. Refresh the character before pitching again.");
   }
   if((outcome?.status!=="APPLIED"&&outcome?.status!=="REPLAYED")||!outcome.result)
    throw Error("Pitch not confirmed. Retry without changing your choice.");
   const result=outcome.result;
   view=withInboxWorldMessages(await port.load(name),name);chosen=null;pendingPitch=null;scrollToLatest=true;
   answer=result.accepted?
    "Agreed. This is my character now — you'll see it wherever I work.":
    result.reason==="ICONIC_PERSONA_PROTECTED"?
     "That identity means too much to me. I'm keeping it.":
    result.reason==="CREATIVE_APPROVAL_WITHHELD"?
     "You need my approval for that, and I'm not giving it.":
     "I hear the pitch, but I'm staying with the character I've built.";
  }catch(e){
   const reason=e instanceof Error?e.message:"Proposal could not be reviewed";
   error=(pendingPitch?"Character pitch not confirmed. Retrying sends the same proposal. ":"")+reason;
  }
  finally{loading=false;render();}
 }
 async function openWorldMail(mailId:string){
  if(!view)return;
  const item=view.worldMessages?.find(x=>x.id===mailId);
  if(!item)return;
  selectedWorldMailId=mailId;pane="WORLD_THREAD";error="";render();
  if(item.read||!port.markWorldRead)return;
  try{
   await port.markWorldRead(mailId);
   if(inboxWorldMessages)inboxWorldMessages=inboxWorldMessages.map(x=>
    x.id===mailId?{...x,read:true}:x);
   if(view){view={...view,worldMessages:(view.worldMessages??[]).map(x=>
    x.id===mailId?{...x,read:true}:x)};
    if(pane==="WORLD_THREAD"&&selectedWorldMailId===mailId)render();}
  }catch(e){error=e instanceof Error?e.message:"Could not mark message read";render();}
 }
 async function answerNetwork(mailId:string,decision:"COMMIT_RECOVERY"|"COMMIT_STANDARDS"|"STAND_FIRM"){
  if(!view||loading||!port.respondNetwork||view.worldRevision===null)return;
  const same=pendingNetwork?.mailId===mailId&&pendingNetwork.decision===decision;
  const request=same?pendingNetwork!:{mailId,decision,
   requestId:crypto.randomUUID(),expectedRevision:view.worldRevision};
  pendingNetwork=request;loading=true;render();
  try{
   const result=await port.respondNetwork(request);
   if(result.status!=="APPLIED"&&result.status!=="REPLAYED")
    throw new Error("The World has changed. Refresh before replying.");
   const receipt=result.result;
   if(!receipt||receipt.mailId!==request.mailId||
    receipt.decision!==request.decision||
    !["PENDING","ACKNOWLEDGED"].includes(receipt.status)||
    !Number.isSafeInteger(receipt.dueWeekIndex))
    throw new Error("Broadcaster response could not be verified. Retry your reply.");
   // Use the authenticated command receipt, not a new five-read company
   // inbox fetch. The same exact response survives a retried request.
   const update=(messages:WorldMail[]|undefined)=>(messages??[]).map(mail=>
    mail.id===receipt.mailId?{...mail,canRespond:false,
     networkResponse:{decision:receipt.decision,status:receipt.status,
      dueWeekIndex:receipt.dueWeekIndex}}:mail);
   view={...view,worldRevision:result.revision,worldMessages:update(view.worldMessages)};
   if(inboxWorldMessages!==null)inboxWorldMessages=update(inboxWorldMessages);
   inboxWorldRevision=result.revision;
   pendingNetwork=null;error="";
  }catch(e){error=e instanceof Error?e.message:"Broadcaster reply not saved";}
  finally{loading=false;render();}
 }
 async function answerStaff(mailId:string,decision:"COMMIT"|"DEFER"){
  if(!view||loading||!port.respondStaff||view.worldRevision===null)return;
  const same=pendingStaff?.mailId===mailId&&pendingStaff.decision===decision;
  const request=same?pendingStaff!:{mailId,decision,
   requestId:crypto.randomUUID(),expectedRevision:view.worldRevision};
  pendingStaff=request;loading=true;render();
  try{
   const applied=await port.respondStaff(request);
   if(applied.status!=="APPLIED"&&applied.status!=="REPLAYED")
    throw new Error("The World has changed. Refresh the conversation before replying.");
   const receipt=applied.result;
   if(!receipt||receipt.mailId!==mailId||receipt.decision!==decision||
    !["PENDING","ACKNOWLEDGED"].includes(receipt.status)||
    !Number.isSafeInteger(receipt.dueWeekIndex))
    throw Error("Staff reply not confirmed. Retrying uses your original answer.");
   const updated=(messages:WorldMail[]|undefined)=>(messages??[]).map(m=>
    m.id===receipt.mailId?{...m,canStaffRespond:false,
     staffResponse:{decision:receipt.decision,status:receipt.status,
      dueWeekIndex:receipt.dueWeekIndex}}:m);
   view={...view,worldRevision:applied.revision,
    worldMessages:updated(view.worldMessages)};
   if(inboxWorldMessages!==null)inboxWorldMessages=updated(inboxWorldMessages);
   inboxWorldRevision=applied.revision;
   pendingStaff=null;error="";
  }catch(e){error=e instanceof Error?e.message:"Staff reply not confirmed";}
  finally{loading=false;render();}
 }
 let preservedThreadScroll:number|null=null,preservedThreadPerson:string|null=null;
 function render(){
  const previous=root.querySelector<HTMLElement>(".ppw-persona-chat");
  const previousDocumentScroll=window.scrollY;
  if(previous){preservedThreadScroll=previous.scrollTop;
   preservedThreadPerson=previous.dataset.personId??null;}
  root.classList.add("ppw-editor","ppw-persona-desk","ppw-messenger");
  root.classList.remove("ppw-messenger-inbox","ppw-messenger-thread",
   "ppw-messenger-profile","ppw-messenger-world_thread");
  root.classList.add("ppw-messenger-"+pane.toLowerCase());
  root.replaceChildren();
  const head=el("header","ppw-persona-header");
  const exit=pane==="PROFILE"?returnToMessages:onBack;
   if(exit){
    const control=button(pane==="PROFILE"?"‹ Chats":"‹ Control room",exit);
    control.classList.add("ppw-backstage-exit");
    control.setAttribute("aria-label",pane==="PROFILE"?"Back to messages":"Leave Backstage");
    head.append(control);
   }
  if(pane==="INBOX")head.append(el("h1","","Messages"));
  else head.append(el("span","ppw-eyebrow","CONTACTS"),
   el("h1","","Contact details"),
   el("p","ppw-muted","Private career conversations and character history."));
  if(pane!=="THREAD"&&pane!=="WORLD_THREAD")root.append(head);
  else if(onBack){
   // From a dossier, leave the conversation without relying on a hidden
   // header or the thread's Chats button.
   const exitBar=el("nav","ppw-backstage-thread-exit");
   const leave=button("‹ Leave Backstage",onBack);
   leave.classList.add("ppw-backstage-exit");
   exitBar.append(leave);root.append(exitBar);
  }
  if(error)root.append(el("p","ppw-alert ppw-error",error));
  if(!view){root.append(button(loading?"Loading…":"Retry",()=>void load(personId),loading));return;}
  const tabs=el("nav","ppw-backstage-tabs");
  tabs.setAttribute("aria-label","Backstage messages and contacts");
  for(const [id,label] of [["INBOX","Chats"],["PROFILE","People"]] as const){
   const tab=button(label,()=>{pane=id;render();});
   if(pane===id)tab.classList.add("ppw-persona-selected");
   tabs.append(tab);
  }
  if(pane!=="THREAD"&&pane!=="WORLD_THREAD")root.append(tabs);
  if(pane==="WORLD_THREAD"){
   const mail=view.worldMessages?.find(x=>x.id===selectedWorldMailId);
   if(!mail){pane="INBOX";render();return;}
   const chat=el("section","ppw-persona-chat ppw-backstage-world-thread");
   chat.setAttribute("aria-label","Message from "+mail.sender);
   const header=el("header","ppw-backstage-phone-header");
   const back=button("← Messages",returnToMessages);
   back.classList.add("ppw-backstage-phone-back");
   const avatar=el("span","ppw-backstage-phone-avatar",
    mail.kind==="NETWORK"?"TV":mail.kind==="SCOUT"?"SC":
    mail.kind==="FREE_AGENT"?"FA":"ST");
   const identity=el("span","ppw-backstage-phone-identity");
   identity.append(el("strong","",mail.sender),
    el("small","",mail.kind==="NETWORK"?"Broadcast partner":
     mail.kind==="SCOUT"?"Talent scouting":
     mail.kind==="FREE_AGENT"?"Free agent":"Staff Office"));
   header.append(back,avatar,identity);chat.append(header);
   chat.append(el("small","ppw-backstage-date","YEAR "+
    (Math.floor(mail.createdWeekIndex/52)+1)+" · WEEK "+
    (mail.createdWeekIndex%52+1)));
   const message=el("article","ppw-persona-bubble ppw-persona-in ppw-backstage-world-body");
   message.append(el("strong","",mail.subject),el("p","",mail.body));
   chat.append(message);
   chat.append(el("p","ppw-backstage-world-evidence",
    mail.contentConcern?"From a completed television match with a verified hardcore stipulation.":
    mail.kind==="NETWORK"?"From a certified, completed broadcast review.":
     mail.kind==="SCOUT"?"The prospect is currently uncontracted; talks are not guaranteed.":
     mail.kind==="FREE_AGENT"?"No contract or appearance has been agreed.":
     "Based on your actual roster, contracts or active programmes."));
   const actionNames:Record<WorldMailAction,string>={
    COMMERCIALS:"Review broadcaster →",CONTRACTS:"Review contracts →",
    PROGRAMMES:"Plan a creative response →",STAFF:"Open Staff Office →",
    MARKET:"View talent market →"};
   if(mail.kind==="NETWORK"&&mail.networkResponse){
    const answer=mail.networkResponse;
    chat.append(el("article","ppw-persona-bubble ppw-persona-out",
     answer.decision==="COMMIT_RECOVERY"?
      "We'll work to meet the agreed TV target. Judge our next broadcasts.":
     answer.decision==="COMMIT_STANDARDS"?
      "We hear you. We'll keep hardcore stipulations off our next TV broadcasts.":
      "We stand by our creative direction. We understand the signed terms."));
    chat.append(el("p","ppw-backstage-world-evidence",
     answer.status==="PENDING"?
      "Your promise will be measured against certified TV over the next three weeks.":
     answer.status==="KEPT"?
      answer.decision==="COMMIT_STANDARDS"?
       "Your next certified TV show honoured the agreed content standard.":
       "Your next on-target TV broadcast kept the promise.":
     answer.status==="BROKEN"?
      answer.decision==="COMMIT_STANDARDS"?
       "The review window ended without a compliant TV show. The promise was broken.":
       "The review window ended without an on-target broadcast. The promise was broken.":
     answer.status==="EXCUSED"?"The signed term ended before the deadline; the promise was excused.":
     "Your reply is recorded. The agreed network terms remain in force."));
   }
   if(mail.kind==="STAFF"&&mail.staffResponse){
    const reply=mail.staffResponse;
    const isMedical=mail.action==="STAFF";
    chat.append(el("article","ppw-persona-bubble ppw-persona-out",
     reply.decision==="DEFER"?
      "Thanks for raising this. I'm not committing to a change just yet.":
     isMedical?"I'll manage the workload and reduce the fatigue concerns.":
      "I'll freshen up these rivalries. Check our creative progress."));
    chat.append(el("p","ppw-backstage-world-evidence",
     reply.status==="PENDING"?"We'll review the actual roster or storyline situation over the next three weeks.":
     reply.status==="KEPT"?"The genuine staff concern was resolved. Staff morale improved.":
     reply.status==="BROKEN"?"The review window ended with the problem unresolved. Staff morale fell.":
     reply.status==="EXCUSED"?"The staff appointment ended before the review deadline.":
     "Your reply was received. No new workload or storyline change was made."));
   }
   const actions=el("div","ppw-backstage-world-actions");
   if(mail.kind==="STAFF"&&mail.canStaffRespond&&!mail.staffResponse&&port.respondStaff){
    actions.append(button(mail.action==="STAFF"?
     "I'll rest the tired roster":"I'll refresh the rivalries",
     ()=>void answerStaff(mail.id,"COMMIT"),loading));
    actions.append(button("Not now",()=>void answerStaff(mail.id,"DEFER"),loading));
   }
   if(mail.kind==="NETWORK"&&mail.canRespond&&!mail.networkResponse&&port.respondNetwork){
    actions.append(mail.contentConcern?
     button("Keep hardcore off our next TV show",
      ()=>void answerNetwork(mail.id,"COMMIT_STANDARDS"),loading):
     button("Promise to improve ratings",
      ()=>void answerNetwork(mail.id,"COMMIT_RECOVERY"),loading));
    actions.append(button("Stand by our show",()=>void answerNetwork(mail.id,"STAND_FIRM"),loading));
   }
   if(mail.targetPersonId&&port.openWrestler)
    actions.append(button("View wrestler dossier",()=>port.openWrestler!(mail.targetPersonId!),loading));
   actions.append(button(actionNames[mail.action],()=>port.openDepartment?.(mail.action),
    loading||!port.openDepartment));
   actions.append(button("Back to messages",returnToMessages));
   chat.append(actions);root.append(chat);return;
  }
  if(pane==="INBOX"){
   const inbox=el("section","ppw-backstage-inbox");
   const threadCount=view.roster.filter(w=>!!w.latestIncoming||!!w.lastMessage).length+
    (view.worldMessages?.length??0);
   const unreadCount=view.roster.filter(w=>w.isCurrent&&w.latestIncoming&&
    w.latestIncoming.read_week_index===null&&!w.latestIncoming.archived).length+
    (view.worldMessages??[]).filter(x=>!x.read).length;
   const topline=el("div","ppw-messenger-inbox-topline");
   topline.append(el("span","ppw-messenger-inbox-label","MY CONVERSATIONS"),
    el("span","ppw-messenger-inbox-count",
     threadCount+" chats"+(unreadCount?" · "+unreadCount+" unread":"")));
   inbox.append(topline);
   const controls=el("div","ppw-backstage-filters");
   for(const [filter,label] of [["ALL","All"],["UNREAD","Unread"],
    ["ACTIVE","Requests"],["WRESTLERS","Wrestlers"],["STAFF","Staff"],
    ["NETWORK","Networks"],["SCOUT","Scouting"],
    ["FREE_AGENT","Free agents"],["HISTORY","History"],["ARCHIVED","Archived"]] as const){
    const b=button(label,()=>{
     inboxFilter=filter;
     if(inboxWorldMessages===null&&["STAFF","NETWORK","SCOUT","FREE_AGENT"].includes(filter)){
      void load();return;
     }
     render();
    });
    if(filter===inboxFilter)b.classList.add("ppw-persona-selected");
    controls.append(b);
   }
   inbox.append(controls);
   if(inboxWorldMessages===null)inbox.append(button("Load company messages",
    ()=>void load()));
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
   for(const mail of [...(view.worldMessages??[])].filter(item=>
    inboxFilter==="ALL"||inboxFilter===item.kind||
    (inboxFilter==="UNREAD"&&!item.read)||
    (inboxFilter==="ACTIVE"&&!item.read))){
    const item=button("",()=>void openWorldMail(mail.id));
    item.classList.add("ppw-backstage-contact","ppw-backstage-world-contact");
    if(!mail.read)item.classList.add("ppw-backstage-unread");
    const avatar=el("span","ppw-backstage-avatar",
     mail.kind==="NETWORK"?"TV":mail.kind==="SCOUT"?"SC":
     mail.kind==="FREE_AGENT"?"FA":"ST");
    const copy=el("span","ppw-backstage-contact-copy");
    const top=el("span","ppw-backstage-contact-top");
    top.append(el("strong","",mail.sender),el("small","ppw-backstage-contact-stamp",
     "W"+(mail.createdWeekIndex%52+1)));
    copy.append(top,el("span","ppw-backstage-contact-preview",mail.subject));
    item.append(avatar,copy);
    if(!mail.read)item.append(el("span","ppw-backstage-unread-dot",""));
    entries.append(item);count++;
   }
   for(const wrestler of [...view.roster].filter(w=>{
    if(["STAFF","NETWORK","SCOUT","FREE_AGENT"].includes(inboxFilter))return false;
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
      backstageMessage(incoming.kind as keyof typeof BACKSTAGE_CHOICES,
       {careerStage:incoming.career_stage_at_request as
         "PROSPECT"|"PRIME"|"VETERAN"|"SPECIAL_ATTRACTION"|null,
        createdWeekIndex:incoming.created_week_index},
       incoming.request_id):null;
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
  if(pane==="PROFILE"){
  const now=(view.worldYear-1)*52+view.worldWeek-1;
  const cooldown=view.nextPitchWeek>now;
  if(cooldown)root.append(el("p","ppw-muted",
   "Reconsideration available in "+(view.nextPitchWeek-now)+" weeks."));
  if(view.canEdit&&!cooldown&&persona){
   root.append(el("h3","","Pitch a new character"),
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
     item.setAttribute("aria-pressed",String(chosen===p.id));
     item.title=p.description;options.append(item);
    }
    if(!matches.length)options.append(el("p","ppw-muted","No matching gimmicks."));
   };
   // Keep the actual input node mounted while searching. Replacing the page
   // on every keystroke dismisses the keyboard in iPhone standalone PWAs.
   filter.oninput=()=>{search=filter.value;refreshOptions();};
   root.append(filter);
   const pitch=el("div","ppw-gimmick-pitch-controls");
   pitch.append(el("span","ppw-gimmick-pick-name",
    chosen?"Pitch: "+(availableArchetypes.find(x=>x.id===chosen)?.label??"Selected"):
     "Choose a character below"));
   const send=button(loading?"Asking wrestler…":"Suggest gimmick →",()=>{
    void request();},loading||!chosen);
   send.classList.add("ppw-gimmick-submit");pitch.append(send);
   root.append(pitch);
   refreshOptions();root.append(options);
  }
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
  returnToInbox.setAttribute("aria-label","Back to messages");
  const monogram=el("span","ppw-backstage-phone-avatar",
   view.personName.trim().split(/\s+/).slice(0,2).map(part=>part[0]??"").join("").toUpperCase());
  monogram.setAttribute("aria-hidden","true");
  monogram.style.setProperty("--messenger-hue",String([...view.personId].reduce(
   (n,ch)=>(n*31+ch.charCodeAt(0))%360,0)));
  const identity=el("span","ppw-backstage-phone-identity");
  identity.append(el("strong","",view.personName),el("small","","Private conversation"));
  const details=button("Dossier",()=>{
   if(port.openWrestler)port.openWrestler(view!.personId!);
   else{pane="PROFILE";render();}
  });
  details.classList.add("ppw-backstage-phone-details");
  details.setAttribute("aria-label","View "+view.personName+" wrestler dossier");
  chatHead.append(returnToInbox,monogram,identity,details);
  chat.append(chatHead);
  const currentContact=view.roster.find(x=>x.personId===view!.personId);
  const motivation=livingWrestlerMotivation({
   onRoster:currentContact?.isCurrent!==false&&!!currentContact,
   status:currentContact?.status??null,
   careerStage:currentContact?.careerStage??null,
   momentum:currentContact?.momentum,morale:currentContact?.morale,
   fatigue:currentContact?.fatigue,
   currentWeekIndex:(view.worldYear-1)*52+view.worldWeek-1,
   memories:(view.memories??[]).map(m=>({kind:m.kind,weekIndex:m.weekIndex})),
   requests:view.conversations.map(c=>{
    const related=view!.roster.find(x=>x.personId===c.relatedPersonId&&x.isCurrent);
    return {kind:c.kind,status:c.status,
     createdWeekIndex:c.createdWeekIndex,decision:c.decision,
     respondedWeekIndex:c.respondedWeekIndex,
     followThroughWeekIndex:c.followThroughWeekIndex,
     dueWeekIndex:c.dueWeekIndex,relevantTitle:c.relevantTitle,
     relatedName:related?.name??null,
     verifiedShows:c.kind==="TAG_TEAM_PITCH"||
      c.kind==="MENTORSHIP_PITCH"?c.verifiedTagShows:
      c.kind==="RIVALRY_PITCH"?c.verifiedSinglesShows:
       c.workingVerifiedShows};
   })
  });
  if(motivation){
   const drive=el("aside","ppw-backstage-current-drive");
   drive.setAttribute("aria-label","Current wrestler motivation");
   drive.dataset.motivation=motivation.kind;
   drive.append(el("small","","CURRENT DIRECTION"),
    el("strong","",motivation.title),
    el("span","",motivation.reason));
   chat.append(drive);
  }
  const wrestlerMemories=view.memories??[];
  if(wrestlerMemories.length){
   const remembered=el("details","ppw-backstage-phone-info ppw-backstage-memories");
   remembered.append(el("summary","","What they remember"));
   const descriptions:Record<string,string>={
    PROMISE_MADE:"You gave your word about a booking",
    PROMISE_KEPT:"You followed through on a booking promise",
    PROMISE_BROKEN:"A promised booking never happened",
    PROMISE_EXCUSED:"A promised booking became impossible",
    REQUEST_DECLINED:"Their request was turned down",
    REQUEST_HEARD:"You had a conversation about their concern",
    CONTRACT_FOLLOW_THROUGH:"Real contract talks followed your conversation",
    CREATIVE_FOLLOW_THROUGH:"A creative idea led to an actual show decision",
    MEDICAL_ABSENCE:"They were injured in an actual match",
    TITLE_WON:"They won a championship match",
    TITLE_CHALLENGE:"They had a championship opportunity",
    TITLE_DEFENDED:"They successfully defended a championship",
    CHARACTER_APPROVED:"A character change was approved",
    CHARACTER_DECLINED:"A proposed character change was rejected"
   };
   for(const m of wrestlerMemories){
    const rivalry=(m.kind==="RIVALRY_MATCH"||m.kind==="RIVALRY_ANGLE")&&
     m.relatedName&&m.ownSide?
     describeWrestlerRivalryMemory({kind:m.kind,relatedName:m.relatedName,
      ownSide:m.ownSide,winnerSide:m.winnerSide,weekIndex:m.weekIndex}):null;
    remembered.append(el("p","ppw-backstage-memory",
     (rivalry??descriptions[m.kind]??"A remembered career event")+
     " · Y"+(Math.floor(m.weekIndex/52)+1)+" W"+(m.weekIndex%52+1)));
   }
   chat.append(remembered);
  }
  const info=el("details","ppw-backstage-phone-info");
  info.append(el("summary","","Conversation options"),
   el("p","",
    "Private conversations and promises stay here. Character changes belong in their character profile."));
  if(archiveButton)info.append(archiveButton);
  if(persona&&view.roster.find(x=>x.personId===view?.personId)?.isCurrent!==false)
   info.append(button("Character & gimmick →",()=>{pane="PROFILE";render();}));
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
     workingTrustDelta:item.workingTrustDelta,
     observedAbsentWeeks:item.observedAbsentWeeks,
     observedLosses:item.observedLosses,
     relevantTitle:item.relevantTitle,
     careerStage:item.careerStageAtRequest as
      "PROSPECT"|"PRIME"|"VETERAN"|"SPECIAL_ATTRACTION"|null,
     createdWeekIndex:item.createdWeekIndex},item.conversationId)));
   if(item.followThroughWeekIndex!==null)
    chat.append(el("small","ppw-backstage-promise",
     (item.followThroughKind==="RIVALRY_PROGRAMME_STARTED"?
       "Rivalry programme started":
       item.followThroughKind==="MEDIATION_MATCH_COMPLETED"?
       "Partnership back on track":
       item.followThroughKind==="MENTORSHIP_MATCH_COMPLETED"?
       "Mentoring match completed":
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
     backstageManagerReply(item.decision,item.kind)));
    if(item.respondedWeekIndex!==null)
     chat.append(el("small","ppw-backstage-sent-stamp","Sent · Y"+
      (Math.floor(item.respondedWeekIndex/52)+1)+" W"+
      (item.respondedWeekIndex%52+1)));
    chat.append(el("div","ppw-persona-bubble ppw-persona-in",
     backstageReply(item.decision,item.status,item.kind)));
    if(item.kind==="PARTNERSHIP"&&item.decision==="MEDIATE"&&
     item.followThroughWeekIndex===null)
     chat.append(el("small","ppw-backstage-promise",
      "Words will only go so far. Book a strong tag-team performance together to help repair the damage."));
    if(item.kind==="MENTORSHIP_PITCH"&&
     item.decision==="EXPLORE_MENTORSHIP"&&
     item.followThroughWeekIndex===null&&port.openPlanner){
     // Navigate to real planner; booking and results remain player-authored.
     chat.append(button("Plan their next match →",
      ()=>port.openPlanner?.(),loading));
    }
    if(item.kind==="RIVALRY_PITCH"&&item.decision==="EXPLORE_RIVALRY"&&
     item.followThroughWeekIndex===null&&onOpenProgrammes&&view.personId){
     const opponent=view.roster.find(p=>
      p.personId===item.relatedPersonId&&p.isCurrent);
     if(opponent){
      chat.append(button("Build rivalry with "+opponent.name+" →",
       ()=>onOpenProgrammes(view!.personId!,opponent.personId),loading));
     }else{
      chat.append(el("small","ppw-backstage-promise",
       "The proposed opponent is no longer on your active roster."));
     }
    }
    const chapter=describeBookingCommitment(item,
     (view.worldYear-1)*52+view.worldWeek-1);
    if(chapter){
     const report=el("div","ppw-backstage-chapter");
     report.dataset.commitmentStage=chapter.stage;
     report.append(el("strong","",chapter.headline),
      el("span","",chapter.detail));
     if(chapter.canReviewBooking&&view.canEdit&&port.openPlanner){
      report.append(button("Review booking →",()=>port.openPlanner?.(),loading));
     }
     chat.append(report);
    }
    // A title ambition is a recorded request, not a title-shot guarantee.
    if(item.kind==="TITLE_AMBITION"&&item.decision==="TALK"){
     const path=el("div","ppw-backstage-chapter");
     path.append(el("strong","","Championship goal heard"),
      el("span","","No title opportunity has been booked by this conversation."));
     if(view.canEdit&&port.openPlanner)
      path.append(button("Plan their next opportunity →",
       ()=>port.openPlanner?.(),loading));
     chat.append(path);
    }
   }else if(item.status==="NOTED"){
    chat.append(el("small","ppw-muted",
     "Locker-room update · no reply needed"));
   }else if(item.status==="EXCUSED"){
    chat.append(el("div","ppw-persona-bubble ppw-persona-in",
     "This conversation has closed because the wrestler is no longer available under this contract."));
   }else if(view.canEdit&&wrestler?.isCurrent!==false){
    const actions=el("div","ppw-backstage-replies ppw-backstage-composer");
    actions.append(el("span","ppw-backstage-composer-caption","YOUR REPLY · TAP A MESSAGE TO SEND"));
    for(const decision of BACKSTAGE_CHOICES[item.kind]){
     const reply=button("",()=>void decide(item.conversationId,decision),loading);
     reply.classList.add("ppw-backstage-reply-choice");
     reply.append(el("small","ppw-backstage-reply-intent",BACKSTAGE_LABELS[decision]),
      el("span","ppw-backstage-reply-statement",backstageManagerReply(decision,item.kind)));
     reply.setAttribute("aria-label",backstageManagerReply(decision,item.kind));
     actions.append(reply);
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
  root.append(chat);
  requestAnimationFrame(()=>{
   if(!root.contains(chat))return;
   // iPhone: the document owns the only vertical scroll. The old nested flex
   // scroller could trap touch gestures before later messages were reachable.
   // Keep the independent pane for larger screens.
   if(getComputedStyle(chat).overflowY==="visible"){
    if(scrollToLatest)chat.lastElementChild?.scrollIntoView({block:"end"});
    else if(previousScroll!==null)window.scrollTo(0,previousDocumentScroll);
   }else chat.scrollTop=scrollToLatest?chat.scrollHeight:
    previousScroll??chat.scrollHeight;
   scrollToLatest=false;
  });
 }
 void load(initialPersonId);
 return {refresh:()=>load(personId)};
}
