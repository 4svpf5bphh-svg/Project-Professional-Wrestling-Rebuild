import {mountCardEditor,type CardEditorPort} from "../ui/card-editor.js";
import "../ui/card-editor.css";
type Scope={worldId:string;promotionId:string;showId:string};
/** Browser fetch bridge. Auth is via host's secure same-origin session cookie. */
export function mountBookingPage(root:HTMLElement,scope:Scope){
 const call=async(method:string,extra:Record<string,unknown>={})=>{
  const response=await fetch("/api/card",{
   method:"POST",credentials:"same-origin",
   headers:{"content-type":"application/json","x-ppw-action":"card"},
   body:JSON.stringify({...scope,...extra,method})});
  if(!response.ok)throw new Error(response.status===409?
   "The World changed. Reload and review your card.":
   response.status===401?"Please sign in again":"Booking request failed");
  return response.json();
 };
 const port:CardEditorPort={
  load:()=>call("load"),
  talent:(search,cursor)=>call("talent",{search,cursor}),
  save:({requestId,expectedRevision,matches,runningOrder})=>
   call("save",{requestId,expectedRevision,matches,runningOrder}),
  confirmReady:({requestId,expectedRevision})=>
   call("ready",{requestId,expectedRevision}),
 };
 return mountCardEditor(root,port);
}
