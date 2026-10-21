/** Belt visuals are selected by real title facts, never current-holder artwork. */
import {promotionBrand} from "./broadcast-identity.js";
export type BeltCategory="world"|"women"|"tag"|"secondary";
export function beltCategory(name:string,division:"SINGLES"|"TAG"):BeltCategory{
 if(division==="TAG")return "tag";
 if(/women|divas|joshi/i.test(name))return "women";
 if(/world|universal|global|heavyweight/i.test(name))return "world";
 return "secondary";
}
export function championshipArtworkSource(name:string,division:"SINGLES"|"TAG",promotion:string):string{
 const brand=promotionBrand(promotion).key;
 const known=["wwe","aew","njpw","roh","tna","nxt","stardom","cmll","crown-wrestling","revolution-pro","frontier-wrestling","atlas-wrestling","titan-combat","custom"].includes(brand)?brand:"custom";
 return "/belts/"+known+"-"+beltCategory(name,division)+".svg";
}