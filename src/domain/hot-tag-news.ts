/** HOT TAG — Tag in. Sound off.
 * Public, deterministic fan conversation about *published* World News.
 * No account identifiers, new World facts, API requests, timers or DB writes.
 * Fan comments never establish that the rumour is real. */
export const HOT_TAG_NAME="HOT TAG";
export const HOT_TAG_TAGLINE="Tag in. Sound off.";
import {COMMERCIAL_COMPANIES} from "./commercial-offers.js";
export interface HotTagBroadcasterPost{
 networkCode:string;handle:string;displayName:string;avatar:string;text:string;
 likes:number;replies:number;reposts:number;
}
/** An official network only speaks when a certified World News statement
 * already quotes that exact brand. Unverified gossip never impersonates it. */
export function projectHotTagBroadcasterPost(story:HotTagNewsStory):
 HotTagBroadcasterPost|null{
 if(story.desk!=="OFFICIAL")return null;
 const match=/^broadcast:network:(BROADCAST_[A-Z]+):(warning|final-warning|recovery):/
  .exec(story.id);
 if(!match)return null;
 const code=match[1]!,brand=COMMERCIAL_COMPANIES[code];
 if(!brand)return null;
 const quoted=story.summary.match(/responded: "([^"]{1,260})"/)?.[1];
 if(!quoted)return null;
 const hash=stableHotTagHash(story.id);
 return {networkCode:code,displayName:brand.name,avatar:brand.mark,
  handle:"@"+brand.name.replace(/[^a-zA-Z0-9]/g,""),
  text:quoted,likes:80+hash%1700,replies:12+(hash>>>8)%250,
  reposts:6+(hash>>>16)%180};
}
export interface HotTagNewsStory{
 id:string;year:number;week:number;title:string;summary:string;
 desk:"OFFICIAL"|"DIRT";promotionName:string;promotionId?:string;sourceKind?:string;
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
/** The official feed reacts to the *kind* of verified story, not a generic
 * score or template. Dirt-sheet theories remain explicitly unverified.
 * Feed is deterministic from the article; zero write amplification on Neon.
 */
export function projectHotTagNewsThread(story:HotTagNewsStory):HotTagNewsPost[]{
 const seed=stableHotTagHash([story.id,story.year,story.week,story.desk].join(":"));
 const text=(story.title+" "+story.summary).toLowerCase();
 const rumour=story.desk==="DIRT";
 const kind=rumour?"RUMOUR":
  story.id.startsWith("broadcast:")?"BROADCAST":
  story.id.startsWith("press:")?"PRESS":
  /challeng|call(?:s|ed)? out|contract sign/.test(text)?"CHALLENGE":
  /champion|title (?:win|chang|loss|defen)|new titleholder/.test(text)?"TITLE":
  /heel turn|face turn|betray|turned on|walkout|stable split/.test(text)?"TURN":
  /debut|arriv|first appear|new signing/.test(text)?"DEBUT":
  /attack|assault|ambush|brawl/.test(text)?"ATTACK":
  /\bvs\.?\s|\bversus\b|steals the show|\d(?:\.\d{1,2})?-star match/.test(text)?"MATCH":"OTHER";
 const reactions:Record<typeof kind,string[]>={
  PRESS:[
   "A press conference and the internet is treating every word like a conspiracy. 🎤",
   "The quote is right there. Let's not invent backstage facts from it. 🧐",
   "One actual answer and seventeen completely different theories. 😂",
   "A wrestling press scrum has become its own main event. 🍿"
  ],
  BROADCAST:[
   "This is the ratings war I wanted. Same hour, actual viewers on the line. 📺",
   "A strong card matters, but now you've got to keep that audience next week. 👀",
   "Three rough TV nights? That network is absolutely watching the numbers. 💀",
   "You cannot just move a weekly show and expect the audience to find it. 😂",
   "Nielsen-watchers have entered the group chat. Let's see what happens next. 🍿",
   "Good wrestling and a reliable schedule. Imagine both at once. 🧐",
   "The network has spoken. The next broadcast better deliver. 🔥",
   "Everybody says ratings don't matter until their company loses a head-to-head. 📼",
   "TV competition without any actual match spoilers? I'm here for it. 📺",
   "If they won the time slot, give them their flowers. They earned those viewers. 💐",
   "The numbers are official, which won't stop anybody arguing about them. 😂"
  ],
  RUMOUR:[
   "The 'sources' on this one are doing some seriously heavy lifting. Show receipts. 🧐",
   "Three versions of the same rumour and zero names on the record. Incredible business. 😂",
   "Could be a work, could be backstage heat, could be someone's group chat. 👀",
   "The denial is going to get more coverage than the allegation, I can feel it. 🍿",
   "Wild theory, zero proof. I'm reading the replies anyway. 💀",
   "I'm not treating this as fact until someone actually backs it up. ❤️",
   "If this is invented, the retraction needs to be the main event. 📼",
   "Wrestling fans: everything is scripted. Also wrestling fans: THIS IS REAL. 😂",
   "Nobody knows what went down; apparently everybody has an insider cousin. 🤔",
   "I'll believe a named source before the seventh anonymous locker-room account. 👀",
   "Let's not turn a rumour into someone's official record, yeah? 🧐"
  ],
  CHALLENGE:[
   "The absolute nerve it takes to issue that challenge on air. I respect the audacity. 😂",
   "Okay but who is actually signing up to answer this? I'm invested already. 👀",
   "The challenge is easy. Now make them earn the match. 🍿",
   "If the next show doesn't follow up on this I'm filing a complaint with the booker. 💀",
   "Give me a face-to-face and then get out of the way. 🔥",
   "One microphone and suddenly the whole timeline has fantasy-booked the PPV. 😂",
   "No more vague teases. Put a date on the fight! 🧐",
   "Bold words. Interested to see who actually shows up to answer them. 📼",
   "This is how you turn one promo into a proper feud. LET THEM COOK. 🔥",
   "We got a challenge and people are already fighting over the imaginary finish. 👀",
   "That was a declaration, not a result. The next chapter matters. 🍿"
  ],
  TITLE:[
   "The championship picture has changed and so have my next twelve fantasy cards. 😂",
   "A title story with actual stakes? This is the sort of thing I tune in for. 🔥",
   "Now show me what the rest of the division does about it. 👀",
   "The belt doesn't book itself. The next challenger matters just as much. 🧐",
   "I'm already waiting for the follow-up promo. Give the moment some room. 📼",
   "People can argue about the finish. The record books will remember the result. 🍿",
   "Somebody on this timeline is coping HARD right now. 💀",
   "Please don't rush straight to six identical rematches. 😂",
   "The next show has to feel different after a championship moment like this. 🔥",
   "Can't wait to see whether they build on this or go back to business as usual. 👀",
   "The title scene just gave the group chat a week's worth of arguments. 🤔"
  ],
  TURN:[
   "That changes every alliance chart I've drawn this month. 💀",
   "Nobody trusts anybody in wrestling and THIS is why. 👀",
   "The character work after this is going to be the real test. 🧐",
   "I need the follow-up promo immediately. Not tomorrow. NOW. 🔥",
   "Some fans say they saw it coming. You definitely did not. 😂",
   "A turn means nothing without consequences. Let's see who gets hurt next. 🍿",
   "Time to revisit every awkward handshake from the last few weeks. 📼",
   "Wrestling friendships should come with a cancellation clause. 😂",
   "Give this story space to breathe rather than undoing it next week. ❤️",
   "I have three conspiracy boards and none of them are helping. 👀",
   "One decision, a dozen new possibilities. That's the good stuff. 🔥"
  ],
  DEBUT:[
   "New face, new possibilities. Don't waste the first impression. 🔥",
   "The fantasy booking threads are writing themselves already. 😂",
   "Show me who they're going after before I make up a twenty-match dream card. 👀",
   "Fresh blood in the roster? This could shake up the whole pecking order. 🍿",
   "The entrance is one thing. The first rivalry will tell us everything. 🧐",
   "Someone check whether the merch printers are awake. 😂",
   "A good arrival makes you want to see the very next episode. 📼",
   "That is the kind of surprise I'm perfectly happy to be spoiled by. 💥",
   "Potential is exciting. Let's see what they do with it now. 👀",
   "Here come the inevitable 'should've debuted elsewhere' arguments. 💀",
   "One debut and this entire fandom has become a contract expert. 🤔"
  ],
  ATTACK:[
   "That was personal. Or that's exactly what they wanted us to think. 👀",
   "I need to see the response on the next show, not another unrelated recap. 🔥",
   "That confrontation has escalation written all over it. 🍿",
   "Wrestling security must be getting paid by the coffee break. 😂",
   "Now give the person on the receiving end an actual reaction. 🧐",
   "Was there a plan or did this just completely go off the rails? 💀",
   "The replay is going to be watched frame by frame for weeks. 📼",
   "I am absolutely here for the fallout, not five identical repeats. 👀",
   "Somebody get a microphone. We need an explanation. 🔥",
   "That is one way to make everyone remember your name. 😂",
   "Waiting for the inevitable 'I was provoked' speech. 🍿"
  ],
  MATCH:[
   "That was the kind of wrestling that makes you watch the replay. 🔥",
   "Give those two another spotlight when they have a reason to meet. 👀",
   "This is going straight into my best bouts of the year list. 📼",
   "The crowd had a reason to care. Now can they follow it up? 🧐",
   "Good match. I want to know what they do NEXT, not just see it repeated. 🍿",
   "I could watch that sort of work all evening. Bell-to-bell quality. 🔔",
   "All the talking stops when the wrestling is that good. 🤼",
   "Tell me what this result means for their next programme. 💥"
  ],
  OTHER:[
   "This week's wrestling discourse is already out of control. 😂",
   "I need the replay before I pick a side on this one. 📼",
   "Something worth actually talking about, at last. 👀",
   "This story is going straight into the group chat. 🍿",
   "The next episode had better follow through on this. 🧐",
   "People somehow have a definitive take before they've watched it. 💀",
   "I have questions, but at least they're interesting questions. 🤔",
   "A good wrestling moment lives on through the reactions. 🔥",
   "Now I'm curious what the other wrestlers have to say about it. 👀",
   "Never underestimate wrestling fans' ability to argue over one headline. 😂",
   "I'll judge it on where the story goes next. ❤️"
  ]
 };
 // Previously published fan threads stay unchanged. New episodes get
 // additional fictional voices without new requests, timers or Neon writes.
 const expanded:Record<typeof kind,string[]>={
  PRESS:["A promoter said something and my timeline is on fire. 🎤",
   "Just wait until the journalists ask about the next show. 👀",
   "I trust the transcript more than the anonymous 'sources'. 🧐"],
  BROADCAST:["Networks are about to become the main characters. 📺",
   "A fixed broadcast night means the fans know where to find you. 🔥",
   "The partner's reaction is public, and the ratings will be too. 👀",
   "A big ratings win means nothing if you miss next week's slot. 🍿"],
  RUMOUR:["Somebody's cousin's barber has become an anonymous source. 😂",
   "Six theories and not one screenshot. That's wrestling journalism for you. 👀",
   "The conspiracy board has sixteen strings and zero evidence. 🧵",
   "The story's unverified, but the comments are an absolute car crash. 🍿"],
  CHALLENGE:["Sign the match or stop posting the graphics. 🖊️",
   "One challenge and wrestling Twitter has booked a trilogy. 😂",
   "The microphone won round one. Now ring the bell. 🎤",
   "This better lead somewhere other than stare-down number seventeen. 💀"],
  TITLE:["The belt has become the main character and I'm here for it. 🏆",
   "Every locker room just developed a sudden interest in rankings. 👀",
   "Actual stakes? In THIS economy? Beautiful. 😂",
   "That championship discussion is about to get unbelievably petty. 🍿"],
  TURN:["The friendship montage has just become a betrayal montage. 💀",
   "I will never trust another suspiciously long handshake. 🤝",
   "Someone get the replay team. We're checking every old promo. 📼",
   "One turn and the comments have changed sides four times. 😂"],
  DEBUT:["Thirty fantasy opponents announced before their first entrance. 😂",
   "The entrance is cool. Now give them a proper first story. 🔥",
   "This has officially broken the imaginary power rankings. 👀",
   "A new era has apparently begun. Again. 🍿"],
  ATTACK:["Arena security might be the least effective faction in wrestling. 😂",
   "That escalated faster than a contract negotiation. 😳",
   "The next promo needs an explanation, not just threatening music. 🎤",
   "Forget the rematch. I need to see the fallout first. 🍿"],
  MATCH:["They'd better put this one on the replay queue. 📼",
   "That got the in-ring argument settled for tonight. 🔔",
   "The wrestler interviews after a bout like this should be interesting. 👀",
   "A strong match deserves a strong follow-up, not a rerun. 🍿"],
  OTHER:["The discourse entered overtime before the show even ended. 😂",
   "I'm going to need a recap, a replay and probably a flow chart. 📼",
   "My timeline has opinions. None of them agree. 👀",
   "Professional wrestling remains the strangest thing I voluntarily watch. 💀"]
 };
 // Certified match headlines contain genuine public names and, often, a
 // star rating. Make fan opinions about THAT bout instead of reusing three
 // generic comments beneath every four/five-star article.
 const named=kind==="MATCH"?story.title.match(/^(.+?)\s+(?:vs\.?|versus)\s+(.+?)\s+(?:steals the show|at\s)/i):null;
 const pairing=named?named[1]!.trim()+" vs "+named[2]!.trim():null;
 const stars=kind==="MATCH"?
  story.summary.match(/\b(\d(?:\.\d{1,2})?)-star match\b/i)?.[1]??null:null;
 const specific=kind==="MATCH"&&pairing?[
  pairing+" is the match I'd send to a friend who asks why I watch wrestling. 🔥",
  "Everyone's debating "+pairing+". I'm looking at what happens to those two next. 👀",
  stars?stars+" stars for "+pairing+"? I'd still watch it again before arguing ratings. 📼":
   "I need a second watch of "+pairing+" before I pick a favourite spot. 📼",
  "That "+pairing+" result has to matter for the next card. Don't waste it. 🧐",
  "Please let "+pairing+" breathe before the inevitable rematch discourse starts. 😂",
  "The real question after "+pairing+": who gets the next opportunity? 🍿",
  story.promotionName+" has something to follow up after "+pairing+". Book it with purpose. 💥"
 ]:[];
 const pool=story.year>1||story.week>=19?
  [...specific,...reactions[kind],...expanded[kind]]:
  [...specific,...reactions[kind]];
 const used=new Set<number>();
 return [0,1,2].map(i=>{
  // Unique commenters and reactions per article, with different choices on
  // adjacent stories. React to the event, not the article headline.
  const identity=(seed+i*5+Math.floor(seed/67))%commentators.length;
  const voice=commentators[identity]!;
  let index=(seed+i*3+Math.floor(seed/19))%pool.length;
  while(used.has(index))index=(index+1)%pool.length;
  used.add(index);
  const message=pool[index]!;
  const postText=message;
  const h=stableHotTagHash(story.id+":"+voice.handle+":"+i);
  return {...voice,text:postText,likes:26+h%950,
   replies:4+(h>>>7)%84,reposts:2+(h>>>12)%146};
 });
}
