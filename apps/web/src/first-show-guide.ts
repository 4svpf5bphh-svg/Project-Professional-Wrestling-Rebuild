import type {PlayerWorldOverview} from "../../../src/db/player-world-overview.js";

interface GuidePort {
 book(): void;
 showtime?: () => void;
 dismiss(): void;
}

export function renderFirstShowGuide(
 root: HTMLElement, overview: PlayerWorldOverview, port: GuidePort,
){
 const {promotion,world}=overview;
 if(!promotion||promotion.latestShow||(promotion.latestShows?.length??0)>0){
  root.remove();return;
 }

 const shows=(promotion.upcomingShows??[]).filter(show=>show.year===world.year&&show.week===world.week);
 const ready=shows.length>0&&shows.every(show=>show.ready||show.status==="SUBMITTED");
 const processing=world.phase!=="OPEN";
 const heading=document.createElement("h2");
 heading.textContent="Your first show";
 const guidance=document.createElement("p");
 guidance.textContent=processing?
  "The World is processing this week. Open Results after it publishes.":
  ready?"Your saved card is ready. The World checks shared venues and talent before certifying results.":
   "Choose an event in Book, set its date and venue, then cast your opener and choose the finish. Save the card and mark it ready.";

 const dismiss=document.createElement("button");
 dismiss.type="button";dismiss.className="ppw-first-show-dismiss";
 dismiss.textContent="×";dismiss.setAttribute("aria-label","Dismiss first show guide");
 dismiss.onclick=port.dismiss;

 root.className="ppw-first-show";
 root.setAttribute("aria-label","First show guide");
 root.replaceChildren(heading,guidance,dismiss);
 const action=processing||ready?port.showtime:port.book;
 if(action){
  const next=document.createElement("button");
  next.type="button";next.className="ppw-first-show-action";
  next.textContent=processing||ready?"World readiness":"Open Booking Room";
  next.onclick=action;root.append(next);
 }
}
