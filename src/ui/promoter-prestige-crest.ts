/** Compact CSS-built promoter crest. Never creates titles, artwork or gameplay effects.
 * The rank and achievements are certified facts supplied by the server.
 */
import "./promoter-prestige-crest.css";
export interface PromoterPrestigeCrestOptions{
 rank:string;earned:number;total:number;finish?:"GOLD"|"PLATINUM"|null;
 onOpen?:()=>void;
}
export function createPromoterPrestigeCrest(options:PromoterPrestigeCrestOptions):HTMLElement{
 const {rank,earned,total,finish,onOpen}=options;
 const card=document.createElement(onOpen?"button":"section");
 card.className="ppw-promoter-prestige-crest";
 card.dataset.finish=finish?.toLowerCase()??"standard";
 if(onOpen){
  const button=card as HTMLButtonElement;
  button.type="button";button.onclick=onOpen;
  button.setAttribute("aria-label","View your "+rank.toLowerCase()+" promoter prestige and "+earned+" earned achievements");
 }else card.setAttribute("aria-label","Promoter prestige: "+rank);
 const shield=document.createElement("span");
 shield.className="ppw-prestige-crest-shield";
 shield.setAttribute("aria-hidden","true");
 const symbol=document.createElement("span");
 symbol.className="ppw-prestige-crest-symbol";symbol.textContent="★";
 shield.append(symbol);
 const copy=document.createElement("span");
 copy.className="ppw-prestige-crest-copy";
 const label=document.createElement("span");
 label.className="ppw-prestige-crest-eyebrow";
 label.textContent="PROMOTER PRESTIGE";
 const title=document.createElement("strong");
 title.className="ppw-prestige-crest-rank";
 title.textContent=rank.replaceAll("_"," ");
 const sub=document.createElement("span");
 sub.className="ppw-prestige-crest-progress";
 sub.textContent=earned+" / "+total+" achievements earned";
 copy.append(label,title,sub);
 card.append(shield,copy);
 if(onOpen){
  const arrow=document.createElement("span");
  arrow.className="ppw-prestige-crest-chevron";
  arrow.textContent="›";
  arrow.setAttribute("aria-hidden","true");card.append(arrow);
 }
 return card;
}
