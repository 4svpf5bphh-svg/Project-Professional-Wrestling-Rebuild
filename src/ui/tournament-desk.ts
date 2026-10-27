/** Compact four-person single-elimination hub in the existing
 * Championships workspace. No new root navigation or client polling.
 */
import type {readTournamentWorkspace,createTournament}
 from "../db/tournament-workspace.js";
type View=Awaited<ReturnType<typeof readTournamentWorkspace>>;
type Result=Awaited<ReturnType<typeof createTournament>>;
export interface TournamentPort{
 loadTournaments():Promise<View>;
 createTournament(input:{requestId:string;expectedRevision:number;
  name:string;division:"MEN"|"WOMEN";entrants:string[];
  championshipId:string|null}):Promise<Result>;
}
const el=(tag:string,cls="",value="")=>{
 const node=document.createElement(tag);
 node.className=cls;node.textContent=value;return node;
};
const button=(label:string,click:()=>void)=>{
 const x=el("button","ppw-title-back",label) as HTMLButtonElement;
 x.type="button";x.onclick=click;return x;
};
export async function mountTournamentDesk(root:HTMLElement,
 port:TournamentPort,onBack:()=>void){
 root.classList.add("ppw-editor","ppw-tournament-desk");
 root.replaceChildren(el("p","ppw-muted","Opening your tournament brackets…"));
 let view:View;
 try{view=await port.loadTournaments();}
 catch(e){root.replaceChildren(button("← Championships",onBack),
  el("p","ppw-alert ppw-error",e instanceof Error?e.message:"Unable to load tournaments"));return;}
 const head=el("header","ppw-title-hero");
 head.append(button("← Championships",onBack),
  el("span","ppw-eyebrow","MY PROMOTION / TOURNAMENTS"),
  el("h1","","The Road to the Final"),
  el("p","ppw-muted","Book the matches on your ordinary shows. Winners advance only after certified results."));
 root.replaceChildren(head);
 for(const t of view.tournaments){
  const card=el("article","ppw-tournament-card");
  card.append(el("span","ppw-eyebrow",
   t.status==="COMPLETE"?"TOURNAMENT COMPLETE":"TOURNAMENT IN PROGRESS"),
   el("h2","",t.name),
   el("p","ppw-muted",t.division+" · "+(t.championshipName?
    "Prize: "+t.championshipName:"Tournament honours")));
  for(const round of [1,2,3]){
   const bout=t.bouts.find(b=>b.boutNo===round);
   if(!bout)continue;
   const row=el("div","ppw-tournament-bout");
   row.append(el("small","",round===1?"SEMI FINAL 1":
    round===2?"SEMI FINAL 2":"THE FINAL"),
    el("strong","",(bout.nameA??"Awaiting first finalist")+" vs "+
     (bout.nameB??"Awaiting second finalist")),
    el("span","",bout.winnerName?"Winner: "+bout.winnerName:
     bout.showId?"Booked — awaiting certified show":
     bout.personA&&bout.personB?"Ready to book":"Waiting for the semifinals"));
   card.append(row);
  }
  if(t.winnerName)card.append(el("p","ppw-tournament-winner",
   "🏆 "+t.winnerName+" wins "+t.name));
  root.append(card);
 }
 if(!view.tournaments.length)
  root.append(el("p","ppw-muted","No tournament history yet. Start with four signed wrestlers."));
 if(!view.canEdit||view.tournaments.some(t=>t.status==="ACTIVE"))return;
 const roster=view.roster;
 const form=el("section","ppw-tournament-create");
 form.append(el("h2","","Create a four-person tournament"),
  el("p","ppw-muted","Seed 1 faces Seed 4, and Seed 2 faces Seed 3. The final is decided after both semifinals. Only one active tournament per promotion."));
 const name=document.createElement("input");
 name.type="text";name.maxLength=64;name.placeholder="Tournament name";
 name.setAttribute("aria-label","Tournament name");
 const division=document.createElement("select");
 division.setAttribute("aria-label","Tournament division");
 for(const d of ["MEN","WOMEN"] as const){
  const o=document.createElement("option");o.value=d;o.textContent=d==="MEN"?"Men's singles":"Women's singles";
  division.append(o);
 }
 const seeds=Array.from({length:4},(_,i)=>{
  const select=document.createElement("select");
  select.setAttribute("aria-label","Seed "+(i+1));
  return select;
 });
 const belt=document.createElement("select");
 belt.setAttribute("aria-label","Vacant championship prize");
 belt.append(new Option("Tournament honours (non-title)",""));
 for(const b of view.vacantTitles)belt.append(new Option(b.name,b.championshipId));
 const fill=()=>{
  const choices=roster.filter(p=>p.division===division.value);
  for(let i=0;i<4;i++){
   const old=seeds[i]!.value;
   seeds[i]!.replaceChildren(new Option("Seed "+(i+1)+" · Choose wrestler",""));
   for(const p of choices)seeds[i]!.append(new Option(p.name,p.personId));
   seeds[i]!.value=choices.some(p=>p.personId===old)?old:"";
  }
 };
 division.onchange=fill;fill();
 const error=el("p","ppw-alert");
 const submit=button("Create tournament",()=>{void(async()=>{
  const entrants=seeds.map(x=>x.value);
  if(name.value.trim().length<3||new Set(entrants).size!==4||entrants.some(x=>!x)){
   error.textContent="Enter a name and choose four different signed wrestlers.";return;
  }
  submit.disabled=true;error.textContent="";
  try{
   await port.createTournament({requestId:crypto.randomUUID(),
    expectedRevision:view.worldRevision,name:name.value.trim(),
    division:division.value as "MEN"|"WOMEN",entrants,
    championshipId:belt.value||null});
   await mountTournamentDesk(root,port,onBack);
  }catch(e){
   error.textContent=e instanceof Error?e.message:"Unable to create tournament";
   submit.disabled=false;
  }
 })();});
 form.append(name,division,...seeds,belt,submit,error);
 root.append(form);
}
