/** This source-backed inventory is populated when real portrait crops are saved.
 * No speculative image path is exposed before a file actually exists. */
export const LEGEND_PORTRAIT_ASSETS: Readonly<Record<string,string>> = Object.freeze({});
export function legendPortraitSource(personId?:string|null):string|null {
  return personId ? LEGEND_PORTRAIT_ASSETS[personId] ?? null : null;
}
