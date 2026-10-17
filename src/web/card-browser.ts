import {mountCardEditor,type CardEditorPort} from "../ui/card-editor.js";
import {createCardClient,type CardSessionScope} from "./card-client.js";
import {mountShowResults} from "../ui/show-results.js";
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
 };
 return mountCardEditor(root,port);
}

/** Host may open the resolved-show broadcast without any write capability. */
export function mountResultsPage(root:HTMLElement,scope:Scope){
 return mountShowResults(root,{load:async()=>{
  return createCardClient(scope)("results");
 }});
}
