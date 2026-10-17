import {mountCardEditor,type CardEditorPort} from "../ui/card-editor.js";
import {createCardClient,type CardSessionScope} from "./card-client.js";
import {mountShowResults} from "../ui/show-results.js";
import {mountProgrammeDesk,type ProgrammeDeskPort} from "../ui/programme-desk.js";
import "../ui/programme-desk.css";
import "../ui/show-results.css";
import "../ui/card-editor.css";
type Scope=CardSessionScope;
/** Browser fetch bridge. Auth is via host's secure same-origin session cookie. */
export function mountBookingPage(root:HTMLElement,scope:Scope){
 const call=createCardClient(scope);
 const port:CardEditorPort={
  load:()=>call("load"),
  talent:(search,cursor)=>call("talent",{search,cursor}),
  save:({requestId,expectedRevision,matches,segments,runningOrder})=>
   call("save",{requestId,expectedRevision,matches,segments,runningOrder}),
  confirmReady:({requestId,expectedRevision})=>
   call("ready",{requestId,expectedRevision}),
  openProgrammes:()=>mountProgrammeDesk(root,programmePort(call),
   ()=>{mountCardEditor(root,port);}),
 };
 return mountCardEditor(root,port);
}

/** Host may open the resolved-show broadcast without any write capability. */
export function mountResultsPage(root:HTMLElement,scope:Scope){
 return mountShowResults(root,{load:async()=>{
  return createCardClient(scope)("results");
 }});
}

function programmePort(call:ReturnType<typeof createCardClient>):ProgrammeDeskPort{
 return {
  load:()=>call("programmes"),
  start:({requestId,expectedRevision,sideA,sideB,championshipId})=>
   call("startProgramme",{requestId,expectedRevision,sideA,sideB,championshipId}),
  end:({requestId,expectedRevision,programmeId})=>
   call("endProgramme",{requestId,expectedRevision,programmeId}),
 };
}
export function mountProgrammePage(root:HTMLElement,scope:Scope){
 const call=createCardClient(scope);
 return mountProgrammeDesk(root,programmePort(call));
}
