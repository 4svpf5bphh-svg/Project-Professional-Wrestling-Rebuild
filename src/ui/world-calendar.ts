import type {ShowSeries,ShowRole} from "../domain/show-calendar.js";
export interface CalendarPort{
 load():Promise<{promotionName:string;year:number;week:number;worldRevision:number;
 canEdit:boolean;series:ShowSeries[];weeks:{year:number;week:number;offset:number;shows:ShowSeries[]}[];
 worldWeeks?:{year:number;week:number;offset:number;events:{
 promotionId:string;promotionName:string;seriesId:string;name:string;
 role:ShowRole;eventType:string;importance:number}[]}[]}>;
 save(input:{requestId:string;expectedRevision:number;series:ShowSeries}):Promise<unknown>;
 archive(input:{requestId:string;expectedRevision:number;seriesId:string}):Promise<unknown>;
}
const node=(tag:string,text="",css="")=>{
 const el=document.createElement(tag);el.textContent=text;el.className=css;return el;};
const label=(role:ShowRole)=>role==="FLAGSHIP"?"A show · Flagship":
 role==="SECONDARY"?"B show · Secondary":role==="DEVELOPMENTAL"?"Developmental":
 role==="PREMIUM"?"Premium PPV":"Special / PPV";
export function mountWorldCalendar(root:HTMLElement,port:CalendarPort,back:()=>void){
 let data:Awaited<ReturnType<CalendarPort["load"]>>|null=null;
 let editing:ShowSeries|null=null,busy=false,error="",expanded=false;
 let mode:"mine"|"world"="mine",ppvOnly=false;
 function button(name:string,click:()=>void,disabled=false){
  const b=node("button",name,"ppw-calendar-button") as HTMLButtonElement;
  b.type="button";b.disabled=disabled;b.onclick=click;return b;
 }
 function field(name:string,control:HTMLElement){
  const f=node("label","","ppw-calendar-field");
  f.append(node("span",name),control);return f;
 }
 async function load(){
  busy=true;render();
  try{data=await port.load();error="";}catch(e){error=e instanceof Error?e.message:"Calendar unavailable";}
  finally{busy=false;render();}
 }
 async function change(archiveId?:string){
  if(!data||busy||(!archiveId&&!editing))return;
  busy=true;render();
  try{
   const shared={requestId:crypto.randomUUID(),expectedRevision:data.worldRevision};
   const result=archiveId?
    await port.archive({...shared,seriesId:archiveId}):
    await port.save({...shared,series:editing!});
   if(result&&typeof result==="object"&&"status" in result&&
    result.status==="STALE"){
    data=await port.load();
    throw new Error("World changed. Review your calendar and save again.");
   }
   data=await port.load();editing=null;error="";
  }catch(e){error=e instanceof Error?e.message:"Calendar change failed";}
  finally{busy=false;render();}
 }
 function form(){
  const s=editing!,section=node("section","","ppw-calendar-form");
  section.append(node("h2",s.seriesId==="NEW"?"Create recurring event":"Edit recurring event"));
  const name=document.createElement("input");name.type="text";name.maxLength=80;name.value=s.name;
  name.oninput=()=>{s.name=name.value;};section.append(field("Event name",name));
  const role=document.createElement("select");
  const roles:ShowRole[]=s.role==="FLAGSHIP"?["FLAGSHIP"]:
   ["SECONDARY","DEVELOPMENTAL","SPECIAL","PREMIUM"];
  for(const value of roles){
   const option=document.createElement("option");option.value=value;option.textContent=label(value);
   role.append(option);
  }
  role.value=s.role;role.onchange=()=>{
   s.role=role.value as ShowRole;
   s.eventType=["SPECIAL","PREMIUM"].includes(s.role)?"MAJOR":"REGULAR";
  };
  section.append(field("Event type",role));
  for(const [name,key,min,max] of [
   ["Repeat every N weeks (52 = annually)","cadenceWeeks",1,260],
   ["Recurrence offset (0 = first week)","anchorWeek",0,259],
   ["Importance (1–100)","importance",1,100]
  ] as const){
   const input=document.createElement("input");input.type="number";
   input.min=String(min);input.max=String(max);input.step="1";input.value=String(s[key]);
   input.oninput=()=>{s[key]=Number(input.value);};
   section.append(field(name,input));
  }
  section.append(button("Save event",()=>void change(),busy),
   button("Cancel",()=>{editing=null;render();},busy));
  return section;
 }
 function render(){
  root.replaceChildren();root.classList.add("ppw-world-calendar");
  const head=node("header","","ppw-calendar-header");
  head.append(button("← Planner",back),node("h1","Show Calendar"),
   node("p","Recurring A/B shows, specials and premium events."));
  root.append(head);
  if(error)root.append(node("p",error,"ppw-calendar-error"));
  if(!data){root.append(button(busy?"Loading…":"Retry",()=>void load(),busy));return;}
  root.append(node("p",data.promotionName+" · Year "+data.year+" Week "+data.week));
  const manage=node("section","","ppw-calendar-panel");
  manage.append(node("h2","My recurring events"));
  manage.append(button("+ Add event",()=>{
   editing={seriesId:"NEW",name:"",role:"SPECIAL",eventType:"MAJOR",
    cadenceWeeks:52,anchorWeek:data!.week-1,importance:85,active:true};render();
  },!data.canEdit||busy));
  for(const s of data.series){
   const line=node("div","","ppw-calendar-series");
   const description=node("div");description.append(node("strong",s.name),
    node("p",label(s.role)+" · Every "+s.cadenceWeeks+" weeks · Importance "+s.importance));
   line.append(description,
    button("Edit",()=>{editing={...s};render();},!data.canEdit||busy));
   if(s.role!=="FLAGSHIP")line.append(button("Archive",()=>{
    if(window.confirm("Archive "+s.name+"?"))void change(s.seriesId);
   },!data.canEdit||busy));
   manage.append(line);
  }
  if(editing)manage.append(form());
  root.append(manage);
  const upcoming=node("section","","ppw-calendar-panel");
  upcoming.append(node("h2","Upcoming weeks"));
  upcoming.append(button("My shows",()=>{mode="mine";render();},mode==="mine"),
   button("Across the World",()=>{mode="world";render();},mode==="world"));
  if(mode==="mine"){
   upcoming.append(button("All events",()=>{ppvOnly=false;render();},!ppvOnly),
    button("PPVs & specials",()=>{ppvOnly=true;render();},ppvOnly));
   for(const w of (ppvOnly?data.weeks:data.weeks.slice(0,expanded?52:12))){
    const shows=ppvOnly?w.shows.filter(s=>s.eventType==="MAJOR"):w.shows;
    if(!shows.length)continue;
    const article=node("article","","ppw-calendar-occurrence");
    article.append(node("strong","Year "+w.year+" · Week "+w.week));
    for(const s of shows)article.append(node("p",s.name+" · "+label(s.role)));
    upcoming.append(article);
   }
   if(!ppvOnly)upcoming.append(button(expanded?"Show fewer weeks":"View full 52-week year",()=>{
    expanded=!expanded;render();
   }));
  }else{
   upcoming.append(node("p","Public event identities only; rival venues and unfinished cards remain private."));
   for(const w of data.worldWeeks??[]){
    if(!w.events.length)continue;
    const article=node("article","","ppw-calendar-occurrence");
    article.append(node("strong","Year "+w.year+" · Week "+w.week));
    for(const e of w.events)article.append(node("p",
     e.promotionName+" · "+e.name+" · "+label(e.role)));
    upcoming.append(article);
   }
  }
  root.append(upcoming);
 }
 void load();
}
