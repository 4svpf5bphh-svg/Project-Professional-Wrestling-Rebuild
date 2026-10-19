/** File-based Genesis authorisation. No browser/cron endpoint can call it. */
export interface PreviewGenesisPermission{
 worldId:string;databaseHost:string;approved:string|undefined;
 expectedWorld:string|undefined;confirmationWorld:string|undefined;
 confirmationHost:string|undefined;
}
export function requirePreviewGenesisPermission(input:PreviewGenesisPermission):void{
 const {worldId,databaseHost,approved,expectedWorld,confirmationWorld,
  confirmationHost}=input;
 if(!/^[a-zA-Z0-9_.:-]{1,100}$/.test(worldId)||
  !databaseHost||databaseHost.length>255||
  approved!=="YES"||expectedWorld!==worldId||
  confirmationWorld!==worldId||confirmationHost!==databaseHost)
  throw new Error("An isolated World, its database host and explicit Genesis import approval must match");
}

export function parsePreviewGenesisArgs(args:readonly string[]){
 const choices=new Set(["--world","--source","--confirm-world","--confirm-host"]);
 const parsed=new Map<string,string>();
 for(let i=0;i<args.length;i++){
  const key=args[i]!,value=args[++i];
  if(!choices.has(key)||parsed.has(key)||typeof value!=="string"||
   value.length===0||value.startsWith("--"))
   throw new Error("Unknown, repeated or missing Genesis argument: "+key);
  parsed.set(key,value);
 }
 for(const key of choices)if(!parsed.has(key))
  throw new Error("Missing Genesis argument: "+key);
 const worldId=parsed.get("--world")!,source=parsed.get("--source")!;
 if(!/^[a-zA-Z0-9_.:-]{1,100}$/.test(worldId)||
  source.length>500||!source.trim())
  throw new Error("Invalid Genesis source or World identity");
 return {worldId,source,confirmationWorld:parsed.get("--confirm-world")!,
  confirmationHost:parsed.get("--confirm-host")!};
}
