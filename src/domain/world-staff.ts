/** Exact original PPW main deterministic fictional Talent Manager pool.
 * Static identities cost zero Neon rows until someone is hired.
 */
export interface WorldManager{
 staffId:string;name:string;insight:number;weeklySalary:number;
}
export function worldTalentManagers(seed:string|number|bigint):WorldManager[]{
 const first=["Morgan","Jamie","Casey","Rowan","Riley","Taylor","Avery","Drew"];
 const last=["Keane","Mercer","Hartley","Vale","Cross","Sutton","Bennett","Shaw"];
 const parsed=BigInt(seed),offset=Number((parsed<0n?-parsed:parsed)%8n);
 return first.map((_,index)=>{
  const insight=40+((index*7+offset*3)%46);
  return {staffId:"staff-"+String(index+1).padStart(3,"0"),
   name:first[(index+offset)%8]+" "+last[(index*3+offset)%8],
   insight,weeklySalary:250+insight*9};
 });
}
