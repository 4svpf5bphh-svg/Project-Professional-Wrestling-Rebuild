/** Industry Legends Vault: no extra navigation bar or asset fakery.
 * One reviewed image asset is used for reveal and private album at every size.
 */
import type {readLegendsVault} from "../db/legends-vault.js";
export type LegendsVaultView=Awaited<ReturnType<typeof readLegendsVault>>;
export type LegendsVaultEntry=LegendsVaultView["entries"][number];
export interface LegendsVaultActions{
 showReveal(id:string):void;closeReveal(id:string):void;
 showCard(id:string):void;closeCard():void;
 collect(id:string):void;openWrestler?(personId:string):void;
 goToMarket?(id:string):void;
 goToDossier?(id:string,personId:string):void;
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
// Source photography and permissions stay recorded in the code manifest.
// The playable reveal and card viewer do not display attribution URLs.
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
  const buttons=Array.from(overlay.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")).filter(b=>!b.closest("[inert]"));
  if(!buttons.length)return;
  const first=buttons[0]!,last=buttons[buttons.length-1]!;
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
 });
 overlay.querySelector<HTMLButtonElement>("button")?.focus({preventScroll:true});
}
function showLegendCardViewer(view:LegendsVaultView,
 actions:Pick<LegendsVaultActions,"showCard"|"closeCard">,
 expandedCard:string|null){
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
  overlay.append(panel);showLegendPortal(overlay);
 }
}

/** Private binder, separate from the shared unlock catalogue.
 * Reuses the authenticated Legends Vault data and permanent KP receipts.
 */
export function drawLegendAlbum(
 target:HTMLElement,view:LegendsVaultView,
 actions:Pick<LegendsVaultActions,"showCard"|"closeCard">,
 expandedCard:string|null=null,onPageChange?:(page:string)=>void,
){
 clearLegendRevealPortal();
 target.replaceChildren();
 const mast=el("header","ppw-legend-mast ppw-collection-mast");
 mast.append(el("span","ppw-legend-kicker","THE PRIVATE COLLECTOR'S CABINET"),
  el("h2","","My Collection"),
  el("p","ppw-industry-muted",
   "Your personal wrestling card album. Every card is yours to keep; it never grants a wrestler contract."));
 const back=document.createElement("a");
 back.className="ppw-legend-button ppw-collection-back";
 back.href="#/industry/legends";back.textContent="Explore the Legends Vault →";
 mast.append(back);target.append(mast);
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
  const tab=button(label,()=>{albumPage=tier;target.dataset.legendAlbumPage=tier;onPageChange?.(tier);renderAlbum();});
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
 showLegendCardViewer(view,actions,expandedCard);
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
 const collectionLink=document.createElement("a");
 collectionLink.className="ppw-legend-button ppw-collection-back";
 collectionLink.href="#/collection";collectionLink.textContent="Open My Collection →";
 target.append(mast,collectionLink);
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
  // Tier-wide ceremonies, never wrestler-specific gimmick effects.
  // These visual transitions do not write any World or wallet state.
  const timelines:Record<string,readonly [number,number,number]>={
   CULT:[250,850,1450],LEGEND:[450,1100,1900],
   ICON:[500,1250,2100],IMMORTAL:[650,1500,2550]
  };
  const cue=timelines[selected.tier]??timelines.LEGEND!;
  // Tier identity belongs outside the card. The wrestler's name is already
  // printed on the definitive card; never repeat it in the ceremony.
  const taglines:Record<string,string>={
   CULT:"The Underground Never Forgets",
   LEGEND:"A Name Etched in History",
   ICON:"Born for the Spotlight",
   IMMORTAL:"A Legacy That Echoes Forever"
  };
  const reduced=window.matchMedia?.("(prefers-reduced-motion: reduce)").matches??false;
  const veil=el("div","ppw-legend-reveal ppw-legend-ceremony");
  veil.dataset.tier=selected.tier;
  veil.dataset.legendId=selected.id;
  veil.dataset.motion=reduced?"reduced":"full";
  veil.dataset.sequence=reduced?"FINALE":"INTRO";
  const set=el("div","ppw-ceremony-set");
  set.setAttribute("aria-hidden","true");
  set.append(el("span","ppw-ceremony-set-left"),
   el("span","ppw-ceremony-set-right"),el("span","ppw-ceremony-set-core"));
  veil.setAttribute("role","dialog");veil.setAttribute("aria-modal","true");
  veil.setAttribute("aria-label","Legend unlocked: "+selected.name);
  const scene=el("div","ppw-legend-reveal-scene ppw-ceremony-scene");
  const skip=button("Skip reveal",()=>actions.closeReveal(selected.id));
  skip.classList.add("ppw-legend-skip");
  // Compact visual label; preserve a descriptive name for screen readers/tests.
  skip.textContent="Skip";
  skip.setAttribute("aria-label","Skip reveal");
  const opener=el("header","ppw-ceremony-opener");
  opener.append(el("strong","ppw-ceremony-headline",selected.tier));
  const identity=el("div","ppw-ceremony-identity");
  identity.append(el("h2","",taglines[selected.tier]??"Wrestling History Lives On"));
  const cardStage=el("div","ppw-ceremony-card-stage");
  const art=cardGraphic(selected);
  if(art){
   // Bundled real cards load eagerly during the short anticipation beat.
   art.loading="eager";art.decoding="async";cardStage.append(art);
  }else cardStage.append(el("p","ppw-legend-reveal-artnote",
   "The definitive collectible image will appear when its artwork has been reviewed."));
  const finale=el("footer","ppw-ceremony-finale");
  finale.inert=!reduced;
  const actionsRow=el("div","ppw-ceremony-actions");
  // Closing via a navigation action still acknowledges the World unlock
  // before leaving the scene; the actual dossier opens from the host.
  if(selected.personIds.length&&actions.goToDossier){
   actionsRow.dataset.hasDossier="true";
   const dossier=button("Wrestler Dossier",
    ()=>actions.goToDossier?.(selected.id,selected.personIds[0]!));
   dossier.setAttribute("aria-label","View wrestler dossier");
   actionsRow.append(dossier);
  }
  if(actions.goToMarket)
   actionsRow.append(button("Talent Market",
    ()=>actions.goToMarket?.(selected.id)));
  const continueButton=button("Continue",()=>actions.closeReveal(selected.id));
  continueButton.setAttribute("aria-label","Continue to the Vault");
  actionsRow.append(continueButton);
  finale.append(actionsRow);
  const announcement=el("span","ppw-ceremony-announcement");
  announcement.setAttribute("role","status");
  announcement.setAttribute("aria-live","polite");
  announcement.textContent=reduced?"Legend unlocked: "+selected.name:"A wrestling legend has been discovered";
  // The art and actual 2:3 card share one coordinate plane. Decorative
  // background tilt is corrected by CSS; the card itself remains upright.
  const stageWrap=el("div","ppw-ceremony-stage-wrap");
  const stageClip=el("div","ppw-ceremony-stage-clip");
  stageWrap.append(set,cardStage);
  stageClip.append(stageWrap);
  scene.append(skip,opener,identity,finale,announcement);
  veil.append(stageClip,scene);
  showLegendPortal(veil);
  if(!reduced){
   const [identifyAt,cardAt,finaleAt]=cue;
   for(const [phase,delay] of [
    ["IDENTITY",identifyAt],["CARD",cardAt],["FINALE",finaleAt]
   ] as const){
    window.setTimeout(()=>{
     if(!veil.isConnected)return; // closing/route change cancels visual progress
     veil.dataset.sequence=phase;
     if(phase==="CARD")announcement.textContent=selected.name+" — collectible card revealed";
     if(phase==="FINALE"){
      finale.inert=false;
      announcement.textContent=selected.name+" is now available in the World Talent Market";
     }
    },delay);
   }
  }
 }
 showLegendCardViewer(view,actions,expandedCard);
}
