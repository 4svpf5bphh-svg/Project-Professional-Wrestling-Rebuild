/** Standalone, on-demand Trophy Room for certified promoter achievements.
 *  No polling, browser persistence, prize purchasing or World writes.
 */
import type {readPromoterAchievementWorkspace} from "../db/kayfabe-points.js";
import {createPromoterPrestigeCrest} from "./promoter-prestige-crest.js";
import {PROMOTER_ACHIEVEMENT_CATEGORIES,
 type AchievementCategory,type AchievementTier,type PromoterAchievement}
 from "../domain/promoter-achievements.js";
import "./achievements-desk.css";
export type TrophyRoomView=Awaited<ReturnType<typeof readPromoterAchievementWorkspace>>;
export interface TrophyRoomPort{
 load():Promise<TrophyRoomView>;
 back():void;
 openWallet():void;
}
const el=(tag:string,cls="",label="")=>{
 const node=document.createElement(tag);
 node.className=cls;node.textContent=label;return node;
};
const button=(label:string,action:()=>void,cls="ppw-trophy-button")=>{
 const node=el("button",cls,label) as HTMLButtonElement;
 node.type="button";node.onclick=action;return node;
};
const labels:Record<AchievementTier,string>={
 FOUNDATION:"FOUNDATION",SILVER:"SILVER",GOLD:"GOLD",ICON:"ICON"
};
const filters=[
 {key:"ALL",label:"All"},
 {key:"EARNED",label:"Earned"},
 {key:"PROGRESS",label:"In progress"},
 {key:"LOCKED",label:"Not started"}
] as const;
type StatusFilter=typeof filters[number]["key"];
function makeTrophy(a:PromoterAchievement,featured=false){
 const article=el("article","ppw-trophy-tile"+(a.earned?" is-earned":"")+
  (featured?" is-featured":""));
 article.dataset.tier=a.tier.toLowerCase();
 const head=el("div","ppw-trophy-item-head");
 const icon=el("span","ppw-trophy-item-icon",a.earned?"★":"◇");
 icon.setAttribute("aria-hidden","true");
 const title=el("div","ppw-trophy-item-title");
 title.append(el("strong","",a.label),
  el("span","",""+labels[a.tier]+" · "+PROMOTER_ACHIEVEMENT_CATEGORIES[a.category].label));
 head.append(icon,title,
  el("span","ppw-trophy-item-status",a.earned?"EARNED":"TO EARN"));
 article.append(head,el("p","ppw-trophy-item-description",a.description));
 const foot=el("div","ppw-trophy-item-foot");
 foot.append(el("span","",a.earned?"Achievement unlocked":
  a.progress.toLocaleString("en-GB")+" / "+a.target.toLocaleString("en-GB")+" "+a.unit),
  el("strong","",a.earned?"✓":a.percent+"%"));
 article.append(foot);
 const track=el("div","ppw-trophy-progress");
 const fill=el("span","ppw-trophy-progress-fill");
 fill.style.width=a.percent+"%";
 track.append(fill);track.setAttribute("role","progressbar");
 track.setAttribute("aria-label",a.label+" progress");
 track.setAttribute("aria-valuemin","0");track.setAttribute("aria-valuemax",String(a.target));
 track.setAttribute("aria-valuenow",String(a.progress));
 article.append(track);
 return article;
}
export function mountAchievementDesk(root:HTMLElement,port:TrophyRoomPort){
 let view:TrophyRoomView|null=null;
 let filter:StatusFilter="ALL",category:AchievementCategory|"ALL"="ALL";
 let busy=true,error="";
 const load=async()=>{
  busy=true;render();
  try{view=await port.load();error="";}
  catch(e){error=e instanceof Error?e.message:"The Trophy Room could not be opened.";}
  finally{busy=false;render();}
 };
 function render(){
  root.classList.add("ppw-editor","ppw-trophy-room");root.replaceChildren();
  const header=el("header","ppw-trophy-header");
  const actions=el("div","ppw-trophy-top-actions");
  actions.append(button("← World",port.back),button("★ KP Wallet",port.openWallet));
  header.append(actions,
   el("span","ppw-trophy-kicker","THE PROMOTER LEGACY"),
   el("h1","","TROPHY ROOM"),
   el("p","ppw-trophy-subhead","Your achievements are earned through wrestling history, not bought in the shop."));
  root.append(header);
  if(error)root.append(el("p","ppw-trophy-error",error));
  if(!view){
   root.append(el("p","ppw-trophy-muted",busy?"Checking your completed World records…":"There are no achievements to show."));
   if(!busy)root.append(button("Retry Trophy Room",()=>void load()));
   return;
  }
  const prestige=createPromoterPrestigeCrest({
   rank:view.rank,earned:view.earnedCount,total:view.total,
   finish:view.activeBadge==="GOLD"||view.activeBadge==="PLATINUM"?view.activeBadge:null
  });
  prestige.classList.add("ppw-trophy-prestige-crest");
  root.append(prestige);
  const counts=el("section","ppw-trophy-counts");
  for(const [label,value] of [
   ["EARNED",view.earnedCount],
   ["AVAILABLE",view.total],
   ["PRESTIGE",view.prestigeScore]
  ] as const){
   const card=el("div","ppw-trophy-count");
   card.append(el("span","",label),el("strong","",value.toLocaleString("en-GB")));
   counts.append(card);
  }
  root.append(counts);
  const inProgress=view.achievements.filter(a=>!a.earned).sort((a,b)=>
   (b.progress>0?b.percent:-1)-(a.progress>0?a.percent:-1)||
   a.target-b.target).slice(0,3);
  if(inProgress.length){
   const next=el("section","ppw-trophy-next");
   next.append(el("span","ppw-trophy-kicker","CLOSE TO THE NEXT POP"),
    el("h2","","Within reach"),
    el("p","ppw-trophy-muted","The nearest objectives based on your verified promotion record."));
   const panel=el("div","ppw-trophy-next-grid");
   inProgress.forEach(a=>panel.append(makeTrophy(a,true)));
   next.append(panel);root.append(next);
  }
  const filtersPanel=el("section","ppw-trophy-filter-panel");
  filtersPanel.append(el("span","ppw-trophy-kicker","COLLECTION / PROGRESS"),
   el("h2","","Every achievement"));
  const bar=el("div","ppw-trophy-filter-list");
  for(const item of filters){
   const tab=button(item.label,()=>{filter=item.key;render();},"ppw-trophy-filter");
   tab.setAttribute("aria-pressed",String(filter===item.key));bar.append(tab);
  }
  const selector=el("select","ppw-trophy-category") as HTMLSelectElement;
  selector.setAttribute("aria-label","Achievement category");
  for(const [key,label] of [
   ["ALL","All categories"],
   ...Object.entries(PROMOTER_ACHIEVEMENT_CATEGORIES).map(([k,v])=>[k,v.label])
  ]){
   const opt=el("option","",label) as HTMLOptionElement;opt.value=key;selector.append(opt);
  }
  selector.value=category;selector.onchange=()=>{
   category=selector.value as typeof category;render();
  };
  filtersPanel.append(bar,selector);root.append(filtersPanel);
  const visible=view.achievements.filter(a=>(category==="ALL"||a.category===category)&&(
   filter==="ALL"||filter==="EARNED"&&a.earned||
   filter==="PROGRESS"&&!a.earned&&a.progress>0||
   filter==="LOCKED"&&!a.earned&&a.progress===0));
  if(visible.length===0){
   root.append(el("p","ppw-trophy-no-results","No trophies in this selection yet. Choose another category or status."));
  }else{
   for(const [key,meta] of Object.entries(PROMOTER_ACHIEVEMENT_CATEGORIES) as
    [AchievementCategory,typeof PROMOTER_ACHIEVEMENT_CATEGORIES[AchievementCategory]][]){
    const group=visible.filter(a=>a.category===key);
    if(!group.length)continue;
    const section=el("section","ppw-trophy-group");
    const head=el("div","ppw-trophy-group-head");
    head.append(el("span","ppw-trophy-group-symbol",meta.icon),
     el("div","",meta.label+" · "+group.filter(a=>a.earned).length+" / "+group.length));
    section.append(head,el("p","ppw-trophy-muted",meta.subtitle));
    const grid=el("div","ppw-trophy-grid");
    for(const a of group)grid.append(makeTrophy(a));
    section.append(grid);root.append(section);
   }
  }
  const note=el("p","ppw-trophy-footer","This cabinet tracks the current promotion's certified history. It does not grant cash, alter wrestler ability or automatically award Kayfabe Points.");
  root.append(note);
 }
 void load();
}
