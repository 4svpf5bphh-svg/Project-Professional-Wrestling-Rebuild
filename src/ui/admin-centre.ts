/** Protected operator desk. All sensitive reads and writes are server-authorised;
 * this client never stores an API key, resets a World or runs a timer. */
import type {RingsideSettings} from "../domain/ringside-settings.js";
type ActionPlan={
 year:number;week:number;action:string;blockers:string[];
 ready:{phase:string;active:number;regularSubmitted:number;submitted:number;
  cleared:number|null;certified:number|null;legacyResolved:number;detailedResolved:number};
};
type LegendPilot={status:"ARMED"|"CONSUMED"|"CANCELLED";promotionId:string;
 armedYear:number;armedWeek:number;consumedYear:number|null;consumedWeek:number|null};
type AdminData={plan:ActionPlan;settings:RingsideSettings;pilot:LegendPilot|null;
 testKp?:{balance:number;granted:boolean;target:number};
 aiUsage?:{call_count:number;reserved_tokens:number;reported_input_tokens:string;
  reported_output_tokens:string;completed_calls:number;failed_calls:number}|null;
 groqConfigured:boolean;openAiPreviewEnabled?:boolean;shows:{show_id:string;show_name:string|null;year:number;week:number;
 editorial_state?:"READY"|"FAILED"|"PENDING"|null;editorial_attempts?:number|null}[]};
type LabRun={run_id:string;show_id:string;show_name:string;
 provider:"GROQ"|"OPENAI";model:string;duration_ms:number;provider_calls:number;
 input_tokens:number|null;output_tokens:number|null;
 rating:number|null;flags:string[];notes:string;created_at:string;
 status?:"READY"|"FAILED";error_code?:string|null};
type LabDay={day:string;provider:"GROQ"|"OPENAI";calls:number;reserved:number;
 input:string;output:string;failed:number};
type BenchmarkScenario={id:string;name:string;focus:string;expectation:string;watchFor:string};
type LabData={usage:LabDay[];runs:LabRun[];scores:{
 provider:string;model:string;total:number;reviewed:number;average_score:number|null;
 successful?:number;failed?:number}[];
 scenarios?:BenchmarkScenario[];providers?:{groq:boolean;openai:boolean}};
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
 const labPanel=el("section","ppw-admin-panel");
 const legendTrial=el("section","ppw-admin-panel");
 const kpDesk=el("section","ppw-admin-panel");
 const navigation=el("nav","ppw-admin-tabs");
 navigation.setAttribute("aria-label","Admin sections");
 let activeTab:"WORLD"|"AI"|"PLAYTESTS"="WORLD";
 let labData:LabData|null=null;
 let lastBenchmarkNotice="";
 const navButtons=(["WORLD","AI","PLAYTESTS"] as const).map(tab=>{
  const button=el("button","ppw-admin-tab",
   tab==="WORLD"?"World":tab==="AI"?"AI Testing Lab":"Playtests") as HTMLButtonElement;
  button.type="button";
  button.onclick=()=>{
   activeTab=tab;switchTab();
   if(tab==="AI"&&!labData)void loadLab();
  };
  navigation.append(button);return button;
 });
 function switchTab(){
  world.hidden=activeTab!=="WORLD";
  studio.hidden=activeTab!=="AI";
  labPanel.hidden=activeTab!=="AI";
  legendTrial.hidden=activeTab!=="PLAYTESTS";
  kpDesk.hidden=activeTab!=="PLAYTESTS";
  navButtons.forEach((button,index)=>{
   const active=(["WORLD","AI","PLAYTESTS"] as const)[index]===activeTab;
   button.setAttribute("aria-pressed",String(active));
   button.classList.toggle("is-active",active);
  });
 }
 world.append(el("h2","","World Control"),el("p","ppw-admin-status","Loading verified World state…"));
 studio.append(el("h2","","Ringside AI Studio"),el("p","","Loading editorial controls…"));
 root.append(navigation,world,labPanel,studio,kpDesk,legendTrial);
 switchTab();
 let busy=false;

 /** AI Lab loads only after the operator opens its tab. General Admin
  * and ordinary game screens never fetch preview history or token trends. */
 async function loadLab(){
  labPanel.replaceChildren(el("h2","","AI Quality Lab"),
   el("p","ppw-admin-small","Loading seven-day AI usage and saved tests…"));
  try{
   const data=await request("/api/admin?aiLab=summary","GET",ctx.csrfToken) as LabData;
   labData=data;
   const overview=el("div","ppw-lab-overview");
   const week=(provider:"GROQ"|"OPENAI")=>data.usage.filter(r=>r.provider===provider);
   const total=(rows:LabDay[],field:"calls"|"failed")=>
    rows.reduce((n,row)=>n+row[field],0);
   const tokens=(rows:LabDay[])=>
    rows.reduce((n,row)=>n+Number(row.input)+Number(row.output),0);
   const groq=week("GROQ"),openai=week("OPENAI");
   const stat=(name:string,value:string)=>{
    const tile=el("div","ppw-lab-stat");
    tile.append(el("span","",name),el("strong","",value));return tile;
   };
   overview.append(
    stat("Groq calls · 7 days",String(total(groq,"calls"))),
    stat("Groq reported tokens",tokens(groq).toLocaleString("en-GB")),
    stat("OpenAI tests · 7 days",String(total(openai,"calls"))),
    stat("Provider failures",String(total([...groq,...openai],"failed")))
   );
   const today=new Date().toISOString().slice(0,10);
   const live=groq.find(row=>row.day===today);
   const todaySummary=el("p","ppw-admin-small",
    "Today (UTC): "+(live?.calls??0)+"/40 Groq requests · "+
    (live?.reserved??0).toLocaleString("en-GB")+
    "/160,000 tokens used or reserved. Provider token totals can be unavailable for failed requests.");
   const usage=el("div","ppw-lab-periods");
   for(const day of [...new Set(data.usage.map(row=>row.day))].sort().reverse()){
    const records=data.usage.filter(r=>r.day===day);
    const line=el("div","ppw-lab-period");
    line.append(el("strong","",day));
    for(const row of records)line.append(el("span","",
     row.provider+" · "+row.calls+" calls · "+
      (Number(row.input)+Number(row.output)).toLocaleString("en-GB")+
      " reported tokens"+(row.failed?" · "+row.failed+" failed":"")));
    usage.append(line);
   }
   if(!data.usage.length)usage.append(el("p","ppw-admin-small",
    "No recorded provider requests during the last seven days."));
   const scoreTitle=el("h3","","Editorial scorecard · 30 days");
   const scores=el("div","ppw-lab-scorecard");
   if(data.scores.length)for(const row of data.scores){
    const line=el("div","ppw-lab-period");
    line.append(el("strong","",row.model),
     el("span","",row.reviewed?row.average_score+
      "/5 average from "+row.reviewed+" rated tests":"Not yet rated"),
     el("span","",row.total+" recorded tests · "+
      (row.successful??row.total)+" readable · "+(row.failed??0)+" failed"));
    scores.append(line);
   }else scores.append(el("p","ppw-admin-small",
    "Run a preview and rate it to build your model comparisons."));
   // Uses the already fetched, bounded metadata. No extra Neon query.
   const scenarioScores=el("div","ppw-lab-scorecard");
   const scenarioGroups=new Map<string,LabRun[]>();
   for(const run of data.runs){
    if(!run.show_id.startsWith("benchmark:"))continue;
    const grouped=scenarioGroups.get(run.show_id)??[];
    grouped.push(run);scenarioGroups.set(run.show_id,grouped);
   }
   for(const [id,runs] of scenarioGroups){
    const box=el("div","ppw-lab-period");
    box.append(el("strong","",(data.scenarios??[]).find(x=>"benchmark:"+x.id===id)?.name??
     id.slice("benchmark:".length)));
    for(const groupKey of [...new Set(runs.map(x=>x.provider+" · "+x.model))]){
     const group=runs.filter(x=>x.provider+" · "+x.model===groupKey);
     const successes=group.filter(x=>x.status!=="FAILED");
     const failed=group.length-successes.length;
     const rated=successes.filter(x=>x.rating!==null);
     const average=rated.length?
      (rated.reduce((sum,x)=>sum+x.rating!,0)/rated.length).toFixed(1)+"/5":
      "Unrated";
     const callTotal=group.reduce((n,x)=>n+x.provider_calls,0);
     const known=group.filter(x=>x.input_tokens!==null&&x.output_tokens!==null);
     const tokens=known.reduce((n,x)=>n+x.input_tokens!+x.output_tokens!,0);
     box.append(el("span","",groupKey+" · "+average+" · "+
      successes.length+" valid / "+group.length+" attempts · "+failed+
      " failed · "+callTotal+" API calls · "+
      (known.length===group.length?tokens.toLocaleString("en-GB")+" tokens":
       "partial token totals")));
    }
    scenarioScores.append(box);
   }
   if(!scenarioGroups.size)scenarioScores.append(
    el("p","ppw-admin-small",
     "Run the same scenario with both models, then rate each saved article to compare performance."));
   const benchmark=el("div","ppw-lab-benchmark");
   benchmark.append(el("h3","","Wrestling IQ Benchmarks"),
    el("p","ppw-admin-small","Repeat the same fictional match with different models. No World, contracts or published Results change. Each run uses the shared AI allowance."));
   const scenarios=data.scenarios??[];
   const scenarioPick=selectControl(scenarios.map(x=>[x.id,x.name]),scenarios[0]?.id??"");
   const benchmarkModel=selectControl([
    ["openai/gpt-oss-120b","Groq · 120B"],["openai/gpt-oss-20b","Groq · 20B"]
   ],"openai/gpt-oss-120b");
   const benchmarkProvider=selectControl([
    ["GROQ","Groq · free allowance"],
    ...(data.providers?.openai?[["OPENAI","OpenAI · paid comparison"] as [string,string]]:[])
   ],"GROQ");
   const rubric=el("div","ppw-lab-rubric");
   const scenarioDescription=()=>{
    const selected=scenarios.find(item=>item.id===scenarioPick.value);
    rubric.replaceChildren(el("strong","",selected?.focus??"No benchmark scenarios available."),
     el("p","","Look for: "+(selected?.expectation??"A complete wrestling article.")),
     el("p","ppw-admin-small","Watch for: "+(selected?.watchFor??"Invented facts.")));
   };
   scenarioPick.onchange=scenarioDescription;
   scenarioDescription();
   const benchmarkStatus=el("p","ppw-admin-message",lastBenchmarkNotice);
   const runBenchmark=el("button","ppw-admin-primary","Run Wrestling IQ benchmark") as HTMLButtonElement;
   runBenchmark.type="button";
   runBenchmark.disabled=!scenarios.length||!data.providers?.groq;
   benchmarkProvider.onchange=()=>{
    runBenchmark.disabled=!scenarios.length||(benchmarkProvider.value==="GROQ"?
     !data.providers?.groq:!data.providers?.openai);
    benchmarkModel.disabled=benchmarkProvider.value==="OPENAI";
   };
   runBenchmark.onclick=async()=>{
    if(runBenchmark.disabled)return;
    runBenchmark.disabled=true;
    message(benchmarkStatus,"Generating one private test; the official World remains unchanged.");
    try{
     const chosen=scenarios.find(item=>item.id===scenarioPick.value);
     if(!chosen)throw new Error("Choose a recognised wrestling scenario");
     const result=await request("/api/admin-preview","POST",ctx.csrfToken,{
      benchmarkId:chosen.id,previewProvider:benchmarkProvider.value,
      settings:{model:benchmarkModel.value,voice:"MARTY",detail:"BALANCED",
       reasoning:"low",creativity:0.92,additionalGuidance:""}
     }) as {labRunId:string;metrics:{durationMs:number;providerCalls:number;
      inputTokens:number|null;outputTokens:number|null};
      benchmark?:{certifiedFactsValidated:boolean;diagnosticCues:string[];
       humanReviewRequired:boolean}};
     lastBenchmarkNotice="Saved "+chosen.name+" · "+
      result.metrics.durationMs+"ms · "+result.metrics.providerCalls+
      " provider call(s) · "+
      (result.metrics.inputTokens===null?"tokens not reported":
       (result.metrics.inputTokens+(result.metrics.outputTokens??0)).toLocaleString("en-GB")+" tokens")+
      ". Basic result checks passed; assess psychology and tone yourself. "+
      (result.benchmark?.diagnosticCues.join("; ")??"");
     labData=null;
     await loadLab();
    }catch(e){
     lastBenchmarkNotice="Benchmark failed: "+(e instanceof Error?e.message:
      "No valid model article")+
      ". Any provider attempt will appear in the AI Lab failure history. Official results were not changed.";
     labData=null;
     await loadLab();
    }
   };
   benchmark.append(inputField("Wrestling scenario",scenarioPick),rubric,
    inputField("Benchmark provider",benchmarkProvider),
    inputField("Groq model",benchmarkModel),runBenchmark,benchmarkStatus);
   const reportButton=el("button","ppw-admin-secondary","Copy AI test report") as HTMLButtonElement;
   reportButton.type="button";
   const reportStatus=el("p","ppw-admin-message","");
   const reportFallback=document.createElement("textarea");reportFallback.className="ppw-admin-input";
   reportFallback.readOnly=true;reportFallback.rows=5;reportFallback.hidden=true;
   reportButton.onclick=async()=>{
    const lines=["PPW · AI TEST REPORT (UTC)","Recent 7-day provider usage",
     ...data.usage.map(x=>x.day+" "+x.provider+
      " calls="+x.calls+" input="+x.input+" output="+x.output+" failed="+x.failed),
     "30-day model ratings",
     ...data.scores.map(x=>x.provider+" "+x.model+" tests="+x.total+
      " valid="+(x.successful??x.total)+" failures="+(x.failed??0)+
      " rated="+x.reviewed+" average="+(x.average_score??"unrated")),
     "Recent manual assessments",
     ...data.runs.map(x=>x.show_name+" · "+x.provider+" · "+x.model+
      " · "+x.duration_ms+"ms · "+x.provider_calls+" provider calls · "+
      (x.input_tokens===null?"tokens unreported":
       (x.input_tokens+x.output_tokens!).toString()+" tokens")+
      " · status="+(x.status??"READY")+
      (x.error_code?" · failure_code="+x.error_code:"")+
      " · rating="+(x.rating??"unrated")+
      (x.flags.length?" · flags="+x.flags.join(","):"")+
      (x.notes?" · notes="+x.notes:""))].join("\n");
    try{
     await navigator.clipboard.writeText(lines);
     message(reportStatus,"Report copied — paste it into our development chat.");
     reportFallback.hidden=true;
    }catch{
     reportFallback.value=lines;reportFallback.hidden=false;reportFallback.focus();
     reportFallback.select();
     message(reportStatus,"Select and copy this report to share feedback.");
    }
   };
   const runsHeader=el("h3","","Recent AI tests");
   const compare=el("div","ppw-lab-compare");
   const main=el("article","ppw-admin-preview");main.append(el("p","ppw-admin-small",
    "Open a saved test to read it and record feedback."));
   const secondary=el("article","ppw-admin-preview");secondary.append(el("p","ppw-admin-small",
    "Compare another result here. Both columns show completed, non-published samples."));
   compare.append(main,secondary);
   const feedbackArea=el("div","ppw-lab-feedback");
   const reviewTo=(target:HTMLElement,review:Recap,run:LabRun)=>{
    target.replaceChildren(el("span","ppw-eyebrow",run.provider+" · "+run.model),
     el("h3","",review.showHeadline),
     el("p","ppw-admin-small",run.show_name+" · "+run.duration_ms+"ms · "+
      (run.input_tokens===null?"Tokens not reported":
      (run.input_tokens+(run.output_tokens??0)).toLocaleString("en-GB")+" tokens")),
     el("p","",review.opening));
    for(const slot of review.slots)target.append(
     el("h4","",slot.headline),el("p","",slot.recap));
    target.append(el("p","",review.closing));
   };
   const flags=[
    ["WRONG_FINISH","Wrong finish"],["TAG_RULES","Tag rules"],
    ["INVENTED_FACT","Invented facts"],["REPETITION","Repetitive"],
    ["CHARACTER_VOICE","Wrong voice"],["FLAT_WRITING","Flat writing"],
    ["OTHER","Other"]
   ] as const;
   const showSaved=async(run:LabRun,side:"MAIN"|"COMPARE")=>{
    const target=side==="MAIN"?main:secondary;
    target.replaceChildren(el("p","ppw-admin-small","Loading saved test…"));
    try{
     const data=await request("/api/admin?aiLab=review&runId="+
      encodeURIComponent(run.run_id),"GET",ctx.csrfToken) as {review:Recap};
     reviewTo(target,data.review,run);
     if(side==="MAIN"){
      feedbackArea.replaceChildren(el("h3","","Your assessment"));
      const stars=el("div","ppw-lab-stars");let rating=run.rating??0;
      const buttons=Array.from({length:5},(_,i)=>{
       const b=el("button","ppw-admin-secondary",String(i+1)+" ★") as HTMLButtonElement;
       b.type="button";
       b.onclick=()=>{rating=i+1;buttons.forEach((each,j)=>{
        const chosen=j===i;each.setAttribute("aria-pressed",String(chosen));
        each.classList.toggle("is-selected",chosen);
       });};
       stars.append(b);return b;
      });
      buttons.forEach((b,j)=>b.setAttribute("aria-pressed",String(j+1===rating)));
      buttons.forEach((b,j)=>b.classList.toggle("is-selected",j+1===rating));
      const selected=new Set(run.flags);
      const chips=el("div","ppw-lab-flags");
      for(const [id,label] of flags){
       const chip=el("button","ppw-lab-chip",label) as HTMLButtonElement;
       chip.type="button";chip.setAttribute("aria-pressed",String(selected.has(id)));
       chip.classList.toggle("is-selected",selected.has(id));
       chip.onclick=()=>{
        if(selected.has(id))selected.delete(id);else selected.add(id);
        chip.setAttribute("aria-pressed",String(selected.has(id)));
        chip.classList.toggle("is-selected",selected.has(id));
       };
       chips.append(chip);
      }
      const notes=document.createElement("textarea");notes.className="ppw-admin-input";
      notes.rows=3;notes.maxLength=500;notes.value=run.notes;
      notes.placeholder="What sounded authentic? What did the model misunderstand?";
      const save=el("button","ppw-admin-primary","Save assessment") as HTMLButtonElement;
      save.type="button";
      const status=el("p","ppw-admin-message","");
      save.onclick=async()=>{
       if(!rating)return message(status,"Choose a quality score before saving.",true);
       save.disabled=true;
       try{
        await request("/api/admin","POST",ctx.csrfToken,{
         action:"RATE_AI_LAB_RUN",runId:run.run_id,
         rating,flags:[...selected],notes:notes.value});
        message(status,"Assessment saved to your private AI Lab.");
        run.rating=rating;run.flags=[...selected];run.notes=notes.value;
        labData=null;
       }catch(e){message(status,e instanceof Error?e.message:
        "Could not save assessment",true);}
       finally{save.disabled=false;}
      };
      feedbackArea.append(el("p","ppw-admin-small",
       "Rate the overall writing, flag problems, and note what felt right or wrong."),
       stars,el("p","ppw-admin-small","Specific issues"),chips,
       inputField("Playtest notes",notes),save,status);
     }
    }catch(e){target.replaceChildren(el("p","ppw-admin-error",
     e instanceof Error?e.message:"Saved preview is unavailable"));}
   };
   const history=el("div","ppw-lab-history");
   if(data.runs.length)for(const [index,run] of data.runs.entries()){
    const item=el("div","ppw-lab-history-row");
    item.hidden=index>=8;
    const heading=el("strong","",run.show_name+" · "+run.provider);
    const failed=run.status==="FAILED";
    const facts=el("p","ppw-admin-small",
     run.model+" · "+run.duration_ms+"ms · "+run.provider_calls+
     " call(s) · "+(run.input_tokens===null?"Tokens not reported":
      (run.input_tokens+(run.output_tokens??0)).toLocaleString("en-GB")+" tokens")+
     " · "+(failed?"FAILED: "+(run.error_code??"Unknown safe error"):
      run.rating?run.rating+"/5":"Unrated")+
     " · "+run.created_at.slice(0,10));
    const actions=el("div","ppw-admin-actions");
    if(!failed){
     const open=el("button","ppw-admin-secondary","Read & rate") as HTMLButtonElement;
     open.type="button";open.onclick=()=>void showSaved(run,"MAIN");
     const compareBtn=el("button","ppw-admin-secondary","Compare") as HTMLButtonElement;
     compareBtn.type="button";compareBtn.onclick=()=>void showSaved(run,"COMPARE");
     actions.append(open,compareBtn);
    }else actions.append(el("p","ppw-admin-small",
     "No article was published or saved. Check this error against the competing model."));
    item.append(heading,facts,actions);history.append(item);
   }else history.append(el("p","ppw-admin-small",
    "No manual tests yet. Run a Ringside preview to save an owner-only sample."));
   if(data.runs.length>8){
    const more=el("button","ppw-admin-secondary",
     "Show "+(data.runs.length-8)+" older tests") as HTMLButtonElement;
    more.type="button";let expanded=false;
    more.onclick=()=>{
     expanded=!expanded;
     [...history.querySelectorAll<HTMLElement>(".ppw-lab-history-row")]
      .forEach((item,i)=>{item.hidden=!expanded&&i>=8;});
     more.textContent=expanded?"Hide older tests":
      "Show "+(data.runs.length-8)+" older tests";
    };
    history.append(more);
   }
   labPanel.replaceChildren(el("h2","","AI Quality Lab"),
    el("p","ppw-admin-sub",
     "Live provider usage, model quality and your playtest notes. No public Results are changed."),
    benchmark,overview,todaySummary,usage,scoreTitle,scores,
    el("h3","","Scenario-by-scenario model scores"),scenarioScores,reportButton,
    reportStatus,reportFallback,runsHeader,history,compare,feedbackArea);
  }catch(e){labData=null;labPanel.replaceChildren(
   el("h2","","AI Quality Lab"),
   el("p","ppw-admin-error",e instanceof Error?e.message:"AI Lab unavailable"));
  }
 }
 let lastNotice="";let lastError=false;
 async function load(){
  const data=await request("/api/admin","GET",ctx.csrfToken) as AdminData;
  const p=data.plan,ready=p.ready;
  world.replaceChildren(el("h2","","World Control"));
  const status=el("div","ppw-admin-world-data");
  status.append(el("strong","",`YEAR ${p.year} · WEEK ${p.week} · ${ready.phase}`),
   el("p","",ready.phase==="OPEN"?
    "Advance when ready. With one human player and no show booked, your promotion takes an off-week. The AI World continues.":
    "Processing the shared World. A stopped run can resume without replaying completed results."),
   el("p","",ready.phase==="OPEN"?"No automatic deadline during the solo playtest.":
    `Completed shows: ${ready.detailedResolved}/${ready.submitted}`));
  if(p.blockers.length)status.append(el("p","ppw-admin-warning",`Needs attention: ${p.blockers.join(", ").replaceAll("_"," ")}`));
  const actions=el("div","ppw-admin-actions");
  const info=el("p","ppw-admin-message","");
  if(lastNotice)message(info,lastNotice,lastError);
  const advance=el("button","ppw-admin-primary","Advance Week") as HTMLButtonElement;
  advance.type="button";
  advance.onclick=async()=>{
   if(busy)return;
   if(ready.phase==="OPEN"&&!window.confirm(`Advance from Week ${p.week}? If you have no show booked this week, your promotion takes an off-week. Other promotions continue. Future cards remain intact.`))return;
   busy=true;advance.disabled=true;
   message(info,"Checking certified World stages…");
   try{
    let finished=false;
    // One operator press; the existing server certifies a bounded six-stage
    // batch each time. Loop over batches without adding a timer or cron.
    for(let batch=0;batch<24;batch++){
     const result=await request("/api/playtest-week","POST",ctx.csrfToken,{
      confirm:"ADVANCE_SHARED_WORLD",year:p.year,week:p.week
     }) as {status:"PUBLISHED"|"BLOCKED"|"LIMIT_REACHED";
      steps:{action:string;status:string}[];blockers:string[]};
     if(result.status==="PUBLISHED"){
      message(info,"Week advanced. The next playable week is ready.");finished=true;break;
     }
     if(result.status==="BLOCKED"){
      const reason=result.blockers.join(", ").replaceAll("_"," ")||"A show needs attention";
      message(info,`Could not finish Week ${p.week}: ${reason}. Completed stages were saved; correct the issue and press Advance Week again.`,true);
      break;
     }
     if(result.steps.length===0){
      message(info,"No progress recorded; review diagnostics and retry.",true);
      break;
     }
     message(info,`Advancing Week ${p.week}… processing World shows (batch ${batch+1}).`);
     if(batch===23)message(info,"The safe batch limit was reached; press Advance Week again to resume.",true);
    }
    lastNotice=info.textContent??"";lastError=!finished;
    await load();
   }catch(e){message(info,e instanceof Error?e.message:"Resolution failed",true);
    lastNotice=info.textContent??"";lastError=true;}
   finally{busy=false;advance.disabled=false;}
  };
  const reopen=el("button","ppw-admin-secondary","Keep booking open for 5 years") as HTMLButtonElement;
  reopen.type="button";
  reopen.onclick=async()=>{
   if(busy||!window.confirm("Extend the World booking window for five years? All existing cards and venues remain intact."))return;
   busy=true;reopen.disabled=true;
   try{
    await request("/api/playtest-booking","POST",ctx.csrfToken,{
     confirm:"EXTEND_SHARED_BOOKING",year:p.year,week:p.week
    });message(info,"Booking deadline extended. All saved cards remain intact.");
    lastNotice=info.textContent??"";lastError=false;await load();
   }catch(e){message(info,e instanceof Error?e.message:"Booking could not be reopened",true);
    lastNotice=info.textContent??"";lastError=true;}
   finally{busy=false;reopen.disabled=false;}
  };
  reopen.hidden=ready.phase!=="OPEN";
  actions.append(advance,reopen);
  const refresh=el("button","ppw-admin-secondary","Refresh diagnostics") as HTMLButtonElement;
  refresh.type="button";refresh.onclick=()=>void load().catch(e=>
   message(info,e instanceof Error?e.message:"Cannot refresh World status",true));
  actions.append(refresh);
  world.append(status,actions,info,
   el("p","ppw-admin-small","No automatic World advance or reset. Only your explicit Advance Week action moves the clock."));

  kpDesk.replaceChildren(el("h2","","Kayfabe Points · Testing"),
   el("p","ppw-admin-sub","Cosmetic purchases only. One authorised test top-up, not an unlimited currency generator."));
  const wallet=data.testKp;
  if(wallet){
   kpDesk.append(el("strong","ppw-admin-status",
    "Your balance: "+wallet.balance.toLocaleString("en-GB")+" KP"));
   const grant=el("button","ppw-admin-primary","Credit 50,000 test KP") as HTMLButtonElement;
   grant.type="button";grant.disabled=wallet.granted||busy;
   if(wallet.granted)grant.textContent="Test credit already claimed";
   const result=el("p","ppw-admin-message","");
   grant.onclick=async()=>{
    if(busy||wallet.granted||!window.confirm("Top your account up to 50,000 KP once for cosmetic testing? No other manager is affected."))return;
    busy=true;grant.disabled=true;
    try{
     const response=await request("/api/admin","POST",ctx.csrfToken,{action:"GRANT_PLAYTEST_KP"}) as
      {balance:number;credited:number;alreadyGranted:boolean};
     lastNotice="KP test credit applied. Balance: "+response.balance.toLocaleString("en-GB")+" KP.";
     lastError=false;await load();
    }catch(e){message(result,e instanceof Error?e.message:"Test credit failed",true);}
    finally{busy=false;grant.disabled=wallet.granted;}
   };
   kpDesk.append(grant,result,
    el("p","ppw-admin-small","Once credited, you can purchase styles and collect eligible Legend cards normally. Purchases remain permanent."));
  }else kpDesk.append(el("p","ppw-admin-small","Wallet unavailable. Refresh Admin diagnostics."));

  legendTrial.replaceChildren(el("h2","","Legend Reveal Playtest"),
   el("p","ppw-admin-sub","THE UNDERTAKER · IMMORTAL · one-time test"));
  const trialInfo=el("p","ppw-admin-status",
   data.pilot?.status==="CONSUMED"?
    `Released at Year ${data.pilot.consumedYear}, Week ${data.pilot.consumedWeek}. Visit Industry → Legends Vault to watch or replay the full reveal.`:
   data.pilot?.status==="ARMED"?
    `Armed for your ${data.pilot.promotionId} promotion since Year ${data.pilot.armedYear}, Week ${data.pilot.armedWeek}. He unlocks after your next completed regular weekly show is certified when you Advance Week.`:
    "Arm once to release the Undertaker after your next successfully completed weekly show. Off-weeks, drafts and AI-run shows do not count.");
  legendTrial.append(trialInfo);
  if(data.pilot?.status==="CONSUMED"){
   const watch=el("button","ppw-admin-primary","Watch the Undertaker reveal") as HTMLButtonElement;
   watch.type="button";
   watch.onclick=()=>{window.location.hash="#/industry/legends";};
   legendTrial.append(watch);
  }
  const trialFeedback=el("p","ppw-admin-message","");
  if(data.pilot?.status!=="CONSUMED"){
   const isArmed=data.pilot?.status==="ARMED";
   const change=el("button",isArmed?"ppw-admin-secondary":"ppw-admin-primary",
    isArmed?"Cancel armed reveal test":"Arm Undertaker for next completed show") as HTMLButtonElement;
   change.type="button";change.disabled=ready.phase!=="OPEN"||busy;
   change.onclick=async()=>{
    if(busy||!window.confirm(isArmed?
     "Cancel the armed Undertaker test? No World results or existing legends will change.":
     "Release the Undertaker into the shared free-agent market after YOUR next certified weekly show? This is a one-time test and does not sign him to your promotion."))return;
    busy=true;change.disabled=true;
    try{
     await request("/api/admin","POST",ctx.csrfToken,{
      action:isArmed?"CANCEL_LEGEND_PILOT":"ARM_LEGEND_PILOT"});
     lastNotice=isArmed?"Legend test cancelled.":"Undertaker reveal test armed.";
     lastError=false;await load();
    }catch(e){message(trialFeedback,e instanceof Error?e.message:"Legend test unavailable",true);}
    finally{busy=false;change.disabled=ready.phase!=="OPEN";}
   };
   legendTrial.append(change);
  }
  legendTrial.append(trialFeedback,
   el("p","ppw-admin-small",
    "Only the operator can arm this fixture. The normal Immortal milestone, multiplayer market, KP card price and one World Lock remain unchanged."));
  const config={...data.settings};
  studio.replaceChildren(el("h2","","Ringside AI Studio"),
   el("p","ppw-admin-sub","These preferences govern future AI reports. Previously published Ringside reports stay unchanged."));
  const usage=data.aiUsage;
  studio.append(el("p","ppw-admin-small",usage?
   "Groq today · "+usage.call_count+"/40 calls · "+usage.reserved_tokens+
   "/160,000 reserved tokens · "+
   (Number(usage.reported_input_tokens)+Number(usage.reported_output_tokens))
    .toLocaleString("en-GB")+" reported tokens · "+usage.failed_calls+" failures":
   "Groq today · no requests recorded. Shared daily limit: 40 calls / 160,000 estimated tokens."));
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
   `Y${x.year} W${x.week} · ${x.show_name??"Weekly show"} · ${x.editorial_state==="READY"?"AI published":x.editorial_state==="FAILED"?"AI failed":"No AI article"}`] as [string,string]),
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
  const provider=selectControl([
   ["GROQ","Groq · primary free provider"],
   ...(data.openAiPreviewEnabled?[
    ["OPENAI","OpenAI · paid, 2 previews/day"] as [string,string]
   ]:[])
  ],"GROQ");
  const paidNotice=el("p","ppw-admin-small",data.openAiPreviewEnabled?
   "Paid comparison is operator-only and never publishes or replaces articles. OpenAI requests have a separate daily quota.":
   "Paid-provider testing is disabled by default. No OpenAI API calls can be made.");
  const previewBtn=el("button","ppw-admin-secondary","Preview this style") as HTMLButtonElement;
  previewBtn.type="button";
  const previewDisabled=()=>!data.shows.length||
   (provider.value==="GROQ"&&!data.groqConfigured);
  previewBtn.disabled=previewDisabled();
  provider.onchange=()=>{previewBtn.disabled=previewDisabled();};
  const preview=el("article","ppw-admin-preview");preview.hidden=true;
  previewBtn.onclick=async()=>{
   if(busy)return;busy=true;previewBtn.disabled=true;message(aiStatus,"Preparing a one-off preview; no published results will be overwritten.");
   try{
    const out=await request("/api/admin-preview","POST",ctx.csrfToken,{
     showId:latest.value,settings:selectedSettings(),previewProvider:provider.value
    }) as {review:Recap;labRunId?:string;metrics?:{
     durationMs:number;providerCalls:number;inputTokens:number|null;
     outputTokens:number|null}};
    preview.hidden=false;preview.replaceChildren(el("span","ppw-eyebrow","UNPUBLISHED SAMPLE"),
     el("h3","",out.review.showHeadline),el("p","",out.review.opening));
    for(const slot of out.review.slots)
     preview.append(el("h4","",slot.headline),el("p","",slot.recap));
    preview.append(el("p","",out.review.closing));
    message(aiStatus,"Preview saved to your AI Lab. "+
     (out.metrics?out.metrics.providerCalls+" model request(s) · "+
      out.metrics.durationMs+"ms · "+
      (out.metrics.inputTokens===null?"Tokens not reported":
       (out.metrics.inputTokens+(out.metrics.outputTokens??0)).toLocaleString("en-GB")+" tokens")+". ":
      "")+"No World results were changed.");
    labData=null;void loadLab();
   }catch(e){message(aiStatus,e instanceof Error?e.message:"Preview unavailable",true);}
   finally{busy=false;previewBtn.disabled=false;}
  };
  const recover=el("button","ppw-admin-secondary","Retry failed AI report") as HTMLButtonElement;
  recover.type="button";
  const toggleRetry=()=>{
   const entry=data.shows.find(x=>x.show_id===latest.value);
   recover.hidden=entry?.editorial_state!=="FAILED"||entry.editorial_attempts!==2;
  };
  latest.addEventListener("change",toggleRetry);
  toggleRetry();
  recover.onclick=async()=>{
   if(busy||!window.confirm("Re-arm this failed AI article? No published reports or match results will change."))return;
   busy=true;recover.disabled=true;
   try{
    await request("/api/admin","POST",ctx.csrfToken,{
     action:"RETRY_FAILED_RINGSIDE",showId:latest.value});
    message(aiStatus,"Retry authorised. Reopen this completed show in Results to generate a fresh AI article.");
    recover.hidden=true;
   }catch(e){message(aiStatus,e instanceof Error?e.message:"Could not re-arm the article",true);}
   finally{busy=false;recover.disabled=false;}
  };
  studio.append(form,el("p","ppw-admin-small",
   "A saved review keeps its original text. New settings cannot change winners, title changes, injuries or scripted angles."),
   inputField("Try against a completed show",latest),
   inputField("Preview provider",provider),paidNotice,
   previewBtn,recover,aiStatus,preview);
 }
 try{await load();}catch(e){
  const error=el("p","ppw-admin-error",e instanceof Error?e.message:"Admin is unavailable");
  root.append(error);
 }
}
