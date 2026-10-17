/** PPW mobile show broadcast; all finishes and outcomes come from the server receipt. */
import type {CompletedShowView} from "../db/show-results-view.js";
export async function mountShowResults(root:HTMLElement,port:{load():Promise<CompletedShowView>}){
 root.classList.add("ppw-editor","ppw-results");
 const node=(tag:string,className:string,content:string)=>{
  const el=document.createElement(tag);el.className=className;el.textContent=content;return el;};
 root.replaceChildren(node("p","ppw-muted","Loading the broadcast…"));
 try{
  const show=await port.load();
  const header=node("header","ppw-result-hero","");
  header.append(node("span","ppw-eyebrow","PPW • SHOW BROADCAST"),
   node("h1","","Year "+show.year+" · Week "+show.week),
   node("div","ppw-result-score",String(Math.round(show.crowdResponse))),
   node("p","ppw-muted","Audience reaction / 100 · "+show.matchCount+
    " matches · "+show.angleCount+" angles"));
  const timeline=node("section","ppw-result-timeline","");
  for(const entry of show.entries){
   const card=node("article","ppw-result-entry "+(entry.type==="MATCH"?
    "ppw-result-match":"ppw-result-angle"),"");
   const top=node("div","ppw-result-meta","");
   top.append(node("span","ppw-eyebrow",
    "SEGMENT "+(entry.position+1)+"  •  "+entry.type),
    node("span","ppw-result-meter",Math.round(entry.crowdResponse)+" / 100"));
   card.append(top,node("h2","",entry.headline),
    node("p","",entry.summary),
    node("span","ppw-result-outcome",entry.outcome.replaceAll("_"," ")));
   timeline.append(card);
  }
  root.replaceChildren(header,timeline);
 }catch(e){
  root.replaceChildren(node("p","ppw-alert ppw-error",
   e instanceof Error?e.message:"Unable to load show results"));
 }
}
