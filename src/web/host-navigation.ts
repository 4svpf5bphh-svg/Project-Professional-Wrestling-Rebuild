/** URL navigation contains only section IDs, never player/World credentials. */
export const HOST_SECTIONS=[
 {id:"home",label:"Promoter’s Office",glyph:"W",primary:true},
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
 {id:"showtime",label:"Showtime",glyph:"▶"},
 {id:"industry",label:"Wrestling World",glyph:"◎"},
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

export const HOST_PRIMARY_NAV=[
 {key:"home",label:"Home",landing:"home",sections:["home"]},
 {key:"book",label:"Book",landing:"planner",sections:["planner","card","calendar","programmes","showtime"]},
 {key:"roster",label:"Roster",landing:"roster",
  sections:["roster","market","contracts","championships","tournaments","teams","stables","connections"]},
 {key:"world",label:"World",landing:"industry",
  sections:["industry","news","promotions","broadcasts","records","hall-of-fame","annual-awards","world-moments"]},
] as const;
export type HostNavTab=typeof HOST_PRIMARY_NAV[number]["key"]|"more";
export function navTabForSection(section:HostSection):HostNavTab{
 return HOST_PRIMARY_NAV.find(tab=>(tab.sections as readonly HostSection[]).includes(section))?.key??"more";
}

interface HostMenuGroup{label:string;destinations:readonly [HostSection,string][]}
export const HOST_MORE_GROUPS:readonly HostMenuGroup[]=[
 {label:"This promotion",destinations:[
  ["backstage","Backstage"],["results","Show Results"],["programmes","Programmes"],
  ["calendar","Calendar"],["championships","My Champions"],["staff","Staff Office"],
  ["showtime","Showtime"],["contracts","Contract Desk"],["market","Talent Market"],
  ["teams","Tag Teams"],["stables","Stables"],["connections","Connections"],
  ["tournaments","Tournaments"]]},
 {label:"Business",destinations:[
  ["business","Company"],["finances","Finances"],["commercials","Broadcasters & Sponsors"],
  ["ratings-war","Ratings War"],["business-standing","Standing"],["business-activity","Activity"],
  ["business-events","Event Accounts"],["business-territories","Territories"]]},
 {label:"World & history",destinations:[
  ["news","PPW Wire & Hot Tag"],["promotions","Promotions"],["broadcasts","Recent Broadcasts"],
  ["records","Record Book"],["hall-of-fame","Hall of Fame"],["annual-awards","Annual Awards"],
  ["world-moments","World Moments"]]},
 {label:"Collection & rewards",destinations:[
  ["kayfabe","Kayfabe Points & Cosmetics"],["legends","Legends Vault"],
  ["collection","My Collection"],["achievements","Trophy Room"],["admin","Admin"]]}
];

/** Selected show IDs remain in this browser history entry, never in the URL.
 * The authenticated booking endpoint still verifies World/promotion control.
 */
/** One show may be opened from a wrestler-originated Programme. Keep the
 * optional focus in private, scope-checked browser history, never the URL.
 * The actual show/contract/creative authorisation still runs on the server.
 */
export interface ProgrammeCardHistoryFocus{programmeId:string;ideaKind?:string;
 blueprintBeat?:{blueprintId:string;beatId:string}}
const validBlueprintBeat=(value:unknown):value is {blueprintId:string;beatId:string}=>{
 if(!value||typeof value!=="object"||Array.isArray(value))return false;
 const ref=value as Record<string,unknown>;
 return [ref.blueprintId,ref.beatId].every(v=>
  typeof v==="string"&&v.trim().length>0&&v.length<=80);
};
export function bookingHistoryState(worldId:string,promotionId:string,showId:string,
 focus?:ProgrammeCardHistoryFocus|null){
 if(![worldId,promotionId,showId].every(v=>v.trim().length>0&&v.length<=200))
  throw new Error("Invalid booking route");
 if(focus){
  if(typeof focus.programmeId!=="string"||!focus.programmeId.trim()||
   focus.programmeId.length>200||
   (focus.ideaKind!==undefined&&
    (typeof focus.ideaKind!=="string"||!focus.ideaKind||
     focus.ideaKind.length>60))||
   (focus.blueprintBeat!==undefined&&!validBlueprintBeat(focus.blueprintBeat)))
   throw new Error("Invalid Programme booking focus");
 }
 return {ppwBooking:{worldId,promotionId,showId,
  ...(focus?{programmeId:focus.programmeId,
   ...(focus.ideaKind?{ideaKind:focus.ideaKind}:{}),
   ...(focus.blueprintBeat?{blueprintBeat:{
    blueprintId:focus.blueprintBeat.blueprintId,
    beatId:focus.blueprintBeat.beatId}}:{})}:{})}};
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
 if(p.blueprintBeat!==undefined&&!validBlueprintBeat(p.blueprintBeat))return null;
 return {programmeId:p.programmeId,
  ...(typeof p.ideaKind==="string"?{ideaKind:p.ideaKind}:{}),
  ...(validBlueprintBeat(p.blueprintBeat)?{blueprintBeat:{
   blueprintId:p.blueprintBeat.blueprintId,beatId:p.blueprintBeat.beatId}}:{})};
}

/** Results keep the exact show identity in private, scope-checked history. */
export function resultsHistoryState(worldId:string,promotionId:string,showId:string){
 return {ppwResults:bookingHistoryState(worldId,promotionId,showId).ppwBooking};
}
export function readResultsHistory(state:unknown,worldId:string,promotionId:string):string|null{
 if(!state||typeof state!=="object"||Array.isArray(state))return null;
 return readBookingHistory({ppwBooking:(state as {ppwResults?:unknown}).ppwResults},worldId,promotionId);
}
