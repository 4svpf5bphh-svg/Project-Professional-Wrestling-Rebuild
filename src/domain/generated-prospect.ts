/** Reuses original main career.ts prospect-generation numbers and naming.
 * The returned person and authored character are generated from the same
 * World-week seed. No player can force a particular recruit by being online. */
import {DeterministicRng,deterministicSeedFromText} from "../simulation/legacy/rng.js";
import {authoredPersonaForPerson} from "./generated-prospect-identity.js";
const FIRST=["Mason","Kai","Noah","Jett","Mila","Sasha","Remy","Nico","Aria","Zane","Ivy","Rex"];
const LAST=["Hale","Vega","Monroe","Rook","Ash","Voss","Lane","Morrow","Blaze","Rhodes","Nova","West"];
export function originalGeneratedProspect(input:{seed:string|number;weekIndex:number;
 sequence:number;personId:string;marketIds:readonly string[]}){
 if(!input.personId||input.personId.length>200||!input.marketIds.length||
  input.marketIds.length>128||input.marketIds.some(x=>!x)||
  !Number.isSafeInteger(input.sequence)||input.sequence<1||
  !Number.isSafeInteger(input.weekIndex)||input.weekIndex<0)
  throw new Error("Invalid verified prospect generation scope");
 const rng=new DeterministicRng(deterministicSeedFromText(
  `${input.seed}:${input.weekIndex}:${input.sequence}:prospect-generation`));
 const stat=(min:number,max:number)=>rng.int(min,max);
 const p={id:input.personId,name:`${rng.pick(FIRST)} ${rng.pick(LAST)} ${input.sequence}`,
  homeMarketId:rng.pick(input.marketIds),biologicalAge:Math.round(rng.float(18,23)*10)/10,
  careerExperience:rng.int(0,8),developmentAptitude:rng.int(48,96),
  fatigue:0,wear:rng.int(0,4),morale:rng.int(58,82),
  momentum:rng.int(12,35),recognition:rng.int(2,16),popularity:rng.int(2,18),
  skills:{inRingQuality:stat(24,65),matchCraft:stat(22,58),
   safety:stat(32,72),stamina:stat(45,82),presentation:stat(20,68)},
  priorities:{money:stat(20,90),role:stat(20,90),prestige:stat(20,90),
   schedule:stat(20,90),loyalty:stat(20,90),exposure:stat(35,96)}};
 // The original sim did not specify prospect division/alignment.
 // Seed each fictional identity stably, rather than cloning an existing wrestler.
 const division=deterministicSeedFromText(input.personId+":division")%3===0?"WOMEN":"MEN";
 const alignment=deterministicSeedFromText(input.personId+":alignment")%4===0?"HEEL":"FACE";
 const persona=authoredPersonaForPerson(p);
 return {...p,division,alignment,persona};
}
