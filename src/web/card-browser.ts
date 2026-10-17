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
  openProgrammes:()=>mountProgrammeDesk(root,
   programmePort(call,showId=>{void mountResultsPage(root,{...scope,showId},
    ()=>mountProgrammeDesk(root,programmePort(call,showId=>
     {void mountResultsPage(root,{...scope,showId},()=>mountBookingPage(root,scope));}),
     ()=>mountBookingPage(root,scope)));}),
   ()=>{mountCardEditor(root,port);}),
 };
 return mountCardEditor(root,port);
}

/** Host may open the resolved-show broadcast without any write capability. */
export async function mountResultsPage(root:HTMLElement,scope:Scope,onBack?:()=>void){
 await mountShowResults(root,{load:async()=>createCardClient(scope)("results")});
 if(onBack){
  const back=document.createElement("button");
  back.type="button";back.textContent="← Back to programmes";
  back.className="ppw-programme-action";back.onclick=onBack;
  root.prepend(back);
 }
}

function programmePort(call:ReturnType<typeof createCardClient>,
 openResults?:(showId:string)=>void):ProgrammeDeskPort{
 return {
  load:()=>call("programmes"),openResults,
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
 return mountProgrammeDesk(root,programmePort(call,showResult));
}
