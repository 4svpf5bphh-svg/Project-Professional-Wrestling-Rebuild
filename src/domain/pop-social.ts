/** HOT TAG — fictional wrestling-social commentary layered over certified show reactions.
 * Posts are local projections: never genuine accounts, stored evidence, new
 * World events, separate network requests or new simulation consequences.
 */
import type {CompletedShowView,ShowResultEntry} from "../db/show-results-view.js";
import type {ResultReaction,ReactionVoice} from "./show-reaction-wire.js";
import {hotTagEditorialAnchors,readHotTagEditorial} from "./hot-tag-editorial.js";
import {HOT_TAG_FAN_ACCOUNTS} from "./hot-tag-news.js";

export interface PopIdentity{handle:string;displayName:string;avatar:string}
export interface PopPost extends ResultReaction{
 identity:PopIdentity;
 replyIdentity?:PopIdentity;
 likes:number;comments:number;reposts:number;
 emoji:"🔥"|"😂"|"👀"|"💀"|"❤️"|"🤔";
}
const profiles:Record<ReactionVoice,PopIdentity>={
 "THE FRONT ROW":{handle:"@FrontRowFran",displayName:"Fran | Ringside",avatar:"🔥"},
 "THE SKEPTICAL SMARK":{handle:"@WorkratePolice",displayName:"The Workrate Police",avatar:"🧐"},
 "THE TAPE TRADER":{handle:"@TapeTrader92",displayName:"Tape Trader '92",avatar:"📼"},
 "THE DIEHARD":{handle:"@BellToBellBen",displayName:"Bell To Bell Ben",avatar:"💥"},
 "THE HEEL DEFENDER":{handle:"@HeelApologist",displayName:"Heel Apologist",avatar:"😈"},
 "THE CONCERNED FAN":{handle:"@RingSideCare",displayName:"The Concerned Fan",avatar:"❤️"},
 "THE RIVALRY ADDICT":{handle:"@FeudEnjoyer",displayName:"Feud Enjoyer",avatar:"🍿"},
 "THE BACK ROW":{handle:"@TheCheapSeats",displayName:"The Cheap Seats",avatar:"😂"}
};

/** Reuse the existing HOT TAG world-news accounts rather than hardcoding
 * eight recurring fans into every results screen. Stable per show/voice,
 * so cached model prose never swaps account when the page is reopened.
 */
const personaHandles:Record<ReactionVoice,readonly string[]>={
 "THE FRONT ROW":["@FrontRowFran","@ScorpioInTheFrontRow","@CrowdNoiseCarl","@BigFightBrian","@HardcamHelen"],
 "THE SKEPTICAL SMARK":["@WorkratePolice","@SmarkyMcSmark","@BotchSpotter","@MeltzerMaths","@TheFinishWasWrong","@FourPointNineStars"],
 "THE TAPE TRADER":["@TapeTrader92","@VHSVintageVince","@TerritoryTruther","@ArmchairAgent","@RespectTheMidcard"],
 "THE DIEHARD":["@BellToBellBen","@WrestlingNan","@TheRealestMark","@WrestlingIsMyTherapy","@OneMoreMatchJanet"],
 "THE HEEL DEFENDER":["@HeelApologist","@HeelHeatHarry","@CheapHeatMerchant","@RefWasBlind","@AbsolutelyNotAPlant"],
 "THE CONCERNED FAN":["@RingSideCare","@TowelThrower","@TablesLaddersTea","@BiscuitAndBrawls"],
 "THE RIVALRY ADDICT":["@FeudEnjoyer","@PromoGoblin","@PopcornAndPain","@BeltCollector","@BookingCommitteeOfOne"],
 "THE BACK ROW":["@TheCheapSeats","@TurnbuckleTwat","@MumsBasementBooker","@BackRowBec","@NobodyAskedDave","@PiledriverPigeon"]
};
function fanIdentity(show:CompletedShowView,voice:ReactionVoice):PopIdentity{
 const handles=personaHandles[voice];
 const handle=handles[hash([show.showId,show.year,show.week,voice].join(":"))%handles.length]!;
 return HOT_TAG_FAN_ACCOUNTS.find(p=>p.handle===handle)??profiles[voice];
}
function hash(text:string){
 let value=2166136261;
 for(const ch of text){value^=ch.charCodeAt(0);value=Math.imul(value,16777619);}
 return value>>>0;
}
function winner(entry:ShowResultEntry|undefined):string|null{
 const names=entry?.matchContext?.winnerNames??[];
 return entry?.type==="MATCH"&&names.length===1?names[0]??null:null;
}
function styleText(post:ResultReaction,entry:ShowResultEntry|undefined,key:string):string{
 const name=winner(entry);
 const memeEligible=post.source==="MATCH"&&name&&entry!.crowdResponse>=75;
 if(memeEligible&&hash(key+":meme")%4===0)
  return "LOL "+name.toUpperCase()+" WINS 😂 The timeline is about to become completely unbearable.";
 if(post.source==="ANGLE"&&entry?.outcome==="HAPPENS"&&
  ["CONFRONTATION","ATTACK","POST_MATCH_ASSAULT","TURN"].includes(entry.segmentKind??"")&&
  hash(key+":conspiracy")%3!==0)
  return post.text+" But seriously... was that even supposed to happen? 👀";
 // Different users react differently; dramatic material can invite theories
 // but NEVER becomes an actual unrecorded locker-room incident.
 if(post.source==="RIVALRY"&&post.mood==="DEBATE"&&hash(key+":opinion")%3===0)
  return post.text+" Please don't tell me we're running this back again 😭";
 return post.text;
}
export function projectPopFeed(show:CompletedShowView,reactions:readonly ResultReaction[]):PopPost[]{
 const slots=new Map(show.entries.map(entry=>[entry.slotId,entry]));
 const editorial=show.shortform?.fans?.length?
  readHotTagEditorial(hotTagEditorialAnchors(show),show.shortform.fans):[];
 const shared:PopPost[]=[],covered=new Set<string>();
 for(const thread of show.weeklyPublicThreads??[]){
  const entry=slots.get(thread.slotId);
  if(!entry||covered.has(thread.slotId))continue;
  covered.add(thread.slotId);
  for(const post of thread.posts.filter(p=>!p.replyTo)){
   const reply=thread.posts.find(p=>p.replyTo===post.handle);
   shared.push({slotId:thread.slotId,voice:"THE FRONT ROW",mood:"BUZZ",source:entry.type==="MATCH"?"MATCH":"ANGLE",
    text:post.text,identity:{handle:post.handle,displayName:post.displayName,avatar:post.avatar},
    likes:post.likes,comments:post.replies,reposts:post.reposts,emoji:"🔥",
    ...(reply?{reply:{voice:"THE SKEPTICAL SMARK",text:reply.text},
     replyIdentity:{handle:reply.handle,displayName:reply.displayName,avatar:reply.avatar}}:{})});
  }
 }
 const local=reactions.filter(r=>!covered.has(r.slotId)).slice(0,8).flatMap(reaction=>{
  const entry=slots.get(reaction.slotId);
  if(!entry)return [];
  const key=show.showId+":"+reaction.slotId+":"+reaction.voice;
  const seed=hash(key);
  const mood=reaction.mood;
  const base=mood==="BUZZ"?310:mood==="DEBATE"?135:mood==="CONCERN"?72:22;
  const emoji=mood==="CONCERN"?"❤️":mood==="COLD"?"💀":
   mood==="BUZZ"?(seed%2?"🔥":"😂"):
   seed%2?"👀":"🤔";
  const rewrite=editorial.find(f=>f.slotId===reaction.slotId&&f.voice===reaction.voice);
  const reply=rewrite?.reply&&rewrite.reply.voice===reaction.reply?.voice?rewrite.reply:reaction.reply;
  return [{
   ...reaction,text:rewrite?.text??styleText(reaction,entry,key),
   ...(reply?{reply}:{}),identity:fanIdentity(show,reaction.voice),
   ...(reaction.reply?{replyIdentity:fanIdentity(show,reaction.reply.voice)}:{}),
   likes:base+(seed%1049),
   comments:Math.max(4,Math.round(base/8)+(Math.floor(seed/101)%145)),
   reposts:Math.max(1,Math.round(base/12)+(Math.floor(seed/13)%187)),
   emoji
  }] as PopPost[];
 });
 return [...shared,...local].slice(0,8);
}
