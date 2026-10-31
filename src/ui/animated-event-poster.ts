/** Lightweight, reusable animated event posters. All imagery is CSS or inlined
 * SVG: the KP shop and booked premium events render the same design.
 * No timer, polling, image generation, or gameplay calls.
 */
import {eventPosterByStyle,type EventPosterStyle} from "../domain/event-poster-skins.js";
import "./animated-event-poster.css";
export interface EventPosterOptions{
 style:string|null|undefined;eventName:string;promotionName:string;
 mainEvent?:string|null;compact?:boolean;
}
const text=(tag:string,cls:string,content:string)=>{
 const x=document.createElement(tag);x.className=cls;x.textContent=content;return x;
};
const TAGLINES:Record<EventPosterStyle,string>={
 THUNDER_STRIKE:"STORMS CREATE LEGENDS",HIGH_NOON:"THE HEAT IS ON",
 NEON_NIGHTS:"AFTER DARK. ALL ACTION.",SPOTLIGHT_SHOWDOWN:"THE WORLD IS WATCHING",
 EMPIRE:"POWER · PRESTIGE · LEGACY",INFERNO:"FEEL THE HEAT",
 RETRO_BROADCAST:"WORLD CLASS WRESTLING",VEGAS_LIGHTS:"ALL BETS ARE OFF",
 ECLIPSE:"WHEN THE LIGHT GOES OUT",RIOT_SIGNAL:"NO RULES. NO PERMISSION.",
 STEELWORKS:"NO GUTS. NO GLORY.",FROZEN_CROWN:"THE KINGDOM GOES COLD",
 LASER_GRID:"WELCOME TO THE FUTURE",CROWN_THEATRE:"THE CURTAIN RISES",
 TIDAL_FORCE:"THE TIDE IS TURNING",BLOOD_MOON:"THE NIGHT BELONGS TO US",
 CIRCUIT_BREAKER:"SYSTEM OVERRIDE",AFTERSHOCK:"BRACE FOR IMPACT"
};
const circuitPath="M0 48H80L128 96V143H186L240 89H300 M0 260H62L105 216H168L228 276H300 M0 352H113L163 302V260H217L300 187";
const lightningPaths=["M250 -20 L174 84 L204 95 L122 203 L161 201 L88 349",
 "M8 35 L68 104 L39 132 L112 219 L90 235 L172 320"];
function decoration(root:HTMLElement,style:EventPosterStyle){
 const count=style==="INFERNO"?8:style==="FROZEN_CROWN"?9:
  style==="LASER_GRID"?3:style==="TIDAL_FORCE"?3:
  style==="AFTERSHOCK"?3:style==="VEGAS_LIGHTS"?4:style==="CROWN_THEATRE"?2:
  style==="SPOTLIGHT_SHOWDOWN"?2:style==="BLOOD_MOON"?2:1;
 const effect=text("div","ppw-ep-effects","");
 effect.setAttribute("aria-hidden","true");
 for(let i=0;i<count;i++){
  const layer=text("span","ppw-ep-layer ppw-ep-layer-"+i,"");
  layer.style.setProperty("--i",String(i));effect.append(layer);
 }
 if(style==="THUNDER_STRIKE"||style==="CIRCUIT_BREAKER"){
  const ns="http://www.w3.org/2000/svg";
  const svg=document.createElementNS(ns,"svg");
  svg.setAttribute("viewBox",style==="THUNDER_STRIKE"?"0 0 290 385":"0 0 300 400");
  svg.setAttribute("preserveAspectRatio","none");
  for(const d of style==="THUNDER_STRIKE"?lightningPaths:[circuitPath]){
   const path=document.createElementNS(ns,"path");path.setAttribute("d",d);svg.append(path);
  }
  effect.append(svg);
 }
 root.append(effect);
}
let observer:IntersectionObserver|null=null;
function pauseOutsideViewport(el:HTMLElement){
 if(typeof IntersectionObserver==="undefined")return;
 observer??=new IntersectionObserver(entries=>{
  for(const entry of entries)(entry.target as HTMLElement).dataset.visible=
   entry.isIntersecting?"true":"false";
 },{rootMargin:"40px"});
 el.dataset.visible="false";observer.observe(el);
}
export function createAnimatedEventPoster(options:EventPosterOptions):HTMLElement|null{
 const design=eventPosterByStyle(options.style);
 if(!design)return null;
 const poster=text("div","ppw-event-poster","");
 poster.dataset.poster=design.style.toLowerCase().replaceAll("_","-");
 poster.dataset.size=options.compact?"compact":"preview";
 poster.setAttribute("role","img");
 poster.setAttribute("aria-label",options.eventName+" event poster for "+options.promotionName+
  (options.mainEvent?" featuring "+options.mainEvent:""));
 decoration(poster,design.style);
 const top=text("div","ppw-ep-top","");
 top.append(text("span","ppw-ep-promoter",options.promotionName),
  text("small","ppw-ep-type","PREMIUM LIVE EVENT"));
 const middle=text("div","ppw-ep-middle","");
 const heading=text("strong","ppw-ep-title",options.eventName);
 const line=text("span","ppw-ep-tagline",TAGLINES[design.style]);
 middle.append(heading,line);
 const foot=text("div","ppw-ep-footer","");
 foot.append(text("span","ppw-ep-main-label",options.mainEvent?"MAIN EVENT":"MATCH CARD"),
  text("strong","ppw-ep-main",options.mainEvent??"TO BE ANNOUNCED"));
 poster.append(top,middle,foot);
 pauseOutsideViewport(poster);
 return poster;
}
