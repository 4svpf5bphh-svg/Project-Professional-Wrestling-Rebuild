/** The segment's certified execution score is the only source of temperature.
 * The label is presentation, not a new popularity, programme or morale effect.
 */
export interface SegmentTemperature{
 label:"Freezing Cold"|"Cool"|"Mild"|"Warming Up"|"Hot"|"Boiling";
 tone:"cold"|"cool"|"mild"|"warm"|"hot"|"boiling";
 description:string;
}
export function segmentTemperature(stars:number|null|undefined):SegmentTemperature|null{
 if(typeof stars!=="number"||!Number.isFinite(stars))return null;
 const score=Math.max(0,Math.min(5,stars));
 if(score<1)return {label:"Freezing Cold",tone:"cold",
  description:"The segment struggled to connect."};
 if(score<2)return {label:"Cool",tone:"cool",
  description:"The idea landed quietly."};
 if(score<3)return {label:"Mild",tone:"mild",
  description:"A respectable moment without a major spark."};
 if(score<3.75)return {label:"Warming Up",tone:"warm",
  description:"The crowd is beginning to invest."};
 if(score<4.5)return {label:"Hot",tone:"hot",
  description:"A strong on-air moment with clear impact."};
 return {label:"Boiling",tone:"boiling",
  description:"An exceptional segment that brought the house up."};
}
