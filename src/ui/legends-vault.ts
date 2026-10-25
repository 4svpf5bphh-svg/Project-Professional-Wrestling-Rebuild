/** Industry Legends Vault: no extra navigation bar or asset fakery.
 * Exact collectible artwork, when cleared, is reused at every size.
 */
import type {readLegendsVault} from "../db/legends-vault.js";
export type LegendsVaultView=Awaited<ReturnType<typeof readLegendsVault>>;
export type LegendsVaultEntry=LegendsVaultView["entries"][number];
export interface LegendsVaultActions{
 showReveal(id:string):void;closeReveal(id:string):void;
 collect(id:string):void;openWrestler?(personId:string):void;
}
const el=(tag:string,css:string,text?:string)=>{
 const n=document.createElement(tag);n.className=css;if(text!==undefined)n.textContent=text;return n;
};
const button=(text:string,cb:()=>void,disabled=false)=>{
 const n=el("button","ppw-legend-button",text) as HTMLButtonElement;
 n.type="button";n.disabled=disabled;n.onclick=cb;return n;
};
const title:Record<string,string>={
 CULT:"Cult / Heritage",LEGEND:"Legend",ICON:"Icon",IMMORTAL:"Immortal"
};
const order=["CULT","LEGEND","ICON","IMMORTAL"];
function cardGraphic(item:LegendsVaultEntry){
 if(!item.cardAsset||!item.unlocked)return null;
 const art=document.createElement("img");
 art.className="ppw-legend-card-art";art.src=item.cardAsset;
 art.alt="Definitive collectible card of "+(item.name??"the legend");
 art.loading="lazy";return art;
}
export function drawLegendsVault(
 target:HTMLElement,view:LegendsVaultView,actions:LegendsVaultActions,revealing:string|null,
){
 target.replaceChildren();
 const mast=el("div","ppw-legend-mast");
 mast.append(el("span","ppw-legend-kicker","WRESTLING HISTORY IS ALIVE"),
  el("h2","","The Legends Vault"),
  el("p","ppw-industry-muted",
   "Greatness is earned by the whole World. Each discovery enters the shared free-agent market. No one receives a contract automatically."),
  el("p","ppw-legend-context",
   view.entries.filter(x=>x.unlocked).length+" discovered · "+
   view.entries.filter(x=>x.collected).length+" cards collected · "+
   view.curated+" historic entries under curation"));
 target.append(mast);
 for(const tier of order){
  const section=el("section","ppw-legend-tier");
  section.dataset.tier=tier;
  const candidates=view.entries.filter(x=>x.tier===tier);
  section.append(el("div","ppw-legend-tier-title",title[tier]??tier),
   el("p","ppw-legend-tier-caption",
    tier==="IMMORTAL"?"The rarest milestones in wrestling history.":
    tier==="ICON"?"Era-defining wrestlers and teams.":
    tier==="LEGEND"?"The figures who shaped the business.":
    "Cult favourites, pioneers and fiercely remembered personalities."));
  const grid=el("div","ppw-legend-grid");
  for(const item of candidates){
   const n=el("article","ppw-legend-tile");
   n.dataset.tier=tier;
   n.dataset.unlocked=String(item.unlocked);
   n.append(el("span","ppw-legend-status",item.unlocked?"DISCOVERED":
    item.visibility==="KNOWN"?"KNOWN CHALLENGE":
    item.visibility==="CLUED"?"LOCKED / MYSTERY":"UNKNOWN"));
   const visual=el("div","ppw-legend-visual");
   const art=cardGraphic(item);
   if(art)visual.append(art);
   else if(!item.unlocked){
    visual.append(el("span","ppw-legend-silhouette","?"));
   }else{
    // Deliberately not a fake collectible card: nothing here is for sale
    // until a real cleared wrestler photograph is supplied.
    visual.append(el("span","ppw-legend-vault-mark","★"),
     el("small","","COLLECTIBLE ART PENDING"));
   }
   n.append(visual,el("h3","",item.name??"Identity shrouded"));
   n.append(el("p","ppw-legend-clue",item.unlocked?
    (item.achievement??"An extraordinary World accomplishment"):item.clue));
   if(item.unlocked){
    n.append(el("p","ppw-legend-provenance",
     "Uncovered · Year "+item.year+" / Week "+item.week));
    n.append(button("Replay the reveal",()=>actions.showReveal(item.id)));
    if(item.collected)n.append(el("span","ppw-legend-owned","IN YOUR COLLECTION"));
    else n.append(button(item.collectibleReady?
     "Collect card · "+item.price.toLocaleString("en-GB")+" KP":
     "Card artwork not yet available",
     ()=>actions.collect(item.id),!item.collectibleReady));
    if(item.personIds.length&&actions.openWrestler)
     n.append(button("View wrestler dossier",()=>actions.openWrestler?.(item.personIds[0]!)));
   }else{
    n.append(el("div","ppw-legend-track"));
    const bar=n.lastElementChild as HTMLElement;
    const fill=el("span","ppw-legend-fill");
    fill.style.width=item.progress+"%";bar.append(fill);
    n.append(el("small","ppw-legend-progress",
     item.exactProgress!==null&&item.target!==null?
      item.exactProgress+" / "+item.target+" · "+item.progress+"%":
      item.progress+"% of the hidden milestone"));
   }
   grid.append(n);
  }
  section.append(grid);target.append(section);
 }
 const selected=view.entries.find(x=>x.id===revealing&&x.unlocked);
 if(selected){
  const veil=el("div","ppw-legend-reveal");
  veil.dataset.tier=selected.tier;
  veil.setAttribute("role","dialog");veil.setAttribute("aria-modal","true");
  veil.setAttribute("aria-label","Legend unlocked: "+selected.name);
  const scene=el("div","ppw-legend-reveal-scene");
  scene.append(el("span","ppw-legend-spotlight","THE WORLD HAS CHANGED"),
   el("span","ppw-legend-reveal-tier",title[selected.tier]??selected.tier),
   el("h2","",selected.name??"A new legend"),
   el("p","",selected.achievement??"Wrestling history has been made."));
  const fullCard=cardGraphic(selected);
  if(fullCard)scene.append(fullCard);
  else scene.append(el("p","ppw-legend-reveal-artnote",
   "The definitive collectible image will appear here after its real photograph is cleared."));
  scene.append(el("p","ppw-legend-market-confirm",
   "NOW AVAILABLE TO EVERY PROMOTION IN THE WORLD TALENT MARKET"));
  if(selected.personIds.length&&actions.openWrestler)
   scene.append(button("View wrestler dossier",()=>actions.openWrestler?.(selected.personIds[0]!)));
  scene.append(button("Continue to the Vault",()=>actions.closeReveal(selected.id)));
  const dismiss=button("Skip reveal",()=>actions.closeReveal(selected.id));
  dismiss.classList.add("ppw-legend-skip");scene.prepend(dismiss);
  veil.append(scene);target.append(veil);
 }
}
