/** Decode verified completed card participants without guessing historical opponents.
 * Career reads are on demand: player-controlled dossier only, no list preload.
 */
export interface CareerLineup{partners:string[]|null;opponents:string[]|null}
export function careerMatchLineup(value:unknown,personId:string):CareerLineup{
 const unknown:CareerLineup={partners:null,opponents:null};
 if(!Array.isArray(value)||value.length<2||value.length>30)return unknown;
 const entries:{personId:string;name:string;side:string}[]=[];
 for(const row of value){
  if(!Array.isArray(row)||row.length!==3||
   row.some(x=>typeof x!=="string"||!x.trim()))return unknown;
  const [id,name,side]=row as [string,string,string];
  entries.push({personId:id,name,side});
 }
 if(new Set(entries.map(p=>p.personId)).size!==entries.length)return unknown;
 const self=entries.find(p=>p.personId===personId);
 if(!self||new Set(entries.map(p=>p.side)).size<2)return unknown;
 return {partners:entries.filter(p=>p.personId!==personId&&p.side===self.side)
    .map(p=>p.name),
  opponents:entries.filter(p=>p.side!==self.side).map(p=>p.name)};
}
