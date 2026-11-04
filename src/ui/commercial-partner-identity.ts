/** Local, code-owned partner insignia: no remote imagery and no trademarks. */
import {COMMERCIAL_COMPANIES} from "../domain/commercial-offers.js";
const paths:Readonly<Record<string,string>>={
 "BROADCAST_STABLE": "<rect x=\"5\" y=\"5\" width=\"16\" height=\"16\" rx=\"4\"/><path d=\"M11 13h5m-5 4h5\"/><path d=\"M21 12h6m-6 7h6\" stroke-dasharray=\"2 3\"/>",
 "BROADCAST_GROWTH": "<circle cx=\"16\" cy=\"16\" r=\"13\"/><path d=\"m12 9 12 7-12 7z\" fill=\"currentColor\" stroke=\"none\"/>",
 "BROADCAST_TV": "<path d=\"M4 8h24v16H4z\"/><path d=\"M10 16h12M16 8V3\"/><path d=\"m10 3 6 5 6-5\"/>",
 "BROADCAST_INDIE": "<path d=\"M2 13q7-10 14 0t14 0M2 19q7-10 14 0t14 0\"/><circle cx=\"16\" cy=\"16\" r=\"3\"/>",
 "BROADCAST_ARCHIVE": "<rect x=\"6\" y=\"4\" width=\"20\" height=\"24\" rx=\"4\"/><path d=\"M12 4v24m9-16-6 4 6 4\"/>",
 "BROADCAST_GLOBAL": "<circle cx=\"16\" cy=\"16\" r=\"13\"/><path d=\"M4 16h24M16 3a22 22 0 0 1 0 26 22 22 0 0 1 0-26\"/><path d=\"m16 8 2 5 5 .5-4 3.5 1 5-4-3-4 3 1-5-4-3.5 5-.5z\"/>",
 "SPONSOR_LOCAL": "<path d=\"M19 3q1 7-5 10 1-7-3-9Q4 12 8 19q2 8 8 9 10-1 10-10Q25 11 19 3Z\"/><path d=\"M15 16q-6 7 1 11 6-4 1-11\"/>",
 "SPONSOR_PARTNER": "<path d=\"m18 2-14 18h11l-3 10 16-20H17z\"/>",
 "SPONSOR_GEAR": "<path d=\"M9 6h14l3 8-5 4v10H11V18l-5-4z\"/><path d=\"M11 6l5 6 7-6\"/>",
 "SPONSOR_FOOD": "<path d=\"M4 13q2-9 12-9t12 9M4 19h24M7 25h18\"/><path d=\"M6 16h20\" stroke-dasharray=\"2 3\"/>",
 "SPONSOR_TECH": "<rect x=\"5\" y=\"5\" width=\"22\" height=\"22\" rx=\"4\"/><path d=\"M11 11h10v10H11zM3 11h2m-2 8h2m22-8h2m-2 8h2\"/>",
 "SPONSOR_LUXURY": "<circle cx=\"16\" cy=\"16\" r=\"11\"/><path d=\"M16 7v9l5 3M11 2V0m10 2V0M11 30v2m10-2v2\"/>"
};
export function commercialPartnerBrand(code:string):HTMLElement{
 const brand=document.createElement("div");
 brand.className="ppw-commercial-brand";brand.dataset.code=code;
 const identity=COMMERCIAL_COMPANIES[code];
 if(!identity){brand.textContent=code.replaceAll("_"," ");return brand;}
 const mark=document.createElement("span");mark.className="ppw-commercial-brand-mark";
 const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
 svg.setAttribute("viewBox","0 0 32 32");svg.setAttribute("width","31");
 svg.setAttribute("height","31");svg.setAttribute("aria-hidden","true");
 svg.innerHTML=paths[code]??"";
 mark.append(svg);
 const names=document.createElement("span");names.className="ppw-commercial-brand-name";
 const title=document.createElement("strong");title.textContent=identity.name;
 const tag=document.createElement("small");tag.textContent=identity.tagline;
 names.append(title,tag);brand.append(mark,names);
 brand.setAttribute("aria-label",identity.name+" — "+identity.tagline);
 return brand;
}
