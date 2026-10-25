import {mountWorldHomePage,mountPlannerPage,mountRosterPage,
 mountTalentMarketPage,mountContractsPage,mountPersonaPage,
 mountResultsArchivePage,mountBusinessPage,mountStaffPage,mountIndustryPage,mountKayfabePage,
 mountCalendarPage,mountProgrammePage,mountChampionshipsPage,
 mountTagTeamsPage,mountStablesPage,mountWorkingConnectionsPage,
 mountBookingPage as mountBookingPageForHost}
 from "../../../src/web/card-browser.js";
import {HOST_DRAWER_ROOTS,drawerRootForSection,readHostSection,hostSectionHash,
 type HostSection,type HostDrawerRoot,contractAttentionHash,readContractFocus,
 plannerCardHash,backstageUnreadHash,bookingHistoryState,readBookingHistory,
 type HomeAttentionFocus,legendsVaultHash} from "../../../src/web/host-navigation.js";
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
import {promotionBrand} from "../../../src/ui/broadcast-identity.js";
import {mountAdminCentre} from "../../../src/ui/admin-centre.js";
import "../admin-centre.css";

type SessionView={
 worldId:string;playerId:string;csrfToken:string;
 overview:{
  world:{revision:number;name:string;year:number;week:number};
  membership:"ACTIVE"|"INACTIVE"|"NONE";
  promotion:null|{id:string;name:string};
 };
 canManualAdvance?:boolean;
 availablePromotions:{id:string;name:string;tier:string;
  homeMarketName?:string|null;rosterSize?:number}[];
};
const game=document.querySelector<HTMLElement>("#game")!;
const account=document.querySelector<HTMLElement>("#account")!;
const navigation=document.querySelector<HTMLElement>("#navigation")!;
let session:SessionView|null=null;
let pendingLegends:LegendsVaultView|null=null;
// Latest session wins when overlapping requests complete out of order.
let sessionReadSequence=0;
let drawerExpanded=false;
let drawerRoot:HostDrawerRoot="world";
// Private one-shot navigation target; no wrestler IDs in URLs or storage.
let pendingBackstagePersonId:string|null=null;
let backstageReturnSection:HostSection="home";
let bookingDirty=false;
let activeBooking:{worldId:string;promotionId:string;showId:string}|null=null;
function confirmLeavingBooking(next:HostSection){
 if(!bookingDirty||next==="card")return true;
 if(!window.confirm("You have unsaved changes to this show. Leave without saving?"))
  return false;
 bookingDirty=false;activeBooking=null;
 return true;
}
const el=(tag:string,cls="",value="")=>{
 const x=document.createElement(tag);x.className=cls;x.textContent=value;return x;
};
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
function openSection(section:HostSection,focus?:HomeAttentionFocus,personId?:string){
 if(!confirmLeavingBooking(section))return;
 drawerExpanded=false;
 if(section==="backstage"){
   const previous=readHostSection(location.hash);
   if(previous!=="backstage")backstageReturnSection=previous;
  }
  pendingBackstagePersonId=section==="backstage"&&personId?personId:null;
 const target=section==="contracts"&&(focus==="EXPIRING"||focus==="PENDING")?
  contractAttentionHash(focus):
  section==="planner"&&focus==="CARD"?plannerCardHash:
  section==="backstage"&&focus==="UNREAD"?backstageUnreadHash:
  hostSectionHash(section);
 if(location.hash!==target)location.hash=target;
 else if(pendingBackstagePersonId)renderSection();
 else renderNavigation(section);
}

/** One private browser-history entry per show; reloading the same entry keeps
 * its exact card, including a second PPV. World and promotion must still match.
 * No player, contract, or show identity appears in the shareable URL.
 */
function openBooking(showId:string){
 if(!session?.overview.promotion)return;
 const worldId=session.worldId,promotionId=session.overview.promotion.id;
 const state=bookingHistoryState(worldId,promotionId,showId);
 bookingDirty=false;activeBooking={worldId,promotionId,showId};
 if(location.hash===plannerCardHash)
  history.replaceState(null,"",hostSectionHash("planner"));
 history.pushState(state,"",hostSectionHash("card"));
 renderSection();
}

/** Small, self-contained 24px icons; no emoji fonts, image fetches or runtime dependency. */
function departmentIcon(name:HostDrawerRoot):SVGSVGElement{
 const paths:Record<HostDrawerRoot,string[]>={
  world:["M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z","M2 12h20","M12 2a15.3 15.3 0 0 1 0 20","M12 2a15.3 15.3 0 0 0 0 20"],
  promotion:["M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2","M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z","M22 21v-2a4 4 0 0 0-3-3.87","M16 3.13a4 4 0 0 1 0 7.75"],
  plan:["M8 2v4","M16 2v4","M3 10h18","M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z","M8 14h3","M8 18h3","M15 14h2"],
  business:["M3 21h18","M5 21V5l7-3 7 3v16","M9 9h1","M14 9h1","M9 13h1","M14 13h1","M10 21v-4h4v4"],
  news:["M8 21h8","M12 17v4","M7 4h10v7a5 5 0 0 1-10 0V4Z","M7 6H4a2 2 0 0 0-2 2c0 3 2 5 5 5","M17 6h3a2 2 0 0 1 2 2c0 3-2 5-5 5"]
 };
 const ns="http://www.w3.org/2000/svg";
 const svg=document.createElementNS(ns,"svg");
 svg.setAttribute("viewBox","0 0 24 24");svg.setAttribute("width","25");svg.setAttribute("height","25");
 svg.setAttribute("fill","none");svg.setAttribute("stroke","currentColor");
 svg.setAttribute("stroke-width","1.85");svg.setAttribute("stroke-linecap","round");
 svg.setAttribute("stroke-linejoin","round");svg.setAttribute("aria-hidden","true");
 svg.classList.add("ppw-department-icon");
 for(const d of paths[name]){const path=document.createElementNS(ns,"path");path.setAttribute("d",d);svg.append(path);}
 return svg;
}
function renderBottomNavigation(section:HostSection){
 document.querySelector(".ppw-bottom-navigation")?.remove();
 if(!session?.overview.promotion||session.overview.membership!=="ACTIVE")return;
 const bar=el("nav","ppw-bottom-navigation");
 bar.setAttribute("aria-label","Promotion departments");
 const selected=drawerExpanded?drawerRoot:drawerRootForSection(section);
 for(const root of HOST_DRAWER_ROOTS){
  const tab=button("",()=>{
   if(drawerExpanded&&drawerRoot===root.key)drawerExpanded=false;
   else{drawerRoot=root.key;drawerExpanded=true;}
   renderNavigation(readHostSection(location.hash));
   if(drawerExpanded)navigation.querySelector<HTMLButtonElement>(".ppw-nav-drawer-close")?.focus();
  });
  tab.className="ppw-bottom-tab ppw-bottom-root"+(selected===root.key?" ppw-bottom-tab-active":"");
  tab.dataset.root=root.key;
  tab.setAttribute("aria-label","Open "+root.label+" menu");
  tab.setAttribute("aria-controls","navigation");
  tab.setAttribute("aria-expanded",String(drawerExpanded&&drawerRoot===root.key));
  const art=el("span","ppw-bottom-tab-glyph");art.append(departmentIcon(root.key));
  tab.append(art,el("span","ppw-bottom-tab-label",root.label));
  bar.append(tab);
 }
 document.body.append(bar);
}
function renderNavigation(section:HostSection){
 navigation.replaceChildren();
 document.querySelector("#ppw-drawer-backdrop")?.remove();
 navigation.classList.toggle("ppw-navigation-open",drawerExpanded);
 navigation.hidden=!drawerExpanded;
 document.body.classList.toggle("ppw-drawer-active",drawerExpanded);
 const selected=drawerExpanded?drawerRoot:drawerRootForSection(section);
 document.querySelectorAll<HTMLButtonElement>(".ppw-bottom-root").forEach(tab=>{
  tab.classList.toggle("ppw-bottom-tab-active",tab.dataset.root===selected);
  tab.setAttribute("aria-expanded",String(drawerExpanded&&tab.dataset.root===drawerRoot));
 });
 if(!drawerExpanded)return;
 const restoreFocus=()=>document.querySelector<HTMLButtonElement>(
  '.ppw-bottom-root[data-root="'+drawerRoot+'"]')?.focus();
 const close=()=>{drawerExpanded=false;renderNavigation(section);restoreFocus();};
 const backdrop=el("button","ppw-drawer-backdrop") as HTMLButtonElement;
 backdrop.type="button";backdrop.id="ppw-drawer-backdrop";
 backdrop.setAttribute("aria-label","Close promotion menu");
 backdrop.onclick=close;
 document.body.append(backdrop);
 const root=HOST_DRAWER_ROOTS.find(x=>x.key===drawerRoot)!;
 const drawer=el("section","ppw-nav-drawer");
 drawer.setAttribute("aria-label",root.label+" departments");
 const head=el("div","ppw-nav-drawer-heading");
 head.append(el("span","","THE PROMOTION OFFICE"),el("strong","",root.label));
 const closeButton=button("×",close);
 closeButton.className="ppw-nav-drawer-close";
 closeButton.setAttribute("aria-label","Close promotion menu");
 head.append(closeButton);drawer.append(head);
 const entries=el("div","ppw-nav-drawer-entries");
 for(const [index,[id,label,description]] of root.destinations.entries()){
  if(id==="admin"&&!session?.canManualAdvance)continue;
  const entry=button("",()=>openSection(id as HostSection));
  entry.className="ppw-nav-drawer-entry";
  entry.append(el("span","ppw-nav-entry-index",String(index+1).padStart(2,"0")));
  const copy=el("span","ppw-nav-entry-copy");
  copy.append(el("strong","",label),el("small","",description));
  entry.append(copy,el("span","ppw-nav-entry-arrow","↗"));
  if(id===section)entry.setAttribute("aria-current","page");
  entries.append(entry);
 }
 drawer.append(entries);
 navigation.append(drawer);
 navigation.onkeydown=event=>{
  if(event.key!=="Tab")return;
  const buttons=[...navigation.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
  if(!buttons.length)return;
  const first=buttons[0]!,last=buttons[buttons.length-1]!;
  if(event.shiftKey&&document.activeElement===first){
   event.preventDefault();last.focus();
  }else if(!event.shiftKey&&document.activeElement===last){
   event.preventDefault();first.focus();
  }
 };
}
document.addEventListener("keydown",e=>{
 if(e.key==="Escape"&&drawerExpanded){
  drawerExpanded=false;renderNavigation(readHostSection(location.hash));
  document.querySelector<HTMLButtonElement>('.ppw-bottom-root[data-root="'+drawerRoot+'"]')?.focus();
 }
});
function renderSection(){
 if(!session?.overview?.promotion)return;
 document.documentElement.dataset.ppwPromotion=promotionBrand(session.overview.promotion.name).key;
 const section=readHostSection(location.hash);
 if(section==="admin"&&!session.canManualAdvance){location.hash=hostSectionHash("home");return;}
 if(section!=="card"){bookingDirty=false;activeBooking=null;}
 const backstagePersonId=section==="backstage"?pendingBackstagePersonId:null;
 pendingBackstagePersonId=null;
 clearLegendRevealPortal();
 const scope:CardSessionScope={worldId:session.worldId,
  promotionId:session.overview.promotion.id,showId:"",
  csrfToken:session.csrfToken};
 renderNavigation(section);
 document.documentElement.dataset.ppwScreen=section;
 renderBottomNavigation(section);
 // A fresh mounted viewport prevents slow replies from an abandoned desk
 // replacing the next screen. No extra RPC or global store is involved.
 const view=el("div","ppw-workspace");
 // Only a real department change gets a broadcast cut. No extra fetches,
 // delays, timers or effects for ordinary UI rerenders.
 const reduced=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
 // Mount synchronously. Native document transitions can retain old page
 // snapshots above new buttons during rapid mobile navigation.
 game.replaceChildren(view);
 if(!reduced&&section!=="card")view.classList.add("ppw-route-arrive");
 const back=()=>openSection("home");
 if(window.scrollY>0)window.scrollTo(0,0);
 switch(section){
  case "home":mountWorldHomePage(view,scope,openSection,updated=>{
   // An explicit World status check can update the shell without another read.
   if(!updated||!view.isConnected||!session?.overview.promotion||
    session.worldId!==scope.worldId||session.overview.promotion.id!==scope.promotionId)return;
   session.overview.world=updated.world;
   const line=account.querySelector<HTMLElement>(".ppw-shell-brand small");
   if(line)line.textContent="Y"+updated.world.year+" W"+updated.world.week+
    " · "+updated.world.name;
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
   async()=>{
    // One targeted check only after successful manual World publication.
    try{
     const newest=await createCardClient(scope)("legendsVault") as LegendsVaultView;
     if(!view.isConnected||!session?.overview.promotion)return;
     if(newest.entries.some(e=>e.unlocked&&!e.revealSeen)){
      pendingLegends=newest;
      if(location.hash!==legendsVaultHash)location.hash=legendsVaultHash;
      else renderSection();
     }
    }catch{
     // The World has already advanced; Home retains the unseen Legends cue.
    }
   });break;
  case "planner":mountPlannerPage(view,scope,back,
   location.hash===plannerCardHash,undefined,openBooking);break;
  case "card":{
   const showId=readBookingHistory(history.state,scope.worldId,scope.promotionId);
   if(!showId){
    bookingDirty=false;activeBooking=null;
    history.replaceState(null,"",hostSectionHash("planner"));
    mountPlannerPage(view,scope,back,false,undefined,openBooking);
   }else{
    activeBooking={worldId:scope.worldId,promotionId:scope.promotionId,showId};
    mountBookingPageForHost(view,{...scope,showId},()=>openSection("planner"),
     dirty=>{
      if(view.isConnected&&readHostSection(location.hash)==="card"&&
       activeBooking?.showId===showId)bookingDirty=dirty;
     },section=>openSection(section));
   }
   break;
  }
  case "roster":mountRosterPage(view,scope);break;
  case "backstage":mountPersonaPage(view,scope,
   location.hash===backstageUnreadHash?"UNREAD":"ALL",
   backstagePersonId??undefined,()=>openSection(backstageReturnSection));break;
  case "market":mountTalentMarketPage(view,scope);break;
  case "contracts":mountContractsPage(view,scope,readContractFocus(location.hash));break;
  case "business":mountBusinessPage(view,scope);break;
  case "staff":mountStaffPage(view,scope);break;
  case "admin":void mountAdminCentre(view,{csrfToken:session.csrfToken});break;
  case "industry":mountIndustryPage(view,scope,pendingLegends??undefined);
   pendingLegends=null;break;
  case "news":mountIndustryPage(view,scope);break;
  case "kayfabe":mountKayfabePage(view,scope,()=>openSection("home"));break;
  case "calendar":mountCalendarPage(view,scope,back,openBooking);break;
  case "results":void mountResultsArchivePage(view,scope,back);break;
  case "programmes":mountProgrammePage(view,scope);break;
  case "championships":void mountChampionshipsPage(view,scope,back);break;
  case "teams":mountTagTeamsPage(view,scope);break;
  case "stables":mountStablesPage(view,scope);break;
  case "connections":mountWorkingConnectionsPage(view,scope);break;

 }
}
window.addEventListener("hashchange",()=>{
 const section=readHostSection(location.hash);
 if(!confirmLeavingBooking(section)){
  const booking=activeBooking;
  if(booking)history.pushState(
   bookingHistoryState(booking.worldId,booking.promotionId,booking.showId),
   "",hostSectionHash("card"));
  return;
 }
 drawerExpanded=false;renderSection();
});
window.addEventListener("beforeunload",event=>{
 if(bookingDirty){event.preventDefault();event.returnValue="";}
});
window.addEventListener("ppw:session-lost",()=>{void loadSession();});

async function loadSession(){
 const sequence=++sessionReadSequence;
 pendingBackstagePersonId=null;pendingLegends=null;
 clearLegendRevealPortal();
 drawerExpanded=false;document.querySelector("#ppw-drawer-backdrop")?.remove();
 document.body.classList.remove("ppw-drawer-active");
 account.replaceChildren();navigation.replaceChildren();navigation.hidden=true;
 document.querySelector('.ppw-bottom-navigation')?.remove();
 delete document.documentElement.dataset.ppwScreen;
 game.replaceChildren(el("p","ppw-access-loading","Opening your promotion…"));
 try{
  const r=await fetch("/api/session",{credentials:"same-origin",
   cache:"no-store"});
  if(sequence!==sessionReadSequence)return;
  if(r.status===401){session=null;showLogin();return;}
  if(!r.ok)throw new Error("Your promotion is unavailable. Check your connection.");
  const incoming=await r.json() as SessionView;
  if(sequence!==sessionReadSequence)return;
  session=incoming;
  if(!session||!session.csrfToken||!session.worldId||!session.overview)
   throw new Error("Incomplete game session");
  const banner=el("div","ppw-account-banner");
  const identity=el("div","ppw-shell-identity");
  const logo=el("span","ppw-shell-logo","PPW");
  const brand=el("span","ppw-shell-brand");
  brand.append(el("strong","",session.overview.promotion?.name??"WORLD CONTROL"),
   el("small","","Y"+session.overview.world.year+" W"+
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
  if(session.overview.membership!=="ACTIVE"){showJoin();return;}
  if(!session.overview.promotion){showClaim();return;}
  renderSection();
  presentOpening();
 }catch(e){
  if(sequence!==sessionReadSequence)return;
  game.replaceChildren();
  showError(game,e instanceof Error?e.message:"Could not open PPW");
  game.append(button("Retry",()=>void loadSession()));
 }
}
/** Short, optional bumper. A single cached icon; no network/API work. */
function presentOpening(){
 if(!session?.overview.promotion||readHostSection(location.hash)!=="home"||
  window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;
 const key="ppw-opening:"+session.worldId+":"+session.overview.promotion.id;
 try{if(sessionStorage.getItem(key))return;sessionStorage.setItem(key,"1");}catch{return;}
 const scene=el("section","ppw-opening");
 scene.setAttribute("aria-label","PPW opening");
 const middle=el("div","ppw-opening-centre");
 const mark=document.createElement("img");
 mark.src="/icon.svg";mark.alt="PPW";mark.className="ppw-opening-logo";
 mark.width=192;mark.height=192;
 middle.append(el("span","ppw-opening-kicker","THE LIVING WRESTLING WORLD"),mark,
  el("span","ppw-opening-rule"),el("h1","","PROJECT PROFESSIONAL WRESTLING"));
 let timer=0;
 const finish=()=>{clearTimeout(timer);scene.remove();};
 const skip=button("Skip intro →",finish);skip.className="ppw-opening-skip";
 scene.append(middle,skip);document.body.append(scene);
 timer=window.setTimeout(finish,1900);
}
function showLogin(){
 game.replaceChildren();
 const card=el("section","ppw-access-panel");
 const mark=el("div","ppw-access-mark","PPW");
 mark.setAttribute("aria-hidden","true");
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
    await loadSession();
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
void loadSession();
if("serviceWorker" in navigator){
 window.addEventListener("load",()=>{void navigator.serviceWorker.register("/sw.js")
  .catch(()=>{/* Authenticated PPW still works when install caching is unavailable. */});});
}
