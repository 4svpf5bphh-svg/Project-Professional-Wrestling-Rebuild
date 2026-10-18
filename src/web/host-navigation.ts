/** URL navigation contains only section IDs, never player/World credentials. */
export const HOST_SECTIONS=[
 {id:"home",label:"World",glyph:"W",primary:true},
 {id:"planner",label:"Plan",glyph:"P",primary:true},
 {id:"roster",label:"Talent",glyph:"T",primary:true},
 {id:"backstage",label:"Backstage",glyph:"☷"},
 {id:"more",label:"More",glyph:"☰"},
 {id:"market",label:"Talent Market",glyph:"◇"},
 {id:"contracts",label:"Contracts",glyph:"▤"},
 {id:"business",label:"Business",glyph:"B",primary:true},
 {id:"staff",label:"Staff",glyph:"◉"},
 {id:"industry",label:"Industry",glyph:"◎"},
 {id:"calendar",label:"Calendar",glyph:"▦"},
 {id:"results",label:"Results",glyph:"R",primary:true},
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
 if(hash===backstageUnreadHash)return "backstage";
 if(hash==="#/contracts/expiring"||hash==="#/contracts/pending")return "contracts";
 const match=/^#\/([a-z-]+)$/.exec(hash);
 return match&&sections.has(match[1]!)?match[1] as HostSection:"home";
}
export const hostSectionHash=(section:HostSection)=>"#/"+section;

/** Original PPW IA: the five roots open a client-only drawer, never query Neon. */
export const HOST_DRAWER_ROOTS=[
 {key:"world",label:"World",glyph:"W",landing:"home",destinations:[
  ["home","World overview","Your promotion and this week\u0027s outlook"],
  ["industry","Promotions","Rivals and the wrestling industry"],
  ["championships","Championships","Titles and title history"]]},
 {key:"talent",label:"Talent",glyph:"T",landing:"roster",destinations:[
  ["roster","Roster","Your wrestlers and divisions"],
  ["market","Talent Market","Find talent and gauge interest"],
  ["contracts","Contracts","Renewals and pending deals"],
  ["backstage","Backstage","Private wrestler messages"],
  ["teams","Tag Teams","Existing pairings"],
  ["stables","Stables","Groups and membership"],
  ["connections","Connections","Working relationships"]]},
 {key:"plan",label:"Plan",glyph:"P",landing:"planner",destinations:[
  ["planner","Show Planner","Book this week's shows"],
  ["calendar","Calendar","TV and premium events"],
  ["programmes","Programmes","Manage rivalries and stories"]]},
 {key:"business",label:"Business",glyph:"B",landing:"business",destinations:[
  ["business","Business overview","Finances and operations"],
  ["staff","Staff","Delegated decisions and renewals"]]},
 {key:"results",label:"Results",glyph:"R",landing:"results",destinations:[
  ["results","My Results","Completed shows and broadcasts"]]}
] as const;
export type HostDrawerRoot=typeof HOST_DRAWER_ROOTS[number]["key"];
export function drawerRootForSection(section:HostSection):HostDrawerRoot{
 if(["roster","market","contracts","backstage","teams","stables","connections"].includes(section))return "talent";
 if(["planner","calendar","programmes"].includes(section))return "plan";
 if(["business","staff"].includes(section))return "business";
 if(section==="results")return "results";
 return "world";
}
