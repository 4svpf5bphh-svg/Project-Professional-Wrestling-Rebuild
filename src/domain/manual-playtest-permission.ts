/** Manual playtest week resolution: only an invited operator on the single
 * protected rebuild main preview. Never production, original, or scheduled.
 */
export function manualPlaytestEnabled(env:Record<string,string|undefined>,
 worldId:string,playerId:string):boolean{
 return (env.VERCEL_ENV==="preview"||env.VERCEL_ENV==="production")&&
  env.VERCEL_GIT_COMMIT_REF==="main"&&
  env.PPW_MANUAL_ADVANCE_ENABLED==="YES"&&
  env.PPW_MAIN_WORLD_APPROVED==="YES"&&
  env.PPW_MAIN_WORLD_ID===worldId&&
  !!playerId&&env.PPW_MANUAL_OPERATOR_ID===playerId;
}

/** Only the AI Lab is available on the exact isolated benchmark preview.
 * This does not grant World advancement or ordinary admin mutations.
 */
export function aiBenchmarkPreviewOperatorEnabled(
 env:Record<string,string|undefined>,worldId:string,playerId:string,
):boolean{
 return env.VERCEL_ENV==="preview"&&
  env.VERCEL_GIT_COMMIT_REF==="phase43-ai-benchmark-safe-preview"&&
  env.PPW_AI_BENCHMARK_PREVIEW==="YES"&&
  !!worldId&&env.PPW_AI_BENCHMARK_WORLD_ID===worldId&&
  !!playerId&&env.PPW_MANUAL_OPERATOR_ID===playerId;
}
