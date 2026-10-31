/** HOT TAG — Tag in. Sound off.
 * Public, deterministic fan conversation about *published* World News.
 * No account identifiers, new World facts, API requests, timers or DB writes.
 * Fan comments never establish that the rumour is real. */
export const HOT_TAG_NAME="HOT TAG";
export const HOT_TAG_TAGLINE="Tag in. Sound off.";
export interface HotTagNewsStory{
 id:string;year:number;week:number;title:string;summary:string;
 desk:"OFFICIAL"|"DIRT";promotionName:string;
}
export interface HotTagNewsPost{
 handle:string;displayName:string;avatar:string;text:string;
 likes:number;replies:number;reposts:number;
}
const commentators=[
 {handle:"@WorkratePolice",displayName:"The Workrate Police",avatar:"🧐"},
 {handle:"@CurtainWatcher",displayName:"Curtain Watcher",avatar:"👀"},
 {handle:"@HeelApologist",displayName:"Heel Apologist",avatar:"😈"},
 {handle:"@TapeTrader92",displayName:"Tape Trader '92",avatar:"📼"},
 {handle:"@FrontRowFran",displayName:"Fran | Ringside",avatar:"🔥"},
 {handle:"@FeudEnjoyer",displayName:"Feud Enjoyer",avatar:"🍿"},
 {handle:"@TheCheapSeats",displayName:"The Cheap Seats",avatar:"😂"},
 {handle:"@BellToBellBen",displayName:"Bell To Bell Ben",avatar:"💥"}
] as const;
export function stableHotTagHash(value:string){
 let n=2166136261;
 for(const c of value){n^=c.charCodeAt(0);n=Math.imul(n,16777619);}
 return n>>>0;
}
export function dirtSheetByline(id:string){
 const outlets=[
  {name:"THE GRAPEVINE",byline:"Backstage Desk"},
  {name:"RINGSIDE CONFIDENTIAL",byline:"The Inside Line"},
  {name:"THE LOCKER ROOM LEDGER",byline:"Sources & Whispers"},
  {name:"THE BACK ROW",byline:"The Rumour Report"}
 ] as const;
 return outlets[stableHotTagHash(id)%outlets.length]!;
}
export function projectHotTagNewsThread(story:HotTagNewsStory):HotTagNewsPost[]{
 const seed=stableHotTagHash([story.id,story.year,story.week,story.desk].join(":"));
 const rumour=story.desk==="DIRT";
 const reactions=rumour?[
  "Every site has a different version of this story. So who actually knows anything? 👀",
  "If this turns out to be a work I demand everyone print their corrections in 72-point type. 😂",
  "Wait. An anonymous source, a denial and a mystery? Wrestling journalism bingo. 🍿",
  "I'm not saying it's true. I'm saying someone's definitely stirring the pot. 🤔",
  "This could be completely made up and wrestling fans will still argue about it for months. 💀",
  "A wrestler gets mentioned and suddenly everyone has a cousin in the locker room. 😂",
  "Sources close to the situation = someone's group chat, apparently. 🧐",
  "Could be heat, could be storyline, could be nothing. I'm staying for the replies. 👀",
  "Please remember an allegation is not a verified backstage incident. ❤️",
  "The denial is going to get analysed like the Zapruder film, isn't it? 💀"
 ]:[
  "That's the sort of moment I'll be talking about until next week's show. 🔥",
  "At least this one actually happened on television. The replies can debate the rest. 😂",
  "Official result is official. You know the timeline will still find something to argue about. 🍿",
  "Rewatching this before I trust any of the hot takes. 📼",
  "Huge week for wrestling. The group chat has absolutely lost its mind. 👀"
 ];
 const picks:number[]=[];
 for(let i=0;i<3;i++)picks.push((seed+i*7+Math.floor(seed/73))%commentators.length);
 return picks.map((index,i)=>{
  const voice=commentators[index]!;
  const text=reactions[(seed+i*3)%reactions.length]!;
  const h=stableHotTagHash(story.id+":"+voice.handle+":"+i);
  return {...voice,text,likes:26+h%950,replies:4+(h>>>7)%84,reposts:2+(h>>>12)%146};
 });
}
