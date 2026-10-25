/** URL navigation contains only section IDs, never player/World credentials. */
export const HOST_SECTIONS=[
 {id:"home",label:"World",glyph:"W",primary:true},
 {id:"news",label:"News",glyph:"N",primary:true},
 {id:"kayfabe",label:"Kayfabe Points",glyph:"★"},
 {id:"planner",label:"Plan",glyph:"P",primary:true},
 {id:"card",label:"The Card",glyph:"▤"},
 {id:"roster",label:"Talent",glyph:"T",primary:true},
 {id:"backstage",label:"Backstage",glyph:"☷"},
 {id:"market",label:"Talent Market",glyph:"◇"},
 {id:"contracts",label:"Contracts",glyph:"▤"},
 {id:"business",label:"Business",glyph:"B",primary:true},
 {id:"staff",label:"Staff",glyph:"◉"},
 {id:"admin",label:"Admin",glyph:"⚙"},
 {id:"industry",label:"Industry",glyph:"◎"},
 {id:"calendar",label:"Calendar",glyph:"▦"},
 {id:"results",label:"Results",glyph:"R"},
 {id:"programmes",label:"Programmes",glyph:"⚑"},
 {id:"championships",label:"Championships",glyph:"♛"},
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
export const contractAttentionHash=(focus:"EXPIRING"|"PENDING")=>
 "#/contracts/"+focus.toLowerCase();
/** Only two named contract routes are supported; IDs and player data never enter the URL. */
export function readContractFocus(hash:string):ContractFocus{
 return hash==="#/contracts/expiring"?"EXPIRING":
  hash==="#/contracts/pending"?"PENDING":"ATTENTION";
}
export function readHostSection(hash:string):HostSection{
 if(hash===plannerCardHash)return "planner";
 if(hash===legendsVaultHash)return "industry";
 if(hash===backstageUnreadHash)return "backstage";
 if(hash==="#/contracts/expiring"||hash==="#/contracts/pending")return "contracts";
 const match=/^#\/([a-z-]+)$/.exec(hash);
 return match&&sections.has(match[1]!)?match[1] as HostSection:"home";
}
export const hostSectionHash=(section:HostSection)=>"#/"+section;

/** Original PPW IA: the five roots open a client-only drawer, never query Neon. */
export const HOST_DRAWER_ROOTS=[
 {key:"world",label:"World",glyph:"W",landing:"home",destinations:[
  ["home","World dashboard","Deadline, next show and urgent decisions"]]},
 {key:"news",label:"News",glyph:"N",landing:"news",destinations:[
  ["news","Official News","The latest verified headlines"],
  ["industry","Industry & dirt sheets","Rivals, rumours, rankings and archives"]]},
 {key:"promotion",label:"Promotion",glyph:"P",landing:"roster",destinations:[
  ["roster","My Roster","Wrestlers, divisions and dossiers"],
  ["market","Talent Market","Recruitment and free agents"],
  ["results","Results","Completed shows and reports"],
  ["championships","Championships","Title holders and history"],
  ["contracts","Contracts","Deals, renewals and dates"],
  ["backstage","Backstage","Private wrestler conversations"],
  ["teams","Tag Teams","Partnerships and pairings"],
  ["stables","Stables","Groups and factions"],
  ["connections","Connections","Working relationships"]]},
 {key:"plan",label:"Plan",glyph:"P",landing:"planner",destinations:[
  ["planner","Show Planner","Prepare future shows"],
  ["calendar","Calendar","Events and venues"],
  ["programmes","Programmes","Rivalries and ongoing stories"]]},
 {key:"business",label:"Business",glyph:"B",landing:"business",destinations:[
  ["business","Finances & deals","Broadcasting, sponsorship and operations"],
  ["staff","Staff Office","Your team and its decisions"],
  ["admin","Admin","Operator-only World controls"]]}
] as const;
export type HostDrawerRoot=typeof HOST_DRAWER_ROOTS[number]["key"];
export function drawerRootForSection(section:HostSection):HostDrawerRoot{
 if(["news","industry"].includes(section))return "news";
 if(["roster","market","results","championships","contracts","backstage","teams","stables","connections"].includes(section))return "promotion";
 if(["planner","card","calendar","programmes"].includes(section))return "plan";
 if(["business","staff","admin","kayfabe"].includes(section))return "business";
 return "world";
}

/** Selected show IDs remain in this browser history entry, never in the URL.
 * The authenticated booking endpoint still verifies World/promotion control.
 */
export function bookingHistoryState(worldId:string,promotionId:string,showId:string){
 if(![worldId,promotionId,showId].every(v=>v.trim().length>0&&v.length<=200))
  throw new Error("Invalid booking route");
 return {ppwBooking:{worldId,promotionId,showId}};
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
