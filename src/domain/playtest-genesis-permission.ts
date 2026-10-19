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
