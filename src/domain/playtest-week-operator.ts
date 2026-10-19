/** One-time operator permission gate. This is never exposed to a game client
 * and never schedules, bypasses or accelerates the World deadline.
 */
export interface PlaytestWeekArgs{
 worldId:string;resolve:boolean;confirmWorld:string|null;confirmHost:string|null;
}
export function parsePlaytestWeekArgs(args:readonly string[]):PlaytestWeekArgs{
 let worldId="",resolve=false,confirmWorld:string|null=null,confirmHost:string|null=null;
 const used=new Set<string>();
 for(let i=0;i<args.length;i++){
  const arg=args[i]!;
  if(!["--world","--resolve","--confirm-world","--confirm-host"].includes(arg)||
   used.has(arg))throw new Error("Unknown or repeated operator option: "+arg);
  used.add(arg);
  if(arg==="--resolve"){resolve=true;continue;}
  const value=args[++i];
  if(!value||value.startsWith("--"))throw new Error("Missing value for "+arg);
  if(arg==="--world")worldId=value;
  else if(arg==="--confirm-world")confirmWorld=value;
  else confirmHost=value;
 }
 if(!/^[a-zA-Z0-9_.:-]{1,100}$/.test(worldId))
  throw new Error("Select one explicit World ID");
 if(resolve&&(!confirmWorld||!confirmHost))
  throw new Error("One-shot resolution requires exact --confirm-world and --confirm-host");
 return {worldId,resolve,confirmWorld,confirmHost};
}
export function confirmPlaytestResolution(
 args:PlaytestWeekArgs,config:{
 approved?:string;configuredWorld?:string;actualHost:string;
 },world:{phase:string;due:boolean;year:number;week:number}):void{
 if(!args.resolve)throw new Error("Inspect mode never modifies a World");
 if(config.approved!=="YES"||config.configuredWorld!==args.worldId||
  args.confirmWorld!==args.worldId||args.confirmHost!==config.actualHost)
  throw new Error("Playtest operator approval, World or database host confirmation missing");
 if(!Number.isSafeInteger(world.year)||world.year<1||
  !Number.isSafeInteger(world.week)||world.week<1||world.week>52)
  throw new Error("Invalid World clock");
 if(world.phase==="OPEN"&&!world.due)
  throw new Error("The booking deadline has not arrived; do not resolve early");
 if(!["OPEN","LOCKED","RESOLVING"].includes(world.phase))
  throw new Error("World cannot be manually resolved from this phase");
}
export function oneShotResolutionId(worldId:string,year:number,week:number){
 return "playtest-one-shot:"+worldId+":"+year+":"+week;
}
