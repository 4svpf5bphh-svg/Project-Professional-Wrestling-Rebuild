/** Small, verified Wikimedia Commons portrait catalogue.
 * Client media only: NO live search, AI, Neon metadata, database reads/writes.
 * Match the base legal name as well as stable ring aliases. Never invent photos.
 * Full attribution and license links: /portrait-credits.html
 */
export interface PhotoCredit{file:string;author:string;license:"CC BY 2.0"|"CC BY-SA 2.0"|"CC BY-SA 4.0"|"CC0";}
const catalogue:Readonly<Record<string,PhotoCredit>>={
 "roman reigns":{file:"Roman Reigns RR25 (1) (headshot).jpg",author:"Diego Serrano",license:"CC BY 2.0"},
 "cody rhodes":{file:"Cody Rhodes RR25.jpg",author:"Diego Serrano",license:"CC BY 2.0"},
 "seth rollins":{file:"Seth Rollins RR25.jpg",author:"Diego Serrano",license:"CC BY 2.0"},
 "rhea ripley":{file:"Rhea Ripley, April 2024 (cropped) (cropped).jpg",author:"Diego Serrano",license:"CC BY 2.0"},
 "kenny omega":{file:"Kenny Omega October 2019.jpg",author:"grenwail",license:"CC BY 2.0"},
 "cm punk":{file:"CM Punk 2022-03-23 (headshot).jpg",author:"Ralph Arvesen",license:"CC BY-SA 2.0"},
 "will ospreay":{file:"Will Ospreay at All In 2024.jpg",author:"McPhail",license:"CC0"},
 "becky lynch":{file:"Becky Lynch 2024 (cropped).jpg",author:"Carter Sterling",license:"CC BY-SA 2.0"},
 "jon moxley":{file:"Jon Moxley Oct 2021 (headshot).jpg",author:"West Smith",license:"CC BY-SA 4.0"},
 "bryan danielson":{file:"Bryan Danielson 2022-03-23 (cropped).jpg",author:"Ralph Arvesen",license:"CC BY-SA 2.0"},
 "hangman adam page":{file:"Hangman Adam Page Oct 2019 (cropped).jpg",author:"grenwail",license:"CC BY 2.0"},
 "adam page":{file:"Hangman Adam Page Oct 2019 (cropped).jpg",author:"grenwail",license:"CC BY 2.0"},
 "aj styles":{file:"AJ Styles RR24 (1).jpg",author:"Diego Serrano",license:"CC BY 2.0"},
 "kazuchika okada":{file:"Kazuchika Okada - 03-07-2024 EDIT-12.jpg",author:"All Elite Wrestling",license:"CC BY-SA 4.0"},
 "mercedes moné":{file:"Mercedes Moné DYNAMITE 2024 07 17 038.jpg",author:"All Elite Wrestling",license:"CC BY-SA 4.0"}
};
export const normalizePortraitName=(name:string)=>name.trim().toLowerCase().replace(/\s+/g," ");
export function portraitCredit(name:string):PhotoCredit|null{
 return catalogue[normalizePortraitName(name)]??null;
}
export function portraitSource(name:string,width=220):string|null{
 const photo=portraitCredit(name);
 if(!photo)return null;
 return "https://commons.wikimedia.org/wiki/Special:FilePath/"+
  encodeURIComponent(photo.file)+"?width="+Math.max(100,Math.min(420,Math.round(width)));
}
/** A real photo or no image. Do not impersonate real talent with AI silhouettes. */
export function createWrestlerPortrait(name:string,width=220):HTMLImageElement|null{
 const credit=portraitCredit(name),src=portraitSource(name,width);
 if(!credit||!src)return null;
 const img=document.createElement("img");
 img.className="ppw-real-wrestler-photo";
 img.src=src;img.alt="";img.loading="lazy";img.decoding="async";
 img.width=width;img.height=Math.round(width*1.3);
 img.title="Photo: "+credit.author+" · "+credit.license+" · Wikimedia Commons (credits in portrait-credits.html)";
 return img;
}
