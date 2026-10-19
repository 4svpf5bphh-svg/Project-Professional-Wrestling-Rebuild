import {mountPlanner,type PlannerPort} from "../ui/show-planner.js";
import {mountWorldHome,type WorldHomePort} from "../ui/world-home.js";
import "../ui/world-home.css";
import {mountWorldCalendar,type CalendarPort} from "../ui/world-calendar.js";
import "../ui/world-calendar.css";
import "../ui/show-planner.css";
import {mountCardEditor,type CardEditorPort} from "../ui/card-editor.js";
import {createCardClient,type CardSessionScope} from "./card-client.js";
import {plannerCardHash,hostSectionHash,type HostSection,type ContractFocus,
 type HomeAttentionFocus} from "./host-navigation.js";
import {mountShowResults} from "../ui/show-results.js";
import {mountResultsArchive} from "../ui/results-archive.js";
import {mountProgrammeDesk,type ProgrammeDeskPort} from "../ui/programme-desk.js";
import {mountStableDesk,type StableDeskPort} from "../ui/stable-desk.js";
import {mountChampionshipDesk,type ChampionshipPort} from "../ui/championship-desk.js";
import {mountTagTeamDesk,type TagTeamPort} from "../ui/tag-team-desk.js";
import {mountContractDesk,type ContractDeskPort} from "../ui/contract-desk.js";
import {mountRosterMarket,type RosterMarketPort} from "../ui/roster-market.js";
import {mountBusinessDesk,type BusinessPort} from "../ui/business-desk.js";
import {mountStaffDesk,type StaffPort} from "../ui/staff-desk.js";
import {mountIndustryWorldHub,type IndustryHubPort} from "../ui/industry-world-hub.js";
import "../ui/industry-world-hub.css";
import "../ui/staff-desk.css";
import "../ui/business-desk.css";
import type {DirectoryFilter,DirectoryView} from "../db/wrestler-directory.js";
import "../ui/roster-market.css";
import "../ui/wrestler-card.css";
import {mountWrestlerProfile,type WrestlerProfilePort} from "../ui/wrestler-profile.js";
import "../ui/wrestler-profile.css";
import {mountWorkingConnections,type WorkingConnectionsPort} from "../ui/working-connections.js";
import {mountPersonaDesk,type PersonaDeskPort} from "../ui/persona-desk.js";
import "../ui/persona-desk.css";
import "../ui/working-connections.css";
import "../ui/stable-desk.css";
import "../ui/championship-desk.css";
import "../ui/tag-team-desk.css";
import "../ui/contract-desk.css";
import "../ui/programme-desk.css";
import "../ui/show-results.css";
import "../ui/results-archive.css";
import "../ui/card-editor.css";
type Scope=CardSessionScope;
/** One permanent iPhone-first entrance to every completed workspace.
 * Navigating does not advance simulation or create a new World.
 */
export function mountWorldHomePage(root:HTMLElement,scope:Scope,
 onNavigate?:(section:HostSection,focus?:HomeAttentionFocus,personId?:string)=>void){
 const call=createCardClient(scope);
 const go=(section:HostSection,fallback:()=>void)=>onNavigate?
  ()=>onNavigate(section):fallback;
 const port:WorldHomePort={
  load:()=>call("overview"),
  dismissAttention:attentionId=>call("dismissAttention",{attentionId}),
  dismissAttentionBatch:attentionIds=>call("dismissAttentionBatch",{attentionIds}),
  openWrestler:personId=>openWrestlerDossier(root,scope,call,personId),
  planner:go("planner",()=>mountPlannerPage(root,scope,()=>mountWorldHomePage(root,scope))),
  openUnfinishedCard:onNavigate?()=>onNavigate("planner","CARD"):
   ()=>mountPlannerPage(root,scope,()=>mountWorldHomePage(root,scope),true),
  roster:go("roster",()=>mountRosterMarket(root,rosterMarketPort(root,scope,call),"ROSTER")),
  market:go("market",()=>mountRosterMarket(root,rosterMarketPort(root,scope,call),"MARKET")),
  contracts:go("contracts",()=>mountContractDesk(root,contractPort(call,root,scope),
   ()=>mountWorldHomePage(root,scope))),
  contractsExpiring:onNavigate?()=>onNavigate("contracts","EXPIRING"):
   ()=>mountContractDesk(root,contractPort(call,root,scope),
    ()=>mountWorldHomePage(root,scope),"EXPIRING"),
  contractsPending:onNavigate?()=>onNavigate("contracts","PENDING"):
   ()=>mountContractDesk(root,contractPort(call,root,scope),
    ()=>mountWorldHomePage(root,scope),"PENDING"),
  backstage:go("backstage",()=>mountPersonaDesk(root,personaPort(call,root,scope),
   ()=>mountWorldHomePage(root,scope),
   ()=>mountProgrammePage(root,scope))),
  openUnreadBackstage:onNavigate?()=>onNavigate("backstage","UNREAD"):
   ()=>mountPersonaDesk(root,personaPort(call,root,scope),
    ()=>mountWorldHomePage(root,scope),()=>mountProgrammePage(root,scope),"UNREAD"),
  openBackstageThread:(personId,unread)=>onNavigate?
   onNavigate("backstage",unread?"UNREAD":undefined,personId):
   mountPersonaDesk(root,personaPort(call,root,scope),
    ()=>mountWorldHomePage(root,scope),()=>mountProgrammePage(root,scope),
    unread?"UNREAD":"ALL",personId),
  results:go("results",()=>{void mountResultsArchivePage(root,scope,
   ()=>mountWorldHomePage(root,scope));}),
  business:go("business",()=>mountBusinessDesk(root,businessPort(root,scope,call))),
  staff:go("staff",()=>mountStaffDesk(root,staffPort(root,scope,call))),
  industry:go("industry",()=>mountIndustryWorldHub(root,industryPort(root,scope,call))),
  calendar:go("calendar",()=>mountCalendarPage(root,scope,()=>mountWorldHomePage(root,scope))),
  championships:go("championships",()=>{void mountChampionshipsPage(root,scope,
   ()=>mountWorldHomePage(root,scope));})
 };
 return mountWorldHome(root,port);
}
/** Browser fetch bridge. Auth is via host's secure same-origin session cookie. */
export function mountBookingPage(root:HTMLElement,scope:Scope){
 const call=createCardClient(scope);
 function openProgrammeDesk(){
  const openResults=(showId:string)=>{
   void mountResultsPage(root,{...scope,showId},()=>{openProgrammeDesk();});
  };
  return mountProgrammeDesk(root,programmePort(call,root,scope,openResults,
   ()=>{void mountResultsArchivePage(root,scope,()=>{openProgrammeDesk();});}),
   ()=>{mountCardEditor(root,port);});
 }
 const port:CardEditorPort={
  load:()=>call("load"),
  talent:(search,cursor)=>call("talent",{search,cursor}),
  stableChoices:()=>call("stableChoices"),
  save:({requestId,expectedRevision,matches,segments,runningOrder})=>
   call("save",{requestId,expectedRevision,matches,segments,runningOrder}),
  confirmReady:({requestId,expectedRevision})=>
   call("ready",{requestId,expectedRevision}),
  requestCreativeConsent:({requestId,expectedRevision,slotId,personId})=>
   call("creativeConsent",{requestId,expectedRevision,slotId,personId}),
  openPlanner:()=>{
   // A reminder can enter directly at #/planner/card. Leaving that
   // one-time action must clear the focus route or a later reload would
   // unexpectedly jump back into the same card.
   if(typeof window!=="undefined"&&window.location.hash===plannerCardHash){
    window.location.hash=hostSectionHash("planner");
    return;
   }
   mountPlannerPage(root,scope,()=>mountCardEditor(root,port));
  },
  openProgrammes:()=>{openProgrammeDesk();},
  openChampionships:()=>{void mountChampionshipsPage(root,scope,()=>mountCardEditor(root,port));},
  openTagTeams:()=>mountTagTeamDesk(root,tagTeamPort(call,root,scope),()=>mountCardEditor(root,port)),
  openContracts:()=>mountContractDesk(root,contractPort(call,root,scope),()=>mountCardEditor(root,port)),
  openRoster:()=>mountRosterMarket(root,rosterMarketPort(root,scope,call),"ROSTER"),
  openMarket:()=>mountRosterMarket(root,rosterMarketPort(root,scope,call),"MARKET"),
  openBusiness:()=>mountBusinessDesk(root,businessPort(root,scope,call)),
  openStaff:()=>mountStaffDesk(root,staffPort(root,scope,call)),
  openIndustry:()=>mountIndustryWorldHub(root,industryPort(root,scope,call)),
  openStables:()=>mountStableDesk(root,stablePort(call,root,scope),
   ()=>mountCardEditor(root,port)),
  openWorkingConnections:()=>mountWorkingConnections(root,workingPort(call,root,scope),
   ()=>mountCardEditor(root,port)),
  openPersona:()=>mountPersonaDesk(root,personaPort(call,root,scope),
   ()=>mountCardEditor(root,port),()=>openProgrammeDesk()),
  openProfile:(personId,holder,onClose)=>mountWrestlerProfile(holder,
   wrestlerProfilePort(call,holder,scope,onClose),personId,onClose),
 };
 return mountCardEditor(root,port);
}

/** Public World title records; each reign page is a separate, bounded read. */
export async function mountChampionshipsPage(root:HTMLElement,scope:Scope,onBack?:()=>void){
 const call=createCardClient(scope);
 const port:ChampionshipPort={
  loadDirectory:()=>call("championships"),
  loadHistory:(titlePromotionId,championshipId,cursor)=>
   call("championshipHistory",{titlePromotionId,championshipId,cursor}),
  openWrestler:(id:string)=>{
   const back=()=>void mountChampionshipsPage(root,scope,onBack);
   return mountWrestlerProfile(root,wrestlerProfilePort(call,root,scope,back),id,back);
  }
 };
 return mountChampionshipDesk(root,port,onBack);
}

function contractPort(call:ReturnType<typeof createCardClient>,
 root:HTMLElement,scope:Scope):ContractDeskPort{
 return {load:()=>call("contracts"),
  requestDates:({requestId,expectedRevision,contractId,additionalDates,additionalPayment})=>
   call("requestContractDates",{requestId,expectedRevision,contractId,additionalDates,additionalPayment}),
  cancelDates:({requestId,expectedRevision,dateRequestId})=>
   call("cancelContractDates",{requestId,expectedRevision,dateRequestId}),
  renewal:({requestId,expectedRevision,contractId})=>
   call("renewContract",{requestId,expectedRevision,contractId}),
  negotiatedRenewal:({requestId,expectedRevision,personId,sourceContractId,terms})=>
   call("submitContractOffer",{requestId,expectedRevision,personId,sourceContractId,terms}),
  withdrawRenewal:({requestId,expectedRevision,proposalId})=>
   call("withdrawContractRenewal",{requestId,expectedRevision,proposalId}),
  withdrawOffer:({requestId,expectedRevision,offerId})=>
   call("withdrawContractOffer",{requestId,expectedRevision,offerId}),
  openWrestler:personId=>openWrestlerDossier(root,scope,call,personId)};
}
function industryPort(root:HTMLElement,scope:Scope,
 call:ReturnType<typeof createCardClient>):IndustryHubPort{
 return {
  load:()=>call("industry"),
  featured:targetPromotionId=>call("industryFeatured",{targetPromotionId}),
  openWrestler:personId=>openWrestlerDossier(root,scope,call,personId),
  openBusiness:()=>mountBusinessDesk(root,businessPort(root,scope,call)),
  openPlanner:()=>mountPlannerPage(root,scope,
   ()=>mountIndustryWorldHub(root,industryPort(root,scope,call))),
  openOwnResults:showId=>{void mountResultsPage(root,{...scope,showId},
   ()=>mountIndustryWorldHub(root,industryPort(root,scope,call)),"industry");},
  back:scope.showId?()=>mountBookingPage(root,scope):
   ()=>mountWorldHomePage(root,scope)
 };
}
export function mountIndustryPage(root:HTMLElement,scope:Scope){
 const call=createCardClient(scope);
 return mountIndustryWorldHub(root,industryPort(root,scope,call));
}
function staffPort(root:HTMLElement,scope:Scope,
 call:ReturnType<typeof createCardClient>):StaffPort{
 return {load:()=>call("staff"),
  save:input=>call("setStaffContinuity",input),
  hire:input=>call("hireTalentManager",input),
  release:input=>call("releaseTalentManager",input),
  back:scope.showId?()=>mountBookingPage(root,scope):
   ()=>mountWorldHomePage(root,scope)
 };
}
export function mountStaffPage(root:HTMLElement,scope:Scope){
 const call=createCardClient(scope);
 return mountStaffDesk(root,staffPort(root,scope,call));
}
function businessPort(root:HTMLElement,scope:Scope,
 call:ReturnType<typeof createCardClient>):BusinessPort{
 return {
  load:()=>call("business"),
  openResults:showId=>{void mountResultsPage(root,{...scope,showId},
    ()=>mountBusinessDesk(root,businessPort(root,scope,call)),"business");},
  openRoster:()=>mountRosterMarket(root,rosterMarketPort(root,scope,call),"ROSTER"),
  openContracts:()=>mountContractDesk(root,contractPort(call,root,scope),
   ()=>mountBusinessDesk(root,businessPort(root,scope,call))),
  back:scope.showId?()=>mountBookingPage(root,scope):
   ()=>mountWorldHomePage(root,scope)
 };
}
export function mountBusinessPage(root:HTMLElement,scope:Scope){
 const call=createCardClient(scope);
 return mountBusinessDesk(root,businessPort(root,scope,call));
}
function wrestlerProfilePort(call:ReturnType<typeof createCardClient>,
 root:HTMLElement,scope:Scope,onBack:()=>void):WrestlerProfilePort{
 return {
  load:personId=>call("wrestlerProfile",{personId}),
  career:personId=>call("wrestlerCareer",{personId}),
  save:({personId,requestId,expectedRevision,primaryStyle,secondaryStyle,
   signatureMoves,finishingMoves})=>call("saveWrestlerRepertoire",{
    personId,requestId,expectedRevision,primaryStyle,secondaryStyle,
    signatureMoves,finishingMoves}),
  openBackstage:personId=>mountPersonaDesk(root,{
   ...personaPort(call,root,scope),load:(selected?:string)=>call("backstage",
    {personId:selected??personId})},onBack,()=>mountProgrammePage(root,scope)),
  openContracts:()=>mountContractDesk(root,contractPort(call,root,scope),onBack)
 };
}
function rosterMarketPort(root:HTMLElement,scope:Scope,
 call:ReturnType<typeof createCardClient>):RosterMarketPort{
 const open=(mode:DirectoryView)=>mountRosterMarket(root,
  rosterMarketPort(root,scope,call),mode);
 return {
  load:(filter:DirectoryFilter)=>call("wrestlerDirectory",{filter}),
  offer:({personId,requestId,expectedRevision,terms})=>
   call("submitContractOffer",{personId,requestId,expectedRevision,terms}),
  openContracts:()=>mountContractDesk(root,contractPort(call,root,scope),
   ()=>open("ROSTER")),
  openTagTeams:()=>mountTagTeamDesk(root,tagTeamPort(call,root,scope),
   ()=>open("ROSTER")),
  openStables:()=>mountStableDesk(root,stablePort(call,root,scope),
   ()=>open("ROSTER")),
  backToBooking:scope.showId?()=>mountBookingPage(root,scope):undefined,
  backToHome:()=>mountWorldHomePage(root,scope),
  openBusiness:()=>mountBusinessDesk(root,businessPort(root,scope,call)),
  openStaff:()=>mountStaffDesk(root,staffPort(root,scope,call)),
  openIndustry:()=>mountIndustryWorldHub(root,industryPort(root,scope,call)),
  // A dossier opens over the current directory. Filtering, current page
  // and expanded cards survive, with no second directory read on return.
  openWrestler:(personId:string)=>openWrestlerDossier(root,scope,call,personId)
 };
}
/** Independent roster and recruitment routes. The hosting app can mount them
 * directly, while the card editor provides discoverable navigation.
 */
export function mountRosterPage(root:HTMLElement,scope:Scope){
 const call=createCardClient(scope);
 return mountRosterMarket(root,rosterMarketPort(root,scope,call),"ROSTER");
}
export function mountTalentMarketPage(root:HTMLElement,scope:Scope){
 const call=createCardClient(scope);
 return mountRosterMarket(root,rosterMarketPort(root,scope,call),"MARKET");
}
/** Contracts are promotion-private and require a real verified session. */
export function mountContractsPage(root:HTMLElement,scope:Scope,
 focus:ContractFocus="ATTENTION"){
 const call=createCardClient(scope);
 return mountContractDesk(root,contractPort(call,root,scope),undefined,focus);
}

function tagTeamPort(call:ReturnType<typeof createCardClient>,
 root:HTMLElement,scope:Scope):TagTeamPort{
 return {load:()=>call("tagTeams"),
  create:({requestId,expectedRevision,name,personIds})=>
   call("createTagTeam",{requestId,expectedRevision,name,personIds}),
  rename:({requestId,expectedRevision,name,teamId})=>
   call("renameTagTeam",{requestId,expectedRevision,name,teamId}),
  openWrestler:personId=>openWrestlerDossier(root,scope,call,personId)};
}
/** Independent tag-team roster route, without a current booking draft. */
export function mountTagTeamsPage(root:HTMLElement,scope:Scope){
 return mountTagTeamDesk(root,tagTeamPort(createCardClient(scope),root,scope));
}

/** A history route independent of particular rivalries or show cards. */
export async function mountResultsArchivePage(root:HTMLElement,scope:Scope,onBack?:()=>void){
 const call=createCardClient(scope);
 return mountResultsArchive(root,{
  load:(cursor)=>call("resultsArchive",cursor?{cursor}:{}),
  open:(showId)=>{void mountResultsPage(root,{...scope,showId},
   ()=>{void mountResultsArchivePage(root,scope,onBack);},"results archive");},
  back:onBack,
 });
}

/** Host may open the resolved-show broadcast without any write capability. */
export async function mountResultsPage(root:HTMLElement,scope:Scope,onBack?:()=>void,
 backLabel="programmes"){
 await mountShowResults(root,{load:async()=>createCardClient(scope)("results")});
 if(onBack){
  const back=document.createElement("button");
  back.type="button";back.textContent="← Back to "+backLabel;
  back.className="ppw-programme-action";back.onclick=onBack;
  root.prepend(back);
 }
 const archive=document.createElement("button");
 archive.type="button";archive.textContent="View all results";
 archive.className="ppw-programme-action";
 archive.onclick=()=>{void mountResultsArchivePage(root,scope,onBack);};
 root.prepend(archive);
}

/** A modal dossier preserves the working card, negotiation or rivalry underneath.
 * Its two reads (profile + opt-in career) never run on list render.
 */
function openWrestlerDossier(root:HTMLElement,scope:Scope,
 call:ReturnType<typeof createCardClient>,personId:string):void{
 const previouslyFocused=document.activeElement instanceof HTMLElement?
  document.activeElement:null;
 const overlay=document.createElement("div");
 overlay.className="ppw-profile-overlay";
 overlay.setAttribute("role","dialog");
 overlay.setAttribute("aria-modal","true");
 overlay.setAttribute("aria-label","Wrestler dossier");
 overlay.tabIndex=-1;
 const close=()=>{
  overlay.remove();
  if(previouslyFocused?.isConnected)previouslyFocused.focus();
 };
 overlay.addEventListener("keydown",event=>{
  if(event.key==="Escape"){event.preventDefault();event.stopPropagation();close();}
 });
 root.append(overlay);
 mountWrestlerProfile(overlay,wrestlerProfilePort(call,overlay,scope,close),
  personId,close);
 overlay.focus();
}

function programmePort(call:ReturnType<typeof createCardClient>,
 root:HTMLElement,scope:Scope,
 openResults?:(showId:string)=>void,openArchive?:()=>void):ProgrammeDeskPort{
 return {
  load:()=>call("programmes"),openResults,openArchive,
  openPlanner:()=>mountPlannerPage(root,scope,()=>mountProgrammePage(root,scope)),
  openWrestler:personId=>openWrestlerDossier(root,scope,call,personId),
  start:({requestId,expectedRevision,sideA,sideB,championshipId})=>
   call("startProgramme",{requestId,expectedRevision,sideA,sideB,championshipId}),
  end:({requestId,expectedRevision,programmeId})=>
   call("endProgramme",{requestId,expectedRevision,programmeId}),

  standingConsent:({requestId,expectedRevision,programmeId,
   personId,matchType,permittedOutcome,termWeeks})=>
   call("standingProgrammeConsent",{requestId,expectedRevision,programmeId,
    personId,matchType,permittedOutcome,termWeeks}),
  chooseDirection:({requestId,expectedRevision,programmeId,showId,slotId,choice})=>
   call("chooseProgrammeDirection",{requestId,expectedRevision,
    programmeId,sourceShowId:showId,sourceSlotId:slotId,choice}),
 };
}
export function mountProgrammePage(root:HTMLElement,scope:Scope){
 const call=createCardClient(scope);
 const showResult=(showId:string)=>{void mountResultsPage(root,{...scope,showId},
  ()=>mountProgrammePage(root,scope));};
 return mountProgrammeDesk(root,programmePort(call,root,scope,showResult,
  ()=>{void mountResultsArchivePage(root,scope,()=>mountProgrammePage(root,scope));}));
}

function stablePort(call:ReturnType<typeof createCardClient>,
 root:HTMLElement,scope:Scope):StableDeskPort{
 return {
  load:()=>call("stables"),
  create:({requestId,expectedRevision,name,personIds})=>
   call("createStable",{requestId,expectedRevision,name,personIds}),
  add:({requestId,expectedRevision,stableId,personId})=>
   call("addStableMember",{requestId,expectedRevision,stableId,personId}),
  remove:({requestId,expectedRevision,stableId,personId})=>
   call("removeStableMember",{requestId,expectedRevision,stableId,personId}),
  disband:({requestId,expectedRevision,stableId})=>
   call("disbandStable",{requestId,expectedRevision,stableId}),
  openWrestler:personId=>openWrestlerDossier(root,scope,call,personId),
 };
}
/** Routed stable roster component for the eventual Roster > Stables tab. */
export function mountStablesPage(root:HTMLElement,scope:Scope){
 return mountStableDesk(root,stablePort(createCardClient(scope),root,scope));
}

function workingPort(call:ReturnType<typeof createCardClient>,
 root:HTMLElement,scope:Scope):WorkingConnectionsPort{
 return {load:(personId)=>call("workingConnections",
  personId?{personId}:{}),
  openWrestler:personId=>openWrestlerDossier(root,scope,call,personId)};
}
/** The Roster > Singles / Working Connections page, without draft writes. */
export function mountWorkingConnectionsPage(root:HTMLElement,scope:Scope){
 return mountWorkingConnections(root,workingPort(createCardClient(scope),root,scope));
}

function personaPort(call:ReturnType<typeof createCardClient>,
 root:HTMLElement,scope:Scope):PersonaDeskPort{
 return {
  load:personId=>call("backstage",personId?{personId}:{inboxOnly:true}),
  markRead:personId=>call("markBackstageRead",{personId}),
  archiveThread:(personId,archived)=>call("backstageArchive",{personId,archived}),
  decide:({conversationId,decision,requestId,expectedRevision})=>
   call("backstageDecision",{conversationId,decision,requestId,expectedRevision}),
  request:({personId,gimmickId,requestId,expectedRevision})=>
   call("requestPersona",{personId,gimmickId,requestId,expectedRevision}),
  openWrestler:personId=>openWrestlerDossier(root,scope,call,personId),
 };
}
/** Direct wrestler-directory route; display never edits a booked card. */
export function mountPersonaPage(root:HTMLElement,scope:Scope,
 filter:"ALL"|"UNREAD"="ALL",initialPersonId?:string){
 return mountPersonaDesk(root,personaPort(createCardClient(scope),root,scope),
  undefined,()=>mountProgrammePage(root,scope),filter,initialPersonId);
}

/** Host-level planner entry point. The existing card editor remains the
 * authoritative booking surface, with the selected draft's ID in scope.
 */
export function mountPlannerPage(root:HTMLElement,scope:Scope,onBack?:()=>void,
 openUnfinishedCard=false){
 const call=createCardClient(scope);
 const port:PlannerPort={
  load:()=>call("planner"),
  save:input=>call("planShow",input),
  openCard:draftId=>mountBookingPage(root,{...scope,showId:draftId}),
  openCalendar:()=>mountCalendarPage(root,scope,()=>mountPlannerPage(root,scope,onBack))
 };
 return mountPlanner(root,port,onBack,openUnfinishedCard);
}

/** Show identity recurrence editor; no private rival draft plans are exposed. */
export function mountCalendarPage(root:HTMLElement,scope:Scope,onBack?:()=>void){
 const call=createCardClient(scope);
 const port:CalendarPort={
  load:()=>call("calendar"),
  save:input=>call("saveCalendar",input),
  archive:input=>call("archiveCalendar",input)
 };
 return mountWorldCalendar(root,port,onBack??(()=>mountPlannerPage(root,scope)));
}
