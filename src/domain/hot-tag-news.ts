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
/** The official feed reacts to the *kind* of verified story, not a generic
 * score or template. Dirt-sheet theories remain explicitly unverified.
 * Feed is deterministic from the article; zero write amplification on Neon.
 */
export function projectHotTagNewsThread(story:HotTagNewsStory):HotTagNewsPost[]{
 const seed=stableHotTagHash([story.id,story.year,story.week,story.desk].join(":"));
 const text=(story.title+" "+story.summary).toLowerCase();
 const rumour=story.desk==="DIRT";
 const kind=rumour?"RUMOUR":
  /challeng|call(?:s|ed)? out|contract sign/.test(text)?"CHALLENGE":
  /champion|title (?:win|chang|loss|defen)|new titleholder/.test(text)?"TITLE":
  /heel turn|face turn|betray|turned on|walkout|stable split/.test(text)?"TURN":
  /debut|arriv|first appear|new signing/.test(text)?"DEBUT":
  /attack|assault|ambush|brawl/.test(text)?"ATTACK":"OTHER";
 const reactions:Record<typeof kind,string[]>={
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
 const pool=reactions[kind];
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
