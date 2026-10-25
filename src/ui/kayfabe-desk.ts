/** Kayfabe Points: an on-demand, account-owned collection and identity desk.
 * No polling, extra global navigation, or generic wrestler-card catalogue.
 */
import type {readKayfabeWorkspace,KpAction} from "../db/kayfabe-points.js";
import "./kayfabe-desk.css";
export type KayfabeView=Awaited<ReturnType<typeof readKayfabeWorkspace>>;
export interface KayfabePort{
 load():Promise<KayfabeView>;
 claim():Promise<unknown>;
 apply(action:KpAction):Promise<unknown>;
 back():void;
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
   name="";alias="";
   notice=result.market==="FREE_AGENT"?
    result.name+" has entered the shared World as a free agent. Every promotion can negotiate normally.":
    action.kind==="RENAME_STAFF"?"Staff display name updated.":
    action.kind==="BUY"?"Unlocked. Your purchase is available on your account.":
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
  head.append(btn("← Back to Business",port.back));
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
   el("p","ppw-kp-muted","A major Kayfabe Points purchase. Add one balanced rookie per World year. They enter the shared free-agent market, not your roster. All promotions may try to sign them."));
  const field=el("input","ppw-kp-input") as HTMLInputElement;
  field.placeholder="Wrestler's name";field.value=name;field.maxLength=48;
  field.setAttribute("aria-label","New wrestler name");
  field.oninput=()=>{name=field.value;};
  const pick=el("select","ppw-kp-input") as HTMLSelectElement;
  pick.setAttribute("aria-label","Wrestler division");
  for(const option of ["MEN","WOMEN"] as const){
   const o=el("option","",option==="MEN"?"Men's division":"Women's division") as HTMLOptionElement;
   o.value=option;pick.append(o);
  }
  pick.value=division;pick.onchange=()=>{division=pick.value as typeof division;};
  creation.append(field,pick,btn("Create for "+format(view.createTalentPrice),()=>{
   if(name.trim().length<3){error="Enter a name of at least three characters.";draw();return;}
   if(!window.confirm("Spend "+format(view!.createTalentPrice)+" to introduce "+
    name.trim()+" as a shared World free agent? They will NOT join your promotion automatically."))return;
   void run({kind:"CREATE_WRESTLER",name:name.trim(),division,requestId:crypto.randomUUID()});
  },busy||view.balance<view.createTalentPrice||
   view.createdTalent.some(p=>p.year===view!.worldYear)));
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
