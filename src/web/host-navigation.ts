/** URL navigation contains only section IDs, never player/World credentials. */
export const HOST_SECTIONS=[
 {id:"home",label:"World",glyph:"W",primary:true},
 {id:"news",label:"News",glyph:"N",primary:true},
 {id:"kayfabe",label:"Kayfabe Points",glyph:"★"},
 {id:"achievements",label:"Achievements",glyph:"✦"},
 {id:"planner",label:"Plan",glyph:"P",primary:true},
 {id:"card",label:"The Card",glyph:"▤"},
 {id:"roster",label:"Talent",glyph:"T",primary:true},
 {id:"backstage",label:"Backstage",glyph:"☷"},
 {id:"market",label:"Talent Market",glyph:"◇"},
 {id:"contracts",label:"Contracts",glyph:"▤"},
 {id:"business",label:"Business",glyph:"B",primary:true},
 {id:"finances",label:"Finances",glyph:"$"},
 {id:"commercials",label:"Commercials",glyph:"◈"},
 {id:"ratings-war",label:"Ratings War",glyph:"↗"},
 {id:"business-standing",label:"Standing",glyph:"◆"},
 {id:"business-activity",label:"Activity",glyph:"▤"},
 {id:"business-events",label:"Event Accounts",glyph:"▣"},
 {id:"business-territories",label:"Territories",glyph:"◎"},
 {id:"staff",label:"Staff",glyph:"◉"},
 {id:"admin",label:"Admin",glyph:"⚙"},
 {id:"industry",label:"Industry",glyph:"◎"},
 {id:"promotions",label:"Promotions",glyph:"◎"},
 {id:"broadcasts",label:"Recent Broadcasts",glyph:"▣"},
 {id:"records",label:"Record Book",glyph:"▤"},
 {id:"legends",label:"Legends Vault",glyph:"★"},
 {id:"collection",label:"My Collection",glyph:"▣"},
 {id:"hall-of-fame",label:"Hall of Fame",glyph:"♛"},
 {id:"annual-awards",label:"Annual Awards",glyph:"◆"},
 {id:"world-moments",label:"World Moments",glyph:"✦"},
 {id:"calendar",label:"Calendar",glyph:"▦"},
 {id:"results",label:"Results",glyph:"R"},
 {id:"programmes",label:"Programmes",glyph:"⚑"},
 {id:"championships",label:"My Champions",glyph:"♛"},
 {id:"tournaments",label:"Tournaments",glyph:"🏆"},
 {id:"teams",label:"Tag Teams",glyph:"♧"},
 {id:"stables",label:"Stables",glyph:"♜"},
 {id:"connections",label:"Connections",glyph:"∞"}
] as const;
export type HostSection=typeof HOST_SECTIONS[number]["id"];
const sections=new Set<string>(HOST_SECTIONS.map(s=>s.id));
export type ContractFocus="ATTENTION"|"EXPIRING"|"PENDING";
export type HomeAttentionFocus=ContractFocus|"CARD"|"UNREAD";
export const plannerCardHash="#/planner/card";
export const legendsVaultHash="#/industry/legends";
export const backstageUnreadHash="#/backstage/unread";
export const businessRatingsHash="#/business/ratings";
export const contractAttentionHash=(focus:"EXPIRING"|"PENDING")=>
 "#/contracts/"+focus.toLowerCase();
/** Only two named contract routes are supported; IDs and player data never enter the URL. */
export function readContractFocus(hash:string):ContractFocus{
 return hash==="#/contracts/expiring"?"EXPIRING":
  hash==="#/contracts/pending"?"PENDING":"ATTENTION";
}
export function readHostSection(hash:string):HostSection{
 if(hash===plannerCardHash)return "planner";
 if(hash===legendsVaultHash)return "legends";
 if(hash===backstageUnreadHash)return "backstage";
 if(hash===businessRatingsHash)return "business";
 if(hash==="#/contracts/expiring"||hash==="#/contracts/pending")return "contracts";
 const match=/^#\/([a-z-]+)$/.exec(hash);
 return match&&sections.has(match[1]!)?match[1] as HostSection:"home";
}
export const hostSectionHash=(section:HostSection)=>"#/"+section;

/** Original PPW IA: the five roots open a client-only drawer, never query Neon. */
export const HOST_DRAWER_ROOTS=[
 {key:"world",label:"World",glyph:"W",landing:"home",destinations:[
  ["home","World Dashboard","Your promotion and the shared week"],
  ["promotions","Promotions","Companies and industry standings"],
  ["broadcasts","Recent Broadcasts","Completed shows and public results"],
  ["records","Record Book","Wrestler records and career search"],
  ["legends","Legends Vault","Clues, discoveries and unlock reveals"],
  ["collection","My Collection","Your private Legends card binder"],
  ["achievements","Trophy Room","Track promoter legacy and earned prestige"],
  ["hall-of-fame","Hall of Fame","Careers that earned their place"],
  ["annual-awards","Annual Awards","The finest of each completed year"],
  ["world-moments","World Moments","Historic highlights worth remembering"]]},
 {key:"news",label:"News",glyph:"N",landing:"news",destinations:[
  ["news","PPW Wire","Official news, dirt sheets and weekly honours"]]},
 {key:"promotion",label:"Promotion",glyph:"P",landing:"roster",destinations:[
  ["roster","My Roster","Wrestlers, divisions and dossiers"],
  ["market","Talent Market","Recruitment and free agents"],
  ["results","Results","Completed shows and reports"],
  ["championships","My Champions","Your belts, champions and title history"],
  ["tournaments","Tournaments","Create, active brackets and heritage"],
  ["contracts","Contracts","Deals, renewals and dates"],
  ["backstage","Backstage","Private wrestler conversations"],
  ["teams","Tag Teams","Partnerships and pairings"],
  ["stables","Stables","Groups and factions"],
  ["connections","Connections","Working relationships"]]},
 {key:"plan",label:"Plan",glyph:"P",landing:"planner",destinations:[
  ["planner","Show Planner","Prepare future shows"],
  ["calendar","Calendar","Events and venues"],
  ["programmes","Programmes","Rivalries and ongoing stories"]]},
 {key:"business",label:"Business",glyph:"B",landing:"finances",destinations:[
  ["finances","Finances","Bank, budgets and event accounts"],
  ["commercials","Commercials","TV, streaming and sponsors"],
  ["ratings-war","Ratings War","Audiences and rivals"],
  ["staff","Staff Office","Staff meetings and decisions"],
  ["business-standing","Standing","Company reputation and progress"],
  ["business-activity","Activity","Income and expenditure history"],
  ["business-events","Events","Show takings and business results"],
  ["business-territories","Territories","Where your audience is growing"],
  ["business","Company","Promotion identity and overview"],
  ["admin","Admin","Operator-only World controls"]]}
] as const;
export type HostDrawerRoot=typeof HOST_DRAWER_ROOTS[number]["key"];
export function drawerRootForSection(section:HostSection):HostDrawerRoot{
 if(section==="news")return "news";
 if(["industry","promotions","broadcasts","records","legends","collection","achievements","hall-of-fame",
  "annual-awards","world-moments"].includes(section))return "world";
 if(["roster","market","results","championships","tournaments","contracts","backstage","teams","stables","connections"].includes(section))return "promotion";
 if(["planner","card","calendar","programmes"].includes(section))return "plan";
 if(["business","finances","commercials","ratings-war","business-standing",
  "business-activity","business-events","business-territories",
  "staff","admin","kayfabe"].includes(section))return "business";
 return "world";
}

/** Selected show IDs remain in this browser history entry, never in the URL.
 * The authenticated booking endpoint still verifies World/promotion control.
 */
/** One show may be opened from a wrestler-originated Programme. Keep the
 * optional focus in private, scope-checked browser history, never the URL.
 * The actual show/contract/creative authorisation still runs on the server.
 */
export interface ProgrammeCardHistoryFocus{programmeId:string;ideaKind?:string}
export function bookingHistoryState(worldId:string,promotionId:string,showId:string,
 focus?:ProgrammeCardHistoryFocus|null){
 if(![worldId,promotionId,showId].every(v=>v.trim().length>0&&v.length<=200))
  throw new Error("Invalid booking route");
 if(focus){
  if(typeof focus.programmeId!=="string"||!focus.programmeId.trim()||
   focus.programmeId.length>200||
   (focus.ideaKind!==undefined&&
    (typeof focus.ideaKind!=="string"||!focus.ideaKind||
     focus.ideaKind.length>60)))
   throw new Error("Invalid Programme booking focus");
 }
 return {ppwBooking:{worldId,promotionId,showId,
  ...(focus?{programmeId:focus.programmeId,
   ...(focus.ideaKind?{ideaKind:focus.ideaKind}:{})}:{})}};
}
export function readBookingHistory(state:unknown,worldId:string,promotionId:string):string|null{
 if(!state||typeof state!=="object"||Array.isArray(state))return null;
 const entry=(state as Record<string,unknown>).ppwBooking;
 if(!entry||typeof entry!=="object"||Array.isArray(entry))return null;
 const p=entry as Record<string,unknown>;
 return p.worldId===worldId&&p.promotionId===promotionId&&
  typeof p.showId==="string"&&p.showId.trim().length>0&&p.showId.length<=200?
  p.showId:null;
}

/** A history-forward/reload restores only the visible local Programme choice,
 * after verifying the authoritative World/promotion/show route first.
 */
export function readBookingProgrammeFocus(state:unknown,worldId:string,
 promotionId:string):ProgrammeCardHistoryFocus|null{
 if(!readBookingHistory(state,worldId,promotionId)||!state||
  typeof state!=="object"||Array.isArray(state))return null;
 const entry=(state as {ppwBooking?:unknown}).ppwBooking;
 if(!entry||typeof entry!=="object"||Array.isArray(entry))return null;
 const p=entry as Record<string,unknown>;
 if(typeof p.programmeId!=="string"||!p.programmeId.trim()||
  p.programmeId.length>200)return null;
 if(p.ideaKind!==undefined&&
  (typeof p.ideaKind!=="string"||!p.ideaKind.trim()||
   p.ideaKind.length>60))return null;
 return {programmeId:p.programmeId,
  ...(typeof p.ideaKind==="string"?{ideaKind:p.ideaKind}:{})};
}
