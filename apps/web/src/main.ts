import {mountWorldHomePage,mountPlannerPage,mountRosterPage,
 mountTalentMarketPage,mountContractsPage,mountPersonaPage,
 mountResultsArchivePage,mountResultsPage,mountBusinessPage,mountStaffPage,mountIndustryPage,mountCollectionPage,mountKayfabePage,mountAchievementsPage,
 mountCalendarPage,mountProgrammePage,mountChampionshipsPage,mountTournamentsPage,
 mountTagTeamsPage,mountStablesPage,mountWorkingConnectionsPage,
 mountBookingPage as mountBookingPageForHost,consumeProgrammeFocus,
 consumeBackstageRivalryFocus,consumeBackstageStoryFocus,
 consumeBookingFocus,clearBookingFocus,consumeProgrammeBookingFocus,
 consumeTitleChallengeFocus,clearTitleChallengeFocus,
 type ProgrammeBookingFocus}
 from "../../../src/web/card-browser.js";
import {HOST_SECTIONS,HOST_PRIMARY_NAV,HOST_MORE_GROUPS,navTabForSection,readHostSection,hostSectionHash,
 type HostSection,type HostNavTab,contractAttentionHash,readContractFocus,
 plannerCardHash,backstageUnreadHash,bookingHistoryState,readBookingHistory,
 type HomeAttentionFocus,legendsVaultHash,readBookingProgrammeFocus,resultsHistoryState,readResultsHistory}
 from "../../../src/web/host-navigation.js";
import {createCardClient,type CardSessionScope} from "../../../src/web/card-client.js";
import {clearLegendRevealPortal,type LegendsVaultView} from "../../../src/ui/legends-vault.js";
import {requireSuccessfulPromotionClaim} from "../../../src/web/promotion-claim-feedback.js";
import "../screen.css";
import "../polish.css";
import "../arena.css";
import "../broadcast-art.css";
import "../presentation-recovery.css";
import "../graphic-collections.css";
import "../type-led.css";
import "../bottom-navigation.css";
import "../ringside-editorial.css";
import "../phase16.css";
import {promotionBrand} from "../../../src/ui/broadcast-identity.js";

import "../ppw-brand.css";
import "../promoter-journey.css";
import {renderFirstShowGuide} from "./first-show-guide.js";
import type {PlayerWorldOverview} from "../../../src/db/player-world-overview.js";

type SessionView={
 worldId:string;playerId:string;ownerName?:string|null;csrfToken:string;
 overview:PlayerWorldOverview;
 canManualAdvance?:boolean;canAiBenchmark?:boolean;
 unseenLegendReveal?:boolean;
 availablePromotions:{id:string;name:string;tier:string;
  homeMarketName?:string|null;rosterSize?:number}[];
};
const game=document.querySelector<HTMLElement>("#game")!;
const account=document.querySelector<HTMLElement>("#account")!;
const navigation=document.querySelector<HTMLElement>("#navigation")!;
let session:SessionView|null=null;
let pendingLegends:LegendsVaultView|null=null;
let confirmedOwnerName:{playerId:string;displayName:string}|null=null;
// Latest session wins when overlapping requests complete out of order.
let sessionReadSequence=0;
let drawerExpanded=false;

// Private one-shot navigation target; no wrestler IDs in URLs or storage.
let pendingBackstageThread:{personId:string;conversationId?:string}|null=null;
let backstageReturnSection:HostSection="home";
let lastRenderedSection:HostSection|null=null;
let bookingDirty=false;
let activeBooking:ReturnType<typeof bookingHistoryState>|null=null;
let renderedHash:string|null=null;
function confirmLeavingBooking(next:HostSection,showId=activeBooking?.ppwBooking.showId??null){
 if(!bookingDirty||(next==="card"&&showId===activeBooking?.ppwBooking.showId))return true;
 if(!window.confirm("You have unsaved changes to this show. Leave without saving?"))
  return false;
 bookingDirty=false;activeBooking=null;
 return true;
}
const el=(tag:string,cls="",value="")=>{
 const x=document.createElement(tag);x.className=cls;x.textContent=value;return x;
};
/** Exact owner-selected raster logos power sign-in, the live shell and opening. */
function ppwLogo(cls:string,variant:"hero"|"header"="hero"){
 const img=document.createElement("img");img.className=cls;
 img.src=variant==="header"?"/branding/ppw-showcase-header.webp":
  "/branding/ppw-showcase-hero.webp";
 img.alt="PPW";
 img.decoding="async";return img;
}
const button=(label:string,action:()=>void)=>{
 const b=el("button","ppw-access-button",label) as HTMLButtonElement;
 b.type="button";b.onclick=action;return b;
};
function showError(target:HTMLElement,message:string){
 target.querySelector(":scope > .ppw-access-error")?.remove();
 const x=el("p","ppw-access-error",message);x.setAttribute("role","alert");
 target.prepend(x);
}
async function command(path:string,body:Record<string,unknown>,csrfToken?:string){
 const r=await fetch(path,{method:"POST",credentials:"same-origin",
  headers:{"content-type":"application/json",
   ...(csrfToken?{"x-ppw-csrf":csrfToken}:{})},
  body:JSON.stringify(body)});
 if(!r.ok){
  const payload=await r.json().catch(()=>({error:""})) as {error?:string};
  throw new Error(typeof payload.error==="string"&&payload.error.trim()?
   payload.error.slice(0,240):r.status===401?"Invalid player sign-in":
    r.status===429?"Too many requests. Try again later.":
    "Request rejected. Review and try again.");
 }
 return r.json();
}

/** Even a successful HTTP response can contain a rejected World command.
 * Never advance from an unclaimed promotion into private workspaces.
 */
function commandAccepted(result:unknown){
 return !!result&&typeof result==="object"&&
  ["APPLIED","REPLAYED"].includes(String((result as {status?:unknown}).status));
}
/** Mobile shell is independent of the workspace root and remains accessible. */
function openSection(section:HostSection,focus?:HomeAttentionFocus,personId?:string,conversationId?:string){
 if(!confirmLeavingBooking(section))return;
 const wasDrawerOpen=drawerExpanded;
 drawerExpanded=false;
 if(section==="backstage"){
   const previous=readHostSection(location.hash);
   if(previous!=="backstage")backstageReturnSection=previous;
  }
  pendingBackstageThread=section==="backstage"&&personId?{personId,conversationId}:null;
 const target=section==="contracts"&&(focus==="EXPIRING"||focus==="PENDING")?
  contractAttentionHash(focus):
  section==="planner"&&focus==="CARD"?plannerCardHash:
  section==="backstage"&&focus==="UNREAD"?backstageUnreadHash:
  hostSectionHash(section);
 if(location.hash!==target)location.hash=target;
 else if(section==="results"&&session?.overview.promotion&&
  readResultsHistory(history.state,session.worldId,session.overview.promotion.id)){
  history.pushState(null,"",target);
  renderSection(true);
 }else if(pendingBackstageThread)renderSection(true);
 else{
  renderNavigation(section);
  if(wasDrawerOpen)game.querySelector<HTMLElement>(".ppw-workspace")?.focus({preventScroll:true});
 }
}

/** One private browser-history entry per show; reloading the same entry keeps
 * its exact card, including a second PPV. World and promotion must still match.
 * No player, contract, or show identity appears in the shareable URL.
 */
function openBooking(showId:string,focus?:ProgrammeBookingFocus|null){
 if(!session?.overview.promotion)return;
 const worldId=session.worldId,promotionId=session.overview.promotion.id;
 const validFocus=focus&&focus.worldId===worldId&&
  focus.promotionId===promotionId?focus:null;
 const state=bookingHistoryState(worldId,promotionId,showId,validFocus);
 bookingDirty=false;activeBooking=state;
 if(location.hash===plannerCardHash)
  history.replaceState(null,"",hostSectionHash("planner"));
 history.pushState(state,"",hostSectionHash("card"));
 renderSection(true);
}

/** Small, self-contained 24px icons; no emoji fonts, image fetches or runtime dependency. */
function departmentIcon(name:HostNavTab):SVGSVGElement{
 const paths:Record<HostNavTab,string[]>={
  home:["M2 11 12 3l10 8","M5 10v11h14V10","M10 21v-6h4v6"],
  world:["M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z","M2 12h20","M12 2a15.3 15.3 0 0 1 0 20","M12 2a15.3 15.3 0 0 0 0 20"],
  roster:["M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2","M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z","M22 21v-2a4 4 0 0 0-3-3.87","M16 3.13a4 4 0 0 1 0 7.75"],
  book:["M8 2v4","M16 2v4","M3 10h18","M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z","M8 14h3","M8 18h3","M15 14h2"],
  more:["M5 12h.01","M12 12h.01","M19 12h.01"]
 };
 const ns="http://www.w3.org/2000/svg";
 const svg=document.createElementNS(ns,"svg");
 svg.setAttribute("viewBox","0 0 24 24");svg.setAttribute("width","25");svg.setAttribute("height","25");
 svg.setAttribute("fill","none");svg.setAttribute("stroke","currentColor");
 svg.setAttribute("stroke-width",name==="more"?"3":"1.85");svg.setAttribute("stroke-linecap","round");
 svg.setAttribute("stroke-linejoin","round");svg.setAttribute("aria-hidden","true");
 svg.classList.add("ppw-department-icon");
 for(const d of paths[name]){const path=document.createElementNS(ns,"path");path.setAttribute("d",d);svg.append(path);}
 return svg;
}
function sectionLink(label:string,section:HostSection,cls:string){
 const link=document.createElement("a");
 link.href=hostSectionHash(section);
 link.className=cls;link.textContent=label;
 link.onclick=event=>{
  if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  event.preventDefault();openSection(section);
 };
 return link;
}
function decorateTab(tab:HTMLElement,key:HostNavTab,label:string){
 tab.dataset.tab=key;
 const art=el("span","ppw-bottom-tab-glyph");
 art.append(departmentIcon(key));
 tab.replaceChildren(art,el("span","ppw-bottom-tab-label",label));
}
function renderBottomNavigation(section:HostSection){
 document.querySelector(".ppw-bottom-navigation")?.remove();
 if(!session?.overview.promotion||session.overview.membership!=="ACTIVE")return;
 const bar=el("nav","ppw-bottom-navigation");
 bar.setAttribute("aria-label","Promotion navigation");
 for(const tab of HOST_PRIMARY_NAV){
  // The Book tab stays on the open running order, including its unsaved edits.
  const target=tab.key==="book"&&section==="card"?"card":tab.landing;
  const link=sectionLink(tab.label,target,"ppw-bottom-tab");
  decorateTab(link,tab.key,tab.label);bar.append(link);
 }
 const more=button("More",()=>{
  drawerExpanded=true;renderNavigation(section);
  navigation.querySelector<HTMLButtonElement>(".ppw-nav-drawer-close")?.focus();
 });
 more.className="ppw-bottom-tab";more.setAttribute("aria-haspopup","dialog");
 more.setAttribute("aria-controls","navigation");
 decorateTab(more,"more","More");bar.append(more);
 document.body.append(bar);
}
function renderNavigation(section:HostSection){
 navigation.replaceChildren();
 document.querySelector("#ppw-drawer-backdrop")?.remove();
 navigation.classList.toggle("ppw-navigation-open",drawerExpanded);
 navigation.hidden=!drawerExpanded;
 document.body.classList.toggle("ppw-drawer-active",drawerExpanded);
 account.inert=game.inert=drawerExpanded;
 const bar=document.querySelector<HTMLElement>(".ppw-bottom-navigation");
 if(bar){
  bar.inert=drawerExpanded;
  const selected=navTabForSection(section);
  for(const tab of bar.querySelectorAll<HTMLElement>("[data-tab]")){
   const active=tab.dataset.tab===(drawerExpanded?"more":selected);
   tab.classList.toggle("ppw-bottom-tab-active",active);
   if(tab instanceof HTMLAnchorElement){
    if(active)tab.setAttribute("aria-current",readHostSection(tab.hash)===section?"page":"location");
    else tab.removeAttribute("aria-current");
   }else tab.setAttribute("aria-expanded",String(drawerExpanded));
  }
 }
 if(!drawerExpanded)return;
 const close=()=>{
  drawerExpanded=false;renderNavigation(section);
  bar?.querySelector<HTMLElement>('[data-tab="more"]')?.focus();
 };
 const backdrop=el("div","ppw-drawer-backdrop");
 backdrop.id="ppw-drawer-backdrop";backdrop.setAttribute("aria-hidden","true");backdrop.onclick=close;
 document.body.append(backdrop);
 const drawer=el("section","ppw-nav-drawer");
 drawer.setAttribute("role","dialog");drawer.setAttribute("aria-modal","true");
 drawer.setAttribute("aria-labelledby","ppw-more-title");
 const head=el("header","ppw-nav-drawer-heading");
 const title=el("h2","","More");title.id="ppw-more-title";head.append(title);
 const closeButton=button("×",close);
 closeButton.className="ppw-nav-drawer-close";
 closeButton.setAttribute("aria-label","Close menu");
 head.append(closeButton);drawer.append(head);
 const groups=el("div","ppw-nav-groups");
 for(const group of HOST_MORE_GROUPS){
  const sectionGroup=el("section","ppw-nav-group");
  sectionGroup.append(el("h3","",group.label));
  const entries=el("div","ppw-nav-drawer-entries");
  for(const [id,label] of group.destinations){
   if(id==="admin"&&!session?.canManualAdvance&&!session?.canAiBenchmark)continue;
   if(id==="showtime"&&!session?.canManualAdvance)continue;
   const link=sectionLink(label,id,"ppw-nav-drawer-entry");
   if(id===section)link.setAttribute("aria-current","page");
   entries.append(link);
  }
  sectionGroup.append(entries);groups.append(sectionGroup);
 }
 drawer.append(groups);navigation.append(drawer);
 navigation.scrollTop=0;
 navigation.onkeydown=event=>{
  if(event.key==="Escape"){event.preventDefault();close();return;}
  if(event.key!=="Tab")return;
  const links=navigation.querySelectorAll<HTMLElement>("button,a[href]");
  const first=links[0],last=links[links.length-1];
  if(event.shiftKey&&document.activeElement===first){
   event.preventDefault();last?.focus();
  }else if(!event.shiftKey&&document.activeElement===last){
   event.preventDefault();first?.focus();
  }
 };
}
/** One Vault query only after real World publication or an observed change.
 * The pending unlock is per-player and never read through background polling.
 */
async function offerUnseenLegendReveals(scope:CardSessionScope,view:HTMLElement){
 try{
  const newest=await createCardClient(scope)("legendsVault") as LegendsVaultView;
  if(!view.isConnected||!session?.overview.promotion||
   session.worldId!==scope.worldId||
   session.overview.promotion.id!==scope.promotionId)return;
  if(newest.entries.some(e=>e.unlocked&&!e.revealSeen)){
   pendingLegends=newest;
   if(location.hash!==legendsVaultHash)location.hash=legendsVaultHash;
   else renderSection();
  }
 }catch{
  // A failed optional check cannot undo World certification. The next
  // authenticated sign-in retries it without a provider call or timer.
 }
}
let firstShowGuideKey:string|null=null;
function showFirstShowGuideFor(promotionId:string){
 if(!session)return;
 firstShowGuideKey=JSON.stringify(["ppw-first-show",session.worldId,session.playerId,promotionId]);
 try{sessionStorage.setItem(firstShowGuideKey,"1");}catch{/* Browser storage is optional. */}
}
function renderSection(moveFocus=false,initialOverview?:PlayerWorldOverview){
 if(!session?.overview?.promotion)return;
 document.documentElement.dataset.ppwPromotion=promotionBrand(session.overview.promotion.name).key;
 let section=readHostSection(location.hash);
 if(section==="card"&&!readBookingHistory(history.state,session.worldId,session.overview.promotion.id)){
  history.replaceState(null,"",hostSectionHash("planner"));section="planner";
 }
 // Deep links can originate from another desk without going through the
 // drawer. Preserve that origin just as openSection does for a direct action.
 if(section==="backstage"&&lastRenderedSection&&lastRenderedSection!=="backstage")
  backstageReturnSection=lastRenderedSection;
 if((section==="admin"&&!session.canManualAdvance&&!session.canAiBenchmark)||
  (section==="showtime"&&!session.canManualAdvance)){
  history.replaceState(null,"",hostSectionHash("home"));section="home";
 }
 renderedHash=location.hash;
 lastRenderedSection=section;
 if(section!=="card"){bookingDirty=false;activeBooking=null;}
 if(section!=="card"&&section!=="planner"){
  clearBookingFocus();clearTitleChallengeFocus();
 }
 const backstageThread=section==="backstage"?pendingBackstageThread:null;
 pendingBackstageThread=null;
 clearLegendRevealPortal();
 document.querySelectorAll(".ppw-profile-overlay").forEach(overlay=>overlay.remove());
 const scope:CardSessionScope={worldId:session.worldId,
  promotionId:session.overview.promotion.id,showId:"",
  csrfToken:session.csrfToken};
 document.documentElement.dataset.ppwScreen=section;
 renderBottomNavigation(section);
 renderNavigation(section);
 // A fresh mounted viewport prevents slow replies from an abandoned desk
 // replacing the next screen. No extra RPC or global store is involved.
 const view=el("div","ppw-workspace");
 view.tabIndex=-1;
 view.setAttribute("role","region");
 view.setAttribute("aria-label",HOST_SECTIONS.find(entry=>entry.id===section)!.label);
 // Only a real department change gets a broadcast cut. No extra fetches,
 // delays, timers or effects for ordinary UI rerenders.
 const reduced=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
 // Mount synchronously. Native document transitions can retain old page
 // snapshots above new buttons during rapid mobile navigation.
 game.replaceChildren(view);
 if(!reduced&&section!=="card")view.classList.add("ppw-route-arrive");
 const back=()=>openSection("home");
 const openShowtime=session.canManualAdvance?()=>openSection("showtime"):undefined;
 const openResults=(showId:string)=>{
  if(!confirmLeavingBooking("results"))return;
  if(location.hash===hostSectionHash("results")&&
   readResultsHistory(history.state,scope.worldId,scope.promotionId)===showId)return;
  history.pushState(resultsHistoryState(scope.worldId,scope.promotionId,showId),"",hostSectionHash("results"));
  renderSection(true);
 };
 const guideKey=JSON.stringify(["ppw-first-show",session.worldId,session.playerId,scope.promotionId]);
 const guide=el("aside");
 const updateGuide=(overview:PlayerWorldOverview)=>{
  let enabled=firstShowGuideKey===guideKey;
  try{enabled||=sessionStorage.getItem(guideKey)==="1";}catch{/* Browser storage is optional. */}
  if(!enabled)return;
  if(!guide.isConnected)view.before(guide);
  renderFirstShowGuide(guide,overview,{
   book:()=>openSection("planner"),showtime:openShowtime,
   dismiss:()=>{
    firstShowGuideKey=null;
    try{sessionStorage.removeItem(guideKey);}catch{/* Browser storage is optional. */}
    guide.remove();view.focus({preventScroll:true});
   }
  });
 };
 if(window.scrollY>0)window.scrollTo(0,0);
 if(moveFocus)view.focus({preventScroll:true});
 switch(section){
  case "home":{
   if(initialOverview)updateGuide(initialOverview);
   mountWorldHomePage(view,scope,openSection,updated=>{
   // An explicit World status check can update the shell without another read.
   if(!updated||!view.isConnected||!session?.overview.promotion||
    session.worldId!==scope.worldId||session.overview.promotion.id!==scope.promotionId)return;
   const changed=updated.world.year!==session.overview.world.year||
    updated.world.week!==session.overview.world.week;
   session.overview=updated;
   updateGuide(updated);
   // No repeated World polling. One Vault check if a shared week's
   // change was already observed by the current Home request.
   if(changed)void offerUnseenLegendReveals(scope,view);
   const line=account.querySelector<HTMLElement>(".ppw-shell-brand small");
   if(line)line.textContent=(session.ownerName?session.ownerName+" · ":"")+
    "Y"+updated.world.year+" W"+updated.world.week+" · "+updated.world.name;
  },
   session.canManualAdvance?async(year,week)=>{
    for(let batch=0;batch<24;batch++){
     const response=await command("/api/playtest-week",{
      confirm:"ADVANCE_SHARED_WORLD",year,week
     },session?.csrfToken) as {
      status:"PUBLISHED"|"BLOCKED"|"LIMIT_REACHED";
      blockers:string[];steps:{action:string;status:string}[]
     };
     if(response.status!=="LIMIT_REACHED")
      return {status:response.status,blockers:response.blockers??[]};
     if(!response.steps?.length)
      return {status:"BLOCKED" as const,blockers:["World made no progress. Check Admin diagnostics."]};
    }
    return {status:"LIMIT_REACHED" as const,blockers:[]};
   }:undefined,
   session.canManualAdvance?async(year,week)=>command("/api/playtest-booking",{
    confirm:"EXTEND_SHARED_BOOKING",year,week
   },session?.csrfToken):undefined,
   async()=>{await offerUnseenLegendReveals(scope,view);},openResults,
   openBooking,initialOverview,openShowtime);break;
  }
  case "planner":{
   const storyFocus=consumeProgrammeBookingFocus(scope.worldId,scope.promotionId);
   mountPlannerPage(view,scope,back,
    location.hash===plannerCardHash||!!storyFocus,
    storyFocus?.bookedDraft?{...storyFocus.bookedDraft,seriesId:""}:undefined,
    (showId,programmeId)=>openBooking(showId,
     storyFocus&&(!programmeId||storyFocus.programmeId===programmeId)?
      storyFocus:programmeId?{worldId:scope.worldId,
       promotionId:scope.promotionId,programmeId}:null),
    storyFocus?.programmeId);
   break;
  }
  case "card":{
   const showId=readBookingHistory(history.state,scope.worldId,scope.promotionId);
   if(!showId)break;
   const storyFocus=readBookingProgrammeFocus(history.state,scope.worldId,scope.promotionId);
   activeBooking=bookingHistoryState(scope.worldId,scope.promotionId,showId,storyFocus);
   mountBookingPageForHost(view,{...scope,showId},()=>openSection("planner"),
    dirty=>{
     if(view.isConnected&&readHostSection(location.hash)==="card"&&
      activeBooking?.ppwBooking.showId===showId)bookingDirty=dirty;
    },section=>openSection(section),storyFocus?.programmeId,
    storyFocus?.ideaKind,
    consumeBookingFocus(scope.worldId,scope.promotionId)??undefined,
    consumeTitleChallengeFocus(scope.worldId,scope.promotionId)??undefined,
    storyFocus?.blueprintBeat);
   break;
  }
  case "roster":mountRosterPage(view,scope);break;
  case "backstage":mountPersonaPage(view,scope,
   location.hash===backstageUnreadHash?"UNREAD":"ALL",
   backstageThread?.personId,()=>openSection(backstageReturnSection),backstageThread?.conversationId);break;
  case "market":mountTalentMarketPage(view,scope);break;
  case "contracts":mountContractsPage(view,scope,readContractFocus(location.hash));break;
  case "business":case "finances":case "commercials":case "ratings-war":
  case "business-standing":case "business-activity":case "business-events":
  case "business-territories":mountBusinessPage(view,scope);break;
  case "staff":mountStaffPage(view,scope);break;
  case "showtime":case "admin":{
   const context={csrfToken:session.csrfToken,
    benchmarkOnly:!session.canManualAdvance&&!!session.canAiBenchmark,
    showtime:section==="showtime"?{
     book:()=>openSection("planner"),results:()=>openSection("results"),home:back,
    }:undefined};
   view.append(el("p","ppw-access-loading","Checking World readiness…"));
   void import("./operator-desks.js").then(({mountAdminCentre})=>{
    if(view.isConnected)return mountAdminCentre(view,context);
   }).catch(()=>{
    if(view.isConnected)view.replaceChildren(el("p","ppw-access-error",
     "This desk could not open. Reload the page to retry."));
   });
   break;
  }
  case "industry":
  case "promotions":
  case "broadcasts":
  case "records":
  case "legends":
  case "hall-of-fame":
  case "annual-awards":
  case "world-moments":
   mountIndustryPage(view,scope,pendingLegends??undefined,openResults);
   pendingLegends=null;break;
   case "collection":mountCollectionPage(view,scope);break;
   case "achievements":mountAchievementsPage(view,scope,()=>openSection("home"),()=>openSection("kayfabe"));break;
   case "news":mountIndustryPage(view,scope);break;
  case "kayfabe":mountKayfabePage(view,scope,()=>openSection("home"),()=>openSection("achievements"));break;
  case "calendar":mountCalendarPage(view,scope,back,openBooking);break;
  case "results":{
    const showId=readResultsHistory(history.state,scope.worldId,scope.promotionId);
    if(showId)void mountResultsPage(view,{...scope,showId},()=>history.back(),"previous screen",{
     weekShows:session.overview.promotion.latestShows,openShow:openResults,
    });
    else void mountResultsArchivePage(view,scope,back,openResults);
    break;
   }
  case "programmes":{
   const dossierFocus=consumeProgrammeFocus();
   const pitchFocus=consumeBackstageRivalryFocus(scope.worldId,scope.promotionId);
   const storyFocus=consumeBackstageStoryFocus(scope.worldId,scope.promotionId);
   mountProgrammePage(view,scope,
    pitchFocus?.personId??dossierFocus??undefined,pitchFocus?.opponentId,
    storyFocus?.programmeId,
    {openShow:openResults,openArchive:()=>openSection("results")},storyFocus?.lane);
   break;
  }
  case "championships":void mountChampionshipsPage(view,scope,back,"MINE");break;
  case "tournaments":void mountTournamentsPage(view,scope,()=>openSection("roster"));break;
  case "teams":mountTagTeamsPage(view,scope);break;
  case "stables":mountStablesPage(view,scope);break;
  case "connections":mountWorkingConnectionsPage(view,scope);break;

 }
}
function restoreHistoryRoute(){
 const section=readHostSection(location.hash);
 const booking=activeBooking;
 const showId=booking&&section==="card"?readBookingHistory(
  history.state,booking.ppwBooking.worldId,booking.ppwBooking.promotionId):null;
 if(!confirmLeavingBooking(section,showId)){
  if(booking)history.pushState(booking,"",hostSectionHash("card"));
  return;
 }
 drawerExpanded=false;renderSection(true);
}
window.addEventListener("hashchange",restoreHistoryRoute);
// History entries with different cards or Results may share a public URL.
// Other workspaces have no history state to restore.
// For a different URL the hashchange listener already handles restoration.
window.addEventListener("popstate",()=>{
 const section=readHostSection(location.hash);
 if(location.hash===renderedHash&&(section==="card"||section==="results"))restoreHistoryRoute();
});
window.addEventListener("beforeunload",event=>{
 if(bookingDirty){event.preventDefault();event.returnValue="";}
});
window.addEventListener("ppw:session-lost",()=>{void loadSession();});
window.addEventListener("ppw:open-backstage",event=>{
 const {personId,conversationId}=(event as CustomEvent<{personId?:unknown;conversationId?:unknown}>).detail??{};
 if(typeof personId==="string"&&personId.length>0&&personId.length<=128)
  openSection("backstage",undefined,personId,typeof conversationId==="string"?conversationId:undefined);
});

async function loadSession(){
 const sequence=++sessionReadSequence;
 pendingBackstageThread=null;pendingLegends=null;
 lastRenderedSection=null;backstageReturnSection="home";
 clearBookingFocus();clearTitleChallengeFocus();clearLegendRevealPortal();
 document.querySelectorAll(".ppw-profile-overlay").forEach(overlay=>overlay.remove());
 drawerExpanded=false;account.inert=game.inert=false;
 document.querySelector("#ppw-drawer-backdrop")?.remove();
 document.body.classList.remove("ppw-drawer-active");
 account.replaceChildren();navigation.replaceChildren();navigation.hidden=true;
 document.querySelector('.ppw-bottom-navigation')?.remove();
 delete document.documentElement.dataset.ppwScreen;
 game.replaceChildren(el("p","ppw-access-loading","Opening your promotion…"));
 try{
  const r=await fetch("/api/session",{credentials:"same-origin",
   cache:"no-store"});
  if(sequence!==sessionReadSequence)return;
  if(r.status===401){session=null;confirmedOwnerName=null;showLogin();return;}
  if(!r.ok)throw new Error("Your promotion is unavailable. Check your connection.");
  const incoming=await r.json() as SessionView;
  if(sequence!==sessionReadSequence)return;
  if(incoming.ownerName==null&&confirmedOwnerName?.playerId===incoming.playerId)
   incoming.ownerName=confirmedOwnerName.displayName;
  if(incoming.ownerName)confirmedOwnerName={
   playerId:incoming.playerId,displayName:incoming.ownerName
  };
  session=incoming;
  if(!session||!session.csrfToken||!session.worldId||!session.overview)
   throw new Error("Incomplete game session");
  const banner=el("div","ppw-account-banner");
  const identity=el("div","ppw-shell-identity");
  const logo=ppwLogo("ppw-shell-logo","header");
   logo.width=56;logo.height=38;
  const brand=el("span","ppw-shell-brand");
  brand.append(el("strong","",session.overview.promotion?.name??"WORLD CONTROL"),
   el("small","",(session.ownerName?session.ownerName+" · ":"")+
    "Y"+session.overview.world.year+" W"+
    session.overview.world.week+" · "+session.overview.world.name));
  identity.append(logo,brand);
  const actions=el("div","ppw-shell-actions");
  const signout=button("Sign out",()=>void signOut());
  signout.className="ppw-shell-signout";
  if(session.overview.membership==="ACTIVE"&&session.overview.promotion){
   const kp=button("★ KP",()=>openSection("kayfabe"));
   kp.className="ppw-shell-kp";kp.setAttribute("aria-label","Open your KP wallet");
   actions.append(kp);
  }
  actions.append(signout);
  banner.append(identity,actions);
  account.append(banner);
  if(session.ownerName===null){showOwnerName();return;}
  if(session.overview.membership!=="ACTIVE"){showJoin();return;}
  if(!session.overview.promotion){showClaim();return;}
  if(session.unseenLegendReveal){
   // A human booker can return after another manager advances the World.
   // Deliver the actual one-time tier ceremony, never just a news badge.
   // A redirect never acknowledges the reveal; Continue/Skip does.
   if(location.hash!==legendsVaultHash)location.hash=legendsVaultHash;
   else renderSection();
  }else{
   // This response already contains the current owner-scoped Home projection.
   // Reuse it once and let subsequent navigation read current game state.
   const overview=session.overview;
   renderSection(false,overview.world.id===session.worldId&&
    !!overview.promotion?.attention?overview:undefined);
   presentOpening();
  }
 }catch(e){
  if(sequence!==sessionReadSequence)return;
  game.replaceChildren();
  showError(game,e instanceof Error?e.message:"Could not open PPW");
  game.append(button("Retry",()=>void loadSession()));
 }
}
/** One composited branded scene: the logo is part of the backdrop image.
 * Only the accessible Continue button is a live element over the artwork.
 * Never blocks a repeat visit or changes the underlying signed-in game.
 */
function presentOpening(){
 // Only the actual app launch gets a blocking intro; explicit deep links
 // and returning from departments must remain immediately interactive.
 if(window.matchMedia("(prefers-reduced-motion: reduce)").matches||
  !session?.overview.promotion||readHostSection(location.hash)!=="home"||
  (location.hash!==""&&location.hash!=="#/"))return;
 const key="ppw-opening:"+session.worldId+":"+session.overview.promotion.id;
 try{if(sessionStorage.getItem(key))return;sessionStorage.setItem(key,"1");}catch{return;}
 const scene=el("section","ppw-opening");
 scene.setAttribute("aria-label","PPW opening");
 const artwork=document.createElement("img");
 artwork.className="ppw-opening-art";
 artwork.src="/branding/ppw-intro-stage.webp";
 artwork.alt="PPW — Project Professional Wrestling";
 artwork.decoding="async";artwork.loading="eager";
 const finish=()=>{scene.remove();};
 const enter=button("Continue to PPW →",finish);
 enter.className="ppw-opening-skip";
 scene.append(artwork,enter);document.body.append(scene);
 // The player continues when ready; the background itself is not actionable.
 // Escape is an additional accessibility exit for keyboard players.
 scene.addEventListener("keydown",event=>{if(event.key==="Escape")finish();});
 enter.focus();
}
function showLogin(){
 game.replaceChildren();
 const card=el("section","ppw-access-panel");
 const mark=ppwLogo("ppw-access-mark");
 mark.alt="";mark.setAttribute("aria-hidden","true");
 card.append(mark,el("span","ppw-access-kicker","PPW / YOUR WORLD"),
  el("h1","","Enter the locker room"),
  el("p","ppw-access-muted",
   "Sign in using your private wrestler-promoter access code. Each player manages a separate promotion in one shared World."));
 const form=document.createElement("form");form.className="ppw-access-form";
 const identity=document.createElement("input");
 identity.type="text";identity.autocomplete="username";identity.maxLength=200;
 identity.placeholder="Player ID";identity.required=true;identity.setAttribute("aria-label","Player ID");
 const secret=document.createElement("input");
 secret.type="password";secret.autocomplete="current-password";
 secret.placeholder="Private access code";secret.required=true;secret.setAttribute("aria-label","Private access code");
 const submit=document.createElement("button");
 submit.type="submit";submit.className="ppw-access-button";submit.textContent="Sign in";
 form.append(identity,secret,submit);
 form.onsubmit=async e=>{
  e.preventDefault();submit.disabled=true;
  try{
   await command("/api/auth",{playerId:identity.value.trim(),
    accessCode:secret.value});
   secret.value="";await loadSession();
  }catch(error){
   showError(card,error instanceof Error?error.message:"Sign in failed");
   secret.value="";
  }finally{submit.disabled=false;}
 };
 card.append(form);game.append(card);
}
/** First-time identity is a display name, never a replacement for the signed-in player ID. */
function showOwnerName(){
 if(!session)return;
 const card=el("section","ppw-access-panel");
 card.append(el("span","ppw-access-kicker","PPW / NEW PROMOTER"),
  el("h1","","What's your name?"),
  el("p","ppw-access-muted",
   "Journalists, staff and the wrestling World will address you by this name. Your private sign-in stays unchanged."));
 const form=document.createElement("form");form.className="ppw-access-form";
 const name=document.createElement("input");
 name.type="text";name.required=true;name.maxLength=48;
 name.autocomplete="name";name.placeholder="Josh Robinson";
 name.setAttribute("aria-label","Your manager name");
 const submit=document.createElement("button");submit.type="submit";
 submit.className="ppw-access-button";submit.textContent="Enter the wrestling world";
 form.append(name,submit);
 form.onsubmit=async e=>{
  e.preventDefault();submit.disabled=true;
  try{
   const saved=await command("/api/profile",{action:"SET_NAME",name:name.value},
    session!.csrfToken) as {displayName:string};
   confirmedOwnerName={playerId:session!.playerId,displayName:saved.displayName};
   const promotion=session!.overview.promotion;
   if(promotion&&!promotion.latestShow&&!(promotion.latestShows?.length))
    showFirstShowGuideFor(promotion.id);
   await loadSession();
  }catch(error){showError(card,error instanceof Error?error.message:"Name could not be saved");}
  finally{submit.disabled=false;}
 };
 card.append(form);game.replaceChildren(card);
}
/** Rebranding is optional and never alters the immutable promotion ID. */
function showTakeoverBrand(promotionId:string,originalName:string){
 if(!session)return;
 const card=el("section","ppw-access-panel");
 card.append(el("span","ppw-access-kicker","PPW / YOUR PROMOTION"),
  el("h1","","Make it yours"),
  el("p","ppw-access-muted",
   "You're the owner of "+originalName+". Keep its famous name or rebrand it. Championships and history follow the same promotion."));
 const form=document.createElement("form");form.className="ppw-access-form";
 const name=document.createElement("input");name.type="text";name.maxLength=56;
 name.required=true;name.value=originalName;
 name.setAttribute("aria-label","Promotion name");
 const submit=document.createElement("button");submit.type="submit";
 submit.className="ppw-access-button";submit.textContent="Save promotion name";
 const keep=button("Keep "+originalName,()=>void loadSession());
 form.append(name,submit,keep);
 form.onsubmit=async e=>{
  e.preventDefault();submit.disabled=true;keep.disabled=true;
  try{
   await command("/api/promotion-identity",{
    action:"RENAME",promotionId,name:name.value
   },session!.csrfToken);
   await loadSession();
  }catch(error){
   showError(card,error instanceof Error?error.message:"Promotion name not changed");
   submit.disabled=false;keep.disabled=false;
  }
 };
 card.append(form);game.replaceChildren(card);
}
function showJoin(){
 if(!session)return;
 const card=el("section","ppw-access-panel");
 card.append(el("span","ppw-access-kicker","PPW / WORLD INVITATION"),
  el("h1","","Join "+session.overview.world.name),
  el("p","ppw-access-muted",
   "Your invitation is verified. Join the shared World to pick a promotion."));
 const join=button("Join World",async()=>{
  join.disabled=true;
  try{
   const outcome=await command("/api/join",{requestId:crypto.randomUUID(),
    expectedRevision:session!.overview.world.revision},session!.csrfToken);
   if(!commandAccepted(outcome))
    throw new Error("The World changed before you joined. Refresh and try again.");
   await loadSession();
  }catch(e){
   join.disabled=false;
   showError(card,e instanceof Error?e.message:"Join failed");
   if(!card.querySelector(".ppw-access-refresh")){
    const refresh=button("Refresh World",()=>void loadSession());
    refresh.className+=" ppw-access-refresh";card.append(refresh);
   }
  }
 });
 card.append(join);
 game.replaceChildren(card);
}
function showClaim(){
 if(!session)return;
 const card=el("section","ppw-access-panel");
 card.append(el("span","ppw-access-kicker","PPW / CHOOSE YOUR PROMOTION"),
  el("h1","","Pick a promotion"),
  el("p","ppw-access-muted",
   "One promotion per manager. Other players' claims are protected by the World revision."));
 if(!session.availablePromotions.length){
  card.append(el("p","ppw-access-muted","No unclaimed promotions are currently available."),
   button("Refresh World",()=>void loadSession()));
 }
 let choosing=false;
 for(const p of session.availablePromotions){
  const item=el("div","ppw-access-promotion");
  const identity=el("div","ppw-access-promotion-info");
  identity.append(el("strong","",p.name),
   el("small","",p.tier.replaceAll("_"," ").toLowerCase()));
  const facts=el("div","ppw-access-promotion-facts");
  if(p.homeMarketName)facts.append(el("span","","Home territory · "+p.homeMarketName));
  if(typeof p.rosterSize==="number"&&p.rosterSize>=0)
   facts.append(el("span","",p.rosterSize.toLocaleString("en-GB")+" signed wrestlers"));
  if(facts.childElementCount)identity.append(facts);
  item.append(identity);
  item.append(button("Run this promotion",async()=>{
   if(choosing)return;
   choosing=true;
   card.querySelectorAll<HTMLButtonElement>("button").forEach(b=>{b.disabled=true;});
   try{
    const outcome=await command("/api/claim",{promotionId:p.id,requestId:crypto.randomUUID(),
     expectedRevision:session!.overview.world.revision},session!.csrfToken);
    requireSuccessfulPromotionClaim(outcome);
    showFirstShowGuideFor(p.id);
    showTakeoverBrand(p.id,p.name);
   }catch(e){
    choosing=false;
    card.querySelectorAll<HTMLButtonElement>("button").forEach(b=>{b.disabled=false;});
    showError(card,e instanceof Error?e.message:"Claim failed");
    if(!card.querySelector(".ppw-access-refresh")){
     const refresh=button("Refresh available promotions",()=>void loadSession());
     refresh.className+=" ppw-access-refresh";card.append(refresh);
    }
   }
  }));
  card.append(item);
 }
 game.replaceChildren(card);
}
let signingOut=false;
async function signOut(){
 if(signingOut||!confirmLeavingBooking("home"))return;
 signingOut=true;
 const control=account.querySelector<HTMLButtonElement>(".ppw-shell-signout");
 if(control)control.disabled=true;
 try{
  if(session){
   const response=await fetch("/api/auth",{method:"DELETE",credentials:"same-origin",
    headers:{"x-ppw-csrf":session.csrfToken}});
   if(!response.ok&&response.status!==401)
    throw new Error("Sign-out was not confirmed. Your promotion is still signed in.");
  }
  await loadSession();
 }catch{
  // Do not claim logout or hide an active account on network/host errors.
  showError(account,"Could not confirm sign-out. Check your connection and try again.");
 }finally{
  signingOut=false;
  if(control?.isConnected)control.disabled=false;
 }
}
window.addEventListener("ppw:promotion-renamed",()=>void loadSession());
void loadSession();
if("serviceWorker" in navigator){
 window.addEventListener("load",()=>{void navigator.serviceWorker.register("/sw.js")
  .catch(()=>{/* Authenticated PPW still works when install caching is unavailable. */});});
}
