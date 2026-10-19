/** Strict, read-only adapter for the original PPW main branch's *fresh*
 * createAlphaWorldAggregate().state. No historic DB or persisted save import.
 * Only the existing Genesis projection is accepted by the rebuild.
 */
import {projectOriginalGenesis,type OriginalGenesisSource}
 from "./original-genesis-projection.js";
type PersonSource=Omit<OriginalGenesisSource["people"][number],
 "bookingDivision"|"defaultAlignment"|"portableGimmickId"> &{
 division?:"MEN"|"WOMEN"|null;defaultAlignment?:"FACE"|"HEEL"|"TWEENER"|null;
};
export interface OriginalMainFreshState{
 world:OriginalGenesisSource["world"];
 ruleset:OriginalGenesisSource["ruleset"];
 markets:OriginalGenesisSource["markets"];
 promotionMarketStates:OriginalGenesisSource["promotionMarketStates"];
 promotionStandings?:OriginalGenesisSource["promotionStandings"];
 promotions:OriginalGenesisSource["promotions"];
 people:PersonSource[];
 venues:OriginalGenesisSource["venues"];
 contracts:OriginalGenesisSource["contracts"];
 teams?:OriginalGenesisSource["teams"];
 teamMemberships?:OriginalGenesisSource["teamMemberships"];
 wrestlerIdentities?:Array<{
  personId:string;active:{gimmickId:string};
 }>;
}
/** No creative guesses: a missing actual persona, standing, promotion right,
 * or contractual obligation blocks the export rather than fabricating data.
 */
export function extractOriginalMainFreshGenesis(
 state:OriginalMainFreshState,
):OriginalGenesisSource{
 if(!state||!state.world||!state.ruleset||!Array.isArray(state.people))
  throw new Error("Original main did not produce a fresh WorldState");
 const standing=state.promotionStandings;
 if(!Array.isArray(standing)||standing.length!==state.promotions.length)
  throw new Error("Original World is missing complete promotion standings");
 const identities=state.wrestlerIdentities;
 if(!Array.isArray(identities)||identities.length!==state.people.length)
  throw new Error("Original World is missing portable wrestler identities");
 const persona=new Map<string,string>();
 for(const identity of identities){
  const name=identity.active?.gimmickId;
  if(!identity.personId||!name||persona.has(identity.personId))
   throw new Error("Original World contains a missing or repeated wrestler identity");
  persona.set(identity.personId,name);
 }
 const people=state.people.map(person=>{
  const gimmickId=persona.get(person.id);
  if(!gimmickId)throw new Error("Original World is missing identity for "+person.id);
  return {...person,bookingDivision:person.division??null,
   defaultAlignment:person.defaultAlignment??null,
   portableGimmickId:gimmickId};
 });
 if(!Array.isArray(state.teams)||!Array.isArray(state.teamMemberships)||
  state.teams.length===0||state.teamMemberships.length<2)
  throw new Error("Original main fresh tag teams have not been seeded");
 const source:OriginalGenesisSource={
  world:structuredClone(state.world),ruleset:structuredClone(state.ruleset),
  markets:structuredClone(state.markets),
  promotionMarketStates:structuredClone(state.promotionMarketStates),
  promotionStandings:structuredClone(standing),
  promotions:structuredClone(state.promotions),
  people,venues:structuredClone(state.venues),
  contracts:structuredClone(state.contracts),
  teams:structuredClone(state.teams),
  teamMemberships:structuredClone(state.teamMemberships)
 };
 const checked=projectOriginalGenesis(source);
 if(checked.people.length!==643||checked.promotions.length!==13||
  checked.promotions.filter(p=>p.takeoverEligibility==="STANDARD").length<2||
  checked.promotions.filter(p=>p.takeoverEligibility==="LOCKED").length<8)
  throw new Error("Original real-world Alpha Genesis population or takeover rights changed");
 return source;
}
