/** Kayfabe Points: an on-demand, account-owned collection and identity desk.
 * No polling, extra global navigation, or generic wrestler-card catalogue.
 */
import type {readKayfabeWorkspace,KpAction} from "../db/kayfabe-points.js";
import "./kayfabe-desk.css";
import type {KpCreateStyle,KpCreateGimmick} from "../domain/kp-create-wrestler.js";
export type KayfabeView=Awaited<ReturnType<typeof readKayfabeWorkspace>>;
export interface KayfabePort{
 load():Promise<KayfabeView>;
 claim():Promise<unknown>;
 apply(action:KpAction):Promise<unknown>;
 back():void;backLabel?:string;
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
 let createOpen=false,reviewing=false;
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
    action.kind==="APPLY_BADGE"?"Prestige badge finish applied.":
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
  achievements.append(el("span","ppw-kp-kicker","EARNED, NOT BOUGHT"),
   el("h2","","Promoter milestones"),
   el("p","ppw-kp-muted","Achievements come from verified completed shows. Cosmetics only change their presentation."));
  const badgeList=el("div","ppw-kp-achievements");
  for(const a of view.achievements){
   const article=el("article","ppw-kp-badge"+(a.earned?" ppw-kp-earned":"")+
    (a.earned&&view.activeBadge?" ppw-kp-achievement-"+view.activeBadge.toLowerCase():""));
   article.append(el("span","ppw-kp-badge-icon",a.earned?"★":"◇"),
    el("strong","",a.label),
    el("small","",a.earned?"Unlocked":a.progress+" / "+a.target+" shows"));
   badgeList.append(article);
  }
  achievements.append(badgeList);root.append(achievements);
  const shop=el("section","ppw-kp-section");
  shop.append(el("span","ppw-kp-kicker","COSMETIC ONLY"),el("h2","","Promotion style & prestige"),
   el("p","ppw-kp-muted","Your shop unlocks travel with your account. Promotion crests can be applied to this promotion, without changing its business standing."));
  const list=el("div","ppw-kp-catalogue");
  for(const item of view.catalogue){
   const owned=view.entitlements.includes(item.sku),isBrand=item.kind==="BRAND";
   const code=isBrand?item.sku.replace("BRAND_",""):"BADGE";
   const article=el("article","ppw-kp-item");
   const symbol=el("span","ppw-kp-symbol",isBrand?"PPW":"★");
   symbol.dataset.style=code;
   const detail=el("div","ppw-kp-item-copy");
   detail.append(el("strong","",item.label),
    el("small","",owned?"Owned · account-wide":format(item.price)));
   const activate=isBrand?view.activeBrand===code:
    view.activeBadge===item.sku.replace("BADGE_","");
   article.append(symbol,detail,
    btn(activate?"Applied":owned?"Apply":"Unlock",
     ()=>void run(owned?isBrand?
      {kind:"APPLY_BRAND",sku:item.sku as "BRAND_CHROME"|"BRAND_NEON"|"BRAND_GOLD",requestId:crypto.randomUUID()}:
      {kind:"APPLY_BADGE",sku:item.sku as "BADGE_GOLD"|"BADGE_PLATINUM",requestId:crypto.randomUUID()}:
      {kind:"BUY",sku:item.sku,requestId:crypto.randomUUID()}),
     busy||activate||(!owned&&view.balance<item.price)));
   list.append(article);
  }
  shop.append(list);root.append(shop);
  const people=el("section","ppw-kp-section");
  people.append(el("span","ppw-kp-kicker","STAFF IDENTITIES"),
   el("h2","","Personalise your staff"),
   el("p","ppw-kp-muted","Change the display name of somebody you employ. Abilities, contracts and wages never change."));
  if(view.staff.length){
   const pick=el("select","ppw-kp-input") as HTMLSelectElement;
   pick.setAttribute("aria-label","Choose a staff member");
   for(const s of view.staff){
    const opt=el("option","",s.alias??s.staffId.replaceAll("-"," ").toUpperCase()) as HTMLOptionElement;
    opt.value=s.staffId;pick.append(opt);
   }
   const selected=view.staff.some(s=>s.staffId===staffId)?staffId:view.staff[0]!.staffId;
   pick.value=selected;staffId=selected;pick.onchange=()=>{staffId=pick.value;};
   const field=el("input","ppw-kp-input") as HTMLInputElement;
   field.placeholder="New display name";field.maxLength=48;field.value=alias;
   field.setAttribute("aria-label","New staff display name");
   field.oninput=()=>{alias=field.value;};
   people.append(pick,field,btn("Rename · "+format(view.staffAliasPrice),()=>{
    const target=alias.trim();
    if(target.length<3){error="Enter a name of at least three characters.";draw();return;}
    void run({kind:"RENAME_STAFF",staffId,name:target,requestId:crypto.randomUUID()});
   },busy||view.balance<view.staffAliasPrice));
  }else people.append(el("p","ppw-kp-muted","Hire a member of staff first."));
  root.append(people);
  const creation=el("section","ppw-kp-section ppw-kp-creation");
  creation.append(el("span","ppw-kp-kicker","WORLD CONTRIBUTION"),
   el("h2","","Create a Wrestler"),
   el("p","ppw-kp-muted","Design a new wrestler for the shared World. Your KP pays for their introduction, not their contract. Once finalised, they enter the free-agent market where every promotion can negotiate to hire them."));
  const quotaUsed=view.createdTalent.some(p=>p.year===view!.worldYear);
  if(!createOpen&&!quotaUsed){
   creation.append(btn("Design a Wrestler · "+format(view.createTalentPrice),
    ()=>{createOpen=true;reviewing=false;draw();},busy));
  }
  if(quotaUsed)creation.append(el("p","ppw-kp-muted",
   "Your one wrestler contribution for this World year is complete."));
  if(createOpen&&!quotaUsed){
   const draft=el("section","ppw-kp-draft");
   draft.append(el("span","ppw-kp-kicker","CHARACTER STUDIO"),
    el("p","ppw-kp-muted","Choose their character and ring identity. Every created wrestler starts as a balanced prospect with the same fixed abilities. Nothing enters the World or costs KP until you finalise."));
   function choose(label:string,options:{id:string;label:string}[],value:string,
    update:(next:string)=>void){
    const group=el("label","ppw-kp-field");
    group.append(el("span","",label));
    const select=el("select","ppw-kp-input") as HTMLSelectElement;
    select.setAttribute("aria-label",label);
    for(const option of options){
     const node=el("option","",option.label) as HTMLOptionElement;
     node.value=option.id;select.append(node);
    }
    select.value=value;select.onchange=()=>update(select.value);
    group.append(select);return group;
   }
   function field(label:string,value:string,placeholder:string,change:(s:string)=>void){
    const group=el("label","ppw-kp-field");
    group.append(el("span","",label));
    const input=el("input","ppw-kp-input") as HTMLInputElement;
    input.setAttribute("aria-label",label);input.value=value;
    input.placeholder=placeholder;input.maxLength=70;
    input.oninput=()=>change(input.value);
    group.append(input);return group;
   }
   if(!reviewing){
    const form=el("div","ppw-kp-creator-fields");
    form.append(field("Wrestler name",name,"Name your wrestler",v=>{name=v;}));
    form.append(choose("Wrestler division",[
     {id:"MEN",label:"Men's division"},{id:"WOMEN",label:"Women's division"}],
     division,v=>{division=v as typeof division;}));
    form.append(choose("Alignment",view.createOptions.alignments.map(id=>({
     id,label:id==="FACE"?"Face":id==="HEEL"?"Heel":"Tweener"})),
     alignment,v=>{alignment=v as typeof alignment;}));
    form.append(choose("Wrestling style",view.createOptions.styles,primaryStyle,
     v=>{primaryStyle=v as KpCreateStyle;}));
    form.append(choose("Character archetype",view.createOptions.gimmicks,gimmickId,
     v=>{gimmickId=v as KpCreateGimmick;}));
    form.append(field("Signature move",signatureMove,"e.g. Lightning Strike",
     v=>{signatureMove=v;}));
    form.append(field("Finishing move",finishingMove,"e.g. Comet Driver",
     v=>{finishingMove=v;}));
    draft.append(form);
    const actions=el("div","ppw-kp-creator-actions");
    actions.append(btn("Review Wrestler",()=>{
     if(name.trim().length<3||signatureMove.trim().length<3||
      finishingMove.trim().length<3){
      error="Give your wrestler a name, signature move and finisher (at least 3 characters each).";
      draw();return;
     }
     if(signatureMove.trim().toLowerCase()===finishingMove.trim().toLowerCase()){
      error="Your signature move and finisher must have different names.";draw();return;
     }
     error="";reviewing=true;draw();
    },busy),btn("Cancel",()=>{createOpen=false;reviewing=false;error="";draw();},busy));
    draft.append(actions);
   }else{
    const details=el("div","ppw-kp-creation-review");
    details.append(el("span","ppw-kp-kicker","READY TO FINALISE"),
     el("h3","",name.trim()),
     el("p","",division==="WOMEN"?"Women's division":"Men's division"),
     el("p","","Alignment · "+alignment),
     el("p","","Style · "+primaryStyle.replaceAll("_"," ")),
     el("p","","Character · "+(view.createOptions.gimmicks.find(g=>g.id===gimmickId)?.label??gimmickId)),
     el("p","","Signature · "+signatureMove.trim()),
     el("p","","Finisher · "+finishingMove.trim()),
     el("p","ppw-kp-muted","Prospect-level stats fixed for fair multiplayer. The wrestler joins the free-agent market; no contract is awarded to you."));
    draft.append(details);
    const actions=el("div","ppw-kp-creator-actions");
    actions.append(btn("Finalise · "+format(view.createTalentPrice),()=>{
     if(!window.confirm("Finalise "+name.trim()+" and spend "+
      format(view!.createTalentPrice)+"? This creates a permanent shared free agent, "+
      "not a wrestler on your roster. All promotions may bid. This cannot be undone."))return;
     void run({kind:"CREATE_WRESTLER",name:name.trim(),division,
      alignment,primaryStyle,gimmickId,
      signatureMove:signatureMove.trim(),finishingMove:finishingMove.trim(),
      requestId:crypto.randomUUID()});
    },busy||view.balance<view.createTalentPrice));
    actions.append(btn("Edit Wrestler",()=>{reviewing=false;draw();},busy));
    draft.append(actions);
   }
   creation.append(draft);
  }
  if(view.createdTalent.length){
   const history=el("div","ppw-kp-contributions");
   for(const p of view.createdTalent)history.append(el("p","",
    p.name+" · introduced in Year "+p.year+" · World talent market"));
   creation.append(history);
  }
  root.append(creation);
 }
 void refresh();
}
