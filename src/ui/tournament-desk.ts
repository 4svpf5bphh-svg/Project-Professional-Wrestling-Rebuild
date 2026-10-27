/** Compact four-person single-elimination hub in the existing
 * Championships workspace. No new root navigation or client polling.
 */
import {tournamentBoutLabel} from "../domain/tournament-bracket.js";
import type {readTournamentWorkspace,createTournament,cancelTournament}
 from "../db/tournament-workspace.js";
type View=Awaited<ReturnType<typeof readTournamentWorkspace>>;
type Result=Awaited<ReturnType<typeof createTournament>>;
type CancelResult=Awaited<ReturnType<typeof cancelTournament>>;
export interface TournamentPort{
 loadTournaments():Promise<View>;
 createTournament(input:{requestId:string;expectedRevision:number;
  name:string;division:"MEN"|"WOMEN";entrants:string[];
  championshipId:string|null}):Promise<Result>;
 cancelTournament(input:{requestId:string;expectedRevision:number;
  tournamentId:string}):Promise<CancelResult>;
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
   t.status==="COMPLETE"?"TOURNAMENT COMPLETE":
    t.status==="CANCELLED"?"TOURNAMENT CANCELLED":"TOURNAMENT IN PROGRESS"),
   el("h2","",t.name),
   el("p","ppw-muted",t.division+" · "+(t.championshipName?
    "Prize: "+t.championshipName:"Tournament honours")));
  for(const round of Array.from({length:t.entrantsCount-1},(_,i)=>i+1)){
   const bout=t.bouts.find(b=>b.boutNo===round);
   if(!bout)continue;
   const row=el("div","ppw-tournament-bout");
   row.append(el("small","",tournamentBoutLabel(t.entrantsCount,round).toUpperCase()),
    el("strong","",(bout.nameA??"Awaiting first finalist")+" vs "+
     (bout.nameB??"Awaiting second finalist")),
    el("span","",bout.winnerName?"Winner: "+bout.winnerName:
     bout.showId?"Booked — awaiting certified show":
     bout.personA&&bout.personB?"Ready to book":"Waiting for the semifinals"));
   card.append(row);
  }
  if(t.winnerName)card.append(el("p","ppw-tournament-winner",
   "🏆 "+t.winnerName+" wins "+t.name));
  if(t.status==="ACTIVE"&&view.canEdit){
   const cancel=button("Cancel tournament",()=>{void(async()=>{
    if(!window.confirm("Cancel this tournament? Certified results stay on record. First remove unfinished tournament matches from planned cards."))return;
    cancel.disabled=true;
    try{
     await port.cancelTournament({requestId:crypto.randomUUID(),
      expectedRevision:view.worldRevision,tournamentId:t.tournamentId});
     await mountTournamentDesk(root,port,onBack);
    }catch(e){
     cancel.disabled=false;
     card.append(el("p","ppw-alert ppw-error",
      e instanceof Error?e.message:"Unable to cancel this tournament"));
    }
   })();});
   card.append(cancel);
  }
  root.append(card);
 }
 if(!view.tournaments.length)
  root.append(el("p","ppw-muted","No tournament history yet. Start with four or eight signed wrestlers."));
 if(!view.canEdit||view.tournaments.some(t=>t.status==="ACTIVE"))return;
 const roster=view.roster;
 const form=el("section","ppw-tournament-create");
 form.append(el("h2","","Create a singles tournament"),
  el("p","ppw-muted","Choose a four- or eight-person seeded draw. The final opens only after certified wins in both semifinals. One active tournament per promotion."));
 const name=document.createElement("input");
 name.type="text";name.maxLength=64;name.placeholder="Tournament name";
 name.setAttribute("aria-label","Tournament name");
 const division=document.createElement("select");
 division.setAttribute("aria-label","Tournament division");
 for(const d of ["MEN","WOMEN"] as const){
  const o=document.createElement("option");o.value=d;o.textContent=d==="MEN"?"Men's singles":"Women's singles";
  division.append(o);
 }
 const sizeSelect=document.createElement("select");
 sizeSelect.setAttribute("aria-label","Draw size");
 sizeSelect.append(new Option("Four wrestlers · 3 matches","4"),
  new Option("Eight wrestlers · 7 matches","8"));
 const seedGrid=el("div","ppw-tournament-seeds");
 let seeds:HTMLSelectElement[]=[];
 const belt=document.createElement("select");
 belt.setAttribute("aria-label","Vacant championship prize");
 belt.append(new Option("Tournament honours (non-title)",""));
 for(const b of view.vacantTitles)belt.append(new Option(b.name,b.championshipId));
 const fill=()=>{
  const old=seeds.map(x=>x.value);
  const n=Number(sizeSelect.value);
  const choices=roster.filter(p=>p.division===division.value);
  seeds=Array.from({length:n},(_,i)=>{
   const select=document.createElement("select");
   select.setAttribute("aria-label","Seed "+(i+1));
   select.append(new Option("Seed "+(i+1)+" · Choose wrestler",""));
   for(const p of choices)select.append(new Option(p.name,p.personId));
   select.value=choices.some(p=>p.personId===old[i])?old[i]!:"";
   return select;
  });
  seedGrid.replaceChildren(...seeds);
 };
 division.onchange=fill;sizeSelect.onchange=fill;fill();
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
 form.append(name,sizeSelect,division,seedGrid,belt,submit,error);
 root.append(form);
}
