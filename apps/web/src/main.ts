import {mountWorldHomePage,mountPlannerPage,mountRosterPage,
 mountTalentMarketPage,mountContractsPage,mountPersonaPage,
 mountResultsArchivePage,mountBusinessPage,mountStaffPage,mountIndustryPage,
 mountCalendarPage,mountProgrammePage,mountChampionshipsPage,
 mountTagTeamsPage,mountStablesPage,mountWorkingConnectionsPage}
 from "../../../src/web/card-browser.js";
import {HOST_SECTIONS,HOST_DRAWER_ROOTS,drawerRootForSection,readHostSection,hostSectionHash,
 type HostSection,type HostDrawerRoot} from "../../../src/web/host-navigation.js";
import type {CardSessionScope} from "../../../src/web/card-client.js";
import "../screen.css";
import "../polish.css";

type SessionView={
 worldId:string;playerId:string;csrfToken:string;
 overview:{
  world:{revision:number;name:string;year:number;week:number};
  membership:"ACTIVE"|"INACTIVE"|"NONE";
  promotion:null|{id:string;name:string};
 };
 availablePromotions:{id:string;name:string;tier:string}[];
};
const game=document.querySelector<HTMLElement>("#game")!;
const account=document.querySelector<HTMLElement>("#account")!;
const navigation=document.querySelector<HTMLElement>("#navigation")!;
let session:SessionView|null=null;
let drawerExpanded=false;
let selectedDrawerRoot:HostDrawerRoot="world";
const el=(tag:string,cls="",value="")=>{
 const x=document.createElement(tag);x.className=cls;x.textContent=value;return x;
};
const button=(label:string,action:()=>void)=>{
 const b=el("button","ppw-access-button",label) as HTMLButtonElement;
 b.type="button";b.onclick=action;return b;
};
function showError(target:HTMLElement,message:string){
 const x=el("p","ppw-access-error",message);x.setAttribute("role","alert");
 target.prepend(x);
}
async function command(path:string,body:Record<string,unknown>,csrfToken?:string){
 const r=await fetch(path,{method:"POST",credentials:"same-origin",
  headers:{"content-type":"application/json",
   ...(csrfToken?{"x-ppw-csrf":csrfToken}:{})},
  body:JSON.stringify(body)});
 if(!r.ok)throw new Error(r.status===401?"Invalid player sign-in":
  r.status===429?"Too many requests. Try again later.":
  r.status===409?"World changed. Refresh to continue.":
  "Request rejected. Review and try again.");
 return r.json();
}

/** Mobile shell is independent of the workspace root and remains accessible. */
function openSection(section:HostSection){
 drawerExpanded=false;
 const target=hostSectionHash(section);
 if(location.hash!==target)location.hash=target;
 else renderNavigation(section);
}

/** No always-visible tab bar. All departments live inside this one menu. */
function renderNavigation(section:HostSection){
 navigation.replaceChildren();
 document.querySelector("#ppw-drawer-backdrop")?.remove();
 navigation.classList.toggle("ppw-navigation-open",drawerExpanded);
 navigation.hidden=!drawerExpanded;
 const menu=document.querySelector<HTMLButtonElement>(".ppw-shell-menu");
 if(menu)menu.setAttribute("aria-expanded",String(drawerExpanded));
 if(!drawerExpanded)return;
 const backdrop=el("button","ppw-drawer-backdrop") as HTMLButtonElement;
 backdrop.type="button";backdrop.id="ppw-drawer-backdrop";
 backdrop.setAttribute("aria-label","Close promotion menu");
 backdrop.onclick=()=>{drawerExpanded=false;renderNavigation(section);menu?.focus();};
 document.body.append(backdrop);
 const selected=HOST_DRAWER_ROOTS.find(x=>x.key===selectedDrawerRoot)!;
 const drawer=el("section","ppw-nav-drawer");
 drawer.setAttribute("aria-label",selected.label+" menu");
 const head=el("div","ppw-nav-drawer-heading");
 head.append(el("span","","THE PROMOTION OFFICE"),el("strong","","Where to?"));
 const close=button("×",()=>{drawerExpanded=false;renderNavigation(section);menu?.focus();});
 close.className="ppw-nav-drawer-close";
 close.setAttribute("aria-label","Close promotion menu");
 head.append(close);drawer.append(head);
 const roots=el("div","ppw-nav-rootbar");
 roots.setAttribute("aria-label","Departments");
 for(const root of HOST_DRAWER_ROOTS){
  const tab=button("",()=>{selectedDrawerRoot=root.key;renderNavigation(section);});
  const active=selectedDrawerRoot===root.key;
  tab.className="ppw-tab"+(active?" ppw-tab-active":"");
  tab.setAttribute("aria-label",root.label);
  tab.setAttribute("aria-pressed",String(active));
  tab.append(el("span","ppw-tab-icon",root.glyph),el("span","ppw-tab-label",root.label));
  roots.append(tab);
 }
 drawer.append(roots);
 const entries=el("div","ppw-nav-drawer-entries");
 for(const [id,label,description] of selected.destinations){
  const entry=button("",()=>openSection(id as HostSection));
  entry.className="ppw-nav-drawer-entry";
  entry.append(el("strong","",label),el("small","",description));
  if(id===section)entry.setAttribute("aria-current","page");
  entries.append(entry);
 }
 drawer.append(entries);navigation.append(drawer);
}
document.addEventListener("keydown",e=>{
 if(e.key==="Escape"&&drawerExpanded){
  drawerExpanded=false;renderNavigation(readHostSection(location.hash));
 }
});
function renderSection(){
 if(!session?.overview?.promotion)return;
 const section=readHostSection(location.hash);
 const scope:CardSessionScope={worldId:session.worldId,
  promotionId:session.overview.promotion.id,showId:"",
  csrfToken:session.csrfToken};
 renderNavigation(section);
 document.documentElement.dataset.ppwScreen=section;
 // A fresh mounted viewport prevents slow replies from an abandoned desk
 // replacing the next screen. No extra RPC or global store is involved.
 const view=el("div","ppw-workspace");
 game.replaceChildren(view);
 const back=()=>openSection("home");
 if(window.scrollY>0)window.scrollTo(0,0);
 switch(section){
  case "home":mountWorldHomePage(view,scope,openSection);break;
  case "planner":mountPlannerPage(view,scope,back);break;
  case "roster":mountRosterPage(view,scope);break;
  case "backstage":mountPersonaPage(view,scope);break;
  case "market":mountTalentMarketPage(view,scope);break;
  case "contracts":mountContractsPage(view,scope);break;
  case "business":mountBusinessPage(view,scope);break;
  case "staff":mountStaffPage(view,scope);break;
  case "industry":mountIndustryPage(view,scope);break;
  case "calendar":mountCalendarPage(view,scope,back);break;
  case "results":void mountResultsArchivePage(view,scope,back);break;
  case "programmes":mountProgrammePage(view,scope);break;
  case "championships":void mountChampionshipsPage(view,scope,back);break;
  case "teams":mountTagTeamsPage(view,scope);break;
  case "stables":mountStablesPage(view,scope);break;
  case "connections":mountWorkingConnectionsPage(view,scope);break;
  case "more":{
   const panel=el("section","ppw-more");
   panel.append(el("span","ppw-access-kicker","THE CONTROL ROOM"),
    el("h1","","Promotion office"),
    el("p","ppw-access-muted",
     "Every department in one place. Choose where to take the show next."));
   const groups:{title:string;description:string;routes:HostSection[]}[]=[
    {title:"Creative",description:"Your people, titles and long-term stories",
     routes:["programmes","championships","teams","stables","connections"]},
    {title:"The business",description:"Money, contracts and industry intelligence",
     routes:["market","contracts","business","staff","industry"]},
    {title:"The schedule",description:"Upcoming events and the archive",
     routes:["calendar","results"]}
   ];
   for(const group of groups){
    const heading=el("div","ppw-more-heading");
    heading.append(el("h2","",group.title),
     el("p","",group.description));
    const list=el("div","ppw-more-links");
    for(const id of group.routes){
     const item=HOST_SECTIONS.find(x=>x.id===id);
     if(!item)continue;
     const link=button("",()=>openSection(id));
     link.className="ppw-more-link";
     const glyph=el("span","ppw-more-icon",item.glyph);
     glyph.setAttribute("aria-hidden","true");
     const label=el("span","ppw-more-link-title",item.label);
     const arrow=el("span","ppw-more-arrow","→");
     arrow.setAttribute("aria-hidden","true");
     link.append(glyph,label,arrow);
     list.append(link);
    }
    panel.append(heading,list);
   }
   view.append(panel);break;
  }
 }
}
window.addEventListener("hashchange",()=>{drawerExpanded=false;renderSection();});
window.addEventListener("ppw:session-lost",()=>{void loadSession();});

async function loadSession(){
 drawerExpanded=false;document.querySelector("#ppw-drawer-backdrop")?.remove();
 account.replaceChildren();navigation.replaceChildren();navigation.hidden=true;
 delete document.documentElement.dataset.ppwScreen;
 game.replaceChildren(el("p","ppw-access-loading","Opening your promotion…"));
 try{
  const r=await fetch("/api/session",{credentials:"same-origin",
   cache:"no-store"});
  if(r.status===401){session=null;showLogin();return;}
  if(!r.ok)throw new Error("Your promotion is unavailable. Check your connection.");
  session=await r.json() as SessionView;
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
  const menu=button("☰ Menu",()=>{
   const section=readHostSection(location.hash);
   if(!drawerExpanded)selectedDrawerRoot=drawerRootForSection(section);
   drawerExpanded=!drawerExpanded;renderNavigation(section);
  });
  menu.className="ppw-shell-menu";
  menu.setAttribute("aria-label","Open promotion menu");
  menu.setAttribute("aria-controls","navigation");
  menu.setAttribute("aria-expanded","false");
  const signout=button("Sign out",()=>void signOut());
  signout.className="ppw-shell-signout";
  actions.append(menu,signout);
  banner.append(identity,actions);
  account.append(banner);
  if(session.overview.membership!=="ACTIVE"){showJoin();return;}
  if(!session.overview.promotion){showClaim();return;}
  renderSection();
 }catch(e){
  game.replaceChildren();
  showError(game,e instanceof Error?e.message:"Could not open PPW");
  game.append(button("Retry",()=>void loadSession()));
 }
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
 card.append(button("Join World",async()=>{
  try{
   await command("/api/join",{requestId:crypto.randomUUID(),
    expectedRevision:session!.overview.world.revision},session!.csrfToken);
   await loadSession();
  }catch(e){showError(card,e instanceof Error?e.message:"Join failed");}
 }));
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
 for(const p of session.availablePromotions){
  const item=el("div","ppw-access-promotion");
  item.append(el("strong","",p.name),el("small","",p.tier));
  item.append(button("Run this promotion",async()=>{
   try{
    await command("/api/claim",{promotionId:p.id,requestId:crypto.randomUUID(),
     expectedRevision:session!.overview.world.revision},session!.csrfToken);
    await loadSession();
   }catch(e){showError(card,e instanceof Error?e.message:"Claim failed");}
  }));
  card.append(item);
 }
 game.replaceChildren(card);
}
async function signOut(){
 if(session)try{
  await fetch("/api/auth",{method:"DELETE",credentials:"same-origin",
   headers:{"x-ppw-csrf":session.csrfToken}});
 }catch{/* A failed sign-out does not imply local sign-out. */}
 await loadSession();
}
void loadSession();
if("serviceWorker" in navigator){
 window.addEventListener("load",()=>{void navigator.serviceWorker.register("/sw.js")
  .catch(()=>{/* Authenticated PPW still works when install caching is unavailable. */});});
}
