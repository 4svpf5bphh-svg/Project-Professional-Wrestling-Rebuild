/** Industry Legends Vault: no extra navigation bar or asset fakery.
 * Exact collectible artwork, when cleared, is reused at every size.
 */
import type {readLegendsVault} from "../db/legends-vault.js";
export type LegendsVaultView=Awaited<ReturnType<typeof readLegendsVault>>;
export type LegendsVaultEntry=LegendsVaultView["entries"][number];
export interface LegendsVaultActions{
 showReveal(id:string):void;closeReveal(id:string):void;
 showCard(id:string):void;closeCard():void;
 collect(id:string):void;openWrestler?(personId:string):void;
 goToMarket?(id:string):void;
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
/** One canonical card composition is reused at every display size.
 * Wrestler photography is NOT AI-generated or retouched into a lookalike.
 * Treat source/photo rights separately from any wrestler likeness rights.
 */
function cardGraphic(item:LegendsVaultEntry){
 if(!item.cardAsset||(!item.unlocked&&!item.collected))return null;
 if(item.id==="undertaker"){
  const art=el("figure","ppw-legend-card-art ppw-undertaker-card");
  art.setAttribute("role","img");
  art.setAttribute("aria-label","The Undertaker — Immortal tier collectible card");
  const photography=document.createElement("img");
  photography.className="ppw-undertaker-photograph";
  photography.src=item.cardAsset;
  photography.alt="";photography.loading="lazy";
  photography.decoding="async";
  art.append(photography,
   el("span","ppw-undertaker-grain"),
   el("span","ppw-undertaker-corner ppw-undertaker-corner-top","✦"),
   el("span","ppw-undertaker-corner ppw-undertaker-corner-bottom","✦"),
   el("span","ppw-undertaker-eyebrow","PPW · LEGENDS COLLECTION"),
   el("span","ppw-undertaker-halo","†"),
   el("span","ppw-undertaker-titles",
    "THE DEADMAN"),
   el("span","ppw-undertaker-name","THE UNDERTAKER"),
   el("span","ppw-undertaker-plate","IMMORTAL  ·  001 / 001"),
   el("span","ppw-undertaker-edition","THE PHENOM  ·  1990s / 2000s"));
  return art;
 }
 const art=document.createElement("img");
 art.className="ppw-legend-card-art";art.src=item.cardAsset;
 art.alt="Definitive collectible card of "+(item.name??"the legend");
 art.loading="lazy";return art;
}
function photoCredit(item:LegendsVaultEntry){
 if(item.id!=="undertaker"||!item.cardAsset)return null;
 const caption=el("p","ppw-legend-photo-credit","Photo: Steve Wright Jr. · ");
 const source=document.createElement("a");
 source.href="https://commons.wikimedia.org/wiki/File:The_Undertaker.jpg";
 source.target="_blank";source.rel="noopener noreferrer";
 source.textContent="CC BY 2.0 · cropped for card";
 caption.append(source);return caption;
}
export function drawLegendsVault(
 target:HTMLElement,view:LegendsVaultView,actions:LegendsVaultActions,revealing:string|null,
 expandedCard:string|null=null,
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
 const owned=view.entries.filter(item=>item.collected);
 const cabinet=el("section","ppw-legend-collection");
 cabinet.append(el("span","ppw-legend-kicker","PERSONAL COLLECTION"),
  el("h3","","My legend cards"),
  el("p","ppw-industry-muted",
   "Your account's permanent collection. Card ownership does not give you the wrestler, contract priority or extra abilities."));
 if(!owned.length)cabinet.append(el("p","ppw-legend-collection-empty",
  "No cards collected yet. After a legend arrives in this World, approved artwork can be added to your personal cabinet with KP."));
 else{
  const shelf=el("div","ppw-legend-collection-shelf");
  for(const item of owned){
   const frame=el("div","ppw-legend-collection-card");
   const art=cardGraphic(item);
   if(art)frame.append(art);
   frame.append(el("strong","",item.name??"Legend"),
    button("Enlarge card",()=>actions.showCard(item.id),!item.cardAsset));
   shelf.append(frame);
  }
  cabinet.append(shelf);
 }
 target.append(cabinet);
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
   const credit=photoCredit(item);if(credit)n.append(credit);
   n.append(el("p","ppw-legend-clue",item.unlocked?
    (item.achievement??"An extraordinary World accomplishment"):item.clue));
   if(item.nextHint&&!item.unlocked)n.append(el("p","ppw-legend-next-hint",
    "NEW CLUE · "+item.nextHint));
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
  if(selected.id==="undertaker")scene.classList.add("ppw-undertaker-reveal-scene");
  const credit=photoCredit(selected);if(credit)scene.append(credit);
  scene.append(el("p","ppw-legend-market-confirm",
   "NOW AVAILABLE TO EVERY PROMOTION IN THE WORLD TALENT MARKET"));
  if(selected.personIds.length&&actions.openWrestler)
   scene.append(button("View wrestler dossier",()=>actions.openWrestler?.(selected.personIds[0]!)));
  if(actions.goToMarket)scene.append(button("Visit the talent market",
   ()=>actions.goToMarket?.(selected.id)));
  scene.append(button("Continue to the Vault",()=>actions.closeReveal(selected.id)));
  const dismiss=button("Skip reveal",()=>actions.closeReveal(selected.id));
  dismiss.classList.add("ppw-legend-skip");scene.prepend(dismiss);
  veil.append(scene);target.append(veil);
 }
 const ownedCard=view.entries.find(x=>x.id===expandedCard&&x.collected&&x.cardAsset);
 if(ownedCard){
  const overlay=el("div","ppw-legend-reveal ppw-legend-card-viewer");
  overlay.dataset.tier=ownedCard.tier;
  overlay.setAttribute("role","dialog");overlay.setAttribute("aria-modal","true");
  overlay.setAttribute("aria-label","Collectible card: "+ownedCard.name);
  const panel=el("div","ppw-legend-reveal-scene");
  panel.append(button("Close card",actions.closeCard),
   el("h2","",ownedCard.name??"Legend"));
  const art=cardGraphic(ownedCard);if(art)panel.append(art);
  const credit=photoCredit(ownedCard);if(credit)panel.append(credit);
  overlay.append(panel);target.append(overlay);
 }
}
