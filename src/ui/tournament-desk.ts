/** Compact four/eight-person tournament archive in the existing
 * Championships workspace. No new root navigation or client polling.
 */
import {tournamentBoutLabel} from "../domain/tournament-bracket.js";
import type {readTournamentWorkspace,createTournament,cancelTournament}
 from "../db/tournament-workspace.js";
type View=Awaited<ReturnType<typeof readTournamentWorkspace>>;
type Heritage=View["heritage"][number];
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
 const history=el("section","ppw-tournament-heritage");
 history.append(el("h2","","The Tournament Record Book"),
  el("p","ppw-muted","Traditions are earned through completed editions in different World seasons, not bought or awarded for simply creating a draw."));
 if(view.historyTruncated)history.append(el("p","ppw-muted",
  "Showing heritage from the latest 200 tournaments only — older results remain in the World but aren't included in these counts."));
 const hasActive=view.tournaments.some(t=>t.status==="ACTIVE");
 let prepareEdition:(heritage:Heritage)=>void=()=>{};
 for(const heritage of (view.heritage??[]).slice(0,12)){
  const item=el("article","ppw-tournament-legacy");
  item.append(el("span","ppw-eyebrow",heritage.legacy),
   el("h3","",heritage.name),
   el("p","ppw-muted",heritage.division+" · "+heritage.completedEditions+
    (heritage.completedEditions===1?" completed edition":" completed editions")+
    " · "+heritage.seasons+(heritage.seasons===1?" season":" seasons")));
  if(heritage.latestChampion){
   item.append(el("p","ppw-tournament-legacy-winner",
    "Defending tournament winner: "+heritage.latestChampion.name));
   if(heritage.leaders.length){
    const leaders=heritage.leaders.slice(0,3).map(x=>
     x.name+" ("+x.wins+(x.wins===1?" win":" wins")+")");
    item.append(el("p","ppw-muted","Record winners: "+leaders.join(" · ")));
   }
   if(heritage.lastFinalRatingStars!==null)
    item.append(el("p","ppw-muted","Last final: "+
     heritage.lastFinalRatingStars.toFixed(2)+" ★ (verified match rating)"));
  }else item.append(el("p","ppw-muted","First champion still to be crowned."));
  if(view.canEdit&&!hasActive&&heritage.completedEditions>0)
   item.append(button("Plan another edition",()=>prepareEdition(heritage)));
  history.append(item);
 }
 if((view.heritage??[]).length>12)history.append(el("p","ppw-muted",
  "Showing 12 tournament series. Recent brackets are below."));
 if(!view.heritage?.length)history.append(el("p","ppw-muted",
  "Complete a tournament to begin your promotion's record book."));
 root.append(history);
 const archiveTitle=el("h2","ppw-tournament-archive-title","Recent Brackets");
 root.append(archiveTitle);
 for(const t of view.tournaments){
  const card=el("article","ppw-tournament-card");
  card.append(el("span","ppw-eyebrow",
   t.status==="COMPLETE"?"TOURNAMENT COMPLETE":
    t.status==="CANCELLED"?"TOURNAMENT CANCELLED":"TOURNAMENT IN PROGRESS"),
   el("h2","",t.name),
   el("p","ppw-muted","Year "+(Math.floor(t.createdWeekIndex/52)+1)+
    " · "+t.entrantsCount+" wrestlers · "+t.division+
    " · "+(t.championshipName?"Prize: "+t.championshipName:"Tournament honours")));
  const progress=t.bouts.filter(b=>!!b.winnerPersonId).length;
  card.append(el("p","ppw-muted",progress+" / "+t.bouts.length+
   " certified tournament matches"));
  const rounds=t.status==="ACTIVE"?card:
   el("details","ppw-tournament-archived-rounds");
  if(rounds!==card){
   rounds.append(el("summary","","View recorded bracket ("+t.bouts.length+" matches)"));
   card.append(rounds);
  }
  for(const round of Array.from({length:t.entrantsCount-1},(_,i)=>i+1)){
   const bout=t.bouts.find(b=>b.boutNo===round);
   if(!bout)continue;
   const row=el("div","ppw-tournament-bout");
   row.append(el("small","",tournamentBoutLabel(t.entrantsCount,round).toUpperCase()),
    el("strong","",(bout.nameA??(t.entrantsCount===8&&round<7?
      "Awaiting quarterfinal winner":"Awaiting first finalist"))+" vs "+
     (bout.nameB??(t.entrantsCount===8&&round<7?
      "Awaiting quarterfinal winner":"Awaiting second finalist"))),
    el("span","",bout.winnerName?"Winner: "+bout.winnerName:
     bout.showId?"Booked — awaiting certified show":
     bout.personA&&bout.personB?"Ready to book":"Waiting for the semifinals"));
   rounds.append(row);
  }
  if(t.winnerName){
   const finish=t.finalResolvedWeekIndex;
   card.append(el("p","ppw-tournament-winner",
    "🏆 "+t.winnerName+" wins "+t.name+
    (finish!==null?" · Year "+(Math.floor(finish/52)+1):"")));
   if(t.finalRatingStars!==null)card.append(el("p","ppw-muted",
    "Certified final rating: "+t.finalRatingStars.toFixed(2)+" ★"));
  }
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
  root.append(el("p","ppw-muted","No tournament brackets yet. Start with four or eight signed wrestlers."));
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
 prepareEdition=(heritage)=>{
  name.value=heritage.name;
  division.value=heritage.division;
  sizeSelect.value=String(heritage.latestEntrantsCount);
  fill();
  const returning=heritage.latestChampion&&roster.find(p=>
   p.personId===heritage.latestChampion!.personId&&
   p.division===heritage.division);
  if(returning&&seeds[0])seeds[0].value=returning.personId;
  error.textContent=returning?
   "Returning winner selected as Seed 1. Choose the other wrestlers and confirm the new draw.":
   "Previous champion is not currently eligible. Choose all the wrestlers for the new draw.";
  form.scrollIntoView({block:"start",behavior:"smooth"});
 };
 const submit=button("Create tournament",()=>{void(async()=>{
  const entrants=seeds.map(x=>x.value);
  if(name.value.trim().length<3||new Set(entrants).size!==entrants.length||entrants.some(x=>!x)){
   error.textContent="Enter a name and choose four or eight distinct signed wrestlers.";return;
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
