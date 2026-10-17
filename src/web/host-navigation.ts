/** URL navigation contains only section IDs, never player/World credentials. */
export const HOST_SECTIONS=[
 {id:"home",label:"Home",glyph:"⌂",primary:true},
 {id:"planner",label:"Plan",glyph:"▣",primary:true},
 {id:"roster",label:"Roster",glyph:"♟",primary:true},
 {id:"backstage",label:"Backstage",glyph:"☷",primary:true},
 {id:"more",label:"More",glyph:"☰",primary:true},
 {id:"market",label:"Talent Market",glyph:"◇"},
 {id:"contracts",label:"Contracts",glyph:"▤"},
 {id:"business",label:"Business",glyph:"◫"},
 {id:"staff",label:"Staff",glyph:"◉"},
 {id:"industry",label:"Industry",glyph:"◎"},
 {id:"calendar",label:"Calendar",glyph:"▦"},
 {id:"results",label:"Results",glyph:"★"},
 {id:"programmes",label:"Programmes",glyph:"⚑"},
 {id:"championships",label:"Championships",glyph:"♛"},
 {id:"teams",label:"Tag Teams",glyph:"♧"},
 {id:"stables",label:"Stables",glyph:"♜"},
 {id:"connections",label:"Connections",glyph:"∞"}
] as const;
export type HostSection=typeof HOST_SECTIONS[number]["id"];
const sections=new Set<string>(HOST_SECTIONS.map(s=>s.id));
export function readHostSection(hash:string):HostSection{
 const match=/^#\/([a-z-]+)$/.exec(hash);
 return match&&sections.has(match[1]!)?match[1] as HostSection:"home";
}
export const hostSectionHash=(section:HostSection)=>"#/"+section;
