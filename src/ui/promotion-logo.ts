/** Fixed, attributed promotion identifiers; no live logo lookup or Neon work.
 * All marks are trademarks. NJPW is non-free Wikimedia identification artwork,
 * CMLL comes from TheSportsDB. Neither is claimed as Commons-licensed.
 * References and legal notices: /broadcast-credits.html.
 */
export const promotionLogoFileNames:Readonly<Record<string,string>>={
 wwe:"WWE Official Logo.svg",
 aew:"All Elite Wrestling logo 2023.svg",
 roh:"Ring Of Honor (2022) Logo.svg",
 tna:"TNA Wrestling (2024) Logo.svg",
 nxt:"WWE NXT Logo (2022).svg",
 stardom:"Stardom 2021 logo.svg"
};
/** Stable, inspected asset URLs. No arbitrary remote URL from player data. */
export const promotionLogoExternalSources:Readonly<Record<string,string>>={
 njpw:"https://upload.wikimedia.org/wikipedia/en/thumb/1/1c/New_Japan_Pro_Wrestling_Logo_2.svg/330px-New_Japan_Pro_Wrestling_Logo_2.svg.png",
 cmll:"https://r2.thesportsdb.com/images/media/league/badge/8wi2qv1575807644.png"
};
export const promotionLogoKeys=Object.freeze([
 "wwe","aew","njpw","roh","tna","nxt","stardom","cmll"
] as const);
export function promotionLogoSource(key:string,width=145):string|null{
 const named=promotionLogoFileNames[key];
 if(named)return "https://commons.wikimedia.org/wiki/Special:FilePath/"+
  encodeURIComponent(named)+"?width="+Math.max(80,Math.min(320,Math.round(width)));
 return promotionLogoExternalSources[key]??null;
}
export function createPromotionLogo(key:string,width=145):HTMLImageElement|null{
 const src=promotionLogoSource(key,width);if(!src)return null;
 const logo=document.createElement("img");
 logo.className="ppw-authentic-promotion-logo";
 logo.src=src;logo.dataset.promotionLogo=key;
 logo.alt="";logo.loading="lazy";logo.decoding="async";
 logo.width=width;logo.height=75;
 logo.title="Trademark of the relevant promotion · image provenance and notices: broadcast-credits.html";
 return logo;
}
