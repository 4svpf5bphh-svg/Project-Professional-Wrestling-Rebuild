import {mountWorldHomePage} from "../../../src/web/card-browser.js";
import type {CardSessionScope} from "../../../src/web/card-client.js";
import "../screen.css";

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
let session:SessionView|null=null;
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
async function loadSession(){
 account.replaceChildren();game.replaceChildren(
  el("p","ppw-access-loading","Opening the PPW World…"));
 try{
  const r=await fetch("/api/session",{credentials:"same-origin",
   cache:"no-store"});
  if(r.status===401){session=null;showLogin();return;}
  if(!r.ok)throw new Error("World unavailable. Check the game host connection.");
  session=await r.json() as SessionView;
  if(!session||!session.csrfToken||!session.worldId||!session.overview)
   throw new Error("Incomplete game session");
  const banner=el("div","ppw-account-banner");
  banner.append(el("span","","Signed in · "+session.playerId),
   button("Sign out",()=>void signOut()));
  account.append(banner);
  if(session.overview.membership!=="ACTIVE"){showJoin();return;}
  if(!session.overview.promotion){showClaim();return;}
  const scope:CardSessionScope={worldId:session.worldId,
   promotionId:session.overview.promotion.id,showId:"",
   csrfToken:session.csrfToken};
  mountWorldHomePage(game,scope);
 }catch(e){
  game.replaceChildren();
  showError(game,e instanceof Error?e.message:"Could not open PPW");
  game.append(button("Retry",()=>void loadSession()));
 }
}
function showLogin(){
 game.replaceChildren();
 const card=el("section","ppw-access-panel");
 card.append(el("span","ppw-access-kicker","PPW / YOUR WORLD"),
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
