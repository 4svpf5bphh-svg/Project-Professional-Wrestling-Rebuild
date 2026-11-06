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
 const current=view.entries.find(x=>x.id===expandedCard&&x.unlocked&&x.cardAsset);
 if(!current)return;
 const owned=view.entries.filter(x=>x.collected&&x.unlocked&&x.cardAsset);
 const index=current.collected?owned.findIndex(x=>x.id===current.id):-1;
 const prior=index>0?owned[index-1]:null,after=index>=0?owned[index+1]:null;
 const overlay=el("div","ppw-legend-reveal ppw-legend-card-viewer");
 overlay.dataset.tier=current.tier;
 overlay.setAttribute("role","dialog");overlay.setAttribute("aria-modal","true");
 overlay.setAttribute("aria-label","Collectible card: "+current.name);
 const panel=el("div","ppw-legend-reveal-scene ppw-album-viewer-panel");
 panel.append(button("Close card",actions.closeCard),
  el("span","ppw-album-viewer-kicker",current.tier+" · "+
   (index>=0?"COLLECTED":"PREVIEW")));
 const art=cardGraphic(current);
 if(art){art.loading="eager";panel.append(art);}
 if(index>=0&&owned.length>1){
  const nav=el("nav","ppw-album-viewer-nav");
  nav.setAttribute("aria-label","Browse collected cards");
  nav.append(button("Previous card",()=>{if(prior)actions.showCard(prior.id);},!prior),
   el("span","ppw-album-viewer-index",(index+1)+" / "+owned.length),
   button("Next card",()=>{if(after)actions.showCard(after.id);},!after));
  panel.append(nav);
 }
 overlay.append(panel);
 overlay.addEventListener("keydown",e=>{
  if(e.key==="Escape"){e.preventDefault();actions.closeCard();}
  else if(e.key==="ArrowLeft"&&prior){e.preventDefault();actions.showCard(prior.id);}
  else if(e.key==="ArrowRight"&&after){e.preventDefault();actions.showCard(after.id);}
 });
 showLegendPortal(overlay);
}
export interface LegendAlbumState {
 page:string;query:string;sort:"CATALOGUE"|"OWNED_FIRST"|"NAME";sheet:number;
}
const ALBUM_PAGE_SIZE=12;
/** Private cabinet: one Vault read, no additional reads, writes or polling.
 * Pages, local searches and rarity browsing are entirely in-memory. */
export function drawLegendAlbum(
 target:HTMLElement,view:LegendsVaultView,
 actions:Pick<LegendsVaultActions,"showCard"|"closeCard">,
 expandedCard:string|null=null,onPageChange?:(page:string)=>void,
 preferences?:LegendAlbumState,onPreferences?:(state:LegendAlbumState)=>void,
){
 clearLegendRevealPortal();target.replaceChildren();
 const mast=el("header","ppw-legend-mast ppw-collection-mast");
 mast.append(el("span","ppw-legend-kicker","YOUR PERMANENT LEGENDS ALBUM"),
  el("h2","","My Collection"));
 const back=document.createElement("a");
 back.className="ppw-legend-button ppw-collection-back";
 back.href="#/industry/legends";back.textContent="Legends Vault";
 back.setAttribute("aria-label","Explore Legends Vault");
 const history=document.createElement("a");
 history.className="ppw-legend-button ppw-collection-back";
 history.href="#/records";history.textContent="World Records";
 history.setAttribute("aria-label","World Record Book");
 mast.append(back,history);target.append(mast);
 const owned=view.entries.filter(x=>x.collected);
 const cabinet=el("section","ppw-legend-collection ppw-album");
 // The page title above is the heading; don't duplicate it in the cabinet.
 const headline=el("div","ppw-album-headline");
 headline.append(el("strong","ppw-album-count",
  owned.length+" / "+view.entries.length+" COLLECTED"),
  el("span","ppw-album-progress-text",
  Math.round(owned.length/Math.max(1,view.entries.length)*100)+"% complete"));
 const meter=el("div","ppw-album-progress");
 meter.setAttribute("role","progressbar");
 meter.setAttribute("aria-label","Legend card collection progress");
 meter.setAttribute("aria-valuenow",String(owned.length));
 meter.setAttribute("aria-valuemin","0");
 meter.setAttribute("aria-valuemax",String(view.entries.length));
 const fill=el("span","ppw-album-progress-ink");
 fill.style.width=(owned.length/Math.max(1,view.entries.length)*100)+"%";
 meter.append(fill);cabinet.append(headline,meter);
 // Put genuine owned cards before filters, especially on a 320px iPhone.
 // The shelf is a limited view of the SAME current-world KP receipts.
 // Mystery entries and cards not yet owned never appear in this highlight.
 const highlights=el("section","ppw-album-highlights");
 highlights.setAttribute("aria-label","Collected card highlights");
 const highlightTitle=el("h3","ppw-album-highlights-title","Your Cards");
 const highlightRail=el("div","ppw-album-highlights-rail");
 highlightRail.setAttribute("role","group");
 highlightRail.setAttribute("aria-label","Swipe through your collected cards");
 highlightRail.tabIndex=0;
 for(const item of owned.filter(x=>x.unlocked&&x.cardAsset).slice(0,4)){
  const tile=button("",()=>actions.showCard(item.id));
  tile.classList.add("ppw-album-highlight-card");
  tile.dataset.legendId=item.id;tile.dataset.tier=item.tier;
  tile.setAttribute("aria-label","View "+(item.name??"Legend")+" collectible card");
  const art=cardGraphic(item);
  if(art){art.loading="eager";tile.append(art);}
  highlightRail.append(tile);
 }
 if(!highlightRail.children.length){
  highlightRail.append(el("p","ppw-album-highlights-empty",
   "Your first collected card will appear here."));
 }
 highlights.append(highlightTitle,highlightRail);
 const tierStrip=el("nav","ppw-album-tier-strip");
 tierStrip.setAttribute("aria-label","Collection progress by tier");
 const pageTabs=el("nav","ppw-album-pages");
 pageTabs.setAttribute("aria-label","Card album pages");
 const grid=el("div","ppw-album-book");
 const counts=el("p","ppw-album-results");
 counts.setAttribute("aria-live","polite");
 const paging=el("nav","ppw-album-pagination");
 paging.setAttribute("aria-label","Album sheet navigation");
 const tools=el("div","ppw-album-tools");
 const searchLabel=el("label","ppw-album-search");
 searchLabel.append(el("span","","Search cards"));
 const search=document.createElement("input");
 search.type="search";search.placeholder="Search your album";
 search.setAttribute("aria-label","Search cards");search.autocomplete="off";
 searchLabel.append(search);
 const sorting=el("div","ppw-album-sort");
 sorting.setAttribute("role","group");
 sorting.setAttribute("aria-label","Album sorting");
 let page=preferences?.page??target.dataset.legendAlbumPage??"ALL";
 let query=preferences?.query??"",sort=preferences?.sort??"CATALOGUE";
 let sheet=preferences?.sheet??0;
 const tabs:readonly [string,string][]=[
  ["ALL","All pages"],["CULT","Cult"],["LEGEND","Legends"],
  ["ICON","Icons"],["IMMORTAL","Immortals"],["OWNED","Collected"],["MISSING","Missing"]];
 const modes:readonly [LegendAlbumState["sort"],string][]=[
  ["CATALOGUE","Catalogue"],["OWNED_FIRST","Owned first"],["NAME","A–Z"]];
 if(!tabs.some(([id])=>id===page))page="ALL";
 if(!modes.some(([id])=>id===sort))sort="CATALOGUE";
 search.value=query;
 const position=new Map(view.entries.map((item,i)=>[item.id,i]));
 const tabButtons=new Map<string,HTMLButtonElement>();
 const modeButtons=new Map<string,HTMLButtonElement>();
 const save=()=>onPreferences?.({page,query,sort,sheet});
 const switchPage=(key:string)=>{
  page=key;sheet=0;target.dataset.legendAlbumPage=key;onPageChange?.(key);
  save();renderPage();
 };
 for(const tier of order){
  const group=view.entries.filter(x=>x.tier===tier);
  const collected=group.filter(x=>x.collected).length;
  const shortcut=button(tier==="LEGEND"?"Legend":
   tier[0]+tier.slice(1).toLowerCase(),()=>switchPage(tier));
  shortcut.classList.add("ppw-album-tier-summary");
  shortcut.dataset.tier=tier;
  shortcut.setAttribute("aria-label","Browse "+tier.toLowerCase()+" cards");
  shortcut.append(el("strong","",collected+"/"+group.length));
  const track=el("span","ppw-album-tier-track");
  const ink=el("span","ppw-album-tier-fill");
  ink.style.width=Math.round(collected/Math.max(1,group.length)*100)+"%";
  track.append(ink);shortcut.append(track);tierStrip.append(shortcut);
 }
 for(const [id,label] of tabs){
  const buttonTab=button(label,()=>switchPage(id));
  buttonTab.classList.add("ppw-album-page-button");
  pageTabs.append(buttonTab);tabButtons.set(id,buttonTab);
 }
 for(const [id,label] of modes){
  const buttonSort=button(label,()=>{sort=id;sheet=0;save();renderPage();});
  buttonSort.classList.add("ppw-album-sort-button");
  sorting.append(buttonSort);modeButtons.set(id,buttonSort);
 }
 search.addEventListener("input",()=>{query=search.value;sheet=0;save();renderPage();});
 tools.append(searchLabel,sorting);
 function renderPage(){
  grid.replaceChildren();
  for(const [key,buttonTab] of tabButtons)
   buttonTab.setAttribute("aria-pressed",String(key===page));
  for(const [key,buttonSort] of modeButtons)
   buttonSort.setAttribute("aria-pressed",String(key===sort));
  for(const tile of tierStrip.querySelectorAll<HTMLButtonElement>("button"))
   tile.setAttribute("aria-pressed",String(tile.dataset.tier===page));
  const term=query.trim().toLocaleLowerCase("en-GB");
  const found=view.entries.filter(item=>
   (page==="ALL"||page===item.tier||
    page==="OWNED"&&item.collected||page==="MISSING"&&!item.collected)&&
   (!term||Boolean(item.name?.toLocaleLowerCase("en-GB").includes(term))));
  if(sort==="OWNED_FIRST")found.sort((a,b)=>
   Number(b.collected)-Number(a.collected)||
   (position.get(a.id)??0)-(position.get(b.id)??0));
  else if(sort==="NAME")found.sort((a,b)=>
   (a.name??"~~~~").localeCompare(b.name??"~~~~","en-GB")||
   (position.get(a.id)??0)-(position.get(b.id)??0));
  const pageCount=Math.max(1,Math.ceil(found.length/ALBUM_PAGE_SIZE));
  sheet=Math.max(0,Math.min(sheet,pageCount-1));
  counts.textContent=found.length+" cards · Page "+(sheet+1)+" of "+pageCount;
  if(!found.length)grid.append(el("p","ppw-legend-collection-empty",
   "No cards here. Try another tier or search."));
  for(const item of found.slice(sheet*ALBUM_PAGE_SIZE,(sheet+1)*ALBUM_PAGE_SIZE)){
   const slot=el("article","ppw-album-slot");
   slot.dataset.tier=item.tier;slot.dataset.collected=String(item.collected);
   slot.dataset.legendId=item.id;
   slot.append(el("span","ppw-album-slot-number",
    "NO. "+String((position.get(item.id)??0)+1).padStart(3,"0")+" · "+item.tier));
   if(item.collected){
    const art=cardGraphic(item);
    if(art)slot.append(art);
    else slot.append(el("div","ppw-album-silhouette","★"));
    slot.append(el("strong","ppw-album-slot-name",item.name??"Collected Legend"));
    const inspect=button("View card",()=>actions.showCard(item.id),!item.cardAsset);
    inspect.classList.add("ppw-album-open-card");
    slot.append(inspect);
   }else{
    slot.append(el("div","ppw-album-silhouette","?"));
    slot.append(el("strong","ppw-album-slot-name",
     item.unlocked?item.name??"Legend awaiting collection":"Undiscovered"));
    slot.append(el("small","ppw-album-slot-status",
     item.unlocked?"UNLOCKED · NOT COLLECTED":"MYSTERY CARD"));
   }
   grid.append(slot);
  }
  paging.replaceChildren();
  if(pageCount>1){
   paging.append(button("Previous page",()=>{sheet--;save();renderPage();},sheet===0),
    el("span","ppw-album-pagination-index",(sheet+1)+" / "+pageCount),
    button("Next page",()=>{sheet++;save();renderPage();},sheet===pageCount-1));
  }
 }
 cabinet.append(highlights,tierStrip,pageTabs,tools,counts,grid,paging);
 renderPage();target.append(cabinet);
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
  // The tier's dedicated vector typography is part of the illustrated
  // background; keep the label accessible without duplicating card names.
  identity.setAttribute("role","img");
  identity.setAttribute("aria-label",
   taglines[selected.tier]??"Wrestling History Lives On");
  const cardStage=el("div","ppw-ceremony-card-stage");
  const art=cardGraphic(selected);
  if(art){
   // Bundled real cards load eagerly during the short anticipation beat.
   art.loading="eager";art.decoding="async";cardStage.append(art);
  }else cardStage.append(el("p","ppw-legend-reveal-artnote",
   "The definitive collectible image will appear when its artwork has been reviewed."));
  // Low-cost, non-looping mist around the card's base. Decorative only:
  // no extra RPCs, image fetches or continuous battery-draining particles.
  const mist=el("span","ppw-ceremony-card-mist");
  mist.setAttribute("aria-hidden","true");
  cardStage.append(mist);
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
