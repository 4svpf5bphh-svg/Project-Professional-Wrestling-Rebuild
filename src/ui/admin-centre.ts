/** Protected operator desk. All sensitive reads and writes are server-authorised;
 * this client never stores an API key, resets a World or runs a timer. */
import type {RingsideSettings} from "../domain/ringside-settings.js";
type ActionPlan={
 year:number;week:number;action:string;blockers:string[];
 ready:{phase:string;active:number;regularSubmitted:number;submitted:number;
  cleared:number|null;certified:number|null;legacyResolved:number;detailedResolved:number};
};
type AdminData={plan:ActionPlan;settings:RingsideSettings;
 groqConfigured:boolean;shows:{show_id:string;show_name:string|null;year:number;week:number}[]};
type Recap={showHeadline:string;opening:string;closing:string;
 slots:{slotId:string;headline:string;recap:string}[]};
type Context={csrfToken:string};
const el=(tag:string,cls="",text="")=>{
 const n=document.createElement(tag);n.className=cls;n.textContent=text;return n;
};
async function request(path:string,method:"GET"|"POST",csrf:string,body?:unknown){
 const response=await fetch(path,{method,cache:"no-store",credentials:"same-origin",
  headers:method==="POST"?{"content-type":"application/json","x-ppw-csrf":csrf}:{},
  ...(body===undefined?{}:{body:JSON.stringify(body)})});
 const payload=await response.json().catch(()=>({error:"The server did not return a valid response"}));
 if(!response.ok)throw new Error(typeof payload.error==="string"?payload.error:"Admin request failed");
 return payload;
}
const inputField=(title:string,input:HTMLElement)=>{
 const field=el("label","ppw-admin-field");
 field.append(el("span","",title),input);return field;
};
const option=(label:string,value:string)=>{
 const o=document.createElement("option");o.value=value;o.textContent=label;return o;
};
function selectControl(items:readonly [string,string][],current:string){
 const s=document.createElement("select");s.className="ppw-admin-input";
 for(const [id,label] of items)s.append(option(label,id));
 s.value=current;return s;
}
const message=(box:HTMLElement,s:string,isError=false)=>{
 box.textContent=s;box.className="ppw-admin-message"+(isError?" ppw-admin-error":"");
 box.setAttribute("role","status");
};
export async function mountAdminCentre(root:HTMLElement,ctx:Context){
 root.classList.add("ppw-admin-centre");
 root.replaceChildren(el("span","ppw-eyebrow","PPW / ADMINISTRATOR"),
  el("h1","","Control Room"),
  el("p","ppw-admin-sub","Only the designated World operator can change these settings. Multiplayer results and authored finishes remain authoritative."));
 const world=el("section","ppw-admin-panel");
 const studio=el("section","ppw-admin-panel");
 world.append(el("h2","","World Control"),el("p","ppw-admin-status","Loading verified World state…"));
 studio.append(el("h2","","Ringside AI Studio"),el("p","","Loading editorial controls…"));
 root.append(world,studio);
 let busy=false;
 async function load(){
  const data=await request("/api/admin","GET",ctx.csrfToken) as AdminData;
  const p=data.plan,ready=p.ready;
  world.replaceChildren(el("h2","","World Control"));
  const status=el("div","ppw-admin-world-data");
  status.append(el("strong","",`YEAR ${p.year} · WEEK ${p.week} · ${ready.phase}`),
   el("p","",`Next stage: ${p.action.replaceAll("_"," ")}`),
   el("p","",`Submitted ${ready.regularSubmitted}/${ready.active} · Earlier results ${ready.legacyResolved}/${ready.submitted} · Full broadcasts ${ready.detailedResolved}/${ready.submitted}`));
  if(p.blockers.length)status.append(el("p","ppw-admin-warning",`Needs attention: ${p.blockers.join(", ").replaceAll("_"," ")}`));
  const actions=el("div","ppw-admin-actions");
  const info=el("p","ppw-admin-message","");
  const advance=el("button","ppw-admin-primary",ready.phase==="OPEN"?"Advance World week":"Continue resolution") as HTMLButtonElement;
  advance.type="button";
  advance.onclick=async()=>{
   if(busy)return;
   if(ready.phase==="OPEN"&&!window.confirm(`Lock Week ${p.week} for ALL promotions and start resolution? This cannot be undone.`))return;
   busy=true;advance.disabled=true;
   message(info,"Checking certified World stages…");
   try{
    const result=await request("/api/playtest-week","POST",ctx.csrfToken,{
     confirm:"ADVANCE_SHARED_WORLD",year:p.year,week:p.week
    }) as {status:string;steps:{action:string;status:string}[];blockers:string[]};
    const last=result.steps.at(-1)?.action?.replaceAll("_"," ")??"the next stage";
    message(info,result.status==="PUBLISHED"?"The next playable World week is available.":
     result.status==="BLOCKED"?`Blocked at ${last}: ${result.blockers.join(", ").replaceAll("_"," ")}`:
     `Completed ${last}. The next stage is ready to continue.`,
     result.status==="BLOCKED");
    await load();
   }catch(e){message(info,e instanceof Error?e.message:"Resolution failed",true);}
   finally{busy=false;advance.disabled=false;}
  };
  const reopen=el("button","ppw-admin-secondary","Reopen booking for 24 hours") as HTMLButtonElement;
  reopen.type="button";
  reopen.onclick=async()=>{
   if(busy||!window.confirm("Reopen booking for every promotion? The existing venue and cards are preserved."))return;
   busy=true;reopen.disabled=true;
   try{
    await request("/api/playtest-booking","POST",ctx.csrfToken,{
     confirm:"EXTEND_SHARED_BOOKING",year:p.year,week:p.week
    });message(info,"Booking reopened for 24 hours. Existing drafts remain intact.");await load();
   }catch(e){message(info,e instanceof Error?e.message:"Booking could not be reopened",true);}
   finally{busy=false;reopen.disabled=false;}
  };
  reopen.hidden=ready.phase!=="OPEN";
  actions.append(advance,reopen);
  const refresh=el("button","ppw-admin-secondary","Refresh diagnostics") as HTMLButtonElement;
  refresh.type="button";refresh.onclick=()=>void load().catch(e=>
   message(info,e instanceof Error?e.message:"Cannot refresh World status",true));
  actions.append(refresh);
  world.append(status,actions,info,
   el("p","ppw-admin-small","No automatic advance, World reset, or schedule modification. Each operation needs your explicit press."));

  const config={...data.settings};
  studio.replaceChildren(el("h2","","Ringside AI Studio"),
   el("p","ppw-admin-sub","These preferences govern future AI reports. Previously published Ringside reports stay unchanged."));
  const form=document.createElement("form");form.className="ppw-admin-form";
  const model=selectControl([["openai/gpt-oss-120b","GPT-OSS 120B · more capable"],["openai/gpt-oss-20b","GPT-OSS 20B · faster"]],config.model);
  const voice=selectControl([["MARTY","Marty Vale · veteran columnist"],["SPORTS","Traditional sports journalism"],["SATIRE","Sharper wrestling satire"]],config.voice);
  const detail=selectControl([["SHORT","Short recaps"],["BALANCED","Balanced · 1–2 paragraphs"],["LONG","Detailed match reports"]],config.detail);
  const reasoning=selectControl([["low","Low"],["medium","Medium"],["high","High"]],config.reasoning);
  const temperature=document.createElement("input");temperature.type="range";temperature.min="0.2";temperature.max="1.5";temperature.step="0.05";temperature.value=String(config.creativity);
  const tempLabel=el("strong","",temperature.value);temperature.oninput=()=>{tempLabel.textContent=temperature.value;};
  const temperWrap=el("div","ppw-admin-temperature");temperWrap.append(temperature,tempLabel);
  const guidance=document.createElement("textarea");guidance.className="ppw-admin-input";
  guidance.rows=3;guidance.maxLength=900;guidance.value=config.additionalGuidance;
  guidance.placeholder="Optional additional writing direction. Official match facts stay locked.";
  form.append(inputField("AI model",model),inputField("Columnist style",voice),
   inputField("Review length",detail),inputField("Reasoning effort",reasoning),
   inputField("Creative variety",temperWrap),inputField("Extra editorial direction",guidance));
  const aiStatus=el("p","ppw-admin-message","");
  if(!data.groqConfigured)message(aiStatus,"Groq API key is not configured; previews will be unavailable.",true);
  const latest=selectControl(data.shows.map(x=>[x.show_id,
   `Y${x.year} W${x.week} · ${x.show_name??"Weekly show"}`] as [string,string]),
   data.shows[0]?.show_id??"");
  if(!data.shows.length){latest.disabled=true;latest.append(option("No completed player show yet",""));}
  const selectedSettings=()=>({
   model:model.value,voice:voice.value,detail:detail.value,
   creativity:Number(temperature.value),reasoning:reasoning.value,
   additionalGuidance:guidance.value
  });
  const save=el("button","ppw-admin-primary","Save Ringside preferences") as HTMLButtonElement;
  save.type="submit";
  form.onsubmit=async event=>{
   event.preventDefault();if(busy)return;
   busy=true;save.disabled=true;
   try{
    const response=await request("/api/admin","POST",ctx.csrfToken,{
     action:"SAVE_RINGSIDE",expectedVersion:config.version,settings:selectedSettings()
    }) as {settings:RingsideSettings};
    config.version=response.settings.version;
    message(aiStatus,"Saved for future Ringside reports. Older published reviews remain intact.");
   }catch(e){message(aiStatus,e instanceof Error?e.message:"Could not save Ringside preferences",true);}
   finally{busy=false;save.disabled=false;}
  };
  form.append(save);
  const previewBtn=el("button","ppw-admin-secondary","Preview this style") as HTMLButtonElement;
  previewBtn.type="button";previewBtn.disabled=!data.groqConfigured||!data.shows.length;
  const preview=el("article","ppw-admin-preview");preview.hidden=true;
  previewBtn.onclick=async()=>{
   if(busy)return;busy=true;previewBtn.disabled=true;message(aiStatus,"Preparing a one-off preview; no published results will be overwritten.");
   try{
    const out=await request("/api/admin-preview","POST",ctx.csrfToken,{
     showId:latest.value,settings:selectedSettings()
    }) as {review:Recap};
    preview.hidden=false;preview.replaceChildren(el("span","ppw-eyebrow","UNPUBLISHED SAMPLE"),
     el("h3","",out.review.showHeadline),el("p","",out.review.opening));
    for(const slot of out.review.slots)
     preview.append(el("h4","",slot.headline),el("p","",slot.recap));
    preview.append(el("p","",out.review.closing));
    message(aiStatus,"Preview complete. No World or published result was changed.");
   }catch(e){message(aiStatus,e instanceof Error?e.message:"Preview unavailable",true);}
   finally{busy=false;previewBtn.disabled=false;}
  };
  studio.append(form,el("p","ppw-admin-small",
   "A saved review keeps its original text. New settings cannot change winners, title changes, injuries or scripted angles."),
   inputField("Try against a completed show",latest),previewBtn,aiStatus,preview);
 }
 try{await load();}catch(e){
  const error=el("p","ppw-admin-error",e instanceof Error?e.message:"Admin is unavailable");
  root.append(error);
 }
}
