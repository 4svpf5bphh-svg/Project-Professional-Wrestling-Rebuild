/** One-shot, offline, source-pinned export of original PPW real-world Genesis.
 * Do not import the old live World or connect to any database.
 * Run only in a disposable checkout alongside the original Git repository.
 */
import {mkdirSync,writeFileSync} from "node:fs";
import {createWorld,validateWorldInvariants} from "../original/dist/packages/sim-core/src/index.js";
import {REAL_WORLD_ALPHA_RULESET} from "../original/dist/packages/config/src/real-world-ruleset.js";
import {calibratedRealActiveMixedRosterSource} from "../original/dist/packages/content/src/real-active-mixed-roster.js";
import {realPromotionEcosystemSource} from "../original/dist/packages/content/src/real-promotions.js";
import {realWorldInitialRosterAssignmentSource} from "../original/dist/packages/content/src/real-aew-roh-cmll-rosters.js";
import {realPromotionShowSeriesSource} from "../original/dist/packages/content/src/real-show-series.js";
import {seedRealActiveTagTeams} from "../original/dist/packages/content/src/real-active-tag-teams.js";
import {seedRealWrestlerRelationships} from "../original/dist/packages/content/src/real-wrestler-relationships.js";

const state=createWorld(20261017,REAL_WORLD_ALPHA_RULESET,"PPW Rebuild Genesis",
 calibratedRealActiveMixedRosterSource,realPromotionEcosystemSource,
 realWorldInitialRosterAssignmentSource,realPromotionShowSeriesSource);
seedRealActiveTagTeams(state);
seedRealWrestlerRelationships(state);
validateWorldInvariants(state);
const expectedPromotions=["WWE","AEW","NJPW","NXT","TNA Wrestling","CMLL","ROH","STARDOM"];
if(state.people.length!==643||state.promotions.length!==13||
 expectedPromotions.some(name=>!state.promotions.some(p=>p.name===name)))
 throw new Error("Original real-world Genesis roster/promotions mismatch");
if(!state.people.some(p=>p.name==="Cody Rhodes")||
 !state.people.some(p=>p.name==="Rhea Ripley")||
 !state.people.some(p=>p.name==="Will Ospreay"))
 throw new Error("Original real-world wrestler identities missing");
if(state.world.currentDate.year!==1||state.world.currentDate.week!==1||state.world.currentDate.day!==1)
 throw new Error("Genesis is not a fresh original World");
const source={
 world:state.world,ruleset:state.ruleset,
 promotions:state.promotions,people:state.people,
 markets:state.markets,promotionMarketStates:state.promotionMarketStates,
 venues:state.venues,contracts:state.contracts,
 // Preserve original additional Genesis content for a later fidelity pass.
 promotionShowSeries:state.promotionShowSeries??[],
 tagTeams:state.tagTeams??[],wrestlerRelationships:state.wrestlerRelationships??[],
};
mkdirSync("out",{recursive:true});
writeFileSync("out/ppw-real-genesis.json",JSON.stringify(source));
writeFileSync("out/source-provenance.json",JSON.stringify({
 sourceRepository:"4svpf5bphh-svg/Project-Professional-Wrestling",
 sourceCommit:"039a76481412df289704a5710d1622dc20f74fec",
 seed:20261017,worldId:state.world.id,
 promotions:state.promotions.length,people:state.people.length,
 contracts:state.contracts.length,markets:state.markets.length,
 venues:state.venues.length
},null,2));
console.log(JSON.stringify({worldId:state.world.id,promotions:state.promotions.length,
 wrestlers:state.people.length,contracts:state.contracts.length,venues:state.venues.length,
 file:"out/ppw-real-genesis.json"}));
