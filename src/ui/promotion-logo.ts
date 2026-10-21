/** Explicitly sourced brand marks, no backend or fuzzy logo lookup.
 * Marks remain subject to their respective owners' trademarks.
 * Wikimedia Commons file pages are linked from /broadcast-credits.html.
 */
const fileNames:Readonly<Record<string,string>>={
 wwe:"WWE Official Logo.svg",
 aew:"All Elite Wrestling logo 2023.svg",
 roh:"Ring Of Honor (2022) Logo.svg",
 tna:"TNA Wrestling (2024) Logo.svg",
 nxt:"WWE NXT Logo (2022).svg",
 stardom:"Stardom 2021 logo.svg"
};
export function createPromotionLogo(key:string,width=145):HTMLImageElement|null{
 const filename=fileNames[key];if(!filename)return null;
 const logo=document.createElement("img");
 logo.className="ppw-authentic-promotion-logo";
 logo.src="https://commons.wikimedia.org/wiki/Special:FilePath/"+encodeURIComponent(filename)+
  "?width="+Math.max(80,Math.min(320,Math.round(width)));
 logo.alt="";logo.loading="lazy";logo.decoding="async";
 logo.width=width;logo.height=75;
 logo.title="Trademark of its respective wrestling promotion. Asset source and notices: broadcast-credits.html";
 return logo;
}
