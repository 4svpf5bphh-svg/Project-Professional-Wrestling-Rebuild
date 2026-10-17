import {mountCardEditor,type CardEditorPort} from "../ui/card-editor.js";
import {createCardClient,type CardSessionScope} from "./card-client.js";
import {mountShowResults} from "../ui/show-results.js";
import {mountResultsArchive} from "../ui/results-archive.js";
import {mountProgrammeDesk,type ProgrammeDeskPort} from "../ui/programme-desk.js";
import {mountStableDesk,type StableDeskPort} from "../ui/stable-desk.js";
import {mountChampionshipDesk,type ChampionshipPort} from "../ui/championship-desk.js";
import {mountWorkingConnections,type WorkingConnectionsPort} from "../ui/working-connections.js";
import {mountPersonaDesk,type PersonaDeskPort} from "../ui/persona-desk.js";
import "../ui/persona-desk.css";
import "../ui/working-connections.css";
import "../ui/stable-desk.css";
import "../ui/championship-desk.css";
import "../ui/programme-desk.css";
import "../ui/show-results.css";
import "../ui/results-archive.css";
import "../ui/card-editor.css";
type Scope=CardSessionScope;
/** Browser fetch bridge. Auth is via host's secure same-origin session cookie. */
export function mountBookingPage(root:HTMLElement,scope:Scope){
 const call=createCardClient(scope);
 function openProgrammeDesk(){
  const openResults=(showId:string)=>{
   void mountResultsPage(root,{...scope,showId},()=>{openProgrammeDesk();});
  };
  return mountProgrammeDesk(root,programmePort(call,openResults,
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
  openProgrammes:()=>{openProgrammeDesk();},
  openChampionships:()=>{void mountChampionshipsPage(root,scope,()=>mountCardEditor(root,port));},
  openStables:()=>mountStableDesk(root,stablePort(call),
   ()=>mountCardEditor(root,port)),
  openWorkingConnections:()=>mountWorkingConnections(root,workingPort(call),
   ()=>mountCardEditor(root,port)),
  openPersona:()=>mountPersonaDesk(root,personaPort(call),
   ()=>mountCardEditor(root,port),()=>openProgrammeDesk()),
 };
 return mountCardEditor(root,port);
}

/** Public World title records; each reign page is a separate, bounded read. */
export async function mountChampionshipsPage(root:HTMLElement,scope:Scope,onBack?:()=>void){
 const call=createCardClient(scope);
 const port:ChampionshipPort={
  loadDirectory:()=>call("championships"),
  loadHistory:(titlePromotionId,championshipId,cursor)=>
   call("championshipHistory",{titlePromotionId,championshipId,cursor})
 };
 return mountChampionshipDesk(root,port,onBack);
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

function programmePort(call:ReturnType<typeof createCardClient>,
 openResults?:(showId:string)=>void,openArchive?:()=>void):ProgrammeDeskPort{
 return {
  load:()=>call("programmes"),openResults,openArchive,
  start:({requestId,expectedRevision,sideA,sideB,championshipId})=>
   call("startProgramme",{requestId,expectedRevision,sideA,sideB,championshipId}),
  end:({requestId,expectedRevision,programmeId})=>
   call("endProgramme",{requestId,expectedRevision,programmeId}),
 };
}
export function mountProgrammePage(root:HTMLElement,scope:Scope){
 const call=createCardClient(scope);
 const showResult=(showId:string)=>{void mountResultsPage(root,{...scope,showId},
  ()=>mountProgrammePage(root,scope));};
 return mountProgrammeDesk(root,programmePort(call,showResult,
  ()=>{void mountResultsArchivePage(root,scope,()=>mountProgrammePage(root,scope));}));
}

function stablePort(call:ReturnType<typeof createCardClient>):StableDeskPort{
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
 };
}
/** Routed stable roster component for the eventual Roster > Stables tab. */
export function mountStablesPage(root:HTMLElement,scope:Scope){
 return mountStableDesk(root,stablePort(createCardClient(scope)));
}

function workingPort(call:ReturnType<typeof createCardClient>):WorkingConnectionsPort{
 return {load:(personId)=>call("workingConnections",
  personId?{personId}:{})};
}
/** The Roster > Singles / Working Connections page, without draft writes. */
export function mountWorkingConnectionsPage(root:HTMLElement,scope:Scope){
 return mountWorkingConnections(root,workingPort(createCardClient(scope)));
}

function personaPort(call:ReturnType<typeof createCardClient>):PersonaDeskPort{
 return {
  load:personId=>call("backstage",personId?{personId}:{}),
  markRead:personId=>call("markBackstageRead",{personId}),
  archiveThread:(personId,archived)=>call("backstageArchive",{personId,archived}),
  decide:({conversationId,decision,requestId,expectedRevision})=>
   call("backstageDecision",{conversationId,decision,requestId,expectedRevision}),
  request:({personId,gimmickId,requestId,expectedRevision})=>
   call("requestPersona",{personId,gimmickId,requestId,expectedRevision}),
 };
}
/** Direct wrestler-directory route; display never edits a booked card. */
export function mountPersonaPage(root:HTMLElement,scope:Scope){
 return mountPersonaDesk(root,personaPort(createCardClient(scope)),
  undefined,()=>mountProgrammePage(root,scope));
}
