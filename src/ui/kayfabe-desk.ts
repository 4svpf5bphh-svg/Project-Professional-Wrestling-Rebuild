/** Kayfabe Points: an on-demand, account-owned collection and identity desk.
 * No polling, extra global navigation, or generic wrestler-card catalogue.
 */
import type {readKayfabeWorkspace,KpAction} from "../db/kayfabe-points.js";
import "./kayfabe-desk.css";
import {createAnimatedEventPoster} from "./animated-event-poster.js";
import {EVENT_POSTER_SKINS,type EventPosterSku} from "../domain/event-poster-skins.js";
import {type StaffOfficeThemeSku} from "../domain/staff-office-themes.js";
import {createStaffOfficeThemePreview} from "./staff-office-theme-preview.js";
import {type BroadcastPackageSku} from "../domain/broadcast-packages.js";
import {createBroadcastPackageFrame} from "./broadcast-package-frame.js";
import type {KpCreateStyle,KpCreateGimmick} from "../domain/kp-create-wrestler.js";
export type KayfabeView=Awaited<ReturnType<typeof readKayfabeWorkspace>>;
export interface KayfabePort{
 load():Promise<KayfabeView>;
 claim():Promise<unknown>;
 apply(action:KpAction):Promise<unknown>;
 back():void;backLabel?:string;
 openAchievements?:()=>void;
}
const el=(tag:string,cls="",content="")=>{
 const n=document.createElement(tag);n.className=cls;n.textContent=content;return n;
};
const btn=(label:string,fn:()=>void,disabled=false)=>{
 const b=el("button","ppw-kp-button",label) as HTMLButtonElement;
 b.type="button";b.onclick=fn;b.disabled=disabled;return b;
};
const format=(n:number)=>n.toLocaleString("en-GB")+" KP";
export function mountKayfabeDesk(root:HTMLElement,port:KayfabePort){
 let view:KayfabeView|null=null,busy=false,error="",notice="";
 let name="",division:"MEN"|"WOMEN"="MEN",alias="",staffId="";
 let createOpen=false,reviewing=false,posterIndex=0,staffThemeIndex=0,broadcastIndex=0;
 let posterTarget="ALL";
 let broadcastScene:"OPEN"|"MATCH"|"SEGMENT"="OPEN";
 let alignment:"FACE"|"HEEL"|"TWEENER"="FACE";
 let primaryStyle:KpCreateStyle="ALL_ROUNDER",gimmickId:KpCreateGimmick="AUTHENTIC";
 let signatureMove="",finishingMove="";
 const refresh=async()=>{
  busy=true;draw();
  try{view=await port.load();error="";}
  catch(e){error=e instanceof Error?e.message:"Kayfabe Points are unavailable";}
  finally{busy=false;draw();}
 };
 const run=async(action:KpAction)=>{
  if(busy)return;
  busy=true;error="";notice="";draw();
  try{
   const result=await port.apply(action) as {name?:string;market?:string};
   view=await port.load();
   if(action.kind==="CREATE_WRESTLER"){
    name="";division="MEN";alignment="FACE";primaryStyle="ALL_ROUNDER";
    gimmickId="AUTHENTIC";signatureMove="";finishingMove="";
    reviewing=false;createOpen=false;
   }
   if(action.kind==="RENAME_STAFF")alias="";
   notice=result.market==="FREE_AGENT"?
    result.name+" has entered the shared World as a free agent. Every promotion can negotiate normally.":
    action.kind==="RENAME_STAFF"?"Staff display name updated.":
    action.kind==="BUY"?"Unlocked. Your purchase is available on your account.":
    action.kind==="APPLY_BADGE"?"Milestone showcase finish applied.":
    action.kind==="CLEAR_BADGE"?"Standard milestone style restored.":
    action.kind==="APPLY_RESULTS_SKIN"?"Results skin applied.":
    action.kind==="APPLY_EVENT_POSTER"?"Default premium poster applied to your PPVs.":
    action.kind==="SET_SERIES_EVENT_POSTER"?"This PPV now uses the selected poster.":
    action.kind==="CLEAR_SERIES_EVENT_POSTER"?"This PPV now uses your default poster.":
    action.kind==="CLEAR_EVENT_POSTER"?"Standard event artwork restored.":
    action.kind==="APPLY_STAFF_OFFICE_THEME"?"Staff Office appearance updated.":
    action.kind==="CLEAR_STAFF_OFFICE_THEME"?"Original Staff Office appearance restored.":
    action.kind==="APPLY_BROADCAST_PACKAGE"?"Broadcast package applied.":
    action.kind==="CLEAR_BROADCAST_PACKAGE"?"Standard broadcast presentation restored.":
    action.kind==="CLEAR_RESULTS_SKIN"?"Original PPW results appearance restored.":
    "Promotion crest updated.";
  }catch(e){error=e instanceof Error?e.message:"The transaction was not completed";}
  finally{busy=false;draw();}
 };
 const claim=async()=>{
  if(busy)return;
  busy=true;error="";notice="";draw();
  try{
   const result=await port.claim() as {awarded:number;reason?:string};
   view=await port.load();
   notice=result.awarded?format(result.awarded)+" earned from a certified show.":
    result.reason??"No new Kayfabe Points available.";
  }catch(e){error=e instanceof Error?e.message:"Points could not be claimed";}
  finally{busy=false;draw();}
 };
 function draw(){
  root.classList.add("ppw-editor","ppw-kp");root.replaceChildren();
  const head=el("header","ppw-kp-head");
  head.append(btn(port.backLabel??"← Back to Business",port.back));
  head.append(el("span","ppw-kp-kicker","YOUR PERSONAL LEGACY"),
   el("h1","","Kayfabe Points"),
   el("p","ppw-kp-muted","Earned account-wide. A creative collection, never a shortcut to winning."));
  root.append(head);
  if(error)root.append(el("p","ppw-alert ppw-error",error));
  if(notice)root.append(el("p","ppw-alert ppw-success",notice));
  if(!view){
   if(!busy)root.append(btn("Try again",()=>void refresh()));
   return;
  }
  const funds=el("section","ppw-kp-funds");
  funds.append(el("span","ppw-kp-kicker","AVAILABLE BALANCE"),
   el("strong","ppw-kp-total",format(view.balance)),
   el("p","ppw-kp-muted",
    format(view.lifetimeEarned)+" earned · "+format(view.lifetimeSpent)+" used"));
  const grant=el("div","ppw-kp-grant");
  if(view.claim){
   const last=view.claim;
   grant.append(el("strong","","World Year "+last.year+" · Week "+last.week),
    el("p","ppw-kp-muted",last.alreadyClaimed?
     "Already collected for this completed week.":
     !last.played?"No completed show by your promotion that week.":
     last.dailyCapReached?"You have reached today's account-wide limit.":
     "Your completed show has been certified. Claim your weekly reward."));
   grant.append(btn("Claim "+format(view.weeklyAward),
    ()=>void claim(),busy||!last.eligible));
  }else grant.append(el("p","ppw-kp-muted","Points appear after your first completed, certified show."));
  funds.append(grant);root.append(funds);
  const achievements=el("section","ppw-kp-section");
  const earned=view.achievements.filter(a=>a.earned).length;
  achievements.append(el("span","ppw-kp-kicker","YOUR TROPHY CABINET"),
   el("h2","","Promoter milestones"),
   el("p","ppw-kp-muted",earned+" / "+view.achievements.length+
    " earned · certified shows, profitable events and great matches. Milestones can't be bought."));
  // Purchased badge finishes only restyle genuine earned milestones. Show
  // exactly where the purchase is applied; it does not create an achievement.
  if(view.activeBadge){
   const preview=el("div","ppw-kp-active-preview ppw-kp-achievement-"+
    view.activeBadge.toLowerCase());
   preview.append(el("span","ppw-kp-active-symbol","★"),
    el("strong","","Active "+view.activeBadge.toLowerCase()+" milestone frame"),
    el("small","","Applied to unlocked achievements below. This is cosmetic; it does not alter promotion prestige or add new milestones."));
   achievements.append(preview,btn("Use standard milestone frame",()=>void run({
    kind:"CLEAR_BADGE",requestId:crypto.randomUUID()}),busy));
  }else achievements.append(el("p","ppw-kp-muted",
   "Standard milestone frame active. Apply a purchased showcase finish below whenever you like."));
  const badgeList=el("div","ppw-kp-achievements");
  for(const a of [...view.achievements.filter(a=>a.earned),
   ...view.achievements.filter(a=>!a.earned)].slice(0,3)){
   const article=el("article","ppw-kp-badge"+(a.earned?" ppw-kp-earned":"")+
    (a.earned&&view.activeBadge?" ppw-kp-achievement-"+view.activeBadge.toLowerCase():""));
   article.append(el("span","ppw-kp-badge-icon",a.earned?"★":"◇"),
    el("strong","",a.label),
    el("small","",a.earned?"Unlocked":a.progress+" / "+a.target+" "+(a.unit??"shows")));
   badgeList.append(article);
  }
  achievements.append(badgeList);
  if(port.openAchievements)achievements.append(btn(
   "Open Trophy Room · "+view.achievements.length+" achievements →",port.openAchievements));
  root.append(achievements);
  // Legacy crest and trophy finishes retired from new purchase flows.
  // Existing entitlements and balances stay intact.
  // Only the owner's completed shows are restyled. The World UI is unchanged.
  const resultsShop=el("section","ppw-kp-section ppw-kp-results-skins");
  resultsShop.append(el("span","ppw-kp-kicker","BROADCAST PRESENTATION"),
   el("h2","","My results skins"),
   el("p","ppw-kp-muted",
    "Customise only your own completed show reports: headlines, Full Card, HOT TAG and the Post-show Brief. Booking, dashboard and match results never change."));
  const resultsSkins=view.catalogue.filter(item=>item.kind==="RESULTS_SKIN");
  for(const skin of resultsSkins){
   const isFight=skin.sku==="RESULTS_FIGHT_NIGHT";
   const isZine=skin.sku==="RESULTS_UNDERGROUND_ZINE";
   const isRetro=skin.sku==="RESULTS_RETRO_BOOKER_02";
   const style=isRetro?"RETRO_BOOKER_02":isZine?"UNDERGROUND_ZINE":isFight?"FIGHT_NIGHT":"TERRITORY_TV";
   const kind=isRetro?"retro":isZine?"zine":isFight?"fight":"territory";
   const preview=el("div","ppw-kp-"+kind+"-preview");
   preview.append(el("span","ppw-kp-"+kind+"-channel",
    isRetro?"PPW BOOKER 2002 / RESULTS.EXE":
    isZine?"THE UNDERGROUND REPORT · ISSUE 001":
    isFight?"PPW / FIGHT NIGHT":"★ PPW TERRITORY TELEVISION"),
    el("strong","",isRetro?"RETRO BOOKER ’02":isZine?"UNDERGROUND ZINE":isFight?"FIGHT NIGHT":"TERRITORY TV"),
    el("span","ppw-kp-"+kind+"-sub",isRetro?
     "Classic PC blue & red · grey menus · pixel-style headlines":
    isZine?
     "Punk orange · black ink · off-white indie fanzine":
     isFight?"Clean white · bold black · red sports reports":
     "Vintage red · championship gold · cream reports"));
   const owned=view.entitlements.includes(skin.sku);
   const active=view.activeResultsSkin===style;
   const row=el("div","ppw-kp-results-skin-row");
   const info=el("div","ppw-kp-item-copy");
   info.append(el("strong","",skin.label),
    el("small","",owned?active?"Owned · applied to your results":"Owned · ready to apply":
     "One-time "+format(skin.price)+" · account-wide"));
   row.append(info,btn(active?"Applied":owned?"Apply":"Unlock",
    ()=>void run(owned?
     {kind:"APPLY_RESULTS_SKIN",sku:skin.sku,requestId:crypto.randomUUID()}:
     {kind:"BUY",sku:skin.sku,requestId:crypto.randomUUID()}),
    busy||active||(!owned&&view.balance<skin.price)));
   resultsShop.append(preview,row);
  }
  if(view.activeResultsSkin)resultsShop.append(btn("Use original PPW results",()=>void run({
   kind:"CLEAR_RESULTS_SKIN",requestId:crypto.randomUUID()}),busy));
  root.append(resultsShop);
  // Keep just ONE animated preview in the DOM: 18 designs, one lightweight
  // player-controlled animation at a time, no image assets or repeated reads.
  const posterShop=el("section","ppw-kp-section ppw-kp-event-posters");
  posterShop.append(el("span","ppw-kp-kicker","PREMIUM SHOW PRESENTATION"),
   el("h2","","Animated event posters"),
   el("p","ppw-kp-muted","Real CSS/SVG animations. Each style is 1,250 KP and stays on your account. Your own PPVs and specials use their actual event names. The match card is never invented."));
  const options=view.catalogue.filter(item=>item.kind==="EVENT_POSTER");
  if(options.length){
   posterIndex=Math.min(Math.max(0,posterIndex),options.length-1);
   const selected=options[posterIndex]!;
   const picker=el("div","ppw-kp-poster-picker");
   const previous=btn("← Previous",()=>{posterIndex=(posterIndex+options.length-1)%options.length;draw();},busy);
   const next=btn("Next →",()=>{posterIndex=(posterIndex+1)%options.length;draw();},busy);
   const selector=el("select","ppw-kp-input") as HTMLSelectElement;
   selector.setAttribute("aria-label","Choose animated poster design");
   for(let i=0;i<options.length;i++){
    const option=el("option","",String(i+1).padStart(2,"0")+" · "+options[i]!.label) as HTMLOptionElement;
    option.value=String(i);selector.append(option);
   }
   selector.value=String(posterIndex);
   selector.onchange=()=>{posterIndex=Number(selector.value);draw();};
   picker.append(previous,selector,next);
   posterShop.append(picker);
   const preview=createAnimatedEventPoster({style:selected.style,eventName:selected.label,
    promotionName:view.promotionName});
   if(preview){preview.classList.add("ppw-kp-poster-showcase");posterShop.append(preview);}
   const targets=[{seriesId:"ALL",name:"Default for other PPVs",style:view.activeEventPoster},
    ...view.premiumEventPosters];
   if(!targets.some(t=>t.seriesId===posterTarget))posterTarget="ALL";
   const selectTarget=el("select","ppw-kp-input") as HTMLSelectElement;
   selectTarget.setAttribute("aria-label","Choose PPV to customise");
   for(const t of targets){
    const option=el("option","",t.name) as HTMLOptionElement;
    option.value=t.seriesId;selectTarget.append(option);
   }
   selectTarget.value=posterTarget;
   selectTarget.onchange=()=>{posterTarget=selectTarget.value;draw();};
   const targetLabel=el("label","ppw-kp-poster-target");
   targetLabel.append(el("strong","","Apply this poster to"),selectTarget);
   posterShop.append(targetLabel);
   const chosen=targets.find(t=>t.seriesId===posterTarget)!;
   posterShop.append(el("small","ppw-kp-muted",
    "Current design: "+(chosen.style??"Standard artwork")+
    ". Each PPV may use a different owned poster."));
   const owned=view.entitlements.includes(selected.sku);
   const active=chosen.style===selected.style;
   const detail=el("div","ppw-kp-poster-details");
   const copy=el("div","ppw-kp-item-copy");
   copy.append(el("strong","",selected.label),
    el("small","",active?"Owned · applied":owned?"Owned · ready to apply":
     "One-time "+format(selected.price)+" · account-wide"),
    el("small","","Preview title is illustrative. Actual shows display their own event names."));
   detail.append(copy,btn(active?"Applied":owned?"Apply":"Unlock",
    ()=>void run(owned?
     posterTarget==="ALL"?{kind:"APPLY_EVENT_POSTER",sku:selected.sku as EventPosterSku,requestId:crypto.randomUUID()}:
       {kind:"SET_SERIES_EVENT_POSTER",seriesId:posterTarget,sku:selected.sku as EventPosterSku,
        requestId:crypto.randomUUID()}:
     {kind:"BUY",sku:selected.sku,requestId:crypto.randomUUID()}),
    busy||active||(!owned&&view.balance<selected.price)));
   posterShop.append(detail);
   if(posterTarget==="ALL"&&view.activeEventPoster)
    posterShop.append(btn("Use standard event artwork",
     ()=>void run({kind:"CLEAR_EVENT_POSTER",requestId:crypto.randomUUID()}),busy));
   else if(posterTarget!=="ALL"&&chosen.style)
    posterShop.append(btn("Restore default artwork for "+chosen.name,
     ()=>void run({kind:"CLEAR_SERIES_EVENT_POSTER",seriesId:posterTarget,
      requestId:crypto.randomUUID()}),busy));

