/** Industry Legends Vault: no extra navigation bar or asset fakery.
 * One reviewed image asset is used for both reveal and collectible at every size.
 */
import type {readLegendsVault} from "../db/legends-vault.js";
import {LEGEND_CARD_PHOTO_CREDITS} from "../content/legend-card-photo-credits.js";
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
  const art=document.createElement("img");
  art.className="ppw-legend-card-art ppw-undertaker-card";
  art.src=item.cardAsset;
  art.alt="The Undertaker — definitive Immortal legend card, number 001";
  art.loading="lazy";art.decoding="async";
  return art;
 }
 const art=document.createElement("img");
 art.className="ppw-legend-card-art";art.src=item.cardAsset;
 art.alt="Definitive collectible card of "+(item.name??"the legend");
 art.loading="lazy";return art;
}
function photoCredit(item:LegendsVaultEntry){
 if(!item.cardAsset)return null;
 const credit=LEGEND_CARD_PHOTO_CREDITS[item.id];
 if(!credit)return null;
 const caption=el("p","ppw-legend-photo-credit","Photo: "+credit.author+" · ");
 const source=document.createElement("a");
 source.href=credit.sourcePage;
 source.target="_blank";source.rel="noopener noreferrer";
 source.textContent=credit.license+" · cropped for card";
 caption.append(source);return caption;
}
/** The reveal is portalled out of animated workspace ancestors.
 * Cleanup is shared with route changes so no modal can outlive its screen. */
export function clearLegendRevealPortal(){
 document.querySelectorAll("body > .ppw-legend-reveal").forEach(node=>node.remove());
 document.documentElement.classList.remove("ppw-legend-modal-open");
}
function showLegendPortal(overlay:HTMLElement){
 document.body.append(overlay);
 document.documentElement.classList.add("ppw-legend-modal-open");
 overlay.scrollTop=0;
 overlay.addEventListener("keydown",event=>{
  if(event.key!=="Tab")return;
  const buttons=Array.from(overlay.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
  if(!buttons.length)return;
  const first=buttons[0]!,last=buttons[buttons.length-1]!;
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
 });
 overlay.querySelector<HTMLButtonElement>("button")?.focus({preventScroll:true});
}
export function drawLegendsVault(
 target:HTMLElement,view:LegendsVaultView,actions:LegendsVaultActions,revealing:string|null,
 expandedCard:string|null=null,
){
 clearLegendRevealPortal();
 target.replaceChildren();
 const mast=el("div","ppw-legend-mast");
 mast.append(el("span","ppw-legend-kicker","WRESTLING HISTORY IS ALIVE"),
  el("h2","","The Legends Vault"),
  el("p","ppw-industry-muted",
   "Greatness is earned by the whole World. Each discovery enters the shared free-agent market. No one receives a contract automatically."),
  el("p","ppw-legend-context",
   view.entries.filter(x=>x.unlocked).length+" discovered · "+
   view.entries.filter(x=>x.collected).length+" cards collected · "+
   view.curated+" historic legends catalogued"),
  el("p","ppw-legend-context",
   "At most one ordinary Legend enters the World every three certified weeks. Higher tiers take longer to emerge, even once a milestone is earned."));
 target.append(mast);
 const owned=view.entries.filter(item=>item.collected);
 const cabinet=el("section","ppw-legend-collection ppw-album");
 cabinet.append(el("span","ppw-legend-kicker","PERSONAL COLLECTIBLE ALBUM"),
  el("h3","","My Legend Cards"),
  el("p","ppw-industry-muted",
   "One permanent card per Legend. Collecting artwork never signs the wrestler or changes their abilities."));
 const headline=el("div","ppw-album-headline");
 headline.append(el("strong","ppw-album-count",
   owned.length+" / "+view.entries.length+" COLLECTED"),
  el("span","ppw-album-progress-text",
   Math.round(owned.length/Math.max(1,view.entries.length)*100)+"% complete"));
 cabinet.append(headline);
 const meter=el("div","ppw-album-progress");
 meter.setAttribute("role","progressbar");
 meter.setAttribute("aria-label","Legend card collection progress");
 meter.setAttribute("aria-valuenow",String(owned.length));
 meter.setAttribute("aria-valuemax",String(view.entries.length));
 meter.setAttribute("aria-valuemin","0");
 const ink=el("span","ppw-album-progress-ink");
 ink.style.width=(owned.length/Math.max(1,view.entries.length)*100)+"%";meter.append(ink);
 cabinet.append(meter);
 const pages=el("nav","ppw-album-pages");
 pages.setAttribute("aria-label","Card album pages");
 const book=el("div","ppw-album-book");
 let albumPage=target.dataset.legendAlbumPage??"ALL";
 const pageLabels:readonly [string,string][]=[
  ["ALL","All pages"],["CULT","Cult"],["LEGEND","Legends"],
  ["ICON","Icons"],["IMMORTAL","Immortals"],["OWNED","Collected"]];
 const pageButtons=new Map<string,HTMLButtonElement>();
 for(const [tier,label] of pageLabels){
  const tab=button(label,()=>{albumPage=tier;target.dataset.legendAlbumPage=tier;renderAlbum();});
  tab.classList.add("ppw-album-page-button");
  pages.append(tab);pageButtons.set(tier,tab);
 }
 function renderAlbum(){
  book.replaceChildren();
  for(const [name,tab] of pageButtons)
   tab.setAttribute("aria-pressed",String(name===albumPage));
  const entries=view.entries.filter(entry=>albumPage==="ALL"||
   albumPage==="OWNED"&&entry.collected||entry.tier===albumPage);
  if(!entries.length){
   book.append(el("p","ppw-legend-collection-empty",
    "Your album is empty on this page. Collect an unlocked Legend with KP to fill a slot."));
   return;
  }
  // A single stable index for the whole collection; rarity pages reuse it.
  for(const item of entries){
   const slot=el("article","ppw-album-slot");
   slot.dataset.tier=item.tier;
   slot.dataset.collected=String(item.collected);
   const ordinal=view.entries.indexOf(item)+1;
   slot.append(el("span","ppw-album-slot-number",
    "NO. "+String(ordinal).padStart(3,"0")+" · "+item.tier));
   if(item.collected){
    const art=cardGraphic(item);
    if(art)slot.append(art);
    else slot.append(el("div","ppw-album-silhouette","★"));
    slot.append(el("strong","ppw-album-slot-name",item.name??"Collected Legend"));
    slot.append(button("View card",()=>actions.showCard(item.id),!item.cardAsset));
   }else{
    slot.append(el("div","ppw-album-silhouette","?"));
    slot.append(el("strong","ppw-album-slot-name",
     item.unlocked?item.name??"Legend awaiting collection":"Undiscovered"));
    slot.append(el("small","ppw-album-slot-status",
     item.unlocked?"UNLOCKED · CARD NOT COLLECTED":"MYSTERY CARD"));
   }
   book.append(slot);
  }
 }
 if(!pageButtons.has(albumPage))albumPage="ALL";
 cabinet.append(pages,book);renderAlbum();
 target.append(cabinet);
 // Large rosters must be scannable on iPhone without losing mystery or tier context.
 // Filter state survives a redraw, but remains local to this Vault, not in Neon.
 const controls=el("nav","ppw-legend-filters");
 controls.setAttribute("aria-label","Filter Legends by tier or discovery");
 let filter=target.dataset.legendFilter??"ALL";
 const filters=[["ALL","All ("+view.entries.length+")"],
  ["LOCKED","Locked ("+view.entries.filter(x=>!x.unlocked).length+")"],
  ["DISCOVERED","Discovered ("+view.entries.filter(x=>x.unlocked).length+")"],
  ...order.map(t=>[t,title[t]??t])] as const;
 const buttons=new Map<string,HTMLButtonElement>();
 const applyFilter=()=>{
  let visibleCount=0;
  target.querySelectorAll<HTMLElement>(".ppw-legend-tier").forEach(section=>{
   let sectionVisible=0;
   section.querySelectorAll<HTMLElement>(".ppw-legend-tile").forEach(tile=>{
    const shown=(filter==="ALL"||filter===section.dataset.tier||
     filter==="DISCOVERED"&&tile.dataset.unlocked==="true"||
     filter==="LOCKED"&&tile.dataset.unlocked==="false");
    tile.hidden=!shown;
    if(shown)sectionVisible++;
   });
   section.hidden=sectionVisible===0;
   visibleCount+=sectionVisible;
  });
  for(const [key,b] of buttons)b.setAttribute("aria-pressed",String(filter===key));
  const noMatches=target.querySelector<HTMLElement>(".ppw-legend-filter-empty");
  if(noMatches)noMatches.hidden=visibleCount!==0;
 };
 for(const [key,label] of filters){
  const b=button(label,()=>{
   filter=key;target.dataset.legendFilter=key;applyFilter();
  });
  b.classList.add("ppw-legend-filter-button");
  controls.append(b);buttons.set(key,b);
 }
 target.append(controls);
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
   n.dataset.tier=tier;n.dataset.legendId=item.id;
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
    // until its selected authentic wrestler photograph is rendered and reviewed.
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
    else{
     const balance=view.balance??0;
     if(item.collectibleReady){
      n.append(el("p","ppw-legend-price",
       "Your balance: "+balance.toLocaleString("en-GB")+" KP · Card: "+
        item.price.toLocaleString("en-GB")+" KP"));
      n.append(button("Preview collectible",()=>actions.showCard(item.id)));
      if(balance<item.price)n.append(el("p","ppw-legend-shortfall",
       "Earn "+(item.price-balance).toLocaleString("en-GB")+" more KP to collect this card."));
     }
     n.append(button(item.collectibleReady?
      "Collect card · "+item.price.toLocaleString("en-GB")+" KP":
      "Card artwork not yet available",
      ()=>actions.collect(item.id),!item.collectibleReady||balance<item.price));
    }
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
    if(item.challengeReady)n.append(el("p","ppw-legend-pending",
     "Milestone complete — awaiting the next eligible World reveal. No contract has been granted."));
   }
   grid.append(n);
  }
  section.append(grid);target.append(section);
 }
 const noMatches=el("p","ppw-legend-filter-empty",
  "No legends in this group yet. Choose another filter to explore the Vault.");
 noMatches.hidden=true;target.append(noMatches);
 if(!buttons.has(filter))filter="ALL";
 applyFilter();
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
   "The definitive collectible image will appear here when its photo design has been reviewed."));
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
  veil.append(scene);showLegendPortal(veil);
 }
 const ownedCard=view.entries.find(x=>x.id===expandedCard&&x.unlocked&&x.cardAsset);
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
  overlay.append(panel);showLegendPortal(overlay);
 }
}
