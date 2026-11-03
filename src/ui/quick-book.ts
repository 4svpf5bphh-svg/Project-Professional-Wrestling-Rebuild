/** Pure field grouping for guided booking. Never alters the booking payload. */
export type QuickBookKind="MATCH"|"ANGLE";
const matchFields=new Set([
 "Winner","Stipulation","Finish","Championship","Minutes"
]);
const angleFields=new Set([
 "Creative direction","Angle type","Angle duration (minutes)",
 "Area","Exact location","Attack intensity","Visible aftermath",
 "Storytelling purpose","Turn a complete tag team","New alignment",
 "Faction","Invitation decision","Reconciliation decision",
 "Video purpose","After which match?",
 "The message","Interview subject","The answer","How it ends",
 "Attack style","How the turn is shown","Footage style",
 "The intention","How they approach it","How they leave"
]);
export function isQuickBookField(kind:QuickBookKind,label:string):boolean{
 return (kind==="MATCH"?matchFields:angleFields).has(label);
}
