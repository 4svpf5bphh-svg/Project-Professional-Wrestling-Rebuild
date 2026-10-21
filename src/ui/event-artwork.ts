/** Static, authored SVG show identities. Never a runtime Neon or generation call. */
import {eventDesign} from "./broadcast-identity.js";
export const designedEventMotifs=new Set(["raw","smackdown","dynamite","collision","wrestlemania","rumble","summerslam","survivor","mitb","chamber","all-in","all-out","double-or-nothing","revolution","forbidden-door","worlds-end","dynasty","backlash","night-of-champions","clash-in-italy","wrestlepalooza","redemption","impact","bound-for-glory","stand-and-deliver","supercard-of-honor","super-viernes","anniversary","dream-queendom","stardom-live","road-series","wrestle-kingdom","crown-jewel","grand-slam","nxt-weekly","wrestledream","full-gear","signature","weekly"]);
export function eventArtworkSource(name:string,owner:string,major:boolean):string{
 const design=eventDesign(name,owner,major);
 if(designedEventMotifs.has(design.motif)&&design.motif!=="weekly"&&design.motif!=="signature")
  return "/events/"+design.motif+".svg";
 const brand=["wwe","aew","njpw","roh","tna","nxt","stardom","cmll","crown-wrestling","revolution-pro","frontier-wrestling","atlas-wrestling","titan-combat","custom"].includes(design.brand)?design.brand:"custom";
 return "/events/"+brand+"-"+(major?"premium":"weekly")+".svg";
}