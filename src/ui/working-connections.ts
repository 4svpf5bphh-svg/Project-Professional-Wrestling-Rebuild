/** Small-screen wrestler-to-wrestler professional connections, original PPW
 * evidence rules. Match chemistry is NEVER equivalent to personal hostility.
 */
import type {readWorkingConnections} from "../db/working-connections-workspace.js";
export type WorkingConnectionsView=Awaited<ReturnType<typeof readWorkingConnections>>;
export interface WorkingConnectionsPort {
 load(personId?:string):Promise<WorkingConnectionsView>;
 openWrestler?(personId:string):void;
}
const el=(tag:string,cls="",label="")=>{
 const x=document.createElement(tag);x.className=cls;x.textContent=label;return x;
};
export function mountWorkingConnections(root:HTMLElement,
 port:WorkingConnectionsPort,onBack?:()=>void){
 let view:WorkingConnectionsView|null=null,loading=false,error="",requested:string|undefined;
 async function load(personId?:string){
  requested=personId;loading=true;render();
  try{view=await port.load(personId);error="";}
  catch(e){error=e instanceof Error?e.message:"Connections are unavailable";}
  finally{loading=false;render();}
 }
 function render(){
  root.classList.add("ppw-editor","ppw-working-connections");
  root.replaceChildren();
  const header=el("header","ppw-connections-header");
  if(onBack){
   const back=el("button","ppw-connections-button","← Back to card") as HTMLButtonElement;
   back.type="button";back.onclick=onBack;header.append(back);
  }
  header.append(el("span","ppw-eyebrow","THE LOCKER ROOM / RELATIONSHIPS"),
   el("h1","","Working connections"),
   el("p","ppw-muted","Who works well together? This is verified in-ring cooperation, not scripted animosity."));
  root.append(header);
  if(error)root.append(el("p","ppw-alert ppw-error",error));
  if(!view){
   const retry=el("button","ppw-connections-button",loading?"Loading…":"Retry") as HTMLButtonElement;
   retry.type="button";retry.disabled=loading;retry.onclick=()=>void load(requested);
   root.append(retry);return;
  }
  if(!view.roster.length){
   root.append(el("p","ppw-muted","No signed wrestlers on your current roster."));
   return;
  }
  const field=el("label","ppw-field");
  field.append(el("span","","Roster wrestler"));
  const choose=document.createElement("select");
  choose.setAttribute("aria-label","Inspect roster wrestler connections");
  choose.disabled=loading;
  for(const p of view.roster){
   const option=document.createElement("option");
   option.value=p.personId;option.textContent=p.name;
   option.selected=p.personId===view.selectedPersonId;choose.append(option);
  }
  choose.value=view.selectedPersonId??"";
  choose.onchange=()=>void load(choose.value);
  field.append(choose);root.append(field);
  if(view.selectedPersonId&&port.openWrestler){
   const scout=el("button","ppw-connections-button","View wrestler dossier ↗") as HTMLButtonElement;
   scout.type="button";scout.onclick=()=>port.openWrestler?.(view!.selectedPersonId!);
   root.append(scout);
  }
  const list=el("section","ppw-connections-list");
  list.append(el("h2","","Recent connections"));
  if(!view.connections.length)
   list.append(el("p","ppw-muted","No established partnership or verified recent tag appearances yet."));
  for(const c of view.connections){
   const card=el("article","ppw-connection-card");
   card.append(el("h3","",c.name));
   if(port.openWrestler){
    const scout=el("button","ppw-connections-button","View "+c.name+"'s dossier ↗") as HTMLButtonElement;
    scout.type="button";scout.onclick=()=>port.openWrestler?.(c.personId);
    card.append(scout);
   }
   const facts=el("div","ppw-connection-facts");
   facts.append(el("span","","Recent tag shows · "+c.recentTagMatches),
    el("span","","Familiarity · "+(c.established?c.familiarity:"Not established")));
   if(c.established){
    facts.append(el("span","","Professional trust · "+c.professionalTrust.toFixed(1)));
    if(c.tags.length)card.append(el("p","ppw-muted","Background · "+c.tags.join(", ")));
    if(c.lastDevelopment)
     card.append(el("p","ppw-muted",
      (c.lastDevelopment.kind==="STRAIN"?
       "Professional confidence strained":"Working partnership improved")+
      " · Y"+(Math.floor(c.lastDevelopment.weekIndex/52)+1)+
      " W"+(c.lastDevelopment.weekIndex%52+1)));
   }else card.append(el("p","ppw-muted",
    "A recent teammate, but no established professional relationship yet."));
   card.append(facts);list.append(card);
  }
  root.append(list);
  root.append(el("p","ppw-muted",
   "Professional confidence changes only after independently verified tag matches. Winning, feuding and staged betrayals do not create real-life dislike."));
 }
 void load();
 return {refresh:()=>load(requested)};
}
