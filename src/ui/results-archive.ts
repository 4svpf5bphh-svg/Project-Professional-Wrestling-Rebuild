/** Paginated, promotion-private Ringside back catalogue.
 * Show rows are small metadata projections; only opening a show loads its receipt.
 */
import type {ShowArchiveCursor,ShowArchivePage} from "../db/completed-show-archive.js";
export interface ArchivePort{
 load(cursor:ShowArchiveCursor|null):Promise<ShowArchivePage>;
 open(showId:string):void;
 back?():void;
}
const el=(tag:string,cls:string,text="")=>{
 const node=document.createElement(tag);node.className=cls;node.textContent=text;return node;};
export async function mountResultsArchive(root:HTMLElement,port:ArchivePort){
 root.classList.add("ppw-editor","ppw-results","ppw-results-archive");
 const heading=el("header","ppw-archive-hero");
 if(port.back){
  const back=el("button","ppw-archive-back","← Back") as HTMLButtonElement;
  back.type="button";back.onclick=port.back;heading.append(back);
 }
 heading.append(el("span","ppw-eyebrow","PPW / RINGSIDE"),
  el("h1","","THE TAPE LIBRARY"),
  el("p","","Every show, every result. The history stays in the books."));
 const list=el("div","ppw-archive-list");
 const status=el("p","ppw-muted","");
 const more=el("button","ppw-archive-more","Load older shows") as HTMLButtonElement;
 more.type="button";
 root.replaceChildren(heading,list,status,more);
 let cursor:ShowArchiveCursor|null=null;
 let total=0,busy=false,done=false;
 async function loadPage(){
  if(busy||done)return;
  busy=true;more.disabled=true;
  status.textContent="Getting the next stack of tapes…";
  try{
   const page=await port.load(cursor);
   for(const show of page.items){
    const card=el("button","ppw-archive-show") as HTMLButtonElement;
    card.type="button";
    const caption=el("span","ppw-archive-week",
     "YEAR "+show.year+"  /  WEEK "+show.week);
    const score=el("span","ppw-archive-score",String(Math.round(show.crowdResponse))+"/100");
    const meta=el("span","ppw-archive-meta",
     show.matchCount+" matches  ·  "+show.angleCount+" angles");
    card.append(caption,el("strong","ppw-archive-show-name",
     show.showName??"Weekly show"),score,meta,
     el("span","ppw-archive-open","Read ringside report  ↗"));
    card.onclick=()=>port.open(show.showId);
    list.append(card);
   }
   total+=page.items.length;cursor=page.nextCursor;done=!cursor;
   more.hidden=done;
   status.textContent=total===0?"No completed shows have been published yet.":
    total+" completed "+(total===1?"show":"shows")+
    (done?" in this archive.":" loaded. Browse older shows below.");
  }catch(e){
   status.textContent=e instanceof Error?e.message:"Unable to open the tape library.";
   more.hidden=false;
  }finally{busy=false;more.disabled=false;}
 }
 more.onclick=()=>{void loadPage();};
 await loadPage();
}
